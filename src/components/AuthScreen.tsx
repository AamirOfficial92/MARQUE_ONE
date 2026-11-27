import React, { useState } from 'react';
import { Check, Copy, Globe, KeyRound, Lock, LogOut, Mail, Moon, RefreshCw, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { tr } from '../i18n/translations';
import { isSupabaseConfigured } from '../lib/supabase';

export const AuthScreen: React.FC = () => {
  const {
    lang,
    toggleLang,
    theme,
    toggleTheme,
    signInWithEmail,
    signOut,
    retryProfileCheck,
    authError,
    missingProfileInfo,
    clearAuthError,
    loading,
  } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] text-slate-900 dark:text-slate-100">
        <div className="max-w-md w-full rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 text-center shadow-lg">
          <p className="text-sm font-medium">
            {tr('appNotConfiguredDesc', lang)}
          </p>
        </div>
      </div>
    );
  }

  const visibleError = authError || error;

  const missingProfileSql = missingProfileInfo
    ? `INSERT INTO public.profiles (id, hall_id, full_name, email, phone, role, is_active)\nVALUES ('${missingProfileInfo.uid}', '11111111-1111-4111-8111-111111111101', '${(missingProfileInfo.email.split('@')[0] || 'Staff').replace(/'/g, "''")}', '${missingProfileInfo.email.replace(/'/g, "''")}', '', 'super_admin', true)\nON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;`
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
    if (!email.trim() || !password) {
      setError(lang === 'ur' ? 'ای میل اور پاس ورڈ لازمی ہیں۔' : 'Email and password are required.');
      return;
    }
    const res = await signInWithEmail(email, password);
    if (!res.ok) {
      setError(res.error || (lang === 'ur' ? 'سائن ان ناکام رہا۔' : 'Sign in failed'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] relative overflow-hidden transition-colors">
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="w-full max-w-md glass-panel neon-border-cyan rounded-2xl p-6 sm:p-8 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img
              src={HALL_LOGO_SRC}
              alt={tr('appTitle', lang)}
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
              <span>{tr('switchToOtherLang', lang)}</span>
            </button>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-100 mb-1">{tr('loginTitle', lang)}</h2>
        <p className="text-xs text-slate-400 mb-4">
          {tr('signInSubtitle', lang)}
        </p>

        {visibleError && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-200 text-xs leading-relaxed space-y-2.5"
          >
            <div>
              <div className="font-semibold text-rose-300 mb-0.5">
                {missingProfileInfo
                  ? lang === 'ur'
                    ? 'ڈیٹابیس میں پروفائل سیٹ اپ درکار ہے'
                    : 'Profile setup required in database'
                  : lang === 'ur'
                  ? 'سائن ان خرابی'
                  : 'Sign-in error'}
              </div>
              <div>{visibleError}</div>
            </div>

            {missingProfileInfo && (
              <div className="space-y-2 pt-1 border-t border-rose-500/25">
                <pre dir="ltr" className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-cyan-300 overflow-x-auto select-all whitespace-pre-wrap break-all tabular-nums">
                  {missingProfileSql}
                </pre>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-200 text-[11px] font-semibold flex items-center gap-1.5"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>
                      {copiedSql
                        ? lang === 'ur' ? 'کاپی ہو گیا!' : 'Copied!'
                        : lang === 'ur' ? 'ایس کیو ایل کاپی کریں' : 'Copy SQL Fix'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => retryProfileCheck()}
                    disabled={loading}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{lang === 'ur' ? 'دوبارہ چیک کریں' : 'Retry Login Check'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 text-[11px] font-medium flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>{tr('logout', lang)}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {tr('emailAddress', lang)}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute top-3 left-3 rtl:left-auto rtl:right-3" />
              <input
                type="email"
                required
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (visibleError) {
                    setError(null);
                    clearAuthError();
                  }
                }}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 rtl:pl-3 rtl:pr-10 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                placeholder="staff@marquee1.pk"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {tr('passwordLabel', lang)}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute top-3 left-3 rtl:left-auto rtl:right-3" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (visibleError) {
                    setError(null);
                    clearAuthError();
                  }
                }}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 rtl:pl-3 rtl:pr-10 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{loading ? tr('signingIn', lang) : tr('signInBtn', lang)}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
