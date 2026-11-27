-- ============================================================================
-- Marquee 1 – Hall Management System (Karachi, Pakistan)
-- Complete Supabase PostgreSQL Schema, Sequences, Triggers, RLS & Seed Data
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'management', 'finance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('Tentative', 'Confirmed', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_mode AS ENUM ('Cash', 'Online');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. SEQUENCES (Never reused, even after soft/hard deletion)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.booking_code_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1 INCREMENT 1;

-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- User profiles linked to Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'management',
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferred_theme TEXT CHECK (preferred_theme IN ('dark', 'light')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton Hall Settings
CREATE TABLE IF NOT EXISTS public.hall_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hall_name TEXT NOT NULL DEFAULT 'Marquee 1',
  hall_name_ur TEXT NOT NULL DEFAULT 'مارکی 1 بینکوئٹ ہال',
  address TEXT NOT NULL DEFAULT 'Plot 14-C, Main Shahrah-e-Faisal, Block 6 PECHS, Karachi',
  address_ur TEXT NOT NULL DEFAULT 'پلاٹ 14-سی، مین شاہراہِ فیصل، بلاک 6 پی ای سی ایچ ایس، کراچی',
  phone TEXT NOT NULL DEFAULT '0300-2198844',
  email TEXT NOT NULL DEFAULT 'bookings@marquee1.pk',
  logo_url TEXT DEFAULT '',
  invoice_format TEXT NOT NULL DEFAULT 'INV-{YYYY}-{0000}',
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  default_rent_first NUMERIC(12,2) NOT NULL DEFAULT 180000.00,
  default_rent_second NUMERIC(12,2) NOT NULL DEFAULT 165000.00,
  default_rent_third NUMERIC(12,2) NOT NULL DEFAULT 150000.00,
  default_rent_full NUMERIC(12,2) NOT NULL DEFAULT 450000.00,
  weekday_weekend_rates JSONB NOT NULL DEFAULT '{
    "First": {"weekday": 165000, "weekend": 195000},
    "Second": {"weekday": 150000, "weekend": 180000},
    "Third": {"weekday": 135000, "weekend": 165000},
    "Full Hall": {"weekday": 410000, "weekend": 480000}
  }'::jsonb,
  rent_seasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  crate_deduction_per_returned NUMERIC(12,2) NOT NULL DEFAULT 180.00,
  cleaning_buffer_minutes INT NOT NULL DEFAULT 60,
  late_grace_minutes INT NOT NULL DEFAULT 60,
  hide_discount_reason_on_invoice BOOLEAN NOT NULL DEFAULT false,
  terms_en TEXT NOT NULL DEFAULT '1. 50% advance is required to confirm booking. 2. Remaining balance must be cleared 7 days prior to the event date. 3. Returned cold drink crates are credited after deducting ice and handling charges. 4. Management is not responsible for personal valuables.',
  terms_ur TEXT NOT NULL DEFAULT '1۔ بکنگ کنفرم کرنے کے لیے 50 فیصد پیشگی ادائیگی لازمی ہے۔ 2۔ بقیہ رقم تقریب سے 7 روز قبل ادا کرنا ہوگی۔ 3۔ واپس کی گئی کولڈ ڈرنک کریٹس پر برف اور ہینڈلنگ کے اخراجات منہا کر کے رقم بل سے کم کی جائے گی۔ 4۔ ذاتی قیمتی اشیاء کی حفاظت مہمانوں کی اپنی ذمہ داری ہوگی۔',
  default_language TEXT NOT NULL DEFAULT 'en' CHECK (default_language IN ('en', 'ur')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Types
CREATE TABLE IF NOT EXISTS public.event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL UNIQUE,
  name_ur TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#06B6D4',
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Charge Categories
CREATE TABLE IF NOT EXISTS public.charge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL UNIQUE,
  name_ur TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Charges Catalog (No food/catering; Cold Drinks marked is_crate_service)
CREATE TABLE IF NOT EXISTS public.charges_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.charge_categories(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  default_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  unit_label TEXT NOT NULL DEFAULT 'Event',
  is_default_package BOOLEAN NOT NULL DEFAULT false,
  is_crate_service BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequence generator functions
CREATE OR REPLACE FUNCTION public.generate_booking_code()
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  yr TEXT;
BEGIN
  seq_val := nextval('public.booking_code_seq');
  yr := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'MQ1-' || yr || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  fmt TEXT;
  yr TEXT;
  out_num TEXT;
BEGIN
  seq_val := nextval('public.invoice_number_seq');
  yr := to_char(CURRENT_DATE, 'YYYY');
  SELECT invoice_format INTO fmt FROM public.hall_settings WHERE id = 1;
  IF fmt IS NULL THEN
    fmt := 'INV-{YYYY}-{0000}';
  END IF;
  out_num := replace(fmt, '{YYYY}', yr);
  out_num := replace(out_num, '{0000}', lpad(seq_val::TEXT, 4, '0'));
  RETURN out_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  yr TEXT;
BEGIN
  seq_val := nextval('public.receipt_number_seq');
  yr := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'RCP-' || yr || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT NOT NULL UNIQUE DEFAULT public.generate_booking_code(),
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_nic TEXT NOT NULL,
  customer_email TEXT,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  floors TEXT[] NOT NULL CHECK (array_length(floors, 1) >= 1),
  guests_count INT NOT NULL DEFAULT 250,
  hall_rent NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT DEFAULT '',
  status public.booking_status NOT NULL DEFAULT 'Tentative',
  booking_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  crates_ordered INT NOT NULL DEFAULT 0,
  crates_used INT NOT NULL DEFAULT 0,
  crates_returned INT NOT NULL DEFAULT 0,
  crate_rate NUMERIC(12,2) NOT NULL DEFAULT 1600.00,
  crate_handling_deduction_per_crate NUMERIC(12,2) NOT NULL DEFAULT 180.00,
  crate_credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  actual_end_time TIME,
  late_charge_method TEXT NOT NULL DEFAULT 'none' CHECK (late_charge_method IN ('none', 'fixed', 'percent_rent', 'per_hour', 'per_30min')),
  late_charge_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  late_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  late_charge_overridden BOOLEAN NOT NULL DEFAULT false,
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_reason TEXT DEFAULT '',
  reschedule_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  cancellation_details JSONB,
  invoice_number TEXT UNIQUE,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id)
);

