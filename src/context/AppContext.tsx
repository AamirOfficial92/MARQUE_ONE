import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AppDatabase,
  AttendanceStatus,
  AuditLog,
  Booking,
  BookingItem,
  CancellationDetails,
  ChargeCatalogItem,
  ChargeCategory,
  Employee,
  EmployeeAdvance,
  EmployeeAttendance,
  EventTypeItem,
  Expense,
  ExpenseCategory,
  HallSettings,
  InstallmentSchedule,
  Language,
  Payment,
  RescheduleEntry,
  ThemeMode,
  UserProfile,
  UserRole,
} from '../types';
import { createSeedDatabase } from '../data/seedData';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { calculateCrateBill, findBookingConflict, todayISO } from '../utils/formatters';

const STORAGE_KEY = 'marquee1_hms_db_v1';
const USER_STORAGE_KEY = 'marquee1_hms_active_user_v1';
const THEME_STORAGE_KEY = 'marquee1_hms_theme_v1';

function getSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

function getSavedBrowserTheme(): ThemeMode | null {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    return val === 'light' || val === 'dark' ? val : null;
  } catch {
    return null;
  }
}

interface AppContextValue {
  db: AppDatabase;
  currentUser: UserProfile | null;
  lang: Language;
  theme: ThemeMode;
  themePreferenceSource: 'system' | 'saved';
  loading: boolean;
  errorMsg: string | null;
  authError: string | null;
  missingProfileInfo: { uid: string; email: string } | null;
  supabaseLive: boolean;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  resetThemeToSystem: () => void;
  clearError: () => void;
  clearAuthError: () => void;
  retryProfileCheck: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signInDemoRole: (role: UserRole) => void;
  signOut: () => Promise<void>;
  // Bookings
  saveBooking: (
    bookingData: Omit<Booking, 'id' | 'booking_code' | 'booking_date' | 'invoice_number' | 'updated_at' | 'deleted_at' | 'reschedule_history'> & {
      id?: string;
      booking_code?: string;
      booking_date?: string;
      invoice_number?: string;
      reschedule_history?: RescheduleEntry[];
    },
    items: Omit<BookingItem, 'booking_id' | 'deleted_at'>[],
    installments: Omit<InstallmentSchedule, 'booking_id' | 'deleted_at'>[],
    rescheduleInfo?: { reason: string; fee: number }
  ) => Promise<{ ok: boolean; error?: string; booking?: Booking }>;
  cancelBooking: (bookingId: string, details: CancellationDetails) => Promise<void>;
  softDeleteBooking: (id: string) => Promise<void>;
  restoreRecord: (entityType: 'booking' | 'payment' | 'expense' | 'charge' | 'employee', id: string) => Promise<void>;
  // Payments
  addPayment: (payment: Omit<Payment, 'id' | 'receipt_number' | 'deleted_at' | 'created_at'>) => Promise<{ ok: boolean; payment?: Payment; error?: string }>;
  softDeletePayment: (id: string) => Promise<void>;
  toggleInstallmentPaid: (id: string, paid: boolean) => Promise<void>;
  // Expenses, Staff, Attendance & Payroll
  addExpense: (expense: Omit<Expense, 'id' | 'deleted_at' | 'created_at'>) => Promise<void>;
  softDeleteExpense: (id: string) => Promise<void>;
  saveEmployee: (emp: Omit<Employee, 'id' | 'deleted_at' | 'created_at'> & { id?: string }) => Promise<void>;
  toggleEmployeeActive: (id: string, isActive: boolean) => Promise<void>;
  softDeleteEmployee: (id: string) => Promise<void>;
  saveAttendance: (employeeId: string, dateISO: string, status: AttendanceStatus, notes?: string) => Promise<void>;
  addEmployeeAdvance: (advance: Omit<EmployeeAdvance, 'id' | 'is_settled' | 'settled_month' | 'deleted_at' | 'created_at'>) => Promise<void>;
  payEmployeeSalary: (params: {
    employeeId: string;
    month: string; // YYYY-MM
    netPayable: number;
    totalAdvancesDeducted: number;
    mode: Payment['mode'];
    notes: string;
  }) => Promise<void>;
  saveExpenseCategory: (cat: { id?: string; name_en: string; name_ur: string }) => Promise<void>;
  // Catalog, Event Types & Users (super_admin)
  saveChargeCategory: (cat: { id?: string; name_en: string; name_ur: string; sort_order?: number }) => Promise<void>;
  saveChargeItem: (item: Omit<ChargeCatalogItem, 'id' | 'deleted_at'> & { id?: string }) => Promise<void>;
  softDeleteChargeItem: (id: string) => Promise<void>;
  saveEventType: (et: Omit<EventTypeItem, 'id' | 'deleted_at' | 'is_default'> & { id?: string }) => Promise<void>;
  saveUserProfile: (user: Omit<UserProfile, 'id' | 'created_at'> & { id?: string; password?: string }) => Promise<{ ok: boolean; error?: string }>;
  updateSettings: (next: HallSettings) => Promise<void>;
  importBookingsBatch: (rows: Array<Partial<Booking>>) => Promise<{ imported: number; skipped: number; errors: string[] }>;
  resetDemoDatabase: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatInvoiceFromPattern(pattern: string, seq: number): string {
  const yr = String(new Date().getFullYear());
  return pattern
    .replace('{YYYY}', yr)
    .replace('{0000}', String(seq).padStart(4, '0'));
}

function hydrateBooking(b: Booking): Booking {
  return {
    ...b,
    late_charge_method: b.late_charge_method || 'none',
    late_charge_value: Number(b.late_charge_value) || 0,
    late_charge_amount: Number(b.late_charge_amount) || 0,
    late_charge_overridden: Boolean(b.late_charge_overridden),
    discount_type: b.discount_type || 'fixed',
    discount_value: Number(b.discount_value) || 0,
    discount_amount: Number(b.discount_amount) || 0,
    discount_reason: b.discount_reason || '',
    reschedule_history: Array.isArray(b.reschedule_history) ? b.reschedule_history : [],
    cancellation_details: b.cancellation_details || null,
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<AppDatabase>(() => {
    const seed = createSeedDatabase();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppDatabase;
        return {
          ...seed,
          ...parsed,
          settings: {
            ...seed.settings,
            ...(parsed.settings || {}),
            weekday_weekend_rates: {
              ...seed.settings.weekday_weekend_rates,
              ...(parsed.settings?.weekday_weekend_rates || {}),
            },
            rent_seasons: Array.isArray(parsed.settings?.rent_seasons)
              ? parsed.settings.rent_seasons
              : seed.settings.rent_seasons,
          },
          bookings: (parsed.bookings || seed.bookings).map(hydrateBooking),
          attendance: Array.isArray(parsed.attendance) ? parsed.attendance : seed.attendance,
          advances: Array.isArray(parsed.advances) ? parsed.advances : seed.advances,
        };
      }
    } catch {
      // ignore storage errors
    }
    return seed;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as UserProfile;
    } catch {
      // ignore
    }
    return null;
  });

  const [lang, setLangState] = useState<Language>(() => db.settings.default_language || 'en');
  const [themePreferenceSource, setThemePreferenceSource] = useState<'system' | 'saved'>(() => {
    if (currentUser?.preferred_theme === 'light' || currentUser?.preferred_theme === 'dark') {
      return 'saved';
    }
    return getSavedBrowserTheme() ? 'saved' : 'system';
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (currentUser?.preferred_theme === 'light' || currentUser?.preferred_theme === 'dark') {
      return currentUser.preferred_theme;
    }
    return getSavedBrowserTheme() || getSystemTheme();
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [missingProfileInfo, setMissingProfileInfo] = useState<{ uid: string; email: string } | null>(null);
  const inFlightAuthRef = React.useRef<{ uid: string; promise: Promise<{ ok: boolean; error?: string }> } | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (themePreferenceSource !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePreferenceSource]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch {
        // ignore quota errors
      }
    }
  }, [db]);

  const fetchLiveSupabaseData = async (
    uid: string,
    authEmail?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase client is not initialized.' };
    if (inFlightAuthRef.current && inFlightAuthRef.current.uid === uid) {
      return inFlightAuthRef.current.promise;
    }

    const task = (async (): Promise<{ ok: boolean; error?: string }> => {
      setLoading(true);
      try {
        const profileRes = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (profileRes.error) {
          const msg = `Unable to load your staff profile (${profileRes.error.message}).`;
          console.warn('[Auth] Profile lookup error:', {
            code: profileRes.error.code,
            message: profileRes.error.message,
          });
          setMissingProfileInfo(null);
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        let profileRow = profileRes.data as UserProfile | null;

        // If no profile row exists yet, attempt first-user super_admin bootstrap (allowed when profiles table is empty & policy is active)
        if (!profileRow) {
          const fallbackName = (authEmail || 'Super Admin').split('@')[0] || 'Super Admin';
          const bootstrapRes = await supabase
            .from('profiles')
            .insert({
              id: uid,
              full_name: fallbackName,
              email: authEmail || `${uid}@marquee1.pk`,
              phone: '',
              role: 'super_admin',
              is_active: true,
            })
            .select('*')
            .maybeSingle();

          if (!bootstrapRes.error && bootstrapRes.data) {
            profileRow = bootstrapRes.data as UserProfile;
          }
        }

        if (!profileRow) {
          const msg = `Signed in (${authEmail || uid}), but no profile/role row was found in public.profiles. Run the SQL snippet below in Supabase SQL Editor or ask your Super Admin to add your profile and role.`;
          console.warn('[Auth] Missing profile/role row in public.profiles for authenticated user:', { uid });
          setMissingProfileInfo({ uid, email: authEmail || '' });
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        const prof = profileRow;
        if (!prof.role) {
          const msg = `Signed in (${prof.email || authEmail || uid}), but your profile has no role assigned.`;
          console.warn('[Auth] Missing role on profile:', { uid });
          setMissingProfileInfo({ uid, email: prof.email || authEmail || '' });
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        if (!prof.is_active) {
          const msg = 'Your staff profile is deactivated (is_active = false). Please contact Super Admin.';
          console.warn('[Auth] Deactivated user profile:', { uid });
          setMissingProfileInfo(null);
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        setMissingProfileInfo(null);
        setAuthError(null);
        setCurrentUser(prof);
        if (prof.preferred_theme === 'light' || prof.preferred_theme === 'dark') {
          setThemeState(prof.preferred_theme);
          setThemePreferenceSource('saved');
          try {
            localStorage.setItem(THEME_STORAGE_KEY, prof.preferred_theme);
          } catch {
            // ignore
          }
        }

        const [
          profilesAllRes,
          settingsRes,
          eventTypesRes,
          chargeCatsRes,
          chargesRes,
          bookingsRes,
          itemsRes,
          installmentsRes,
          paymentsRes,
          expCatsRes,
          employeesRes,
          attendanceRes,
          advancesRes,
          expensesRes,
          auditRes,
        ] = await Promise.all([
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('hall_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('event_types').select('*').order('name_en'),
          supabase.from('charge_categories').select('*').order('sort_order'),
          supabase.from('charges_catalog').select('*').order('name_en'),
          supabase.from('bookings').select('*').order('event_date', { ascending: true }),
          supabase.from('booking_items').select('*'),
          supabase.from('installment_schedules').select('*').order('due_date'),
          supabase.from('payments').select('*').order('payment_date', { ascending: false }),
          supabase.from('expense_categories').select('*').order('name_en'),
          supabase.from('employees').select('*').order('full_name'),
          supabase.from('employee_attendance').select('*').order('attendance_date', { ascending: false }),
          supabase.from('employee_advances').select('*').order('advance_date', { ascending: false }),
          supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
        ]);

        setDb((prev) => ({
          ...prev,
          profiles: (profilesAllRes.data as UserProfile[]) || prev.profiles,
          settings: settingsRes.data
            ? { ...prev.settings, ...(settingsRes.data as HallSettings) }
            : prev.settings,
          eventTypes: (eventTypesRes.data as EventTypeItem[]) || prev.eventTypes,
          chargeCategories: (chargeCatsRes.data as ChargeCategory[]) || prev.chargeCategories,
          chargesCatalog: (chargesRes.data as ChargeCatalogItem[]) || prev.chargesCatalog,
          bookings: bookingsRes.data ? (bookingsRes.data as Booking[]).map(hydrateBooking) : prev.bookings,
          bookingItems: (itemsRes.data as BookingItem[]) || prev.bookingItems,
          installments: (installmentsRes.data as InstallmentSchedule[]) || prev.installments,
          payments: (paymentsRes.data as Payment[]) || prev.payments,
          expenseCategories: (expCatsRes.data as ExpenseCategory[]) || prev.expenseCategories,
          employees: (employeesRes.data as Employee[]) || prev.employees,
          attendance: (attendanceRes.data as EmployeeAttendance[]) || prev.attendance,
          advances: (advancesRes.data as EmployeeAdvance[]) || prev.advances,
          expenses: (expensesRes.data as Expense[]) || prev.expenses,
          auditLogs: (auditRes.data as AuditLog[]) || prev.auditLogs,
        }));
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message || 'Failed to sync with Supabase';
        console.error('[Auth/Sync] Supabase sync error:', msg);
        setErrorMsg(msg);
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
        if (inFlightAuthRef.current?.uid === uid) {
          inFlightAuthRef.current = null;
        }
      }
    })();

    inFlightAuthRef.current = { uid, promise: task };
    return task;
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('[Auth] Session restore error:', error.message);
      }
      if (data.session?.user) {
        fetchLiveSupabaseData(data.session.user.id, data.session.user.email);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        fetchLiveSupabaseData(session.user.id, session.user.email);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const setLang = (next: Language) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'en' ? 'ur' : 'en'));
  const clearError = () => setErrorMsg(null);
  const clearAuthError = () => {
    setAuthError(null);
    setMissingProfileInfo(null);
  };

  const retryProfileCheck = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await fetchLiveSupabaseData(data.session.user.id, data.session.user.email);
    }
  };

  const persistUserTheme = (nextTheme: ThemeMode | null) => {
    if (!currentUser) return;
    const updatedUser: UserProfile = { ...currentUser, preferred_theme: nextTheme };
    setCurrentUser(updatedUser);
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
    } catch {
      // ignore
    }
    setDb((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === updatedUser.id ? { ...p, preferred_theme: nextTheme } : p)),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from('profiles').update({ preferred_theme: nextTheme }).eq('id', updatedUser.id).then(() => {});
    }
  };

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    setThemePreferenceSource('saved');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    persistUserTheme(next);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const resetThemeToSystem = () => {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // ignore
    }
    setThemePreferenceSource('system');
    setThemeState(getSystemTheme());
    persistUserTheme(null);
  };

  const appendAudit = (
    action: AuditLog['action'],
    entityType: string,
    entityId: string,
    entityLabel: string,
    changes: Record<string, unknown>
  ) => {
    const entry: AuditLog = {
      id: makeId('aud'),
      actor_name: currentUser?.full_name || 'System',
      actor_role: currentUser?.role || 'super_admin',
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      changes,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      supabase.from('audit_logs').insert(entry).then(() => {});
    }
    setDb((prev) => ({
      ...prev,
      auditLogs: [entry, ...prev.auditLogs],
    }));
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    setMissingProfileInfo(null);
    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          console.warn('[Auth] Supabase sign-in failed:', {
            status: error.status,
            code: (error as { code?: string }).code,
            message: error.message,
          });
          setAuthError(error.message);
          return { ok: false, error: error.message };
        }
        if (data.user) {
          const syncRes = await fetchLiveSupabaseData(data.user.id, data.user.email);
          if (!syncRes.ok) {
            return { ok: false, error: syncRes.error };
          }
        } else {
          const msg = 'Sign-in did not return an authenticated user session.';
          console.warn('[Auth] Missing user object after signInWithPassword');
          setAuthError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unexpected sign-in error.';
        console.warn('[Auth] Supabase sign-in exception:', msg);
        setAuthError(msg);
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
      }
    }
    const matched = db.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase() && p.is_active);
    if (!matched) {
      const msg = 'Account not found or inactive. Use quick role login below.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
    setCurrentUser(matched);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(matched));
    if (matched.preferred_theme === 'light' || matched.preferred_theme === 'dark') {
      setThemeState(matched.preferred_theme);
      setThemePreferenceSource('saved');
      localStorage.setItem(THEME_STORAGE_KEY, matched.preferred_theme);
    }
    return { ok: true };
  };

  const signInDemoRole = (role: UserRole) => {
    setAuthError(null);
    setMissingProfileInfo(null);
    const matched = db.profiles.find((p) => p.role === role && p.is_active) || db.profiles[0];
    setCurrentUser(matched);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(matched));
    if (matched.preferred_theme === 'light' || matched.preferred_theme === 'dark') {
      setThemeState(matched.preferred_theme);
      setThemePreferenceSource('saved');
      localStorage.setItem(THEME_STORAGE_KEY, matched.preferred_theme);
    }
  };

  const signOut = async () => {
    setAuthError(null);
    setMissingProfileInfo(null);
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  const saveBooking: AppContextValue['saveBooking'] = async (bookingData, items, installments, rescheduleInfo) => {
    const conflict = findBookingConflict(
      {
        id: bookingData.id,
        event_date: bookingData.event_date,
        start_time: bookingData.start_time,
        end_time: bookingData.end_time,
        floors: bookingData.floors,
        status: bookingData.status,
      },
      db.bookings,
      db.settings.cleaning_buffer_minutes
    );

    if (conflict) {
      return {
        ok: false,
        error: `${conflict.booking_code} (${conflict.floors.join(', ')} · ${conflict.event_date} ${conflict.start_time}–${conflict.end_time}, incl. ${db.settings.cleaning_buffer_minutes}m cleaning buffer)`,
      };
    }

    const crateCalc = calculateCrateBill(
      bookingData.crates_ordered,
      bookingData.crates_returned,
      bookingData.crate_rate,
      bookingData.crate_handling_deduction_per_crate
    );

    const isUpdate = Boolean(bookingData.id);
    const existing = isUpdate ? db.bookings.find((b) => b.id === bookingData.id) : undefined;
    const year = new Date().getFullYear();

    const nextSeqBooking = db.sequences.booking + (isUpdate ? 0 : 1);
    const nextSeqInvoice = db.sequences.invoice + (isUpdate ? 0 : 1);

    const bookingId = existing?.id || makeId('bk');
    const bookingCode = existing?.booking_code || `MQ1-${year}-${String(nextSeqBooking).padStart(4, '0')}`;
    const invoiceNum = existing?.invoice_number || formatInvoiceFromPattern(db.settings.invoice_format, nextSeqInvoice);

    let rescheduleHistory = [...(existing?.reschedule_history || bookingData.reschedule_history || [])];
    const dateChanged = Boolean(existing && existing.event_date !== bookingData.event_date);
    if (existing && dateChanged) {
      const resEntry: RescheduleEntry = {
        id: makeId('res'),
        old_date: existing.event_date,
        new_date: bookingData.event_date,
        changed_by: currentUser?.full_name || 'Staff',
        changed_at: new Date().toISOString(),
        reason: rescheduleInfo?.reason?.trim() || 'Date changed by staff',
        fee: Math.max(0, Number(rescheduleInfo?.fee) || 0),
      };
      rescheduleHistory = [resEntry, ...rescheduleHistory];
    }

    const record: Booking = {
      ...bookingData,
      id: bookingId,
      booking_code: bookingCode,
      booking_date: existing?.booking_date || todayISO(),
      invoice_number: invoiceNum,
      crate_credit_amount: crateCalc.netCreditReversed,
      reschedule_history: rescheduleHistory,
      cancellation_details: bookingData.cancellation_details ?? existing?.cancellation_details ?? null,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    const nextItems: BookingItem[] = items.map((it) => ({
      ...it,
      id: it.id || makeId('bi'),
      booking_id: bookingId,
      amount: it.is_crate_service ? Number(it.amount) : Number(it.quantity) * Number(it.rate),
      deleted_at: null,
    }));

    const nextInstallments: InstallmentSchedule[] = installments.map((ins) => ({
      ...ins,
      id: ins.id || makeId('ins'),
      booking_id: bookingId,
      deleted_at: null,
    }));

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('bookings').upsert(record);
      if (error) return { ok: false, error: error.message };
      await supabase.from('booking_items').delete().eq('booking_id', bookingId);
      if (nextItems.length > 0) await supabase.from('booking_items').insert(nextItems);
      await supabase.from('installment_schedules').delete().eq('booking_id', bookingId);
      if (nextInstallments.length > 0) await supabase.from('installment_schedules').insert(nextInstallments);
    }

    setDb((prev) => ({
      ...prev,
      sequences: {
        ...prev.sequences,
        booking: nextSeqBooking,
        invoice: nextSeqInvoice,
      },
      bookings: isUpdate
        ? prev.bookings.map((b) => (b.id === bookingId ? record : b))
        : [record, ...prev.bookings],
      bookingItems: [
        ...prev.bookingItems.filter((i) => i.booking_id !== bookingId),
        ...nextItems,
      ],
      installments: [
        ...prev.installments.filter((i) => i.booking_id !== bookingId),
        ...nextInstallments,
      ],
    }));

    const changes: Record<string, unknown> = {
      status: record.status,
      floors: record.floors,
      hall_rent: record.hall_rent,
      discount_amount: record.discount_amount,
    };
    if (dateChanged && existing) {
      changes.event_date_changed = {
        from: existing.event_date,
        to: record.event_date,
        reason: rescheduleInfo?.reason || '',
        fee: rescheduleInfo?.fee || 0,
      };
      appendAudit('RESCHEDULE', 'booking', bookingId, bookingCode, changes);
    } else {
      if (!existing) changes.event_date = record.event_date;
      appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'booking', bookingId, bookingCode, changes);
    }

    return { ok: true, booking: record };
  };

  const cancelBooking: AppContextValue['cancelBooking'] = async (bookingId, details) => {
    const target = db.bookings.find((b) => b.id === bookingId);
    if (!target) return;
    const updated: Booking = {
      ...target,
      status: 'Cancelled',
      cancellation_details: details,
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('bookings')
        .update({ status: 'Cancelled', cancellation_details: details, updated_at: updated.updated_at })
        .eq('id', bookingId);
    }
    setDb((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === bookingId ? updated : b)),
    }));
    appendAudit('CANCEL', 'booking', bookingId, target.booking_code, {
      paid: details.amount_paid_so_far,
      deduction: details.deduction_amount,
      refund: details.refund_amount,
      reason: details.reason,
    });
  };

  const softDeleteBooking = async (id: string) => {
    const target = db.bookings.find((b) => b.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('bookings').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: deletedAt } : b)),
    }));
    appendAudit('DELETE', 'booking', id, target.booking_code, { customer_name: target.customer_name });
  };

  const restoreRecord: AppContextValue['restoreRecord'] = async (entityType, id) => {
    if (entityType === 'booking') {
      const target = db.bookings.find((b) => b.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('bookings').update({ deleted_at: null }).eq('id', id);
      }
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: null } : b)),
      }));
      appendAudit('RESTORE', 'booking', id, target.booking_code, {});
    } else if (entityType === 'payment') {
      const target = db.payments.find((p) => p.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('payments').update({ deleted_at: null }).eq('id', id);
      }
      setDb((prev) => ({
        ...prev,
        payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)),
      }));
      appendAudit('RESTORE', 'payment', id, target.receipt_number, {});
    } else if (entityType === 'expense') {
      const target = db.expenses.find((e) => e.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('expenses').update({ deleted_at: null }).eq('id', id);
      }
      setDb((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'expense', id, target.payee, {});
    } else if (entityType === 'charge') {
      const target = db.chargesCatalog.find((c) => c.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('charges_catalog').update({ deleted_at: null }).eq('id', id);
      }
      setDb((prev) => ({
        ...prev,
        chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)),
      }));
      appendAudit('RESTORE', 'charge', id, target.name_en, {});
    } else if (entityType === 'employee') {
      const target = db.employees.find((e) => e.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('employees').update({ deleted_at: null }).eq('id', id);
      }
      setDb((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'employee', id, target.full_name, {});
    }
  };

  const addPayment: AppContextValue['addPayment'] = async (paymentData) => {
    const nextSeq = db.sequences.receipt + 1;
    const year = new Date().getFullYear();
    const record: Payment = {
      ...paymentData,
      id: makeId('pay'),
      receipt_number: `RCP-${year}-${String(nextSeq).padStart(4, '0')}`,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('payments').insert(record);
      if (error) return { ok: false, error: error.message };
    }
    setDb((prev) => ({
      ...prev,
      sequences: { ...prev.sequences, receipt: nextSeq },
      payments: [record, ...prev.payments],
    }));
    appendAudit('CREATE', 'payment', record.id, record.receipt_number, {
      amount: record.amount,
      mode: record.mode,
      booking_id: record.booking_id,
    });
    return { ok: true, payment: record };
  };

  const softDeletePayment = async (id: string) => {
    const target = db.payments.find((p) => p.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('payments').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: deletedAt } : p)),
    }));
    appendAudit('DELETE', 'payment', id, target.receipt_number, { amount: target.amount });
  };

  const toggleInstallmentPaid = async (id: string, paid: boolean) => {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('installment_schedules').update({ is_paid: paid }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      installments: prev.installments.map((ins) => (ins.id === id ? { ...ins, is_paid: paid } : ins)),
    }));
  };

  const addExpense: AppContextValue['addExpense'] = async (expenseData) => {
    const record: Expense = {
      ...expenseData,
      booking_id: expenseData.booking_id || null,
      id: makeId('exp'),
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expenses').insert(record);
    }
    setDb((prev) => ({
      ...prev,
      expenses: [record, ...prev.expenses],
    }));
    appendAudit('CREATE', 'expense', record.id, record.payee, {
      category: record.category_name,
      amount: record.amount,
      booking_id: record.booking_id,
    });
  };

  const softDeleteExpense = async (id: string) => {
    const target = db.expenses.find((e) => e.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expenses').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'expense', id, target.payee, { amount: target.amount });
  };

  const saveEmployee: AppContextValue['saveEmployee'] = async (emp) => {
    const isUpdate = Boolean(emp.id);
    const id = emp.id || makeId('emp');
    const existing = db.employees.find((e) => e.id === id);
    const record: Employee = {
      ...emp,
      id,
      deleted_at: null,
      created_at: existing?.created_at || new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').upsert(record);
    }
    setDb((prev) => ({
      ...prev,
      employees: isUpdate
        ? prev.employees.map((e) => (e.id === id ? record : e))
        : [record, ...prev.employees],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'employee', id, record.full_name, {
      role: record.role_title,
      active: record.is_active,
    });
  };

  const toggleEmployeeActive: AppContextValue['toggleEmployeeActive'] = async (id, isActive) => {
    const target = db.employees.find((e) => e.id === id);
    if (!target) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').update({ is_active: isActive }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, is_active: isActive } : e)),
    }));
    appendAudit('UPDATE', 'employee', id, target.full_name, { is_active: isActive });
  };

  const softDeleteEmployee = async (id: string) => {
    const target = db.employees.find((e) => e.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'employee', id, target.full_name, {});
  };

  const saveAttendance: AppContextValue['saveAttendance'] = async (employeeId, dateISO, status, notes) => {
    const existing = db.attendance.find(
      (a) => a.employee_id === employeeId && a.attendance_date === dateISO
    );
    const record: EmployeeAttendance = {
      id: existing?.id || makeId('att'),
      employee_id: employeeId,
      attendance_date: dateISO,
      status,
      notes: notes || '',
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employee_attendance').upsert(record, {
        onConflict: 'employee_id,attendance_date',
      });
    }
    setDb((prev) => ({
      ...prev,
      attendance: existing
        ? prev.attendance.map((a) => (a.id === existing.id ? record : a))
        : [record, ...prev.attendance],
    }));
  };

  const addEmployeeAdvance: AppContextValue['addEmployeeAdvance'] = async (advance) => {
    const record: EmployeeAdvance = {
      ...advance,
      id: makeId('adv'),
      is_settled: false,
      settled_month: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employee_advances').insert(record);
    }
    setDb((prev) => ({
      ...prev,
      advances: [record, ...prev.advances],
    }));
    const emp = db.employees.find((e) => e.id === advance.employee_id);
    appendAudit('PAYROLL', 'advance', record.id, emp?.full_name || advance.employee_id, {
      amount: record.amount,
      date: record.advance_date,
    });
  };

  const payEmployeeSalary: AppContextValue['payEmployeeSalary'] = async ({
    employeeId,
    month,
    netPayable,
    totalAdvancesDeducted,
    mode,
    notes,
  }) => {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;

    const targetCatName = emp.employment_type === 'monthly' ? 'Salaries' : 'Waiters (Daily Wage)';
    const cat =
      db.expenseCategories.find((c) => !c.deleted_at && c.name_en === targetCatName) ||
      db.expenseCategories.find((c) => !c.deleted_at);

    const amountToPay = Math.max(0, Math.round(netPayable));
    if (amountToPay > 0) {
      await addExpense({
        category_id: cat?.id || '',
        category_name: cat?.name_en || targetCatName,
        booking_id: null,
        employee_id: emp.id,
        amount: amountToPay,
        expense_date: todayISO(),
        payee: emp.full_name,
        mode,
        reference_no: `SAL-${month}`,
        notes: `${notes || `Salary for ${month}`} (Advances deducted: PKR ${totalAdvancesDeducted.toLocaleString()})`,
      });
    }

    // Settle all unsettled advances for this employee up to and including the paid month
    const advancesToSettle = db.advances.filter(
      (a) => !a.deleted_at && !a.is_settled && a.employee_id === employeeId && a.advance_date.slice(0, 7) <= month
    );
    if (advancesToSettle.length > 0) {
      const ids = advancesToSettle.map((a) => a.id);
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('employee_advances')
          .update({ is_settled: true, settled_month: month })
          .in('id', ids);
      }
      setDb((prev) => ({
        ...prev,
        advances: prev.advances.map((a) =>
          ids.includes(a.id) ? { ...a, is_settled: true, settled_month: month } : a
        ),
      }));
    }

    appendAudit('PAYROLL', 'salary', emp.id, emp.full_name, {
      month,
      net_payable: amountToPay,
      advances_deducted: totalAdvancesDeducted,
    });
  };

  const saveExpenseCategory: AppContextValue['saveExpenseCategory'] = async (cat) => {
    const id = cat.id || makeId('ec');
    const record: ExpenseCategory = { id, name_en: cat.name_en, name_ur: cat.name_ur, deleted_at: null };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expense_categories').upsert(record);
    }
    setDb((prev) => ({
      ...prev,
      expenseCategories: cat.id
        ? prev.expenseCategories.map((c) => (c.id === id ? record : c))
        : [...prev.expenseCategories, record],
    }));
  };

  const saveChargeCategory: AppContextValue['saveChargeCategory'] = async (cat) => {
    const id = cat.id || makeId('cc');
    const record: ChargeCategory = {
      id,
      name_en: cat.name_en,
      name_ur: cat.name_ur,
      sort_order: cat.sort_order ?? db.chargeCategories.length + 1,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charge_categories').upsert(record);
    }
    setDb((prev) => ({
      ...prev,
      chargeCategories: cat.id
        ? prev.chargeCategories.map((c) => (c.id === id ? record : c))
        : [...prev.chargeCategories, record],
    }));
  };

  const saveChargeItem: AppContextValue['saveChargeItem'] = async (item) => {
    const isUpdate = Boolean(item.id);
    const id = item.id || makeId('ch');
    const record: ChargeCatalogItem = { ...item, id, deleted_at: null };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charges_catalog').upsert(record);
    }
    setDb((prev) => ({
      ...prev,
      chargesCatalog: isUpdate
        ? prev.chargesCatalog.map((c) => (c.id === id ? record : c))
        : [...prev.chargesCatalog, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'charge', id, record.name_en, { rate: record.default_rate });
  };

  const softDeleteChargeItem = async (id: string) => {
    const target = db.chargesCatalog.find((c) => c.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charges_catalog').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setDb((prev) => ({
      ...prev,
      chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'charge', id, target.name_en, {});
  };

  const saveEventType: AppContextValue['saveEventType'] = async (et) => {
    const isUpdate = Boolean(et.id);
    const id = et.id || makeId('et');
    const record: EventTypeItem = {
      ...et,
      id,
      is_default: false,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('event_types').upsert(record);
    }
    setDb((prev) => ({
      ...prev,
      eventTypes: isUpdate
        ? prev.eventTypes.map((e) => (e.id === id ? record : e))
        : [...prev.eventTypes, record],
    }));
  };

  const saveUserProfile: AppContextValue['saveUserProfile'] = async (user) => {
    const isUpdate = Boolean(user.id);
    const id = user.id || makeId('usr');
    const existing = db.profiles.find((p) => p.id === id);
    const record: UserProfile = {
      id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      is_active: user.is_active,
      preferred_theme: user.preferred_theme ?? existing?.preferred_theme ?? null,
      created_at: existing?.created_at || new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase && !isUpdate && user.password) {
      const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password,
      });
      if (error) return { ok: false, error: error.message };
      if (data.user) {
        record.id = data.user.id;
      }
      await supabase.from('profiles').upsert(record);
    } else if (isSupabaseConfigured && supabase) {
      await supabase.from('profiles').upsert(record);
    }

    setDb((prev) => ({
      ...prev,
      profiles: isUpdate
        ? prev.profiles.map((p) => (p.id === id ? record : p))
        : [record, ...prev.profiles],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'user', record.id, record.email, { role: record.role });
    return { ok: true };
  };

  const updateSettings = async (next: HallSettings) => {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('hall_settings').upsert({ ...next, id: 1 });
    }
    setDb((prev) => ({ ...prev, settings: next }));
    appendAudit('SETTINGS', 'hall_settings', '1', next.hall_name, {
      cleaning_buffer_minutes: next.cleaning_buffer_minutes,
      late_grace_minutes: next.late_grace_minutes,
      hide_discount_reason_on_invoice: next.hide_discount_reason_on_invoice,
    });
  };

  const importBookingsBatch: AppContextValue['importBookingsBatch'] = async (rows) => {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    let currentBookings = [...db.bookings];
    let seqB = db.sequences.booking;
    let seqI = db.sequences.invoice;
    const createdBookings: Booking[] = [];
    const createdItems: BookingItem[] = [];
    const defaultPkg = db.chargesCatalog.filter((c) => c.is_default_package && !c.deleted_at);

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      if (!r.customer_name || !r.event_date) {
        skipped++;
        errors.push(`Row ${idx + 1}: Missing customer name or event date`);
        continue;
      }
      const floors = r.floors && r.floors.length > 0 ? r.floors : (['First'] as Booking['floors']);
      const conflict = findBookingConflict(
        {
          event_date: r.event_date,
          start_time: r.start_time || '20:00',
          end_time: r.end_time || '00:00',
          floors,
          status: r.status || 'Confirmed',
        },
        currentBookings,
        db.settings.cleaning_buffer_minutes
      );
      if (conflict) {
        skipped++;
        errors.push(`Row ${idx + 1} (${r.customer_name}): Conflict with ${conflict.booking_code} on ${r.event_date}`);
        continue;
      }

      seqB += 1;
      seqI += 1;
      const yr = new Date().getFullYear();
      const id = makeId('bk');
      const bk: Booking = {
        id,
        booking_code: `MQ1-${yr}-${String(seqB).padStart(4, '0')}`,
        customer_name: r.customer_name,
        customer_address: r.customer_address || 'Karachi',
        customer_phone: r.customer_phone || '0300-0000000',
        customer_nic: r.customer_nic || '42101-0000000-0',
        customer_email: r.customer_email || '',
        event_type: r.event_type || 'Baraat',
        event_date: r.event_date,
        start_time: r.start_time || '20:00',
        end_time: r.end_time || '00:00',
        floors,
        guests_count: Number(r.guests_count) || 250,
        hall_rent: Number(r.hall_rent) || db.settings.default_rent_first,
        notes: r.notes || 'Imported from sheet',
        status: (r.status as Booking['status']) || 'Confirmed',
        booking_date: todayISO(),
        crates_ordered: Number(r.crates_ordered) || 0,
        crates_used: 0,
        crates_returned: 0,
        crate_rate: 1600,
        crate_handling_deduction_per_crate: db.settings.crate_deduction_per_returned,
        crate_credit_amount: 0,
        actual_end_time: null,
        late_charge_method: 'none',
        late_charge_value: 0,
        late_charge_amount: 0,
        late_charge_overridden: false,
        discount_type: 'fixed',
        discount_value: 0,
        discount_amount: 0,
        discount_reason: '',
        reschedule_history: [],
        cancellation_details: null,
        invoice_number: formatInvoiceFromPattern(db.settings.invoice_format, seqI),
        tax_percent: db.settings.tax_percent,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      createdBookings.push(bk);
      currentBookings.push(bk);
      for (const pkg of defaultPkg) {
        createdItems.push({
          id: makeId('bi'),
          booking_id: id,
          charge_id: pkg.id,
          item_name: pkg.name_en,
          item_name_ur: pkg.name_ur,
          category_name: 'Default Package',
          quantity: 1,
          rate: pkg.default_rate,
          amount: pkg.default_rate,
          is_package_included: true,
          deleted_at: null,
        });
      }
      imported++;
    }

    if (createdBookings.length > 0) {
      if (isSupabaseConfigured && supabase) {
        await supabase.from('bookings').insert(createdBookings);
        if (createdItems.length > 0) await supabase.from('booking_items').insert(createdItems);
      }
      setDb((prev) => ({
        ...prev,
        sequences: { ...prev.sequences, booking: seqB, invoice: seqI },
        bookings: [...createdBookings, ...prev.bookings],
        bookingItems: [...prev.bookingItems, ...createdItems],
      }));
      appendAudit('IMPORT', 'booking', 'batch', `${imported} Bookings Imported`, { imported, skipped });
    }
    return { imported, skipped, errors };
  };

  const resetDemoDatabase = () => {
    const fresh = createSeedDatabase();
    setDb(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  };

  return (
    <AppContext.Provider
      value={{
        db,
        currentUser,
        lang,
        theme,
        themePreferenceSource,
        loading,
        errorMsg,
        authError,
        missingProfileInfo,
        supabaseLive: isSupabaseConfigured,
        setLang,
        toggleLang,
        setTheme,
        toggleTheme,
        resetThemeToSystem,
        clearError,
        clearAuthError,
        retryProfileCheck,
        signInWithEmail,
        signInDemoRole,
        signOut,
        saveBooking,
        cancelBooking,
        softDeleteBooking,
        restoreRecord,
        addPayment,
        softDeletePayment,
        toggleInstallmentPaid,
        addExpense,
        softDeleteExpense,
        saveEmployee,
        toggleEmployeeActive,
        softDeleteEmployee,
        saveAttendance,
        addEmployeeAdvance,
        payEmployeeSalary,
        saveExpenseCategory,
        saveChargeCategory,
        saveChargeItem,
        softDeleteChargeItem,
        saveEventType,
        saveUserProfile,
        updateSettings,
        importBookingsBatch,
        resetDemoDatabase,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
