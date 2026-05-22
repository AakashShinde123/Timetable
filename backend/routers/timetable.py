"""Timetable cells: get/upsert/clear, validate, audit, auto-generate, teacher schedule."""
import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Body

from db import db
from deps import get_current_user
from models import TimetableCell, serialize_doc
from constraint_engine import (
    evaluate_cell, evaluate_workload, audit_timetable,
)

router = APIRouter(prefix="/api", tags=["timetable"])


async def _evaluate_constraints_for_cell(school_id, class_id, day, period_id,
                                         teacher_id, subject_id, lab_id):
    rules = await db.constraints.find({"school_id": school_id, "enabled": True}, {"_id": 0}).to_list(500)
    if not rules:
        return []
    teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0}) if teacher_id else None
    subject = await db.subjects.find_one({"id": subject_id}, {"_id": 0}) if subject_id else None
    cls = await db.classes.find_one({"id": class_id}, {"_id": 0}) if class_id else None
    period = await db.periods.find_one({"id": period_id}, {"_id": 0}) if period_id else None
    ctx = {
        'teacher': teacher.get('abbreviation') if teacher else '',
        'subject': subject.get('name') if subject else '',
        'class': (cls.get('standard') or cls.get('grade', '')) if cls else '',
        'day': day,
        'period': period.get('name') if period else '',
    }
    violations = evaluate_cell(rules, ctx)
    if teacher_id:
        all_cells = await db.timetable.find({"school_id": school_id}, {"_id": 0}).to_list(5000)
        violations += evaluate_workload(rules, all_cells, ctx, teacher_id, class_id, day)
    return violations


async def _check_facility_clash(school_id, class_id, day, period_id, facility_id):
    """Returns a clash dict if another class is occupying the same non-shared facility."""
    if not facility_id:
        return None
    fac = await db.facilities.find_one({"id": facility_id, "school_id": school_id}, {"_id": 0})
    if fac and fac.get('is_shared'):
        return None
    # Direct facility match
    other = await db.timetable.find_one({
        "school_id": school_id, "day": day, "period_id": period_id,
        "facility_id": facility_id, "class_id": {"$ne": class_id},
    }, {"_id": 0})
    if other:
        return {"type": "facility_clash", "with_class": other.get('class_id'), "facility_id": facility_id}
    # Also check classes whose home facility matches this facility and have a cell at the slot
    home_classes = await db.classes.find(
        {"school_id": school_id, "facility_id": facility_id, "id": {"$ne": class_id}}, {"_id": 0}
    ).to_list(200)
    if home_classes:
        other_ids = [c['id'] for c in home_classes]
        # Cell uses home facility implicitly when its facility_id is empty
        clash = await db.timetable.find_one({
            "school_id": school_id, "day": day, "period_id": period_id,
            "class_id": {"$in": other_ids},
            "$or": [{"facility_id": None}, {"facility_id": ""}, {"facility_id": {"$exists": False}}],
        }, {"_id": 0})
        if clash:
            return {"type": "facility_clash", "with_class": clash.get('class_id'), "facility_id": facility_id}
    return None


@router.get("/schools/{school_id}/timetable")
async def get_timetable(school_id: str, class_id: Optional[str] = None,
                        user: dict = Depends(get_current_user)):
    q = {"school_id": school_id}
    if class_id:
        q["class_id"] = class_id
    cells = await db.timetable.find(q, {"_id": 0}).to_list(5000)
    return [serialize_doc(c) for c in cells]