-- Booking Line Items
CREATE TABLE IF NOT EXISTS public.booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES public.charges_catalog(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_name_ur TEXT DEFAULT '',
  category_name TEXT DEFAULT 'General',
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_package_included BOOLEAN NOT NULL DEFAULT false,
  is_crate_service BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Installment Schedules
CREATE TABLE IF NOT EXISTS public.installment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE DEFAULT public.generate_receipt_number(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mode public.payment_mode NOT NULL DEFAULT 'Cash',
  reference_no TEXT DEFAULT '',
  received_by TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL UNIQUE,
  name_ur TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employees (Monthly Salaried & Daily Wage Staff)
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nic TEXT,
  role_title TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('monthly', 'daily_wage')),
  base_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employee Daily Attendance
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half-day', 'Leave')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

-- Employee Salary Advances
CREATE TABLE IF NOT EXISTS public.employee_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mode public.payment_mode NOT NULL DEFAULT 'Cash',
  notes TEXT DEFAULT '',
  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_month TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses (optionally linked to a booking or employee)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payee TEXT NOT NULL,
  mode public.payment_mode NOT NULL DEFAULT 'Cash',
  reference_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Logs (Immutable history for Super Admin)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_label TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. TRIGGERS: DOUBLE-BOOKING PREVENTION, IMMUTABLE BOOKING DATE & AUDIT LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  conflict_record RECORD;
  buf_minutes INT;
  new_start_ts TIMESTAMP;
  new_end_ts TIMESTAMP;
  ex_start_ts TIMESTAMP;
  ex_end_ts TIMESTAMP;
  floors_conflict BOOLEAN;
BEGIN
  -- Skip validation if cancelled or soft-deleted
  IF NEW.status = 'Cancelled' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent modifying booking_date after initial insert
  IF TG_OP = 'UPDATE' AND NEW.booking_date IS DISTINCT FROM OLD.booking_date THEN
    NEW.booking_date := OLD.booking_date;
  END IF;

  SELECT COALESCE(cleaning_buffer_minutes, 60) INTO buf_minutes
  FROM public.hall_settings WHERE id = 1;
  IF buf_minutes IS NULL THEN
    buf_minutes := 60;
  END IF;

  -- Build full timestamps so overnight end_time <= start_time crosses midnight accurately
  new_start_ts := NEW.event_date + NEW.start_time;
  new_end_ts := NEW.event_date + NEW.end_time
    + CASE WHEN NEW.end_time <= NEW.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END;

  FOR conflict_record IN
    SELECT id, booking_code, event_date, floors, start_time, end_time
    FROM public.bookings
    WHERE event_date BETWEEN (NEW.event_date - 1) AND (NEW.event_date + 1)
      AND id <> NEW.id
      AND status <> 'Cancelled'
      AND deleted_at IS NULL
  LOOP
    floors_conflict := (
      'Full Hall' = ANY(NEW.floors)
      OR 'Full Hall' = ANY(conflict_record.floors)
      OR (NEW.floors && conflict_record.floors)
    );

    IF floors_conflict THEN
      ex_start_ts := conflict_record.event_date + conflict_record.start_time;
      ex_end_ts := conflict_record.event_date + conflict_record.end_time
        + CASE WHEN conflict_record.end_time <= conflict_record.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END;

      IF new_start_ts < (ex_end_ts + make_interval(mins => buf_minutes))
         AND ex_start_ts < (new_end_ts + make_interval(mins => buf_minutes)) THEN
        RAISE EXCEPTION 'Double-booking or % min cleaning buffer conflict with % (% % to % on overlapping floors)',
          buf_minutes,
          conflict_record.booking_code,
          conflict_record.event_date,
          to_char(conflict_record.start_time, 'HH24:MI'),
          to_char(conflict_record.end_time, 'HH24:MI');
      END IF;
    END IF;
  END LOOP;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_booking_overlap ON public.bookings;
CREATE TRIGGER trg_check_booking_overlap
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_booking_overlap();

-- Automatically assign invoice number when needed
CREATE OR REPLACE FUNCTION public.ensure_booking_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_invoice_number ON public.bookings;
CREATE TRIGGER trg_ensure_invoice_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_booking_invoice_number();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.profiles_is_empty()
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Auto-create profile row when a Supabase Auth user is created (first user becomes super_admin)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role public.user_role;
BEGIN
  IF public.profiles_is_empty() THEN
    assigned_role := 'super_admin';
  ELSE
    assigned_role := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role,
      'management'::public.user_role
    );
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(NEW.email, 'Staff'), '@', 1)),
    COALESCE(NEW.email, NEW.id::TEXT || '@marquee1.pk'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    assigned_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Profiles
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.current_user_role() = 'super_admin');
CREATE POLICY "First user can bootstrap super_admin profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'super_admin' AND public.profiles_is_empty());
CREATE POLICY "Users can update own theme preference" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = public.current_user_role() AND is_active = true);
CREATE POLICY "Super admin manages profiles" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- Hall Settings
CREATE POLICY "Authenticated read settings" ON public.hall_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Super admin updates settings" ON public.hall_settings
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- Event Types, Charge Categories, Charges Catalog
CREATE POLICY "Read active catalog" ON public.event_types
  FOR SELECT USING (auth.role() = 'authenticated' AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin'));
CREATE POLICY "Super admin manages event types" ON public.event_types
  FOR ALL USING (public.current_user_role() = 'super_admin');

CREATE POLICY "Read active charge categories" ON public.charge_categories
  FOR SELECT USING (auth.role() = 'authenticated' AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin'));
CREATE POLICY "Super admin manages charge categories" ON public.charge_categories
  FOR ALL USING (public.current_user_role() = 'super_admin');

CREATE POLICY "Read active charges catalog" ON public.charges_catalog
  FOR SELECT USING (auth.role() = 'authenticated' AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin'));
CREATE POLICY "Super admin manages charges catalog" ON public.charges_catalog
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- Bookings & Booking Items
CREATE POLICY "Authenticated read bookings" ON public.bookings
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Management & super_admin create bookings" ON public.bookings
  FOR INSERT WITH CHECK (public.current_user_role() IN ('super_admin', 'management'));
CREATE POLICY "Management & super_admin update bookings" ON public.bookings
  FOR UPDATE USING (public.current_user_role() IN ('super_admin', 'management'));

CREATE POLICY "Authenticated read booking items" ON public.booking_items
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Management & super_admin manage booking items" ON public.booking_items
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'management'));

-- Installments & Payments
CREATE POLICY "Authenticated read installments" ON public.installment_schedules
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Finance, management & super_admin manage installments" ON public.installment_schedules
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance', 'management'));

CREATE POLICY "Authenticated read payments" ON public.payments
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Finance & super_admin manage payments" ON public.payments
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

-- Expense Categories, Employees, Attendance, Advances & Expenses
CREATE POLICY "Finance & super_admin read expense categories" ON public.expense_categories
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'finance')
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Super admin & finance manage expense categories" ON public.expense_categories
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

