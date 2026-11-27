import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppDatabase,
  ApprovalRequest,
  ApprovalRequestType,
  AttendanceStatus,
  AuditLog,
  Booking,
  BookingItem,
  CancellationDetails,
  ChargeCatalogItem,
  ChargeCategory,
  Customer,
  DailyClosing,
  DailyClosingBookingBreakdown,
  DiscountType,
  Employee,
  EmployeeAdvance,
  EmployeeAttendance,
  EventTypeItem,
  Expense,
  ExpenseCategory,
  Hall,
  HallSettings,
  InstallmentSchedule,
  InvoiceRecord,
  Language,
  LateChargeMethod,
  Payment,
  PermissionAction,
  PermissionScreenKey,
  RescheduleEntry,
  ScreenPermissionEntry,
  ThemeMode,
  UserPermission,
  UserProfile,
  UserRole,
} from '../types';
import {
  createDefaultHallSettings,
  createEmptyDatabase,
  createNewHallCatalogTemplates,
  DEFAULT_HALL_ID,
} from '../data/seedData';
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import {
  calculateBookingFinancials,
  calculateCrateBill,
  calculateDiscountAmount,
  findBookingConflict,
  todayISO,
} from '../utils/formatters';
import {
  PERMISSION_SCREEN_KEYS,
  PermissionMatrixMap,
  getDefaultPermissionsForRole,
  hasMatrixPermission,
  toPermissionMatrix,
} from '../utils/permissions';

const THEME_STORAGE_KEY = 'marquee1_hms_theme_v1';
const ACTIVE_HALL_STORAGE_KEY = 'marquee1_hms_active_hall_v1';

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

