import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Globe, KeyRound, Lock, LogOut, Mail, Moon, RefreshCw, ShieldCheck, Sun, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { tr } from '../i18n/translations';
import { supabaseEnvStatus } from '../lib/supabase';
import { UserRole } from '../types';

export const AuthScreen: React.FC = () => {
  const {
    lang,
    toggleLang,
    theme,
    toggleTheme,
    signInWithEmail,
    signInDemoRole,
    signOut,
    retryProfileCheck,
    supabaseLive,
    authError,
    missingProfileInfo,
    clearAuthError,
    loading,
  } = useApp();
  const [email, setEmail] = useState('admin@marquee1.pk');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const visibleError = authError || error;

  const missingProfileSql = missingProfileInfo
    ? `INSERT INTO public.profiles (id, full_name, email, phone, role, is_active)\nVALUES ('${missingProfileInfo.uid}', '${(missingProfileInfo.email.split('@')[0] || 'Super Admin').replace(/'/g, "''")}', '${missingProfileInfo.email.replace(/'/g, "''")}', '', 'super_admin', true)\nON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;`
    : '';

  const handleCopySql = async () => {
    if (!missingProfileSql) return;
    try {
      await navigator.clipboard.writeText(missingProfileSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // clipboard fallback ignored
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthError();
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] relative overflow-hidden transition-colors">
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

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? tr('lightMode', lang) : tr('darkMode', lang)}
              aria-label={theme === 'dark' ? tr('lightMode', lang) : tr('darkMode', lang)}
              className="p-2 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-500/50 transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-violet-400" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-xs font-medium text-slate-200 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{lang === 'en' ? 'اردو' : 'English'}</span>
            </button>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-100 mb-1">{tr('loginTitle', lang)}</h2>
        <p className="text-xs text-slate-400 mb-4">
          {supabaseLive
            ? 'Sign in with your Supabase Auth staff credentials.'
            : 'Local Preview Mode is active below so you can still evaluate roles offline.'}
        </p>

        {supabaseEnvStatus.isMissing && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl border border-amber-500/45 bg-amber-500/10 text-xs space-y-1.5"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Supabase environment variables are missing</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {!supabaseEnvStatus.hasUrl && !supabaseEnvStatus.hasKey
                ? 'Both Supabase URL and API key are missing or set to placeholder values.'
                : !supabaseEnvStatus.hasUrl
                  ? 'Supabase URL is missing (set VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).'
                  : 'Supabase key is missing (set VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).'}
            </p>
          </div>
        )}

        {visibleError && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-200 text-xs leading-relaxed space-y-2.5"
          >
            <div>
              <div className="font-semibold text-rose-300 mb-0.5">
                {missingProfileInfo ? 'Profile setup required in Supabase' : 'Sign-in error'}
              </div>
              <div>{visibleError}</div>
            </div>

            {missingProfileInfo && (
              <div className="space-y-2 pt-1 border-t border-rose-500/25">
                <pre className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-cyan-300 overflow-x-auto select-all whitespace-pre-wrap break-all tabular-nums">
                  {missingProfileSql}
                </pre>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 text-[11px] font-semibold flex items-center gap-1.5"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'SQL Copied!' : 'Copy SQL Fix'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => retryProfileCheck()}
                    disabled={loading}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Retry Login Check</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 text-[11px] font-medium flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (visibleError) {
                    setError(null);
                    clearAuthError();
                  }
                }}
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
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (visibleError) {
                    setError(null);
                    clearAuthError();
                  }
                }}
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
