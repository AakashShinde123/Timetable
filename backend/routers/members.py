"""School Members CRUD + permissions vocabulary endpoints."""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body

from db import db
from deps import get_current_user
from perms import require_perm
from models import SchoolMember, PERMISSIONS, ROLE_PRESETS, serialize_doc

router = APIRouter(prefix="/api", tags=["members"])


@router.get("/permissions/vocabulary")
async def list_permissions(user: dict = Depends(get_current_user)):
    """Return the available permission keys + role presets so the UI can render the matrix."""
    return {"permissions": PERMISSIONS, "role_presets": ROLE_PRESETS}


@router.get("/schools/{school_id}/members")
async def list_members(school_id: str, user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "users.manage")
    docs = await db.school_members.find({"school_id": school_id}, {"_id": 0}).to_list(500)
    return [serialize_doc(d) for d in docs]


@router.get("/schools/{school_id}/members/me")
async def my_permissions(school_id: str, user: dict = Depends(get_current_user)):
    """Used by the frontend to know which buttons to hide for the current user."""
    from perms import get_member_permissions
    perms = await get_member_permissions(school_id, user)
    mem = await db.school_members.find_one(
        {"school_id": school_id, "email": (user.get('email') or '').lower()}, {"_id": 0}
    )
    return {
        "user_id": user.get('user_id'), "email": user.get('email'),
        "global_role": user.get('role'),
        "school_role": (mem or {}).get('role'),
        "permissions": perms,
        "is_super_admin": user.get('role') == 'Super Admin',
        "has_all": '*' in perms,
    }


@router.post("/schools/{school_id}/members")
async def add_member(school_id: str, payload: Dict[str, Any] = Body(...),
                     user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "users.manage")
    email = (payload.get('email') or '').strip().lower()
    if not email:
        raise HTTPException(400, "email required")
    role = payload.get('role', 'Viewer')
    perms_list = payload.get('permissions')
    if perms_list is None:
        perms_list = ROLE_PRESETS.get(role, [])
    # Reject perms not in vocabulary
    perms_list = [p for p in perms_list if p in PERMISSIONS]
    # Dedupe by school+email
    existing = await db.school_members.find_one({"school_id": school_id, "email": email}, {"_id": 0})
    if existing:
        await db.school_members.update_one(
            {"id": existing['id']},
            {"$set": {"role": role, "permissions": perms_list, "status": "active",
                       "name": payload.get('name', existing.get('name', ''))}}
        )
        doc = await db.school_members.find_one({"id": existing['id']}, {"_id": 0})
        return serialize_doc(doc)
    # If the email already has a user, link directly
    linked = await db.users.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    mem = SchoolMember(
        school_id=school_id, email=email,
        name=payload.get('name', ''),
        role=role, permissions=perms_list,
        user_id=(linked or {}).get('user_id'),
        invited_by=user.get('user_id'),
        status="active" if linked else "invited",
    )
    doc = mem.model_dump()
    doc['invited_at'] = doc['invited_at'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    if doc.get('last_seen_at'):
        doc['last_seen_at'] = doc['last_seen_at'].isoformat()
    await db.school_members.insert_one(doc)
    if linked:
        await db.users.update_one({"user_id": linked['user_id']},
                                  {"$addToSet": {"school_ids": school_id}})
    return serialize_doc(doc)


@router.put("/schools/{school_id}/members/{member_id}")
async def update_member(school_id: str, member_id: str, payload: Dict[str, Any] = Body(...),
                        user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "users.manage")
    upd = {}
    if 'role' in payload:
        upd['role'] = payload['role']
    if 'permissions' in payload:
        upd['permissions'] = [p for p in (payload['permissions'] or []) if p in PERMISSIONS]
    if 'status' in payload and payload['status'] in ('active', 'revoked'):
        upd['status'] = payload['status']
    if 'name' in payload:
        upd['name'] = payload['name']
    await db.school_members.update_one(
        {"id": member_id, "school_id": school_id}, {"$set": upd}
    )
    doc = await db.school_members.find_one({"id": member_id}, {"_id": 0})
    return serialize_doc(doc) if doc else {"ok": True}


@router.delete("/schools/{school_id}/members/{member_id}")
async def delete_member(school_id: str, member_id: str, user: dict = Depends(get_current_user)):
    await require_perm(school_id, user, "users.manage")
    doc = await db.school_members.find_one({"id": member_id, "school_id": school_id}, {"_id": 0})
    if doc and doc.get('user_id'):
        await db.users.update_one({"user_id": doc['user_id']},
                                  {"$pull": {"school_ids": school_id}})
    await db.school_members.delete_one({"id": member_id, "school_id": school_id})
    return {"ok": True}
