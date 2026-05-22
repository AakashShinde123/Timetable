# Sri Ma One Timetable — PRD

## Original Problem Statement
Build a school time table management system as a web app with 60-70 constraints, configurable per school, with teachers, classrooms, shifts, class teacher classification, subjects, labs, out-of-classroom activities, constraint logic builder, period masters, stop-gap suggestion widget for absent teachers / substitutions, drag-and-drop timetable creator, teacher profiles with photos, AI-assisted auto-generation and optimization. Designed for Indian schools (CBSE etc.).

Iteration 5 additions (from user): rebrand to "Sri Ma One Timetable"; Facility Management for each school — classes mapped to available indoor + outdoor spaces with clash detection; stop-gap substitution widget on dashboard; Super-Admin dashboard entry point; Standard/Division terminology refactor across the UI.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB). Modular routers under `/app/backend/routers/{auth, schools, masters, timetable, ai}.py`.
- **Frontend**: React 19 + react-router 7 + Shadcn UI + Tailwind. Swiss / high-contrast theme (#002FA7 primary).
- **Auth**: Emergent-managed Google OAuth (httpOnly session cookies). First signed-in user = Super Admin.
- **AI**: Claude Sonnet 4.5 via `emergentintegrations` (Emergent Universal Key) for timetable optimization, NL→constraint, substitute commentary.
- **Multi-tenant**: All masters scoped by `school_id`.

## User Personas
- Super Admin (first signed-in user) — cross-school control
- School Admin — per-school masters, timetables, constraints
- Principal / Supervisor / Subject Incharge — view & approve
- Teacher — own schedule view

## Core Requirements
1. Multi-school configuration
2. Teachers (photo, abbreviation UPPERCASE, subjects, qualifications, class-teacher flag, workload limits, cross-school flag)
3. Subjects master (code, color, lab flag, periods/week)
4. **Sections** (Primary / Secondary / Sr.Secondary / Kindergarten) mapped to shift
5. **Classes** identified by Standard + Division, mapped to Section + home Facility
6. **Facilities** (Indoor / Outdoor) with capacity, location, is_shared toggle
7. Labs (type, capacity, location)
8. Shifts + Periods (with breaks)
9. Activities (out-of-classroom)
10. Drag & drop timetable builder with real-time clash detection (teacher, lab, facility)
11. Visual constraint builder + 60-70 constraint catalogue
12. AI auto-generate + AI optimize (one-click apply with pre-validation dry-run)
13. AI substitution suggester
14. Audit dashboard (per-class heat-map, top-violated rules, snapshot history)
15. PDF exports — class timetable, teacher schedule, bell schedule

## Implemented Modules (current)
- **Auth** — Emergent Google SSO + role assignment
- **Schools** — CRUD, workspace switcher, Super-Admin button
- **Super-Admin Dashboard** — cross-school KPIs at `/super`
- **Sections** — Primary/Secondary mapped to shifts (`/school/:sid/sections`)
- **Classes** — Standard/Division + Section + Home Facility + Shift
- **Facilities** — Indoor/Outdoor CRUD + conflict report (`/school/:sid/facilities`)
- **Teachers** — visiting/cross-school faculty supported
- **Visiting Faculty** — view own cross-school teachers + visiting ones
- **Subjects, Labs, Activities, Shifts & Periods, Allotments** — full CRUDs
- **Constraint catalogue** — visual chips/tokens with similar-rule sidebar
- **Timetable builder** — drag-drop, teacher/lab/facility clash detection, validate, audit, auto-generate
- **AI Optimize** — structured MOVE/SWAP suggestions, one-click Apply with violation dry-run
- **Audit Dashboard** — heat-map + history snapshots
- **PDF exports** — class, teacher, bell schedule (school logo on cover)
- **Stop-gap widget** — today's substitutions on School Dashboard

## Tech Stack
- Python: FastAPI, Motor, ReportLab, emergentintegrations, pytest
- JS: React 19, react-router 7, Tailwind, Shadcn UI, sonner, lucide-react

## Key DB Schema (additions in iter 5)
- `facilities`: `{ id, school_id, name, type: Indoor|Outdoor, capacity, location, is_shared, description }`
- `classes`: now stores `standard`, `division`, `section_id`, `facility_id`, `shift_id` (legacy `grade`/`section` migrated)
- `timetable_cells`: now stores `facility_id` (overrides class home facility for that slot)

## Key API Endpoints (iter 5)
- `GET/POST/PUT/DELETE /api/schools/{sid}/facilities`
- `GET /api/schools/{sid}/facility-conflicts`
- `PUT /api/schools/{sid}/timetable/cell` — now returns `facility_clash` in `clashes[]`
- `GET /api/schools/{sid}/stats` — includes `facilities` count
- `GET /api/super-admin/dashboard` — totals include `facilities`

## Testing
- **63/63 pytest cases passing** (iter 1-5 cumulative) — `/app/backend/tests/test_backend.py`
- Frontend flows verified end-to-end via testing agent in iteration 5
- Test reports: `/app/test_reports/iteration_1.json` … `iteration_5.json`

## Changelog
- **2026-02 · iter 12**: Frontend E2E re-validation of Iter-11 UX (testing_agent_v3_fork). **Fixed** carry-over regression: `Substitutions.jsx` now wraps "Confirm All & Notify" in `AlertDialog` with `confirm-all-confirm` + `confirm-all-cancel` testids (verified via Playwright). **Fixed** `Shifts.jsx` nested-`<button>` DOM warning by converting outer shift-card to `<div role="button" tabIndex={0}>`. Re-validated **Teacher Portal auth scoping** end-to-end via curl: admin=200, mismatched-email teacher=403, matching-email teacher=200 on both `/teachers/{tid}/schedule` and `/teachers/{tid}/schedule/pdf` (backend pytest `TestIter6TeacherEmailScoping` continues passing).
- **2026-02 · iter 10**: Removed all Emergent branding from the frontend (badge / script / meta description / Login copy). Multi-time daily cron — `School.auto_sync_times: List[str]` + `notify_latecomers` flag → scheduler registers one job per (school × time), each fire runs eSSL pull → auto-from-attendance → latecomer Twilio pings → optional confirm-all. `confirm-all-and-notify` now returns HTTP **202** with `asyncio.create_task` background work (set `background:false` for sync). Members permission matrix rebuilt as a **uniform table** — columns dynamically derived from vocabulary actions; every cell is a Checkbox (disabled+greyed when not applicable). **126/126 backend pytests** (97 base + 23 iter-9 + 6 iter-10).
- **2026-02 · iter 9**: Server-side permission gates on masters CRUD. Twilio (WhatsApp → SMS fallback) helper. APScheduler daily auto-sync. SchoolDashboard Auto-Sync widget. Members "Add User" + matrix table. 120/120 backend pytests.
- **2026-02 · iter 7**: Auto-Substitution from Attendance, Schedule Activity modal, Class facility auto-match, School Members + tickable permissions, Help Tab. 97/97 backend pytests.
- **2026-02 · iter 6**: Labs merged into Facilities, Activities multi-class targets, Teacher portal email-scoped, Attendance + eSSL, Facility palette in Timetable. 84/84 backend pytests.
- **2026-02 · iter 5**: Rebrand to "Sri Ma One Timetable", Facility Management, Classes Standard/Division refactor, Super Admin button, Stop-gap widget. 63/63 backend pytests.
- **2026-02 · iter 4**: AI Optimize structured moves, one-click Apply with dry-run, audit history, PDF exports, Super-Admin dashboard, Visiting Faculty page, Sections master.
- **2026-02 · iter 3**: Backend refactor → modular routers, special constraint handlers, Activities UI, AI auto-improve.
- **2026-02 · iter 2**: Constraint enforcement engine, dry-run validate, auto-generate, bulk allotments, teacher portal.
- **2026-02 · iter 1**: MVP — schools, masters, drag-drop, NL constraints, sub-suggester, Sri Ma seed.

## Roadmap / Backlog
- **P1**: Wire facility selector into the drag-drop Timetable cell editor (currently uses class home facility automatically — explicit override per cell available via API but not yet via UI)
- **P1**: Facility booking calendar (separate from class timetable) for after-school events
- **P2**: ~~Teacher portal hardening — scope `/teacher/:tid` so teachers only see their own schedules~~ ✅ Done in iter-12 (backend pytest + curl validated)
- **P2**: Working-days & holiday calendar
- **P2**: Email notifications for substitution confirmations (SendGrid/Resend)
- **P2**: Role-permission matrix
- **P2**: Mobile app / PWA for teacher self-service
- **P3**: Multi-language UI (Hindi/Marathi)

## Known design polish (non-blocking)
- A11y: add `aria-describedby` to Facilities + Classes Dialog content (radix warning, not a bug)
