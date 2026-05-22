import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Search, ChevronDown, ChevronRight, GraduationCap, Home, Sparkles, ClipboardCheck,
  ShieldCheck, CalendarRange, Users, Building, BookOpen, SlidersHorizontal, Activity,
  UserMinus, Layers, Server, Zap, ListChecks, FileDown, Wand2,
} from 'lucide-react';

/* Each topic is a guided walkthrough. Steps = ordered numbered list with title + body.
   The first topic is the canonical first-time setup. */
const TOPICS = [
  {
    id: 'first-time-setup', icon: Home, title: 'First-Time Setup (5 minutes)',
    summary: 'The shortest path from "fresh install" to "first working timetable".',
    steps: [
      { t: 'Sign in', b: 'Click "Continue with Google" on the login screen. The very first user becomes Super Admin and bypasses every per-school permission.' },
      { t: 'Create or seed a School', b: 'On the Schools page, click "New School". Or use "Seed Sri Ma Vidyalaya" to bootstrap a realistic demo (44 teachers, 43 classes, 666 allotments, 39 rules).' },
      { t: 'Open the school workspace', b: 'Click on the school card. You\'ll land on the Dashboard.' },
      { t: 'Configure Shifts & Periods', b: 'Sidebar → Shifts & Periods. Add a shift (e.g. "Morning 07:30-13:30"), then add 7-8 periods with break rows for Recess and Lunch.' },
      { t: 'Add Sections (Primary, Secondary…)', b: 'Sidebar → Sections. Sections are blocks like Primary / Secondary / Sr.Secondary. Each maps to one or more shifts.' },
      { t: 'Add Facilities', b: 'Sidebar → Facilities. Indoor classrooms, Outdoor spaces (Playground, Courtyard), and Labs. Tick "Shared" for spaces multiple classes can use at the same time.' },
      { t: 'Add Classes', b: 'Sidebar → Classes → "New Class". Set Standard (e.g. "Standard 6") + Division (e.g. "A"), then attach the Section, Shift, home Facility and a Class Teacher.' },
      { t: 'Add Teachers + Subjects + Allotments', b: 'Standard masters. The Allotments page lets you bulk-paste class → subject → periods/week.' },
      { t: 'Build the Timetable', b: 'Sidebar → Timetable Builder. Pick a class; drag Teachers, Subjects, Labs and Facilities from the right rail onto the day × period grid.' },
      { t: 'Use AI Optimize', b: 'Click the "AI Optimize" button — Claude inspects violations and suggests concrete MOVE/SWAP fixes you can apply with one click.' },
    ],
  },
  {
    id: 'classes', icon: GraduationCap, title: 'Working with Classes',
    summary: 'How Standard, Division, Section, Shift and Facility connect on the Classes screen.',
    steps: [
      { t: 'Vocabulary', b: '"Standard" = grade level (Standard 1 → Standard 12). "Division" = the alphabet suffix (A, B, C…). "Section" = a higher-level block (Primary, Secondary, Sr.Secondary, KG). Class name is auto-derived as "Standard X · Division Y".' },
      { t: 'Identity panel', b: 'In the New Class dialog the blue stripe is Identity — Standard, Division, Section.' },
      { t: 'Location panel', b: 'The teal stripe is Location — pick a Home Facility (indoor classroom / outdoor / lab) the class normally occupies. Room No is a legacy free-text field for migration.' },
      { t: 'Operations panel', b: 'The green stripe is Operations — Shift, Strength (head count), Class Teacher.' },
      { t: 'Auto-match Facilities', b: 'If you have legacy Room No values, click "Auto-match Facilities" on the Classes page. It fuzzy-matches Room No → Facility name/location and upgrades the mapping in one click.' },
      { t: 'Filters', b: 'Use the Shift and Section filters at the top of the table to narrow down. Classes are visually grouped by Section.' },
    ],
  },
  {
    id: 'timetable', icon: CalendarRange, title: 'Timetable Builder',
    summary: 'Drag-and-drop with real-time clash detection — including multi-shift schools.',
    steps: [
      { t: 'Pick a Shift (multi-shift schools only)', b: 'When the school has more than one Shift, the toolbar shows a Shift picker first. Period rows and the Class dropdown filter to the chosen shift.' },
      { t: 'Pick a Class', b: 'The grid loads cells in this class\'s shift. Drag any palette item into a cell.' },
      { t: 'Palettes', b: 'Right rail has 4 palettes — Teachers, Subjects, Labs, Facilities. Drop any of them onto a day × period cell. Drop a Facility onto a cell to override the class\'s home facility for that period (PT going to Playground).' },
      { t: 'Read the cell borders', b: 'Red border = hard clash (teacher / lab / facility double-booking). Yellow border = soft constraint violation. Hover the cell for the full reason list.' },
      { t: 'Schedule Activity', b: 'Yellow "Activity" button opens a dialog: pick activity, day, period, and multi-select target classes. Used for Assembly, Sports Day, House Meet etc.' },
      { t: 'Auto-Generate', b: 'Greedy filler that respects allotments + hard constraints. Then use AI Optimize to clean up soft violations.' },
      { t: 'AI Optimize', b: 'Sends current violations + cells to Claude. UI shows concrete MOVE/SWAP suggestions. Click Apply — dry-run validates the suggestion before persisting, so it never introduces new violations.' },
      { t: 'Export PDF', b: 'Class timetable, teacher schedule, full bell schedule — all with school logo on the cover.' },
    ],
  },
  {
    id: 'attendance', icon: ClipboardCheck, title: 'Attendance · eSSL + File Upload',
    summary: 'Pull punches live from your face reader, or fall back to CSV.',
    steps: [
      { t: 'Configure the eSSL device', b: 'Sidebar → Attendance → "Device". Enter the device IP (default port 4370), comm password, and pick TCP or UDP. You can store multiple devices per school.' },
      { t: 'Map Teacher to device User ID', b: 'On the Teachers page, set "essl_user_id" to match the User ID on the device. Or leave it blank — the importer also tries to match by name and email.' },
      { t: 'Live sync', b: 'Click "Sync now" on a device card. pyzk talks ZK protocol over the network, pulls the last 7 days of punches, dedups, persists.' },
      { t: 'File fallback', b: 'When the device is unreachable, click "Upload CSV / XLSX". Common eSSL exports work out-of-the-box (UserID/Name/Date/Time or DateTime columns).' },
      { t: 'Read the summary', b: 'KPIs: Present / Absent / Unmapped (rows the importer couldn\'t link to a teacher). Per-teacher table shows first-in and last-out.' },
      { t: 'Retention', b: 'Punches have a Mongo TTL (default 365 days, override ATTENDANCE_TTL_DAYS env). Old rows auto-expire — keeps the collection light.' },
    ],
  },
  {
    id: 'autosync', icon: Zap, title: 'Daily Auto-Sync · Multi-time Cron',
    summary: 'Run the eSSL → substitutes → notify pipeline at fixed times every morning.',
    steps: [
      { t: 'Open Dashboard → Auto-Sync widget', b: 'Switch "Enabled" on.' },
      { t: 'Set fire times', b: 'Comma-separated 24h times, e.g. "07:10, 07:15, 07:25". The scheduler registers one cron job per (school × time).' },
      { t: 'Pick eSSL device', b: 'Choose the device to pull from. Skip to use file uploads only.' },
      { t: 'Latecomer Alerts', b: 'When on, each fire pings teachers who have classes today but no punch yet via Twilio.' },
      { t: 'Auto-Confirm + Notify', b: 'When on, each fire also confirms all suggested substitutes and pings the substitute teachers (WhatsApp → SMS fallback).' },
      { t: 'Run now', b: 'For testing — runs the full pipeline once without waiting for the next cron.' },
    ],
  },
  {
    id: 'substitutions', icon: UserMinus, title: 'Substitutions',
    summary: 'Mark teachers absent, get AI-ranked substitutes, send notifications.',
    steps: [
      { t: 'Auto-Suggest from Attendance', b: 'On the Substitutions page click the green button. It scans today\'s eSSL punches, identifies absent teachers, and queues a suggested substitute for each of their scheduled cells.' },
      { t: 'Manual flow', b: 'Pick a teacher + date. Claude ranks free substitutes per affected period with reasons (Teaches subject / Load OK / etc.).' },
      { t: 'Confirm All & Notify', b: 'Flip every "suggested" row to "confirmed" for the date and send a WhatsApp/SMS per substitute teacher. Runs as a background job — UI returns instantly with a job-id and live counter.' },
      { t: 'Twilio setup', b: 'Add TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_PHONE / TWILIO_WHATSAPP_FROM to backend/.env to enable real sends. Until configured, the endpoint flips statuses but skips messaging.' },
    ],
  },
  {
    id: 'users-roles', icon: ShieldCheck, title: 'Users & Roles',
    summary: 'Add users to a school and tick the exact permissions they get.',
    steps: [
      { t: 'Add User', b: 'Sidebar → Users & Roles → "Add User". Enter email. If they\'ve already signed up, they\'re linked instantly.' },
      { t: 'Role preset', b: 'School Admin (full), Principal (no users.manage), Supervisor, Subject Incharge, Teacher, Viewer. Picking a preset pre-fills the matrix.' },
      { t: 'Permission Matrix', b: 'Rows = resources (Teachers, Subjects, Classes…). Columns = actions (View, Manage, Edit, Generate, Run, Snapshot, Settings). Tick boxes to fine-tune. Disabled checkboxes (greyed) mean the action does not apply for that resource — hover them for a tooltip.' },
      { t: 'Server-side enforcement', b: 'Every POST/PUT/DELETE on masters and operations checks the user\'s permissions. A "Viewer" cannot create teachers even if the UI is tampered with.' },
      { t: 'Super Admin', b: 'The very first signed-in user is Super Admin — bypasses all per-school checks across every school.' },
    ],
  },
  {
    id: 'constraints', icon: SlidersHorizontal, title: 'Constraints',
    summary: 'Build IF-THEN rules visually, or type them in English.',
    steps: [
      { t: 'Visual builder', b: 'Pick a rule type, drop in chips (subject = MAT, period IN 1..3, teacher = JKS). Severity: Hard (must) or Soft (prefer).' },
      { t: 'Natural language', b: 'Type "Maths should only be in periods 1-3" and Claude parses it into a structured rule.' },
      { t: 'Catalogue & chaining', b: 'When editing, the right panel suggests similar existing rules so you don\'t define the same thing twice.' },
      { t: 'Enforcement', b: 'Every drag-drop and AI suggestion runs the constraint engine. Cells with violations get the red/yellow border in the Timetable Builder.' },
    ],
  },
  {
    id: 'pdf-exports', icon: FileDown, title: 'PDF Exports',
    summary: 'Class timetable, teacher schedule, bell schedule — all branded.',
    steps: [
      { t: 'Class timetable', b: 'Timetable Builder → "PDF" button. Exports the active class\'s grid.' },
      { t: 'Teacher schedule', b: 'Teachers page → click a teacher → "Download PDF". Shows their entire weekly load with class + subject per cell.' },
      { t: 'Bell schedule', b: 'School Dashboard → bell schedule export. Period times across days, useful as a public notice.' },
      { t: 'Logo', b: 'Edit the school → upload a logo. Appears on every PDF cover.' },
    ],
  },
  {
    id: 'faq', icon: Search, title: 'FAQ & Troubleshooting',
    summary: 'Common questions and quick fixes.',
    steps: [
      { t: 'P1 P1 P2 P2 — duplicate periods', b: 'You probably edited Shifts. Go to Shifts & Periods → click "Clean Orphans". Removes periods orphaned by a deleted shift and dedupes any within-shift duplicates.' },
      { t: 'eSSL device says "unreachable"', b: 'Check the device IP, port (default 4370), comm password and that the server is on the same network. Fall back to file upload.' },
      { t: 'My class is "UNMAPPED" in the table', b: 'It has no Facility set and no Room No. Edit the class and pick a Facility, or use "Auto-match Facilities".' },
      { t: 'Why is a column greyed in the permissions matrix?', b: 'That action doesn\'t exist for that resource (e.g. there\'s no "generate" action for Teachers). Hover the disabled checkbox for the tooltip.' },
      { t: 'Background job didn\'t fire WhatsApp', b: 'Twilio env keys are blank or invalid. Check backend/.env. The endpoint will still have flipped the substitution statuses.' },
      { t: 'How do I delete a school?', b: 'Schools page → click the school → in the dialog, click Delete. This cascades to teachers/classes/timetable/attendance/etc. for that school only.' },
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState('first-time-setup');

  const filtered = TOPICS.filter((t) => {
    if (!q.trim()) return true;
    const hay = (t.title + ' ' + t.summary + ' ' + t.steps.map((s) => s.t + ' ' + s.b).join(' ')).toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      <div className="bg-white border-b border-[#D4D4D8] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="help-home-link">
            <div className="w-9 h-9 bg-[#002FA7] flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-heading font-black text-lg tracking-tighter leading-none">SRI MA ONE</div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#71717A] mt-1">Help & Guide</div>
            </div>
          </Link>
          <Button onClick={() => navigate(-1)} variant="outline" className="rounded-none border-[#D4D4D8] h-9" data-testid="help-back-btn">
            Back
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-12 py-10">
        <div className="mb-10 pb-8 border-b border-[#D4D4D8]">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">DOCS / STEP-BY-STEP</div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] text-[#09090B] mb-6">
            Learn the platform.<br />Step. By. Step.
          </h1>
          <div className="relative max-w-xl">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides… (e.g. attendance, classes, auto-sync)" className="pl-9 rounded-none h-11" data-testid="help-search" />
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-8">
          {/* Side TOC */}
          <nav className="hidden lg:block sticky top-32 self-start" data-testid="help-toc">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A] mb-3">GUIDES</div>
            <ul className="space-y-1">
              {filtered.map((t) => {
                const Icon = t.icon;
                return (
                  <li key={t.id}>
                    <button onClick={() => { setOpenId(t.id); document.getElementById(`topic-${t.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`w-full text-left flex items-center gap-2 px-2 py-2 text-xs hover:bg-white transition ${openId === t.id ? 'bg-white border-l-2 border-[#002FA7] pl-3 font-bold' : 'border-l-2 border-transparent pl-3'}`} data-testid={`toc-${t.id}`}>
                      <Icon className="w-3.5 h-3.5 text-[#002FA7]" />
                      <span>{t.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Topics */}
          <div className="space-y-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="help-topics">
            {filtered.map((t) => {
              const Icon = t.icon;
              const isOpen = openId === t.id;
              return (
                <div key={t.id} id={`topic-${t.id}`} className="bg-white scroll-mt-32" data-testid={`help-topic-${t.id}`}>
                  <button
                    onClick={() => setOpenId(isOpen ? null : t.id)}
                    className="w-full flex items-start gap-3 px-5 py-4 hover:bg-[#FAFAFA] text-left"
                  >
                    <Icon className="w-5 h-5 text-[#002FA7] mt-0.5" />
                    <div className="flex-1">
                      <h2 className="font-heading text-lg font-black tracking-tighter">{t.title}</h2>
                      <p className="text-xs text-[#71717A] mt-0.5">{t.summary}</p>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-[#71717A] mt-1" /> : <ChevronRight className="w-4 h-4 text-[#71717A] mt-1" />}
                  </button>
                  {isOpen && (
                    <ol className="pl-16 pr-8 pb-8 space-y-4" data-testid={`help-steps-${t.id}`}>
                      {t.steps.map((s, i) => (
                        <li key={i} className="relative" data-testid={`help-step-${t.id}-${i}`}>
                          <div className="absolute -left-9 top-0 w-7 h-7 flex items-center justify-center bg-[#002FA7] text-white font-mono font-bold text-xs">
                            {i + 1}
                          </div>
                          <div className="text-sm font-bold text-[#09090B] mb-1">{s.t}</div>
                          <div className="text-sm text-[#52525B] leading-relaxed">{s.b}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="bg-white p-12 text-center text-sm text-[#71717A]">No guides match "{q}"</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