@router.put("/schools/{school_id}/timetable/cell")
async def upsert_cell(school_id: str, payload: Dict[str, Any] = Body(...),
                      user: dict = Depends(get_current_user)):
    payload['school_id'] = school_id
    payload['updated_at'] = datetime.now(timezone.utc).isoformat()
    class_id = payload['class_id']; day = payload['day']; period_id = payload['period_id']

    clashes = []
    if payload.get('teacher_id'):
        other = await db.timetable.find_one({
            "school_id": school_id, "day": day, "period_id": period_id,
            "teacher_id": payload['teacher_id'], "class_id": {"$ne": class_id},
        }, {"_id": 0})
        if other:
            clashes.append({"type": "teacher_clash", "with_class": other.get('class_id')})
    if payload.get('lab_id'):
        other = await db.timetable.find_one({
            "school_id": school_id, "day": day, "period_id": period_id,
            "lab_id": payload['lab_id'], "class_id": {"$ne": class_id},
        }, {"_id": 0})
        if other:
            clashes.append({"type": "lab_clash", "with_class": other.get('class_id')})
    # Effective facility = override on cell, else class home facility
    eff_fac = payload.get('facility_id')
    if not eff_fac:
        cls_doc = await db.classes.find_one({"id": class_id, "school_id": school_id}, {"_id": 0})
        eff_fac = (cls_doc or {}).get('facility_id')
    fac_clash = await _check_facility_clash(school_id, class_id, day, period_id, eff_fac)
    if fac_clash:
        clashes.append(fac_clash)

    existing = await db.timetable.find_one({
        "school_id": school_id, "class_id": class_id, "day": day, "period_id": period_id
    }, {"_id": 0})
    if existing:
        await db.timetable.update_one(
            {"id": existing['id']},
            {"$set": {k: v for k, v in payload.items() if k != 'id'}}
        )
        cell_id = existing['id']
    else:
        cell = TimetableCell(**payload)
        doc = cell.model_dump(); doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.timetable.insert_one(doc)
        cell_id = cell.id

    violations = await _evaluate_constraints_for_cell(
        school_id, class_id, day, period_id,
        payload.get('teacher_id'), payload.get('subject_id'), payload.get('lab_id'),
    )
    return {"id": cell_id, "clashes": clashes, "violations": violations}


@router.delete("/schools/{school_id}/timetable/cell")
async def clear_cell(school_id: str, class_id: str, day: str, period_id: str,
                     user: dict = Depends(get_current_user)):
    await db.timetable.delete_one({
        "school_id": school_id, "class_id": class_id, "day": day, "period_id": period_id
    })
    return {"ok": True}


@router.post("/schools/{school_id}/timetable/validate")
async def validate_cell(school_id: str, payload: Dict[str, Any] = Body(...),
                        user: dict = Depends(get_current_user)):
    class_id = payload.get('class_id'); day = payload.get('day')
    period_id = payload.get('period_id'); teacher_id = payload.get('teacher_id')
    lab_id = payload.get('lab_id')
    clashes = []
    if teacher_id:
        other = await db.timetable.find_one({
            "school_id": school_id, "day": day, "period_id": period_id,
            "teacher_id": teacher_id, "class_id": {"$ne": class_id},
        }, {"_id": 0})
        if other:
            clashes.append({"type": "teacher_clash", "with_class": other.get('class_id')})
    if lab_id:
        other = await db.timetable.find_one({
            "school_id": school_id, "day": day, "period_id": period_id,
            "lab_id": lab_id, "class_id": {"$ne": class_id},
        }, {"_id": 0})
        if other:
            clashes.append({"type": "lab_clash", "with_class": other.get('class_id')})
    eff_fac = payload.get('facility_id')
    if not eff_fac and class_id:
        cls_doc = await db.classes.find_one({"id": class_id, "school_id": school_id}, {"_id": 0})
        eff_fac = (cls_doc or {}).get('facility_id')
    fac_clash = await _check_facility_clash(school_id, class_id, day, period_id, eff_fac)
    if fac_clash:
        clashes.append(fac_clash)
    violations = await _evaluate_constraints_for_cell(
        school_id, class_id, day, period_id, teacher_id, payload.get('subject_id'), lab_id,
    )
    return {"clashes": clashes, "violations": violations}


