"""APScheduler-based daily eSSL auto-sync per school.
On startup we read all schools with auto_sync_enabled=True and register cron jobs
at every time in school.auto_sync_times (fallback to [school.auto_sync_time]).
Each fire: eSSL sync → auto-from-attendance → latecomer notifications →
optional confirm-all-and-notify."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from db import db

log = logging.getLogger(__name__)
_scheduler: Optional[AsyncIOScheduler] = None


def _job_id(school_id: str, hh: int, mm: int) -> str:
    return f"autosync_{school_id}_{hh:02d}{mm:02d}"


def _school_job_prefix(school_id: str) -> str:
    return f"autosync_{school_id}_"


def _parse_times(school: dict) -> list:
    """Return [(hh, mm), ...] for the school. Falls back to [auto_sync_time] when
    auto_sync_times is empty. Silently skips malformed entries."""
    raw = school.get('auto_sync_times') or []
    if not raw:
        raw = [school.get('auto_sync_time') or '07:30']
    out = []
    for t in raw:
        try:
            hh, mm = [int(x) for x in str(t).split(':')[:2]]
            if 0 <= hh < 24 and 0 <= mm < 60:
                out.append((hh, mm))
        except Exception:
            continue
    return sorted(set(out))


async def _notify_latecomers(school_id: str, fire_time: str):
    """Send WhatsApp/SMS to any teacher who has scheduled cells today but no punches yet."""
    from notifier import send_with_fallback, twilio_configured
    today = datetime.now().strftime('%Y-%m-%d')
    weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][datetime.now().weekday()]
    teachers = await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(1000)
    punches = await db.attendance.find({"school_id": school_id, "date": today}, {"_id": 0}).to_list(5000)
    present_ids = {p['teacher_id'] for p in punches if p.get('teacher_id')}
    late = []
    for t in teachers:
        if t['id'] in present_ids:
            continue
        # Only ping teachers actually scheduled today
        n_cells = await db.timetable.count_documents({
            "school_id": school_id, "teacher_id": t['id'], "day": weekday,
        })
        if n_cells == 0:
            continue
        late.append(t)
    sent = 0
    weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][datetime.now().weekday()]
    for t in late:
        if not t.get('phone'):
            continue
        n_cells = await db.timetable.count_documents({
            "school_id": school_id, "teacher_id": t['id'], "day": weekday,
        })
        body = (
            f"Hi {t.get('name')}, you have {n_cells} period(s) scheduled today ({weekday}) "
            f"but no punch yet at {fire_time}. Please clock in. — Sri Ma One Timetable"
        )
        if twilio_configured():
            send_with_fallback(t['phone'], body)
            sent += 1
    return {"date": today, "fire_time": fire_time, "late": len(late), "notified": sent}


async def _run_school_autosync(school_id: str, fire_time: str = ""):
    """Pull eSSL → queue substitutes → notify latecomers → optionally confirm + notify."""
    school = await db.schools.find_one({"id": school_id}, {"_id": 0})
    if not school or not school.get('auto_sync_enabled'):
        log.info("autosync skipped for %s — disabled or missing", school_id)
        return
    log.info("autosync fire=%s for school %s", fire_time, school_id)
    today = datetime.now().strftime('%Y-%m-%d')
    device_id = school.get('auto_sync_essl_device_id')
    fake_user = {"role": "Super Admin", "user_id": "scheduler", "email": "scheduler@local"}
    # 1. eSSL pull (best-effort)
    if device_id:
        try:
            from routers.attendance import sync_essl
            await sync_essl(school_id, {"device_id": device_id, "days_back": 1}, fake_user)
        except Exception as e:
            log.warning("autosync eSSL pull failed for %s: %s", school_id, e)
    # 2. Auto-suggest substitutes
    try:
        from routers.ai import auto_substitutes_from_attendance
        await auto_substitutes_from_attendance(school_id, {"date": today}, fake_user)
    except Exception as e:
        log.warning("autosync substitutes failed for %s: %s", school_id, e)
    # 3. Latecomer pings
    if school.get('notify_latecomers'):
        try:
            await _notify_latecomers(school_id, fire_time)
        except Exception as e:
            log.warning("autosync latecomers failed for %s: %s", school_id, e)
    # 4. Optional auto-confirm + notify presentees / substitutes
    if school.get('auto_confirm_substitutions'):
        try:
            from routers.ai import confirm_all_and_notify
            await confirm_all_and_notify(school_id, {"date": today}, fake_user)
        except Exception as e:
            log.warning("autosync confirm-notify failed for %s: %s", school_id, e)
    await db.schools.update_one(
        {"id": school_id},
        {"$set": {"last_autosync_at": datetime.now(timezone.utc).isoformat(),
                   "last_autosync_fire": fire_time}}
    )


def _remove_school_jobs(school_id: str):
    if not _scheduler:
        return
    prefix = _school_job_prefix(school_id)
    for j in list(_scheduler.get_jobs()):
        if j.id.startswith(prefix):
            try:
                _scheduler.remove_job(j.id)
            except Exception:
                pass


async def register_school_job(school: dict):
    if not _scheduler:
        return
    sid = school['id']
    _remove_school_jobs(sid)
    if not school.get('auto_sync_enabled'):
        log.info("autosync all jobs removed for %s (disabled)", sid)
        return
    for hh, mm in _parse_times(school):
        ft = f"{hh:02d}:{mm:02d}"
        _scheduler.add_job(
            _run_school_autosync, CronTrigger(hour=hh, minute=mm),
            args=[sid, ft], id=_job_id(sid, hh, mm),
            replace_existing=True, misfire_grace_time=900,
        )
        log.info("autosync job registered for school %s @ %s", sid, ft)


async def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    _scheduler.start()
    log.info("APScheduler started")
    schools = await db.schools.find({"auto_sync_enabled": True}, {"_id": 0}).to_list(500)
    for s in schools:
        await register_school_job(s)


async def shutdown_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


async def trigger_school_now(school_id: str):
    """Synchronous helper used by the 'Run now' button."""
    await _run_school_autosync(school_id, fire_time="manual")
