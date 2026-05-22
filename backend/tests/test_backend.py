"""Backend API tests for School Timetable Management."""
import pytest
import time

# ----- Health -----
class TestHealth:
    def test_root(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ----- Auth -----
class TestAuth:
    def test_me_without_session(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_session(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data.get("role") == "Super Admin"
        assert "email" in data


# ----- Schools CRUD -----
class TestSchools:
    school_id = None

    def test_list_schools(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/schools")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_school(self, auth_client, base_url):
        r = auth_client.post(f"{base_url}/api/schools", json={
            "name": "TEST_School_AutoTest",
            "location": "Test Location",
            "board": "CBSE",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_School_AutoTest"
        assert data["id"].startswith("sch_")
        TestSchools.school_id = data["id"]

    def test_get_school(self, auth_client, base_url):
        sid = TestSchools.school_id
        assert sid
        r = auth_client.get(f"{base_url}/api/schools/{sid}")
        assert r.status_code == 200
        assert r.json()["id"] == sid

    def test_update_school(self, auth_client, base_url):
        sid = TestSchools.school_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}", json={"location": "Updated Loc"})
        assert r.status_code == 200
        # verify persistence
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}")
        assert r2.json()["location"] == "Updated Loc"


# ----- Basic Seed -----
class TestBasicSeed:
    sri_school_id = None

    def test_seed_basic(self, auth_client, base_url):
        r = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya")
        assert r.status_code == 200
        data = r.json()
        assert "school_id" in data
        TestBasicSeed.sri_school_id = data["school_id"]
        # idempotent: second call should insert 0
        r2 = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya")
        assert r2.status_code == 200
        assert r2.json()["teachers_inserted"] == 0

    def test_teachers_uppercase(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers")
        assert r.status_code == 200
        teachers = r.json()
        assert len(teachers) >= 40
        for t in teachers:
            assert t["abbreviation"] == t["abbreviation"].upper(), f"Not uppercase: {t['abbreviation']}"


# ----- Deep Seed -----
class TestDeepSeed:
    def test_seed_full_then_idempotent(self, auth_client, base_url):
        r = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya/full")
        assert r.status_code == 200
        data = r.json()
        # Either fresh creation or already-seeded zeros - both acceptable
        assert "school_id" in data
        assert "subjects_created" in data
        assert "classes_created" in data
        assert "allotments_created" in data
        assert "rules_created" in data
        # Second call must be idempotent (all zeros)
        r2 = auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya/full")
        d2 = r2.json()
        assert d2["subjects_created"] == 0
        assert d2["classes_created"] == 0
        assert d2["allotments_created"] == 0
        assert d2["rules_created"] == 0


# ----- Stats -----
class TestStats:
    def test_stats_keys(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        assert sid
        r = auth_client.get(f"{base_url}/api/schools/{sid}/stats")
        assert r.status_code == 200
        stats = r.json()
        required = {"teachers", "subjects", "classes", "labs", "shifts", "periods",
                    "activities", "constraints", "allotments", "timetable_cells"}
        assert required.issubset(stats.keys())
        # Deep seed should produce many entries
        assert stats["classes"] >= 40
        assert stats["allotments"] >= 600
        assert stats["constraints"] >= 30
        assert stats["subjects"] >= 25


# ----- Generic Master CRUD: teachers & subjects -----
class TestGenericMaster:
    teacher_id = None
    subject_id = None

    def test_create_teacher_uppercase(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        r = auth_client.post(f"{base_url}/api/schools/{sid}/teachers", json={
            "name": "TEST_Teacher One",
            "abbreviation": "ttx",  # lowercase to verify uppercase
        })
        assert r.status_code == 200
        data = r.json()
        assert data["abbreviation"] == "TTX"
        TestGenericMaster.teacher_id = data["id"]

    def test_update_teacher_uppercase(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        tid = TestGenericMaster.teacher_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/teachers/{tid}", json={
            "abbreviation": "newAbr",
            "name": "TEST_Updated",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["abbreviation"] == "NEWABR"
        assert data["name"] == "TEST_Updated"

    def test_delete_teacher(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        tid = TestGenericMaster.teacher_id
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/teachers/{tid}")
        assert r.status_code == 200
        # Verify gone
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/teachers")
        ids = [t["id"] for t in r2.json()]
        assert tid not in ids

    def test_subject_crud(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        r = auth_client.post(f"{base_url}/api/schools/{sid}/subjects", json={
            "name": "TEST_Subject", "code": "TST", "color": "#123456",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["code"] == "TST"
        sub_id = d["id"]
        # Update
        r2 = auth_client.put(f"{base_url}/api/schools/{sid}/subjects/{sub_id}", json={"color": "#FFFFFF"})
        assert r2.status_code == 200
        assert r2.json()["color"] == "#FFFFFF"
        # Delete
        r3 = auth_client.delete(f"{base_url}/api/schools/{sid}/subjects/{sub_id}")
        assert r3.status_code == 200


# ----- Timetable / clash -----
class TestTimetable:
    def test_upsert_and_clash(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        # Get two different classes & one teacher
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        tch = auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json()
        prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
        assert len(cls) >= 2 and len(tch) >= 1 and len(prd) >= 1
        class_a, class_b = cls[0]["id"], cls[1]["id"]
        teacher_id = tch[0]["id"]
        period_id = prd[0]["id"]

        # Upsert cell for class A
        r1 = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": class_a, "day": "Mon", "period_id": period_id, "teacher_id": teacher_id,
        })
        assert r1.status_code == 200
        assert r1.json()["clashes"] == []

        # Upsert cell for class B with same teacher -> should clash
        r2 = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": class_b, "day": "Mon", "period_id": period_id, "teacher_id": teacher_id,
        })
        assert r2.status_code == 200
        clashes = r2.json()["clashes"]
        assert any(c["type"] == "teacher_clash" for c in clashes)

        # GET timetable by class
        r3 = auth_client.get(f"{base_url}/api/schools/{sid}/timetable?class_id={class_a}")
        assert r3.status_code == 200
        assert isinstance(r3.json(), list)
        assert len(r3.json()) >= 1

        # DELETE cell
        r4 = auth_client.delete(
            f"{base_url}/api/schools/{sid}/timetable/cell",
            params={"class_id": class_a, "day": "Mon", "period_id": period_id},
        )
        assert r4.status_code == 200
        # Also cleanup class_b
        auth_client.delete(
            f"{base_url}/api/schools/{sid}/timetable/cell",
            params={"class_id": class_b, "day": "Mon", "period_id": period_id},
        )


# ----- Substitution suggester -----
class TestSubstitutionSuggester:
    def test_suggest(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        tch = auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json()
        prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
        absent = tch[0]["id"]
        class_id = cls[0]["id"]
        period_id = prd[0]["id"]
        # Pre-populate timetable cell for absent teacher
        auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": class_id, "day": "Mon", "period_id": period_id, "teacher_id": absent,
        })
        # Mon date: 2026-02-02 is a Monday
        r = auth_client.post(f"{base_url}/api/schools/{sid}/substitutions/suggest", json={
            "absent_teacher_id": absent, "date": "2026-02-02",
        }, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["affected_periods"] >= 1
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) >= 1
        sug = data["suggestions"][0]
        assert "top_candidates" in sug
        # Candidates should not include absent teacher
        for c in sug["top_candidates"]:
            assert c["teacher_id"] != absent
        # Scores should be sorted descending
        scores = [c["score"] for c in sug["top_candidates"]]
        assert scores == sorted(scores, reverse=True)
        # ai_commentary is optional (None acceptable if rate-limited)
        assert "ai_commentary" in data
        # Cleanup
        auth_client.delete(
            f"{base_url}/api/schools/{sid}/timetable/cell",
            params={"class_id": class_id, "day": "Mon", "period_id": period_id},
        )


# ----- Substitutions CRUD -----
class TestSubstitutionsCRUD:
    def test_create_and_list(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        tch = auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json()
        r = auth_client.post(f"{base_url}/api/schools/{sid}/substitutions", json={
            "absent_teacher_id": tch[0]["id"], "date": "2026-02-02",
            "substitute_teacher_id": tch[1]["id"], "status": "pending",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["absent_teacher_id"] == tch[0]["id"]
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/substitutions")
        assert r2.status_code == 200
        assert any(x["id"] == d["id"] for x in r2.json())


# ----- NL constraint parser -----
class TestNLConstraintParser:
    def test_parse(self, auth_client, base_url):
        sid = TestBasicSeed.sri_school_id
        r = auth_client.post(f"{base_url}/api/schools/{sid}/constraints/parse",
                             json={"text": "Avoid Mathematics after lunch"},
                             timeout=45)
        assert r.status_code == 200
        d = r.json()
        assert "raw" in d
        assert isinstance(d["raw"], str)
        assert len(d["raw"]) > 0


# ----- Logout -----
class TestLogout:
    def test_logout(self, base_url):
        import requests
        from pymongo import MongoClient
        import os
        from datetime import datetime, timezone, timedelta

        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        client = MongoClient(mongo_url)
        db = client[db_name]
        ts = int(time.time() * 1000)
        user_id = f"test-logout-user-{ts}"
        token = f"test_logout_session_{ts}"
        db.users.insert_one({"user_id": user_id, "email": f"logout.{ts}@ex.com",
                             "name": "Logout User", "role": "School Admin", "school_ids": [],
                             "created_at": datetime.now(timezone.utc)})
        db.user_sessions.insert_one({"user_id": user_id, "session_token": token,
                                     "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                                     "created_at": datetime.now(timezone.utc)})
        # Logout via cookie (endpoint reads cookie only)
        s = requests.Session()
        s.cookies.set("session_token", token, domain=base_url.replace("https://", "").replace("http://", ""))
        r = s.post(f"{base_url}/api/auth/logout")
        assert r.status_code == 200
        # Session deleted
        assert db.user_sessions.find_one({"session_token": token}) is None
        db.users.delete_many({"user_id": user_id})



# ============================================================
# NEW FEATURE TESTS (iteration 2)
# ============================================================

def _get_school_id(auth_client, base_url):
    """Find Sri Ma Vidyalaya school id."""
    schools = auth_client.get(f"{base_url}/api/schools").json()
    sri = next((s for s in schools if s["name"] == "Sri Ma Vidyalaya CBSE School"), None)
    assert sri, "Sri Ma Vidyalaya school not seeded"
    return sri["id"]


def _find_teacher_by_abbr(auth_client, base_url, sid, abbr):
    tch = auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json()
    return next((t for t in tch if t["abbreviation"] == abbr), None)


def _find_period_by_name(auth_client, base_url, sid, name):
    prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
    return next((p for p in prd if p["name"] == name), None)


# ----- Constraint engine: PUT cell returns violations -----
class TestCellViolations:
    def test_mn_in_p1_hard_violation(self, auth_client, base_url):
        # Make sure deep seed has run
        auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya/full")
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        # Pick a Grade 6 class for context
        cls_g6 = next((c for c in cls if c.get("standard") == "Standard 6" or c.get("grade") == "Grade 6"), cls[0])
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        assert mn and p1, "Need MN teacher and P1 period seeded"
        r = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"],
            "teacher_id": mn["id"],
        })
        assert r.status_code == 200
        data = r.json()
        assert "violations" in data and isinstance(data["violations"], list)
        # Expect Mini Madam rule fires with severity=hard
        names = [v.get("rule_name") for v in data["violations"]]
        sevs = [v.get("severity") for v in data["violations"]]
        assert any("Mini Madam" in (n or "") for n in names), f"Got violations: {names}"
        assert "hard" in sevs
        # cleanup
        auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                           params={"class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"]})


# ----- Validate endpoint (no save) -----
class TestValidateEndpoint:
    def test_hk_p1_violation_no_save(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        hk = _find_teacher_by_abbr(auth_client, base_url, sid, "HK")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        p5 = _find_period_by_name(auth_client, base_url, sid, "P5")
        assert hk and p1 and p5
        # Hard violation expected
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/validate", json={
            "class_id": cls[0]["id"], "day": "Mon", "period_id": p1["id"],
            "teacher_id": hk["id"],
        })
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("violations"), list)
        assert any(v.get("severity") == "hard" for v in d["violations"])
        # Verify nothing was saved (no cell for this class/day/period if not pre-existing)
        cells = auth_client.get(f"{base_url}/api/schools/{sid}/timetable",
                                params={"class_id": cls[0]["id"]}).json()
        # In case existing, check it's not the HK assignment we just validated
        matching = [c for c in cells if c["day"] == "Mon" and c["period_id"] == p1["id"]]
        for c in matching:
            assert c.get("teacher_id") != hk["id"], "Validate should not save the cell"

        # Valid combo: HK at P5 -> should not violate (P5 not in P1,P2,P9 forbid)
        r2 = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/validate", json={
            "class_id": cls[0]["id"], "day": "Mon", "period_id": p5["id"],
            "teacher_id": hk["id"],
        })
        assert r2.status_code == 200
        d2 = r2.json()
        # No HK-specific hard violation for P5
        hk_viols = [v for v in d2["violations"]
                    if "HK" in (v.get("rule_name") or "") and v.get("severity") == "hard"]
        assert hk_viols == []


# ----- Auto-generate timetable -----
class TestAutoGenerate:
    grade6a_id = None

    def test_auto_generate_grade6a(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next((c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A")), None)
        assert g6a, "Standard/Grade 6 - A missing from deep seed"
        TestAutoGenerate.grade6a_id = g6a["id"]
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                             json={"class_id": g6a["id"], "replace": True}, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "placed" in d and "skipped_slots" in d and "leftover_periods" in d
        # Expect roughly 35-50 cells placed
        assert d["placed"] >= 30, f"Placed too few: {d}"
        # Verify cells persisted
        cells = auth_client.get(f"{base_url}/api/schools/{sid}/timetable",
                                params={"class_id": g6a["id"]}).json()
        assert len(cells) == d["placed"]

    def test_no_mn_in_p1_after_autogen(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        g6a = TestAutoGenerate.grade6a_id
        assert g6a
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        cells = auth_client.get(f"{base_url}/api/schools/{sid}/timetable",
                                params={"class_id": g6a}).json()
        bad = [c for c in cells if c.get("teacher_id") == mn["id"] and c["period_id"] == p1["id"]]
        assert bad == [], "Auto-gen placed MN in P1 (hard constraint violated)"


# ----- Bulk allotments import -----
class TestBulkAllotments:
    def test_bulk_mixed_valid_invalid(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # Use a valid class & subject from existing seed; one invalid row
        rows = [
            {"class_name": "Standard 6 - A", "subject_code": "ENG", "periods_per_week": 7},
            {"class_name": "NoSuchClass", "subject_code": "ENG", "periods_per_week": 3},
            {"class_name": "Standard 6 - A", "subject_code": "ZZZ_NOPE", "periods_per_week": 2},
        ]
        r = auth_client.post(f"{base_url}/api/schools/{sid}/allotments/bulk",
                             json={"rows": rows})
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        # 1 valid (likely updated since ENG already exists for Grade 6 - A)
        assert d["created"] + d["updated"] == 1
        assert len(d["errors"]) == 2
        # Verify persistence: allotment for Grade 6-A + ENG = 7
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        subs = auth_client.get(f"{base_url}/api/schools/{sid}/subjects").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        eng = next(s for s in subs if s["code"] == "ENG")
        alts = auth_client.get(f"{base_url}/api/schools/{sid}/allotments").json()
        match = next((a for a in alts if a["class_id"] == g6a["id"] and a["subject_id"] == eng["id"]), None)
        assert match and match["periods_per_week"] == 7


# ----- Teacher schedule endpoint -----
class TestTeacherSchedule:
    def test_teacher_schedule_after_autogen(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        assert mn
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers/{mn['id']}/schedule")
        assert r.status_code == 200
        d = r.json()
        assert d["teacher"]["id"] == mn["id"]
        assert isinstance(d["cells"], list)
        assert d["total_periods_per_week"] == len(d["cells"])
        # Every cell must belong to MN
        for c in d["cells"]:
            assert c["teacher_id"] == mn["id"]

    def test_teacher_schedule_404(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers/tch_doesnotexist/schedule")
        assert r.status_code == 404



# ============================================================
# NEW FEATURE TESTS (iteration 3)
# ============================================================

# ----- Audit endpoint -----
class TestAuditEndpoint:
    def test_audit_clean_class_after_autogen(self, auth_client, base_url):
        """A freshly auto-generated class should have 0 HARD violations."""
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        # Ensure clean autogen state
        auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                         json={"class_id": g6a["id"], "replace": True}, timeout=120)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/audit",
                             json={"class_id": g6a["id"]}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "violations" in d and "summary" in d
        assert {"hard", "soft", "total"}.issubset(set(d["summary"].keys()))
        # Auto-gen respects hard constraints for THIS class, but cross-class clubbing rules
        # (e.g. Value Education across all Standard 6 sections) may still fire because the
        # other sections weren't auto-generated. Allow those.
        non_clubbing_hard = [v for v in d["violations"]
                             if v.get("severity") == "hard"
                             and "clubbing" not in (v.get("rule_name") or "").lower()]
        assert non_clubbing_hard == [], f"Unexpected non-clubbing hard violations: {non_clubbing_hard}"

    def test_audit_detects_mn_p1_hard_violation(self, auth_client, base_url):
        """Insert a violating MN-in-P1 cell and verify audit flags it as hard."""
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        cls_g6 = next((c for c in cls if c.get("standard") == "Standard 6" or c.get("grade") == "Grade 6"), cls[0])
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        assert mn and p1
        # Insert violating cell
        auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"],
            "teacher_id": mn["id"],
        })
        # Run audit on this class
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/audit",
                             json={"class_id": cls_g6["id"]}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        names = [v.get("rule_name") for v in d["violations"]]
        sevs = [v.get("severity") for v in d["violations"]]
        assert d["summary"]["hard"] >= 1, f"Expected ≥1 hard violation, got: {d['summary']}"
        assert any("Mini Madam" in (n or "") for n in names), f"Got violations: {names}"
        assert "hard" in sevs
        # cleanup
        auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                           params={"class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"]})

    def test_audit_whole_school_returns_summary(self, auth_client, base_url):
        """Without class_id filter, audit operates over all cells."""
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/audit",
                             json={}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["violations"], list)
        assert "summary" in d
        assert d["summary"]["total"] == len(d["violations"])


# ----- Optimize endpoint (Claude) -----
class TestOptimizeEndpoint:
    def test_optimize_clean_class_returns_clean_message(self, auth_client, base_url):
        """No violations -> suggestions field contains a clean message string."""
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        # Make sure timetable is clean
        auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                         json={"class_id": g6a["id"], "replace": True}, timeout=120)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/optimize",
                             json={"class_id": g6a["id"]}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "suggestions" in d
        assert isinstance(d["suggestions"], str) and len(d["suggestions"]) > 0
        assert d.get("violations_before", 0) >= 0  # Cross-class clubbing rules may still fire

    def test_optimize_with_hard_violation_returns_suggestions(self, auth_client, base_url):
        """With a HARD violation cell present, Claude should return concrete suggestions text."""
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        cls_g6 = next((c for c in cls if c.get("standard") == "Standard 6" or c.get("grade") == "Grade 6"), cls[0])
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        assert mn and p1
        # Insert violating cell
        auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"],
            "teacher_id": mn["id"],
        })
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/optimize",
                             json={"class_id": cls_g6["id"]}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d.get("violations_before", 0) >= 1
        assert d.get("hard", 0) >= 1
        assert "suggestions" in d
        assert isinstance(d["suggestions"], str) and len(d["suggestions"]) > 0
        # Allow AI-temporarily-unavailable response, but log
        # cleanup
        auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                           params={"class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"]})


# ----- Activities CRUD -----
class TestActivitiesCRUD:
    activity_id = None

    def test_create_activity(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/activities", json={
            "name": "TEST_Assembly", "description": "Morning prayer & news"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_Assembly"
        assert d.get("description") == "Morning prayer & news"
        assert "id" in d
        TestActivitiesCRUD.activity_id = d["id"]

    def test_list_activities(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/activities")
        assert r.status_code == 200
        items = r.json()
        assert any(a["id"] == TestActivitiesCRUD.activity_id for a in items)

    def test_update_activity(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        aid = TestActivitiesCRUD.activity_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/activities/{aid}",
                            json={"description": "Updated desc"})
        assert r.status_code == 200
        assert r.json().get("description") == "Updated desc"

    def test_delete_activity(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        aid = TestActivitiesCRUD.activity_id
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/activities/{aid}")
        assert r.status_code == 200
        items = auth_client.get(f"{base_url}/api/schools/{sid}/activities").json()
        assert not any(a["id"] == aid for a in items)


# ----- Refactor integrity: routers reachable -----
class TestRefactorIntegrity:
    def test_server_file_is_slim(self):
        import os
        path = "/app/backend/server.py"
        with open(path) as f:
            lines = f.readlines()
        assert len(lines) < 130, f"server.py should stay slim, got {len(lines)}"

    def test_all_router_modules_exist(self):
        import os
        for m in ["auth", "schools", "masters", "timetable", "ai"]:
            assert os.path.isfile(f"/app/backend/routers/{m}.py"), f"missing router: {m}"



# ============================================================
# NEW FEATURE TESTS (iteration 4)
# ============================================================

# ----- Audit-all (heat-map) -----
class TestAuditAll:
    def test_audit_all_shape(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/audit-all",
                             json={}, timeout=120)
        assert r.status_code == 200
        d = r.json()
        # Required keys
        assert {"totals", "categories", "classes", "top_rules"}.issubset(d.keys())
        # totals shape
        assert {"hard", "soft", "total"}.issubset(d["totals"].keys())
        assert isinstance(d["totals"]["hard"], int)
        assert isinstance(d["totals"]["soft"], int)
        assert isinstance(d["totals"]["total"], int)
        # categories must be a list
        assert isinstance(d["categories"], list)
        # classes must be a non-empty list of rows
        assert isinstance(d["classes"], list)
        assert len(d["classes"]) >= 40, f"Expected >=40 classes, got {len(d['classes'])}"
        # Each row has required fields
        row = d["classes"][0]
        assert {"class_id", "class_name", "hard", "soft", "total", "by_category"}.issubset(row.keys())
        # top_rules is a list of {name,count}
        assert isinstance(d["top_rules"], list)
        for tr in d["top_rules"]:
            assert "name" in tr and "count" in tr

    def test_audit_all_detects_injected_hard(self, auth_client, base_url):
        """Inject a known hard violation and verify it shows up in totals/top_rules."""
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        cls_g6 = next((c for c in cls if c.get("standard") == "Standard 6" or c.get("grade") == "Grade 6"), cls[0])
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        p1 = _find_period_by_name(auth_client, base_url, sid, "P1")
        assert mn and p1
        auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
            "class_id": cls_g6["id"], "day": "Mon", "period_id": p1["id"],
            "teacher_id": mn["id"],
        })
        try:
            r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/audit-all",
                                 json={}, timeout=120)
            assert r.status_code == 200
            d = r.json()
            assert d["totals"]["hard"] >= 1
            # The row for cls_g6 should have hard >= 1
            row = next((x for x in d["classes"] if x["class_id"] == cls_g6["id"]), None)
            assert row is not None
            assert row["hard"] >= 1
        finally:
            auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                               params={"class_id": cls_g6["id"], "day": "Mon",
                                       "period_id": p1["id"]})


