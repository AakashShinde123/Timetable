"""
School Time Table Management System - Slim main entrypoint.
- Modules: db.py · models.py · deps.py · constraint_engine.py · seed_data.py
- Routers: routers/{auth, schools, masters, timetable, ai}.py
"""
import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import client
from routers import auth as auth_router
from routers import schools as schools_router
from routers import masters as masters_router
from routers import timetable as timetable_router
from routers import ai as ai_router
from routers import attendance as attendance_router
from routers import members as members_router

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="School Timetable Management")

app.include_router(auth_router.router)
app.include_router(schools_router.router)
app.include_router(masters_router.router)
app.include_router(timetable_router.router)
app.include_router(ai_router.router)
app.include_router(attendance_router.router)
app.include_router(members_router.router)


@app.get("/api/")
async def root():
    return {"message": "School Timetable Management API", "status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_indexes():
    """Ensure indexes on hot collections."""
    from db import db
    from datetime import datetime as _dt, timezone as _tz
    try:
        ttl_days = int(os.environ.get('ATTENDANCE_TTL_DAYS', '365'))
        ttl_seconds = ttl_days * 86400
        # Drop the old (mis-typed) TTL if it was created on created_at (ISO string)
        try:
            info = await db.attendance.index_information()
            if 'attendance_created_at_ttl' in info:
                await db.attendance.drop_index('attendance_created_at_ttl')
            cur = info.get('attendance_ttl_at_ttl')
            if cur and cur.get('expireAfterSeconds') != ttl_seconds:
                await db.attendance.drop_index('attendance_ttl_at_ttl')
        except Exception:
            pass
        await db.attendance.create_index(
            "ttl_at", expireAfterSeconds=ttl_seconds, name="attendance_ttl_at_ttl",
        )
        # Backfill ttl_at for old rows that only have ISO created_at
        async for d in db.attendance.find({"ttl_at": {"$exists": False}}, {"_id": 1, "created_at": 1}).limit(20000):
            try:
                ts = d.get('created_at')
                if isinstance(ts, str):
                    dt = _dt.fromisoformat(ts.replace('Z', '+00:00'))
                elif isinstance(ts, _dt):
                    dt = ts
                else:
                    dt = _dt.now(_tz.utc)
                await db.attendance.update_one({"_id": d['_id']}, {"$set": {"ttl_at": dt}})
            except Exception:
                continue
        # Query-pattern indexes
        await db.attendance.create_index([("school_id", 1), ("date", -1), ("time", -1)],
                                          name="attendance_school_date")
        await db.attendance.create_index([("school_id", 1), ("teacher_id", 1), ("date", 1)],
                                          name="attendance_school_teacher_date")
        logger.info("Indexes ensured on attendance (TTL=%sd)", ttl_days)
    except Exception as e:
        logger.warning("Index ensure failed: %s", e)


@app.on_event("startup")
async def startup_scheduler():
    try:
        from scheduler import start_scheduler
        await start_scheduler()
    except Exception as e:
        logger.warning("Scheduler failed to start: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        from scheduler import shutdown_scheduler
        await shutdown_scheduler()
    except Exception:
        pass
    client.close()