CREATE POLICY "Finance & super_admin read employees" ON public.employees
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'finance')
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Finance & super_admin manage employees" ON public.employees
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

CREATE POLICY "Finance & super_admin read attendance" ON public.employee_attendance
  FOR SELECT USING (public.current_user_role() IN ('super_admin', 'finance'));
CREATE POLICY "Finance & super_admin manage attendance" ON public.employee_attendance
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

CREATE POLICY "Finance & super_admin read advances" ON public.employee_advances
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'finance')
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Finance & super_admin manage advances" ON public.employee_advances
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

CREATE POLICY "Finance & super_admin read expenses" ON public.expenses
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'finance')
    AND (deleted_at IS NULL OR public.current_user_role() = 'super_admin')
  );
CREATE POLICY "Finance & super_admin manage expenses" ON public.expenses
  FOR ALL USING (public.current_user_role() IN ('super_admin', 'finance'));

-- Audit Logs
CREATE POLICY "Only super_admin reads audit logs" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'super_admin');
CREATE POLICY "Authenticated inserts audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 6. SEED DATA & AUTH USER BACKFILL
-- ============================================================================

-- Backfill profiles for any existing auth.users without a profile row (first user gets super_admin)
INSERT INTO public.profiles (id, full_name, email, phone, role, is_active)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(u.email, 'Admin'), '@', 1)),
  COALESCE(u.email, u.id::TEXT || '@marquee1.pk'),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  CASE
    WHEN public.profiles_is_empty()
      AND u.id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
    THEN 'super_admin'::public.user_role
    ELSE 'management'::public.user_role
  END,
  true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hall_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Event Types
