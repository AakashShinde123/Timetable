"""Generic master CRUD: teachers, subjects, classes, labs, shifts, periods, activities,
constraints, allotments. Writes are gated by per-resource permissions."""
from typing import Dict, Any
from fastapi import APIRouter, Depends, Body

from db import db
from deps import get_current_user
from perms import require_perm
from models import (
    Teacher, Subject, ClassRoom, Lab, Shift, Period, Activity,
    Constraint, ClassSubjectAllotment, Section, AuditRun, Facility, ESSLDevice, serialize_doc,
)

router = APIRouter(prefix="/api", tags=["masters"])


def make_master_routes(name: str, collection: str, ModelCls, perm_key: str | None = None):
    """perm_key — permission required for POST/PUT/DELETE. None disables the gate."""
    @router.get(f"/schools/{{school_id}}/{name}")
    async def list_items(school_id: str, user: dict = Depends(get_current_user)):
        docs = await db[collection].find({"school_id": school_id}, {"_id": 0}).to_list(2000)
        return [serialize_doc(d) for d in docs]

    @router.post(f"/schools/{{school_id}}/{name}")
    async def create_item(school_id: str, payload: Dict[str, Any] = Body(...),
                          user: dict = Depends(get_current_user)):
        if perm_key:
            await require_perm(school_id, user, perm_key)
        payload['school_id'] = school_id
        if 'abbreviation' in payload and isinstance(payload['abbreviation'], str):
            payload['abbreviation'] = payload['abbreviation'].upper()
        obj = ModelCls(**payload)
        doc = obj.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db[collection].insert_one(doc)
        return serialize_doc(doc)

    @router.put(f"/schools/{{school_id}}/{name}/{{item_id}}")
    async def update_item(school_id: str, item_id: str, payload: Dict[str, Any] = Body(...),
                          user: dict = Depends(get_current_user)):
        if perm_key:
            await require_perm(school_id, user, perm_key)
        payload.pop('id', None); payload.pop('created_at', None)
        if 'abbreviation' in payload and isinstance(payload['abbreviation'], str):
            payload['abbreviation'] = payload['abbreviation'].upper()
        await db[collection].update_one(
            {"id": item_id, "school_id": school_id}, {"$set": payload}
        )
        doc = await db[collection].find_one({"id": item_id}, {"_id": 0})
        return serialize_doc(doc)

    @router.delete(f"/schools/{{school_id}}/{name}/{{item_id}}")
    async def delete_item(school_id: str, item_id: str, user: dict = Depends(get_current_user)):
        if perm_key:
            await require_perm(school_id, user, perm_key)
        await db[collection].delete_one({"id": item_id, "school_id": school_id})
        return {"ok": True}


make_master_routes("teachers", "teachers", Teacher, "teachers.manage")
make_master_routes("subjects", "subjects", Subject, "subjects.manage")
make_master_routes("classes", "classes", ClassRoom, "classes.manage")
make_master_routes("labs", "labs", Lab, "labs.manage")
make_master_routes("shifts", "shifts", Shift, "shifts.manage")
make_master_routes("periods", "periods", Period, "shifts.manage")
make_master_routes("activities", "activities", Activity, "activities.manage")
make_master_routes("constraints", "constraints", Constraint, "constraints.manage")
make_master_routes("allotments", "allotments", ClassSubjectAllotment, "allotments.manage")
make_master_routes("sections", "sections", Section, "sections.manage")
make_master_routes("facilities", "facilities", Facility, "facilities.manage")
make_master_routes("essl-devices", "essl_devices", ESSLDevice, "attendance.manage")


# Cascade: deleting a shift should remove its periods + clean classes pointing at it
@router.delete("/schools/{school_id}/shifts/{shift_id}/cascade")
async def delete_shift_cascade(school_id: str, shift_id: str, user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "shifts.manage")
    p_del = await db.periods.delete_many({"school_id": school_id, "shift_id": shift_id})
    await db.shifts.delete_one({"id": shift_id, "school_id": school_id})
    await db.classes.update_many({"school_id": school_id, "shift_id": shift_id},
                                  {"$unset": {"shift_id": ""}})
    return {"ok": True, "periods_deleted": p_del.deleted_count}


@router.post("/schools/{school_id}/shifts/cleanup-orphans")
async def cleanup_orphan_periods(school_id: str, user: dict = Depends(get_current_user)):
    """Delete periods whose shift_id no longer exists. Optionally also dedupes near-identical periods
    within the same shift (same name+order)."""
    await require_perm(school_id, user, "shifts.manage")
    shifts = await db.shifts.find({"school_id": school_id}, {"_id": 0}).to_list(50)
    valid_ids = {s['id'] for s in shifts}
    orphan = await db.periods.delete_many({
        "school_id": school_id,
        "$or": [{"shift_id": {"$nin": list(valid_ids)}}, {"shift_id": None}, {"shift_id": ""}],
    })
    # Within-shift dedupe: keep the first occurrence of (shift_id, name, order)
    seen = set(); dupes = 0
    async for p in db.periods.find({"school_id": school_id}, {"_id": 0}).sort("created_at", 1):
        key = (p.get('shift_id'), p.get('name'), p.get('order'))
        if key in seen:
            await db.periods.delete_one({"id": p['id']}); dupes += 1
        else:
            seen.add(key)
    return {"orphans_deleted": orphan.deleted_count, "duplicates_deleted": dupes}


@router.post("/schools/{school_id}/allotments/bulk")
async def bulk_allotments(school_id: str, payload: Dict[str, Any] = Body(...),
                          user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "allotments.manage")
    rows = payload.get('rows', [])
    classes = await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    subjects = await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    cls_by_name = {c['name']: c for c in classes}
    sub_by_code = {s['code']: s for s in subjects}
    sub_by_name = {s['name'].lower(): s for s in subjects}
    created = 0; updated = 0; errors = []
    for i, r in enumerate(rows):
        cls_name = (r.get('class_name') or '').strip()
        sub_key = (r.get('subject_code') or r.get('subject') or '').strip()
        try:
            periods = int(r.get('periods_per_week', 0))
            if periods < 0 or periods > 50:
                errors.append({'row': i + 1, 'error': 'periods_per_week out of range'}); continue
        except Exception:
            errors.append({'row': i + 1, 'error': 'invalid periods_per_week'}); continue
        cls = cls_by_name.get(cls_name)
        sub = sub_by_code.get(sub_key.upper()) or sub_by_name.get(sub_key.lower())
        if not cls or not sub:
            errors.append({'row': i + 1, 'error': f'class/subject not found: {cls_name} / {sub_key}'}); continue
        existing = await db.allotments.find_one(
            {"school_id": school_id, "class_id": cls['id'], "subject_id": sub['id']}, {"_id": 0}
        )
        if existing:
            await db.allotments.update_one({"id": existing['id']}, {"$set": {"periods_per_week": periods}})
            updated += 1
        else:
            alt = ClassSubjectAllotment(school_id=school_id, class_id=cls['id'], subject_id=sub['id'],
                                        periods_per_week=periods)
            doc = alt.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
            await db.allotments.insert_one(doc)
            created += 1
    return {"ok": True, "created": created, "updated": updated, "errors": errors}