export function makeUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isUuid(val: unknown): val is string {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function normalizeLegacyRole(role: string | undefined): UserRole {
  if (role === 'super_admin' || role === 'admin' || role === 'manager') return role;
  if (role === 'finance') return 'admin';
  if (role === 'management') return 'manager';
  return 'manager';
}

function formatCode(prefix: string, seq: number): string {
  const yr = String(new Date().getFullYear());
  return `${prefix || 'MQ1'}-${yr}-${String(seq).padStart(4, '0')}`;
}

function formatInvoiceCode(prefix: string, seq: number, pattern?: string): string {
  const yr = String(new Date().getFullYear());
  if (pattern && pattern.includes('{YYYY}') && pattern.includes('{0000}')) {
    const base = pattern.replace('{YYYY}', yr).replace('{0000}', String(seq).padStart(4, '0'));
    if (prefix && !base.startsWith(prefix)) {
      return `${prefix}-${yr}-${String(seq).padStart(4, '0')}`;
    }
    return base;
  }
  return `${prefix || 'INV'}-${yr}-${String(seq).padStart(4, '0')}`;
}

function hydrateBooking(b: Booking): Booking {
  return {
    ...b,
    hall_id: b.hall_id || DEFAULT_HALL_ID,
    inspection_notes: b.inspection_notes || '',
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

function hydrateProfile(p: UserProfile): UserProfile {
  const role = normalizeLegacyRole(p.role as unknown as string);
  return {
    ...p,
    role,
    hall_id: role === 'super_admin' ? p.hall_id ?? null : p.hall_id || DEFAULT_HALL_ID,
  };
}

export interface ManageUserActionPayload {
  action: 'create_user' | 'update_user' | 'update_permissions' | 'reset_password' | 'toggle_active';
  userId?: string;
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  hall_id?: string | null;
  is_active?: boolean;
  permissions?: ScreenPermissionEntry[];
}

interface AppContextValue {
  db: AppDatabase; // Scoped to activeHallId for all business tables
  rawDb: AppDatabase; // Unfiltered multi-hall database (for super_admin full backups)
  activeHallId: string;
  activeHall: Hall;
  setActiveHallId: (hallId: string) => void;
  currentUser: UserProfile | null;
  currentUserPermissions: PermissionMatrixMap;
  can: (screenKey: PermissionScreenKey, action?: PermissionAction) => boolean;
  getPermissionsForUser: (userId: string) => ScreenPermissionEntry[];
  lang: Language;
  theme: ThemeMode;
  themePreferenceSource: 'system' | 'saved';
  loading: boolean;
  authInitializing: boolean;
  errorMsg: string | null;
  authError: string | null;
  missingProfileInfo: { uid: string; email: string } | null;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  resetThemeToSystem: () => void;
  clearError: () => void;
  clearAuthError: () => void;
  retryProfileCheck: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  // Halls (super_admin)
  saveHall: (hall: Omit<Hall, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<{ ok: boolean; error?: string; hall?: Hall }>;
  // Customers
  saveCustomer: (cust: Omit<Customer, 'id' | 'hall_id' | 'deleted_at' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<{ ok: boolean; error?: string; customer?: Customer }>;
  softDeleteCustomer: (id: string) => Promise<void>;
  // Bookings
  saveBooking: (
    bookingData: Omit<
      Booking,
      'id' | 'hall_id' | 'booking_code' | 'booking_date' | 'invoice_number' | 'updated_at' | 'deleted_at' | 'reschedule_history'
    > & {
      id?: string;
      hall_id?: string;
      booking_code?: string;
      booking_date?: string;
      invoice_number?: string;
      reschedule_history?: RescheduleEntry[];
    },
    items: Omit<BookingItem, 'booking_id' | 'hall_id' | 'deleted_at'>[],
    installments: Omit<InstallmentSchedule, 'booking_id' | 'hall_id' | 'deleted_at'>[],
    rescheduleInfo?: { reason: string; fee: number }
  ) => Promise<{ ok: boolean; error?: string; booking?: Booking }>;
  cancelBooking: (bookingId: string, details: CancellationDetails) => Promise<void>;
  softDeleteBooking: (id: string) => Promise<void>;
  restoreRecord: (entityType: 'booking' | 'payment' | 'expense' | 'charge' | 'employee' | 'customer', id: string) => Promise<void>;
  // Payments
  addPayment: (payment: Omit<Payment, 'id' | 'hall_id' | 'receipt_number' | 'deleted_at' | 'created_at'>) => Promise<{ ok: boolean; payment?: Payment; error?: string }>;
  softDeletePayment: (id: string) => Promise<void>;
  toggleInstallmentPaid: (id: string, paid: boolean) => Promise<void>;
  // Daily Cash Closing
  saveDailyClosing: (params: {
    closing_date: string;
    cash_total: number;
    online_total: number;
    grand_total: number;
    bookings_breakdown: DailyClosingBookingBreakdown[];
    manager_notes: string;
  }) => Promise<{ ok: boolean; error?: string; closing?: DailyClosing }>;
  reviewDailyClosing: (
    closingId: string,
    decision: 'received' | 'flagged',
    discrepancyAmount: number,
    adminNotes: string
  ) => Promise<{ ok: boolean; error?: string }>;
  // Manager Approval Requests
  submitApprovalRequest: (params: {
    booking_id: string;
    booking_code: string;
    customer_name: string;
    request_type: ApprovalRequestType;
    payload: Record<string, unknown>;
    reason: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  reviewApprovalRequest: (
    requestId: string,
    decision: 'approved' | 'rejected',
    reviewNote: string
  ) => Promise<{ ok: boolean; error?: string }>;
  // Expenses, Staff, Attendance & Payroll
  addExpense: (expense: Omit<Expense, 'id' | 'hall_id' | 'deleted_at' | 'created_at'>) => Promise<void>;
  softDeleteExpense: (id: string) => Promise<void>;
  saveEmployee: (emp: Omit<Employee, 'id' | 'hall_id' | 'deleted_at' | 'created_at'> & { id?: string }) => Promise<void>;
  toggleEmployeeActive: (id: string, isActive: boolean) => Promise<void>;
  softDeleteEmployee: (id: string) => Promise<void>;
  saveAttendance: (employeeId: string, dateISO: string, status: AttendanceStatus, notes?: string) => Promise<void>;
  addEmployeeAdvance: (advance: Omit<EmployeeAdvance, 'id' | 'hall_id' | 'is_settled' | 'settled_month' | 'deleted_at' | 'created_at'>) => Promise<void>;
  payEmployeeSalary: (params: {
    employeeId: string;
    month: string;
    netPayable: number;
    totalAdvancesDeducted: number;
    mode: Payment['mode'];
    notes: string;
  }) => Promise<void>;
  saveExpenseCategory: (cat: { id?: string; name_en: string; name_ur: string }) => Promise<void>;
  // Catalog, Event Types & Users
  saveChargeCategory: (cat: { id?: string; name_en: string; name_ur: string; sort_order?: number }) => Promise<void>;
  saveChargeItem: (item: Omit<ChargeCatalogItem, 'id' | 'hall_id' | 'deleted_at'> & { id?: string }) => Promise<void>;
  softDeleteChargeItem: (id: string) => Promise<void>;
  saveEventType: (et: Omit<EventTypeItem, 'id' | 'hall_id' | 'deleted_at' | 'is_default'> & { id?: string }) => Promise<void>;
  manageUserWithEdgeFunction: (payload: ManageUserActionPayload) => Promise<{ ok: boolean; error?: string; profile?: UserProfile }>;
  updateSettings: (next: HallSettings) => Promise<void>;
  importBookingsBatch: (rows: Array<Partial<Booking>>) => Promise<{ imported: number; skipped: number; errors: string[] }>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawDb, setRawDb] = useState<AppDatabase>(() => createEmptyDatabase());

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [selectedHallId, setSelectedHallId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_HALL_STORAGE_KEY) || DEFAULT_HALL_ID;
    } catch {
      return DEFAULT_HALL_ID;
    }
  });

  const activeHallId = useMemo(() => {
    if (currentUser && currentUser.role !== 'super_admin') {
      return currentUser.hall_id || DEFAULT_HALL_ID;
    }
    const exists = rawDb.halls.some((h) => h.id === selectedHallId);
    return exists ? selectedHallId : rawDb.halls[0]?.id || DEFAULT_HALL_ID;
  }, [currentUser, rawDb.halls, selectedHallId]);

  const activeHall: Hall = useMemo(() => {
    return (
      rawDb.halls.find((h) => h.id === activeHallId) ||
      rawDb.halls[0] || {
        id: DEFAULT_HALL_ID,
        name: 'Marquee 1',
        name_ur: 'مارکی 1 بینکوئٹ ہال',
        address: 'Plot 14-C, Main Shahrah-e-Faisal, Block 6 PECHS, Karachi',
        address_ur: 'پلاٹ 14-سی، مین شاہراہِ فیصل، بلاک 6 پی ای سی ایچ ایس، کراچی',
        phone: '0300-2198844',
        email: 'bookings@marquee1.pk',
        logo_url: '',
        booking_code_prefix: 'MQ1',
        invoice_prefix: 'INV',
        is_active: true,
        created_at: todayISO(),
      }
    );
  }, [rawDb.halls, activeHallId]);

  const setActiveHallId = (hallId: string) => {
    if (currentUser && currentUser.role !== 'super_admin') return;
    setSelectedHallId(hallId);
    try {
      localStorage.setItem(ACTIVE_HALL_STORAGE_KEY, hallId);
    } catch {
      // ignore
    }
  };

  // Hall-scoped view of the database consumed by views
  const db: AppDatabase = useMemo(() => {
    const hallSettingsObj =
      rawDb.hallSettings.find((s) => s.hall_id === activeHallId) ||
      createDefaultHallSettings(activeHallId, {
        hall_name: activeHall.name,
        hall_name_ur: activeHall.name_ur,
        address: activeHall.address,
        address_ur: activeHall.address_ur,
        phone: activeHall.phone,
        email: activeHall.email,
        logo_url: activeHall.logo_url,
      });

    const scopedProfiles =
      currentUser?.role === 'super_admin'
        ? rawDb.profiles
        : rawDb.profiles.filter((p) => p.hall_id === activeHallId);

    const byHall = <T extends { hall_id: string }>(arr: T[]) =>
      arr.filter((item) => item.hall_id === activeHallId);

    const hallSeq = rawDb.perHallSequences[activeHallId] || { booking: 0, invoice: 0, receipt: 0 };

    return {
      halls:
        currentUser?.role === 'super_admin'
          ? rawDb.halls
          : rawDb.halls.filter((h) => h.id === activeHallId),
      hallSettings: rawDb.hallSettings,
      settings: hallSettingsObj,
      profiles: scopedProfiles,
      userPermissions:
        currentUser?.role === 'super_admin'
          ? rawDb.userPermissions
          : rawDb.userPermissions.filter((up) => up.hall_id === activeHallId),
      customers: byHall(rawDb.customers),
      eventTypes: byHall(rawDb.eventTypes),
      chargeCategories: byHall(rawDb.chargeCategories),
      chargesCatalog: byHall(rawDb.chargesCatalog),
      bookings: byHall(rawDb.bookings),
      invoices: byHall(rawDb.invoices),
      bookingItems: byHall(rawDb.bookingItems),
      installments: byHall(rawDb.installments),
      payments: byHall(rawDb.payments),
      expenseCategories: byHall(rawDb.expenseCategories),
      employees: byHall(rawDb.employees),
      attendance: byHall(rawDb.attendance),
      advances: byHall(rawDb.advances),
      expenses: byHall(rawDb.expenses),
      dailyClosings: byHall(rawDb.dailyClosings),
      approvalRequests: byHall(rawDb.approvalRequests),
      auditLogs: byHall(rawDb.auditLogs),
      perHallSequences: rawDb.perHallSequences,
      sequences: hallSeq,
    };
  }, [rawDb, activeHallId, activeHall, currentUser?.role]);

  const getPermissionsForUser = (userId: string): ScreenPermissionEntry[] => {
    const profile = rawDb.profiles.find((p) => p.id === userId);
    if (profile?.role === 'super_admin') {
      return getDefaultPermissionsForRole('super_admin');
    }
    const rows = rawDb.userPermissions.filter(
      (up) => up.user_id === userId && (!profile?.hall_id || up.hall_id === profile.hall_id)
    );
    const matrix = toPermissionMatrix(rows, profile?.role);
    return PERMISSION_SCREEN_KEYS.map((k) => matrix[k]);
  };

  const currentUserPermissions: PermissionMatrixMap = useMemo(() => {
    if (!currentUser) {
      return toPermissionMatrix([], undefined);
    }
    if (currentUser.role === 'super_admin') {
      return toPermissionMatrix([], 'super_admin');
    }
    const rows = rawDb.userPermissions.filter(
      (up) =>
        up.user_id === currentUser.id &&
        (!currentUser.hall_id || up.hall_id === currentUser.hall_id)
    );
    return toPermissionMatrix(rows, currentUser.role);
  }, [rawDb.userPermissions, currentUser]);

  const can = (screenKey: PermissionScreenKey, action: PermissionAction = 'view'): boolean => {
    if (!currentUser || !currentUser.is_active) return false;
    return hasMatrixPermission(currentUserPermissions, currentUser.role, screenKey, action);
  };

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
  const [authInitializing, setAuthInitializing] = useState<boolean>(() => isSupabaseConfigured);
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

        const profileRow = profileRes.data ? hydrateProfile(profileRes.data as UserProfile) : null;

        if (!profileRow) {
          const msg = `Signed in (${authEmail || uid}), but no profile/role row was found in public.profiles. Run the SQL snippet below in Supabase SQL Editor or ask your Super Admin to add your profile and role.`;
          console.warn('[Auth] Missing profile/role row in public.profiles for authenticated user:', { uid });
          setMissingProfileInfo({ uid, email: authEmail || '' });
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        if (!profileRow.is_active) {
          const msg = 'Your staff profile is deactivated (is_active = false). Please contact Super Admin or your Hall Admin.';
          console.warn('[Auth] Deactivated user profile:', { uid });
          setMissingProfileInfo(null);
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        setMissingProfileInfo(null);
        setAuthError(null);
        setCurrentUser(profileRow);
        if (profileRow.role !== 'super_admin' && profileRow.hall_id) {
          setSelectedHallId(profileRow.hall_id);
        }
        if (profileRow.preferred_theme === 'light' || profileRow.preferred_theme === 'dark') {
          setThemeState(profileRow.preferred_theme);
          setThemePreferenceSource('saved');
          try {
            localStorage.setItem(THEME_STORAGE_KEY, profileRow.preferred_theme);
          } catch {
            // ignore
          }
        }

        const [
          hallsRes,
          profilesAllRes,
          userPermsRes,
          settingsRes,
          customersRes,
          eventTypesRes,
          chargeCatsRes,
          chargesRes,
          bookingsRes,
          invoicesRes,
          itemsRes,
          installmentsRes,
          paymentsRes,
          expCatsRes,
          employeesRes,
          attendanceRes,
          advancesRes,
          expensesRes,
          closingsRes,
          approvalsRes,
          auditRes,
        ] = await Promise.all([
          supabase.from('halls').select('*').order('created_at', { ascending: true }),
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('user_permissions').select('*'),
          supabase.from('hall_settings').select('*'),
          supabase.from('customers').select('*').order('full_name'),
          supabase.from('event_types').select('*').order('name_en'),
          supabase.from('charge_categories').select('*').order('sort_order'),
          supabase.from('charges_catalog').select('*').order('name_en'),
          supabase.from('bookings').select('*').order('event_date', { ascending: true }),
          supabase.from('invoices').select('*').order('issued_at', { ascending: false }),
          supabase.from('booking_items').select('*'),
          supabase.from('installment_schedules').select('*').order('due_date'),
          supabase.from('payments').select('*').order('payment_date', { ascending: false }),
          supabase.from('expense_categories').select('*').order('name_en'),
          supabase.from('employees').select('*').order('full_name'),
          supabase.from('employee_attendance').select('*').order('attendance_date', { ascending: false }),
          supabase.from('employee_advances').select('*').order('advance_date', { ascending: false }),
          supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
          supabase.from('daily_closings').select('*').order('closing_date', { ascending: false }),
          supabase.from('approval_requests').select('*').order('requested_at', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(250),
        ]);

        setRawDb((prev) => {
          const nextHalls = hallsRes.data ? (hallsRes.data as Hall[]) : [];
          const nextHallSettings = settingsRes.data ? (settingsRes.data as HallSettings[]) : [];
          return {
            ...prev,
            halls: nextHalls,
            hallSettings: nextHallSettings,
            settings: nextHallSettings[0] || createDefaultHallSettings(profileRow.hall_id || DEFAULT_HALL_ID),
            profiles: profilesAllRes.data
              ? (profilesAllRes.data as UserProfile[]).map(hydrateProfile)
              : [profileRow],
            userPermissions: userPermsRes.data ? (userPermsRes.data as UserPermission[]) : [],
            customers: (customersRes.data as Customer[]) || [],
            eventTypes: (eventTypesRes.data as EventTypeItem[]) || [],
            chargeCategories: (chargeCatsRes.data as ChargeCategory[]) || [],
            chargesCatalog: (chargesRes.data as ChargeCatalogItem[]) || [],
            bookings: bookingsRes.data ? (bookingsRes.data as Booking[]).map(hydrateBooking) : [],
            invoices: (invoicesRes.data as InvoiceRecord[]) || [],
            bookingItems: (itemsRes.data as BookingItem[]) || [],
            installments: (installmentsRes.data as InstallmentSchedule[]) || [],
            payments: (paymentsRes.data as Payment[]) || [],
            expenseCategories: (expCatsRes.data as ExpenseCategory[]) || [],
            employees: (employeesRes.data as Employee[]) || [],
            attendance: (attendanceRes.data as EmployeeAttendance[]) || [],
            advances: (advancesRes.data as EmployeeAdvance[]) || [],
            expenses: (expensesRes.data as Expense[]) || [],
            dailyClosings: (closingsRes.data as DailyClosing[]) || [],
            approvalRequests: (approvalsRes.data as ApprovalRequest[]) || [],
            auditLogs: (auditRes.data as AuditLog[]) || [],
          };
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to sync with Supabase';
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
    if (!isSupabaseConfigured || !supabase) {
      setAuthInitializing(false);
      return;
    }
    let mounted = true;
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          console.error('[Auth] Session restore error:', error.message);
        }
        if (data.session?.user) {
          await fetchLiveSupabaseData(data.session.user.id, data.session.user.email);
        }
      })
      .finally(() => {
        if (mounted) setAuthInitializing(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        fetchLiveSupabaseData(session.user.id, session.user.email);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setRawDb(createEmptyDatabase());
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
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
    setRawDb((prev) => ({
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
    changes: Record<string, unknown>,
    hallIdOverride?: string
  ) => {
    const hallId = hallIdOverride || activeHallId;
    const entry: AuditLog = {
      id: makeUUID(),
      hall_id: hallId,
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
    setRawDb((prev) => ({
      ...prev,
      auditLogs: [entry, ...prev.auditLogs],
    }));
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    setMissingProfileInfo(null);
    if (!isSupabaseConfigured || !supabase) {
      const msg = 'App is not configured. Please contact the administrator.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
    if (!email.trim() || !password) {
      const msg = 'Email and password are required.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
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
  };

  const signOut = async () => {
    setAuthError(null);
    setMissingProfileInfo(null);
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setRawDb(createEmptyDatabase());
  };

  // =========================================================================
  // HALLS MANAGEMENT (Super Admin)
  // =========================================================================
  const saveHall: AppContextValue['saveHall'] = async (hallData) => {
    if (currentUser?.role !== 'super_admin') {
      return { ok: false, error: 'Only Super Admin can create or edit halls.' };
    }
    const isUpdate = Boolean(hallData.id);
    const hallId = hallData.id || makeUUID();
    const existing = rawDb.halls.find((h) => h.id === hallId);
    const now = new Date().toISOString();

    const record: Hall = {
      id: hallId,
      name: hallData.name.trim(),
      name_ur: hallData.name_ur.trim() || hallData.name.trim(),
      address: hallData.address.trim(),
      address_ur: hallData.address_ur.trim() || hallData.address.trim(),
      phone: hallData.phone.trim(),
      email: hallData.email.trim(),
      logo_url: hallData.logo_url.trim(),
      booking_code_prefix: (hallData.booking_code_prefix || 'MQ').trim().toUpperCase(),
      invoice_prefix: (hallData.invoice_prefix || 'INV').trim().toUpperCase(),
      is_active: hallData.is_active,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('halls').upsert(record).select('*').single();
      if (error) return { ok: false, error: error.message };
      if (data) Object.assign(record, data);
    }

    if (!isUpdate) {
      const newSettings = createDefaultHallSettings(hallId, {
        id: makeUUID(),
        hall_id: hallId,
        hall_name: record.name,
        hall_name_ur: record.name_ur,
        address: record.address,
        address_ur: record.address_ur,
        phone: record.phone,
        email: record.email,
        logo_url: record.logo_url,
        invoice_format: `${record.invoice_prefix}-{YYYY}-{0000}`,
      });

      const {
        eventTypes: seededEventTypes,
        chargeCategories: seededChargeCats,
        chargesCatalog: seededCharges,
        expenseCategories: seededExpCats,
      } = createNewHallCatalogTemplates(hallId, makeUUID);

      if (isSupabaseConfigured && supabase) {
        await supabase.from('hall_sequences').upsert({ hall_id: hallId, booking_seq: 0, invoice_seq: 0, receipt_seq: 0 });
        await supabase.from('hall_settings').upsert({ ...newSettings, id: makeUUID() }, { onConflict: 'hall_id' });
        await supabase.from('event_types').insert(seededEventTypes);
        await supabase.from('charge_categories').insert(seededChargeCats);
        await supabase.from('charges_catalog').insert(seededCharges);
        await supabase.from('expense_categories').insert(seededExpCats);
      }

      setRawDb((prev) => ({
        ...prev,
        halls: [...prev.halls, record],
        hallSettings: [...prev.hallSettings, newSettings],
        eventTypes: [...prev.eventTypes, ...seededEventTypes],
        chargeCategories: [...prev.chargeCategories, ...seededChargeCats],
        chargesCatalog: [...prev.chargesCatalog, ...seededCharges],
        expenseCategories: [...prev.expenseCategories, ...seededExpCats],
        perHallSequences: {
          ...prev.perHallSequences,
          [hallId]: { booking: 0, invoice: 0, receipt: 0 },
        },
      }));
    } else {
      setRawDb((prev) => ({
        ...prev,
        halls: prev.halls.map((h) => (h.id === hallId ? record : h)),
      }));
    }

    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'hall', hallId, record.name, {
      booking_code_prefix: record.booking_code_prefix,
      invoice_prefix: record.invoice_prefix,
      is_active: record.is_active,
    }, hallId);

    return { ok: true, hall: record };
  };

  // =========================================================================
  // CUSTOMERS
  // =========================================================================
  const saveCustomer: AppContextValue['saveCustomer'] = async (cust) => {
    if (!can('customers', 'edit')) {
      return { ok: false, error: 'You do not have Edit permission for Customers.' };
    }
    const isUpdate = Boolean(cust.id);
    const id = cust.id || makeUUID();
    const existing = rawDb.customers.find((c) => c.id === id);
    const now = new Date().toISOString();

    const record: Customer = {
      id,
      hall_id: activeHallId,
      full_name: cust.full_name.trim(),
      phone: cust.phone.trim(),
      nic: cust.nic.trim(),
      address: cust.address.trim(),
      email: cust.email.trim(),
      notes: cust.notes.trim(),
      deleted_at: null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('customers').upsert(record);
      if (error) return { ok: false, error: error.message };
    }

    setRawDb((prev) => ({
      ...prev,
      customers: isUpdate
        ? prev.customers.map((c) => (c.id === id ? record : c))
        : [record, ...prev.customers],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'customer', id, record.full_name, { phone: record.phone });
    return { ok: true, customer: record };
  };

  const softDeleteCustomer = async (id: string) => {
    if (!can('customers', 'delete')) return;
    const target = db.customers.find((c) => c.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('customers').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'customer', id, target.full_name, { phone: target.phone });
  };

  // =========================================================================
  // BOOKINGS & INVOICES
  // =========================================================================
  const upsertCustomerForBooking = async (
    hallId: string,
    bookingData: {
      customer_id?: string | null;
      customer_name: string;
      customer_phone: string;
      customer_nic: string;
      customer_address: string;
      customer_email?: string;
    }
  ): Promise<Customer> => {
    const cleanPhone = bookingData.customer_phone.replace(/\D/g, '');
    const existing = rawDb.customers.find(
      (c) =>
        c.hall_id === hallId &&
        !c.deleted_at &&
        ((bookingData.customer_id && c.id === bookingData.customer_id) ||
          (cleanPhone && c.phone.replace(/\D/g, '') === cleanPhone) ||
          (bookingData.customer_nic && c.nic === bookingData.customer_nic))
    );

    const now = new Date().toISOString();
    const record: Customer = {
      id: existing?.id || makeUUID(),
      hall_id: hallId,
      full_name: bookingData.customer_name,
      phone: bookingData.customer_phone,
      nic: bookingData.customer_nic,
      address: bookingData.customer_address,
      email: bookingData.customer_email || existing?.email || '',
      notes: existing?.notes || '',
      deleted_at: null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (isSupabaseConfigured && supabase) {
      await supabase.from('customers').upsert(record);
    }

    setRawDb((prev) => {
      const existsInState = prev.customers.some((c) => c.id === record.id);
      return {
        ...prev,
        customers: existsInState
          ? prev.customers.map((c) => (c.id === record.id ? record : c))
          : [record, ...prev.customers],
      };
    });

    return record;
  };

  const syncInvoiceForBooking = async (
    booking: Booking,
    items: BookingItem[],
    payments: Payment[]
  ) => {
    const fin = calculateBookingFinancials(booking, items, payments);
    const existingInv = rawDb.invoices.find(
      (inv) => inv.booking_id === booking.id && !inv.deleted_at
    );
    const invRecord: InvoiceRecord = {
      id: existingInv?.id || makeUUID(),
      hall_id: booking.hall_id,
      booking_id: booking.id,
      invoice_number: booking.invoice_number,
      standard_total: fin.standardTotal,
      discount_amount: fin.discountAmount,
      tax_amount: fin.taxAmount,
      grand_total: fin.grandTotal,
      issued_at: existingInv?.issued_at || new Date().toISOString(),
      created_by: existingInv?.created_by || currentUser?.id,
      deleted_at: null,
    };

    if (isSupabaseConfigured && supabase) {
      await supabase.from('invoices').upsert(invRecord);
    }

    setRawDb((prev) => {
      const exists = prev.invoices.some((i) => i.id === invRecord.id);
      return {
        ...prev,
        invoices: exists
          ? prev.invoices.map((i) => (i.id === invRecord.id ? invRecord : i))
          : [invRecord, ...prev.invoices],
      };
    });
  };

  const saveBooking: AppContextValue['saveBooking'] = async (
    bookingData,
    items,
    installments,
    rescheduleInfo
  ) => {
    const targetHallId = bookingData.hall_id || activeHallId;
    const hallObj = rawDb.halls.find((h) => h.id === targetHallId) || activeHall;
    const hallSettingsObj =
      rawDb.hallSettings.find((s) => s.hall_id === targetHallId) || db.settings;
    const hallBookings = rawDb.bookings.filter((b) => b.hall_id === targetHallId);

    const conflict = findBookingConflict(
      {
        id: bookingData.id,
        hall_id: targetHallId,
        event_date: bookingData.event_date,
        start_time: bookingData.start_time,
        end_time: bookingData.end_time,
        floors: bookingData.floors,
        status: bookingData.status,
      },
      hallBookings,
      hallSettingsObj.cleaning_buffer_minutes
    );

    if (conflict) {
      return {
        ok: false,
        error: `${conflict.booking_code} (${conflict.floors.join(', ')} · ${conflict.event_date} ${conflict.start_time}–${conflict.end_time}, incl. ${hallSettingsObj.cleaning_buffer_minutes}m cleaning buffer)`,
      };
    }

    const crateCalc = calculateCrateBill(
      bookingData.crates_ordered,
      bookingData.crates_returned,
      bookingData.crate_rate,
      bookingData.crate_handling_deduction_per_crate
    );

    const isUpdate = Boolean(bookingData.id);
    const existing = isUpdate ? rawDb.bookings.find((b) => b.id === bookingData.id) : undefined;
    const currentSeq = rawDb.perHallSequences[targetHallId] || { booking: 0, invoice: 0, receipt: 0 };

    const nextSeqBooking = currentSeq.booking + (isUpdate ? 0 : 1);
    const nextSeqInvoice = currentSeq.invoice + (isUpdate ? 0 : 1);

    const bookingId = existing?.id || makeUUID();
    let bookingCode =
      existing?.booking_code ||
      formatCode(hallObj.booking_code_prefix || 'MQ1', nextSeqBooking);
    let invoiceNum =
      existing?.invoice_number ||
      formatInvoiceCode(hallObj.invoice_prefix || 'INV', nextSeqInvoice, hallSettingsObj.invoice_format);

    let rescheduleHistory = [...(existing?.reschedule_history || bookingData.reschedule_history || [])];
    const dateChanged = Boolean(existing && existing.event_date !== bookingData.event_date);
    if (existing && dateChanged) {
      const resEntry: RescheduleEntry = {
        id: makeUUID(),
        old_date: existing.event_date,
        new_date: bookingData.event_date,
        changed_by: currentUser?.full_name || 'Staff',
        changed_at: new Date().toISOString(),
        reason: rescheduleInfo?.reason?.trim() || 'Date changed by staff',
        fee: Math.max(0, Number(rescheduleInfo?.fee) || 0),
      };
      rescheduleHistory = [resEntry, ...rescheduleHistory];
    }

    if (!can('bookings', 'edit')) {
      return { ok: false, error: 'You do not have Edit permission for Bookings.' };
    }
    let syncedCustomerId: string | null = bookingData.customer_id ?? existing?.customer_id ?? null;
    if (can('customers', 'edit')) {
      const syncedCustomer = await upsertCustomerForBooking(targetHallId, bookingData);
      syncedCustomerId = syncedCustomer.id;
    }

    const record: Booking = {
      ...bookingData,
      id: bookingId,
      hall_id: targetHallId,
      customer_id: syncedCustomerId,
      inspection_notes: bookingData.inspection_notes || '',
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
      id: isUuid(it.id) ? it.id : makeUUID(),
      hall_id: targetHallId,
      booking_id: bookingId,
      charge_id: isUuid(it.charge_id) ? it.charge_id : null,
      amount: it.is_crate_service ? Number(it.amount) : Number(it.quantity) * Number(it.rate),
      deleted_at: null,
    }));

    const nextInstallments: InstallmentSchedule[] = installments.map((ins) => ({
      ...ins,
      id: isUuid(ins.id) ? ins.id : makeUUID(),
      hall_id: targetHallId,
      booking_id: bookingId,
      deleted_at: null,
    }));

    if (isSupabaseConfigured && supabase) {
      const dbPayload: Record<string, unknown> = {
        ...record,
        customer_id: isUuid(record.customer_id) ? record.customer_id : null,
      };
      if (!isUpdate) {
        // Let PostgreSQL trigger assign atomic per-hall booking_code and invoice_number
        delete dbPayload.booking_code;
        delete dbPayload.invoice_number;
      }

      const { data: savedRow, error } = await supabase
        .from('bookings')
        .upsert(dbPayload)
        .select('*')
        .single();

      if (error) return { ok: false, error: error.message };
      if (savedRow) {
        bookingCode = (savedRow as Booking).booking_code;
        invoiceNum = (savedRow as Booking).invoice_number;
        record.booking_code = bookingCode;
        record.invoice_number = invoiceNum;
      }

      const prevItemIds = rawDb.bookingItems
        .filter((i) => i.booking_id === bookingId && !i.deleted_at)
        .map((i) => i.id);
      const nextItemIds = new Set(nextItems.map((i) => i.id));
      const removedItemIds = prevItemIds.filter((id) => !nextItemIds.has(id));

      if (removedItemIds.length > 0) {
        await supabase.from('booking_items').delete().in('id', removedItemIds);
      }
      if (nextItems.length > 0) {
        await supabase.from('booking_items').upsert(nextItems);
      }

      const prevInstIds = rawDb.installments
        .filter((i) => i.booking_id === bookingId && !i.deleted_at)
        .map((i) => i.id);
      const nextInstIds = new Set(nextInstallments.map((i) => i.id));
      const removedInstIds = prevInstIds.filter((id) => !nextInstIds.has(id));

      if (removedInstIds.length > 0) {
        await supabase.from('installment_schedules').delete().in('id', removedInstIds);
      }
      if (nextInstallments.length > 0) {
        await supabase.from('installment_schedules').upsert(nextInstallments);
      }
    }

    setRawDb((prev) => ({
      ...prev,
      perHallSequences: {
        ...prev.perHallSequences,
        [targetHallId]: {
          ...currentSeq,
          booking: nextSeqBooking,
          invoice: nextSeqInvoice,
        },
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

    await syncInvoiceForBooking(record, nextItems, rawDb.payments);

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
      appendAudit('RESCHEDULE', 'booking', bookingId, bookingCode, changes, targetHallId);
    } else {
      if (!existing) changes.event_date = record.event_date;
      appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'booking', bookingId, bookingCode, changes, targetHallId);
    }

    return { ok: true, booking: record };
  };

  const cancelBooking: AppContextValue['cancelBooking'] = async (bookingId, details) => {
    if (!can('bookings', 'edit')) return;
    const target = rawDb.bookings.find((b) => b.id === bookingId);
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
    setRawDb((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === bookingId ? updated : b)),
    }));
    appendAudit(
      'CANCEL',
      'booking',
      bookingId,
      target.booking_code,
      {
        paid: details.amount_paid_so_far,
        deduction: details.deduction_amount,
        refund: details.refund_amount,
        reason: details.reason,
      },
      target.hall_id
    );
  };

  const softDeleteBooking = async (id: string) => {
    if (!can('bookings', 'delete')) return;
    const target = rawDb.bookings.find((b) => b.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('bookings').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: deletedAt } : b)),
    }));
    appendAudit('DELETE', 'booking', id, target.booking_code, { customer_name: target.customer_name }, target.hall_id);
  };

  const restoreRecord: AppContextValue['restoreRecord'] = async (entityType, id) => {
    if (!can('recycle_bin', 'edit')) return;
    if (entityType === 'booking') {
      const target = rawDb.bookings.find((b) => b.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('bookings').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: null } : b)),
      }));
      appendAudit('RESTORE', 'booking', id, target.booking_code, {}, target.hall_id);
    } else if (entityType === 'payment') {
      const target = rawDb.payments.find((p) => p.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('payments').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)),
      }));
      appendAudit('RESTORE', 'payment', id, target.receipt_number, {}, target.hall_id);
    } else if (entityType === 'expense') {
      const target = rawDb.expenses.find((e) => e.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('expenses').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'expense', id, target.payee, {}, target.hall_id);
    } else if (entityType === 'charge') {
      const target = rawDb.chargesCatalog.find((c) => c.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('charges_catalog').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)),
      }));
      appendAudit('RESTORE', 'charge', id, target.name_en, {}, target.hall_id);
    } else if (entityType === 'employee') {
      const target = rawDb.employees.find((e) => e.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('employees').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'employee', id, target.full_name, {}, target.hall_id);
    } else if (entityType === 'customer') {
      const target = rawDb.customers.find((c) => c.id === id);
      if (!target) return;
      if (isSupabaseConfigured && supabase) {
        await supabase.from('customers').update({ deleted_at: null }).eq('id', id);
      }
      setRawDb((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)),
      }));
      appendAudit('RESTORE', 'customer', id, target.full_name, {}, target.hall_id);
    }
  };

  // =========================================================================
  // PAYMENTS
  // =========================================================================
  const addPayment: AppContextValue['addPayment'] = async (paymentData) => {
    if (!can('payments', 'edit') && !can('bookings', 'edit')) {
      return { ok: false, error: 'You do not have Edit permission for Payments.' };
    }
    const currentSeq = rawDb.perHallSequences[activeHallId] || { booking: 0, invoice: 0, receipt: 0 };
    const nextSeq = currentSeq.receipt + 1;
    const year = new Date().getFullYear();
    const prefix = activeHall.booking_code_prefix || 'MQ1';
    let receiptNum = `RCP-${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`;

    const record: Payment = {
      ...paymentData,
      id: makeUUID(),
      hall_id: activeHallId,
      receipt_number: receiptNum,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      const dbPayload: Record<string, unknown> = { ...record };
      delete dbPayload.receipt_number; // Let trigger assign atomic per-hall receipt_number
      const { data, error } = await supabase.from('payments').insert(dbPayload).select('*').single();
      if (error) return { ok: false, error: error.message };
      if (data) {
        receiptNum = (data as Payment).receipt_number;
        record.receipt_number = receiptNum;
      }
    }

    setRawDb((prev) => ({
      ...prev,
      perHallSequences: {
        ...prev.perHallSequences,
        [activeHallId]: { ...currentSeq, receipt: nextSeq },
      },
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
    if (!can('payments', 'delete')) return;
    const target = rawDb.payments.find((p) => p.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('payments').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: deletedAt } : p)),
    }));
    appendAudit('DELETE', 'payment', id, target.receipt_number, { amount: target.amount }, target.hall_id);
  };

  const toggleInstallmentPaid = async (id: string, paid: boolean) => {
    if (!can('payments', 'edit') && !can('bookings', 'edit')) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('installment_schedules').update({ is_paid: paid }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      installments: prev.installments.map((ins) => (ins.id === id ? { ...ins, is_paid: paid } : ins)),
    }));
  };

  // =========================================================================
  // DAILY CASH CLOSING
  // =========================================================================
  const saveDailyClosing: AppContextValue['saveDailyClosing'] = async (params) => {
    if (!can('daily_closing', 'edit')) {
      return { ok: false, error: 'You do not have Edit permission for Daily Closing.' };
    }
    const record: DailyClosing = {
      id: makeUUID(),
      hall_id: activeHallId,
      closing_date: params.closing_date,
      submitted_by: currentUser?.id || null,
      submitted_by_name: currentUser?.full_name || 'Hall Manager',
      submitted_at: new Date().toISOString(),
      cash_total: params.cash_total,
      online_total: params.online_total,
      grand_total: params.grand_total,
      bookings_breakdown: params.bookings_breakdown,
      manager_notes: params.manager_notes.trim(),
      status: 'submitted',
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      discrepancy_amount: 0,
      admin_notes: '',
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('daily_closings').insert({
        ...record,
        submitted_by: isUuid(record.submitted_by) ? record.submitted_by : null,
      });
      if (error) return { ok: false, error: error.message };
    }

    setRawDb((prev) => ({
      ...prev,
      dailyClosings: [record, ...prev.dailyClosings],
    }));
    appendAudit('CLOSING', 'daily_closing', record.id, record.closing_date, {
      cash_total: record.cash_total,
      online_total: record.online_total,
      grand_total: record.grand_total,
    });
    return { ok: true, closing: record };
  };

  const reviewDailyClosing: AppContextValue['reviewDailyClosing'] = async (
    closingId,
    decision,
    discrepancyAmount,
    adminNotes
  ) => {
    if (currentUser?.role === 'manager' || !can('daily_closing', 'edit')) {
      return { ok: false, error: 'Only Hall Admin or Super Admin with Daily Closing Edit permission can verify closings.' };
    }
    const target = rawDb.dailyClosings.find((c) => c.id === closingId);
    if (!target) return { ok: false, error: 'Closing record not found.' };

    const reviewedAt = new Date().toISOString();
    const patch = {
      status: decision,
      discrepancy_amount: decision === 'flagged' ? Number(discrepancyAmount) || 0 : 0,
      admin_notes: adminNotes.trim(),
      reviewed_by: isUuid(currentUser?.id) ? currentUser?.id : null,
      reviewed_by_name: currentUser?.full_name || 'Admin',
      reviewed_at: reviewedAt,
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('daily_closings').update(patch).eq('id', closingId);
      if (error) return { ok: false, error: error.message };
    }

    setRawDb((prev) => ({
      ...prev,
      dailyClosings: prev.dailyClosings.map((c) => (c.id === closingId ? { ...c, ...patch } : c)),
    }));
    appendAudit('CLOSING', 'daily_closing', closingId, target.closing_date, {
      decision,
      discrepancy_amount: patch.discrepancy_amount,
      admin_notes: patch.admin_notes,
    }, target.hall_id);
    return { ok: true };
  };

  // =========================================================================
  // APPROVAL REQUESTS (Manager -> Admin/Super Admin)
  // =========================================================================
  const submitApprovalRequest: AppContextValue['submitApprovalRequest'] = async (params) => {
    if (!can('bookings', 'edit')) {
      return { ok: false, error: 'You do not have Edit permission for Bookings.' };
    }
    const record: ApprovalRequest = {
      id: makeUUID(),
      hall_id: activeHallId,
      booking_id: params.booking_id,
      booking_code: params.booking_code,
      customer_name: params.customer_name,
      request_type: params.request_type,
      requested_by: currentUser?.id || null,
      requested_by_name: currentUser?.full_name || 'Hall Manager',
      requested_at: new Date().toISOString(),
      payload: params.payload,
      reason: params.reason.trim(),
      status: 'pending',
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      review_note: '',
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('approval_requests').insert({
        ...record,
        requested_by: isUuid(record.requested_by) ? record.requested_by : null,
      });
      if (error) return { ok: false, error: error.message };
    }

    setRawDb((prev) => ({
      ...prev,
      approvalRequests: [record, ...prev.approvalRequests],
    }));
    appendAudit('APPROVAL', 'approval_request', record.id, `${record.booking_code} (${record.request_type})`, {
      status: 'pending',
      reason: record.reason,
    });
    return { ok: true };
  };

  const reviewApprovalRequest: AppContextValue['reviewApprovalRequest'] = async (
    requestId,
    decision,
    reviewNote
  ) => {
    if (currentUser?.role === 'manager' || !can('bookings', 'edit')) {
      return { ok: false, error: 'Only Hall Admin or Super Admin with Bookings Edit permission can approve or reject requests.' };
    }
    const req = rawDb.approvalRequests.find((r) => r.id === requestId);
    if (!req) return { ok: false, error: 'Request not found.' };
    if (req.status !== 'pending') return { ok: false, error: 'Request has already been reviewed.' };

    const reviewedAt = new Date().toISOString();
    const patch = {
      status: decision,
      reviewed_by: isUuid(currentUser?.id) ? currentUser?.id : null,
      reviewed_by_name: currentUser?.full_name || 'Admin',
      reviewed_at: reviewedAt,
      review_note: reviewNote.trim(),
    };

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('approval_requests').update(patch).eq('id', requestId);
      if (error) return { ok: false, error: error.message };
    }

    setRawDb((prev) => ({
      ...prev,
      approvalRequests: prev.approvalRequests.map((r) => (r.id === requestId ? { ...r, ...patch } : r)),
    }));

    // Apply approved mutation to the booking
    if (decision === 'approved') {
      const targetBooking = rawDb.bookings.find((b) => b.id === req.booking_id);
      if (targetBooking) {
        if (req.request_type === 'discount') {
          const dtype = (req.payload.discount_type as DiscountType) || 'fixed';
          const dval = Number(req.payload.discount_value) || 0;
          const dreason = String(req.payload.discount_reason || req.reason || '');
          const finBefore = calculateBookingFinancials(
            { ...targetBooking, discount_value: 0, discount_amount: 0 },
            rawDb.bookingItems,
            rawDb.payments
          );
          const dAmt = calculateDiscountAmount(finBefore.standardTotal, dtype, dval);
          const updated: Booking = {
            ...targetBooking,
            discount_type: dtype,
            discount_value: dval,
            discount_amount: dAmt,
            discount_reason: dreason,
            updated_at: new Date().toISOString(),
          };
          if (isSupabaseConfigured && supabase) {
            await supabase
              .from('bookings')
              .update({
                discount_type: dtype,
                discount_value: dval,
                discount_amount: dAmt,
                discount_reason: dreason,
                updated_at: updated.updated_at,
              })
              .eq('id', targetBooking.id);
          }
          setRawDb((prev) => ({
            ...prev,
            bookings: prev.bookings.map((b) => (b.id === targetBooking.id ? updated : b)),
          }));
          await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
        } else if (req.request_type === 'cancellation' || req.request_type === 'refund') {
          const details = req.payload.cancellation_details as CancellationDetails | undefined;
          if (details) {
            await cancelBooking(targetBooking.id, {
              ...details,
              cancelled_by: `${req.requested_by_name} (Approved by ${currentUser?.full_name || 'Admin'})`,
              cancelled_at: new Date().toISOString(),
            });
          }
        } else if (req.request_type === 'reschedule_fee') {
          const fee = Math.max(0, Number(req.payload.fee) || 0);
          const oldDate = String(req.payload.old_date || targetBooking.event_date);
          const newDate = String(req.payload.new_date || targetBooking.event_date);
          const history = [...(targetBooking.reschedule_history || [])];
          const matchIdx = history.findIndex((h) => h.old_date === oldDate && h.new_date === newDate);
          if (matchIdx >= 0) {
            history[matchIdx] = { ...history[matchIdx], fee };
          } else {
            history.unshift({
              id: makeUUID(),
              old_date: oldDate,
              new_date: newDate,
              changed_by: req.requested_by_name,
              changed_at: req.requested_at,
              reason: req.reason,
              fee,
            });
          }
          const updated: Booking = {
            ...targetBooking,
            reschedule_history: history,
            updated_at: new Date().toISOString(),
          };
          if (isSupabaseConfigured && supabase) {
            await supabase
              .from('bookings')
              .update({ reschedule_history: history, updated_at: updated.updated_at })
              .eq('id', targetBooking.id);
          }
          setRawDb((prev) => ({
            ...prev,
            bookings: prev.bookings.map((b) => (b.id === targetBooking.id ? updated : b)),
          }));
          await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
        } else if (req.request_type === 'late_charge_override') {
          const method = (req.payload.late_charge_method as LateChargeMethod) || 'fixed';
          const value = Number(req.payload.late_charge_value) || 0;
          const amount = Math.max(0, Number(req.payload.late_charge_amount) || 0);
          const actualEnd = (req.payload.actual_end_time as string | null) ?? targetBooking.actual_end_time ?? null;
          const updated: Booking = {
            ...targetBooking,
            late_charge_method: method,
            late_charge_value: value,
            late_charge_amount: amount,
            late_charge_overridden: true,
            actual_end_time: actualEnd,
            updated_at: new Date().toISOString(),
          };
          if (isSupabaseConfigured && supabase) {
            await supabase
              .from('bookings')
              .update({
                late_charge_method: method,
                late_charge_value: value,
                late_charge_amount: amount,
                late_charge_overridden: true,
                actual_end_time: actualEnd,
                updated_at: updated.updated_at,
              })
              .eq('id', targetBooking.id);
          }
          setRawDb((prev) => ({
            ...prev,
            bookings: prev.bookings.map((b) => (b.id === targetBooking.id ? updated : b)),
          }));
          await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
        }
      }
    }

    appendAudit('APPROVAL', 'approval_request', requestId, `${req.booking_code} (${req.request_type})`, {
      decision,
      review_note: patch.review_note,
    }, req.hall_id);

    return { ok: true };
  };

  // =========================================================================
  // EXPENSES, STAFF, ATTENDANCE & PAYROLL
  // =========================================================================
  const addExpense: AppContextValue['addExpense'] = async (expenseData) => {
    if (!can('expenses', 'edit') && !can('salaries', 'edit')) return;
    const record: Expense = {
      ...expenseData,
      hall_id: activeHallId,
      booking_id: expenseData.booking_id || null,
      employee_id: expenseData.employee_id || null,
      id: makeUUID(),
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expenses').insert({
        ...record,
        category_id: isUuid(record.category_id) ? record.category_id : null,
        booking_id: isUuid(record.booking_id) ? record.booking_id : null,
        employee_id: isUuid(record.employee_id) ? record.employee_id : null,
      });
    }
    setRawDb((prev) => ({
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
    if (!can('expenses', 'delete')) return;
    const target = rawDb.expenses.find((e) => e.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expenses').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'expense', id, target.payee, { amount: target.amount }, target.hall_id);
  };

  const saveEmployee: AppContextValue['saveEmployee'] = async (emp) => {
    if (!can('employees', 'edit')) return;
    const isUpdate = Boolean(emp.id);
    const id = emp.id || makeUUID();
    const existing = rawDb.employees.find((e) => e.id === id);
    const record: Employee = {
      ...emp,
      id,
      hall_id: existing?.hall_id || activeHallId,
      deleted_at: null,
      created_at: existing?.created_at || new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').upsert(record);
    }
    setRawDb((prev) => ({
      ...prev,
      employees: isUpdate
        ? prev.employees.map((e) => (e.id === id ? record : e))
        : [record, ...prev.employees],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'employee', id, record.full_name, {
      role: record.role_title,
      active: record.is_active,
    }, record.hall_id);
  };

  const toggleEmployeeActive: AppContextValue['toggleEmployeeActive'] = async (id, isActive) => {
    if (!can('employees', 'edit')) return;
    const target = rawDb.employees.find((e) => e.id === id);
    if (!target) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').update({ is_active: isActive }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, is_active: isActive } : e)),
    }));
    appendAudit('UPDATE', 'employee', id, target.full_name, { is_active: isActive }, target.hall_id);
  };

  const softDeleteEmployee = async (id: string) => {
    if (!can('employees', 'delete')) return;
    const target = rawDb.employees.find((e) => e.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employees').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'employee', id, target.full_name, {}, target.hall_id);
  };

  const saveAttendance: AppContextValue['saveAttendance'] = async (employeeId, dateISO, status, notes) => {
    if (!can('attendance', 'edit')) return;
    const existing = rawDb.attendance.find(
      (a) => a.employee_id === employeeId && a.attendance_date === dateISO
    );
    const emp = rawDb.employees.find((e) => e.id === employeeId);
    const hallId = emp?.hall_id || activeHallId;
    const record: EmployeeAttendance = {
      id: existing?.id || makeUUID(),
      hall_id: hallId,
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
    setRawDb((prev) => ({
      ...prev,
      attendance: existing
        ? prev.attendance.map((a) => (a.id === existing.id ? record : a))
        : [record, ...prev.attendance],
    }));
  };

  const addEmployeeAdvance: AppContextValue['addEmployeeAdvance'] = async (advance) => {
    if (!can('salaries', 'edit')) return;
    const emp = rawDb.employees.find((e) => e.id === advance.employee_id);
    const hallId = emp?.hall_id || activeHallId;
    const record: EmployeeAdvance = {
      ...advance,
      id: makeUUID(),
      hall_id: hallId,
      is_settled: false,
      settled_month: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('employee_advances').insert(record);
    }
    setRawDb((prev) => ({
      ...prev,
      advances: [record, ...prev.advances],
    }));
    appendAudit('PAYROLL', 'advance', record.id, emp?.full_name || advance.employee_id, {
      amount: record.amount,
      date: record.advance_date,
    }, hallId);
  };

  const payEmployeeSalary: AppContextValue['payEmployeeSalary'] = async ({
    employeeId,
    month,
    netPayable,
    totalAdvancesDeducted,
    mode,
    notes,
  }) => {
    if (!can('salaries', 'edit')) return;
    const emp = rawDb.employees.find((e) => e.id === employeeId);
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

    const advancesToSettle = rawDb.advances.filter(
      (a) =>
        !a.deleted_at &&
        !a.is_settled &&
        a.employee_id === employeeId &&
        a.advance_date.slice(0, 7) <= month
    );
    if (advancesToSettle.length > 0) {
      const ids = advancesToSettle.map((a) => a.id);
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('employee_advances')
          .update({ is_settled: true, settled_month: month })
          .in('id', ids);
      }
      setRawDb((prev) => ({
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
    }, emp.hall_id);
  };

  const saveExpenseCategory: AppContextValue['saveExpenseCategory'] = async (cat) => {
    if (!can('expenses', 'edit')) return;
    const id = cat.id || makeUUID();
    const record: ExpenseCategory = {
      id,
      hall_id: activeHallId,
      name_en: cat.name_en,
      name_ur: cat.name_ur,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('expense_categories').upsert(record);
    }
    setRawDb((prev) => ({
      ...prev,
      expenseCategories: cat.id
        ? prev.expenseCategories.map((c) => (c.id === id ? record : c))
        : [...prev.expenseCategories, record],
    }));
  };

  // =========================================================================
  // CATALOG, EVENT TYPES & USERS (EDGE FUNCTION)
  // =========================================================================
  const saveChargeCategory: AppContextValue['saveChargeCategory'] = async (cat) => {
    if (!can('catalog', 'edit')) return;
    const id = cat.id || makeUUID();
    const record: ChargeCategory = {
      id,
      hall_id: activeHallId,
      name_en: cat.name_en,
      name_ur: cat.name_ur,
      sort_order: cat.sort_order ?? db.chargeCategories.length + 1,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charge_categories').upsert(record);
    }
    setRawDb((prev) => ({
      ...prev,
      chargeCategories: cat.id
        ? prev.chargeCategories.map((c) => (c.id === id ? record : c))
        : [...prev.chargeCategories, record],
    }));
  };

  const saveChargeItem: AppContextValue['saveChargeItem'] = async (item) => {
    if (!can('catalog', 'edit')) return;
    const isUpdate = Boolean(item.id);
    const id = item.id || makeUUID();
    const record: ChargeCatalogItem = { ...item, id, hall_id: activeHallId, deleted_at: null };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charges_catalog').upsert({
        ...record,
        category_id: isUuid(record.category_id) ? record.category_id : null,
      });
    }
    setRawDb((prev) => ({
      ...prev,
      chargesCatalog: isUpdate
        ? prev.chargesCatalog.map((c) => (c.id === id ? record : c))
        : [...prev.chargesCatalog, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'charge', id, record.name_en, { rate: record.default_rate });
  };

  const softDeleteChargeItem = async (id: string) => {
    if (!can('catalog', 'delete')) return;
    const target = rawDb.chargesCatalog.find((c) => c.id === id);
    if (!target) return;
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      await supabase.from('charges_catalog').update({ deleted_at: deletedAt }).eq('id', id);
    }
    setRawDb((prev) => ({
      ...prev,
      chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'charge', id, target.name_en, {}, target.hall_id);
  };

  const saveEventType: AppContextValue['saveEventType'] = async (et) => {
    if (!can('settings', 'edit')) return;
    const isUpdate = Boolean(et.id);
    const id = et.id || makeUUID();
    const record: EventTypeItem = {
      ...et,
      id,
      hall_id: activeHallId,
      is_default: false,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('event_types').upsert(record);
    }
    setRawDb((prev) => ({
      ...prev,
      eventTypes: isUpdate
        ? prev.eventTypes.map((e) => (e.id === id ? record : e))
        : [...prev.eventTypes, record],
    }));
  };

  const validateAdminDelegation = (entries: ScreenPermissionEntry[]): string | null => {
    if (currentUser?.role !== 'admin') return null;
    for (const entry of entries) {
      const mine = currentUserPermissions[entry.screen_key];
      if (entry.can_view && !mine?.can_view) {
        return `Admin cannot grant View on "${entry.screen_key}" without holding it.`;
      }
      if (entry.can_edit && !mine?.can_edit) {
        return `Admin cannot grant Edit on "${entry.screen_key}" without holding it.`;
      }
      if (entry.can_delete && !mine?.can_delete) {
        return `Admin cannot grant Delete on "${entry.screen_key}" without holding it.`;
      }
    }
    return null;
  };

  const manageUserWithEdgeFunction: AppContextValue['manageUserWithEdgeFunction'] = async (payload) => {
    const callerRole = currentUser?.role;
    if ((callerRole !== 'super_admin' && callerRole !== 'admin') || !can('users', 'edit')) {
      return { ok: false, error: 'You do not have permission to create or edit staff accounts.' };
    }
    if (!isSupabaseConfigured || !supabase || !supabaseUrl || !supabaseAnonKey) {
      return { ok: false, error: 'App is not configured. Please contact the administrator.' };
    }
    if (callerRole === 'admin') {
      if (payload.action === 'create_user' && payload.role && payload.role !== 'manager') {
        return { ok: false, error: 'Hall Admin can only create Manager accounts.' };
      }
      if (payload.hall_id && payload.hall_id !== currentUser?.hall_id) {
        return { ok: false, error: 'Hall Admin can only manage users in their own hall.' };
      }
      if (payload.permissions && payload.permissions.length > 0) {
        const delegationErr = validateAdminDelegation(payload.permissions);
        if (delegationErr) {
          return { ok: false, error: delegationErr };
        }
      }
    }

    try {
      const { data: sessData } = await supabase.auth.getSession();
      const accessToken = sessData.session?.access_token;
      if (!accessToken) {
        return { ok: false, error: 'Your login session has expired. Please sign in again.' };
      }

      const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(payload),
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body?.ok) {
        return {
          ok: false,
          error:
            body?.error ||
            `User service returned HTTP ${resp.status}. Make sure the "manage-users" Supabase Edge Function is deployed.`,
        };
      }

      const savedProfile = body.profile ? hydrateProfile(body.profile as UserProfile) : undefined;
      const returnedPerms = Array.isArray(body.permissions) ? (body.permissions as UserPermission[]) : null;
      const targetId = savedProfile?.id || payload.userId;

      setRawDb((prev) => {
        let nextProfiles = prev.profiles;
        if (savedProfile) {
          const exists = prev.profiles.some((p) => p.id === savedProfile.id);
          nextProfiles = exists
            ? prev.profiles.map((p) => (p.id === savedProfile.id ? savedProfile : p))
            : [savedProfile, ...prev.profiles];
        }
        let nextPerms = prev.userPermissions;
        if (returnedPerms && targetId) {
          nextPerms = [
            ...prev.userPermissions.filter((up) => up.user_id !== targetId),
            ...returnedPerms,
          ];
        }
        return {
          ...prev,
          profiles: nextProfiles,
          userPermissions: nextPerms,
        };
      });

      appendAudit(
        'USER',
        'profile',
        savedProfile?.id || payload.userId || 'user',
        savedProfile?.email || payload.email || payload.userId || 'User',
        { action: payload.action, role: payload.role, hall_id: payload.hall_id },
        savedProfile?.hall_id || activeHallId
      );

      return { ok: true, profile: savedProfile };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error calling manage-users Edge Function.';
      return {
        ok: false,
        error: `${msg} (Ensure the "manage-users" Supabase Edge Function is deployed.)`,
      };
    }
  };

  const updateSettings = async (next: HallSettings) => {
    if (!can('settings', 'edit')) return;
    const targetHallId = next.hall_id || activeHallId;
    const normalized: HallSettings = {
      ...next,
      hall_id: targetHallId,
      id: isUuid(next.id) ? next.id : makeUUID(),
    };
    if (isSupabaseConfigured && supabase) {
      await supabase.from('hall_settings').upsert(normalized, { onConflict: 'hall_id' });
    }
    setRawDb((prev) => {
      const exists = prev.hallSettings.some((s) => s.hall_id === targetHallId);
      return {
        ...prev,
        hallSettings: exists
          ? prev.hallSettings.map((s) => (s.hall_id === targetHallId ? normalized : s))
          : [...prev.hallSettings, normalized],
        settings: targetHallId === activeHallId ? normalized : prev.settings,
      };
    });
    appendAudit('SETTINGS', 'hall_settings', String(normalized.id), normalized.hall_name, {
      cleaning_buffer_minutes: normalized.cleaning_buffer_minutes,
      late_grace_minutes: normalized.late_grace_minutes,
      hide_discount_reason_on_invoice: normalized.hide_discount_reason_on_invoice,
    }, targetHallId);
  };

  const importBookingsBatch: AppContextValue['importBookingsBatch'] = async (rows) => {
    if (!can('backup_import', 'edit')) {
      return { imported: 0, skipped: rows.length, errors: ['You do not have Edit permission for Backup & Import.'] };
    }
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    const hallBookings = rawDb.bookings.filter((b) => b.hall_id === activeHallId);
    const currentBookings = [...hallBookings];
    const currentSeq = rawDb.perHallSequences[activeHallId] || { booking: 0, invoice: 0, receipt: 0 };
    let seqB = currentSeq.booking;
    let seqI = currentSeq.invoice;
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
          hall_id: activeHallId,
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
      const id = makeUUID();
      const bk: Booking = {
        id,
        hall_id: activeHallId,
        booking_code: formatCode(activeHall.booking_code_prefix || 'MQ1', seqB),
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
        inspection_notes: '',
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
        invoice_number: formatInvoiceCode(activeHall.invoice_prefix || 'INV', seqI, db.settings.invoice_format),
        tax_percent: db.settings.tax_percent,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };
      createdBookings.push(bk);
      currentBookings.push(bk);
      for (const pkg of defaultPkg) {
        createdItems.push({
          id: makeUUID(),
          hall_id: activeHallId,
          booking_id: id,
          charge_id: isUuid(pkg.id) ? pkg.id : null,
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
        const dbBookings = createdBookings.map(({ booking_code: _bc, invoice_number: _in, ...rest }) => rest);
        const { data: inserted } = await supabase.from('bookings').insert(dbBookings).select('*');
        if (inserted) {
          createdBookings.splice(0, createdBookings.length, ...(inserted as Booking[]).map(hydrateBooking));
        }
        if (createdItems.length > 0) await supabase.from('booking_items').insert(createdItems);
      }
      setRawDb((prev) => ({
        ...prev,
        perHallSequences: {
          ...prev.perHallSequences,
          [activeHallId]: { ...currentSeq, booking: seqB, invoice: seqI },
        },
        bookings: [...createdBookings, ...prev.bookings],
        bookingItems: [...prev.bookingItems, ...createdItems],
      }));
      appendAudit('IMPORT', 'booking', 'batch', `${imported} Bookings Imported`, { imported, skipped });
    }
    return { imported, skipped, errors };
  };

  return (
    <AppContext.Provider
      value={{
        db,
        rawDb,
        activeHallId,
        activeHall,
        setActiveHallId,
        currentUser,
        currentUserPermissions,
        can,
        getPermissionsForUser,
        lang,
        theme,
        themePreferenceSource,
        loading,
        authInitializing,
        errorMsg,
        authError,
        missingProfileInfo,
        setLang,
        toggleLang,
        setTheme,
        toggleTheme,
        resetThemeToSystem,
        clearError,
        clearAuthError,
        retryProfileCheck,
        signInWithEmail,
        signOut,
        saveHall,
        saveCustomer,
        softDeleteCustomer,
        saveBooking,
        cancelBooking,
        softDeleteBooking,
        restoreRecord,
        addPayment,
        softDeletePayment,
        toggleInstallmentPaid,
        saveDailyClosing,
        reviewDailyClosing,
        submitApprovalRequest,
        reviewApprovalRequest,
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
        manageUserWithEdgeFunction,
        updateSettings,
        importBookingsBatch,
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