@router.post("/schools/{school_id}/timetable/audit")
async def audit(school_id: str, payload: Dict[str, Any] = Body(default={}),
                user: dict = Depends(get_current_user)):
    """Audit timetable (whole school or specific class). Returns all violations."""
    q = {"school_id": school_id}
    if payload.get('class_id'):
        q['class_id'] = payload['class_id']
    cells = await db.timetable.find(q, {"_id": 0}).to_list(20000)
    if not cells:
        return {"violations": [], "summary": {"hard": 0, "soft": 0}}
    rules = await db.constraints.find({"school_id": school_id, "enabled": True}, {"_id": 0}).to_list(500)
    teachers = {t['id']: t for t in await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    subjects = {s['id']: s for s in await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    classes = {c['id']: c for c in await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    periods = {p['id']: p for p in await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(100)}
    violations = audit_timetable(rules, cells, teachers, subjects, classes, periods)
    hard = sum(1 for v in violations if v.get('severity') == 'hard')
    soft = len(violations) - hard
    return {"violations": violations, "summary": {"hard": hard, "soft": soft, "total": len(violations)}}


@router.post("/schools/{school_id}/timetable/auto-generate")
async def auto_generate(school_id: str, payload: Dict[str, Any] = Body(...),
                        user: dict = Depends(get_current_user)):
    """Greedy auto-fill of a class timetable."""
    class_id = payload['class_id']
    replace = bool(payload.get('replace', True))
    if replace:
        await db.timetable.delete_many({"school_id": school_id, "class_id": class_id})

    cls = await db.classes.find_one({"id": class_id, "school_id": school_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    periods = sorted(
        await db.periods.find({"school_id": school_id, "is_break": False}, {"_id": 0}).to_list(50),
        key=lambda p: p.get('order', 0)
    )
    if not periods:
        raise HTTPException(400, "No periods defined")
    allotments = await db.allotments.find({"school_id": school_id, "class_id": class_id}, {"_id": 0}).to_list(200)
    if not allotments:
        return {"ok": False, "message": "No allotments for this class", "placed": 0}

    subjects = await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    sub_map = {s['id']: s for s in subjects}
    teachers = await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    rules = await db.constraints.find({"school_id": school_id, "enabled": True}, {"_id": 0}).to_list(500)
    remaining = {a['subject_id']: a['periods_per_week'] for a in allotments if a.get('periods_per_week', 0) > 0}

    days = (await db.shifts.find_one({"school_id": school_id}, {"_id": 0}) or {}).get('working_days') \
        or ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    all_cells = await db.timetable.find({"school_id": school_id}, {"_id": 0}).to_list(20000)

    def teacher_busy(tid, day, period_id):
        return any(c.get('teacher_id') == tid and c.get('day') == day and c.get('period_id') == period_id
                   for c in all_cells)

    def candidate_teachers(subject_id):
        return [t for t in teachers if subject_id in (t.get('subjects') or [])]

    placed = 0; skipped_slots = 0
    for day in days:
        for p in periods:
            cand_subjects = [sid for sid, n in remaining.items() if n > 0]
            if not cand_subjects:
                break
            cand_subjects.sort(key=lambda sid: -remaining[sid])
            placed_this_slot = False
            for sub_id in cand_subjects:
                sub = sub_map.get(sub_id)
                if not sub:
                    continue
                cands = candidate_teachers(sub_id)
                if not cands:
                    tid = None
                else:
                    free = [t for t in cands if not teacher_busy(t['id'], day, p['id'])]
                    if not free:
                        continue
                    free.sort(key=lambda t: sum(1 for c in all_cells if c.get('teacher_id') == t['id']))
                    tid = free[0]['id']
                teacher_doc = next((t for t in teachers if t['id'] == tid), None) if tid else None
                ctx = {
                    'teacher': teacher_doc.get('abbreviation') if teacher_doc else '',
                    'subject': sub.get('name', ''),
                    'class': (cls.get('standard') or cls.get('grade', '')),
                    'day': day, 'period': p.get('name', ''),
                }
                viols = [v for v in evaluate_cell(rules, ctx) if v.get('severity') == 'hard']
                if viols:
                    continue
                cell = TimetableCell(school_id=school_id, class_id=class_id, day=day, period_id=p['id'],
                                     subject_id=sub_id, teacher_id=tid)
                doc = cell.model_dump(); doc['updated_at'] = datetime.now(timezone.utc).isoformat()
                await db.timetable.insert_one(doc)
                all_cells.append(doc)
                remaining[sub_id] -= 1
                placed += 1
                placed_this_slot = True
                break
            if not placed_this_slot:
                skipped_slots += 1

    leftover = {sub_map.get(sid, {}).get('name', sid): n for sid, n in remaining.items() if n > 0}
    return {"ok": True, "class_id": class_id, "placed": placed,
            "skipped_slots": skipped_slots, "leftover_periods": leftover}


@router.get("/schools/{school_id}/teachers/{teacher_id}/schedule")
async def teacher_schedule(school_id: str, teacher_id: str, user: dict = Depends(get_current_user)):
    teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    # Scoping: admins see all; otherwise only the teacher's own record (matched by email)
    role = (user.get('role') or '').strip()
    if role not in ('Super Admin', 'School Admin', 'Principal', 'Supervisor'):
        if (teacher.get('email') or '').lower() != (user.get('email') or '').lower():
            raise HTTPException(403, "Teachers may only view their own schedule")
    cells = await db.timetable.find({"school_id": school_id, "teacher_id": teacher_id},
                                     {"_id": 0}).to_list(2000)
    return {
        "teacher": serialize_doc(teacher),
        "cells": [serialize_doc(c) for c in cells],
        "total_periods_per_week": len(cells),
    }


@router.post("/schools/{school_id}/timetable/audit-all")
async def audit_all(school_id: str, user: dict = Depends(get_current_user)):
    """Audit every class and return per-class summary for heat-map."""
    from constraint_engine import audit_timetable
    cells = await db.timetable.find({"school_id": school_id}, {"_id": 0}).to_list(20000)
    rules = await db.constraints.find({"school_id": school_id, "enabled": True}, {"_id": 0}).to_list(500)
    teachers = {t['id']: t for t in await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    subjects = {s['id']: s for s in await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    classes = {c['id']: c for c in await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    periods = {p['id']: p for p in await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(100)}

    all_v = audit_timetable(rules, cells, teachers, subjects, classes, periods)

    per_class = {}
    categories = set()
    rule_id_to_cat = {r.get('id'): r.get('category', 'general') for r in rules}
    rule_name_to_cat = {r.get('name'): r.get('category', 'general') for r in rules}
    for v in all_v:
        cid = v.get('class_id') or '_global'
        cat = rule_id_to_cat.get(v.get('rule_id')) or rule_name_to_cat.get(v.get('rule_name'), 'general')
        categories.add(cat)
        bucket = per_class.setdefault(cid, {'hard': 0, 'soft': 0, 'total': 0, 'by_category': {}})
        bucket['by_category'][cat] = bucket['by_category'].get(cat, 0) + 1
        bucket['total'] += 1
        if v.get('severity') == 'hard':
            bucket['hard'] += 1
        else:
            bucket['soft'] += 1

    # Top rules
    rule_counts = {}
    for v in all_v:
        rn = v.get('rule_name', 'unknown')
        rule_counts[rn] = rule_counts.get(rn, 0) + 1
    top_rules = sorted(rule_counts.items(), key=lambda x: -x[1])[:10]

    rows = []
    for cid, cls in classes.items():
        b = per_class.get(cid, {'hard': 0, 'soft': 0, 'total': 0, 'by_category': {}})
        rows.append({
            'class_id': cid, 'class_name': cls.get('name'),
            'standard': cls.get('standard') or cls.get('grade'),
            **b,
        })
    rows.sort(key=lambda r: (-r['hard'], -r['total'], r.get('class_name', '')))

    return {
        'school_id': school_id,
        'totals': {'hard': sum(r['hard'] for r in rows),
                   'soft': sum(r['soft'] for r in rows),
                   'total': len(all_v)},
        'categories': sorted(categories),
        'classes': rows,
        'top_rules': [{'name': n, 'count': c} for n, c in top_rules],
    }


@router.get("/schools/{school_id}/timetable/pdf")
async def class_timetable_pdf_endpoint(school_id: str, class_id: str,
                                        user: dict = Depends(get_current_user)):
    from fastapi.responses import Response
    from pdf_export import class_timetable_pdf
    school = await db.schools.find_one({"id": school_id}, {"_id": 0})
    cls = await db.classes.find_one({"id": class_id, "school_id": school_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    cells = await db.timetable.find({"school_id": school_id, "class_id": class_id},
                                     {"_id": 0}).to_list(5000)
    teachers = await db.teachers.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    subjects = await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    periods = sorted(await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(100),
                     key=lambda p: p.get('order', 0))
    pdf = class_timetable_pdf(school, cls, cells, teachers, subjects, periods)
    safe = (cls.get('name', 'class') or 'class').replace(' ', '_').replace('/', '-')
    return Response(content=pdf, media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="timetable_{safe}.pdf"'})


@router.get("/schools/{school_id}/teachers/{teacher_id}/schedule/pdf")
async def teacher_schedule_pdf_endpoint(school_id: str, teacher_id: str,
                                         user: dict = Depends(get_current_user)):
    from fastapi.responses import Response
    from pdf_export import teacher_schedule_pdf
    school = await db.schools.find_one({"id": school_id}, {"_id": 0})
    teacher = await db.teachers.find_one({"id": teacher_id}, {"_id": 0})
    if not teacher:
        raise HTTPException(404, "Teacher not found")
    role = (user.get('role') or '').strip()
    if role not in ('Super Admin', 'School Admin', 'Principal', 'Supervisor'):
        if (teacher.get('email') or '').lower() != (user.get('email') or '').lower():
            raise HTTPException(403, "Teachers may only download their own schedule")
    cells = await db.timetable.find({"school_id": school_id, "teacher_id": teacher_id},
                                     {"_id": 0}).to_list(2000)
    subjects = await db.subjects.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    classes = await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    periods = sorted(await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(100),
                     key=lambda p: p.get('order', 0))
    pdf = teacher_schedule_pdf(school, teacher, cells, subjects, classes, periods)
    safe = (teacher.get('abbreviation', 'teacher') or 'teacher').replace(' ', '_')
    return Response(content=pdf, media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename="schedule_{safe}.pdf"'})


@router.get("/schools/{school_id}/bell-schedule/pdf")
async def bell_schedule_pdf_endpoint(school_id: str, user: dict = Depends(get_current_user)):
    from fastapi.responses import Response
    from pdf_export import bell_schedule_pdf
    school = await db.schools.find_one({"id": school_id}, {"_id": 0})
    shifts = await db.shifts.find({"school_id": school_id}, {"_id": 0}).to_list(50)
    periods = await db.periods.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    periods.sort(key=lambda p: p.get('order', 0))
    periods_by_shift = {}
    for p in periods:
        periods_by_shift.setdefault(p.get('shift_id'), []).append(p)
    pdf = bell_schedule_pdf(school, shifts, periods_by_shift)
    return Response(content=pdf, media_type='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename="bell_schedule.pdf"'})


@router.post("/schools/{school_id}/timetable/apply-suggestion")
async def apply_suggestion(school_id: str, payload: Dict[str, Any] = Body(...),
                            user: dict = Depends(get_current_user)):
    """Apply an AI-generated move/swap. Body: {type:'move'|'swap', class_id, from_day, from_period_id,
    to_day, to_period_id, force?, dry_run?}. With dry_run=true returns the would-be violations without saving.
    Returns {ok, before, after, message, violations_before:[], violations_after:[]}."""
    s_type = payload.get('type', 'move')
    cls = payload['class_id']
    fd = payload['from_day']; fp = payload['from_period_id']
    td = payload['to_day']; tp = payload['to_period_id']
    dry_run = bool(payload.get('dry_run'))

    cell_a = await db.timetable.find_one(
        {"school_id": school_id, "class_id": cls, "day": fd, "period_id": fp}, {"_id": 0}
    )
    if not cell_a:
        raise HTTPException(404, "Source cell empty")
    cell_b = await db.timetable.find_one(
        {"school_id": school_id, "class_id": cls, "day": td, "period_id": tp}, {"_id": 0}
    )

    # Compute violations for the cell at its current location
    v_before = await _evaluate_constraints_for_cell(
        school_id, cls, fd, fp, cell_a.get('teacher_id'), cell_a.get('subject_id'), cell_a.get('lab_id'),
    )
    # Compute violations as if the cell were at the target location
    v_after = await _evaluate_constraints_for_cell(
        school_id, cls, td, tp, cell_a.get('teacher_id'), cell_a.get('subject_id'), cell_a.get('lab_id'),
    )

    new_hard = [v for v in v_after if v.get('severity') == 'hard']
    old_hard = [v for v in v_before if v.get('severity') == 'hard']
    introduces_new_hard = any(
        v['rule_name'] not in {x['rule_name'] for x in old_hard} for v in new_hard
    )

    if dry_run:
        return {
            "dry_run": True, "would_apply": True,
            "violations_before": v_before, "violations_after": v_after,
            "introduces_new_hard_violation": introduces_new_hard,
        }

    if s_type == 'move':
        if cell_b and not payload.get('force'):
            raise HTTPException(409, "Destination cell occupied; pass force=true to overwrite")
        if cell_b:
            await db.timetable.delete_one({"id": cell_b['id']})
        await db.timetable.update_one(
            {"id": cell_a['id']},
            {"$set": {"day": td, "period_id": tp,
                      "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True, "moved_cell_id": cell_a['id'],
                "from": f"{fd}/{fp}", "to": f"{td}/{tp}",
                "violations_before": v_before, "violations_after": v_after,
                "introduces_new_hard_violation": introduces_new_hard}

    if s_type == 'swap':
        if not cell_b:
            raise HTTPException(404, "Destination cell empty; use 'move' instead")
        await db.timetable.update_one(
            {"id": cell_a['id']},
            {"$set": {"day": td, "period_id": tp,
                      "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.timetable.update_one(
            {"id": cell_b['id']},
            {"$set": {"day": fd, "period_id": fp,
                      "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True, "swapped": [cell_a['id'], cell_b['id']],
                "violations_before": v_before, "violations_after": v_after,
                "introduces_new_hard_violation": introduces_new_hard}

    raise HTTPException(400, "Unknown suggestion type")


@router.post("/schools/{school_id}/classes/auto-match-facilities")
async def auto_match_facilities(school_id: str, payload: Dict[str, Any] = Body(default={}),
                                 user: dict = Depends(get_current_user)):
    """For each class with a room_no but no facility_id, find a facility whose name OR
    location matches the room_no (case-insensitive substring). Returns a preview by default;
    set apply=true in body to commit. Body: {apply?:bool}."""
    apply = bool(payload.get('apply'))
    classes = await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(2000)
    facilities = await db.facilities.find({"school_id": school_id}, {"_id": 0}).to_list(500)

    def _norm(s):
        return (s or '').strip().lower()

    matches = []
    for c in classes:
        if c.get('facility_id'):
            continue
        rn = _norm(c.get('room_no'))
        if not rn:
            continue
        # Exact-name or name-contains, fallback to location-contains
        cand = next((f for f in facilities if _norm(f.get('name')) == rn), None)
        if not cand:
            cand = next((f for f in facilities if rn in _norm(f.get('name'))
                         or _norm(f.get('name')) in rn), None)
        if not cand:
            cand = next((f for f in facilities if rn in _norm(f.get('location'))), None)
        if not cand:
            continue
        matches.append({
            "class_id": c['id'], "class_name": c.get('name'), "room_no": c.get('room_no'),
            "facility_id": cand['id'], "facility_name": cand['name'], "facility_type": cand.get('type'),
        })
    applied = 0
    if apply:
        for m in matches:
            await db.classes.update_one({"id": m['class_id'], "school_id": school_id},
                                          {"$set": {"facility_id": m['facility_id']}})
            applied += 1
    return {"matches": matches, "preview": not apply, "applied": applied}


@router.post("/schools/{school_id}/timetable/place-activity")
async def place_activity_multi_class(school_id: str, payload: Dict[str, Any] = Body(...),
                                      user: dict = Depends(get_current_user)):
    """Broadcast an activity onto multiple class timetable cells at one day+period.
    Body: {activity_id, day, period_id, class_ids[], facility_id?, replace?:bool=true}.
    Returns per-class result with any clashes."""
    activity_id = payload['activity_id']; day = payload['day']; period_id = payload['period_id']
    class_ids = payload.get('class_ids') or []
    facility_id = payload.get('facility_id')
    replace = bool(payload.get('replace', True))
    act = await db.activities.find_one({"id": activity_id, "school_id": school_id}, {"_id": 0})
    if not act:
        raise HTTPException(404, "Activity not found")
    # Default to activity.target_class_ids and facility_id when not overridden in the payload
    if not class_ids:
        class_ids = act.get('target_class_ids') or []
    if not facility_id:
        facility_id = act.get('facility_id') or None
    if not class_ids:
        raise HTTPException(400, "No target classes")
    results = []
    for cid in class_ids:
        existing = await db.timetable.find_one({
            "school_id": school_id, "class_id": cid, "day": day, "period_id": period_id,
        }, {"_id": 0})
        if existing and not replace:
            results.append({"class_id": cid, "ok": False, "reason": "occupied"}); continue
        if existing:
            await db.timetable.delete_one({"id": existing['id']})
        cell = TimetableCell(school_id=school_id, class_id=cid, day=day, period_id=period_id,
                              activity_id=activity_id, facility_id=facility_id)
        doc = cell.model_dump(); doc['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.timetable.insert_one(doc)
        # check facility clash for this cell
        fac_clash = await _check_facility_clash(school_id, cid, day, period_id, facility_id)
        results.append({"class_id": cid, "ok": True, "facility_clash": fac_clash})
    return {"activity_id": activity_id, "day": day, "period_id": period_id,
            "facility_id": facility_id, "classes": len(class_ids), "results": results}


@router.post("/schools/{school_id}/audit/snapshot")
async def save_audit_snapshot(school_id: str, payload: Dict[str, Any] = Body(default={}),
                              user: dict = Depends(get_current_user)):
    """Capture the current audit-all result and persist it as a snapshot for trend tracking."""
    # Re-run audit-all then store summary
    res = await audit_all.__wrapped__(school_id, user) if hasattr(audit_all, '__wrapped__') else None
    if res is None:
        # Just call the function directly
        res = await audit_all(school_id, user)
    snap = {
        "id": f"aud_{uuid.uuid4().hex[:10]}",
        "school_id": school_id,
        "totals": res.get('totals', {}),
        "top_rules": res.get('top_rules', []),
        "categories": res.get('categories', []),
        "note": payload.get('note', ''),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_runs.insert_one(snap)
    snap.pop('_id', None)
    return snap


@router.get("/schools/{school_id}/audit/history")
async def audit_history(school_id: str, limit: int = 20, user: dict = Depends(get_current_user)):
    docs = await db.audit_runs.find({"school_id": school_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [serialize_doc(d) for d in docs]


@router.get("/schools/{school_id}/facility-conflicts")
async def facility_conflicts(school_id: str, user: dict = Depends(get_current_user)):
    """Scan timetable and return facility double-bookings (non-shared facilities only)."""
    facilities = {f['id']: f for f in await db.facilities.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    classes = {c['id']: c for c in await db.classes.find({"school_id": school_id}, {"_id": 0}).to_list(500)}
    cells = await db.timetable.find({"school_id": school_id}, {"_id": 0}).to_list(20000)
    bucket = {}
    for c in cells:
        fid = c.get('facility_id') or (classes.get(c.get('class_id')) or {}).get('facility_id')
        if not fid:
            continue
        fac = facilities.get(fid)
        if fac and fac.get('is_shared'):
            continue
        key = (c['day'], c['period_id'], fid)
        bucket.setdefault(key, []).append(c.get('class_id'))
    conflicts = []
    for (day, period_id, fid), cls_ids in bucket.items():
        if len(cls_ids) > 1:
            conflicts.append({
                "day": day, "period_id": period_id, "facility_id": fid,
                "facility_name": (facilities.get(fid) or {}).get('name'),
                "facility_type": (facilities.get(fid) or {}).get('type'),
                "class_ids": cls_ids,
                "class_names": [(classes.get(cid) or {}).get('name') for cid in cls_ids],
                "count": len(cls_ids),
            })
    conflicts.sort(key=lambda x: -x['count'])
    return {"conflicts": conflicts, "total": len(conflicts)}


@router.get("/super-admin/dashboard")
async def super_admin_dashboard(user: dict = Depends(get_current_user)):
    """Cross-school KPIs for the Super Admin role."""
    if user.get('role') != 'Super Admin':
        raise HTTPException(403, "Super Admin only")
    schools = await db.schools.find({}, {"_id": 0}).to_list(500)
    out = []
    grand = {'teachers': 0, 'classes': 0, 'subjects': 0, 'cells': 0, 'constraints': 0, 'facilities': 0}
    for s in schools:
        sid = s['id']
        stats = {
            'school_id': sid, 'name': s.get('name'), 'board': s.get('board'),
            'location': s.get('location'),
            'teachers': await db.teachers.count_documents({"school_id": sid}),
            'subjects': await db.subjects.count_documents({"school_id": sid}),
            'classes': await db.classes.count_documents({"school_id": sid}),
            'sections': await db.sections.count_documents({"school_id": sid}),
            'facilities': await db.facilities.count_documents({"school_id": sid}),
            'cells': await db.timetable.count_documents({"school_id": sid}),
            'constraints': await db.constraints.count_documents({"school_id": sid}),
        }
        for k in grand:
            grand[k] += stats[k]
        out.append(stats)
    cross = await db.teachers.count_documents({"is_cross_school": True})
    return {"schools": out, "totals": {**grand, 'visiting_faculty': cross, 'total_schools': len(out)}}


@router.get("/schools/{school_id}/teachers-cross-school")
async def cross_school_teachers(school_id: str, user: dict = Depends(get_current_user)):
    """Return teachers from OTHER schools that have been opted in for visiting/virtual at this school,
    plus this school's own teachers tagged is_cross_school."""
    own = await db.teachers.find({"school_id": school_id, "is_cross_school": True}, {"_id": 0}).to_list(200)
    visiting = await db.teachers.find({
        "school_id": {"$ne": school_id},
        "is_cross_school": True,
        "cross_school_ids": school_id,
    }, {"_id": 0}).to_list(200)
    return {"own_cross_school": [serialize_doc(t) for t in own],
            "visiting": [serialize_doc(t) for t in visiting]}
