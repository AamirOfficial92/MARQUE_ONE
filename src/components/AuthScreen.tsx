import React, { useState } from 'react';
import { Globe, KeyRound, Lock, Mail, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { tr } from '../i18n/translations';
import { UserRole } from '../types';

export const AuthScreen: React.FC = () => {
  const { lang, toggleLang, signInWithEmail, signInDemoRole, supabaseLive, loading } = useApp();
  const [email, setEmail] = useState('admin@marquee1.pk');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await signInWithEmail(email, password);
    if (!res.ok) {
      setError(res.error || 'Sign in failed');
    }
  };

  const quickRoles: Array<{ role: UserRole; label: string; labelUr: string; desc: string; icon: React.ReactNode; accent: string }> = [
    {
      role: 'super_admin',
      label: 'Super Admin',
      labelUr: 'سپر ایڈمن',
      desc: 'Full control, users, catalog, settings, audit & recycle bin',
      icon: <ShieldCheck className="w-4 h-4 text-amber-400" />,
      accent: 'hover:border-amber-500/50',
    },
    {
      role: 'management',
      label: 'Management',
      labelUr: 'مینجمنٹ',
      desc: 'Bookings, floor calendar, customers & crate entry',
      icon: <Users className="w-4 h-4 text-cyan-400" />,
      accent: 'hover:border-cyan-500/50',
    },
    {
      role: 'finance',
      label: 'Finance',
      labelUr: 'فنانس',
      desc: 'Payments, installments, expenses, payroll, invoices & reports',
      icon: <Wallet className="w-4 h-4 text-violet-400" />,
      accent: 'hover:border-violet-500/50',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#060913] relative overflow-hidden">
      {/* Subtle ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="w-full max-w-md glass-panel neon-border-cyan rounded-2xl p-6 sm:p-8 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img
              src={HALL_LOGO_SRC}
              alt="Marquee 1 Logo"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover border border-amber-500/30"
            />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {tr('appTitle', lang)}
              </h1>
              <p className="text-xs text-slate-400">{tr('appSubtitle', lang)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-xs font-medium text-slate-200 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'en' ? 'اردو' : 'English'}</span>
          </button>
        </div>

        <h2 className="text-lg font-semibold text-slate-100 mb-1">{tr('loginTitle', lang)}</h2>
        <p className="text-xs text-slate-400 mb-5">
          {supabaseLive
            ? 'Sign in with your Supabase Auth staff credentials.'
            : 'Preview Mode active (connect VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY for live database).'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute top-3 left-3 rtl:left-auto rtl:right-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 rtl:pl-3 rtl:pr-10 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                placeholder="admin@marquee1.pk"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute top-3 left-3 rtl:left-auto rtl:right-3" />
              <input
                type="password"
                required={supabaseLive}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 rtl:pl-3 rtl:pr-10 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                placeholder={supabaseLive ? '••••••••' : 'Optional in Preview Mode'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{loading ? 'Signing in...' : tr('loginTitle', lang)}</span>
          </button>
        </form>

        {!supabaseLive && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-xs text-slate-400 mb-3">
              {lang === 'ur' ? 'فوری ڈیمو رسائی (کردار منتخب کریں):' : 'Quick Role Access (Preview Mode):'}
            </p>
            <div className="space-y-2">
              {quickRoles.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => signInDemoRole(item.role)}
                  className={`w-full text-start p-3 rounded-xl border border-slate-800 bg-slate-900/60 ${item.accent} transition-colors flex items-start gap-3`}
                >
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100">
                      {lang === 'ur' ? item.labelUr : item.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