INSERT INTO public.event_types (name_en, name_ur, color_hex, is_default) VALUES
  ('Baraat', 'بارات', '#F59E0B', true),
  ('Mayun', 'مایوں', '#EAB308', true),
  ('Walima', 'ولیمہ', '#06B6D4', true),
  ('Birthday', 'سالگرہ', '#EC4899', true),
  ('Conference', 'کانفرنس', '#8B5CF6', true),
  ('Seminar', 'سیمینار', '#10B981', true),
  ('Other', 'دیگر تقریب', '#64748B', true)
ON CONFLICT (name_en) DO NOTHING;

-- Charge Categories (Hall Services only — no food/catering)
INSERT INTO public.charge_categories (name_en, name_ur, sort_order) VALUES
  ('Default Package', 'بنیادی پیکج', 1),
  ('Decor & Setup', 'سجاوٹ اور سیٹ اپ', 2),
  ('Hall Services & Setup', 'ہال سروسز اور سیٹ اپ', 3),
  ('Beverages', 'مشروبات', 4),
  ('Outdoor & Add-ons', 'آؤٹ ڈور اور اضافی سہولیات', 5)
ON CONFLICT (name_en) DO NOTHING;

-- Charges Catalog
INSERT INTO public.charges_catalog (category_id, name_en, name_ur, default_rate, unit_label, is_default_package, is_crate_service)
SELECT c.id, v.name_en, v.name_ur, v.default_rate, v.unit_label, v.is_default_package, v.is_crate_service
FROM (VALUES
  ('Default Package', 'Couple Entry', 'دولہا دلہن انٹری', 0, 'Package', true, false),
  ('Default Package', 'Smoke', 'اسموک ایفیکٹ', 0, 'Package', true, false),
  ('Default Package', 'Lighting', 'لائٹنگ سسٹم', 0, 'Package', true, false),
  ('Default Package', 'Sound', 'ساؤنڈ سسٹم', 0, 'Package', true, false),
  ('Decor & Setup', 'Partition', 'پارٹیشن / پردہ', 12000, 'Unit', false, false),
  ('Decor & Setup', 'Decoration', 'اسٹیج ڈیکوریشن', 45000, 'Event', false, false),
  ('Decor & Setup', 'Fresh Flowers', 'تازہ پھولوں کی سجاوٹ', 35000, 'Event', false, false),
  ('Decor & Setup', 'Artificial Flowers', 'مصنوعی پھولوں کی سجاوٹ', 18000, 'Event', false, false),
  ('Hall Services & Setup', 'Table Service', 'ٹیبل سروس ویٹرز', 15000, 'Crew', false, false),
  ('Hall Services & Setup', 'VIP Lounge Setup', 'وی آئی پی لاؤنج سیٹ اپ', 18000, 'Setup', false, false),
  ('Beverages', 'Cold Drinks', 'کولڈ ڈرنکس سروس', 1600, 'Crate', false, true),
  ('Outdoor & Add-ons', 'Outdoor Barbecue Space', 'آؤٹ ڈور باربی کیو اسپیس', 5000, 'Event', false, false)
) AS v(cat_name, name_en, name_ur, default_rate, unit_label, is_default_package, is_crate_service)
JOIN public.charge_categories c ON c.name_en = v.cat_name;

