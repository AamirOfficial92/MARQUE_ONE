export type UserRole = 'super_admin' | 'management' | 'finance';

export type FloorName = 'First' | 'Second' | 'Third' | 'Full Hall';

export type BookingStatus = 'Tentative' | 'Confirmed' | 'Completed' | 'Cancelled';

export type PaymentMode = 'Cash' | 'Online';

export type Language = 'en' | 'ur';

export type ThemeMode = 'dark' | 'light';

export type LateChargeMethod = 'none' | 'fixed' | 'percent_rent' | 'per_hour' | 'per_30min';

export type DiscountType = 'fixed' | 'percent';

export type AttendanceStatus = 'Present' | 'Absent' | 'Half-day' | 'Leave';

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

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  preferred_theme?: ThemeMode | null;
  created_at: string;
}

export interface HallSettings {
  id: number;
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

export interface EventTypeItem {
  id: string;
  name_en: string;
  name_ur: string;
  color_hex: string;
  is_default: boolean;
  deleted_at: string | null;
}

export interface ChargeCategory {
  id: string;
  name_en: string;
  name_ur: string;
  sort_order: number;
  deleted_at: string | null;
}

export interface ChargeCatalogItem {
  id: string;
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

export interface Payment {
  id: string;
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
  name_en: string;
  name_ur: string;
  deleted_at: string | null;
}

export interface Employee {
  id: string;
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
  employee_id: string;
  attendance_date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  notes?: string;
}

export interface EmployeeAdvance {
  id: string;
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

export interface AuditLog {
  id: string;
  actor_name: string;
  actor_role: UserRole | string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'IMPORT' | 'SETTINGS' | 'CANCEL' | 'RESCHEDULE' | 'PAYROLL';
  entity_type: string;
  entity_id: string;
  entity_label: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface AppDatabase {
  profiles: UserProfile[];
  settings: HallSettings;
  eventTypes: EventTypeItem[];
  chargeCategories: ChargeCategory[];
  chargesCatalog: ChargeCatalogItem[];
  bookings: Booking[];
  bookingItems: BookingItem[];
  installments: InstallmentSchedule[];
  payments: Payment[];
  expenseCategories: ExpenseCategory[];
  employees: Employee[];
  attendance: EmployeeAttendance[];
  advances: EmployeeAdvance[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  sequences: {
    booking: number;
    invoice: number;
    receipt: number;
  };
}
