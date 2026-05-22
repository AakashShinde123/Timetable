"""AI endpoints: substitution suggester, NL constraint parser, timetable optimizer."""
import asyncio
import logging
import uuid
from typing import Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Body

from db import db, EMERGENT_LLM_KEY
from deps import get_current_user
from models import Substitution, serialize_doc
from constraint_engine import audit_timetable

router = APIRouter(prefix="/api", tags=["ai"])
logger = logging.getLogger(__name__)


@router.post("/schools/{school_id}/substitutions/suggest")
async def suggest_substitutes(school_id: str, payload: Dict[str, Any] = Body(...),
                              user: dict = Depends(get_current_user)):
    absent_teacher_id = payload['absent_teacher_id']
    date_str = payload['date']
    weekday_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    try:
        d = datetime.fromisoformat(date_str)
        day = weekday_map[d.weekday()]
    except Exception:
        day = payload.get('day', 'Mon')

    affected_cells = await db.timetable.find({
        "school_id": school_id, "teacher_id": absent_teacher_id, "day": day
    }, {"_id": 0}).to_list(100)
    teachers = await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    teacher_map = {t['id']: t for t in teachers}
    subjects = await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    subject_map = {s['id']: s for s in subjects}

    suggestions = []
    for cell in affected_cells:
        period_id = cell['period_id']
        busy_in_slot = await db.timetable.find({
            "school_id": school_id, "day": day, "period_id": period_id,
            "teacher_id": {"$nin": [None, absent_teacher_id]},
        }, {"_id": 0}).to_list(500)
        busy_ids = {c['teacher_id'] for c in busy_in_slot if c.get('teacher_id')}
        candidates = []
        subject_id = cell.get('subject_id')
        for t in teachers:
            if t['id'] == absent_teacher_id or t['id'] in busy_ids:
                continue
            score = 50; reasons = ["Free this period"]
            if subject_id and subject_id in t.get('subjects', []):
                score += 30; reasons.append("Teaches this subject")
            todays = await db.timetable.count_documents({
                "school_id": school_id, "teacher_id": t['id'], "day": day
            })
            if todays < t.get('max_periods_per_day', 6):
                score += 10; reasons.append(f"Load OK ({todays}/{t.get('max_periods_per_day', 6)})")
            else:
                score -= 30; reasons.append("Load full")
            candidates.append({
                "teacher_id": t['id'], "name": t['name'], "abbreviation": t['abbreviation'],
                "score": score, "reasons": reasons,
            })
        candidates.sort(key=lambda x: -x['score'])
        suggestions.append({
            "cell_id": cell['id'], "class_id": cell['class_id'], "period_id": period_id,
            "day": day, "subject_id": subject_id,
            "subject_name": subject_map.get(subject_id, {}).get('name') if subject_id else None,
            "top_candidates": candidates[:5],
        })

    ai_commentary = None
    if EMERGENT_LLM_KEY and suggestions:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            absent = teacher_map.get(absent_teacher_id, {})
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"sub_{school_id}_{absent_teacher_id}_{date_str}",
                system_message=(
                    "You are an experienced Indian school timetable coordinator. Recommend the best substitute "
                    "teachers in 2-3 short bullet points. Be concise, professional, and use Indian school terminology."
                ),
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            summary = f"Absent teacher: {absent.get('name', 'Unknown')} ({absent.get('abbreviation', '')}) on {date_str} ({day}).\n"
            for s in suggestions[:6]:
                summary += f"\nPeriod {s['period_id']} ({s['subject_name'] or 'Activity'}): top picks - "
                summary += ", ".join([f"{c['name']} ({c['abbreviation']}, score {c['score']})" for c in s['top_candidates'][:3]])
            summary += "\n\nGive a 3-bullet recommendation for the substitution coordinator."
            ai_commentary = await chat.send_message(UserMessage(text=summary))
        except Exception as e:
            logger.warning(f"AI commentary failed: {e}")

    return {
        "absent_teacher_id": absent_teacher_id, "date": date_str, "day": day,
        "affected_periods": len(suggestions), "suggestions": suggestions,
        "ai_commentary": ai_commentary,
    }