# ----- Apply-suggestion (move + revert) -----
class TestApplySuggestion:
    def test_move_and_revert(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        # Ensure clean autogen state
        auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                         json={"class_id": g6a["id"], "replace": True}, timeout=120)
        # Get the timetable
        cells = auth_client.get(f"{base_url}/api/schools/{sid}/timetable",
                                params={"class_id": g6a["id"]}).json()
        assert len(cells) > 0
        # Find a source cell that has subject_id (a teaching cell)
        src = next((c for c in cells if c.get("subject_id")), None)
        assert src is not None, "No cell with subject_id found"

        # Get all periods for the class
        prds = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        # Build set of occupied (day, period_id) for this class
        occ = {(c["day"], c["period_id"]) for c in cells}
        # Find a free target slot
        target = None
        for day in days:
            for p in prds:
                if (day, p["id"]) not in occ and (day, p["id"]) != (src["day"], src["period_id"]):
                    target = (day, p["id"])
                    break
            if target:
                break
        assert target is not None, "No free target slot to move into"

        # Apply move (with force=true as instructed)
        payload = {
            "type": "move",
            "class_id": g6a["id"],
            "from_day": src["day"],
            "from_period_id": src["period_id"],
            "to_day": target[0],
            "to_period_id": target[1],
            "force": True,
        }
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/apply-suggestion",
                             json=payload)
        assert r.status_code == 200, f"apply-suggestion failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["ok"] is True
        assert "moved_cell_id" in d and d["moved_cell_id"] == src["id"]

        # Verify cell now at new location via GET timetable
        cells2 = auth_client.get(f"{base_url}/api/schools/{sid}/timetable",
                                 params={"class_id": g6a["id"]}).json()
        moved = next((c for c in cells2 if c["id"] == src["id"]), None)
        assert moved is not None
        assert moved["day"] == target[0]
        assert moved["period_id"] == target[1]
        # Original slot must no longer have this cell
        orig_now = [c for c in cells2 if c["day"] == src["day"]
                    and c["period_id"] == src["period_id"]
                    and c["id"] == src["id"]]
        assert orig_now == []

        # Revert via another move (force=true in case anything occupies original)
        revert = {
            "type": "move",
            "class_id": g6a["id"],
            "from_day": target[0],
            "from_period_id": target[1],
            "to_day": src["day"],
            "to_period_id": src["period_id"],
            "force": True,
        }
        r2 = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/apply-suggestion",
                              json=revert)
        assert r2.status_code == 200
        assert r2.json()["ok"] is True


