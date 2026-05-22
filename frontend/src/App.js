import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Schools from './pages/Schools';
import SchoolLayout from './components/layout/SchoolLayout';
import SchoolDashboard from './pages/SchoolDashboard';
import Teachers from './pages/Teachers';
import Subjects from './pages/Subjects';
import Classes from './pages/Classes';
import Labs from './pages/Labs';
import Shifts from './pages/Shifts';
import Timetable from './pages/Timetable';
import Constraints from './pages/Constraints';
import Substitutions from './pages/Substitutions';
import Allotments from './pages/Allotments';
import TeacherSchedule from './pages/TeacherSchedule';
import Activities from './pages/Activities';
import AuditDashboard from './pages/AuditDashboard';
import Sections from './pages/Sections';
import VisitingFaculty from './pages/VisitingFaculty';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import Facilities from './pages/Facilities';
import Attendance from './pages/Attendance';
import Members from './pages/Members';
import Help from './pages/Help';
import '@/App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F5]">
        <div className="w-8 h-8 border-2 border-[#002FA7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Detect session_id during render (NOT in useEffect) - prevents race conditions
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/help" element={<ProtectedRoute><Help /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><Schools /></ProtectedRoute>} />
      <Route path="/super" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
      <Route path="/school/:schoolId" element={<ProtectedRoute><SchoolLayout /></ProtectedRoute>}>
        <Route index element={<SchoolDashboard />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="classes" element={<Classes />} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="users" element={<Members />} />
        <Route path="sections" element={<Sections />} />
        <Route path="labs" element={<Navigate to="../facilities" replace />} />
        <Route path="activities" element={<Activities />} />
        <Route path="shifts" element={<Shifts />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="allotments" element={<Allotments />} />
        <Route path="constraints" element={<Constraints />} />
        <Route path="substitutions" element={<Substitutions />} />
        <Route path="audit" element={<AuditDashboard />} />
        <Route path="visiting-faculty" element={<VisitingFaculty />} />
        <Route path="teacher/:teacherId" element={<TeacherSchedule />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