-- Expense Categories
INSERT INTO public.expense_categories (name_en, name_ur) VALUES
  ('Sound', 'ساؤنڈ سسٹم'),
  ('Decoration', 'ڈیکوریشن'),
  ('Florist', 'پھولوں کا خرچ'),
  ('Peon', 'چپراسی / ہیلپر'),
  ('Sweeper', 'سویپر / صفائی عملہ'),
  ('Waiters (Daily Wage)', 'ویٹرز یومیہ اجرت'),
  ('Utilities', 'بجلی و گیس بل'),
  ('Cleaning', 'صفائی ستھرائی'),
  ('Maintenance', 'مرمت و دیکھ بھال'),
  ('Salaries', 'ماہانہ تنخواہیں'),
  ('Other', 'دیگر اخراجات')
ON CONFLICT (name_en) DO NOTHING;

-- Sample Employees
INSERT INTO public.employees (full_name, phone, nic, role_title, employment_type, base_rate, is_active) VALUES
  ('Tariq Mahmood', '0301-8241109', '42101-7845123-1', 'Floor Supervisor', 'monthly', 55000, true),
  ('Kamran Qureshi', '0321-3940211', '42201-5519834-5', 'Sound & Lighting Technician', 'monthly', 42000, true),
  ('Salman Raza', '0333-2891044', '42301-9912301-3', 'Head Waiter (Table Service)', 'daily_wage', 2200, true),
  ('Bilal Ahmed', '0345-6120933', '42101-3409812-7', 'Banquet Waiter', 'daily_wage', 1800, true),
  ('Naveed Akhtar', '0312-9045118', '42401-6712390-9', 'Security Guard', 'monthly', 35000, true);

-- Sample Bookings (relative to CURRENT_DATE for live demonstration)
DO $$
DECLARE
  b1 UUID := gen_random_uuid();
  b2 UUID := gen_random_uuid();
  b3 UUID := gen_random_uuid();
  b4 UUID := gen_random_uuid();
  exp_sal_id UUID;
  exp_waiter_id UUID;
  exp_util_id UUID;
  exp_florist_id UUID;
