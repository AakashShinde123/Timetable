"""Iter-10 backend tests:
- confirm-all-and-notify default (background) returns 202 with job-id shape
- background=False is synchronous, body has confirmed/notifications
- dry_run=true does not flip statuses
- PUT /schools/{sid} with auto_sync_times[3] persists all three; cron registration log shows 3 entries
- PUT auto_sync_enabled:false removes all jobs (log line)
"""
import os
import re
import time
import subprocess
import requests
from datetime import datetime, timezone
from pymongo import MongoClient


def _db():
    return MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))[
        os.environ.get('DB_NAME', 'test_database')
    ]


def _seed_school(auth_client, base_url):
    r = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya")
    assert r.status_code == 200
    return r.json()["school_id"]


def _seed_suggested(sid, sub_teacher_id, date_str, tag):
    db = _db()
    sub_id = f"sub_i10_{tag}_{int(time.time()*1000000)}"
    db.substitutions.insert_one({
        "id": sub_id, "school_id": sid,
        "absent_teacher_id": "absent_i10",
        "substitute_teacher_id": sub_teacher_id,
        "date": date_str, "period_id": "p_i10", "class_id": "c_i10",
        "status": "suggested",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return sub_id


# ---------- Background 202 response shape ----------

class TestConfirmAllBackground:
    sub_ids = []

    def test_default_returns_202_background_shape(self, auth_client, base_url):
        sid = _seed_school(auth_client, base_url)
        self.__class__.sid = sid
        db = _db()
        teacher = db.teachers.find_one({"school_id": sid}, {"_id": 0})
        date_str = datetime.now().strftime('%Y-%m-%d')
        self.__class__.date_str = date_str
        self.sub_ids.append(_seed_suggested(sid, teacher["id"], date_str, "bg"))

        r = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
            json={"date": date_str},
        )
        assert r.status_code == 202, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("background") is True
        assert isinstance(d.get("job_id"), str) and d["job_id"].startswith("confirm_")
        assert d.get("date") == date_str
        assert isinstance(d.get("queued"), int)
        assert d.get("twilio_configured") is False

    def test_background_false_synchronous_shape(self, auth_client, base_url):
        sid = self.sid
        date_str = self.date_str
        db = _db()
        teacher = db.teachers.find_one({"school_id": sid}, {"_id": 0})
        sub_id = _seed_suggested(sid, teacher["id"], date_str, "sync")
        self.sub_ids.append(sub_id)

        r = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
            json={"date": date_str, "background": False},
        )
        # endpoint declares 202 but synchronous path still returns 202 with full body
        assert r.status_code in (200, 202), r.text
        d = r.json()
        assert "confirmed" in d
        assert "notifications" in d
        assert d.get("twilio_configured") is False
        # The seeded row should now be confirmed
        row = db.substitutions.find_one({"id": sub_id}, {"_id": 0})
        assert row["status"] == "confirmed"

    def test_dry_run_does_not_flip(self, auth_client, base_url):
        sid = self.sid
        date_str = self.date_str
        db = _db()
        teacher = db.teachers.find_one({"school_id": sid}, {"_id": 0})
        sub_id = _seed_suggested(sid, teacher["id"], date_str, "dry")
        self.sub_ids.append(sub_id)

        r = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
            json={"date": date_str, "dry_run": True},
        )
        assert r.status_code in (200, 202), r.text
        d = r.json()
        assert d.get("dry_run") is True
        row = db.substitutions.find_one({"id": sub_id}, {"_id": 0})
        assert row["status"] == "suggested"

    @classmethod
    def teardown_class(cls):
        db = _db()
        for sid in cls.sub_ids:
            db.substitutions.delete_one({"id": sid})


# ---------- Multi-time auto-sync ----------

class TestMultiTimeAutosync:
    def test_put_with_three_times_persists(self, auth_client, base_url):
        sid = _seed_school(auth_client, base_url)
        self.__class__.sid = sid
        r = auth_client.put(f"{base_url}/api/schools/{sid}", json={
            "auto_sync_enabled": True,
            "auto_sync_times": ["07:10", "07:15", "07:25"],
            "auto_sync_essl_device_id": None,
            "notify_latecomers": True,
            "auto_confirm_substitutions": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("auto_sync_enabled") is True
        assert d.get("auto_sync_times") == ["07:10", "07:15", "07:25"]
        assert d.get("notify_latecomers") is True

        # Verify via GET
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}")
        assert r2.status_code == 200
        assert r2.json().get("auto_sync_times") == ["07:10", "07:15", "07:25"]

    def test_scheduler_registered_three_jobs(self):
        """Grep backend.err.log for 3 'autosync job registered for school <sid> @ HH:MM' lines."""
        sid = self.sid
        time.sleep(1.0)  # let log flush
        try:
            out = subprocess.run(
                ["tail", "-n", "500", "/var/log/supervisor/backend.err.log"],
                capture_output=True, text=True, timeout=5,
            ).stdout
        except Exception:
            out = ""
        # Find lines for this sid
        matches = re.findall(rf"autosync job registered for school {re.escape(sid)} @ (\d\d:\d\d)", out)
        # Latest registration may have appended 3 fresh lines
        recent = matches[-3:] if len(matches) >= 3 else matches
        assert set(recent) == {"07:10", "07:15", "07:25"}, f"got {matches}"

    def test_disable_removes_jobs(self, auth_client, base_url):
        sid = self.sid
        r = auth_client.put(f"{base_url}/api/schools/{sid}", json={"auto_sync_enabled": False})
        assert r.status_code == 200, r.text
        assert r.json().get("auto_sync_enabled") is False
        time.sleep(0.5)
        try:
            out = subprocess.run(
                ["tail", "-n", "200", "/var/log/supervisor/backend.err.log"],
                capture_output=True, text=True, timeout=5,
            ).stdout
        except Exception:
            out = ""
        assert f"autosync all jobs removed for {sid}" in out, "expected 'autosync all jobs removed' log line"
