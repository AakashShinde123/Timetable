import React from 'react';
import { Link, useLocation, useNavigate, useParams, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import {
  LayoutDashboard, Users, BookOpen, School2, FlaskConical, Clock,
  CalendarRange, SlidersHorizontal, UserMinus, ChevronLeft, LogOut, GraduationCap, ListChecks, Activity, ShieldAlert, Layers, Globe2, Building, ClipboardCheck, ShieldCheck, HelpCircle,
} from 'lucide-react';
import { Button } from '../ui/button';

const NAV = [
  { to: '', icon: LayoutDashboard, label: 'Dashboard', test: 'nav-dashboard' },
  { to: 'teachers', icon: Users, label: 'Teachers', test: 'nav-teachers' },
  { to: 'subjects', icon: BookOpen, label: 'Subjects', test: 'nav-subjects' },
  { to: 'sections', icon: Layers, label: 'Sections', test: 'nav-sections' },
  { to: 'classes', icon: School2, label: 'Classes', test: 'nav-classes' },
  { to: 'facilities', icon: Building, label: 'Facilities', test: 'nav-facilities' },
  { to: 'activities', icon: Activity, label: 'Activities', test: 'nav-activities' },
  { to: 'shifts', icon: Clock, label: 'Shifts & Periods', test: 'nav-shifts' },
  { to: 'allotments', icon: ListChecks, label: 'Allotments', test: 'nav-allotments' },
  { to: 'timetable', icon: CalendarRange, label: 'Timetable Builder', test: 'nav-timetable' },
  { to: 'audit', icon: ShieldAlert, label: 'Audit Dashboard', test: 'nav-audit' },
  { to: 'attendance', icon: ClipboardCheck, label: 'Attendance', test: 'nav-attendance' },
  { to: 'constraints', icon: SlidersHorizontal, label: 'Constraints', test: 'nav-constraints' },
  { to: 'substitutions', icon: UserMinus, label: 'Substitutions', test: 'nav-substitutions' },
  { to: 'visiting-faculty', icon: Globe2, label: 'Visiting Faculty', test: 'nav-visiting' },
  { to: 'users', icon: ShieldCheck, label: 'Users & Roles', test: 'nav-users' },
];

export default function SchoolLayout() {
  const { user, logout } = useAuth();
  const { schoolId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const base = `/school/${schoolId}`;

  return (
    <div className="min-h-screen flex bg-[#F4F4F5]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[#D4D4D8] flex flex-col">
        <div className="p-5 border-b border-[#D4D4D8]">
          <Link to="/" className="flex items-center gap-2.5" data-testid="sidebar-home-link">
            <div className="w-8 h-8 bg-[#002FA7] flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-heading font-black text-base tracking-tighter leading-none">SRI MA ONE</div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#71717A] mt-1">Timetable OS</div>
            </div>
          </Link>
        </div>

        <button
          onClick={() => navigate('/')}
          data-testid="back-to-schools-btn"
          className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A] hover:text-[#002FA7] px-5 py-3 border-b border-[#D4D4D8] transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> ALL SCHOOLS
        </button>

        <nav className="flex-1 py-3">
          {NAV.map((item) => {
            const path = item.to ? `${base}/${item.to}` : base;
            const active = item.to
              ? location.pathname.startsWith(path)
              : location.pathname === base || location.pathname === base + '/';
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={path}
                data-testid={item.test}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 ${
                  active
                    ? 'bg-[#F4F4F5] border-[#002FA7] text-[#09090B] font-semibold'
                    : 'border-transparent text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#D4D4D8]">
          <Link to="/help" className="flex items-center gap-2 text-xs text-[#52525B] hover:text-[#002FA7] mb-3" data-testid="sidebar-help-link">
            <HelpCircle className="w-3.5 h-3.5" /> Help & Guide
          </Link>
          <div className="flex items-center gap-3 mb-3">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 bg-[#002FA7] text-white flex items-center justify-center text-xs font-bold rounded-full">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" data-testid="user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#71717A] font-bold truncate" data-testid="user-role">{user?.role}</div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            data-testid="logout-btn"
            className="w-full rounded-none border-[#D4D4D8] hover:bg-[#09090B] hover:text-white hover:border-[#09090B] transition-all text-xs h-9"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
