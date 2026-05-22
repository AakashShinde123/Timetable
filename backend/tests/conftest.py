import os
import time
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sched-matrix.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def session_token():
    """Inject a Super Admin session via direct mongo insert."""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    client = MongoClient(mongo_url)
    db = client[db_name]
    ts = int(time.time() * 1000)
    user_id = f"test-user-{ts}"
    token = f"test_session_{ts}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"test.{ts}@example.com",
        "name": "Test User",
        "role": "Super Admin",
        "school_ids": [],
        "created_at": datetime.now(timezone.utc),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    yield token
    # Cleanup
    db.user_sessions.delete_many({"session_token": token})
    db.users.delete_many({"user_id": user_id})


@pytest.fixture(scope="session")
def auth_client(session_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {session_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
