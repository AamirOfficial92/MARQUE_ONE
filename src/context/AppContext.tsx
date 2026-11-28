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
  EventCategory,
  EventTypeItem,
  Expense,
  ExpenseCategory,
  ExpenseSubcategory,
  FloorConfig,
  FloorName,
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
  createDefaultFloorsForHall,
  createDefaultHallRecord,
  createDefaultHallSettings,
  createEmptyDatabase,
  createNewHallCatalogTemplates,
  DEFAULT_HALL_ID,
} from '../data/seedData';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  calculateBookingFinancials,
  calculateCrateBill,
  calculateDiscountAmount,
  findBookingConflict,
  formatDateDisplay,
  formatPKR,
  formatTime12h,
  todayISO,
} from '../utils/formatters';
import { pickLocalized, tr, translateFloor } from '../i18n/translations';
import {
  SaveFeedbackViewTarget,
  SaveToastItem,
  formatBilingualEntitySaveDetail,
  formatBookingSaveDetail,
  formatEntitySaveDetail,
  formatPaymentSaveDetail,
  mapSupabaseWriteError,
} from '../utils/supabaseErrors';
import {
  PERMISSION_SCREEN_KEYS,
  PermissionMatrixMap,
  getDefaultPermissionsForRole,
  hasMatrixPermission,
  toPermissionMatrix,
} from '../utils/permissions';

const THEME_STORAGE_KEY = 'marquee1_hms_theme_v1';
const LANG_STORAGE_KEY = 'marquee1_hms_lang_v1';
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