@router.post("/schools/{school_id}/substitutions/auto-from-attendance")
async def auto_substitutes_from_attendance(school_id: str, payload: Dict[str, Any] = Body(default={}),
                                            user: dict = Depends(get_current_user)):
    """Scan today's attendance, find absent teachers, and for each scheduled cell of theirs
    insert a Substitution suggestion with the top-ranked free substitute. Body: {date?}.
    Returns {date, absent_teachers, substitutions_created, items}."""
    date_str = payload.get('date')
    if not date_str:
        date_str = datetime.now().strftime('%Y-%m-%d')
    weekday_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    try:
        day = weekday_map[datetime.fromisoformat(date_str).weekday()]
    except Exception:
        raise HTTPException(400, "invalid date format, expected YYYY-MM-DD")

    teachers = await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(1000)
    punches = await db.attendance.find({"school_id": school_id, "date": date_str}, {"_id": 0}).to_list(5000)
    present_ids = {p['teacher_id'] for p in punches if p.get('teacher_id')}
    # Absent = teacher in roster with NO punches today
    absent_teachers = [t for t in teachers if t['id'] not in present_ids]

    subjects = {s['id']: s for s in await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    items_out = []
    created_total = 0
    for absent in absent_teachers:
        cells = await db.timetable.find({
            "school_id": school_id, "teacher_id": absent['id'], "day": day,
        }, {"_id": 0}).to_list(50)
        if not cells:
            continue
        for cell in cells:
            period_id = cell['period_id']; subject_id = cell.get('subject_id')
            busy_in_slot = await db.timetable.find({
                "school_id": school_id, "day": day, "period_id": period_id,
                "teacher_id": {"$nin": [None, absent['id']]},
            }, {"_id": 0}).to_list(500)
            busy_ids = {c['teacher_id'] for c in busy_in_slot if c.get('teacher_id')}
            best = None; best_score = -1
            for t in teachers:
                if t['id'] == absent['id'] or t['id'] in busy_ids:
                    continue
                # Only schedule teachers who are present today (have punches) OR no attendance data exists
                if punches and t['id'] not in present_ids:
                    continue
                score = 50
                if subject_id and subject_id in (t.get('subjects') or []):
                    score += 30
                todays = await db.timetable.count_documents({
                    "school_id": school_id, "teacher_id": t['id'], "day": day,
                })
                if todays < t.get('max_periods_per_day', 6):
                    score += 10
                else:
                    score -= 30
                if score > best_score:
                    best_score = score; best = t
            # Avoid duplicate substitutions for the same absent+date+period
            dup = await db.substitutions.find_one({
                "school_id": school_id, "absent_teacher_id": absent['id'],
                "date": date_str, "period_id": period_id, "class_id": cell['class_id'],
            }, {"_id": 0})
            if dup:
                continue
            sub = Substitution(
                school_id=school_id, absent_teacher_id=absent['id'], date=date_str,
                substitute_teacher_id=(best or {}).get('id'),
                period_id=period_id, class_id=cell['class_id'],
                status='suggested' if best else 'pending',
            )
            doc = sub.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
            await db.substitutions.insert_one(doc)
            created_total += 1
            items_out.append({
                "absent_teacher": absent.get('abbreviation'),
                "class_id": cell['class_id'],
                "period_id": period_id,
                "subject": (subjects.get(subject_id) or {}).get('code'),
                "substitute_teacher": (best or {}).get('abbreviation'),
                "score": best_score if best else None,
            })
    return {
        "date": date_str, "day": day,
        "absent_teachers": [{"id": t['id'], "name": t['name'], "abbreviation": t.get('abbreviation')}
                             for t in absent_teachers],
        "substitutions_created": created_total,
        "items": items_out,
    }


@router.post("/schools/{school_id}/substitutions/confirm-all-and-notify", status_code=202)
async def confirm_all_and_notify(school_id: str, payload: Dict[str, Any] = Body(default={}),
                                  user: dict = Depends(get_current_user)):
    """Flip every 'suggested' substitution for the given date to 'confirmed' and send a
    WhatsApp (fallback SMS) ping to each substitute teacher. Body: {date?, dry_run?, background?}.
    Returns 202 with a job-id; the work runs as a background task so the UI doesn't wait."""
    from perms import require_perm
    from notifier import twilio_configured
    await require_perm(school_id, user, "substitutions.manage")
    date_str = payload.get('date') or datetime.now().strftime('%Y-%m-%d')
    dry_run = bool(payload.get('dry_run'))
    background = payload.get('background', True)

    # Snapshot how many are about to flip so the UI can show a number immediately
    queued = await db.substitutions.count_documents({
        "school_id": school_id, "date": date_str, "status": "suggested",
        "substitute_teacher_id": {"$ne": None, "$exists": True},
    })
    job_id = f"confirm_{uuid.uuid4().hex[:10]}"

    async def _do_work():
        try:
            return await _confirm_all_inner(school_id, date_str, dry_run, job_id)
        except Exception as e:
            logging.getLogger(__name__).exception("confirm-all background job %s failed: %s", job_id, e)
            raise

    if background and not dry_run:
        asyncio.create_task(_do_work())
        return {
            "ok": True, "background": True, "job_id": job_id,
            "date": date_str, "queued": queued,
            "twilio_configured": twilio_configured(),
        }
    # Synchronous path (preserved for tests + dry-run preview)
    return await _do_work()


async def _confirm_all_inner(school_id: str, date_str: str, dry_run: bool, job_id: str):
    from notifier import send_with_fallback, twilio_configured
    subs = await db.substitutions.find({
        "school_id": school_id, "date": date_str, "status": "suggested",
        "substitute_teacher_id": {"$ne": None, "$exists": True},
    }, {"_id": 0}).to_list(2000)
    teachers = {t['id']: t for t in await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(1000)}
    classes = {c['id']: c for c in await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    periods = {p['id']: p for p in await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(200)}
    grouped: Dict[str, list] = {}
    for s in subs:
        grouped.setdefault(s['substitute_teacher_id'], []).append(s)
    results = []
    confirmed_total = 0
    twilio_ok = twilio_configured()
    for sub_teacher_id, items in grouped.items():
        teacher = teachers.get(sub_teacher_id)
        lines = []
        for s in items:
            cls = classes.get(s.get('class_id'))
            per = periods.get(s.get('period_id'))
            lines.append(f"- {cls.get('name') if cls else s.get('class_id')} · {per.get('name') if per else s.get('period_id')}")
        body = (
            f"Hello {teacher.get('name') if teacher else 'Teacher'}, you have {len(items)} substitution(s) on {date_str}:\n"
            + "\n".join(lines)
            + "\n— Sri Ma One Timetable"
        )
        channel, status, err = ("dry_run" if dry_run else "none", "skipped", None)
        if not dry_run and teacher and teacher.get('phone'):
            channel, status, err = send_with_fallback(teacher['phone'], body)
        if not dry_run:
            for s in items:
                await db.substitutions.update_one(
                    {"id": s['id']},
                    {"$set": {"status": "confirmed", "notified_at": datetime.now(timezone.utc).isoformat(),
                               "notify_channel": channel, "notify_status": status, "notify_job_id": job_id}}
                )
                confirmed_total += 1
        results.append({
            "teacher_id": sub_teacher_id,
            "teacher_name": (teacher or {}).get('name'),
            "phone": (teacher or {}).get('phone'),
            "items": len(items),
            "channel": channel, "status": status, "error": err,
        })
    return {
        "date": date_str, "dry_run": dry_run, "job_id": job_id,
        "twilio_configured": twilio_ok,
        "confirmed": confirmed_total,
        "notifications": results,
    }


@router.post("/schools/{school_id}/substitutions")
async def create_substitution(school_id: str, payload: Dict[str, Any] = Body(...),
                              user: dict = Depends(get_current_user)):
    payload['school_id'] = school_id
    obj = Substitution(**payload)
    doc = obj.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
    await db.substitutions.insert_one(doc)
    return serialize_doc(doc)


@router.get("/schools/{school_id}/substitutions")
async def list_substitutions(school_id: str, user: dict = Depends(get_current_user)):
    docs = await db.substitutions.find({"school_id": school_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_doc(d) for d in docs]


@router.post("/schools/{school_id}/constraints/parse")
async def parse_constraint(school_id: str, payload: Dict[str, Any] = Body(...),
                           user: dict = Depends(get_current_user)):
    text = payload.get('text', '')
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"con_{school_id}_{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are a constraint parser for school timetables. Convert natural language rules "
            "into JSON with keys: name, severity (hard|soft), category (clash|workload|room|sequence|preference|general), "
            "conditions (list of {field, op, value}), action ({type, value}). Return only valid JSON."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    res = await chat.send_message(UserMessage(text=text))
    return {"raw": res}


@router.post("/schools/{school_id}/timetable/optimize")
async def optimize_timetable(school_id: str, payload: Dict[str, Any] = Body(...),
                             user: dict = Depends(get_current_user)):
    """AI auto-improve: audit current timetable, send violations to Claude, return suggested swaps.
    Returns {violations_before, hard, soft, suggestions: str, structured: list of moves}."""
    import json, re
    class_id = payload.get('class_id')
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")

    q = {"school_id": school_id}
    if class_id:
        q['class_id'] = class_id
    cells = await db.timetable.find(q, {"_id": 0}).to_list(20000)
    if not cells:
        return {"violations_before": 0, "suggestions": "No cells to optimize.", "structured": []}

    rules = await db.constraints.find({"school_id": school_id, "enabled": True}, {"_id": 0}).to_list(500)
    teachers = {t['id']: t for t in await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    subjects = {s['id']: s for s in await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    classes = {c['id']: c for c in await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    periods = {p['id']: p for p in await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(100)}
    violations = audit_timetable(rules, cells, teachers, subjects, classes, periods)

    if not violations:
        return {"violations_before": 0, "suggestions": "No violations detected — timetable is clean!",
                "structured": []}

    # Build prompt for Claude with hard structure
    cell_index = []  # list of ids for stable reference
    cell_lines = []
    for c in cells[:60]:
        t = teachers.get(c.get('teacher_id'), {}); s = subjects.get(c.get('subject_id'), {})
        cls = classes.get(c.get('class_id'), {}); p = periods.get(c.get('period_id'), {})
        cell_index.append({
            'id': c.get('id'), 'class_id': c.get('class_id'), 'class_name': cls.get('name'),
            'day': c.get('day'), 'period_id': c.get('period_id'), 'period_name': p.get('name'),
            'subject_code': s.get('code'), 'teacher_abbr': t.get('abbreviation'),
        })
        cell_lines.append(f"{cls.get('name', '?')} / {c.get('day')} / {p.get('name', '?')}: "
                          f"{s.get('code', '—')} by {t.get('abbreviation', '—')}")

    viol_lines = []
    for v in violations[:25]:
        viol_lines.append(
            f"- [{v.get('severity', 'soft').upper()}] {v.get('rule_name')}: {v.get('message', '')}"
            + (f" @ {classes.get(v.get('class_id'), {}).get('name', '?')}/{v.get('day')}/"
               f"{periods.get(v.get('period_id'), {}).get('name', '?')}"
               if v.get('day') else "")
        )

    prompt = (
        "You are an expert Indian school timetable optimizer.\n\n"
        "VIOLATIONS:\n" + "\n".join(viol_lines) + "\n\n"
        "CURRENT CELLS:\n" + "\n".join(cell_lines) + "\n\n"
        "Return a JSON object with key 'moves' (array) and key 'commentary' (string). "
        "Each move: {type:'move'|'swap', class_name, from_day, from_period, to_day, to_period, reason}. "
        "Suggest up to 5 moves that reduce hard violations. Use exact class_name, day, and period names from input. "
        "Wrap the JSON in ```json ... ``` fences."
    )

    structured = []
    suggestions_text = ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"opt_{school_id}_{class_id}_{uuid.uuid4().hex[:6]}",
            system_message="You are an expert school timetable optimizer. Return JSON in ```json fences and a short prose summary.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        suggestions_text = await chat.send_message(UserMessage(text=prompt))

        # Try to parse JSON from fenced block
        m = re.search(r'```json\s*(\{.*?\})\s*```', suggestions_text, re.DOTALL)
        if m:
            try:
                obj = json.loads(m.group(1))
                moves = obj.get('moves', [])
                # Resolve class_name + period_name to ids
                cls_by_name = {c.get('name'): cid for cid, c in classes.items()}
                periods_by_name = {p.get('name'): pid for pid, p in periods.items()}
                for mv in moves[:6]:
                    cid = cls_by_name.get(mv.get('class_name'))
                    fpid = periods_by_name.get(mv.get('from_period'))
                    tpid = periods_by_name.get(mv.get('to_period'))
                    if cid and fpid and tpid and mv.get('from_day') and mv.get('to_day'):
                        structured.append({
                            'type': mv.get('type', 'move'),
                            'class_id': cid, 'class_name': mv.get('class_name'),
                            'from_day': mv['from_day'], 'from_period_id': fpid,
                            'from_period': mv.get('from_period'),
                            'to_day': mv['to_day'], 'to_period_id': tpid,
                            'to_period': mv.get('to_period'),
                            'reason': mv.get('reason', ''),
                        })
            except Exception as e:
                logger.warning(f"Parse moves JSON failed: {e}")
    except Exception as e:
        logger.warning(f"AI optimize failed: {e}")
        suggestions_text = f"AI temporarily unavailable: {e}"

    return {
        "violations_before": len(violations),
        "hard": sum(1 for v in violations if v.get('severity') == 'hard'),
        "soft": sum(1 for v in violations if v.get('severity') != 'hard'),
        "suggestions": suggestions_text,
        "structured": structured,
    }


@router.get("/schools/{school_id}/constraints/similar")
async def similar_constraints(school_id: str, field: str = "", value: str = "",
                               category: str = "", user: dict = Depends(get_current_user)):
    """Return up to 8 existing constraints that share the given field/value or category."""
    rules = await db.constraints.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    matches = []
    for r in rules:
        if category and r.get('category') == category:
            matches.append(r); continue
        for c in r.get('conditions', []):
            if field and c.get('field') == field:
                if not value or value.lower() in str(c.get('value', '')).lower():
                    matches.append(r); break
    # de-dupe by id
    seen = set(); out = []
    for r in matches:
        if r.get('id') in seen: continue
        seen.add(r.get('id'))
        out.append({
            'id': r.get('id'), 'name': r.get('name'),
            'category': r.get('category'), 'severity': r.get('severity'),
            'description': r.get('description'),
        })
        if len(out) >= 8: break
    return {"matches": out}