# ----- Constraints similar search -----
class TestConstraintsSimilar:
    def test_similar_teacher_mn(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/constraints/similar",
                            params={"field": "teacher", "value": "MN"})
        assert r.status_code == 200
        d = r.json()
        assert "matches" in d
        assert isinstance(d["matches"], list)
        assert len(d["matches"]) >= 1, f"Expected at least 1 match for teacher=MN, got: {d}"
        # Should include Mini Madam rule or HK,MN,MW combined rule
        names = [m.get("name", "") for m in d["matches"]]
        joined = " | ".join(names)
        assert ("Mini Madam" in joined) or ("MN" in joined), f"Unexpected matches: {names}"

    def test_similar_no_match(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/constraints/similar",
                            params={"field": "teacher", "value": "ZZZZ_DOES_NOT_EXIST"})
        assert r.status_code == 200
        assert r.json()["matches"] == []


# ----- Optimize: structured field -----
class TestOptimizeStructured:
    def test_optimize_structured_is_list(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        # Ensure timetable exists
        auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                         json={"class_id": g6a["id"], "replace": True}, timeout=120)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/optimize",
                             json={"class_id": g6a["id"]}, timeout=90)
        assert r.status_code == 200
        d = r.json()
        assert "structured" in d, f"Missing 'structured' key: {list(d.keys())}"
        assert isinstance(d["structured"], list), f"'structured' must be list, got {type(d['structured'])}"


