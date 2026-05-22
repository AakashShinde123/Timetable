"""Iter-9 backend tests:
- masters.py require_perm gating (403 for non-perm members, 200 once perm granted)
- masters GET endpoints remain open to any school member
- POST /allotments/bulk requires allotments.manage
- POST /essl-devices requires attendance.manage
- PUT /schools/{sid} auto_sync_* fields persistence + cron clear
- POST /schools/{sid}/autosync/run-now is permission-gated
- POST /schools/{sid}/substitutions/confirm-all-and-notify (twilio not configured, dry_run, perm gate)
"""
import os
import time
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient


# ---------- helpers ----------

def _mongo_db():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    return MongoClient(mongo_url)[db_name]


def _make_session(role="School Admin", email=None, school_ids=None):
    db = _mongo_db()
    ts = int(time.time() * 1000) + (id(role) % 1000)
    uid = f"test-i9-{ts}"
    tok = f"test_i9_{ts}"
    db.users.insert_one({
        "user_id": uid, "email": email or f"i9.{ts}@test.com",
        "name": f"I9 {role}", "role": role,
        "school_ids": school_ids or [], "created_at": datetime.now(timezone.utc),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    })
    return tok, uid, email or f"i9.{ts}@test.com"


def _client_for(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


def _seed_school(auth_client, base_url):
    r = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya")
    assert r.status_code == 200
    return r.json()["school_id"]


# Shared module-level state to share school_id between classes
_state = {}


# ---------- masters CRUD permission gating ----------

class TestMastersPermGating:
    """Create a Viewer member with permissions=['audit.view'] and hit every master write endpoint."""

    @classmethod
    def setup_class(cls):
        pass

    def test_setup_viewer_member(self, auth_client, base_url):
        sid = _seed_school(auth_client, base_url)
        _state['sid'] = sid
        tok, uid, email = _make_session(role="School Admin", school_ids=[sid])
        _state['viewer_token'] = tok
        _state['viewer_uid'] = uid
        _state['viewer_email'] = email
        # Insert school_member with only audit.view
        db = _mongo_db()
        mem_id = f"mem_i9_{int(time.time()*1000)}"
        db.school_members.insert_one({
            "id": mem_id, "school_id": sid, "user_id": uid,
            "email": email.lower(), "role": "Viewer",
            "permissions": ["audit.view"], "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        _state['mem_id'] = mem_id

    @pytest.mark.parametrize("resource,payload", [
        ("teachers", {"name": "TEST_T", "abbreviation": "ZZ"}),
        ("subjects", {"name": "TEST_S", "code": "ZZS", "color": "#000000"}),
        ("classes", {"name": "TEST_C", "standard": "Standard 1", "division": "Z"}),
        ("facilities", {"name": "TEST_F", "type": "Lab", "capacity": 30}),
        ("sections", {"name": "TEST_SEC", "order": 99, "description": "x"}),
        ("activities", {"name": "TEST_A", "type": "Special", "subject_id": "x"}),
        ("shifts", {"name": "TEST_SH", "start_time": "08:00", "end_time": "13:00"}),
        ("periods", {"shift_id": "x", "order": 0, "name": "P", "start_time": "08:00", "end_time": "08:45"}),
        ("allotments", {"class_id": "x", "subject_id": "y", "periods_per_week": 1}),
        ("constraints", {"name": "TEST_R", "severity": "soft", "category": "preference"}),
        ("labs", {"name": "TEST_L", "type": "Computer"}),
    ])
    def test_create_forbidden_for_viewer(self, base_url, resource, payload):
        sid = _state['sid']
        cl = _client_for(_state['viewer_token'])
        r = cl.post(f"{base_url}/api/schools/{sid}/{resource}", json=payload)
        assert r.status_code == 403, f"{resource} should be 403, got {r.status_code} body={r.text[:200]}"

    def test_essl_devices_requires_attendance_manage(self, base_url):
        """essl-devices uses 'attendance.manage' (not facilities.manage)"""
        sid = _state['sid']
        cl = _client_for(_state['viewer_token'])
        r = cl.post(f"{base_url}/api/schools/{sid}/essl-devices", json={
            "name": "TEST_ESSL", "ip_address": "1.2.3.4", "port": 4370,
        })
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"

    def test_get_endpoints_open_for_member(self, base_url):
        """GET on masters should be 200 for any active school member regardless of perms."""
        sid = _state['sid']
        cl = _client_for(_state['viewer_token'])
        for resource in ["teachers", "subjects", "classes", "facilities", "sections",
                         "activities", "shifts", "periods", "constraints", "allotments",
                         "labs", "essl-devices"]:
            r = cl.get(f"{base_url}/api/schools/{sid}/{resource}")
            assert r.status_code == 200, f"GET {resource} got {r.status_code}: {r.text[:200]}"
            assert isinstance(r.json(), list)

    def test_bulk_allotments_requires_perm(self, base_url):
        sid = _state['sid']
        cl = _client_for(_state['viewer_token'])
        r = cl.post(f"{base_url}/api/schools/{sid}/allotments/bulk",
                    json={"rows": [{"class_name": "x", "subject_code": "ENG", "periods_per_week": 1}]})
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"

    def test_grant_perm_then_create_succeeds(self, base_url):
        """Add 'teachers.manage' to viewer and retry POST /teachers — should be 200."""
        sid = _state['sid']
        db = _mongo_db()
        db.school_members.update_one(
            {"id": _state['mem_id']},
            {"$set": {"permissions": ["audit.view", "teachers.manage"]}},
        )
        cl = _client_for(_state['viewer_token'])
        r = cl.post(f"{base_url}/api/schools/{sid}/teachers",
                    json={"name": "TEST_GrantedT", "abbreviation": "ZG"})
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        _state['granted_teacher_id'] = r.json()["id"]

        # Verify subjects still 403 (only teachers.manage was granted)
        r2 = cl.post(f"{base_url}/api/schools/{sid}/subjects",
                     json={"name": "TEST_ShouldFail", "code": "ZZF", "color": "#000"})
        assert r2.status_code == 403

    @classmethod
    def teardown_class(cls):
        db = _mongo_db()
        if 'mem_id' in _state:
            db.school_members.delete_one({"id": _state['mem_id']})
        if 'viewer_uid' in _state:
            db.users.delete_many({"user_id": _state['viewer_uid']})
            db.user_sessions.delete_many({"user_id": _state['viewer_uid']})
        if 'granted_teacher_id' in _state:
            db.teachers.delete_one({"id": _state['granted_teacher_id']})


# ---------- Auto-sync school fields ----------

class TestAutoSyncSchoolFields:
    def test_put_school_persists_autosync_fields(self, auth_client, base_url):
        sid = _state.get('sid') or _seed_school(auth_client, base_url)
        _state['sid'] = sid
        r = auth_client.put(f"{base_url}/api/schools/{sid}", json={
            "auto_sync_enabled": True,
            "auto_sync_time": "07:30",
            "auto_sync_essl_device_id": None,
            "auto_confirm_substitutions": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("auto_sync_enabled") is True
        assert d.get("auto_sync_time") == "07:30"
        assert d.get("auto_confirm_substitutions") is False

        # verify via GET
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}")
        assert r2.status_code == 200
        assert r2.json().get("auto_sync_enabled") is True

    def test_put_school_disable_autosync(self, auth_client, base_url):
        sid = _state['sid']
        r = auth_client.put(f"{base_url}/api/schools/{sid}", json={"auto_sync_enabled": False})
        assert r.status_code == 200, r.text
        assert r.json().get("auto_sync_enabled") is False

    def test_autosync_run_now_super_admin(self, auth_client, base_url):
        sid = _state['sid']
        # Super Admin has all perms; no eSSL device configured — should not crash
        r = auth_client.post(f"{base_url}/api/schools/{sid}/autosync/run-now", json={})
        # 200 with ok:true expected (best-effort)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("ok") is True
        assert d.get("school_id") == sid

    def test_autosync_run_now_requires_attendance_manage(self, auth_client, base_url):
        """Non-perm member should get 403."""
        sid = _state['sid']
        tok, uid, email = _make_session(role="School Admin", school_ids=[sid])
        db = _mongo_db()
        mem_id = f"mem_i9b_{int(time.time()*1000)}"
        db.school_members.insert_one({
            "id": mem_id, "school_id": sid, "user_id": uid,
            "email": email.lower(), "role": "Viewer",
            "permissions": ["audit.view"], "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            cl = _client_for(tok)
            r = cl.post(f"{base_url}/api/schools/{sid}/autosync/run-now", json={})
            assert r.status_code == 403, f"got {r.status_code}: {r.text[:300]}"
        finally:
            db.school_members.delete_one({"id": mem_id})
            db.users.delete_many({"user_id": uid})
            db.user_sessions.delete_many({"user_id": uid})


# ---------- confirm-all-and-notify ----------

class TestConfirmAllAndNotify:
    suggested_ids = []

    def _make_suggested_sub(self, sid, sub_teacher_id, date_str):
        db = _mongo_db()
        sub_id = f"sub_i9_{int(time.time()*1000000)}_{len(self.suggested_ids)}"
        db.substitutions.insert_one({
            "id": sub_id, "school_id": sid,
            "absent_teacher_id": "absent_i9",
            "substitute_teacher_id": sub_teacher_id,
            "date": date_str, "period_id": "p_i9", "class_id": "c_i9",
            "status": "suggested",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        self.suggested_ids.append(sub_id)
        return sub_id

    def test_confirm_all_twilio_not_configured(self, auth_client, base_url):
        sid = _state.get('sid') or _seed_school(auth_client, base_url)
        _state['sid'] = sid
        # Pick any teacher and set a phone on it (only via direct mongo to bypass perms)
        db = _mongo_db()
        teacher = db.teachers.find_one({"school_id": sid}, {"_id": 0})
        assert teacher is not None
        db.teachers.update_one({"id": teacher["id"]}, {"$set": {"phone": "+919999999999"}})
        date_str = datetime.now().strftime('%Y-%m-%d')
        _state['date'] = date_str
        sub_id = self._make_suggested_sub(sid, teacher["id"], date_str)

        r = auth_client.post(f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
                             json={"date": date_str, "background": False})
        assert r.status_code in (200, 202), r.text
        d = r.json()
        assert d.get("twilio_configured") is False
        assert d.get("confirmed") >= 1, f"confirmed={d.get('confirmed')}"
        # notification channel should be 'none'/'skipped'
        notifs = d.get("notifications") or []
        assert len(notifs) >= 1
        assert any(n.get("channel") == "none" and n.get("status") == "skipped" for n in notifs)
        # verify db status flipped
        flipped = db.substitutions.find_one({"id": sub_id}, {"_id": 0})
        assert flipped["status"] == "confirmed"

    def test_dry_run_does_not_flip(self, auth_client, base_url):
        sid = _state['sid']
        date_str = _state['date']
        db = _mongo_db()
        teacher = db.teachers.find_one({"school_id": sid}, {"_id": 0})
        sub_id = self._make_suggested_sub(sid, teacher["id"], date_str)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
                             json={"date": date_str, "dry_run": True})
        assert r.status_code in (200, 202), r.text
        d = r.json()
        assert d.get("dry_run") is True
        # ensure the suggested row remains 'suggested'
        row = db.substitutions.find_one({"id": sub_id}, {"_id": 0})
        assert row["status"] == "suggested", f"dry_run should not flip, got {row['status']}"

    def test_confirm_all_requires_substitutions_manage(self, auth_client, base_url):
        sid = _state['sid']
        tok, uid, email = _make_session(role="Viewer", school_ids=[sid])
        db = _mongo_db()
        mem_id = f"mem_i9c_{int(time.time()*1000)}"
        db.school_members.insert_one({
            "id": mem_id, "school_id": sid, "user_id": uid,
            "email": email.lower(), "role": "Viewer",
            "permissions": ["audit.view"], "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            cl = _client_for(tok)
            r = cl.post(f"{base_url}/api/schools/{sid}/substitutions/confirm-all-and-notify",
                        json={"date": _state['date']})
            assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"
        finally:
            db.school_members.delete_one({"id": mem_id})
            db.users.delete_many({"user_id": uid})
            db.user_sessions.delete_many({"user_id": uid})

    @classmethod
    def teardown_class(cls):
        db = _mongo_db()
        for sid in cls.suggested_ids:
            db.substitutions.delete_one({"id": sid})
