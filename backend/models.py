"""All Pydantic models for the timetable system."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "School Admin"
    school_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class School(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"sch_{uuid.uuid4().hex[:10]}")
    name: str
    location: str = ""
    board: str = "CBSE"
    logo: Optional[str] = None
    auto_sync_enabled: bool = False
    auto_sync_time: str = "07:30"
    auto_sync_times: List[str] = []           # Multiple fire times, e.g. ["07:10","07:15","07:25"]
    auto_sync_essl_device_id: Optional[str] = None
    auto_confirm_substitutions: bool = False
    notify_latecomers: bool = True            # On each fire after first, ping teachers not yet punched
    expected_arrival_time: str = "07:30"      # Cutoff used to decide who's "late"
    settings: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Section(BaseModel):
    """Top-level grouping inside a school: Primary, Secondary, Sr.Secondary, Kindergarten.
    Each section is mapped to one shift. Classes & teachers can be mapped to sections."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"sec_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str  # Primary | Secondary | Sr.Secondary | Kindergarten or custom
    shift_id: Optional[str] = None
    description: Optional[str] = ""
    order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"tch_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    abbreviation: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    photo: Optional[str] = None
    subjects: List[str] = []
    section_ids: List[str] = []
    shift_ids: List[str] = []
    qualifications: Optional[str] = ""
    is_class_teacher: bool = False
    class_teacher_of: Optional[str] = None
    is_cross_school: bool = False  # Visiting faculty / virtual teacher
    cross_school_ids: List[str] = []  # Other schools the teacher is shared with
    essl_user_id: Optional[str] = None  # ID assigned in eSSL/ZK device
    phone: Optional[str] = ""           # E.164 format, e.g. +919876543210 — used for Twilio SMS/WhatsApp
    max_periods_per_day: int = 6
    max_periods_per_week: int = 30
    notes: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"sub_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    code: str
    color: str = "#0055FF"
    is_lab: bool = False
    periods_per_week: int = 5
    grade_levels: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ClassRoom(BaseModel):
    """A class (eg. Standard 6 - Division A). Mapped to a Section and Shift."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"cls_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str  # e.g. "Standard 6 - A"
    standard: str  # e.g. "Standard 6"
    division: str  # e.g. "A"
    section_id: Optional[str] = None  # Primary / Secondary / etc
    room_no: Optional[str] = ""
    facility_id: Optional[str] = None  # Home space (indoor classroom or outdoor area)
    strength: int = 30
    class_teacher_id: Optional[str] = None
    shift_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditRun(BaseModel):
    """A snapshot of an audit-all run for trend tracking."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"aud_{uuid.uuid4().hex[:10]}")
    school_id: str
    totals: Dict[str, int] = Field(default_factory=dict)
    top_rules: List[Dict[str, Any]] = []
    categories: List[str] = []
    note: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Lab(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"lab_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    type: str = "General"
    capacity: int = 30
    location: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Facility(BaseModel):
    """A physical space (indoor classroom, outdoor ground, auditorium, music room, lab…).
    Classes are mapped to a home facility. A timetable cell can optionally override the
    facility for that period (e.g. PT class moves to the outdoor playground)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"fac_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    type: str = "Indoor"  # Indoor | Outdoor | Lab
    capacity: int = 40
    location: Optional[str] = ""
    is_shared: bool = False  # If true, multiple classes can use simultaneously (e.g. open courtyard)
    subject_codes: List[str] = []  # For Labs: which subjects can use this lab
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Shift(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"shf_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    start_time: str
    end_time: str
    working_days: List[str] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Period(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"prd_{uuid.uuid4().hex[:10]}")
    school_id: str
    shift_id: str
    order: int
    name: str
    start_time: str
    end_time: str
    is_break: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"act_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    color: str = "#FFCC00"
    is_out_of_classroom: bool = True
    type: str = "Indoor"  # Indoor | Outdoor
    facility_id: Optional[str] = None  # Default facility for this activity
    target_class_ids: List[str] = []   # Multi-class targets (Assembly, Sports Day, House meet…)
    periods_per_week: int = 0
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ESSLDevice(BaseModel):
    """Configuration for an eSSL/ZKTeco face-reader device. Stored per school."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"essl_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    ip: str
    port: int = 4370
    password: int = 0       # Comm password (numeric)
    timeout: int = 8
    force_udp: bool = False
    ommit_ping: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Attendance(BaseModel):
    """A single attendance punch (in or out) from a teacher."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"att_{uuid.uuid4().hex[:10]}")
    school_id: str
    teacher_id: Optional[str] = None  # Resolved teacher (may be None if unmapped)
    raw_user_id: str = ""             # eSSL device user id
    raw_user_name: Optional[str] = ""
    date: str                          # YYYY-MM-DD
    time: str                          # HH:MM:SS
    punch_type: str = "in"             # in | out | other
    source: str = "manual"             # essl-network | file-upload | manual
    device_id: Optional[str] = None
    status: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Permissions vocabulary — used for tickable per-member capabilities
PERMISSIONS = [
    "teachers.manage", "subjects.manage", "classes.manage",
    "sections.manage", "facilities.manage", "activities.manage",
    "shifts.manage", "labs.manage", "allotments.manage",
    "constraints.manage", "timetable.edit", "timetable.generate",
    "ai.run", "substitutions.manage", "audit.view", "audit.snapshot",
    "attendance.view", "attendance.manage",
    "users.manage", "school.settings",
]

# Pre-baked role → permission templates the UI can use as starting points
ROLE_PRESETS = {
    "School Admin":     PERMISSIONS,  # full
    "Principal":        [p for p in PERMISSIONS if p != "users.manage"],
    "Supervisor":       ["timetable.edit", "constraints.manage", "audit.view",
                          "audit.snapshot", "substitutions.manage", "attendance.view",
                          "teachers.manage", "classes.manage", "ai.run"],
    "Subject Incharge": ["allotments.manage", "constraints.manage", "audit.view",
                          "timetable.edit", "ai.run"],
    "Teacher":          ["attendance.view"],
    "Viewer":           ["audit.view"],
}


class SchoolMember(BaseModel):
    """Per-school membership record. One user can be a member of multiple schools
    with different roles + permissions. The first Super Admin user does not need a row."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"mbr_{uuid.uuid4().hex[:10]}")
    school_id: str
    user_id: Optional[str] = None       # Set when user signs up; until then it's an invite
    email: str                           # Lowercase
    name: Optional[str] = ""
    role: str = "Viewer"
    permissions: List[str] = []
    status: str = "invited"              # invited | active | revoked
    invited_by: Optional[str] = None
    invited_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TimetableCell(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"ttc_{uuid.uuid4().hex[:10]}")
    school_id: str
    class_id: str
    day: str
    period_id: str
    subject_id: Optional[str] = None
    teacher_id: Optional[str] = None
    lab_id: Optional[str] = None
    facility_id: Optional[str] = None  # Overrides class home facility for this slot
    activity_id: Optional[str] = None
    notes: Optional[str] = ""
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Constraint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"con_{uuid.uuid4().hex[:10]}")
    school_id: str
    name: str
    description: Optional[str] = ""
    severity: str = "hard"
    category: str = "general"
    conditions: List[Dict[str, Any]] = []
    action: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ClassSubjectAllotment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"alt_{uuid.uuid4().hex[:10]}")
    school_id: str
    class_id: str
    subject_id: str
    periods_per_week: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Substitution(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"sub_{uuid.uuid4().hex[:10]}")
    school_id: str
    absent_teacher_id: str
    date: str
    substitute_teacher_id: Optional[str] = None
    period_id: Optional[str] = None
    class_id: Optional[str] = None
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    for k in ('created_at', 'updated_at', 'expires_at'):
        if k in doc and isinstance(doc[k], datetime):
            doc[k] = doc[k].isoformat()
    doc.pop('_id', None)
    return doc
