import React from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { GraduationCap, ArrowRight, Calendar, Users, Layers } from 'lucide-react';

export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#F4F4F5] grid lg:grid-cols-2">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-white border-r border-[#D4D4D8] relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3" data-testid="brand-logo">
            <div className="w-10 h-10 bg-[#002FA7] flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-heading font-black text-xl tracking-tighter">SRI MA ONE TIMETABLE</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A]">Timetable OS</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <h1 className="font-heading text-5xl xl:text-6xl font-black leading-[0.95] tracking-tighter text-[#09090B]">
            Run your school's<br />schedule like<br /><span className="text-[#002FA7]">a control room.</span>
          </h1>
          <p className="text-base text-[#71717A] max-w-md leading-relaxed">
            Multi-school masters, drag-and-drop timetables, a visual constraint builder, and AI-powered
            substitute suggestions. Built for Indian schools, configurable for any board.
          </p>

          <div className="grid grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mt-12 max-w-md">
            {[
              { i: <Users className="w-4 h-4" />, l: 'Masters', v: '9 modules' },
              { i: <Layers className="w-4 h-4" />, l: 'Constraints', v: '60-70+' },
              { i: <Calendar className="w-4 h-4" />, l: 'Drag & Drop', v: 'Live' },
            ].map((s, idx) => (
              <div key={idx} className="bg-white p-4">
                <div className="text-[#002FA7] mb-2">{s.i}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">{s.l}</div>
                <div className="text-sm font-mono mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold">
          © 2026 · CBSE / ICSE / STATE BOARDS
        </div>
      </div>

      {/* Right: Login card */}
      <div className="flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-[#002FA7] flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div className="font-heading font-black text-xl tracking-tighter">SRI MA ONE TIMETABLE</div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">
            STEP 01 — AUTHENTICATION
          </div>
          <h2 className="font-heading text-4xl font-black tracking-tighter mb-3">Sign in to continue</h2>
          <p className="text-sm text-[#71717A] mb-10 leading-relaxed">
            Use your Google account. The first user to sign in becomes the Super Admin.
          </p>

          <Card className="border-[#D4D4D8] rounded-none shadow-none p-6">
            <Button
              onClick={handleLogin}
              data-testid="google-signin-btn"
              className="w-full bg-[#09090B] hover:bg-[#002FA7] text-white rounded-none h-12 text-sm font-semibold tracking-wide transition-all duration-200 group"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#fff" opacity=".7" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fff" opacity=".5" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.61z"/>
                <path fill="#fff" opacity=".3" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              Continue with Google
              <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
            </Button>
            <div className="mt-6 pt-6 border-t border-[#D4D4D8]">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-2">SECURE</div>
              <p className="text-xs text-[#71717A] leading-relaxed">
                Sign-in is delegated to Google OAuth. Your session is encrypted and expires after 7 days.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
