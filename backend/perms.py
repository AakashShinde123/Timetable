"""Permission helpers and route guard."""
from fastapi import HTTPException
from db import db


async def get_member_permissions(school_id: str, user: dict) -> list:
    """Return the effective permissions list for `user` against `school_id`.
    Super Admin always returns ALL permissions (handled via wildcard '*')."""
    if user.get('role') == 'Super Admin':
        return ['*']
    mem = await db.school_members.find_one(
        {"school_id": school_id, "user_id": user.get('user_id')}, {"_id": 0}
    )
    if not mem:
        # Fallback: match by email (lowercased) when user_id hasn't been linked yet
        mem = await db.school_members.find_one(
            {"school_id": school_id, "email": (user.get('email') or '').lower()}, {"_id": 0}
        )
    if not mem or mem.get('status') == 'revoked':
        # Backwards compatibility: if the user has the school in user.school_ids (legacy seed flow),
        # grant a default School Admin role implicitly. New invites must use members CRUD.
        if school_id in (user.get('school_ids') or []):
            return ['*']
        return []
    return mem.get('permissions') or []


async def require_perm(school_id: str, user: dict, perm: str):
    """Raise 403 if the user doesn't have the requested permission."""
    perms = await get_member_permissions(school_id, user)
    if '*' in perms or perm in perms:
        return True
    raise HTTPException(403, f"Permission denied — {perm} required")
