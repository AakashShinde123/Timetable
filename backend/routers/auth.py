"""Auth router: Emergent Google OAuth session exchange + me + logout."""
import uuid
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Request, Response, Depends, Body

from db import db
from deps import get_current_user
from models import serialize_doc

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get('session_id')
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient() as http_client:
        r = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}, timeout=15.0,
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data['email']
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing['user_id']
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get('name', existing.get('name')), "picture": data.get('picture')}}
        )
        role = existing.get('role', 'School Admin')
        school_ids = existing.get('school_ids', [])
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        count = await db.users.count_documents({})
        role = "Super Admin" if count == 0 else "School Admin"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": data.get('name', email),
            "picture": data.get('picture'), "role": role, "school_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        school_ids = []

    session_token = data['session_token']
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 60 * 60,
    )
    return {
        "user_id": user_id, "email": email, "name": data.get('name'),
        "picture": data.get('picture'), "role": role, "school_ids": school_ids,
    }


@router.get("/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return serialize_doc(user)


@router.post("/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get('session_token')
    if not token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
