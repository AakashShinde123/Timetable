"""Iter-11: TTL on attendance + paged GET /attendance verification."""
import os
import pytest
import requests as _requests
from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")


def _mongo():
    return MongoClient(os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))


def _dbname():
    return os.environ.get('DB_NAME', 'test_database')


def _get_school_id(client, base_url):
    r = client.get(f"{base_url}/api/schools")
    r.raise_for_status()
    schools = r.json()
    if not schools:
        # seed sri-ma
        s = client.post(f"{base_url}/api/seed/sri-ma-vidyalaya")
        s.raise_for_status()
        return s.json()["school_id"]
    # prefer sri-ma
    for s in schools:
        if "sri" in (s.get("name", "").lower()):
            return s["id"]
    return schools[0]["id"]


# Mongo TTL index on attendance
class TestAttendanceTTLIndex:
    def test_ttl_index_present(self):
        client = _mongo()
        db = client[_dbname()]
        info = db.attendance.index_information()
        assert "attendance_ttl_at_ttl" in info, f"TTL index missing. Found: {list(info.keys())}"
        idx = info["attendance_ttl_at_ttl"]
        assert idx.get("expireAfterSeconds") == 365 * 86400, f"Wrong TTL: {idx}"
        # Key on ttl_at field
        keys = dict(idx["key"]) if isinstance(idx["key"], list) else idx["key"]
        # Pymongo returns key as list of tuples
        key_fields = [k[0] for k in idx["key"]]
        assert "ttl_at" in key_fields

    def test_secondary_indexes_present(self):
        client = _mongo()
        db = client[_dbname()]
        info = db.attendance.index_information()
        assert "attendance_school_date" in info, f"Missing. Found: {list(info.keys())}"
        assert "attendance_school_teacher_date" in info, f"Missing. Found: {list(info.keys())}"


# Paged GET /attendance
class TestAttendancePagedShape:
    def test_paged_shape(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/attendance")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict), f"Expected paged dict, got {type(d)}"
        for k in ("total", "limit", "offset", "items"):
            assert k in d, f"Missing key '{k}' in {list(d.keys())}"
        assert isinstance(d["total"], int)
        assert isinstance(d["limit"], int)
        assert isinstance(d["offset"], int)
        assert isinstance(d["items"], list)

    def test_pagination_limit_offset(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # ensure at least 3 rows exist via manual punches
        r1 = auth_client.get(f"{base_url}/api/schools/{sid}/teachers")
        teachers = r1.json()
        if len(teachers) < 1:
            pytest.skip("No teachers seeded")
        t = teachers[0]
        for i, t_time in enumerate(["08:01:00", "08:02:00", "08:03:00"]):
            auth_client.post(f"{base_url}/api/schools/{sid}/attendance/manual", json={
                "teacher_id": t["id"], "date": "2026-02-15", "time": t_time, "punch_type": "in",
            })
        r = auth_client.get(f"{base_url}/api/schools/{sid}/attendance?limit=2&offset=0")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["limit"] == 2
        assert d["offset"] == 0
        assert len(d["items"]) <= 2

    def test_ttl_at_is_native_datetime_after_manual_punch(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r1 = auth_client.get(f"{base_url}/api/schools/{sid}/teachers")
        teachers = r1.json()
        if not teachers:
            pytest.skip("No teachers")
        t = teachers[0]
        r = auth_client.post(f"{base_url}/api/schools/{sid}/attendance/manual", json={
            "teacher_id": t["id"], "date": "2026-02-16", "time": "09:09:09", "punch_type": "in",
        })
        assert r.status_code == 200, r.text
        att_id = r.json()["id"]
        # Direct mongo check: ttl_at must be a real BSON datetime
        client = _mongo()
        db = client[_dbname()]
        doc = db.attendance.find_one({"id": att_id})
        assert doc is not None, "punch not persisted"
        assert "ttl_at" in doc, f"ttl_at not set. Keys: {list(doc.keys())}"
        assert isinstance(doc["ttl_at"], datetime), f"ttl_at not datetime: {type(doc['ttl_at'])}={doc['ttl_at']!r}"