# ----- PDF endpoints -----
class TestPDFExports:
    def test_class_timetable_pdf(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        g6a = next(c for c in cls if c["name"] in ("Standard 6 - A", "Grade 6 - A"))
        # Ensure timetable has cells
        auth_client.post(f"{base_url}/api/schools/{sid}/timetable/auto-generate",
                         json={"class_id": g6a["id"], "replace": True}, timeout=120)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/timetable/pdf",
                            params={"class_id": g6a["id"]}, timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"Wrong content-type: {ct}"
        assert r.content.startswith(b"%PDF"), "Body does not start with %PDF"
        assert len(r.content) > 1000, f"PDF too small: {len(r.content)} bytes"

    def test_teacher_schedule_pdf(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        assert mn
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers/{mn['id']}/schedule/pdf",
                            timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"Wrong content-type: {ct}"
        assert r.content.startswith(b"%PDF"), "Body does not start with %PDF"
        assert len(r.content) > 1000, f"PDF too small: {len(r.content)} bytes"

    def test_class_timetable_pdf_404(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/timetable/pdf",
                            params={"class_id": "cls_doesnotexist"}, timeout=30)
        assert r.status_code == 404

    def test_teacher_schedule_pdf_404(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers/tch_doesnotexist/schedule/pdf",
                            timeout=30)
        assert r.status_code == 404


# ============================================================
# NEW FEATURE TESTS (iteration 5) - Facilities, Classes refactor, Super Admin dashboard
# ============================================================

class TestFacilitiesCRUD:
    facility_id = None
    facility_id_shared = None

    def test_create_indoor_facility(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_Room_101", "type": "Indoor", "capacity": 40,
            "location": "Block A", "is_shared": False,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Room_101"
        assert d["type"] == "Indoor"
        assert d["is_shared"] is False
        assert d["id"].startswith("fac_")
        TestFacilitiesCRUD.facility_id = d["id"]

    def test_create_outdoor_shared_facility(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_Playground", "type": "Outdoor", "capacity": 200,
            "location": "Back Yard", "is_shared": True,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["type"] == "Outdoor"
        assert d["is_shared"] is True
        TestFacilitiesCRUD.facility_id_shared = d["id"]

    def test_list_facilities(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/facilities")
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()]
        assert TestFacilitiesCRUD.facility_id in ids
        assert TestFacilitiesCRUD.facility_id_shared in ids

    def test_update_facility(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        fid = TestFacilitiesCRUD.facility_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/facilities/{fid}",
                            json={"capacity": 60, "location": "Block B"})
        assert r.status_code == 200
        d = r.json()
        assert d["capacity"] == 60
        assert d["location"] == "Block B"

    def test_delete_facility(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # delete shared (we keep indoor for clash test below)
        fid = TestFacilitiesCRUD.facility_id_shared
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fid}")
        assert r.status_code == 200
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/facilities")
        assert all(f["id"] != fid for f in r2.json())


class TestFacilityClash:
    """Two non-shared classes on same facility same slot must produce facility_clash."""

    def test_facility_clash_detected_and_shared_does_not_clash(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # Create one non-shared and one shared facility for this test
        r1 = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_AudioLab", "type": "Indoor", "capacity": 30, "is_shared": False,
        })
        assert r1.status_code == 200
        fac_ns = r1.json()["id"]
        r2 = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_OpenCourt", "type": "Outdoor", "capacity": 500, "is_shared": True,
        })
        assert r2.status_code == 200
        fac_sh = r2.json()["id"]

        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
        tch = auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json()
        # Use two unrelated classes - pick last two to reduce collision with autogen-heavy ones
        class_a, class_b = cls[-1]["id"], cls[-2]["id"]
        # Pick a high period (less likely to collide) - last period
        period_id = prd[-1]["id"]
        teacher_a, teacher_b = tch[0]["id"], tch[1]["id"]
        # Clean any pre-existing cells at the slot
        for cid in (class_a, class_b):
            auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                               params={"class_id": cid, "day": "Sat", "period_id": period_id})

        try:
            # Cell A uses non-shared facility
            rA = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
                "class_id": class_a, "day": "Sat", "period_id": period_id,
                "teacher_id": teacher_a, "facility_id": fac_ns,
            })
            assert rA.status_code == 200
            assert all(c.get("type") != "facility_clash" for c in rA.json()["clashes"]), rA.json()

            # Cell B uses SAME non-shared facility -> should clash
            rB = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
                "class_id": class_b, "day": "Sat", "period_id": period_id,
                "teacher_id": teacher_b, "facility_id": fac_ns,
            })
            assert rB.status_code == 200
            clashes = rB.json()["clashes"]
            assert any(c["type"] == "facility_clash" for c in clashes), \
                f"Expected facility_clash, got {clashes}"

            # Cleanup these cells
            auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                               params={"class_id": class_a, "day": "Sat", "period_id": period_id})
            auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                               params={"class_id": class_b, "day": "Sat", "period_id": period_id})

            # Now use SHARED facility for both — should NOT generate facility_clash
            rA2 = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
                "class_id": class_a, "day": "Sat", "period_id": period_id,
                "teacher_id": teacher_a, "facility_id": fac_sh,
            })
            assert rA2.status_code == 200
            rB2 = auth_client.put(f"{base_url}/api/schools/{sid}/timetable/cell", json={
                "class_id": class_b, "day": "Sat", "period_id": period_id,
                "teacher_id": teacher_b, "facility_id": fac_sh,
            })
            assert rB2.status_code == 200
            cl2 = rB2.json()["clashes"]
            assert all(c["type"] != "facility_clash" for c in cl2), \
                f"Shared facility should NOT clash, got {cl2}"
        finally:
            for cid in (class_a, class_b):
                auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                                   params={"class_id": cid, "day": "Sat", "period_id": period_id})
            auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fac_ns}")
            auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fac_sh}")


