export type UserRole = 'super_admin' | 'admin' | 'manager';

export type FloorName = 'First' | 'Second' | 'Third' | 'Full Hall';

export type BookingStatus = 'Tentative' | 'Confirmed' | 'Completed' | 'Cancelled';

export type PaymentMode = 'Cash' | 'Online';

export type Language = 'en' | 'ur';

export type ThemeMode = 'dark' | 'light';

export type LateChargeMethod = 'none' | 'fixed' | 'percent_rent' | 'per_hour' | 'per_30min';

export type DiscountType = 'fixed' | 'percent';

export type AttendanceStatus = 'Present' | 'Absent' | 'Half-day' | 'Leave';

export type DailyClosingStatus = 'submitted' | 'received' | 'flagged';

export type ApprovalRequestType =
  | 'discount'
  | 'cancellation'
  | 'refund'
  | 'reschedule_fee'
  | 'late_charge_override';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface FloorRatePair {
  weekday: number;
  weekend: number;
}

export interface RentSeasonRule {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  rates: Record<FloorName, FloorRatePair>;
}

export interface Hall {
  id: string;
  name: string;
  name_ur: string;
  address: string;
  address_ur: string;
  phone: string;
  email: string;
  logo_url: string;
  booking_code_prefix: string;
  invoice_prefix: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

import type { PermissionScreenKey, PermissionAction, ScreenPermissionEntry } from '../utils/permissions';
export type { PermissionScreenKey, PermissionAction, ScreenPermissionEntry };

export interface UserPermission {
  id: string;
  user_id: string;
  hall_id: string;
  screen_key: PermissionScreenKey;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  hall_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  preferred_theme?: ThemeMode | null;
  created_at: string;
}

export interface HallSettings {
  id: string | number;
  hall_id: string;
  hall_name: string;
  hall_name_ur: string;
  address: string;
  address_ur: string;
  phone: string;
  email: string;
  logo_url: string;
  invoice_format: string;
  tax_percent: number;
  default_rent_first: number;
  default_rent_second: number;
  default_rent_third: number;
  default_rent_full: number;
  weekday_weekend_rates: Record<FloorName, FloorRatePair>;
  rent_seasons: RentSeasonRule[];
  crate_deduction_per_returned: number;
  cleaning_buffer_minutes: number;
  late_grace_minutes: number;
  hide_discount_reason_on_invoice: boolean;
  terms_en: string;
  terms_ur: string;
  default_language: Language;
}

export interface Customer {
  id: string;
  hall_id: string;
  full_name: string;
  phone: string;
  nic: string;
  address: string;
  email: string;
  notes: string;
  deleted_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface EventTypeItem {
  id: string;
  hall_id: string;
  name_en: string;
  name_ur: string;
  color_hex: string;
  is_default: boolean;
  deleted_at: string | null;
}

export interface ChargeCategory {
  id: string;
  hall_id: string;
  name_en: string;
  name_ur: string;
  sort_order: number;
  deleted_at: string | null;
}

export interface ChargeCatalogItem {
  id: string;
  hall_id: string;
  category_id: string;
  name_en: string;
  name_ur: string;
  default_rate: number;
  unit_label: string;
  is_default_package: boolean;
  is_crate_service?: boolean;
  deleted_at: string | null;
}

export interface BookingItem {
  id: string;
  hall_id: string;
  booking_id: string;
  charge_id?: string | null;
  item_name: string;
  item_name_ur: string;
  category_name: string;
  quantity: number;
  rate: number;
  amount: number;
  is_package_included: boolean;
  is_crate_service?: boolean;
  deleted_at: string | null;
}

export interface InstallmentSchedule {
  id: string;
  hall_id: string;
  booking_id: string;
  title: string;
  due_date: string;
  amount: number;
  is_paid: boolean;
  deleted_at: string | null;
}

export interface RescheduleEntry {
  id: string;
  old_date: string;
  new_date: string;
  changed_by: string;
  changed_at: string;
  reason: string;
  fee: number;
}

export interface CancellationDetails {
  amount_paid_so_far: number;
  deduction_amount: number;
  refund_amount: number;
  reason: string;
  refund_date: string;
  refund_mode: PaymentMode;
  cancelled_by: string;
  cancelled_at: string;
}

export interface Booking {
  id: string;
  hall_id: string;
  customer_id?: string | null;
  booking_code: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_nic: string;
  customer_email?: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  floors: FloorName[];
  guests_count: number;
  hall_rent: number;
  notes: string;
  inspection_notes: string;
  status: BookingStatus;
  booking_date: string; // auto, fixed, not editable
  crates_ordered: number;
  crates_used: number;
  crates_returned: number;
  crate_rate: number;
  crate_handling_deduction_per_crate: number;
  crate_credit_amount: number;
  actual_end_time?: string | null;
  late_charge_method: LateChargeMethod;
  late_charge_value: number;
  late_charge_amount: number;
  late_charge_overridden?: boolean;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  discount_reason: string;
  reschedule_history: RescheduleEntry[];
  cancellation_details?: CancellationDetails | null;
  invoice_number: string;
  tax_percent: number;
  created_by?: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InvoiceRecord {
  id: string;
  hall_id: string;
  booking_id: string;
  invoice_number: string;
  standard_total: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  issued_at: string;
  created_by?: string;
  deleted_at: string | null;
}

export interface Payment {
  id: string;
  hall_id: string;
  receipt_number: string;
  booking_id: string;
  amount: number;
  payment_date: string;
  mode: PaymentMode;
  reference_no: string;
  received_by: string;
  notes: string;
  deleted_at: string | null;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  hall_id: string;
  name_en: string;
  name_ur: string;
  deleted_at: string | null;
}

export interface Employee {
  id: string;
  hall_id: string;
  full_name: string;
  phone: string;
  nic: string;
  role_title: string;
  employment_type: 'monthly' | 'daily_wage';
  base_rate: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface EmployeeAttendance {
  id: string;
  hall_id: string;
  employee_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  notes?: string;
}

export interface EmployeeAdvance {
  id: string;
  hall_id: string;
  employee_id: string;
  amount: number;
  advance_date: string;
  mode: PaymentMode;
  notes: string;
  is_settled: boolean;
  settled_month?: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  hall_id: string;
  category_id: string;
  category_name: string;
  booking_id?: string | null;
  employee_id?: string | null;
  amount: number;
  expense_date: string;
  payee: string;
  mode: PaymentMode;
  reference_no: string;
  notes: string;
  deleted_at: string | null;
  created_at: string;
}

export interface DailyClosingBookingBreakdown {
  booking_id: string;
  booking_code: string;
  customer_name: string;
  cash_amount: number;
  online_amount: number;
  total_amount: number;
  payment_count: number;
}

export interface DailyClosing {
  id: string;
  hall_id: string;
  closing_date: string;
  submitted_by?: string | null;
  submitted_by_name: string;
  submitted_at: string;
  cash_total: number;
  online_total: number;
  grand_total: number;
  bookings_breakdown: DailyClosingBookingBreakdown[];
  manager_notes: string;
  status: DailyClosingStatus;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  discrepancy_amount: number;
  admin_notes: string;
}

export interface ApprovalRequest {
  id: string;
  hall_id: string;
  booking_id: string;
  booking_code: string;
  customer_name: string;
  request_type: ApprovalRequestType;
  requested_by?: string | null;
  requested_by_name: string;
  requested_at: string;
  payload: Record<string, unknown>;
  reason: string;
  status: ApprovalStatus;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_note: string;
}

export interface AuditLog {
  id: string;
  hall_id: string;
  actor_name: string;
  actor_role: UserRole | string;
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'RESTORE'
    | 'IMPORT'
    | 'SETTINGS'
    | 'CANCEL'
    | 'RESCHEDULE'
    | 'PAYROLL'
    | 'CLOSING'
    | 'APPROVAL'
    | 'HALL'
    | 'USER'
    | 'PERMISSIONS';
  entity_type: string;
  entity_id: string;
  entity_label: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface HallSequenceCounters {
  booking: number;
  invoice: number;
  receipt: number;
}

export interface AppDatabase {
  halls: Hall[];
  hallSettings: HallSettings[];
  profiles: UserProfile[];
  userPermissions: UserPermission[];
  settings: HallSettings;
  customers: Customer[];
  eventTypes: EventTypeItem[];
  chargeCategories: ChargeCategory[];
  chargesCatalog: ChargeCatalogItem[];
  bookings: Booking[];
  invoices: InvoiceRecord[];
  bookingItems: BookingItem[];
  installments: InstallmentSchedule[];
  payments: Payment[];
  expenseCategories: ExpenseCategory[];
  employees: Employee[];
  attendance: EmployeeAttendance[];
  advances: EmployeeAdvance[];
  expenses: Expense[];
  dailyClosings: DailyClosing[];
  approvalRequests: ApprovalRequest[];
  auditLogs: AuditLog[];
  perHallSequences: Record<string, HallSequenceCounters>;
  sequences: HallSequenceCounters;
}