function getSavedBrowserLang(): Language | null {
  try {
    const val = localStorage.getItem(LANG_STORAGE_KEY);
    return val === 'en' || val === 'ur' ? val : null;
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

function hydrateHall(h: Partial<Hall>): Hall {
  const base = createDefaultHallRecord(h.id || DEFAULT_HALL_ID);
  return {
    ...base,
    ...h,
    id: h.id || base.id,
    name: h.name || base.name,
    name_ur: h.name_ur ?? '',
    tagline_en: h.tagline_en ?? '',
    tagline_ur: h.tagline_ur ?? '',
    address: h.address ?? '',
    address_ur: h.address_ur ?? '',
    city: h.city ?? '',
    phone: h.phone ?? '',
    phone_secondary: h.phone_secondary ?? '',
    whatsapp: h.whatsapp ?? '',
    email: h.email ?? '',
    website: h.website ?? '',
    facebook_url: h.facebook_url ?? '',
    instagram_url: h.instagram_url ?? '',
    tiktok_url: h.tiktok_url ?? '',
    youtube_url: h.youtube_url ?? '',
    x_url: h.x_url ?? '',
    google_maps_url: h.google_maps_url ?? '',
    logo_url: h.logo_url ?? '',
    signature_url: h.signature_url ?? '',
    ntn: h.ntn ?? '',
    strn: h.strn ?? '',
    bank_account_title: h.bank_account_title ?? '',
    bank_name: h.bank_name ?? '',
    bank_iban: h.bank_iban ?? '',
    show_bank_details: Boolean(h.show_bank_details),
    invoice_footer_en: h.invoice_footer_en ?? '',
    invoice_footer_ur: h.invoice_footer_ur ?? '',
    terms_en: h.terms_en ?? '',
    terms_ur: h.terms_ur ?? '',
    booking_code_prefix: h.booking_code_prefix || 'MQ1',
    invoice_prefix: h.invoice_prefix || 'INV',
    currency: h.currency || 'PKR',
    is_active: h.is_active !== false,
    created_at: h.created_at || base.created_at,
    updated_at: h.updated_at || base.updated_at,
  };
}

export interface ManageUserActionPayload {
  action:
    | 'create_user'
    | 'update_user'
    | 'reset_password'
    | 'set_permissions'
    | 'deactivate_user'
    | 'list_users';
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
  // Halls & Hall Profile
  saveHall: (
    hall: Omit<Hall, 'id' | 'created_at' | 'updated_at'> & { id?: string },
    options?: { cloneFromHallId?: string; initialSettingsOverrides?: Partial<HallSettings> }
  ) => Promise<{ ok: boolean; error?: string; hall?: Hall }>;
  uploadHallAsset: (
    hallId: string,
    kind: 'logo' | 'signature',
    file: File
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  // Customers
  saveCustomer: (cust: Omit<Customer, 'id' | 'hall_id' | 'deleted_at' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<{ ok: boolean; error?: string; customer?: Customer }>;
  softDeleteCustomer: (id: string) => Promise<{ ok: boolean; error?: string }>;
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
  cancelBooking: (bookingId: string, details: CancellationDetails, options?: { silentToast?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  softDeleteBooking: (id: string) => Promise<{ ok: boolean; error?: string }>;
  restoreRecord: (
    entityType:
      | 'booking'
      | 'payment'
      | 'expense'
      | 'charge'
      | 'employee'
      | 'customer'
      | 'event_category'
      | 'event_type'
      | 'expense_category'
      | 'expense_subcategory',
    id: string
  ) => Promise<{ ok: boolean; error?: string }>;
  // Payments
  addPayment: (payment: Omit<Payment, 'id' | 'hall_id' | 'receipt_number' | 'deleted_at' | 'created_at'>) => Promise<{ ok: boolean; payment?: Payment; error?: string }>;
  softDeletePayment: (id: string) => Promise<{ ok: boolean; error?: string }>;
  toggleInstallmentPaid: (id: string, paid: boolean) => Promise<{ ok: boolean; error?: string }>;
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
  addExpense: (expense: Omit<Expense, 'id' | 'hall_id' | 'deleted_at' | 'created_at'>, options?: { silentToast?: boolean }) => Promise<{ ok: boolean; error?: string; expense?: Expense }>;
  softDeleteExpense: (id: string) => Promise<{ ok: boolean; error?: string }>;
  saveEmployee: (emp: Omit<Employee, 'id' | 'hall_id' | 'deleted_at' | 'created_at'> & { id?: string }) => Promise<{ ok: boolean; error?: string; employee?: Employee }>;
  toggleEmployeeActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string }>;
  softDeleteEmployee: (id: string) => Promise<{ ok: boolean; error?: string }>;
  saveAttendance: (employeeId: string, dateISO: string, status: AttendanceStatus, notes?: string) => Promise<{ ok: boolean; error?: string }>;
  addEmployeeAdvance: (advance: Omit<EmployeeAdvance, 'id' | 'hall_id' | 'is_settled' | 'settled_month' | 'deleted_at' | 'created_at'>) => Promise<{ ok: boolean; error?: string }>;
  payEmployeeSalary: (params: {
    employeeId: string;
    month: string;
    netPayable: number;
    totalAdvancesDeducted: number;
    mode: Payment['mode'];
    notes: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  saveExpenseCategory: (cat: { id?: string; name_en: string; name_ur: string; sort_order?: number; is_active?: boolean }) => Promise<{ ok: boolean; error?: string; category?: ExpenseCategory }>;
  toggleExpenseCategoryActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string }>;
  reorderExpenseCategories: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  softDeleteExpenseCategory: (id: string) => Promise<{ ok: boolean; inUse?: boolean; error?: string }>;
  saveExpenseSubcategory: (sub: { id?: string; category_id: string; name_en: string; name_ur: string; sort_order?: number; is_active?: boolean }) => Promise<{ ok: boolean; error?: string; subcategory?: ExpenseSubcategory }>;
  toggleExpenseSubcategoryActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string }>;
  reorderExpenseSubcategories: (categoryId: string, orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  softDeleteExpenseSubcategory: (id: string) => Promise<{ ok: boolean; inUse?: boolean; error?: string }>;
  copyExpenseTaxonomyFromHall: (sourceHallId: string) => Promise<{ ok: boolean; error?: string; copiedCount?: number }>;
  // Catalog, Event Categories & Event Types & Users
  saveChargeCategory: (cat: { id?: string; name_en: string; name_ur: string; sort_order?: number }) => Promise<{ ok: boolean; error?: string }>;
  saveChargeItem: (item: Omit<ChargeCatalogItem, 'id' | 'hall_id' | 'deleted_at'> & { id?: string }) => Promise<{ ok: boolean; error?: string }>;
  softDeleteChargeItem: (id: string) => Promise<{ ok: boolean; error?: string }>;
  saveEventCategory: (cat: { id?: string; name_en: string; name_ur: string; sort_order?: number; is_active?: boolean }) => Promise<{ ok: boolean; error?: string; category?: EventCategory }>;
  toggleEventCategoryActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string }>;
  reorderEventCategories: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  softDeleteEventCategory: (id: string) => Promise<{ ok: boolean; inUse?: boolean; error?: string }>;
  saveEventType: (et: { id?: string; category_id?: string | null; name_en: string; name_ur: string; color_hex: string; sort_order?: number; is_active?: boolean }) => Promise<{ ok: boolean; error?: string; eventType?: EventTypeItem }>;
  toggleEventTypeActive: (id: string, isActive: boolean) => Promise<{ ok: boolean; error?: string }>;
  reorderEventTypes: (categoryId: string, orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  softDeleteEventType: (id: string) => Promise<{ ok: boolean; inUse?: boolean; error?: string }>;
  copyEventTaxonomyFromHall: (sourceHallId: string) => Promise<{ ok: boolean; error?: string; copiedCount?: number }>;
  saveFloorLabel: (floor: { id?: string; floor_key: FloorName; name_en: string; name_ur: string; sort_order?: number }, options?: { silentToast?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  saveFloorLabelsBatch: (floors: Array<{ id?: string; floor_key: FloorName; name_en: string; name_ur: string; sort_order?: number }>) => Promise<{ ok: boolean; error?: string }>;
  manageUserWithEdgeFunction: (payload: ManageUserActionPayload) => Promise<{ ok: boolean; error?: string; profile?: UserProfile; users?: UserProfile[] }>;
  updateSettings: (next: HallSettings) => Promise<{ ok: boolean; error?: string }>;
  importBookingsBatch: (rows: Array<Partial<Booking>>) => Promise<{ imported: number; skipped: number; errors: string[] }>;
  // Global Save Feedback Toasts
  toasts: SaveToastItem[];
  dismissToast: (id: string) => void;
  pendingViewTarget: SaveFeedbackViewTarget | null;
  requestViewTarget: (target: SaveFeedbackViewTarget) => void;
  clearPendingViewTarget: () => void;
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
      rawDb.halls[0] ||
      createDefaultHallRecord(activeHallId)
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

  // Hall-scoped view of the database consumed by views (Halls table is single source of truth for Hall Profile)
  const db: AppDatabase = useMemo(() => {
    const baseSettings =
      rawDb.hallSettings.find((s) => s.hall_id === activeHallId) ||
      createDefaultHallSettings(activeHallId);

    const hallSettingsObj: HallSettings = {
      ...baseSettings,
      hall_id: activeHallId,
      hall_name: activeHall.name || baseSettings.hall_name,
      hall_name_ur: activeHall.name_ur || baseSettings.hall_name_ur,
      address: activeHall.address || baseSettings.address,
      address_ur: activeHall.address_ur || baseSettings.address_ur,
      phone: activeHall.phone || baseSettings.phone,
      email: activeHall.email || baseSettings.email,
      logo_url: activeHall.logo_url ?? baseSettings.logo_url,
      terms_en: activeHall.terms_en ?? baseSettings.terms_en,
      terms_ur: activeHall.terms_ur ?? baseSettings.terms_ur,
    };

    const scopedProfiles =
      currentUser?.role === 'super_admin'
        ? rawDb.profiles
        : rawDb.profiles.filter((p) => p.hall_id === activeHallId);

    const byHall = <T extends { hall_id: string }>(arr: T[]) =>
      arr.filter((item) => item.hall_id === activeHallId);

    const hallSeq = rawDb.perHallSequences[activeHallId] || { booking: 0, invoice: 0, receipt: 0 };

    const hallFloors = byHall(rawDb.floors);
    const resolvedFloors =
      hallFloors.length > 0 ? hallFloors : createDefaultFloorsForHall(activeHallId);

    return {
      halls:
        currentUser?.role === 'super_admin'
          ? rawDb.halls
          : rawDb.halls.filter((h) => h.id === activeHallId),
      floors: resolvedFloors,
      hallSettings: rawDb.hallSettings,
      settings: hallSettingsObj,
      profiles: scopedProfiles,
      userPermissions:
        currentUser?.role === 'super_admin'
          ? rawDb.userPermissions
          : rawDb.userPermissions.filter((up) => up.hall_id === activeHallId),
      customers: byHall(rawDb.customers),
      eventCategories: byHall(rawDb.eventCategories),
      eventTypes: byHall(rawDb.eventTypes),
      chargeCategories: byHall(rawDb.chargeCategories),
      chargesCatalog: byHall(rawDb.chargesCatalog),
      bookings: byHall(rawDb.bookings),
      invoices: byHall(rawDb.invoices),
      bookingItems: byHall(rawDb.bookingItems),
      installments: byHall(rawDb.installments),
      payments: byHall(rawDb.payments),
      expenseCategories: byHall(rawDb.expenseCategories),
      expenseSubcategories: byHall(rawDb.expenseSubcategories),
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

  const [lang, setLangState] = useState<Language>(() => getSavedBrowserLang() || 'en');
  const langRef = React.useRef<Language>(lang);
  langRef.current = lang;
  const ctxText = (en: string, ur: string) => (langRef.current === 'ur' ? ur : en);
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

  const [toasts, setToasts] = useState<SaveToastItem[]>([]);
  const [pendingViewTarget, setPendingViewTarget] = useState<SaveFeedbackViewTarget | null>(null);
  const toastTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissToast = (id: string) => {
    const timer = toastTimersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const pushSuccessToast = (details: string, viewTarget?: SaveFeedbackViewTarget) => {
    const id = makeUUID();
    const activeLang = langRef.current;
    const item: SaveToastItem = {
      id,
      kind: 'success',
      title: tr('saveSuccessTitle', activeLang),
      details,
      viewTarget,
      createdAt: Date.now(),
    };
    setToasts((prev) => [item, ...prev].slice(0, 4));
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete toastTimersRef.current[id];
    }, 5000);
  };

  const pushErrorToast = (err: unknown, contextHint?: string): string => {
    console.error(`[SaveError] ${contextHint || 'Supabase write failed'}:`, err);
    const activeLang = langRef.current;
    const mapped = mapSupabaseWriteError(err, contextHint);
    const details = activeLang === 'ur' ? mapped.messageUr : mapped.messageEn;
    const id = makeUUID();
    const item: SaveToastItem = {
      id,
      kind: 'error',
      title: tr('saveErrorTitle', activeLang),
      details,
      technicalCode: mapped.technicalCode,
      createdAt: Date.now(),
    };
    setToasts((prev) => [item, ...prev].slice(0, 4));
    return details;
  };

  const requestViewTarget = (target: SaveFeedbackViewTarget) => {
    setPendingViewTarget(target);
  };

  const clearPendingViewTarget = () => {
    setPendingViewTarget(null);
  };

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
    if (!supabase) return { ok: false, error: ctxText('Supabase client is not initialized.', 'سوپابیس کلائنٹ فعال نہیں ہے۔') };
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
          const msg = ctxText(
            `Unable to load your staff profile (${profileRes.error.message}).`,
            `آپ کا عملہ پروفائل لوڈ نہیں ہو سکا (${profileRes.error.message})۔`
          );
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
          const msg = ctxText(
            `Signed in (${authEmail || uid}), but no profile/role row was found in public.profiles. Run the SQL snippet below in Supabase SQL Editor or ask your Super Admin to add your profile and role.`,
            `سائن ان (${authEmail || uid}) ہو گیا، لیکن پروفائل ریکارڈ موجود نہیں ہے۔ سپر ایڈمن سے رابطہ کریں یا ذیل کا ایس کیو ایل چلائیں۔`
          );
          console.warn('[Auth] Missing profile/role row in public.profiles for authenticated user:', { uid });
          setMissingProfileInfo({ uid, email: authEmail || '' });
          setCurrentUser(null);
          setAuthError(msg);
          return { ok: false, error: msg };
        }

        if (!profileRow.is_active) {
          const msg = ctxText(
            'Your staff profile is deactivated (is_active = false). Please contact Super Admin or your Hall Admin.',
            'آپ کا عملہ اکاؤنٹ غیر فعال ہے۔ براہِ کرم سپر ایڈمن یا ہال ایڈمن سے رابطہ کریں۔'
          );
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

        if (profileRow.preferred_language === 'en' || profileRow.preferred_language === 'ur') {
          setLangState(profileRow.preferred_language);
          try {
            localStorage.setItem(LANG_STORAGE_KEY, profileRow.preferred_language);
          } catch {
            // ignore
          }
        }

        const [
          hallsRes,
          floorsRes,
          profilesAllRes,
          userPermsRes,
          settingsRes,
          customersRes,
          eventCatsRes,
          eventTypesRes,
          chargeCatsRes,
          chargesRes,
          bookingsRes,
          invoicesRes,
          itemsRes,
          installmentsRes,
          paymentsRes,
          expCatsRes,
          expSubcatsRes,
          employeesRes,
          attendanceRes,
          advancesRes,
          expensesRes,
          closingsRes,
          approvalsRes,
          auditRes,
        ] = await Promise.all([
          supabase.from('halls').select('*').order('created_at', { ascending: true }),
          supabase.from('floors').select('*').order('sort_order', { ascending: true }),
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('user_permissions').select('*'),
          supabase.from('hall_settings').select('*'),
          supabase.from('customers').select('*').order('full_name'),
          supabase.from('event_categories').select('*').order('sort_order'),
          supabase.from('event_types').select('*').order('sort_order'),
          supabase.from('charge_categories').select('*').order('sort_order'),
          supabase.from('charges_catalog').select('*').order('name_en'),
          supabase.from('bookings').select('*').order('event_date', { ascending: true }),
          supabase.from('invoices').select('*').order('issued_at', { ascending: false }),
          supabase.from('booking_items').select('*'),
          supabase.from('installment_schedules').select('*').order('due_date'),
          supabase.from('payments').select('*').order('payment_date', { ascending: false }),
          supabase.from('expense_categories').select('*').order('sort_order'),
          supabase.from('expense_subcategories').select('*').order('sort_order'),
          supabase.from('employees').select('*').order('full_name'),
          supabase.from('employee_attendance').select('*').order('attendance_date', { ascending: false }),
          supabase.from('employee_advances').select('*').order('advance_date', { ascending: false }),
          supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
          supabase.from('daily_closings').select('*').order('closing_date', { ascending: false }),
          supabase.from('approval_requests').select('*').order('requested_at', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(250),
        ]);

        const nextHallSettings = settingsRes.data ? (settingsRes.data as HallSettings[]) : [];
        if (
          profileRow.preferred_language !== 'en' &&
          profileRow.preferred_language !== 'ur' &&
          !getSavedBrowserLang()
        ) {
          const fallbackDefaultLang = nextHallSettings[0]?.default_language;
          if (fallbackDefaultLang === 'en' || fallbackDefaultLang === 'ur') {
            setLangState(fallbackDefaultLang);
          }
        }

        setRawDb((prev) => {
          const nextHalls = hallsRes.data ? (hallsRes.data as Hall[]).map(hydrateHall) : [];
          const nextFloors = !floorsRes.error && Array.isArray(floorsRes.data) ? (floorsRes.data as FloorConfig[]) : [];
          const nextEventCats = !eventCatsRes.error && Array.isArray(eventCatsRes.data)
            ? (eventCatsRes.data as EventCategory[]).map((c) => ({
                ...c,
                sort_order: Number(c.sort_order) || 0,
                is_active: c.is_active !== false,
              }))
            : [];
          const nextEventTypes = ((eventTypesRes.data as EventTypeItem[]) || []).map((e) => ({
            ...e,
            sort_order: Number(e.sort_order) || 0,
            is_active: e.is_active !== false,
          }));
          const nextExpCats = ((expCatsRes.data as ExpenseCategory[]) || []).map((c) => ({
            ...c,
            sort_order: Number(c.sort_order) || 0,
            is_active: c.is_active !== false,
          }));
          const nextExpSubcats = !expSubcatsRes.error && Array.isArray(expSubcatsRes.data)
            ? (expSubcatsRes.data as ExpenseSubcategory[]).map((s) => ({
                ...s,
                sort_order: Number(s.sort_order) || 0,
                is_active: s.is_active !== false,
              }))
            : [];
          return {
            ...prev,
            halls: nextHalls,
            floors: nextFloors,
            hallSettings: nextHallSettings,
            settings: nextHallSettings[0] || createDefaultHallSettings(profileRow.hall_id || DEFAULT_HALL_ID),
            profiles: profilesAllRes.data
              ? (profilesAllRes.data as UserProfile[]).map(hydrateProfile)
              : [profileRow],
            userPermissions: userPermsRes.data ? (userPermsRes.data as UserPermission[]) : [],
            customers: (customersRes.data as Customer[]) || [],
            eventCategories: nextEventCats,
            eventTypes: nextEventTypes,
            chargeCategories: (chargeCatsRes.data as ChargeCategory[]) || [],
            chargesCatalog: (chargesRes.data as ChargeCatalogItem[]) || [],
            bookings: bookingsRes.data ? (bookingsRes.data as Booking[]).map(hydrateBooking) : [],
            invoices: (invoicesRes.data as InvoiceRecord[]) || [],
            bookingItems: (itemsRes.data as BookingItem[]) || [],
            installments: (installmentsRes.data as InstallmentSchedule[]) || [],
            payments: (paymentsRes.data as Payment[]) || [],
            expenseCategories: nextExpCats,
            expenseSubcategories: nextExpSubcats,
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

  const persistUserLanguage = (nextLang: Language) => {
    if (!currentUser) return;
    const updatedUser: UserProfile = { ...currentUser, preferred_language: nextLang };
    setCurrentUser(updatedUser);
    setRawDb((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === updatedUser.id ? { ...p, preferred_language: nextLang } : p)),
    }));
    if (isSupabaseConfigured && supabase) {
      supabase.from('profiles').update({ preferred_language: nextLang }).eq('id', updatedUser.id).then(() => {});
    }
  };

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    persistUserLanguage(next);
  };
  const toggleLang = () => setLang(lang === 'en' ? 'ur' : 'en');
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
      const msg = ctxText(
        'App is not configured. Please contact the administrator.',
        'ایپ سیٹ اپ مکمل نہیں ہے۔ براہِ کرم منتظم سے رابطہ کریں۔'
      );
      setAuthError(msg);
      return { ok: false, error: msg };
    }
    if (!email.trim() || !password) {
      const msg = ctxText('Email and password are required.', 'ای میل اور پاس ورڈ لازمی ہیں۔');
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
        const msg = ctxText(
          'Sign-in did not return an authenticated user session.',
          'سائن ان سیشن موصول نہیں ہوا۔'
        );
        console.warn('[Auth] Missing user object after signInWithPassword');
        setAuthError(msg);
        return { ok: false, error: msg };
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ctxText('Unexpected sign-in error.', 'لاگ ان میں غیر متوقع خرابی پیش آئی۔');
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
    Object.values(toastTimersRef.current).forEach((t) => clearTimeout(t));
    toastTimersRef.current = {};
    setToasts([]);
    setPendingViewTarget(null);
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setRawDb(createEmptyDatabase());
  };

  // =========================================================================
  // HALLS & HALL PROFILE MANAGEMENT
  // =========================================================================
  const uploadHallAsset: AppContextValue['uploadHallAsset'] = async (hallId, kind, file) => {
    const isSuper = currentUser?.role === 'super_admin';
    const isOwnAdmin =
      currentUser?.role === 'admin' &&
      can('halls', 'edit') &&
      currentUser.hall_id === hallId;

    if (!isSuper && !isOwnAdmin) {
      return {
        ok: false,
        error: ctxText(
          'You do not have permission to upload assets for this hall.',
          'آپ کو اس ہال کی تصاویر اپلوڈ کرنے کی اجازت نہیں ہے۔'
        ),
      };
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        ok: false,
        error: ctxText(
          'Only PNG, JPG, and WebP images are supported.',
          'صرف PNG، JPG اور WebP تصاویر کی اجازت ہے۔'
        ),
      };
    }
    if (file.size > 2 * 1024 * 1024) {
      return {
        ok: false,
        error: ctxText(
          'File size must be 2 MB or less.',
          'فائل کا سائز زیادہ سے زیادہ 2 ایم بی ہونا چاہیے۔'
        ),
      };
    }

    if (!isSupabaseConfigured || !supabase) {
      return {
        ok: false,
        error: ctxText(
          'App is not configured. Please contact the administrator.',
          'ایپ سیٹ اپ مکمل نہیں ہے۔ براہِ کرم منتظم سے رابطہ کریں۔'
        ),
      };
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `${hallId}/${kind}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('hall-assets')
      .upload(objectPath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadErr) {
      return { ok: false, error: uploadErr.message };
    }

    const { data: pub } = supabase.storage.from('hall-assets').getPublicUrl(objectPath);
    return { ok: true, url: pub.publicUrl };
  };

  const saveHall: AppContextValue['saveHall'] = async (hallData, options) => {
    const isSuper = currentUser?.role === 'super_admin';
    const isUpdate = Boolean(hallData.id);
    const hallId = hallData.id || makeUUID();
    const isOwnAdmin =
      currentUser?.role === 'admin' &&
      can('halls', 'edit') &&
      isUpdate &&
      currentUser.hall_id === hallId;

    if (!isSuper && !isOwnAdmin) {
      const msg = pushErrorToast(
        { code: '42501', message: 'Only Super Admin can create halls, and Hall Admin can only edit their own hall profile.' },
        'saveHall permission'
      );
      return { ok: false, error: msg };
    }

    const existing = rawDb.halls.find((h) => h.id === hallId);
    if (isOwnAdmin && !existing) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Target hall record was not found.' }, 'saveHall lookup');
      return { ok: false, error: msg };
    }

    const now = new Date().toISOString();

    const record: Hall = hydrateHall({
      id: hallId,
      name: hallData.name.trim(),
      name_ur: hallData.name_ur.trim(),
      tagline_en: (hallData.tagline_en || '').trim(),
      tagline_ur: (hallData.tagline_ur || '').trim(),
      address: hallData.address.trim(),
      address_ur: hallData.address_ur.trim(),
      city: (hallData.city || '').trim(),
      phone: hallData.phone.trim(),
      phone_secondary: (hallData.phone_secondary || '').trim(),
      whatsapp: (hallData.whatsapp || '').replace(/\D/g, ''),
      email: hallData.email.trim(),
      website: (hallData.website || '').trim(),
      facebook_url: (hallData.facebook_url || '').trim(),
      instagram_url: (hallData.instagram_url || '').trim(),
      tiktok_url: (hallData.tiktok_url || '').trim(),
      youtube_url: (hallData.youtube_url || '').trim(),
      x_url: (hallData.x_url || '').trim(),
      google_maps_url: (hallData.google_maps_url || '').trim(),
      logo_url: (hallData.logo_url || '').trim(),
      signature_url: (hallData.signature_url || '').trim(),
      ntn: (hallData.ntn || '').trim(),
      strn: (hallData.strn || '').trim(),
      bank_account_title: (hallData.bank_account_title || '').trim(),
      bank_name: (hallData.bank_name || '').trim(),
      bank_iban: (hallData.bank_iban || '').trim(),
      show_bank_details: Boolean(hallData.show_bank_details),
      invoice_footer_en: (hallData.invoice_footer_en || '').trim(),
      invoice_footer_ur: (hallData.invoice_footer_ur || '').trim(),
      terms_en: (hallData.terms_en || '').trim(),
      terms_ur: (hallData.terms_ur || '').trim(),
      booking_code_prefix: isSuper
        ? (hallData.booking_code_prefix || 'MQ').trim().toUpperCase()
        : existing?.booking_code_prefix || 'MQ1',
      invoice_prefix: isSuper
        ? (hallData.invoice_prefix || 'INV').trim().toUpperCase()
        : existing?.invoice_prefix || 'INV',
      currency: isSuper
        ? (hallData.currency || 'PKR').trim().toUpperCase()
        : existing?.currency || 'PKR',
      is_active: isSuper ? Boolean(hallData.is_active) : existing?.is_active ?? true,
      created_at: existing?.created_at || now,
      updated_at: now,
    });

    if (isSupabaseConfigured && supabase) {
      if (isUpdate) {
        const { id: _ignoreId, created_at: _ignoreCreated, ...updateFields } = record;
        const adminSafeFields = isSuper
          ? updateFields
          : (() => {
              const {
                booking_code_prefix: _bcp,
                invoice_prefix: _ip,
                currency: _cur,
                is_active: _act,
                ...profileOnly
              } = updateFields;
              return profileOnly;
            })();

        const { data, error } = await supabase
          .from('halls')
          .update(adminSafeFields)
          .eq('id', hallId)
          .select('*')
          .single();

        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Hall update returned no rows.' }, 'saveHall update');
          return { ok: false, error: msg };
        }
        Object.assign(record, hydrateHall(data as Hall));
      } else {
        const { data, error } = await supabase.from('halls').insert(record).select('*').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Hall insert returned no rows.' }, 'saveHall insert');
          return { ok: false, error: msg };
        }
        Object.assign(record, hydrateHall(data as Hall));
      }
    }

    if (!isUpdate) {
      const sourceHallId = options?.cloneFromHallId;
      const sourceSettings = sourceHallId
        ? rawDb.hallSettings.find((s) => s.hall_id === sourceHallId)
        : undefined;

      const newSettings = createDefaultHallSettings(hallId, {
        ...(sourceSettings
          ? {
              tax_percent: sourceSettings.tax_percent,
              default_rent_first: sourceSettings.default_rent_first,
              default_rent_second: sourceSettings.default_rent_second,
              default_rent_third: sourceSettings.default_rent_third,
              default_rent_full: sourceSettings.default_rent_full,
              weekday_weekend_rates: sourceSettings.weekday_weekend_rates,
              rent_seasons: sourceSettings.rent_seasons,
              crate_deduction_per_returned: sourceSettings.crate_deduction_per_returned,
              cleaning_buffer_minutes: sourceSettings.cleaning_buffer_minutes,
              late_grace_minutes: sourceSettings.late_grace_minutes,
              hide_discount_reason_on_invoice: sourceSettings.hide_discount_reason_on_invoice,
              default_language: sourceSettings.default_language,
            }
          : {}),
        ...(options?.initialSettingsOverrides || {}),
        id: makeUUID(),
        hall_id: hallId,
        hall_name: record.name,
        hall_name_ur: record.name_ur,
        address: record.address,
        address_ur: record.address_ur,
        phone: record.phone,
        email: record.email,
        logo_url: record.logo_url,
        terms_en: record.terms_en || '',
        terms_ur: record.terms_ur || '',
        invoice_format: `${record.invoice_prefix}-{YYYY}-{0000}`,
      });

      const templateBundle = createNewHallCatalogTemplates(hallId, makeUUID);
      let seededEventCats = templateBundle.eventCategories;
      let seededEventTypes = templateBundle.eventTypes;
      let seededChargeCats = templateBundle.chargeCategories;
      let seededCharges = templateBundle.chargesCatalog;
      let seededExpCats = templateBundle.expenseCategories;
      let seededExpSubcats = templateBundle.expenseSubcategories;
      let seededFloors = templateBundle.floors;

      if (sourceHallId) {
        const srcFloors = rawDb.floors.filter((f) => f.hall_id === sourceHallId);
        if (srcFloors.length > 0) {
          seededFloors = srcFloors.map((f) => ({
            ...f,
            id: makeUUID(),
            hall_id: hallId,
          }));
        }

        const srcEventCats = rawDb.eventCategories.filter((c) => c.hall_id === sourceHallId && !c.deleted_at);
        const evCatIdMap = new Map<string, string>();
        if (srcEventCats.length > 0) {
          seededEventCats = srcEventCats.map((c) => {
            const nextId = makeUUID();
            evCatIdMap.set(c.id, nextId);
            return { ...c, id: nextId, hall_id: hallId };
          });
        }

        const srcEvents = rawDb.eventTypes.filter((e) => e.hall_id === sourceHallId && !e.deleted_at);
        if (srcEvents.length > 0) {
          seededEventTypes = srcEvents.map((e) => ({
            ...e,
            id: makeUUID(),
            hall_id: hallId,
            category_id: (e.category_id && evCatIdMap.get(e.category_id)) || seededEventCats[0]?.id || null,
          }));
        }

        const srcChargeCats = rawDb.chargeCategories.filter((c) => c.hall_id === sourceHallId && !c.deleted_at);
        if (srcChargeCats.length > 0) {
          const catIdMap = new Map<string, string>();
          seededChargeCats = srcChargeCats.map((c) => {
            const nextId = makeUUID();
            catIdMap.set(c.id, nextId);
            return { ...c, id: nextId, hall_id: hallId };
          });

          const srcCharges = rawDb.chargesCatalog.filter((i) => i.hall_id === sourceHallId && !i.deleted_at);
          seededCharges = srcCharges.map((i) => ({
            ...i,
            id: makeUUID(),
            hall_id: hallId,
            category_id: catIdMap.get(i.category_id) || seededChargeCats[0]?.id || '',
          }));
        }

        const srcExpCats = rawDb.expenseCategories.filter((c) => c.hall_id === sourceHallId && !c.deleted_at);
        if (srcExpCats.length > 0) {
          const expCatIdMap = new Map<string, string>();
          seededExpCats = srcExpCats.map((c) => {
            const nextId = makeUUID();
            expCatIdMap.set(c.id, nextId);
            return { ...c, id: nextId, hall_id: hallId };
          });
          const srcExpSubs = rawDb.expenseSubcategories.filter((s) => s.hall_id === sourceHallId && !s.deleted_at);
          seededExpSubcats = srcExpSubs.map((s) => ({
            ...s,
            id: makeUUID(),
            hall_id: hallId,
            category_id: expCatIdMap.get(s.category_id) || seededExpCats[0]?.id || '',
          }));
        }
      }

      if (isSupabaseConfigured && supabase) {
        const seqRes = await supabase
          .from('hall_sequences')
          .upsert({ hall_id: hallId, booking_seq: 0, invoice_seq: 0, receipt_seq: 0 })
          .select('hall_id');
        if (seqRes.error) {
          const msg = pushErrorToast(seqRes.error, 'saveHall hall_sequences');
          return { ok: false, error: msg };
        }
        const setRes = await supabase
          .from('hall_settings')
          .upsert(newSettings, { onConflict: 'hall_id' })
          .select('id');
        if (setRes.error) {
          const msg = pushErrorToast(setRes.error, 'saveHall hall_settings');
          return { ok: false, error: msg };
        }
        const flRes = await supabase
          .from('floors')
          .upsert(seededFloors, { onConflict: 'hall_id,floor_key' })
          .select('id');
        if (flRes.error) {
          const msg = pushErrorToast(flRes.error, 'saveHall floors');
          return { ok: false, error: msg };
        }
        if (seededEventCats.length > 0) {
          const evCatRes = await supabase.from('event_categories').insert(seededEventCats).select('id');
          if (evCatRes.error) {
            const msg = pushErrorToast(evCatRes.error, 'saveHall event_categories');
            return { ok: false, error: msg };
          }
        }
        if (seededEventTypes.length > 0) {
          const etRes = await supabase.from('event_types').insert(seededEventTypes).select('id');
          if (etRes.error) {
            const msg = pushErrorToast(etRes.error, 'saveHall event_types');
            return { ok: false, error: msg };
          }
        }
        if (seededChargeCats.length > 0) {
          const ccRes = await supabase.from('charge_categories').insert(seededChargeCats).select('id');
          if (ccRes.error) {
            const msg = pushErrorToast(ccRes.error, 'saveHall charge_categories');
            return { ok: false, error: msg };
          }
        }
        if (seededCharges.length > 0) {
          const chRes = await supabase.from('charges_catalog').insert(seededCharges).select('id');
          if (chRes.error) {
            const msg = pushErrorToast(chRes.error, 'saveHall charges_catalog');
            return { ok: false, error: msg };
          }
        }
        if (seededExpCats.length > 0) {
          const ecRes = await supabase.from('expense_categories').insert(seededExpCats).select('id');
          if (ecRes.error) {
            const msg = pushErrorToast(ecRes.error, 'saveHall expense_categories');
            return { ok: false, error: msg };
          }
        }
        if (seededExpSubcats.length > 0) {
          const esRes = await supabase.from('expense_subcategories').insert(seededExpSubcats).select('id');
          if (esRes.error) {
            const msg = pushErrorToast(esRes.error, 'saveHall expense_subcategories');
            return { ok: false, error: msg };
          }
        }
      }

      setRawDb((prev) => ({
        ...prev,
        halls: [...prev.halls, record],
        floors: [...prev.floors, ...seededFloors],
        hallSettings: [...prev.hallSettings, newSettings],
        eventCategories: [...prev.eventCategories, ...seededEventCats],
        eventTypes: [...prev.eventTypes, ...seededEventTypes],
        chargeCategories: [...prev.chargeCategories, ...seededChargeCats],
        chargesCatalog: [...prev.chargesCatalog, ...seededCharges],
        expenseCategories: [...prev.expenseCategories, ...seededExpCats],
        expenseSubcategories: [...prev.expenseSubcategories, ...seededExpSubcats],
        perHallSequences: {
          ...prev.perHallSequences,
          [hallId]: { booking: 0, invoice: 0, receipt: 0 },
        },
      }));
    } else {
      // Keep hall_settings mirror aligned with Halls single source of truth
      const mirrorPatch = {
        hall_name: record.name,
        hall_name_ur: record.name_ur,
        address: record.address,
        address_ur: record.address_ur,
        phone: record.phone,
        email: record.email,
        logo_url: record.logo_url,
        terms_en: record.terms_en || '',
        terms_ur: record.terms_ur || '',
      };

      if (isSupabaseConfigured && supabase && can('settings', 'edit')) {
        const { error: mirrorErr } = await supabase
          .from('hall_settings')
          .update(mirrorPatch)
          .eq('hall_id', hallId)
          .select('id');
        if (mirrorErr) {
          const msg = pushErrorToast(mirrorErr, 'saveHall hall_settings mirror');
          return { ok: false, error: msg };
        }
      }

      setRawDb((prev) => ({
        ...prev,
        halls: prev.halls.map((h) => (h.id === hallId ? record : h)),
        hallSettings: prev.hallSettings.map((s) =>
          s.hall_id === hallId ? { ...s, ...mirrorPatch } : s
        ),
        settings: prev.settings.hall_id === hallId ? { ...prev.settings, ...mirrorPatch } : prev.settings,
      }));
    }

    appendAudit(
      'HALL',
      'hall',
      hallId,
      record.name,
      {
        event: isUpdate ? 'hall_profile_updated' : 'hall_created',
        city: record.city,
        booking_code_prefix: record.booking_code_prefix,
        invoice_prefix: record.invoice_prefix,
        is_active: record.is_active,
        show_bank_details: record.show_bank_details,
      },
      hallId
    );

    const hallAction = !isUpdate
      ? 'created'
      : existing && existing.is_active !== record.is_active
        ? record.is_active
          ? 'activated'
          : 'deactivated'
        : 'updated';

    pushSuccessToast(
      formatBilingualEntitySaveDetail(langRef.current, 'Hall', 'ہال', record.name, record.name_ur, hallAction),
      { tab: 'halls' }
    );

    return { ok: true, hall: record };
  };

  // =========================================================================
  // CUSTOMERS
  // =========================================================================
  const saveCustomer: AppContextValue['saveCustomer'] = async (cust) => {
    if (!can('customers', 'edit')) {
      const msg = pushErrorToast(
        { code: '42501', message: 'You do not have Edit permission for Customers.' },
        'saveCustomer permission'
      );
      return { ok: false, error: msg };
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
      const { data, error } = await supabase.from('customers').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Customer upsert returned no rows.' }, 'saveCustomer');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as Customer);
    }

    setRawDb((prev) => ({
      ...prev,
      customers: isUpdate
        ? prev.customers.map((c) => (c.id === id ? record : c))
        : [record, ...prev.customers],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'customer', id, record.full_name, { phone: record.phone });
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Customer', 'گاہک', record.full_name, isUpdate ? 'updated' : 'created'),
      { tab: 'customers' }
    );
    return { ok: true, customer: record };
  };

  const softDeleteCustomer: AppContextValue['softDeleteCustomer'] = async (id) => {
    if (!can('customers', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteCustomer permission');
      return { ok: false, error: msg };
    }
    const target = db.customers.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Customer not found' }, 'softDeleteCustomer lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('customers')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Customer delete returned no rows.' }, 'softDeleteCustomer');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'customer', id, target.full_name, { phone: target.phone });
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Customer', 'گاہک', target.full_name, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
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
  ): Promise<{ ok: true; customer: Customer } | { ok: false; error: unknown }> => {
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
      const { data, error } = await supabase.from('customers').upsert(record).select('*').single();
      if (error || !data) {
        return { ok: false, error: error || { code: 'RLS_0_ROWS', message: 'Customer sync failed' } };
      }
      Object.assign(record, data as Customer);
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

    return { ok: true, customer: record };
  };

  const syncInvoiceForBooking = async (
    booking: Booking,
    items: BookingItem[],
    payments: Payment[]
  ): Promise<{ ok: boolean; rawError?: unknown }> => {
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
      const { data, error } = await supabase.from('invoices').upsert(invRecord).select('*').single();
      if (error || !data) {
        return { ok: false, rawError: error || { code: 'RLS_0_ROWS', message: 'Invoice upsert failed' } };
      }
      Object.assign(invRecord, data as InvoiceRecord);
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
    return { ok: true };
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
      const floorText = conflict.floors
        .map((f) => translateFloor(f, langRef.current, db.floors))
        .join('، ');
      const dateStr = formatDateDisplay(conflict.event_date, langRef.current);
      const timeRange = `${formatTime12h(conflict.start_time, langRef.current)} – ${formatTime12h(conflict.end_time, langRef.current)}`;
      const conflictMsg =
        langRef.current === 'ur'
          ? `${conflict.booking_code} (${floorText} · ${dateStr} ${timeRange}، بشمول ${hallSettingsObj.cleaning_buffer_minutes} منٹ صفائی وقفہ)`
          : `${conflict.booking_code} (${floorText} · ${dateStr} ${timeRange}, incl. ${hallSettingsObj.cleaning_buffer_minutes}m cleaning buffer)`;
      pushErrorToast({ code: 'BOOKING_OVERLAP', message: conflictMsg }, 'saveBooking overlap');
      return { ok: false, error: conflictMsg };
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
      const msg = pushErrorToast(
        { code: '42501', message: 'You do not have Edit permission for Bookings.' },
        'saveBooking permission'
      );
      return { ok: false, error: msg };
    }
    let syncedCustomerId: string | null = bookingData.customer_id ?? existing?.customer_id ?? null;
    if (can('customers', 'edit')) {
      const custRes = await upsertCustomerForBooking(targetHallId, bookingData);
      if (!custRes.ok) {
        const msg = pushErrorToast(custRes.error, 'saveBooking customer sync');
        return { ok: false, error: msg };
      }
      syncedCustomerId = custRes.customer.id;
    }

    const record: Booking = {
      ...bookingData,
      id: bookingId,
      hall_id: targetHallId,
      customer_id: syncedCustomerId,
      event_category_id: isUuid(bookingData.event_category_id) ? bookingData.event_category_id : null,
      event_type_id: isUuid(bookingData.event_type_id) ? bookingData.event_type_id : null,
      event_other_name: (bookingData.event_other_name || '').trim(),
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
        event_category_id: isUuid(record.event_category_id) ? record.event_category_id : null,
        event_type_id: isUuid(record.event_type_id) ? record.event_type_id : null,
        event_other_name: record.event_other_name || '',
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

      if (error || !savedRow) {
        const msg = pushErrorToast(
          error || { code: 'RLS_0_ROWS', message: 'Booking save returned no rows.' },
          'saveBooking upsert'
        );
        return { ok: false, error: msg };
      }

      bookingCode = (savedRow as Booking).booking_code;
      invoiceNum = (savedRow as Booking).invoice_number;
      record.booking_code = bookingCode;
      record.invoice_number = invoiceNum;

      const prevItemIds = rawDb.bookingItems
        .filter((i) => i.booking_id === bookingId && !i.deleted_at)
        .map((i) => i.id);
      const nextItemIds = new Set(nextItems.map((i) => i.id));
      const removedItemIds = prevItemIds.filter((id) => !nextItemIds.has(id));

      if (removedItemIds.length > 0) {
        const { error: delItemErr } = await supabase.from('booking_items').delete().in('id', removedItemIds);
        if (delItemErr) {
          const msg = pushErrorToast(delItemErr, 'saveBooking delete booking_items');
          return { ok: false, error: msg };
        }
      }
      if (nextItems.length > 0) {
        const { data: savedItems, error: itemErr } = await supabase
          .from('booking_items')
          .upsert(nextItems)
          .select('id');
        if (itemErr || !savedItems || savedItems.length === 0) {
          const msg = pushErrorToast(
            itemErr || { code: 'RLS_0_ROWS', message: 'Booking items save returned no rows.' },
            'saveBooking upsert booking_items'
          );
          return { ok: false, error: msg };
        }
      }

      const prevInstIds = rawDb.installments
        .filter((i) => i.booking_id === bookingId && !i.deleted_at)
        .map((i) => i.id);
      const nextInstIds = new Set(nextInstallments.map((i) => i.id));
      const removedInstIds = prevInstIds.filter((id) => !nextInstIds.has(id));

      if (removedInstIds.length > 0) {
        const { error: delInstErr } = await supabase.from('installment_schedules').delete().in('id', removedInstIds);
        if (delInstErr) {
          const msg = pushErrorToast(delInstErr, 'saveBooking delete installments');
          return { ok: false, error: msg };
        }
      }
      if (nextInstallments.length > 0) {
        const { data: savedInst, error: instErr } = await supabase
          .from('installment_schedules')
          .upsert(nextInstallments)
          .select('id');
        if (instErr || !savedInst || savedInst.length === 0) {
          const msg = pushErrorToast(
            instErr || { code: 'RLS_0_ROWS', message: 'Installments save returned no rows.' },
            'saveBooking upsert installments'
          );
          return { ok: false, error: msg };
        }
      }
    }

    const invRes = await syncInvoiceForBooking(record, nextItems, rawDb.payments);
    if (!invRes.ok) {
      const msg = pushErrorToast(invRes.rawError, 'saveBooking invoice sync');
      return { ok: false, error: msg };
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

    pushSuccessToast(
      formatBookingSaveDetail(
        langRef.current,
        record.booking_code,
        record.customer_name,
        record.event_date,
        isUpdate ? 'updated' : 'created'
      ),
      { tab: 'bookings', bookingId: record.id }
    );

    return { ok: true, booking: record };
  };

  const cancelBooking: AppContextValue['cancelBooking'] = async (bookingId, details, options) => {
    if (!can('bookings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'cancelBooking permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.bookings.find((b) => b.id === bookingId);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Booking not found' }, 'cancelBooking lookup');
      return { ok: false, error: msg };
    }
    const updated: Booking = {
      ...target,
      status: 'Cancelled',
      cancellation_details: details,
      updated_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'Cancelled', cancellation_details: details, updated_at: updated.updated_at })
        .eq('id', bookingId)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Booking cancel returned no rows.' }, 'cancelBooking');
        return { ok: false, error: msg };
      }
      Object.assign(updated, hydrateBooking(data as Booking));
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
    if (!options?.silentToast) {
      pushSuccessToast(
        formatBookingSaveDetail(
          langRef.current,
          target.booking_code,
          target.customer_name,
          target.event_date,
          'cancelled'
        ),
        { tab: 'bookings', bookingId }
      );
    }
    return { ok: true };
  };

  const softDeleteBooking: AppContextValue['softDeleteBooking'] = async (id) => {
    if (!can('bookings', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteBooking permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.bookings.find((b) => b.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Booking not found' }, 'softDeleteBooking lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('bookings')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Booking delete returned no rows.' }, 'softDeleteBooking');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: deletedAt } : b)),
    }));
    appendAudit('DELETE', 'booking', id, target.booking_code, { customer_name: target.customer_name }, target.hall_id);
    pushSuccessToast(
      formatBookingSaveDetail(
        langRef.current,
        target.booking_code,
        target.customer_name,
        target.event_date,
        'deleted'
      ),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const restoreRecord: AppContextValue['restoreRecord'] = async (entityType, id) => {
    if (!can('recycle_bin', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'restoreRecord permission');
      return { ok: false, error: msg };
    }
    if (entityType === 'booking') {
      const target = rawDb.bookings.find((b) => b.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Booking not found' }, 'restoreRecord booking');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('bookings').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore booking returned no rows.' }, 'restoreRecord booking');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === id ? { ...b, deleted_at: null } : b)),
      }));
      appendAudit('RESTORE', 'booking', id, target.booking_code, {}, target.hall_id);
      pushSuccessToast(
        formatBookingSaveDetail(langRef.current, target.booking_code, target.customer_name, target.event_date, 'restored'),
        { tab: 'bookings', bookingId: id }
      );
      return { ok: true };
    } else if (entityType === 'payment') {
      const target = rawDb.payments.find((p) => p.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Payment not found' }, 'restoreRecord payment');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('payments').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore payment returned no rows.' }, 'restoreRecord payment');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: null } : p)),
      }));
      appendAudit('RESTORE', 'payment', id, target.receipt_number, {}, target.hall_id);
      pushSuccessToast(
        formatPaymentSaveDetail(langRef.current, target.amount, '', 'restored', target.receipt_number),
        { tab: 'payments', bookingId: target.booking_id }
      );
      return { ok: true };
    } else if (entityType === 'expense') {
      const target = rawDb.expenses.find((e) => e.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense not found' }, 'restoreRecord expense');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('expenses').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore expense returned no rows.' }, 'restoreRecord expense');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'expense', id, target.payee, {}, target.hall_id);
      pushSuccessToast(
        formatEntitySaveDetail(langRef.current, 'Expense', 'خرچہ', target.payee, 'restored'),
        { tab: 'expenses', subTab: 'expenses' }
      );
      return { ok: true };
    } else if (entityType === 'charge') {
      const target = rawDb.chargesCatalog.find((c) => c.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Charge not found' }, 'restoreRecord charge');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('charges_catalog').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore charge returned no rows.' }, 'restoreRecord charge');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)),
      }));
      appendAudit('RESTORE', 'charge', id, target.name_en, {}, target.hall_id);
      pushSuccessToast(
        formatBilingualEntitySaveDetail(langRef.current, 'Service / Charge', 'سروس / چارج', target.name_en, target.name_ur, 'restored'),
        { tab: 'catalog' }
      );
      return { ok: true };
    } else if (entityType === 'employee') {
      const target = rawDb.employees.find((e) => e.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Employee not found' }, 'restoreRecord employee');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('employees').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore employee returned no rows.' }, 'restoreRecord employee');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: null } : e)),
      }));
      appendAudit('RESTORE', 'employee', id, target.full_name, {}, target.hall_id);
      pushSuccessToast(
        formatEntitySaveDetail(langRef.current, 'Employee', 'ملازم', target.full_name, 'restored'),
        { tab: 'employees' }
      );
      return { ok: true };
    } else if (entityType === 'event_category') {
      const target = rawDb.eventCategories.find((c) => c.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Event category not found' }, 'restoreRecord event_category');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('event_categories').update({ deleted_at: null, deleted_by: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore event category returned no rows.' }, 'restoreRecord event_category');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        eventCategories: prev.eventCategories.map((c) => (c.id === id ? { ...c, deleted_at: null, deleted_by: null } : c)),
      }));
      appendAudit('RESTORE', 'event_category', id, target.name_en, {}, target.hall_id);
      pushSuccessToast(
        formatBilingualEntitySaveDetail(langRef.current, 'Event Category', 'ایونٹ کیٹیگری', target.name_en, target.name_ur, 'restored'),
        { tab: 'settings', subTab: 'events' }
      );
      return { ok: true };
    } else if (entityType === 'event_type') {
      const target = rawDb.eventTypes.find((e) => e.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Event not found' }, 'restoreRecord event_type');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('event_types').update({ deleted_at: null, deleted_by: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore event returned no rows.' }, 'restoreRecord event_type');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        eventTypes: prev.eventTypes.map((e) => (e.id === id ? { ...e, deleted_at: null, deleted_by: null } : e)),
      }));
      appendAudit('RESTORE', 'event_type', id, target.name_en, {}, target.hall_id);
      pushSuccessToast(
        formatBilingualEntitySaveDetail(langRef.current, 'Event', 'ایونٹ', target.name_en, target.name_ur, 'restored'),
        { tab: 'settings', subTab: 'events' }
      );
      return { ok: true };
    } else if (entityType === 'expense_category') {
      const target = rawDb.expenseCategories.find((c) => c.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense category not found' }, 'restoreRecord expense_category');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('expense_categories').update({ deleted_at: null, deleted_by: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore expense category returned no rows.' }, 'restoreRecord expense_category');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        expenseCategories: prev.expenseCategories.map((c) => (c.id === id ? { ...c, deleted_at: null, deleted_by: null } : c)),
      }));
      appendAudit('RESTORE', 'expense_category', id, target.name_en, {}, target.hall_id);
      pushSuccessToast(
        formatBilingualEntitySaveDetail(langRef.current, 'Expense Category', 'خرچہ کیٹیگری', target.name_en, target.name_ur, 'restored'),
        { tab: 'expenses', subTab: 'categories' }
      );
      return { ok: true };
    } else if (entityType === 'expense_subcategory') {
      const target = rawDb.expenseSubcategories.find((s) => s.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense sub-category not found' }, 'restoreRecord expense_subcategory');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('expense_subcategories').update({ deleted_at: null, deleted_by: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore expense sub-category returned no rows.' }, 'restoreRecord expense_subcategory');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        expenseSubcategories: prev.expenseSubcategories.map((s) => (s.id === id ? { ...s, deleted_at: null, deleted_by: null } : s)),
      }));
      appendAudit('RESTORE', 'expense_subcategory', id, target.name_en, {}, target.hall_id);
      pushSuccessToast(
        formatBilingualEntitySaveDetail(langRef.current, 'Expense Sub-category', 'ذیلی کیٹیگری', target.name_en, target.name_ur, 'restored'),
        { tab: 'expenses', subTab: 'categories' }
      );
      return { ok: true };
    } else {
      const target = rawDb.customers.find((c) => c.id === id);
      if (!target) {
        const msg = pushErrorToast({ code: 'PGRST116', message: 'Customer not found' }, 'restoreRecord customer');
        return { ok: false, error: msg };
      }
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from('customers').update({ deleted_at: null }).eq('id', id).select('id').single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Restore customer returned no rows.' }, 'restoreRecord customer');
          return { ok: false, error: msg };
        }
      }
      setRawDb((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => (c.id === id ? { ...c, deleted_at: null } : c)),
      }));
      appendAudit('RESTORE', 'customer', id, target.full_name, {}, target.hall_id);
      pushSuccessToast(
        formatEntitySaveDetail(langRef.current, 'Customer', 'گاہک', target.full_name, 'restored'),
        { tab: 'customers' }
      );
      return { ok: true };
    }
  };

  // =========================================================================
  // PAYMENTS
  // =========================================================================
  const addPayment: AppContextValue['addPayment'] = async (paymentData) => {
    if (!can('payments', 'edit') && !can('bookings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'You do not have Edit permission for Payments.' }, 'addPayment permission');
      return { ok: false, error: msg };
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
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Payment insert returned no rows.' }, 'addPayment');
        return { ok: false, error: msg };
      }
      receiptNum = (data as Payment).receipt_number;
      record.receipt_number = receiptNum;
    }

    setRawDb((prev) => ({
      ...prev,
      perHallSequences: {
        ...prev.perHallSequences,
        [activeHallId]: { ...currentSeq, receipt: nextSeq },
      },
      payments: [record, ...prev.payments],
    }));

    const parentBooking = rawDb.bookings.find((b) => b.id === record.booking_id);
    const bookingCode = parentBooking?.booking_code || record.receipt_number;

    appendAudit('CREATE', 'payment', record.id, record.receipt_number, {
      amount: record.amount,
      mode: record.mode,
      booking_id: record.booking_id,
    });
    pushSuccessToast(
      formatPaymentSaveDetail(langRef.current, record.amount, bookingCode, 'recorded', record.receipt_number),
      { tab: 'payments', bookingId: record.booking_id }
    );
    return { ok: true, payment: record };
  };

  const softDeletePayment: AppContextValue['softDeletePayment'] = async (id) => {
    if (!can('payments', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeletePayment permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.payments.find((p) => p.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Payment not found' }, 'softDeletePayment lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('payments')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Payment delete returned no rows.' }, 'softDeletePayment');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      payments: prev.payments.map((p) => (p.id === id ? { ...p, deleted_at: deletedAt } : p)),
    }));
    appendAudit('DELETE', 'payment', id, target.receipt_number, { amount: target.amount }, target.hall_id);
    pushSuccessToast(
      formatPaymentSaveDetail(langRef.current, target.amount, '', 'deleted', target.receipt_number),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const toggleInstallmentPaid: AppContextValue['toggleInstallmentPaid'] = async (id, paid) => {
    if (!can('payments', 'edit') && !can('bookings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleInstallmentPaid permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.installments.find((ins) => ins.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Installment not found' }, 'toggleInstallmentPaid lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('installment_schedules')
        .update({ is_paid: paid })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Installment update returned no rows.' }, 'toggleInstallmentPaid');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      installments: prev.installments.map((ins) => (ins.id === id ? { ...ins, is_paid: paid } : ins)),
    }));
    const instLabel = `${target.title} (${formatDateDisplay(target.due_date, langRef.current)})`;
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Installment', 'قسط', instLabel, 'updated'),
      { tab: 'payments', bookingId: target.booking_id }
    );
    return { ok: true };
  };

  // =========================================================================
  // DAILY CASH CLOSING
  // =========================================================================
  const saveDailyClosing: AppContextValue['saveDailyClosing'] = async (params) => {
    if (!can('daily_closing', 'edit')) {
      const msg = pushErrorToast(
        { code: '42501', message: 'You do not have Edit permission for Daily Closing.' },
        'saveDailyClosing permission'
      );
      return { ok: false, error: msg };
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
      const { data, error } = await supabase
        .from('daily_closings')
        .insert({
          ...record,
          submitted_by: isUuid(record.submitted_by) ? record.submitted_by : null,
        })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Daily closing insert returned no rows.' }, 'saveDailyClosing');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as DailyClosing);
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
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Daily Closing',
        'روزانہ کیش کلوزنگ',
        formatDateDisplay(record.closing_date, langRef.current),
        'submitted'
      ),
      { tab: 'closing' }
    );
    return { ok: true, closing: record };
  };

  const reviewDailyClosing: AppContextValue['reviewDailyClosing'] = async (
    closingId,
    decision,
    discrepancyAmount,
    adminNotes
  ) => {
    if (currentUser?.role === 'manager' || !can('daily_closing', 'edit')) {
      const msg = pushErrorToast(
        { code: '42501', message: 'Only Hall Admin or Super Admin with Daily Closing Edit permission can verify closings.' },
        'reviewDailyClosing permission'
      );
      return { ok: false, error: msg };
    }
    const target = rawDb.dailyClosings.find((c) => c.id === closingId);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Closing record not found.' }, 'reviewDailyClosing lookup');
      return { ok: false, error: msg };
    }

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
      const { data, error } = await supabase
        .from('daily_closings')
        .update(patch)
        .eq('id', closingId)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Closing review returned no rows.' }, 'reviewDailyClosing');
        return { ok: false, error: msg };
      }
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
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Daily Closing',
        'روزانہ کیش کلوزنگ',
        formatDateDisplay(target.closing_date, langRef.current),
        decision === 'received' ? 'received' : 'flagged'
      ),
      { tab: 'closing' }
    );
    return { ok: true };
  };

  // =========================================================================
  // APPROVAL REQUESTS (Manager -> Admin/Super Admin)
  // =========================================================================
  const submitApprovalRequest: AppContextValue['submitApprovalRequest'] = async (params) => {
    if (!can('bookings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'You do not have Edit permission for Bookings.' }, 'submitApprovalRequest permission');
      return { ok: false, error: msg };
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
      const { data, error } = await supabase
        .from('approval_requests')
        .insert({
          ...record,
          requested_by: isUuid(record.requested_by) ? record.requested_by : null,
        })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Approval request insert returned no rows.' }, 'submitApprovalRequest');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as ApprovalRequest);
    }

    setRawDb((prev) => ({
      ...prev,
      approvalRequests: [record, ...prev.approvalRequests],
    }));
    appendAudit('APPROVAL', 'approval_request', record.id, `${record.booking_code} (${record.request_type})`, {
      status: 'pending',
      reason: record.reason,
    });
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Approval Request',
        'منظوری کی درخواست',
        `${record.booking_code} (${record.customer_name})`,
        'submitted'
      ),
      { tab: 'approvals' }
    );
    return { ok: true };
  };

  const reviewApprovalRequest: AppContextValue['reviewApprovalRequest'] = async (
    requestId,
    decision,
    reviewNote
  ) => {
    if (currentUser?.role === 'manager' || !can('bookings', 'edit')) {
      const msg = pushErrorToast(
        { code: '42501', message: 'Only Hall Admin or Super Admin with Bookings Edit permission can approve or reject requests.' },
        'reviewApprovalRequest permission'
      );
      return { ok: false, error: msg };
    }
    const req = rawDb.approvalRequests.find((r) => r.id === requestId);
    if (!req) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Request not found.' }, 'reviewApprovalRequest lookup');
      return { ok: false, error: msg };
    }
    if (req.status !== 'pending') {
      const msg = pushErrorToast({ code: 'ERR_WRITE', message: 'Request has already been reviewed.' }, 'reviewApprovalRequest state');
      return { ok: false, error: msg };
    }

    const reviewedAt = new Date().toISOString();
    const patch = {
      status: decision,
      reviewed_by: isUuid(currentUser?.id) ? currentUser?.id : null,
      reviewed_by_name: currentUser?.full_name || 'Admin',
      reviewed_at: reviewedAt,
      review_note: reviewNote.trim(),
    };

    // If approving, verify booking mutation succeeds first so approval_requests doesn't drift on error
    let updatedBookingToCommit: Booking | null = null;

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
            const { data: bData, error: bErr } = await supabase
              .from('bookings')
              .update({
                discount_type: dtype,
                discount_value: dval,
                discount_amount: dAmt,
                discount_reason: dreason,
                updated_at: updated.updated_at,
              })
              .eq('id', targetBooking.id)
              .select('*')
              .single();
            if (bErr || !bData) {
              const msg = pushErrorToast(bErr || { code: 'RLS_0_ROWS', message: 'Booking discount update failed.' }, 'reviewApprovalRequest discount');
              return { ok: false, error: msg };
            }
          }
          const invRes = await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
          if (!invRes.ok) {
            const msg = pushErrorToast(invRes.rawError, 'reviewApprovalRequest invoice sync');
            return { ok: false, error: msg };
          }
          updatedBookingToCommit = updated;
        } else if (req.request_type === 'cancellation' || req.request_type === 'refund') {
          const details = req.payload.cancellation_details as CancellationDetails | undefined;
          if (details) {
            const cancelRes = await cancelBooking(
              targetBooking.id,
              {
                ...details,
                cancelled_by: `${req.requested_by_name} (Approved by ${currentUser?.full_name || 'Admin'})`,
                cancelled_at: new Date().toISOString(),
              },
              { silentToast: true }
            );
            if (!cancelRes.ok) return { ok: false, error: cancelRes.error };
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
            const { data: bData, error: bErr } = await supabase
              .from('bookings')
              .update({ reschedule_history: history, updated_at: updated.updated_at })
              .eq('id', targetBooking.id)
              .select('*')
              .single();
            if (bErr || !bData) {
              const msg = pushErrorToast(bErr || { code: 'RLS_0_ROWS', message: 'Reschedule fee update failed.' }, 'reviewApprovalRequest reschedule');
              return { ok: false, error: msg };
            }
          }
          const invRes = await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
          if (!invRes.ok) {
            const msg = pushErrorToast(invRes.rawError, 'reviewApprovalRequest invoice sync');
            return { ok: false, error: msg };
          }
          updatedBookingToCommit = updated;
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
            const { data: bData, error: bErr } = await supabase
              .from('bookings')
              .update({
                late_charge_method: method,
                late_charge_value: value,
                late_charge_amount: amount,
                late_charge_overridden: true,
                actual_end_time: actualEnd,
                updated_at: updated.updated_at,
              })
              .eq('id', targetBooking.id)
              .select('*')
              .single();
            if (bErr || !bData) {
              const msg = pushErrorToast(bErr || { code: 'RLS_0_ROWS', message: 'Late charge update failed.' }, 'reviewApprovalRequest late_charge');
              return { ok: false, error: msg };
            }
          }
          const invRes = await syncInvoiceForBooking(updated, rawDb.bookingItems, rawDb.payments);
          if (!invRes.ok) {
            const msg = pushErrorToast(invRes.rawError, 'reviewApprovalRequest invoice sync');
            return { ok: false, error: msg };
          }
          updatedBookingToCommit = updated;
        }
      }
    }

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('approval_requests')
        .update(patch)
        .eq('id', requestId)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Approval update returned no rows.' }, 'reviewApprovalRequest');
        return { ok: false, error: msg };
      }
    }

    setRawDb((prev) => ({
      ...prev,
      approvalRequests: prev.approvalRequests.map((r) => (r.id === requestId ? { ...r, ...patch } : r)),
      bookings: updatedBookingToCommit
        ? prev.bookings.map((b) => (b.id === updatedBookingToCommit!.id ? updatedBookingToCommit! : b))
        : prev.bookings,
    }));

    appendAudit('APPROVAL', 'approval_request', requestId, `${req.booking_code} (${req.request_type})`, {
      decision,
      review_note: patch.review_note,
    }, req.hall_id);

    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Approval Request',
        'منظوری کی درخواست',
        `${req.booking_code} (${req.customer_name})`,
        decision === 'approved' ? 'approved' : 'rejected'
      ),
      { tab: 'approvals' }
    );

    return { ok: true };
  };

  // =========================================================================
  // EXPENSES, STAFF, ATTENDANCE & PAYROLL
  // =========================================================================
  const addExpense: AppContextValue['addExpense'] = async (expenseData, options) => {
    if (!can('expenses', 'edit') && !can('salaries', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'addExpense permission');
      return { ok: false, error: msg };
    }
    const record: Expense = {
      ...expenseData,
      hall_id: activeHallId,
      booking_id: expenseData.booking_id || null,
      employee_id: expenseData.employee_id || null,
      subcategory_id: expenseData.subcategory_id || null,
      subcategory_name: expenseData.subcategory_name || '',
      subcategory_name_ur: expenseData.subcategory_name_ur || '',
      manual_description: (expenseData.manual_description || '').trim(),
      id: makeUUID(),
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          ...record,
          category_id: isUuid(record.category_id) ? record.category_id : null,
          subcategory_id: isUuid(record.subcategory_id) ? record.subcategory_id : null,
          booking_id: isUuid(record.booking_id) ? record.booking_id : null,
          employee_id: isUuid(record.employee_id) ? record.employee_id : null,
        })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Expense insert returned no rows.' }, 'addExpense');
        return { ok: false, error: msg };
      }
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
    if (!options?.silentToast) {
      pushSuccessToast(
        formatEntitySaveDetail(
          langRef.current,
          'Expense',
          'خرچہ',
          `${record.payee} (${formatPKR(record.amount)})`,
          'added'
        ),
        { tab: 'expenses', subTab: 'expenses' }
      );
    }
    return { ok: true, expense: record };
  };

  const softDeleteExpense: AppContextValue['softDeleteExpense'] = async (id) => {
    if (!can('expenses', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteExpense permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.expenses.find((e) => e.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense not found' }, 'softDeleteExpense lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expenses')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Expense delete returned no rows.' }, 'softDeleteExpense');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'expense', id, target.payee, { amount: target.amount }, target.hall_id);
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Expense', 'خرچہ', target.payee, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const saveEmployee: AppContextValue['saveEmployee'] = async (emp) => {
    if (!can('employees', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveEmployee permission');
      return { ok: false, error: msg };
    }
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
      const { data, error } = await supabase.from('employees').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Employee save returned no rows.' }, 'saveEmployee');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as Employee);
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
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Employee', 'ملازم', record.full_name, isUpdate ? 'updated' : 'added'),
      { tab: 'employees' }
    );
    return { ok: true, employee: record };
  };

  const toggleEmployeeActive: AppContextValue['toggleEmployeeActive'] = async (id, isActive) => {
    if (!can('employees', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleEmployeeActive permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.employees.find((e) => e.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Employee not found' }, 'toggleEmployeeActive lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('employees')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Employee status update returned no rows.' }, 'toggleEmployeeActive');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, is_active: isActive } : e)),
    }));
    appendAudit('UPDATE', 'employee', id, target.full_name, { is_active: isActive }, target.hall_id);
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Employee', 'ملازم', target.full_name, isActive ? 'activated' : 'deactivated'),
      { tab: 'employees' }
    );
    return { ok: true };
  };

  const softDeleteEmployee: AppContextValue['softDeleteEmployee'] = async (id) => {
    if (!can('employees', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteEmployee permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.employees.find((e) => e.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Employee not found' }, 'softDeleteEmployee lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('employees')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Employee delete returned no rows.' }, 'softDeleteEmployee');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'employee', id, target.full_name, {}, target.hall_id);
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Employee', 'ملازم', target.full_name, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const saveAttendance: AppContextValue['saveAttendance'] = async (employeeId, dateISO, status, notes) => {
    if (!can('attendance', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveAttendance permission');
      return { ok: false, error: msg };
    }
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
      const { data, error } = await supabase
        .from('employee_attendance')
        .upsert(record, { onConflict: 'employee_id,attendance_date' })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Attendance save returned no rows.' }, 'saveAttendance');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as EmployeeAttendance);
    }
    setRawDb((prev) => ({
      ...prev,
      attendance: existing
        ? prev.attendance.map((a) => (a.id === existing.id ? record : a))
        : [record, ...prev.attendance],
    }));
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Attendance',
        'حاضری',
        `${emp?.full_name || ''} (${formatDateDisplay(dateISO, langRef.current)})`.trim(),
        'saved'
      ),
      { tab: 'attendance' }
    );
    return { ok: true };
  };

  const addEmployeeAdvance: AppContextValue['addEmployeeAdvance'] = async (advance) => {
    if (!can('salaries', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'addEmployeeAdvance permission');
      return { ok: false, error: msg };
    }
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
      const { data, error } = await supabase.from('employee_advances').insert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Advance insert returned no rows.' }, 'addEmployeeAdvance');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as EmployeeAdvance);
    }
    setRawDb((prev) => ({
      ...prev,
      advances: [record, ...prev.advances],
    }));
    appendAudit('PAYROLL', 'advance', record.id, emp?.full_name || advance.employee_id, {
      amount: record.amount,
      date: record.advance_date,
    }, hallId);
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Advance',
        'ایڈوانس',
        `${emp?.full_name || ''} (${formatPKR(record.amount)})`.trim(),
        'recorded'
      ),
      { tab: 'salaries' }
    );
    return { ok: true };
  };

  const payEmployeeSalary: AppContextValue['payEmployeeSalary'] = async ({
    employeeId,
    month,
    netPayable,
    totalAdvancesDeducted,
    mode,
    notes,
  }) => {
    if (!can('salaries', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'payEmployeeSalary permission');
      return { ok: false, error: msg };
    }
    const emp = rawDb.employees.find((e) => e.id === employeeId);
    if (!emp) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Employee not found' }, 'payEmployeeSalary lookup');
      return { ok: false, error: msg };
    }

    const isMonthly = emp.employment_type === 'monthly';
    const cat = isMonthly
      ? db.expenseCategories.find((c) => !c.deleted_at && c.name_en.toLowerCase() === 'salaries') ||
        db.expenseCategories.find((c) => !c.deleted_at)
      : db.expenseCategories.find((c) => !c.deleted_at && c.name_en.toLowerCase() === 'daily wages') ||
        db.expenseCategories.find((c) => !c.deleted_at && c.name_en.toLowerCase().includes('waiter')) ||
        db.expenseCategories.find((c) => !c.deleted_at);

    const subcat = cat
      ? db.expenseSubcategories.find(
          (s) =>
            !s.deleted_at &&
            s.category_id === cat.id &&
            (isMonthly
              ? s.name_en.toLowerCase().includes('monthly')
              : s.name_en.toLowerCase().includes('waiter'))
        ) || db.expenseSubcategories.find((s) => !s.deleted_at && s.category_id === cat.id)
      : undefined;

    const amountToPay = Math.max(0, Math.round(netPayable));
    if (amountToPay > 0) {
      const expRes = await addExpense(
        {
          category_id: cat?.id || '',
          category_name: cat?.name_en || (isMonthly ? 'Salaries' : 'Daily Wages'),
          category_name_ur: cat?.name_ur || (isMonthly ? 'تنخواہیں' : 'یومیہ اجرت'),
          subcategory_id: subcat?.id || null,
          subcategory_name: subcat?.name_en || (isMonthly ? 'Monthly Salaries' : 'Waiters'),
          subcategory_name_ur: subcat?.name_ur || (isMonthly ? 'ماہانہ تنخواہیں' : 'ویٹرز'),
          manual_description: '',
          booking_id: null,
          employee_id: emp.id,
          amount: amountToPay,
          expense_date: todayISO(),
          payee: emp.full_name,
          mode,
          reference_no: `SAL-${month}`,
          notes: `${notes || `Salary for ${month}`} (Advances deducted: PKR ${totalAdvancesDeducted.toLocaleString()})`,
        },
        { silentToast: true }
      );
      if (!expRes.ok) {
        return { ok: false, error: expRes.error };
      }
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
        const { data, error } = await supabase
          .from('employee_advances')
          .update({ is_settled: true, settled_month: month })
          .in('id', ids)
          .select('id');
        if (error || !data || data.length === 0) {
          const msg = pushErrorToast(
            error || { code: 'RLS_0_ROWS', message: 'Advance settlement update returned no rows.' },
            'payEmployeeSalary settle advances'
          );
          return { ok: false, error: msg };
        }
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
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Salary',
        'تنخواہ',
        `${emp.full_name} (${month}, ${formatPKR(amountToPay)})`,
        'recorded'
      ),
      { tab: 'salaries' }
    );
    return { ok: true };
  };

  const saveExpenseCategory: AppContextValue['saveExpenseCategory'] = async (cat) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveExpenseCategory permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(cat.id);
    const id = cat.id || makeUUID();
    const existing = rawDb.expenseCategories.find((c) => c.id === id);
    const record: ExpenseCategory = {
      id,
      hall_id: existing?.hall_id || activeHallId,
      name_en: cat.name_en.trim(),
      name_ur: cat.name_ur.trim(),
      sort_order: cat.sort_order ?? existing?.sort_order ?? db.expenseCategories.filter((c) => !c.deleted_at).length + 1,
      is_active: cat.is_active ?? existing?.is_active ?? true,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('expense_categories').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Expense category save returned no rows.' }, 'saveExpenseCategory');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as ExpenseCategory);
    }
    setRawDb((prev) => ({
      ...prev,
      expenseCategories: isUpdate
        ? prev.expenseCategories.map((c) => (c.id === id ? record : c))
        : [...prev.expenseCategories, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'expense_category', id, record.name_en, {
      name_ur: record.name_ur,
      is_active: record.is_active,
    }, record.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Expense Category',
        'خرچہ کیٹیگری',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true, category: record };
  };

  const toggleExpenseCategoryActive: AppContextValue['toggleExpenseCategoryActive'] = async (id, isActive) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleExpenseCategoryActive permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.expenseCategories.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense category not found' }, 'toggleExpenseCategoryActive lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expense_categories')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Status update returned no rows.' }, 'toggleExpenseCategoryActive');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseCategories: prev.expenseCategories.map((c) => (c.id === id ? { ...c, is_active: isActive } : c)),
    }));
    appendAudit('UPDATE', 'expense_category', id, target.name_en, { is_active: isActive }, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Expense Category',
        'خرچہ کیٹیگری',
        target.name_en,
        target.name_ur,
        isActive ? 'activated' : 'deactivated'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true };
  };

  const reorderExpenseCategories: AppContextValue['reorderExpenseCategories'] = async (orderedIds) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'reorderExpenseCategories permission');
      return { ok: false, error: msg };
    }
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, idx) => orderMap.set(id, idx + 1));
    if (isSupabaseConfigured && supabase) {
      for (const [id, sort_order] of orderMap.entries()) {
        const { data, error } = await supabase
          .from('expense_categories')
          .update({ sort_order })
          .eq('id', id)
          .select('id')
          .single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Reorder failed.' }, 'reorderExpenseCategories');
          return { ok: false, error: msg };
        }
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseCategories: prev.expenseCategories.map((c) =>
        orderMap.has(c.id) ? { ...c, sort_order: orderMap.get(c.id)! } : c
      ),
    }));
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Expense Categories',
        'اخراجات کی کیٹیگریاں',
        pickLocalized(activeHall.name, activeHall.name_ur, langRef.current) || 'Order',
        'updated'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true };
  };

  const softDeleteExpenseCategory: AppContextValue['softDeleteExpenseCategory'] = async (id) => {
    if (!can('expense_categories', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteExpenseCategory permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.expenseCategories.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense category not found' }, 'softDeleteExpenseCategory lookup');
      return { ok: false, error: msg };
    }
    const usedInExpenses = rawDb.expenses.some(
      (e) =>
        !e.deleted_at &&
        e.hall_id === target.hall_id &&
        (e.category_id === id || e.category_name.toLowerCase() === target.name_en.toLowerCase())
    );
    const hasActiveSubs = rawDb.expenseSubcategories.some(
      (s) => !s.deleted_at && s.category_id === id
    );
    if (usedInExpenses || hasActiveSubs) {
      const msg = ctxText(
        usedInExpenses
          ? `"${target.name_en}" has recorded expenses and cannot be deleted. Deactivate it instead.`
          : `"${target.name_en}" contains sub-categories. Delete or move them first, or deactivate the category.`,
        usedInExpenses
          ? `"${target.name_ur || target.name_en}" میں اخراجات درج ہیں اس لیے حذف نہیں کیا جا سکتا۔ اس کے بجائے غیر فعال کریں۔`
          : `"${target.name_ur || target.name_en}" میں ذیلی کیٹیگریاں موجود ہیں۔ پہلے انہیں ہٹائیں یا کیٹیگری غیر فعال کریں۔`
      );
      pushErrorToast({ code: '23503', message: msg }, 'softDeleteExpenseCategory in-use');
      return { ok: false, inUse: true, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expense_categories')
        .update({ deleted_at: deletedAt, deleted_by: currentUser?.id || null })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Delete returned no rows.' }, 'softDeleteExpenseCategory');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseCategories: prev.expenseCategories.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'expense_category', id, target.name_en, {}, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(langRef.current, 'Expense Category', 'خرچہ کیٹیگری', target.name_en, target.name_ur, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const saveExpenseSubcategory: AppContextValue['saveExpenseSubcategory'] = async (sub) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveExpenseSubcategory permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(sub.id);
    const id = sub.id || makeUUID();
    const existing = rawDb.expenseSubcategories.find((s) => s.id === id);
    const record: ExpenseSubcategory = {
      id,
      hall_id: existing?.hall_id || activeHallId,
      category_id: sub.category_id,
      name_en: sub.name_en.trim(),
      name_ur: sub.name_ur.trim(),
      sort_order:
        sub.sort_order ??
        existing?.sort_order ??
        db.expenseSubcategories.filter((s) => !s.deleted_at && s.category_id === sub.category_id).length + 1,
      is_active: sub.is_active ?? existing?.is_active ?? true,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('expense_subcategories').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Expense sub-category save returned no rows.' }, 'saveExpenseSubcategory');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as ExpenseSubcategory);
    }
    setRawDb((prev) => ({
      ...prev,
      expenseSubcategories: isUpdate
        ? prev.expenseSubcategories.map((s) => (s.id === id ? record : s))
        : [...prev.expenseSubcategories, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'expense_subcategory', id, record.name_en, {
      category_id: record.category_id,
      is_active: record.is_active,
    }, record.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Expense Sub-category',
        'ذیلی کیٹیگری',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true, subcategory: record };
  };

  const toggleExpenseSubcategoryActive: AppContextValue['toggleExpenseSubcategoryActive'] = async (id, isActive) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleExpenseSubcategoryActive permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.expenseSubcategories.find((s) => s.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense sub-category not found' }, 'toggleExpenseSubcategoryActive lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expense_subcategories')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Status update returned no rows.' }, 'toggleExpenseSubcategoryActive');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseSubcategories: prev.expenseSubcategories.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)),
    }));
    appendAudit('UPDATE', 'expense_subcategory', id, target.name_en, { is_active: isActive }, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Expense Sub-category',
        'ذیلی کیٹیگری',
        target.name_en,
        target.name_ur,
        isActive ? 'activated' : 'deactivated'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true };
  };

  const reorderExpenseSubcategories: AppContextValue['reorderExpenseSubcategories'] = async (categoryId, orderedIds) => {
    if (!can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'reorderExpenseSubcategories permission');
      return { ok: false, error: msg };
    }
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, idx) => orderMap.set(id, idx + 1));
    if (isSupabaseConfigured && supabase) {
      for (const [id, sort_order] of orderMap.entries()) {
        const { data, error } = await supabase
          .from('expense_subcategories')
          .update({ sort_order })
          .eq('id', id)
          .eq('category_id', categoryId)
          .select('id')
          .single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Reorder failed.' }, 'reorderExpenseSubcategories');
          return { ok: false, error: msg };
        }
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseSubcategories: prev.expenseSubcategories.map((s) =>
        orderMap.has(s.id) ? { ...s, sort_order: orderMap.get(s.id)! } : s
      ),
    }));
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Sub-categories Order', 'ذیلی کیٹیگری ترتیب', '', 'updated'),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true };
  };

  const softDeleteExpenseSubcategory: AppContextValue['softDeleteExpenseSubcategory'] = async (id) => {
    if (!can('expense_categories', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteExpenseSubcategory permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.expenseSubcategories.find((s) => s.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Expense sub-category not found' }, 'softDeleteExpenseSubcategory lookup');
      return { ok: false, error: msg };
    }
    const usedInExpenses = rawDb.expenses.some(
      (e) => !e.deleted_at && e.hall_id === target.hall_id && e.subcategory_id === id
    );
    if (usedInExpenses) {
      const msg = ctxText(
        `"${target.name_en}" has recorded expenses and cannot be deleted. Deactivate it instead.`,
        `"${target.name_ur || target.name_en}" میں اخراجات درج ہیں اس لیے حذف نہیں کیا جا سکتا۔ اس کے بجائے غیر فعال کریں۔`
      );
      pushErrorToast({ code: '23503', message: msg }, 'softDeleteExpenseSubcategory in-use');
      return { ok: false, inUse: true, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('expense_subcategories')
        .update({ deleted_at: deletedAt, deleted_by: currentUser?.id || null })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Delete returned no rows.' }, 'softDeleteExpenseSubcategory');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      expenseSubcategories: prev.expenseSubcategories.map((s) => (s.id === id ? { ...s, deleted_at: deletedAt } : s)),
    }));
    appendAudit('DELETE', 'expense_subcategory', id, target.name_en, {}, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(langRef.current, 'Expense Sub-category', 'ذیلی کیٹیگری', target.name_en, target.name_ur, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const copyExpenseTaxonomyFromHall: AppContextValue['copyExpenseTaxonomyFromHall'] = async (sourceHallId) => {
    if (currentUser?.role !== 'super_admin' || !can('expense_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Only Super Admin can copy lists across halls.' }, 'copyExpenseTaxonomyFromHall permission');
      return { ok: false, error: msg };
    }
    if (!sourceHallId || sourceHallId === activeHallId) {
      const msg = pushErrorToast({ message: ctxText('Choose a different source hall.', 'کسی دوسرے ہال کا انتخاب کریں۔') }, 'copyExpenseTaxonomyFromHall');
      return { ok: false, error: msg };
    }
    const srcCats = rawDb.expenseCategories.filter((c) => c.hall_id === sourceHallId && !c.deleted_at);
    const srcSubs = rawDb.expenseSubcategories.filter((s) => s.hall_id === sourceHallId && !s.deleted_at);
    const existingCats = db.expenseCategories.filter((c) => !c.deleted_at);
    const existingSubs = db.expenseSubcategories.filter((s) => !s.deleted_at);

    const catMap = new Map<string, string>();
    const newCats: ExpenseCategory[] = [];
    for (const sc of srcCats) {
      const match = existingCats.find((ec) => ec.name_en.trim().toLowerCase() === sc.name_en.trim().toLowerCase());
      if (match) {
        catMap.set(sc.id, match.id);
      } else {
        const nextId = makeUUID();
        catMap.set(sc.id, nextId);
        newCats.push({
          ...sc,
          id: nextId,
          hall_id: activeHallId,
          deleted_at: null,
        });
      }
    }

    const newSubs: ExpenseSubcategory[] = [];
    for (const ss of srcSubs) {
      const targetCatId = catMap.get(ss.category_id);
      if (!targetCatId) continue;
      const alreadyExists = existingSubs.some(
        (es) => es.category_id === targetCatId && es.name_en.trim().toLowerCase() === ss.name_en.trim().toLowerCase()
      );
      if (!alreadyExists) {
        newSubs.push({
          ...ss,
          id: makeUUID(),
          hall_id: activeHallId,
          category_id: targetCatId,
          deleted_at: null,
        });
      }
    }

    if (isSupabaseConfigured && supabase) {
      if (newCats.length > 0) {
        const { data, error } = await supabase.from('expense_categories').insert(newCats).select('*');
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Failed copying categories.' }, 'copyExpenseTaxonomyFromHall cats');
          return { ok: false, error: msg };
        }
      }
      if (newSubs.length > 0) {
        const { data, error } = await supabase.from('expense_subcategories').insert(newSubs).select('*');
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Failed copying sub-categories.' }, 'copyExpenseTaxonomyFromHall subs');
          return { ok: false, error: msg };
        }
      }
    }

    setRawDb((prev) => ({
      ...prev,
      expenseCategories: [...prev.expenseCategories, ...newCats],
      expenseSubcategories: [...prev.expenseSubcategories, ...newSubs],
    }));

    const copiedCount = newCats.length + newSubs.length;
    const srcHall = rawDb.halls.find((h) => h.id === sourceHallId);
    appendAudit('IMPORT', 'expense_categories', activeHallId, srcHall?.name || sourceHallId, {
      categories_added: newCats.length,
      subcategories_added: newSubs.length,
    });
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Expense Lists',
        'اخراجات کی فہرست',
        `${copiedCount} ${ctxText('items copied', 'اشیاء کاپی ہوئیں')}`,
        'saved'
      ),
      { tab: 'expenses', subTab: 'categories' }
    );
    return { ok: true, copiedCount };
  };

  // =========================================================================
  // CATALOG, EVENT TYPES & USERS (EDGE FUNCTION)
  // =========================================================================
  const saveChargeCategory: AppContextValue['saveChargeCategory'] = async (cat) => {
    if (!can('catalog', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveChargeCategory permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(cat.id);
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
      const { data, error } = await supabase.from('charge_categories').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Charge category save returned no rows.' }, 'saveChargeCategory');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as ChargeCategory);
    }
    setRawDb((prev) => ({
      ...prev,
      chargeCategories: isUpdate
        ? prev.chargeCategories.map((c) => (c.id === id ? record : c))
        : [...prev.chargeCategories, record],
    }));
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Category',
        'کیٹیگری',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'catalog' }
    );
    return { ok: true };
  };

  const saveChargeItem: AppContextValue['saveChargeItem'] = async (item) => {
    if (!can('catalog', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveChargeItem permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(item.id);
    const id = item.id || makeUUID();
    const record: ChargeCatalogItem = { ...item, id, hall_id: activeHallId, deleted_at: null };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('charges_catalog')
        .upsert({
          ...record,
          category_id: isUuid(record.category_id) ? record.category_id : null,
        })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Charge item save returned no rows.' }, 'saveChargeItem');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as ChargeCatalogItem);
    }
    setRawDb((prev) => ({
      ...prev,
      chargesCatalog: isUpdate
        ? prev.chargesCatalog.map((c) => (c.id === id ? record : c))
        : [...prev.chargesCatalog, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'charge', id, record.name_en, { rate: record.default_rate });
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Service / Charge',
        'سروس / چارج',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'catalog' }
    );
    return { ok: true };
  };

  const softDeleteChargeItem: AppContextValue['softDeleteChargeItem'] = async (id) => {
    if (!can('catalog', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteChargeItem permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.chargesCatalog.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Charge item not found' }, 'softDeleteChargeItem lookup');
      return { ok: false, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('charges_catalog')
        .update({ deleted_at: deletedAt })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Charge item delete returned no rows.' }, 'softDeleteChargeItem');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      chargesCatalog: prev.chargesCatalog.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'charge', id, target.name_en, {}, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Service / Charge',
        'سروس / چارج',
        target.name_en,
        target.name_ur,
        'deleted'
      ),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const saveEventCategory: AppContextValue['saveEventCategory'] = async (cat) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveEventCategory permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(cat.id);
    const id = cat.id || makeUUID();
    const existing = rawDb.eventCategories.find((c) => c.id === id);
    const record: EventCategory = {
      id,
      hall_id: existing?.hall_id || activeHallId,
      name_en: cat.name_en.trim(),
      name_ur: cat.name_ur.trim(),
      sort_order:
        cat.sort_order ??
        existing?.sort_order ??
        db.eventCategories.filter((c) => !c.deleted_at).length + 1,
      is_active: cat.is_active ?? existing?.is_active ?? true,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('event_categories').upsert(record).select('*').single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Event category save returned no rows.' }, 'saveEventCategory');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as EventCategory);
    }
    setRawDb((prev) => ({
      ...prev,
      eventCategories: isUpdate
        ? prev.eventCategories.map((c) => (c.id === id ? record : c))
        : [...prev.eventCategories, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'event_category', id, record.name_en, {
      name_ur: record.name_ur,
      is_active: record.is_active,
    }, record.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Event Category',
        'ایونٹ کیٹیگری',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true, category: record };
  };

  const toggleEventCategoryActive: AppContextValue['toggleEventCategoryActive'] = async (id, isActive) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleEventCategoryActive permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.eventCategories.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Event category not found' }, 'toggleEventCategoryActive lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('event_categories')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Status update returned no rows.' }, 'toggleEventCategoryActive');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventCategories: prev.eventCategories.map((c) => (c.id === id ? { ...c, is_active: isActive } : c)),
    }));
    appendAudit('UPDATE', 'event_category', id, target.name_en, { is_active: isActive }, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Event Category',
        'ایونٹ کیٹیگری',
        target.name_en,
        target.name_ur,
        isActive ? 'activated' : 'deactivated'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true };
  };

  const reorderEventCategories: AppContextValue['reorderEventCategories'] = async (orderedIds) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'reorderEventCategories permission');
      return { ok: false, error: msg };
    }
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, idx) => orderMap.set(id, idx + 1));
    if (isSupabaseConfigured && supabase) {
      for (const [id, sort_order] of orderMap.entries()) {
        const { data, error } = await supabase
          .from('event_categories')
          .update({ sort_order })
          .eq('id', id)
          .select('id')
          .single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Reorder failed.' }, 'reorderEventCategories');
          return { ok: false, error: msg };
        }
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventCategories: prev.eventCategories.map((c) =>
        orderMap.has(c.id) ? { ...c, sort_order: orderMap.get(c.id)! } : c
      ),
    }));
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Event Categories',
        'ایونٹ کیٹیگریاں',
        pickLocalized(activeHall.name, activeHall.name_ur, langRef.current) || 'Order',
        'updated'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true };
  };

  const softDeleteEventCategory: AppContextValue['softDeleteEventCategory'] = async (id) => {
    if (!can('event_categories', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteEventCategory permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.eventCategories.find((c) => c.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Event category not found' }, 'softDeleteEventCategory lookup');
      return { ok: false, error: msg };
    }
    const usedInBookings = rawDb.bookings.some(
      (b) => !b.deleted_at && b.hall_id === target.hall_id && b.event_category_id === id
    );
    const hasActiveEvents = rawDb.eventTypes.some((e) => !e.deleted_at && e.category_id === id);
    if (usedInBookings || hasActiveEvents) {
      const msg = ctxText(
        usedInBookings
          ? `"${target.name_en}" is used by existing bookings and cannot be deleted. Deactivate it instead.`
          : `"${target.name_en}" contains events. Move or delete them first, or deactivate the category.`,
        usedInBookings
          ? `"${target.name_ur || target.name_en}" موجودہ بکنگز میں استعمال ہو رہی ہے اس لیے حذف نہیں ہو سکتی۔ اسے غیر فعال کریں۔`
          : `"${target.name_ur || target.name_en}" میں ایونٹس موجود ہیں۔ پہلے انہیں ہٹائیں یا کیٹیگری غیر فعال کریں۔`
      );
      pushErrorToast({ code: '23503', message: msg }, 'softDeleteEventCategory in-use');
      return { ok: false, inUse: true, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('event_categories')
        .update({ deleted_at: deletedAt, deleted_by: currentUser?.id || null })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Delete returned no rows.' }, 'softDeleteEventCategory');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventCategories: prev.eventCategories.map((c) => (c.id === id ? { ...c, deleted_at: deletedAt } : c)),
    }));
    appendAudit('DELETE', 'event_category', id, target.name_en, {}, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(langRef.current, 'Event Category', 'ایونٹ کیٹیگری', target.name_en, target.name_ur, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const saveEventType: AppContextValue['saveEventType'] = async (et) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveEventType permission');
      return { ok: false, error: msg };
    }
    const isUpdate = Boolean(et.id);
    const id = et.id || makeUUID();
    const existing = rawDb.eventTypes.find((e) => e.id === id);
    const catId = et.category_id !== undefined ? et.category_id : existing?.category_id || null;
    const record: EventTypeItem = {
      id,
      hall_id: existing?.hall_id || activeHallId,
      category_id: isUuid(catId) ? catId : null,
      name_en: et.name_en.trim(),
      name_ur: et.name_ur.trim(),
      color_hex: et.color_hex || existing?.color_hex || '#d4af37',
      sort_order:
        et.sort_order ??
        existing?.sort_order ??
        db.eventTypes.filter((e) => !e.deleted_at && e.category_id === catId).length + 1,
      is_active: et.is_active ?? existing?.is_active ?? true,
      is_default: existing?.is_default ?? false,
      deleted_at: null,
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('event_types')
        .upsert({
          ...record,
          category_id: isUuid(record.category_id) ? record.category_id : null,
        })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Event save returned no rows.' }, 'saveEventType');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as EventTypeItem);
    }
    setRawDb((prev) => ({
      ...prev,
      eventTypes: isUpdate
        ? prev.eventTypes.map((e) => (e.id === id ? record : e))
        : [...prev.eventTypes, record],
    }));
    appendAudit(isUpdate ? 'UPDATE' : 'CREATE', 'event_type', id, record.name_en, {
      category_id: record.category_id,
      is_active: record.is_active,
    }, record.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Event',
        'ایونٹ',
        record.name_en,
        record.name_ur,
        isUpdate ? 'updated' : 'added'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true, eventType: record };
  };

  const toggleEventTypeActive: AppContextValue['toggleEventTypeActive'] = async (id, isActive) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'toggleEventTypeActive permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.eventTypes.find((e) => e.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Event not found' }, 'toggleEventTypeActive lookup');
      return { ok: false, error: msg };
    }
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('event_types')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Status update returned no rows.' }, 'toggleEventTypeActive');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.map((e) => (e.id === id ? { ...e, is_active: isActive } : e)),
    }));
    appendAudit('UPDATE', 'event_type', id, target.name_en, { is_active: isActive }, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(
        langRef.current,
        'Event',
        'ایونٹ',
        target.name_en,
        target.name_ur,
        isActive ? 'activated' : 'deactivated'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true };
  };

  const reorderEventTypes: AppContextValue['reorderEventTypes'] = async (_categoryId, orderedIds) => {
    if (!can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'reorderEventTypes permission');
      return { ok: false, error: msg };
    }
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, idx) => orderMap.set(id, idx + 1));
    if (isSupabaseConfigured && supabase) {
      for (const [id, sort_order] of orderMap.entries()) {
        const { data, error } = await supabase
          .from('event_types')
          .update({ sort_order })
          .eq('id', id)
          .select('id')
          .single();
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Reorder failed.' }, 'reorderEventTypes');
          return { ok: false, error: msg };
        }
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.map((e) =>
        orderMap.has(e.id) ? { ...e, sort_order: orderMap.get(e.id)! } : e
      ),
    }));
    pushSuccessToast(
      formatEntitySaveDetail(langRef.current, 'Events Order', 'ایونٹس کی ترتیب', '', 'updated'),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true };
  };

  const softDeleteEventType: AppContextValue['softDeleteEventType'] = async (id) => {
    if (!can('event_categories', 'delete')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'softDeleteEventType permission');
      return { ok: false, error: msg };
    }
    const target = rawDb.eventTypes.find((e) => e.id === id);
    if (!target) {
      const msg = pushErrorToast({ code: 'PGRST116', message: 'Event not found' }, 'softDeleteEventType lookup');
      return { ok: false, error: msg };
    }
    const usedInBookings = rawDb.bookings.some(
      (b) =>
        !b.deleted_at &&
        b.hall_id === target.hall_id &&
        (b.event_type_id === id || b.event_type.trim().toLowerCase() === target.name_en.trim().toLowerCase())
    );
    if (usedInBookings) {
      const msg = ctxText(
        `"${target.name_en}" is used by existing bookings and cannot be deleted. Deactivate it instead.`,
        `"${target.name_ur || target.name_en}" موجودہ بکنگز میں استعمال ہو رہا ہے اس لیے حذف نہیں ہو سکتا۔ اسے غیر فعال کریں۔`
      );
      pushErrorToast({ code: '23503', message: msg }, 'softDeleteEventType in-use');
      return { ok: false, inUse: true, error: msg };
    }
    const deletedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('event_types')
        .update({ deleted_at: deletedAt, deleted_by: currentUser?.id || null })
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Delete returned no rows.' }, 'softDeleteEventType');
        return { ok: false, error: msg };
      }
    }
    setRawDb((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.map((e) => (e.id === id ? { ...e, deleted_at: deletedAt } : e)),
    }));
    appendAudit('DELETE', 'event_type', id, target.name_en, {}, target.hall_id);
    pushSuccessToast(
      formatBilingualEntitySaveDetail(langRef.current, 'Event', 'ایونٹ', target.name_en, target.name_ur, 'deleted'),
      { tab: 'recycle' }
    );
    return { ok: true };
  };

  const copyEventTaxonomyFromHall: AppContextValue['copyEventTaxonomyFromHall'] = async (sourceHallId) => {
    if (currentUser?.role !== 'super_admin' || !can('event_categories', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Only Super Admin can copy lists across halls.' }, 'copyEventTaxonomyFromHall permission');
      return { ok: false, error: msg };
    }
    if (!sourceHallId || sourceHallId === activeHallId) {
      const msg = pushErrorToast({ message: ctxText('Choose a different source hall.', 'کسی دوسرے ہال کا انتخاب کریں۔') }, 'copyEventTaxonomyFromHall');
      return { ok: false, error: msg };
    }
    const srcCats = rawDb.eventCategories.filter((c) => c.hall_id === sourceHallId && !c.deleted_at);
    const srcEvents = rawDb.eventTypes.filter((e) => e.hall_id === sourceHallId && !e.deleted_at);
    const existingCats = db.eventCategories.filter((c) => !c.deleted_at);
    const existingEvents = db.eventTypes.filter((e) => !e.deleted_at);

    const catMap = new Map<string, string>();
    const newCats: EventCategory[] = [];
    for (const sc of srcCats) {
      const match = existingCats.find((ec) => ec.name_en.trim().toLowerCase() === sc.name_en.trim().toLowerCase());
      if (match) {
        catMap.set(sc.id, match.id);
      } else {
        const nextId = makeUUID();
        catMap.set(sc.id, nextId);
        newCats.push({
          ...sc,
          id: nextId,
          hall_id: activeHallId,
          deleted_at: null,
        });
      }
    }

    const newEvents: EventTypeItem[] = [];
    for (const se of srcEvents) {
      const targetCatId = se.category_id ? catMap.get(se.category_id) || null : null;
      const alreadyExists = existingEvents.some(
        (ee) =>
          (ee.category_id || null) === targetCatId &&
          ee.name_en.trim().toLowerCase() === se.name_en.trim().toLowerCase()
      );
      if (!alreadyExists) {
        newEvents.push({
          ...se,
          id: makeUUID(),
          hall_id: activeHallId,
          category_id: targetCatId,
          deleted_at: null,
        });
      }
    }

    if (isSupabaseConfigured && supabase) {
      if (newCats.length > 0) {
        const { data, error } = await supabase.from('event_categories').insert(newCats).select('*');
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Failed copying event categories.' }, 'copyEventTaxonomyFromHall cats');
          return { ok: false, error: msg };
        }
      }
      if (newEvents.length > 0) {
        const { data, error } = await supabase.from('event_types').insert(newEvents).select('*');
        if (error || !data) {
          const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Failed copying events.' }, 'copyEventTaxonomyFromHall events');
          return { ok: false, error: msg };
        }
      }
    }

    setRawDb((prev) => ({
      ...prev,
      eventCategories: [...prev.eventCategories, ...newCats],
      eventTypes: [...prev.eventTypes, ...newEvents],
    }));

    const copiedCount = newCats.length + newEvents.length;
    const srcHall = rawDb.halls.find((h) => h.id === sourceHallId);
    appendAudit('IMPORT', 'event_categories', activeHallId, srcHall?.name || sourceHallId, {
      categories_added: newCats.length,
      events_added: newEvents.length,
    });
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Event Lists',
        'ایونٹ کی فہرست',
        `${copiedCount} ${ctxText('items copied', 'اشیاء کاپی ہوئیں')}`,
        'saved'
      ),
      { tab: 'settings', subTab: 'events' }
    );
    return { ok: true, copiedCount };
  };

  const saveFloorLabel: AppContextValue['saveFloorLabel'] = async (floor, options) => {
    if (!can('settings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveFloorLabel permission');
      return { ok: false, error: msg };
    }
    const existing = rawDb.floors.find(
      (f) => f.hall_id === activeHallId && (f.id === floor.id || f.floor_key === floor.floor_key)
    );
    const id = existing?.id || (isUuid(floor.id) ? floor.id : makeUUID());
    const record: FloorConfig = {
      id,
      hall_id: activeHallId,
      floor_key: floor.floor_key,
      name_en: floor.name_en.trim(),
      name_ur: floor.name_ur.trim(),
      sort_order: floor.sort_order ?? existing?.sort_order ?? 1,
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('floors')
        .upsert(record, { onConflict: 'hall_id,floor_key' })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Floor label save returned no rows.' }, 'saveFloorLabel');
        return { ok: false, error: msg };
      }
      Object.assign(record, data as FloorConfig);
    }
    setRawDb((prev) => {
      const existsInRaw = prev.floors.some(
        (f) => f.hall_id === activeHallId && f.floor_key === floor.floor_key
      );
      return {
        ...prev,
        floors: existsInRaw
          ? prev.floors.map((f) =>
              f.hall_id === activeHallId && f.floor_key === floor.floor_key ? record : f
            )
          : [...prev.floors, record],
      };
    });
    if (!options?.silentToast) {
      pushSuccessToast(
        formatBilingualEntitySaveDetail(
          langRef.current,
          'Floor',
          'فلور',
          record.name_en,
          record.name_ur,
          'updated'
        ),
        { tab: 'settings', subTab: 'pricing' }
      );
    }
    return { ok: true };
  };

  const saveFloorLabelsBatch: AppContextValue['saveFloorLabelsBatch'] = async (floorsList) => {
    if (!can('settings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'saveFloorLabelsBatch permission');
      return { ok: false, error: msg };
    }
    const records: FloorConfig[] = floorsList.map((floor, idx) => {
      const existing = rawDb.floors.find(
        (f) => f.hall_id === activeHallId && (f.id === floor.id || f.floor_key === floor.floor_key)
      );
      return {
        id: existing?.id || (isUuid(floor.id) ? floor.id : makeUUID()),
        hall_id: activeHallId,
        floor_key: floor.floor_key,
        name_en: floor.name_en.trim(),
        name_ur: floor.name_ur.trim(),
        sort_order: floor.sort_order ?? existing?.sort_order ?? idx + 1,
      };
    });

    if (records.length === 0) return { ok: true };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('floors')
        .upsert(records, { onConflict: 'hall_id,floor_key' })
        .select('*');
      if (error || !data || data.length === 0) {
        const msg = pushErrorToast(
          error || { code: 'RLS_0_ROWS', message: 'Floor labels batch save returned no rows.' },
          'saveFloorLabelsBatch'
        );
        return { ok: false, error: msg };
      }
    }

    setRawDb((prev) => {
      const nextFloors = [...prev.floors];
      for (const rec of records) {
        const idx = nextFloors.findIndex(
          (f) => f.hall_id === activeHallId && f.floor_key === rec.floor_key
        );
        if (idx >= 0) nextFloors[idx] = rec;
        else nextFloors.push(rec);
      }
      return { ...prev, floors: nextFloors };
    });

    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Floor Labels',
        'فلورز کے نام',
        pickLocalized(activeHall.name, activeHall.name_ur, langRef.current) || 'Hall',
        'updated'
      ),
      { tab: 'settings', subTab: 'pricing' }
    );
    return { ok: true };
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
    const isListAction = payload.action === 'list_users';
    const hasRequiredPerm = isListAction ? can('users', 'view') : can('users', 'edit');

    if ((callerRole !== 'super_admin' && callerRole !== 'admin') || !hasRequiredPerm) {
      const errTxt = ctxText(
        'You do not have permission to manage staff accounts.',
        'آپ کو عملہ اکاؤنٹس سنبھالنے کی اجازت نہیں ہے۔'
      );
      if (!isListAction) {
        const msg = pushErrorToast({ code: '42501', message: errTxt }, payload.action);
        return { ok: false, error: msg };
      }
      return { ok: false, error: errTxt };
    }

    if (!isSupabaseConfigured || !supabase) {
      const errTxt = ctxText(
        'App is not configured. Please contact the administrator.',
        'ایپ سیٹ اپ مکمل نہیں ہے۔ براہِ کرم منتظم سے رابطہ کریں۔'
      );
      if (!isListAction) {
        const msg = pushErrorToast({ message: errTxt }, payload.action);
        return { ok: false, error: msg };
      }
      return { ok: false, error: errTxt };
    }

    if (callerRole === 'admin') {
      if (payload.action === 'create_user' && payload.role && payload.role !== 'manager') {
        const msg = pushErrorToast({ code: '42501', message: 'Hall Admin can only create Manager accounts.' }, payload.action);
        return { ok: false, error: msg };
      }
      if (payload.hall_id && payload.hall_id !== currentUser?.hall_id) {
        const msg = pushErrorToast({ code: '42501', message: 'Hall Admin can only manage users in their own hall.' }, payload.action);
        return { ok: false, error: msg };
      }
      if (payload.permissions && payload.permissions.length > 0) {
        const delegationErr = validateAdminDelegation(payload.permissions);
        if (delegationErr) {
          const msg = pushErrorToast({ code: '42501', message: delegationErr }, payload.action);
          return { ok: false, error: msg };
        }
      }
    }

    try {
      const { data: sessData } = await supabase.auth.getSession();
      const accessToken = sessData.session?.access_token;
      if (!accessToken) {
        const errTxt = ctxText(
          'Your login session has expired. Please sign in again.',
          'آپ کا لاگ ان سیشن ختم ہو گیا ہے۔ براہِ کرم دوبارہ سائن ان کریں۔'
        );
        if (!isListAction) {
          const msg = pushErrorToast({ status: 401, message: errTxt }, payload.action);
          return { ok: false, error: msg };
        }
        return { ok: false, error: errTxt };
      }

      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: payload,
      });

      if (error) {
        const errName = (error as { name?: string }).name || '';
        const errMsg = error.message || '';
        if (
          errName === 'FunctionsFetchError' ||
          errMsg.includes('Failed to fetch') ||
          errMsg.includes('Failed to send a request to the Edge Function')
        ) {
          const netMsg = ctxText(
            'Function not reachable: check deployment and the Verify JWT setting',
            'فنکشن تک رسائی ممکن نہیں: براہِ کرم ڈیپلائمنٹ اور Verify JWT سیٹنگ چیک کریں'
          );
          if (!isListAction) {
            pushErrorToast(error, payload.action);
          }
          return { ok: false, error: netMsg };
        }

        let serverMsg = errMsg;
        let serverStatus: number | undefined;
        const ctx = (error as { context?: { status?: number; json?: () => Promise<{ error?: string }> } }).context;
        if (ctx) {
          if (typeof ctx.status === 'number') serverStatus = ctx.status;
          if (typeof ctx.json === 'function') {
            try {
              const parsed = await ctx.json();
              if (parsed?.error) serverMsg = parsed.error;
            } catch {
              // keep default error message
            }
          }
        }
        if (!isListAction) {
          const mappedMsg = pushErrorToast({ status: serverStatus, message: serverMsg }, payload.action);
          return { ok: false, error: serverMsg || mappedMsg };
        }
        return { ok: false, error: serverMsg || 'Failed to invoke manage-users.' };
      }

      if (!data?.ok) {
        const errMsg = data?.error || 'User management action failed.';
        if (!isListAction) {
          pushErrorToast({ message: errMsg }, payload.action);
        }
        return { ok: false, error: errMsg };
      }

      const resData = (data.data || data) as {
        profile?: UserProfile;
        permissions?: UserPermission[];
        users?: UserProfile[];
      };

      if (isListAction) {
        const fetchedUsers = Array.isArray(resData.users) ? resData.users.map(hydrateProfile) : [];
        const fetchedPerms = Array.isArray(resData.permissions) ? resData.permissions : [];
        setRawDb((prev) => ({
          ...prev,
          profiles: fetchedUsers.length > 0 ? fetchedUsers : prev.profiles,
          userPermissions: fetchedPerms.length > 0 ? fetchedPerms : prev.userPermissions,
        }));
        return { ok: true, users: fetchedUsers };
      }

      const savedProfile = resData.profile ? hydrateProfile(resData.profile) : undefined;
      const returnedPerms = Array.isArray(resData.permissions) ? resData.permissions : null;
      const targetId = savedProfile?.id || payload.userId;

      const existingTarget = targetId ? rawDb.profiles.find((p) => p.id === targetId) : undefined;
      const displayTarget =
        savedProfile?.full_name ||
        payload.full_name ||
        existingTarget?.full_name ||
        savedProfile?.email ||
        payload.email ||
        existingTarget?.email ||
        'Staff';

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

      if (payload.action === 'create_user') {
        pushSuccessToast(
          formatEntitySaveDetail(langRef.current, 'User', 'صارف', displayTarget, 'created'),
          { tab: 'users' }
        );
      } else if (payload.action === 'update_user') {
        pushSuccessToast(
          formatEntitySaveDetail(langRef.current, 'User', 'صارف', displayTarget, 'updated'),
          { tab: 'users' }
        );
      } else if (payload.action === 'reset_password') {
        pushSuccessToast(
          formatEntitySaveDetail(langRef.current, 'Password', 'پاس ورڈ', displayTarget, 'reset'),
          { tab: 'users' }
        );
      } else if (payload.action === 'set_permissions') {
        pushSuccessToast(
          formatEntitySaveDetail(langRef.current, 'Permissions', 'اختیارات', displayTarget, 'updated'),
          { tab: 'users' }
        );
      } else if (payload.action === 'deactivate_user') {
        pushSuccessToast(
          formatEntitySaveDetail(
            langRef.current,
            'User',
            'صارف',
            displayTarget,
            payload.is_active === false ? 'deactivated' : 'activated'
          ),
          { tab: 'users' }
        );
      }

      return { ok: true, profile: savedProfile };
    } catch (caughtErr) {
      if (!isListAction) {
        pushErrorToast(caughtErr, payload.action);
      }
      return {
        ok: false,
        error: ctxText(
          'Function not reachable: check deployment and the Verify JWT setting',
          'فنکشن تک رسائی ممکن نہیں: براہِ کرم ڈیپلائمنٹ اور Verify JWT سیٹنگ چیک کریں'
        ),
      };
    }
  };

  const updateSettings: AppContextValue['updateSettings'] = async (next) => {
    if (!can('settings', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'Permission denied' }, 'updateSettings permission');
      return { ok: false, error: msg };
    }
    const targetHallId = next.hall_id || activeHallId;
    const normalized: HallSettings = {
      ...next,
      hall_id: targetHallId,
      id: isUuid(next.id) ? next.id : makeUUID(),
    };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('hall_settings')
        .upsert(normalized, { onConflict: 'hall_id' })
        .select('*')
        .single();
      if (error || !data) {
        const msg = pushErrorToast(error || { code: 'RLS_0_ROWS', message: 'Settings save returned no rows.' }, 'updateSettings');
        return { ok: false, error: msg };
      }
      Object.assign(normalized, data as HallSettings);
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
    pushSuccessToast(
      formatEntitySaveDetail(
        langRef.current,
        'Settings',
        'سیٹنگز',
        pickLocalized(normalized.hall_name, normalized.hall_name_ur, langRef.current) || 'Hall',
        'updated'
      ),
      { tab: 'settings', subTab: 'hall' }
    );
    return { ok: true };
  };

  const importBookingsBatch: AppContextValue['importBookingsBatch'] = async (rows) => {
    if (!can('backup_import', 'edit')) {
      const msg = pushErrorToast({ code: '42501', message: 'You do not have Edit permission for Backup & Import.' }, 'importBookingsBatch permission');
      return {
        imported: 0,
        skipped: rows.length,
        errors: [msg],
      };
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
        errors.push(
          ctxText(
            `Row ${idx + 1}: Missing customer name or event date`,
            `قطار ${idx + 1}: گاہک کا نام یا تقریب کی تاریخ غائب ہے`
          )
        );
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
        errors.push(
          ctxText(
            `Row ${idx + 1} (${r.customer_name}): Conflict with ${conflict.booking_code} on ${r.event_date}`,
            `قطار ${idx + 1} (${r.customer_name}): ${r.event_date} کو ${conflict.booking_code} سے وقت ٹکرا رہا ہے`
          )
        );
        continue;
      }

      seqB += 1;
      seqI += 1;
      const id = makeUUID();
      const rawEventName = (r.event_type || 'Baraat').trim();
      const matchedEvent = db.eventTypes.find(
        (et) =>
          !et.deleted_at &&
          (et.name_en.toLowerCase() === rawEventName.toLowerCase() ||
            et.name_ur.toLowerCase() === rawEventName.toLowerCase())
      );
      const bk: Booking = {
        id,
        hall_id: activeHallId,
        booking_code: formatCode(activeHall.booking_code_prefix || 'MQ1', seqB),
        customer_name: r.customer_name,
        customer_address: r.customer_address || 'Karachi',
        customer_phone: r.customer_phone || '0300-0000000',
        customer_nic: r.customer_nic || '42101-0000000-0',
        customer_email: r.customer_email || '',
        event_category_id: matchedEvent?.category_id || r.event_category_id || null,
        event_type_id: matchedEvent?.id || r.event_type_id || null,
        event_type: matchedEvent?.name_en || rawEventName,
        event_other_name: r.event_other_name || '',
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
        const { data: inserted, error: insErr } = await supabase.from('bookings').insert(dbBookings).select('*');
        if (insErr || !inserted || inserted.length === 0) {
          const msg = pushErrorToast(
            insErr || { code: 'RLS_0_ROWS', message: 'Batch booking insert returned no rows.' },
            'importBookingsBatch bookings'
          );
          return { imported: 0, skipped: rows.length, errors: [msg, ...errors] };
        }
        createdBookings.splice(0, createdBookings.length, ...(inserted as Booking[]).map(hydrateBooking));
        if (createdItems.length > 0) {
          const { error: itemErr } = await supabase.from('booking_items').insert(createdItems).select('id');
          if (itemErr) {
            const msg = pushErrorToast(itemErr, 'importBookingsBatch booking_items');
            return { imported: 0, skipped: rows.length, errors: [msg, ...errors] };
          }
        }
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
      pushSuccessToast(
        formatEntitySaveDetail(langRef.current, 'Bookings', 'بکنگز', String(createdBookings.length), 'imported'),
        { tab: 'bookings' }
      );
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
        uploadHallAsset,
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
        toggleExpenseCategoryActive,
        reorderExpenseCategories,
        softDeleteExpenseCategory,
        saveExpenseSubcategory,
        toggleExpenseSubcategoryActive,
        reorderExpenseSubcategories,
        softDeleteExpenseSubcategory,
        copyExpenseTaxonomyFromHall,
        saveChargeCategory,
        saveChargeItem,
        softDeleteChargeItem,
        saveEventCategory,
        toggleEventCategoryActive,
        reorderEventCategories,
        softDeleteEventCategory,
        saveEventType,
        toggleEventTypeActive,
        reorderEventTypes,
        softDeleteEventType,
        copyEventTaxonomyFromHall,
        saveFloorLabel,
        saveFloorLabelsBatch,
        manageUserWithEdgeFunction,
        updateSettings,
        importBookingsBatch,
        toasts,
        dismissToast,
        pendingViewTarget,
        requestViewTarget,
        clearPendingViewTarget,
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