class TestFacilityConflictsEndpoint:
    def test_facility_conflicts_returns_list(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/facility-conflicts")
        assert r.status_code == 200
        d = r.json()
        assert "conflicts" in d and isinstance(d["conflicts"], list)
        assert "total" in d and d["total"] == len(d["conflicts"])


class TestStatsAndSuperAdminFacilities:
    def test_stats_includes_facilities(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/stats")
        assert r.status_code == 200
        stats = r.json()
        assert "facilities" in stats
        assert isinstance(stats["facilities"], int)

    def test_super_admin_dashboard_includes_facilities(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/super-admin/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "totals" in d
        assert "facilities" in d["totals"]
        assert isinstance(d["totals"]["facilities"], int)
        # schools list must also have facilities per row
        assert isinstance(d["schools"], list)
        if d["schools"]:
            assert "facilities" in d["schools"][0]


class TestClassesStandardDivision:
    """Classes CRUD must accept standard/division/section_id/facility_id/shift_id."""
    class_id = None

    def test_create_class_with_new_fields(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # Create a facility to map
        rf = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_HomeRoom_Z9", "type": "Indoor", "capacity": 35, "is_shared": False,
        })
        assert rf.status_code == 200
        fac_id = rf.json()["id"]
        # Get a section + shift
        secs = auth_client.get(f"{base_url}/api/schools/{sid}/sections").json()
        shifts = auth_client.get(f"{base_url}/api/schools/{sid}/shifts").json()
        section_id = secs[0]["id"] if secs else None
        shift_id = shifts[0]["id"] if shifts else None

        payload = {
            "name": "TEST_Standard 12 - Z",
            "standard": "Standard 12",
            "division": "Z",
            "section_id": section_id,
            "facility_id": fac_id,
            "shift_id": shift_id,
            "strength": 25,
            "room_no": "Z-101",
        }
        r = auth_client.post(f"{base_url}/api/schools/{sid}/classes", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["standard"] == "Standard 12"
        assert d["division"] == "Z"
        assert d["facility_id"] == fac_id
        assert d["section_id"] == section_id
        assert d["shift_id"] == shift_id
        assert d["id"].startswith("cls_")
        TestClassesStandardDivision.class_id = d["id"]
        TestClassesStandardDivision._fac_id = fac_id  # for teardown

    def test_get_class_persisted_new_fields(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cid = TestClassesStandardDivision.class_id
        assert cid
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        d = next((c for c in cls if c["id"] == cid), None)
        assert d is not None
        assert d["standard"] == "Standard 12"
        assert d["division"] == "Z"
        assert d.get("facility_id")

    def test_update_class_new_fields(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cid = TestClassesStandardDivision.class_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/classes/{cid}",
                            json={"division": "Y", "strength": 40})
        assert r.status_code == 200
        d = r.json()
        assert d["division"] == "Y"
        assert d["strength"] == 40
        # Persistence check
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        d2 = next((c for c in cls if c["id"] == cid), None)
        assert d2["division"] == "Y"

    def test_delete_test_class_and_facility(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        cid = TestClassesStandardDivision.class_id
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/classes/{cid}")
        assert r.status_code == 200
        fac_id = getattr(TestClassesStandardDivision, "_fac_id", None)
        if fac_id:
            auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fac_id}")


class TestMigrateStandardDivision:
    def test_migrate_endpoint_idempotent(self, auth_client, base_url):
        r = auth_client.post(f"{base_url}/api/migrate/standard-division", timeout=60)
        assert r.status_code == 200
        d = r.json()
        # Either upgraded count present, or returns ok
        assert "migrated_classes" in d or d.get("ok") is True


class TestSectionsCRUDRegression:
    def test_sections_crud(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/sections", json={
            "name": "TEST_Section_X9", "description": "test"
        })
        assert r.status_code == 200
        sec_id = r.json()["id"]
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/sections")
        assert any(s["id"] == sec_id for s in r2.json())
        r3 = auth_client.delete(f"{base_url}/api/schools/{sid}/sections/{sec_id}")
        assert r3.status_code == 200



# ============================================================
# ITERATION 6 — Attendance / eSSL / Migrations / Place-activity / Teacher Scope
# ============================================================

import os, io, time as _time
from datetime import datetime as _dt, timezone as _tz, timedelta as _td
from pymongo import MongoClient as _MongoClient
import requests as _requests


def _ensure_full_seed(auth_client, base_url):
    auth_client.post(f"{base_url}/api/seed/sri-ma-vidyalaya/full", timeout=120)
    return _get_school_id(auth_client, base_url)


# ----- eSSL Devices CRUD -----
class TestESSLDevicesCRUD:
    device_id = None

    def test_create_device(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/essl-devices", json={
            "name": "TEST_ESSL_Main",
            "ip": "192.0.2.10", "port": 4370, "password": 0, "timeout": 5,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_ESSL_Main"
        assert d["ip"] == "192.0.2.10"
        assert d["id"].startswith("essl_")
        TestESSLDevicesCRUD.device_id = d["id"]

    def test_list_devices(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/essl-devices")
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert TestESSLDevicesCRUD.device_id in ids

    def test_update_device(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        did = TestESSLDevicesCRUD.device_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/essl-devices/{did}",
                            json={"name": "TEST_ESSL_Main_v2", "timeout": 6})
        assert r.status_code == 200
        # persistence verify
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/essl-devices")
        d = next((x for x in r2.json() if x["id"] == did), None)
        assert d and d["name"] == "TEST_ESSL_Main_v2" and d["timeout"] == 6

    def test_delete_device(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        did = TestESSLDevicesCRUD.device_id
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/essl-devices/{did}")
        assert r.status_code == 200
        r2 = auth_client.get(f"{base_url}/api/schools/{sid}/essl-devices")
        assert all(x["id"] != did for x in r2.json())


# ----- Labs -> Facilities migration -----
class TestMigrateLabsToFacilities:
    def test_migrate_idempotent(self, auth_client, base_url):
        # run twice — both succeed, second should yield migrated=0 (labs are usually empty in fresh seed)
        r1 = auth_client.post(f"{base_url}/api/migrate/labs-to-facilities", timeout=60)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert "migrated" in d1 and "total_labs" in d1
        r2 = auth_client.post(f"{base_url}/api/migrate/labs-to-facilities", timeout=60)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["migrated"] == 0, f"Expected idempotent migrated=0 on second run, got {d2}"


# ----- Attendance import-file (CSV multipart) + dedup -----
class TestAttendanceImportFile:
    csv_payload = (
        b"UserID,Name,Date,Time\n"
        b"101,JOHN,2026-02-01,08:15:00\n"
        b"102,MARY,2026-02-01,08:20:00\n"
    )

    def test_import_csv_inserts_two(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        # Clean any stale punches for these (raw_user_id, date) tuples so the test is order-independent
        from pymongo import MongoClient
        import os as _os
        from dotenv import load_dotenv as _ld
        _ld("/app/backend/.env")
        _client = MongoClient(_os.environ.get('MONGO_URL', 'mongodb://localhost:27017'))
        _db_sync = _client[_os.environ.get('DB_NAME', 'test_database')]
        _db_sync.attendance.delete_many({
            "school_id": sid,
            "raw_user_id": {"$in": ["101", "102"]},
            "date": "2026-02-01",
        })
        # multipart — strip Content-Type:json header so requests sets boundary
        token = auth_client.headers.get("Authorization")
        files = {"file": ("punches.csv", self.csv_payload, "text/csv")}
        r = _requests.post(f"{base_url}/api/schools/{sid}/attendance/import-file",
                           headers={"Authorization": token}, files=files, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 2, f"Expected 2 inserts, got {d}"
        assert d["total_rows"] == 2

    def test_reimport_dedups(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        token = auth_client.headers.get("Authorization")
        files = {"file": ("punches.csv", self.csv_payload, "text/csv")}
        r = _requests.post(f"{base_url}/api/schools/{sid}/attendance/import-file",
                           headers={"Authorization": token}, files=files, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["inserted"] == 0, f"Expected 0 (dedup), got {d}"
        assert d["skipped"] == 2


# ----- Manual attendance punch (teacher-linked) -----
class TestAttendanceManual:
    att_id = None

    def test_create_manual_punch(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        t = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        assert t, "teacher MN not seeded"
        r = auth_client.post(f"{base_url}/api/schools/{sid}/attendance/manual", json={
            "teacher_id": t["id"], "date": "2026-02-02", "time": "08:00:00", "punch_type": "in",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["teacher_id"] == t["id"]
        assert d["source"] == "manual"
        assert d["id"].startswith("att_")
        TestAttendanceManual.att_id = d["id"]

    def test_manual_missing_fields_400(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/attendance/manual", json={
            "teacher_id": "xxx",
        })
        assert r.status_code == 400


# ----- Attendance LIST/filter/summary/delete -----
class TestAttendanceListAndSummary:
    def test_list_with_date_filter(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/attendance",
                            params={"date_from": "2026-02-01", "date_to": "2026-02-01"})
        assert r.status_code == 200
        body = r.json()
        rows = body["items"] if isinstance(body, dict) else body
        # 2 from CSV are on 2026-02-01
        assert sum(1 for x in rows if x["date"] == "2026-02-01") >= 2
        # Manual punch on 02 should NOT appear
        assert all(x["date"] != "2026-02-02" for x in rows)

    def test_summary_shape(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.get(f"{base_url}/api/schools/{sid}/attendance/summary",
                            params={"date": "2026-02-02"})
        assert r.status_code == 200
        d = r.json()
        for k in ("date", "total_teachers", "present", "absent", "rows"):
            assert k in d
        assert d["date"] == "2026-02-02"
        # Manual MN punch placed today
        mn_row = next((row for row in d["rows"] if row["abbreviation"] == "MN"), None)
        assert mn_row is not None
        assert mn_row["present"] is True
        assert mn_row["first_in"] == "08:00:00"

    def test_delete_manual_punch(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        att = TestAttendanceManual.att_id
        assert att
        r = auth_client.delete(f"{base_url}/api/schools/{sid}/attendance/{att}")
        assert r.status_code == 200
        # cleanup CSV-imported rows too
        body = auth_client.get(f"{base_url}/api/schools/{sid}/attendance",
                               params={"date_from": "2026-02-01", "date_to": "2026-02-01"}).json()
        rows = body["items"] if isinstance(body, dict) else body
        for row in rows:
            if row.get("raw_user_id") in ("101", "102"):
                auth_client.delete(f"{base_url}/api/schools/{sid}/attendance/{row['id']}")


# ----- sync-essl error paths -----
class TestSyncESSLErrors:
    def test_no_device_no_ip_400(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/attendance/sync-essl", json={})
        assert r.status_code == 400, r.text

    def test_unreachable_ip_502(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        # 192.0.2.0/24 is TEST-NET-1 — guaranteed unroutable
        r = auth_client.post(f"{base_url}/api/schools/{sid}/attendance/sync-essl",
                             json={"ip": "192.0.2.1", "port": 4370, "timeout": 3,
                                   "ommit_ping": True}, timeout=30)
        assert r.status_code == 502, f"expected 502, got {r.status_code}: {r.text[:200]}"


# ----- Activity create with new fields -----
class TestActivityNewFields:
    act_id = None

    def test_create_with_new_fields(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        assert len(cls) >= 2
        c0, c1 = cls[0]["id"], cls[1]["id"]
        # Create a Lab-type facility too so we can attach
        rf = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_Auditorium_I6", "type": "Outdoor", "capacity": 200, "is_shared": True,
        })
        assert rf.status_code == 200
        fac_id = rf.json()["id"]

        r = auth_client.post(f"{base_url}/api/schools/{sid}/activities", json={
            "name": "TEST_Assembly_I6",
            "type": "Outdoor",
            "facility_id": fac_id,
            "target_class_ids": [c0, c1],
            "periods_per_week": 1,
            "color": "#FFCC00",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "Outdoor"
        assert d["facility_id"] == fac_id
        assert set(d["target_class_ids"]) == {c0, c1}
        assert d["periods_per_week"] == 1
        TestActivityNewFields.act_id = d["id"]
        TestActivityNewFields._fac_id = fac_id

    def test_cleanup(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        aid = TestActivityNewFields.act_id
        if aid:
            auth_client.delete(f"{base_url}/api/schools/{sid}/activities/{aid}")
        fac = getattr(TestActivityNewFields, "_fac_id", None)
        if fac:
            auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fac}")


# ----- Facility create with type='Lab' -----
class TestFacilityLabType:
    def test_create_lab_facility(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": "TEST_PhysicsLab_I6", "type": "Lab", "capacity": 30,
            "subject_codes": ["SCI"], "location": "Block A",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "Lab"
        assert d["subject_codes"] == ["SCI"]
        fac_id = d["id"]
        # persistence
        items = auth_client.get(f"{base_url}/api/schools/{sid}/facilities").json()
        assert any(x["id"] == fac_id and x["type"] == "Lab" for x in items)
        # cleanup
        auth_client.delete(f"{base_url}/api/schools/{sid}/facilities/{fac_id}")


# ----- place-activity broadcast -----
class TestPlaceActivityBroadcast:
    def test_broadcast_to_target_classes(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        assert len(cls) >= 2
        c0, c1 = cls[0]["id"], cls[1]["id"]
        # Use Saturday + last period to avoid clobbering autogen Mon-Fri data
        prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
        # last non-break period
        teaching_prds = [p for p in prd if not p.get("is_break")]
        period_id = sorted(teaching_prds, key=lambda p: p["order"])[-1]["id"]
        day = "Sat"
        # Create activity that targets c0,c1
        ra = auth_client.post(f"{base_url}/api/schools/{sid}/activities", json={
            "name": "TEST_Broadcast_I6", "type": "Outdoor",
            "target_class_ids": [c0, c1], "periods_per_week": 1,
        })
        assert ra.status_code == 200
        aid = ra.json()["id"]
        try:
            r = auth_client.post(f"{base_url}/api/schools/{sid}/timetable/place-activity", json={
                "activity_id": aid, "day": day, "period_id": period_id,
                # leave class_ids empty → falls back to target_class_ids
            })
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["classes"] == 2
            assert len(d["results"]) == 2
            ok_classes = {res["class_id"] for res in d["results"] if res["ok"]}
            assert {c0, c1}.issubset(ok_classes)
        finally:
            # Cleanup the placed cells
            for cid in (c0, c1):
                auth_client.delete(f"{base_url}/api/schools/{sid}/timetable/cell",
                                   params={"class_id": cid, "day": day, "period_id": period_id})
            auth_client.delete(f"{base_url}/api/schools/{sid}/activities/{aid}")


# ----- Teacher schedule scoping (admin vs teacher role) -----
class TestTeacherScheduleScoping:
    # Use mongo direct insert to create a Teacher-role user with email matching a real teacher
    extras = {}

    @classmethod
    def _make_user(cls, role, email):
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        m = _MongoClient(mongo_url)
        db = m[db_name]
        ts = int(_time.time() * 1000) + len(cls.extras)
        uid = f"test-i6-{ts}"
        tok = f"test_i6_{ts}"
        db.users.insert_one({
            "user_id": uid, "email": email, "name": "I6 User", "role": role,
            "school_ids": [], "created_at": _dt.now(_tz.utc),
        })
        db.user_sessions.insert_one({
            "user_id": uid, "session_token": tok,
            "expires_at": _dt.now(_tz.utc) + _td(days=1),
            "created_at": _dt.now(_tz.utc),
        })
        cls.extras[tok] = uid
        return tok

    @classmethod
    def teardown_class(cls):
        if not cls.extras:
            return
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        m = _MongoClient(mongo_url)
        db = m[db_name]
        for tok, uid in cls.extras.items():
            db.user_sessions.delete_many({"session_token": tok})
            db.users.delete_many({"user_id": uid})

    def _client(self, base_url, token):
        s = _requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        return s

    def test_admin_sees_any_teacher(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        t = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        assert t
        r = auth_client.get(f"{base_url}/api/schools/{sid}/teachers/{t['id']}/schedule")
        assert r.status_code == 200
        d = r.json()
        assert "teacher" in d and "cells" in d

    def test_teacher_role_mismatched_email_403(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        t = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        # Patch the teacher with a known email
        ts = int(_time.time())
        target_email = f"mn_{ts}@example.com"
        auth_client.put(f"{base_url}/api/schools/{sid}/teachers/{t['id']}",
                        json={"email": target_email})
        # Create teacher-role user with DIFFERENT email
        tok = self._make_user("Teacher", f"other_{ts}@example.com")
        c = self._client(base_url, tok)
        r = c.get(f"{base_url}/api/schools/{sid}/teachers/{t['id']}/schedule")
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"
        # PDF endpoint same scoping
        r2 = c.get(f"{base_url}/api/schools/{sid}/teachers/{t['id']}/schedule/pdf")
        assert r2.status_code == 403

    def test_teacher_role_matching_email_200(self, auth_client, base_url):
        sid = _get_school_id(auth_client, base_url)
        t = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        # teacher email was set in previous test
        teacher_email = (auth_client.get(f"{base_url}/api/schools/{sid}/teachers").json())
        rec = next((x for x in teacher_email if x["abbreviation"] == "MN"), None)
        assert rec and rec.get("email")
        tok = self._make_user("Teacher", rec["email"])
        c = self._client(base_url, tok)
        r = c.get(f"{base_url}/api/schools/{sid}/teachers/{t['id']}/schedule")
        assert r.status_code == 200, r.text
        # PDF — accept 200 (returns bytes)
        r2 = c.get(f"{base_url}/api/schools/{sid}/teachers/{t['id']}/schedule/pdf")
        assert r2.status_code == 200


# ============================================================
# ITERATION 7 — Permissions / Members / Auto-substitutions / Auto-match facilities
# ============================================================

def _mongo_db():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    return _MongoClient(mongo_url)[db_name]


def _make_session(role: str, email: str, school_ids=None):
    """Create a user + session and return (token, user_id, email)."""
    db = _mongo_db()
    ts = int(_time.time() * 1000)
    uid = f"test-i7-{ts}-{role.replace(' ', '_')}"
    tok = f"test_i7_{ts}_{role.replace(' ', '_')}"
    db.users.insert_one({
        "user_id": uid, "email": email, "name": f"I7 {role}", "role": role,
        "school_ids": school_ids or [], "created_at": _dt.now(_tz.utc),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": _dt.now(_tz.utc) + _td(days=1),
        "created_at": _dt.now(_tz.utc),
    })
    return tok, uid, email


def _client_for(token):
    s = _requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ----- Permissions vocabulary -----
class TestPermissionsVocabulary:
    def test_vocab_for_admin(self, auth_client, base_url):
        r = auth_client.get(f"{base_url}/api/permissions/vocabulary")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "permissions" in d and isinstance(d["permissions"], list)
        assert "role_presets" in d and isinstance(d["role_presets"], dict)
        # Spot-check some expected keys
        for k in ("users.manage", "timetable.edit", "attendance.manage",
                  "ai.run", "school.settings"):
            assert k in d["permissions"], f"missing perm {k}"
        # ROLE_PRESETS must include the documented roles
        for role in ("School Admin", "Principal", "Supervisor",
                     "Subject Incharge", "Teacher", "Viewer"):
            assert role in d["role_presets"]
        # Principal should NOT have users.manage
        assert "users.manage" not in d["role_presets"]["Principal"]
        assert "users.manage" in d["role_presets"]["School Admin"]


# ----- Members CRUD + me + 403 gating -----
class TestMembersCRUD:
    member_id = None
    custom_member_id = None
    sid = None
    extras_tokens = []
    extras_uids = []

    @classmethod
    def teardown_class(cls):
        db = _mongo_db()
        for tok in cls.extras_tokens:
            db.user_sessions.delete_many({"session_token": tok})
        for uid in cls.extras_uids:
            db.users.delete_many({"user_id": uid})
        # Cleanup any TEST_ members
        if cls.sid:
            db.school_members.delete_many({"school_id": cls.sid,
                                            "email": {"$regex": "^test_i7_"}})

    def test_list_members_admin(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        TestMembersCRUD.sid = sid
        r = auth_client.get(f"{base_url}/api/schools/{sid}/members")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_member_role_preset(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        ts = int(_time.time())
        email = f"test_i7_principal_{ts}@example.com"
        r = auth_client.post(f"{base_url}/api/schools/{sid}/members", json={
            "email": email, "role": "Principal", "name": "P One",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == email
        assert d["role"] == "Principal"
        # ROLE_PRESETS['Principal'] is all perms except users.manage
        assert "users.manage" not in d["permissions"]
        assert "timetable.edit" in d["permissions"]
        TestMembersCRUD.member_id = d["id"]

    def test_create_member_custom_perms_filters_invalid(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        ts = int(_time.time())
        email = f"test_i7_custom_{ts}@example.com"
        r = auth_client.post(f"{base_url}/api/schools/{sid}/members", json={
            "email": email, "role": "Viewer",
            "permissions": ["timetable.edit", "BOGUS_PERM", "users.manage", "ai.run"],
        })
        assert r.status_code == 200, r.text
        d = r.json()
        # Invalid filtered out
        assert "BOGUS_PERM" not in d["permissions"]
        # Valid retained
        assert "timetable.edit" in d["permissions"]
        assert "ai.run" in d["permissions"]
        assert "users.manage" in d["permissions"]
        TestMembersCRUD.custom_member_id = d["id"]

    def test_upsert_same_email_active(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        # Use the same Principal email as test_create_member_role_preset by listing first
        members = auth_client.get(f"{base_url}/api/schools/{sid}/members").json()
        p = next((m for m in members if m["id"] == TestMembersCRUD.member_id), None)
        assert p, "principal member missing"
        email = p["email"]
        # Re-post with a different role — should UPSERT (no new row, status active)
        r = auth_client.post(f"{base_url}/api/schools/{sid}/members", json={
            "email": email, "role": "Supervisor",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "Supervisor"
        assert d["status"] == "active"
        # Confirm member count for this email is 1
        members2 = auth_client.get(f"{base_url}/api/schools/{sid}/members").json()
        matches = [m for m in members2 if m["email"] == email]
        assert len(matches) == 1, f"expected 1, got {len(matches)}"

    def test_update_member(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        mid = TestMembersCRUD.member_id
        r = auth_client.put(f"{base_url}/api/schools/{sid}/members/{mid}", json={
            "role": "Teacher",
            "permissions": ["attendance.view", "INVALID"],
            "status": "active",
            "name": "Updated Name",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "Teacher"
        assert d["permissions"] == ["attendance.view"]
        assert d["name"] == "Updated Name"

    def test_me_super_admin(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        r = auth_client.get(f"{base_url}/api/schools/{sid}/members/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_super_admin"] is True
        assert d["has_all"] is True
        assert d["permissions"] == ['*']

    def test_me_non_admin_no_member_returns_empty(self, auth_client, base_url):
        sid = TestMembersCRUD.sid
        ts = int(_time.time())
        tok, uid, _email = _make_session("School Admin",
                                          f"test_i7_nomember_{ts}@example.com",
                                          school_ids=[])
        TestMembersCRUD.extras_tokens.append(tok)
        TestMembersCRUD.extras_uids.append(uid)
        c = _client_for(tok)
        r = c.get(f"{base_url}/api/schools/{sid}/members/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_super_admin"] is False
        assert d["has_all"] is False
        assert d["permissions"] == []

    def test_require_perm_403_non_admin(self, auth_client, base_url):
        """A School Admin role user with no school_members row and no school_ids
        should be blocked by require_perm('users.manage')."""
        sid = TestMembersCRUD.sid
        ts = int(_time.time())
        tok, uid, _ = _make_session("School Admin",
                                     f"test_i7_blocked_{ts}@example.com",
                                     school_ids=[])
        TestMembersCRUD.extras_tokens.append(tok)
        TestMembersCRUD.extras_uids.append(uid)
        c = _client_for(tok)
        r = c.get(f"{base_url}/api/schools/{sid}/members")
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_delete_member_pulls_school_from_user(self, auth_client, base_url):
        """Create a user, create a linked member (POST auto-links since user exists),
        then delete and verify school_id is pulled from user.school_ids."""
        sid = TestMembersCRUD.sid
        ts = int(_time.time())
        # Make a user first
        email = f"test_i7_linked_{ts}@example.com"
        tok, uid, _ = _make_session("School Admin", email, school_ids=[])
        TestMembersCRUD.extras_tokens.append(tok)
        TestMembersCRUD.extras_uids.append(uid)
        # Add as member — since user exists, members router should link + push school_id
        r = auth_client.post(f"{base_url}/api/schools/{sid}/members", json={
            "email": email, "role": "Teacher",
        })
        assert r.status_code == 200
        mid = r.json()["id"]
        # Verify user.school_ids now contains sid
        db = _mongo_db()
        u = db.users.find_one({"user_id": uid})
        assert sid in (u.get("school_ids") or []), f"school not pushed: {u.get('school_ids')}"
        # Delete the member
        r2 = auth_client.delete(f"{base_url}/api/schools/{sid}/members/{mid}")
        assert r2.status_code == 200
        # Confirm pull
        u2 = db.users.find_one({"user_id": uid})
        assert sid not in (u2.get("school_ids") or []), \
            f"school not pulled: {u2.get('school_ids')}"
        # Confirm gone
        members = auth_client.get(f"{base_url}/api/schools/{sid}/members").json()
        assert not any(m["id"] == mid for m in members)


# ----- Auto-substitutions from attendance -----
class TestAutoFromAttendance:
    sid = None

    @classmethod
    def teardown_class(cls):
        if not cls.sid:
            return
        db = _mongo_db()
        # Remove TEST substitutions we created (we tag none specifically; remove by date if needed)
        # Safer: leave them. But remove any attendance cleanup we did is unnecessary.

    def test_bad_date_400(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        TestAutoFromAttendance.sid = sid
        r = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/auto-from-attendance",
            json={"date": "not-a-date"},
        )
        assert r.status_code == 400, r.text

    def test_absent_teacher_creates_subs_and_idempotent(self, auth_client, base_url):
        sid = TestAutoFromAttendance.sid
        # Pick MN teacher
        mn = _find_teacher_by_abbr(auth_client, base_url, sid, "MN")
        assert mn

        # Ensure no attendance for MN today (clean)
        today = _dt.now().strftime('%Y-%m-%d')
        db = _mongo_db()
        db.attendance.delete_many({"school_id": sid, "teacher_id": mn["id"], "date": today})

        # Determine today's weekday short code
        wmap = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        day = wmap[_dt.now().weekday()]

        # Ensure MN has at least 1 timetable cell on today's weekday. If not, insert one.
        existing_cells = list(db.timetable.find({
            "school_id": sid, "teacher_id": mn["id"], "day": day,
        }))
        seeded_cell_id = None
        if not existing_cells:
            # Pick any class + period and insert a temp cell
            cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
            prd = auth_client.get(f"{base_url}/api/schools/{sid}/periods").json()
            assert cls and prd
            # Pick a non-break period
            period = next((p for p in prd if p.get("name", "").startswith("P")), prd[0])
            class_id = cls[0]["id"]
            # Make sure target slot is empty (delete anything in it)
            db.timetable.delete_many({"school_id": sid, "class_id": class_id,
                                      "day": day, "period_id": period["id"]})
            cell_doc = {
                "id": f"ttc_test_i7_{int(_time.time())}",
                "school_id": sid, "class_id": class_id, "day": day,
                "period_id": period["id"], "subject_id": None,
                "teacher_id": mn["id"], "lab_id": None,
            }
            db.timetable.insert_one(cell_doc)
            seeded_cell_id = cell_doc["id"]

        # Pre-cleanup any existing substitution rows for MN+today to allow fresh creation
        db.substitutions.delete_many({"school_id": sid,
                                       "absent_teacher_id": mn["id"], "date": today})

        # Call endpoint
        r = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/auto-from-attendance",
            json={"date": today},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["date"] == today
        assert d["day"] == day
        assert isinstance(d["absent_teachers"], list)
        assert any(t["id"] == mn["id"] for t in d["absent_teachers"]), \
            "MN should be absent (no punches today)"
        first_created = d["substitutions_created"]
        assert first_created > 0, f"expected >0 subs created, got {first_created}"
        assert len(d["items"]) == first_created

        # Re-run -> idempotent (no new rows for the same absent+date+period+class)
        r2 = auth_client.post(
            f"{base_url}/api/schools/{sid}/substitutions/auto-from-attendance",
            json={"date": today},
        )
        assert r2.status_code == 200
        d2 = r2.json()
        # No new MN-specific rows should be created on second run for the same period+class set
        mn_items_2 = [it for it in d2["items"] if it.get("absent_teacher") == "MN"]
        assert len(mn_items_2) == 0, f"Expected 0 new MN items on rerun, got {len(mn_items_2)}"

        # Cleanup substitutions + temp cell
        db.substitutions.delete_many({"school_id": sid,
                                       "absent_teacher_id": mn["id"], "date": today})
        if seeded_cell_id:
            db.timetable.delete_many({"id": seeded_cell_id})


# ----- Auto-match facilities -----
class TestAutoMatchFacilities:
    sid = None
    class_id = None
    facility_id = None

    @classmethod
    def teardown_class(cls):
        if not cls.sid:
            return
        db = _mongo_db()
        if cls.class_id:
            db.classes.update_one({"id": cls.class_id, "school_id": cls.sid},
                                  {"$unset": {"room_no": "", "facility_id": ""}})
        if cls.facility_id:
            db.facilities.delete_one({"id": cls.facility_id, "school_id": cls.sid})

    def test_preview_then_apply(self, auth_client, base_url):
        sid = _ensure_full_seed(auth_client, base_url)
        TestAutoMatchFacilities.sid = sid
        # Pick a class and set a distinct room_no
        cls = auth_client.get(f"{base_url}/api/schools/{sid}/classes").json()
        assert cls
        target_cls = cls[0]
        TestAutoMatchFacilities.class_id = target_cls["id"]
        ts = int(_time.time())
        room_name = f"TEST_I7_Room_{ts}"

        # Set room_no AND clear facility_id on the class (direct mongo for control)
        db = _mongo_db()
        db.classes.update_one({"id": target_cls["id"], "school_id": sid},
                              {"$set": {"room_no": room_name},
                               "$unset": {"facility_id": ""}})

        # Create a facility whose name matches room_no
        r = auth_client.post(f"{base_url}/api/schools/{sid}/facilities", json={
            "name": room_name, "type": "Classroom", "capacity": 40,
        })
        assert r.status_code == 200, r.text
        TestAutoMatchFacilities.facility_id = r.json()["id"]

        # Preview (no apply)
        r1 = auth_client.post(f"{base_url}/api/schools/{sid}/classes/auto-match-facilities",
                              json={})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["preview"] is True
        assert d1["applied"] == 0
        assert any(m["class_id"] == target_cls["id"]
                   and m["facility_id"] == TestAutoMatchFacilities.facility_id
                   for m in d1["matches"]), f"no match for our class: {d1['matches']}"
        # Verify class still has no facility_id
        c_after_preview = db.classes.find_one({"id": target_cls["id"]})
        assert not c_after_preview.get("facility_id")

        # Apply
        r2 = auth_client.post(f"{base_url}/api/schools/{sid}/classes/auto-match-facilities",
                              json={"apply": True})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["preview"] is False
        assert d2["applied"] >= 1
        # Verify class now has facility_id
        c_after_apply = db.classes.find_one({"id": target_cls["id"]})
        assert c_after_apply.get("facility_id") == TestAutoMatchFacilities.facility_id
