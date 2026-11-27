import type { UserRole } from '../types';

export const PERMISSION_SCREEN_KEYS = [
  'dashboard',
  'calendar',
  'bookings',
  'customers',
  'payments',
  'daily_closing',
  'catalog',
  'expenses',
  'employees',
  'attendance',
  'salaries',
  'reports',
  'invoices',
  'reminders',
  'users',
  'settings',
  'recycle_bin',
  'audit_log',
  'backup_import',
] as const;

export type PermissionScreenKey = (typeof PERMISSION_SCREEN_KEYS)[number];

export type PermissionAction = 'view' | 'edit' | 'delete';

export interface ScreenPermissionEntry {
  screen_key: PermissionScreenKey;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface ScreenDefinition {
  key: PermissionScreenKey;
  labelEn: string;
  labelUr: string;
  sensitive: boolean;
  group: 'operations' | 'finance' | 'staff' | 'admin';
}

export const SENSITIVE_SCREEN_KEYS = new Set<PermissionScreenKey>([
  'expenses',
  'salaries',
  'reports',
  'audit_log',
  'recycle_bin',
  'users',
  'settings',
]);

export const SCREEN_DEFINITIONS: ScreenDefinition[] = [
  { key: 'dashboard', labelEn: 'Dashboard', labelUr: 'ڈیش بورڈ', sensitive: false, group: 'operations' },
  { key: 'calendar', labelEn: 'Calendar', labelUr: 'کیلنڈر', sensitive: false, group: 'operations' },
  { key: 'bookings', labelEn: 'Bookings', labelUr: 'بکنگز', sensitive: false, group: 'operations' },
  { key: 'customers', labelEn: 'Customers', labelUr: 'کسٹمرز', sensitive: false, group: 'operations' },
  { key: 'payments', labelEn: 'Payments & Receipts', labelUr: 'ادائیگیاں اور رسیدیں', sensitive: false, group: 'finance' },
  { key: 'invoices', labelEn: 'Invoices', labelUr: 'انوائسز', sensitive: false, group: 'finance' },
  { key: 'daily_closing', labelEn: 'Daily Closing', labelUr: 'روزانہ کلوزنگ', sensitive: false, group: 'finance' },
  { key: 'reminders', labelEn: 'Reminders', labelUr: 'یاددہانیاں', sensitive: false, group: 'operations' },
  { key: 'catalog', labelEn: 'Services & Charges Catalog', labelUr: 'سروسز و چارجز کیٹلاگ', sensitive: false, group: 'operations' },
  { key: 'employees', labelEn: 'Employees', labelUr: 'ملازمین', sensitive: false, group: 'staff' },
  { key: 'attendance', labelEn: 'Attendance', labelUr: 'حاضری', sensitive: false, group: 'staff' },
  { key: 'expenses', labelEn: 'Expenses', labelUr: 'اخراجات', sensitive: true, group: 'finance' },
  { key: 'salaries', labelEn: 'Salaries & Advances', labelUr: 'تنخواہیں اور ایڈوانس', sensitive: true, group: 'staff' },
  { key: 'reports', labelEn: 'Reports (Income, Expense, Profit)', labelUr: 'رپورٹس (آمدن، خرچ، منافع)', sensitive: true, group: 'finance' },
  { key: 'users', labelEn: 'Users', labelUr: 'صارفین', sensitive: true, group: 'admin' },
  { key: 'settings', labelEn: 'Settings', labelUr: 'ترتیبات', sensitive: true, group: 'admin' },
  { key: 'recycle_bin', labelEn: 'Recycle Bin', labelUr: 'ری سائیکل بن', sensitive: true, group: 'admin' },
  { key: 'audit_log', labelEn: 'Audit Log', labelUr: 'آڈٹ لاگ', sensitive: true, group: 'admin' },
  { key: 'backup_import', labelEn: 'Backup & Import', labelUr: 'بیک اپ اور امپورٹ', sensitive: false, group: 'admin' },
];

export type PermissionMatrixMap = Record<PermissionScreenKey, ScreenPermissionEntry>;

const ADMIN_EDIT_SCREENS = new Set<PermissionScreenKey>([
  'dashboard',
  'calendar',
  'bookings',
  'customers',
  'payments',
  'daily_closing',
  'catalog',
  'expenses',
  'employees',
  'attendance',
  'salaries',
  'reports',
  'invoices',
  'reminders',
  'users',
  'settings',
  'backup_import',
]);

const MANAGER_EDIT_SCREENS = new Set<PermissionScreenKey>([
  'dashboard',
  'calendar',
  'bookings',
  'customers',
  'payments',
  'daily_closing',
  'invoices',
  'reminders',
  'attendance',
]);

const MANAGER_VIEW_ONLY_SCREENS = new Set<PermissionScreenKey>([
  'catalog',
  'employees',
]);

export function getDefaultPermissionsForRole(role: UserRole): ScreenPermissionEntry[] {
  return PERMISSION_SCREEN_KEYS.map((screen_key) => {
    if (role === 'super_admin') {
      return { screen_key, can_view: true, can_edit: true, can_delete: true };
    }
    if (role === 'admin') {
      const enabled = ADMIN_EDIT_SCREENS.has(screen_key);
      return {
        screen_key,
        can_view: enabled,
        can_edit: enabled,
        can_delete: false, // Delete OFF by default for everyone except super_admin
      };
    }
    // manager
    const canEdit = MANAGER_EDIT_SCREENS.has(screen_key);
    const canView = canEdit || MANAGER_VIEW_ONLY_SCREENS.has(screen_key);
    return {
      screen_key,
      can_view: canView,
      can_edit: canEdit,
      can_delete: false, // Delete OFF by default for everyone except super_admin
    };
  });
}

export function toPermissionMatrix(
  entries: Array<{
    screen_key: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>,
  role?: UserRole
): PermissionMatrixMap {
  const map = {} as PermissionMatrixMap;
  const isSuperAdmin = role === 'super_admin';

  for (const screen_key of PERMISSION_SCREEN_KEYS) {
    map[screen_key] = {
      screen_key,
      can_view: isSuperAdmin,
      can_edit: isSuperAdmin,
      can_delete: isSuperAdmin,
    };
  }

  if (!isSuperAdmin) {
    for (const row of entries) {
      if ((PERMISSION_SCREEN_KEYS as readonly string[]).includes(row.screen_key)) {
        const key = row.screen_key as PermissionScreenKey;
        map[key] = {
          screen_key: key,
          can_view: Boolean(row.can_view),
          can_edit: Boolean(row.can_edit),
          can_delete: Boolean(row.can_delete),
        };
      }
    }
  }

  return map;
}

export function hasMatrixPermission(
  matrix: PermissionMatrixMap | null | undefined,
  role: UserRole | null | undefined,
  screenKey: PermissionScreenKey,
  action: PermissionAction
): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  if (!matrix) return false;
  const entry = matrix[screenKey];
  if (!entry) return false;
  if (action === 'view') return Boolean(entry.can_view);
  if (action === 'edit') return Boolean(entry.can_edit);
  return Boolean(entry.can_delete);
}

export interface PermissionDiffEntry {
  screen_key: PermissionScreenKey;
  before: { view: boolean; edit: boolean; delete: boolean };
  after: { view: boolean; edit: boolean; delete: boolean };
}

export function diffPermissionMatrices(
  oldEntries: ScreenPermissionEntry[],
  newEntries: ScreenPermissionEntry[]
): PermissionDiffEntry[] {
  const oldMap = new Map<PermissionScreenKey, ScreenPermissionEntry>();
  const newMap = new Map<PermissionScreenKey, ScreenPermissionEntry>();

  for (const e of oldEntries) oldMap.set(e.screen_key, e);
  for (const e of newEntries) newMap.set(e.screen_key, e);

  const diffs: PermissionDiffEntry[] = [];
  for (const key of PERMISSION_SCREEN_KEYS) {
    const o = oldMap.get(key) ?? { screen_key: key, can_view: false, can_edit: false, can_delete: false };
    const n = newMap.get(key) ?? { screen_key: key, can_view: false, can_edit: false, can_delete: false };
    if (
      Boolean(o.can_view) !== Boolean(n.can_view) ||
      Boolean(o.can_edit) !== Boolean(n.can_edit) ||
      Boolean(o.can_delete) !== Boolean(n.can_delete)
    ) {
      diffs.push({
        screen_key: key,
        before: { view: Boolean(o.can_view), edit: Boolean(o.can_edit), delete: Boolean(o.can_delete) },
        after: { view: Boolean(n.can_view), edit: Boolean(n.can_edit), delete: Boolean(n.can_delete) },
      });
    }
  }
  return diffs;
}
