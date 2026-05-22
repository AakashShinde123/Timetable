"""Schools CRUD + Sri Ma Vidyalaya seeding + stats."""
from typing import Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Body

from db import db
from deps import get_current_user
from models import (
    School, Teacher, Subject, ClassRoom, Shift, Period, Lab, Activity,
    Constraint, ClassSubjectAllotment, Section, Facility, serialize_doc,
)

router = APIRouter(prefix="/api", tags=["schools"])


@router.get("/schools")
async def list_schools(user: dict = Depends(get_current_user)):
    if user.get('role') == 'Super Admin':
        docs = await db.schools.find({}, {"_id": 0}).to_list(1000)
    else:
        ids = user.get('school_ids', [])
        docs = await db.schools.find({"id": {"$in": ids}}, {"_id": 0}).to_list(1000)
    return [serialize_doc(d) for d in docs]


@router.post("/schools")
async def create_school(payload: Dict[str, Any] = Body(...), user: dict = Depends(get_current_user)):
    school = School(**payload)
    doc = school.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.schools.insert_one(doc)
    await db.users.update_one({"user_id": user['user_id']}, {"$addToSet": {"school_ids": school.id}})
    return serialize_doc(doc)


@router.get("/schools/{school_id}")
async def get_school(school_id: str, user: dict = Depends(get_current_user)):
    doc = await db.schools.find_one({"id": school_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "School not found")
    return serialize_doc(doc)


@router.put("/schools/{school_id}")
async def update_school(school_id: str, payload: Dict[str, Any] = Body(...), user: dict = Depends(get_current_user)):
    payload.pop('id', None); payload.pop('created_at', None)
    await db.schools.update_one({"id": school_id}, {"$set": payload})
    doc = await db.schools.find_one({"id": school_id}, {"_id": 0})
    # If auto-sync fields changed, re-register the cron job
    if doc and any(k in payload for k in ['auto_sync_enabled', 'auto_sync_time', 'auto_sync_times',
                                            'auto_sync_essl_device_id', 'notify_latecomers',
                                            'expected_arrival_time']):
        try:
            from scheduler import register_school_job
            await register_school_job(doc)
        except Exception:
            pass
    return serialize_doc(doc)


@router.post("/schools/{school_id}/autosync/run-now")
async def autosync_run_now(school_id: str, user: dict = Depends(get_current_user)):
    """Trigger today's eSSL pull → auto-suggest substitutes pipeline immediately."""
    from perms import require_perm
    await require_perm(school_id, user, "attendance.manage")
    try:
        from scheduler import trigger_school_now
        await trigger_school_now(school_id)
        return {"ok": True, "school_id": school_id}
    except Exception as e:
        raise HTTPException(500, f"autosync run-now failed: {e}")


@router.delete("/schools/{school_id}")
async def delete_school(school_id: str, user: dict = Depends(get_current_user)):
    await db.schools.delete_one({"id": school_id})
    for col in ["teachers", "subjects", "classes", "labs", "shifts", "periods", "activities",
                "timetable", "constraints", "substitutions", "allotments", "sections",
                "facilities", "essl_devices", "attendance", "school_members", "audit_runs"]:
        await db[col].delete_many({"school_id": school_id})
    return {"ok": True}


@router.get("/schools/{school_id}/stats")
async def school_stats(school_id: str, user: dict = Depends(get_current_user)):
    return {
        "teachers": await db.teachers.count_documents({"school_id": school_id}),
        "subjects": await db.subjects.count_documents({"school_id": school_id}),
        "classes": await db.classes.count_documents({"school_id": school_id}),
        "labs": await db.labs.count_documents({"school_id": school_id}),
        "shifts": await db.shifts.count_documents({"school_id": school_id}),
        "periods": await db.periods.count_documents({"school_id": school_id}),
        "activities": await db.activities.count_documents({"school_id": school_id}),
        "constraints": await db.constraints.count_documents({"school_id": school_id}),
        "allotments": await db.allotments.count_documents({"school_id": school_id}),
        "sections": await db.sections.count_documents({"school_id": school_id}),
        "facilities": await db.facilities.count_documents({"school_id": school_id}),
        "timetable_cells": await db.timetable.count_documents({"school_id": school_id}),
    }


@router.post("/migrate/standard-division")
async def migrate_standard_division(user: dict = Depends(get_current_user)):
    """One-time migration: rename ClassRoom.grade → standard, ClassRoom.section → division for ALL schools."""
    cls_collection = db.classes
    docs = await cls_collection.find({}).to_list(20000)
    migrated = 0
    for d in docs:
        update = {}
        if 'grade' in d and 'standard' not in d:
            update['standard'] = (d.get('grade') or '').replace('Grade ', 'Standard ')
        if 'section' in d and 'division' not in d:
            update['division'] = d.get('section')
        if update:
            update_unset = {k: "" for k in ['grade', 'section'] if k in d}
            ops = {"$set": update}
            if update_unset:
                ops["$unset"] = update_unset
            await cls_collection.update_one({"_id": d['_id']}, ops)
            migrated += 1
    # Update names too: "Grade 6 - A" → "Standard 6 - A"
    async for d in cls_collection.find({"name": {"$regex": "^Grade "}}):
        new_name = d['name'].replace('Grade ', 'Standard ')
        await cls_collection.update_one({"_id": d['_id']}, {"$set": {"name": new_name}})
    return {"migrated_classes": migrated, "renamed_count": "see logs"}


@router.post("/migrate/labs-to-facilities")
async def migrate_labs_to_facilities(user: dict = Depends(get_current_user)):
    """One-time: copy every Lab into facilities (type='Lab') if not already present (match by name)."""
    labs = await db.labs.find({}, {"_id": 0}).to_list(5000)
    created = 0
    mapping = []
    for lab in labs:
        existing = await db.facilities.find_one(
            {"school_id": lab['school_id'], "name": lab['name'], "type": "Lab"}, {"_id": 0}
        )
        if existing:
            mapping.append({"lab_id": lab['id'], "facility_id": existing['id']}); continue
        fac = Facility(
            school_id=lab['school_id'], name=lab['name'], type="Lab",
            capacity=lab.get('capacity', 30), location=lab.get('location', ''),
            description=f"Migrated from Lab · type was {lab.get('type', 'General')}",
        )
        doc = fac.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
        await db.facilities.insert_one(doc)
        mapping.append({"lab_id": lab['id'], "facility_id": fac.id})
        created += 1
    return {"migrated": created, "total_labs": len(labs), "mapping": mapping}


@router.post("/seed/sri-ma-vidyalaya")
async def seed_sri_ma(user: dict = Depends(get_current_user)):
    school = await db.schools.find_one({"name": "Sri Ma Vidyalaya CBSE School"}, {"_id": 0})
    if not school:
        s = School(name="Sri Ma Vidyalaya CBSE School", location="Thane West, India", board="CBSE")
        d = s.model_dump(); d['created_at'] = d['created_at'].isoformat()
        await db.schools.insert_one(d)
        school_id = s.id
        await db.users.update_one({"user_id": user['user_id']}, {"$addToSet": {"school_ids": school_id}})
    else:
        school_id = school['id']
        await db.users.update_one({"user_id": user['user_id']}, {"$addToSet": {"school_ids": school_id}})

    teachers_data = [
        ("Mini Nair", "MN"), ("Meghana Wange", "MW"), ("Harpreet", "HK"), ("Selvi", "SJ"),
        ("Zarrine", "ZS"), ("Prajakta Kekatpure", "PV"), ("Seema Joshi", "JS"), ("Anushka Khot", "KA"),
        ("Aarti", "AK"), ("Anjali", "AN"), ("Pradyulata", "PR"), ("Anita Gaikwad", "AG"),
        ("Prashansa", "PH"), ("Bindu Balaji", "BB"), ("Geeta Menon", "GM"), ("Kranti", "KM"),
        ("Shweta", "SS"), ("Reema", "RY"), ("Mayura", "SM"), ("Ratnali", "RI"),
        ("Mansi", "MD"), ("Gaikwad", "GW"), ("Archana Bhadoria", "AB"), ("Trupti", "TW"),
        ("Bindu Arya", "BA"), ("Sanjeeta", "KJ"), ("Suman", "KS"), ("Manisha Pohnerkar", "MP"),
        ("Mansi Vaity", "MV"), ("Nandini Parsai", "NP"), ("Nandini Satish", "NS"), ("Sujata Parte", "PS"),
        ("Sampada", "WS"), ("Pushpa Gite", "GP"), ("Shivaji", "ST"), ("Medha", "MA"),
        ("Vandana Hegde", "VH"), ("Reshma", "RP"), ("Archana Thanekar", "TA"), ("Arundati", "AT"),
        ("Smitha Raj", "RS"), ("Vijayalaxmi", "VS"), ("Yogita", "YK"), ("Pooja Singh", "SP"),
        ("Pragati", "PD"),
    ]
    inserted = 0
    for name, abbr in teachers_data:
        existing = await db.teachers.find_one({"school_id": school_id, "abbreviation": abbr.upper()})
        if existing:
            continue
        t = Teacher(school_id=school_id, name=name, abbreviation=abbr.upper())
        doc = t.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
        await db.teachers.insert_one(doc)
        inserted += 1

    subjects_seed = [
        ("English", "ENG", "#0055FF"), ("Hindi", "HIN", "#FF3B30"), ("Marathi", "MAR", "#FFCC00"),
        ("Mathematics", "MAT", "#002FA7"), ("Science", "SCI", "#10B981"), ("Social Studies", "SST", "#8B5CF6"),
        ("Computer Science", "CS", "#06B6D4"), ("EVS", "EVS", "#84CC16"), ("Sanskrit", "SAN", "#F97316"),
    ]
    for sname, scode, scolor in subjects_seed:
        if not await db.subjects.find_one({"school_id": school_id, "code": scode}):
            s = Subject(school_id=school_id, name=sname, code=scode, color=scolor)
            d = s.model_dump(); d['created_at'] = d['created_at'].isoformat()
            await db.subjects.insert_one(d)

    if not await db.shifts.find_one({"school_id": school_id, "name": "Morning"}):
        sh = Shift(school_id=school_id, name="Morning", start_time="07:30", end_time="13:30")
        d = sh.model_dump(); d['created_at'] = d['created_at'].isoformat()
        await db.shifts.insert_one(d)
        period_defs = [
            ("P1", "07:30", "08:15", False), ("P2", "08:15", "09:00", False),
            ("P3", "09:00", "09:45", False), ("Short Break", "09:45", "10:00", True),
            ("P4", "10:00", "10:45", False), ("P5", "10:45", "11:30", False),
            ("Lunch", "11:30", "12:00", True), ("P6", "12:00", "12:45", False),
            ("P7", "12:45", "13:30", False),
        ]
        for i, (pname, st, et, br) in enumerate(period_defs):
            p = Period(school_id=school_id, shift_id=sh.id, order=i, name=pname,
                       start_time=st, end_time=et, is_break=br)
            d = p.model_dump(); d['created_at'] = d['created_at'].isoformat()
            await db.periods.insert_one(d)

    return {"school_id": school_id, "teachers_inserted": inserted}


@router.post("/seed/sri-ma-vidyalaya/full")
async def seed_sri_ma_full(user: dict = Depends(get_current_user)):
    from seed_data import SUBJECTS, GRADE_SECTIONS, ALLOTMENTS, RULES, DEFAULT_SECTIONS, GRADE_TO_SECTION

    school = await db.schools.find_one({"name": "Sri Ma Vidyalaya CBSE School"}, {"_id": 0})
    if not school:
        s = School(name="Sri Ma Vidyalaya CBSE School", location="Thane West, India", board="CBSE")
        d = s.model_dump(); d['created_at'] = d['created_at'].isoformat()
        await db.schools.insert_one(d)
        school_id = s.id
    else:
        school_id = school['id']
    await db.users.update_one({"user_id": user['user_id']}, {"$addToSet": {"school_ids": school_id}})

    # Find existing Morning shift if any (for default mapping)
    morning_shift = await db.shifts.find_one({"school_id": school_id}, {"_id": 0})
    morning_shift_id = morning_shift.get('id') if morning_shift else None

    # Sections (Kindergarten / Primary / Secondary / Sr.Secondary)
    sections_created = 0
    section_by_name = {}
    for sd in DEFAULT_SECTIONS:
        existing = await db.sections.find_one({"school_id": school_id, "name": sd['name']}, {"_id": 0})
        if existing:
            section_by_name[sd['name']] = existing['id']; continue
        sec = Section(school_id=school_id, name=sd['name'], order=sd['order'],
                      description=sd['description'], shift_id=morning_shift_id)
        doc = sec.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
        await db.sections.insert_one(doc)
        section_by_name[sd['name']] = sec.id
        sections_created += 1

    subjects_created = 0
    code_to_id = {}
    for name, code, color, is_lab in SUBJECTS:
        existing = await db.subjects.find_one({"school_id": school_id, "code": code}, {"_id": 0})
        if existing:
            code_to_id[code] = existing['id']; continue
        sub = Subject(school_id=school_id, name=name, code=code, color=color, is_lab=is_lab)
        doc = sub.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
        await db.subjects.insert_one(doc)
        code_to_id[code] = sub.id
        subjects_created += 1

    standard_words = {"VI": "Standard 6", "VII": "Standard 7", "VIII": "Standard 8",
                      "IX": "Standard 9", "X": "Standard 10"}
    classes_created = 0
    class_lookup = {}
    for grade_roman, divisions in GRADE_SECTIONS.items():
        standard_name = standard_words[grade_roman]
        sec_id = section_by_name.get(GRADE_TO_SECTION.get(grade_roman, 'Secondary'))
        for division in divisions:
            cls_name = f"{standard_name} - {division}"
            existing = await db.classes.find_one({"school_id": school_id, "name": cls_name}, {"_id": 0})
            if existing:
                class_lookup[(grade_roman, division)] = existing['id']
                # Ensure section_id is set on existing rows
                if not existing.get('section_id') and sec_id:
                    await db.classes.update_one({"id": existing['id']}, {"$set": {"section_id": sec_id, "shift_id": morning_shift_id}})
                continue
            c = ClassRoom(school_id=school_id, name=cls_name, standard=standard_name,
                          division=division, section_id=sec_id, shift_id=morning_shift_id)
            doc = c.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
            await db.classes.insert_one(doc)
            class_lookup[(grade_roman, division)] = c.id
            classes_created += 1

    allotments_created = 0
    for grade_roman, rows in ALLOTMENTS.items():
        for subj_code, per_section in rows:
            sub_id = code_to_id.get(subj_code)
            if not sub_id: continue
            for division, periods in per_section.items():
                cls_id = class_lookup.get((grade_roman, division))
                if not cls_id or not periods: continue
                existing = await db.allotments.find_one(
                    {"school_id": school_id, "class_id": cls_id, "subject_id": sub_id}, {"_id": 0}
                )
                if existing:
                    if existing.get('periods_per_week') != periods:
                        await db.allotments.update_one({"id": existing['id']}, {"$set": {"periods_per_week": periods}})
                    continue
                alt = ClassSubjectAllotment(school_id=school_id, class_id=cls_id, subject_id=sub_id,
                                            periods_per_week=periods)
                doc = alt.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
                await db.allotments.insert_one(doc)
                allotments_created += 1

    rules_created = 0
    for rule in RULES:
        existing = await db.constraints.find_one({"school_id": school_id, "name": rule['name']}, {"_id": 0})
        if existing: continue
        c = Constraint(school_id=school_id, **rule)
        doc = c.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
        await db.constraints.insert_one(doc)
        rules_created += 1

    return {
        "school_id": school_id, "subjects_created": subjects_created,
        "classes_created": classes_created, "allotments_created": allotments_created,
        "rules_created": rules_created, "sections_created": sections_created,
    }