BEGIN
  SELECT id INTO exp_sal_id FROM public.expense_categories WHERE name_en = 'Salaries' LIMIT 1;
  SELECT id INTO exp_waiter_id FROM public.expense_categories WHERE name_en = 'Waiters (Daily Wage)' LIMIT 1;
  SELECT id INTO exp_util_id FROM public.expense_categories WHERE name_en = 'Utilities' LIMIT 1;
  SELECT id INTO exp_florist_id FROM public.expense_categories WHERE name_en = 'Florist' LIMIT 1;

  INSERT INTO public.bookings (
    id, customer_name, customer_address, customer_phone, customer_nic, customer_email,
    event_type, event_date, start_time, end_time, floors, guests_count, hall_rent, notes, status,
    crates_ordered, crates_used, crates_returned, crate_rate, crate_handling_deduction_per_crate, crate_credit_amount,
    late_charge_method, late_charge_value, late_charge_amount,
    discount_type, discount_value, discount_amount, discount_reason
  ) VALUES
    (b1, 'Haji Abdul Rehman Siddiqui', 'House 42-B, DHA Phase 6, Karachi', '0300-8219940', '42301-4451290-1', 'rehman.siddiqui@example.pk',
     'Baraat', CURRENT_DATE, '20:00', '00:00', ARRAY['First', 'Second'], 650, 340000, 'VIP Baraat stage with fresh red roses and valet parking.', 'Confirmed',
     45, 38, 7, 1600, 180, 9940, 'none', 0, 0, 'fixed', 15000, 15000, 'Early booking family courtesy'),
    (b2, 'Dr. Ayesha Farooq', 'Flat 12, Clifton Block 4, Karachi', '0321-2948811', '42201-8891234-2', 'ayesha.farooq@example.pk',
     'Walima', CURRENT_DATE + 3, '20:00', '00:00', ARRAY['Full Hall'], 1100, 450000, 'Full marquee booking with outdoor BBQ courtyard.', 'Confirmed',
     60, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, ''),
    (b3, 'Zainab & Hamza Malik', 'B-19, Gulshan-e-Iqbal Block 13-D, Karachi', '0333-3109482', '42101-6620194-3', 'hamza.malik@example.pk',
     'Mayun', CURRENT_DATE + 5, '19:30', '23:30', ARRAY['Third'], 250, 150000, 'Yellow marigold theme with outdoor BBQ space.', 'Tentative',
     20, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, ''),
    (b4, 'Engro Tech Summit Karachi', 'Harbour Front, Clifton, Karachi', '0345-8201944', '42301-1190482-5', 'events@engrotech.example.pk',
     'Conference', CURRENT_DATE, '09:00', '15:00', ARRAY['First'], 300, 180000, 'Morning corporate seminar on First Floor.', 'Confirmed',
     15, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, '');

  -- Default package + add-on items for booking 1 (includes Cold Drinks crate service)
  INSERT INTO public.booking_items (booking_id, item_name, item_name_ur, category_name, quantity, rate, amount, is_package_included, is_crate_service) VALUES
    (b1, 'Couple Entry', 'دولہا دلہن انٹری', 'Default Package', 1, 0, 0, true, false),
    (b1, 'Smoke', 'اسموک ایفیکٹ', 'Default Package', 1, 0, 0, true, false),
    (b1, 'Lighting', 'لائٹنگ سسٹم', 'Default Package', 1, 0, 0, true, false),
    (b1, 'Sound', 'ساؤنڈ سسٹم', 'Default Package', 1, 0, 0, true, false),
    (b1, 'Fresh Flowers', 'تازہ پھولوں کی سجاوٹ', 'Decor & Setup', 1, 35000, 35000, false, false),
    (b1, 'Table Service', 'ٹیبل سروس ویٹرز', 'Hall Services & Setup', 2, 15000, 30000, false, false),
    (b1, 'Cold Drinks', 'کولڈ ڈرنکس سروس', 'Beverages', 1, 62060, 62060, false, true),
    (b1, 'Outdoor Barbecue Space', 'آؤٹ ڈور باربی کیو اسپیس', 'Outdoor & Add-ons', 1, 5000, 5000, false, false);

  -- Payments & Installments
  INSERT INTO public.payments (booking_id, amount, payment_date, mode, reference_no, received_by, notes) VALUES
    (b1, 200000, CURRENT_DATE - 20, 'Online', 'MEEZAN-TX-88412', 'Kashif Manager', 'Advance booking confirmation'),
    (b1, 150000, CURRENT_DATE - 3, 'Cash', 'CASH-092', 'Finance Desk', 'Second installment'),
    (b2, 225000, CURRENT_DATE - 15, 'Online', 'HBL-IBFT-55901', 'Finance Desk', '50% Advance for Full Hall');

  INSERT INTO public.installment_schedules (booking_id, title, due_date, amount, is_paid) VALUES
    (b1, 'Final Balance Settlement', CURRENT_DATE - 1, 117060, false),
    (b2, 'Second Installment', CURRENT_DATE + 1, 150000, false),
    (b3, 'Booking Confirmation Advance', CURRENT_DATE + 2, 75000, false);

  -- Expenses (with booking_id linkage for per-booking profit)
  INSERT INTO public.expenses (category_id, category_name, booking_id, amount, expense_date, payee, mode, reference_no, notes) VALUES
    (exp_util_id, 'Utilities', NULL, 94500, CURRENT_DATE - 5, 'K-Electric Commercial', 'Online', 'KE-2026-8841', 'Monthly electricity bill'),
    (exp_sal_id, 'Salaries', NULL, 55000, CURRENT_DATE - 4, 'Tariq Mahmood', 'Online', 'SAL-NOV-01', 'Monthly salary'),
    (exp_florist_id, 'Florist', b1, 22000, CURRENT_DATE - 1, 'Al-Madina Florist Saddar', 'Cash', 'FLR-210', 'Fresh red roses stage setup for Baraat'),
    (exp_waiter_id, 'Waiters (Daily Wage)', b1, 18000, CURRENT_DATE, 'Salman Raza & Waiter Team (10 Staff)', 'Cash', 'DW-441', 'Baraat event table service waiters');

  INSERT INTO public.audit_logs (actor_name, actor_role, action, entity_type, entity_id, entity_label, changes) VALUES
    ('System Seed', 'super_admin', 'CREATE', 'booking', b1::TEXT, 'MQ1-2026-0001', '{"status": "Confirmed", "event_type": "Baraat"}'::jsonb);
END $$;
