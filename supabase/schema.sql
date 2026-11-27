-- ============================================================================
-- Marquee 1 – Multi-Hall Management System (Karachi, Pakistan)
-- Complete Supabase PostgreSQL Schema, Multi-Hall Migration, Sequences,
-- Triggers, Strict Multi-Hall RLS & Seed Data
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS (With safe upgrade from legacy management/finance roles)
-- ============================================================================
DO $$
DECLARE
  has_legacy BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'user_role' AND n.nspname = 'public') THEN
    CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'manager');
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role' AND e.enumlabel IN ('management', 'finance')
    ) INTO has_legacy;

    IF has_legacy THEN
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      -- Drop legacy policies if present before altering column type
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT';
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT USING role::TEXT';
        EXECUTE 'UPDATE public.profiles SET role = ''manager'' WHERE role = ''management''';
        EXECUTE 'UPDATE public.profiles SET role = ''admin'' WHERE role = ''finance''';
      END IF;
      DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
      DROP TYPE public.user_role CASCADE;
      CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'manager');
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING (CASE WHEN role IN (''super_admin'',''admin'',''manager'') THEN role::public.user_role ELSE ''manager''::public.user_role END)';
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT ''manager''::public.user_role';
      END IF;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('Tentative', 'Confirmed', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_mode AS ENUM ('Cash', 'Online');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. HALLS & PER-HALL SEQUENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_ur TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_url TEXT DEFAULT '',
  booking_code_prefix TEXT NOT NULL DEFAULT 'MQ1',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_halls_id ON public.halls (id);

-- Seed first default hall "Marquee 1" immediately so migrations can reference it
INSERT INTO public.halls (
  id, name, name_ur, address, address_ur, phone, email, logo_url, booking_code_prefix, invoice_prefix, is_active
) VALUES (
  '11111111-1111-4111-8111-111111111101',
  'Marquee 1',
  'مارکی 1 بینکوئٹ ہال',
  'Plot 14-C, Main Shahrah-e-Faisal, Block 6 PECHS, Karachi',
  'پلاٹ 14-سی، مین شاہراہِ فیصل، بلاک 6 پی ای سی ایچ ایس، کراچی',
  '0300-2198844',
  'bookings@marquee1.pk',
  '/src/assets/images/marquee_logo_1795763096758.jpg',
  'MQ1',
  'INV',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Per-hall sequence counters (never reused, unique per hall)
CREATE TABLE IF NOT EXISTS public.hall_sequences (
  hall_id UUID PRIMARY KEY REFERENCES public.halls(id) ON DELETE CASCADE,
  booking_seq BIGINT NOT NULL DEFAULT 0,
  invoice_seq BIGINT NOT NULL DEFAULT 0,
  receipt_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_sequences_hall_id ON public.hall_sequences (hall_id);

INSERT INTO public.hall_sequences (hall_id, booking_seq, invoice_seq, receipt_seq)
VALUES ('11111111-1111-4111-8111-111111111101', 0, 0, 0)
ON CONFLICT (hall_id) DO NOTHING;

-- ============================================================================
-- 3. CORE TABLES (All scoped by hall_id)
-- ============================================================================

-- User profiles linked to Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hall_id UUID REFERENCES public.halls(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'manager',
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferred_theme TEXT CHECK (preferred_theme IN ('dark', 'light')),
  preferred_language TEXT CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'ur')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Floors (Bilingual floor labels per Hall; preserves key 'First' | 'Second' | 'Third' | 'Full Hall')
CREATE TABLE IF NOT EXISTS public.floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  floor_key TEXT NOT NULL CHECK (floor_key IN ('First', 'Second', 'Third', 'Full Hall')),
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hall_id, floor_key)
);

-- Per-hall Settings
CREATE TABLE IF NOT EXISTS public.hall_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID UNIQUE REFERENCES public.halls(id) ON DELETE CASCADE,
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

-- Customers (Per Hall)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nic TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Types (Per Hall)
CREATE TABLE IF NOT EXISTS public.event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#06B6D4',
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hall_id, name_en)
);

-- Charge Categories (Per Hall)
CREATE TABLE IF NOT EXISTS public.charge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hall_id, name_en)
);

-- Charges Catalog (Per Hall)
CREATE TABLE IF NOT EXISTS public.charges_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  category_id UUID REFERENCES public.charge_categories(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  default_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  unit_label TEXT NOT NULL DEFAULT 'Event',
  unit_label_ur TEXT NOT NULL DEFAULT '',
  is_default_package BOOLEAN NOT NULL DEFAULT false,
  is_crate_service BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-Hall Code Generators (Atomic, unique per hall)
CREATE OR REPLACE FUNCTION public.generate_booking_code(p_hall_id UUID DEFAULT '11111111-1111-4111-8111-111111111101')
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  prefix TEXT;
  yr TEXT;
BEGIN
  INSERT INTO public.hall_sequences (hall_id, booking_seq)
  VALUES (p_hall_id, 1)
  ON CONFLICT (hall_id) DO UPDATE
    SET booking_seq = public.hall_sequences.booking_seq + 1,
        updated_at = now()
  RETURNING booking_seq INTO seq_val;

  SELECT COALESCE(NULLIF(booking_code_prefix, ''), 'MQ1') INTO prefix
  FROM public.halls WHERE id = p_hall_id;
  IF prefix IS NULL THEN prefix := 'MQ1'; END IF;

  yr := to_char(CURRENT_DATE, 'YYYY');
  RETURN prefix || '-' || yr || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_hall_id UUID DEFAULT '11111111-1111-4111-8111-111111111101')
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  prefix TEXT;
  yr TEXT;
BEGIN
  INSERT INTO public.hall_sequences (hall_id, invoice_seq)
  VALUES (p_hall_id, 1)
  ON CONFLICT (hall_id) DO UPDATE
    SET invoice_seq = public.hall_sequences.invoice_seq + 1,
        updated_at = now()
  RETURNING invoice_seq INTO seq_val;

  SELECT COALESCE(NULLIF(invoice_prefix, ''), 'INV') INTO prefix
  FROM public.halls WHERE id = p_hall_id;
  IF prefix IS NULL THEN prefix := 'INV'; END IF;

  yr := to_char(CURRENT_DATE, 'YYYY');
  RETURN prefix || '-' || yr || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_hall_id UUID DEFAULT '11111111-1111-4111-8111-111111111101')
RETURNS TEXT AS $$
DECLARE
  seq_val BIGINT;
  prefix TEXT;
  yr TEXT;
BEGIN
  INSERT INTO public.hall_sequences (hall_id, receipt_seq)
  VALUES (p_hall_id, 1)
  ON CONFLICT (hall_id) DO UPDATE
    SET receipt_seq = public.hall_sequences.receipt_seq + 1,
        updated_at = now()
  RETURNING receipt_seq INTO seq_val;

  SELECT COALESCE(NULLIF(booking_code_prefix, ''), 'MQ1') INTO prefix
  FROM public.halls WHERE id = p_hall_id;
  IF prefix IS NULL THEN prefix := 'MQ1'; END IF;

  yr := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'RCP-' || prefix || '-' || yr || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Bookings (Per Hall)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  booking_code TEXT NOT NULL,
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
  inspection_notes TEXT DEFAULT '',
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
  invoice_number TEXT,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  UNIQUE (hall_id, booking_code),
  UNIQUE (hall_id, invoice_number)
);

-- Invoices Table (Per Hall)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  standard_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  UNIQUE (hall_id, invoice_number)
);

-- Booking Line Items
CREATE TABLE IF NOT EXISTS public.booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  receipt_number TEXT NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hall_id, receipt_number)
);

-- Expense Categories (Per Hall)
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hall_id, name_en)
);

-- Employees (Per Hall)
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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

-- Employee Daily Attendance (Per Hall)
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half-day', 'Leave')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

-- Employee Salary Advances (Per Hall)
CREATE TABLE IF NOT EXISTS public.employee_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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

-- Expenses (Per Hall)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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

-- Daily Cash Closings (Per Hall)
CREATE TABLE IF NOT EXISTS public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  closing_date DATE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id),
  submitted_by_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cash_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  online_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  bookings_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  manager_notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'received', 'flagged')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  discrepancy_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  admin_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manager Approval Requests (Discounts, Cancellations, Refunds, Reschedule Fees, Late Charge Overrides)
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('discount', 'cancellation', 'refund', 'reschedule_fee', 'late_charge_override')),
  requested_by UUID REFERENCES auth.users(id),
  requested_by_name TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT DEFAULT ''
);

-- Audit Logs (Per Hall)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
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
-- 4. IDEMPOTENT MULTI-HALL MIGRATION FOR PRE-EXISTING INSTALLATIONS
-- ============================================================================
DO $$
DECLARE
  mq1_id UUID := '11111111-1111-4111-8111-111111111101';
  tbl TEXT;
BEGIN
  -- Add hall_id column if upgrading an older database that lacked it
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles', 'hall_settings', 'event_types', 'charge_categories', 'charges_catalog',
      'bookings', 'booking_items', 'installment_schedules', 'payments',
      'expense_categories', 'employees', 'employee_attendance', 'employee_advances',
      'expenses', 'audit_logs'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE', tbl);
    IF tbl <> 'profiles' THEN
      EXECUTE format('UPDATE public.%I SET hall_id = $1 WHERE hall_id IS NULL', tbl) USING mq1_id;
    END IF;
  END LOOP;

  -- Assign existing non-super_admin profiles without hall_id to Marquee 1
  UPDATE public.profiles SET hall_id = mq1_id WHERE hall_id IS NULL AND role IN ('admin', 'manager');

  -- Add inspection_notes & customer_id to bookings if upgrading
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS inspection_notes TEXT DEFAULT '';

  -- Ensure hall_settings singleton row id=1 (if any) is migrated to UUID/hall_id
  UPDATE public.hall_settings SET hall_id = mq1_id WHERE hall_id IS NULL;

  -- Drop global unique constraints if upgrading and replace with per-hall unique constraints
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_code_key;
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_invoice_number_key;
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_receipt_number_key;
  ALTER TABLE public.event_types DROP CONSTRAINT IF EXISTS event_types_name_en_key;
  ALTER TABLE public.charge_categories DROP CONSTRAINT IF EXISTS charge_categories_name_en_key;
  ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_en_key;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_id ON public.profiles(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_settings_hall_id ON public.hall_settings(hall_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_hall_code ON public.bookings(hall_id, booking_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_hall_invoice ON public.bookings(hall_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_hall_number ON public.invoices(hall_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_hall_receipt ON public.payments(hall_id, receipt_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_types_hall_name ON public.event_types(hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_categories_hall_name ON public.charge_categories(hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_hall_name ON public.expense_categories(hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_attendance_emp_date ON public.employee_attendance(employee_id, attendance_date);

-- ============================================================================
-- 5. TRIGGERS: PER-HALL CODES, OVERLAP CHECK & INVOICE SYNC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_booking_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hall_id IS NULL THEN
    NEW.hall_id := '11111111-1111-4111-8111-111111111101';
  END IF;
  IF NEW.booking_code IS NULL OR NEW.booking_code = '' THEN
    NEW.booking_code := public.generate_booking_code(NEW.hall_id);
  END IF;
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number(NEW.hall_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_invoice_number ON public.bookings;
DROP TRIGGER IF EXISTS trg_assign_booking_codes ON public.bookings;
CREATE TRIGGER trg_assign_booking_codes
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_booking_codes();

CREATE OR REPLACE FUNCTION public.assign_payment_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hall_id IS NULL THEN
    NEW.hall_id := '11111111-1111-4111-8111-111111111101';
  END IF;
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
    NEW.receipt_number := public.generate_receipt_number(NEW.hall_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_payment_receipt ON public.payments;
CREATE TRIGGER trg_assign_payment_receipt
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_payment_receipt();

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
  IF NEW.status = 'Cancelled' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.booking_date IS DISTINCT FROM OLD.booking_date THEN
    NEW.booking_date := OLD.booking_date;
  END IF;

  SELECT COALESCE(cleaning_buffer_minutes, 60) INTO buf_minutes
  FROM public.hall_settings WHERE hall_id = NEW.hall_id LIMIT 1;
  IF buf_minutes IS NULL THEN
    buf_minutes := 60;
  END IF;

  new_start_ts := NEW.event_date + NEW.start_time;
  new_end_ts := NEW.event_date + NEW.end_time
    + CASE WHEN NEW.end_time <= NEW.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END;

  FOR conflict_record IN
    SELECT id, booking_code, event_date, floors, start_time, end_time
    FROM public.bookings
    WHERE hall_id = NEW.hall_id
      AND event_date BETWEEN (NEW.event_date - 1) AND (NEW.event_date + 1)
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

-- ============================================================================
-- 6. PER-USER PERMISSIONS, HELPER FUNCTIONS & ROW LEVEL SECURITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  screen_key TEXT NOT NULL CHECK (screen_key IN (
    'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
    'expenses','employees','attendance','salaries','reports','invoices','reminders',
    'users','settings','recycle_bin','audit_log','backup_import'
  )),
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, hall_id, screen_key)
);

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101';
UPDATE public.user_permissions SET hall_id = '11111111-1111-4111-8111-111111111101'::UUID WHERE hall_id IS NULL;
DROP INDEX IF EXISTS public.idx_user_permissions_lookup;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permissions_user_hall_screen
  ON public.user_permissions(user_id, hall_id, screen_key);

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_hall_id()
RETURNS UUID AS $$
  SELECT hall_id FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_hall(target_hall_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.current_user_role() = 'super_admin'
    OR (
      public.current_user_role() IN ('admin', 'manager')
      AND target_hall_id IS NOT NULL
      AND target_hall_id = public.current_user_hall_id()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_permission(p_screen_key TEXT, p_action TEXT DEFAULT 'view')
RETURNS BOOLEAN AS $$
DECLARE
  v_role public.user_role;
  v_hall_id UUID;
  v_active BOOLEAN;
  v_perm RECORD;
BEGIN
  SELECT p.role, p.hall_id, p.is_active
    INTO v_role, v_hall_id, v_active
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  IF v_hall_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT up.can_view, up.can_edit, up.can_delete
    INTO v_perm
  FROM public.user_permissions up
  WHERE up.user_id = auth.uid()
    AND up.hall_id = v_hall_id
    AND up.screen_key = p_screen_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_action = 'view' THEN
    RETURN COALESCE(v_perm.can_view, false);
  ELSIF p_action = 'edit' THEN
    RETURN COALESCE(v_perm.can_edit, false);
  ELSIF p_action = 'delete' THEN
    RETURN COALESCE(v_perm.can_delete, false);
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.seed_default_permissions_for_user(
  p_user_id UUID,
  p_hall_id UUID,
  p_role public.user_role
)
RETURNS VOID AS $$
DECLARE
  v_hall UUID := COALESCE(p_hall_id, '11111111-1111-4111-8111-111111111101'::UUID);
  v_screen TEXT;
  v_view BOOLEAN;
  v_edit BOOLEAN;
  v_del BOOLEAN;
  all_screens TEXT[] := ARRAY[
    'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
    'expenses','employees','attendance','salaries','reports','invoices','reminders',
    'users','settings','recycle_bin','audit_log','backup_import'
  ];
BEGIN
  FOREACH v_screen IN ARRAY all_screens LOOP
    IF p_role = 'super_admin' THEN
      v_view := true;
      v_edit := true;
      v_del := true;
    ELSIF p_role = 'admin' THEN
      v_view := v_screen NOT IN ('recycle_bin', 'audit_log');
      v_edit := v_screen NOT IN ('recycle_bin', 'audit_log');
      v_del := false;
    ELSE
      v_edit := v_screen IN (
        'dashboard','calendar','bookings','customers','payments',
        'daily_closing','invoices','reminders','attendance'
      );
      v_view := v_edit OR v_screen IN ('catalog', 'employees');
      v_del := false;
    END IF;

    INSERT INTO public.user_permissions (user_id, hall_id, screen_key, can_view, can_edit, can_delete)
    VALUES (p_user_id, v_hall, v_screen, v_view, v_edit, v_del)
    ON CONFLICT (user_id, hall_id, screen_key) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.profiles_is_empty()
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Auto-create profile row and default template permissions when a Supabase Auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role public.user_role;
  assigned_hall UUID;
BEGIN
  IF public.profiles_is_empty() THEN
    assigned_role := 'super_admin';
    assigned_hall := '11111111-1111-4111-8111-111111111101'::UUID;
  ELSE
    assigned_role := 'manager'::public.user_role;
    assigned_hall := '11111111-1111-4111-8111-111111111101'::UUID;
  END IF;

  INSERT INTO public.profiles (id, hall_id, full_name, email, phone, role, is_active)
  VALUES (
    NEW.id,
    assigned_hall,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(NEW.email, 'Staff'), '@', 1)),
    COALESCE(NEW.email, NEW.id::TEXT || '@marquee1.pk'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    assigned_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_default_permissions_for_user(NEW.id, assigned_hall, assigned_role);

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

CREATE OR REPLACE FUNCTION public.guard_profile_insert_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF auth.uid() IS NOT NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Profiles can only be provisioned by the server.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_profile_insert_hierarchy ON public.profiles;
CREATE TRIGGER trg_guard_profile_insert_hierarchy
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_insert_hierarchy();

CREATE OR REPLACE FUNCTION public.guard_profile_hierarchy_and_self()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_role public.user_role;
  v_caller_hall UUID;
  v_caller_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Users cannot change their own role.' USING ERRCODE = '42501';
    END IF;
    IF NEW.hall_id IS DISTINCT FROM OLD.hall_id THEN
      RAISE EXCEPTION 'Users cannot change their own hall assignment.' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Users cannot change their own active status.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT p.role, p.hall_id, p.is_active
    INTO v_caller_role, v_caller_hall, v_caller_active
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND OR v_caller_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Caller profile is missing or inactive.' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF v_caller_role = 'admin' THEN
    IF NOT public.has_permission('users', 'edit') THEN
      RAISE EXCEPTION 'Missing Users edit permission.' USING ERRCODE = '42501';
    END IF;
    IF OLD.role IS DISTINCT FROM 'manager'::public.user_role
       OR NEW.role IS DISTINCT FROM 'manager'::public.user_role THEN
      RAISE EXCEPTION 'Hall Admin can only manage Manager accounts.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_hall IS NULL
       OR OLD.hall_id IS DISTINCT FROM v_caller_hall
       OR NEW.hall_id IS DISTINCT FROM v_caller_hall THEN
      RAISE EXCEPTION 'Hall Admin can only manage users within their own hall.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Insufficient privileges to update user profiles.' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_profile_hierarchy_and_self ON public.profiles;
CREATE TRIGGER trg_guard_profile_hierarchy_and_self
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_hierarchy_and_self();

CREATE OR REPLACE FUNCTION public.guard_user_permissions_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_role public.user_role;
  v_caller_hall UUID;
  v_caller_active BOOLEAN;
  v_target_user_id UUID;
  v_target_role public.user_role;
  v_target_hall UUID;
BEGIN
  IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_target_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;

  IF v_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Users cannot modify their own permissions.' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, p.hall_id, p.is_active
    INTO v_caller_role, v_caller_hall, v_caller_active
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND OR v_caller_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Caller profile is missing or inactive.' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role = 'super_admin' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_caller_role = 'admin' THEN
    IF NOT public.has_permission('users', 'edit') THEN
      RAISE EXCEPTION 'Missing Users edit permission.' USING ERRCODE = '42501';
    END IF;

    SELECT tp.role, tp.hall_id
      INTO v_target_role, v_target_hall
    FROM public.profiles tp
    WHERE tp.id = v_target_user_id;

    IF NOT FOUND
       OR v_target_role IS DISTINCT FROM 'manager'::public.user_role
       OR v_caller_hall IS NULL
       OR v_target_hall IS DISTINCT FROM v_caller_hall THEN
      RAISE EXCEPTION 'Hall Admin can only modify permissions for Managers in their own hall.'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
      IF OLD.hall_id IS DISTINCT FROM v_caller_hall THEN
        RAISE EXCEPTION 'Hall Admin cannot remove permissions outside their own hall.'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;

    IF NEW.hall_id IS DISTINCT FROM v_caller_hall THEN
      RAISE EXCEPTION 'Hall Admin cannot grant permissions for another hall.' USING ERRCODE = '42501';
    END IF;

    IF (NEW.can_view AND NOT public.has_permission(NEW.screen_key, 'view'))
       OR (NEW.can_edit AND NOT public.has_permission(NEW.screen_key, 'edit'))
       OR (NEW.can_delete AND NOT public.has_permission(NEW.screen_key, 'delete')) THEN
      RAISE EXCEPTION 'Hall Admin cannot grant permissions they do not personally hold.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Insufficient privileges to modify permissions.' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_user_permissions_hierarchy ON public.user_permissions;
CREATE TRIGGER trg_guard_user_permissions_hierarchy
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_permissions_hierarchy();

-- Enable RLS on all tables
ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies before recreating cleanly (idempotent re-runs)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- HALLS
CREATE POLICY "Users read permitted halls" ON public.halls
  FOR SELECT USING (
    public.current_user_role() = 'super_admin'
    OR id = public.current_user_hall_id()
  );
CREATE POLICY "Super admin manages halls" ON public.halls
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- HALL SEQUENCES
CREATE POLICY "Read hall sequences" ON public.hall_sequences
  FOR SELECT USING (public.can_access_hall(hall_id));
CREATE POLICY "Super admin manages hall sequences" ON public.hall_sequences
  FOR ALL USING (public.current_user_role() = 'super_admin');

-- PROFILES
CREATE POLICY "Read profiles by users view or own profile" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.current_user_role() = 'super_admin'
    OR (hall_id = public.current_user_hall_id() AND public.has_permission('users', 'view'))
  );
CREATE POLICY "Users update own theme preference" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.current_user_role()
    AND hall_id IS NOT DISTINCT FROM public.current_user_hall_id()
    AND is_active = true
  );
CREATE POLICY "Super admin manages all profiles" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');
CREATE POLICY "Admin with users edit manages managers in own hall" ON public.profiles
  FOR UPDATE USING (
    public.current_user_role() = 'admin'
    AND hall_id = public.current_user_hall_id()
    AND role = 'manager'
    AND id <> auth.uid()
    AND public.has_permission('users', 'edit')
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND hall_id = public.current_user_hall_id()
    AND role = 'manager'
    AND id <> auth.uid()
    AND public.has_permission('users', 'edit')
  );

-- USER PERMISSIONS
CREATE POLICY "Read own or permitted hall user permissions" ON public.user_permissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.current_user_role() = 'super_admin'
    OR (
      hall_id = public.current_user_hall_id()
      AND public.has_permission('users', 'view')
    )
  );
CREATE POLICY "Super admin manages all user permissions" ON public.user_permissions
  FOR ALL USING (public.current_user_role() = 'super_admin' AND user_id <> auth.uid())
  WITH CHECK (public.current_user_role() = 'super_admin' AND user_id <> auth.uid());
CREATE POLICY "Admin with users edit manages subordinate hall permissions" ON public.user_permissions
  FOR ALL USING (
    public.current_user_role() = 'admin'
    AND hall_id = public.current_user_hall_id()
    AND public.has_permission('users', 'edit')
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles tp
      WHERE tp.id = user_permissions.user_id
        AND tp.hall_id = public.current_user_hall_id()
        AND tp.role = 'manager'
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND hall_id = public.current_user_hall_id()
    AND public.has_permission('users', 'edit')
    AND user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles tp
      WHERE tp.id = user_permissions.user_id
        AND tp.hall_id = public.current_user_hall_id()
        AND tp.role = 'manager'
    )
    AND (NOT can_view OR public.has_permission(screen_key, 'view'))
    AND (NOT can_edit OR public.has_permission(screen_key, 'edit'))
    AND (NOT can_delete OR public.has_permission(screen_key, 'delete'))
  );

-- HALL SETTINGS
CREATE POLICY "Read own hall settings" ON public.hall_settings
  FOR SELECT USING (public.can_access_hall(hall_id));
CREATE POLICY "Edit hall settings by permission" ON public.hall_settings
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'));
CREATE POLICY "Update hall settings by permission" ON public.hall_settings
  FOR UPDATE USING (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'))
  WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'));
CREATE POLICY "Delete hall settings by permission" ON public.hall_settings
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('settings', 'delete'));

-- CUSTOMERS
CREATE POLICY "Read customers by permission" ON public.customers
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND public.has_permission('customers', 'view'))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert customers by permission" ON public.customers
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('customers', 'edit')
  );
CREATE POLICY "Update customers by permission" ON public.customers
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('customers', 'edit') OR public.has_permission('customers', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('customers', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('customers', 'delete'))
    )
  );
CREATE POLICY "Delete customers by permission" ON public.customers
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('customers', 'delete'));

-- EVENT TYPES
CREATE POLICY "Read hall event types by permission" ON public.event_types
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('settings', 'view')
        OR public.has_permission('bookings', 'view')
        OR public.has_permission('calendar', 'view')
        OR public.has_permission('dashboard', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert hall event types by permission" ON public.event_types
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'));
CREATE POLICY "Update hall event types by permission" ON public.event_types
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('settings', 'edit') OR public.has_permission('settings', 'delete') OR public.has_permission('recycle_bin', 'edit'))
  );
CREATE POLICY "Delete hall event types by permission" ON public.event_types
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('settings', 'delete'));

-- CHARGE CATEGORIES & CATALOG
CREATE POLICY "Read charge categories by permission" ON public.charge_categories
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('catalog', 'view') OR public.has_permission('bookings', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert charge categories by permission" ON public.charge_categories
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('catalog', 'edit'));
CREATE POLICY "Update charge categories by permission" ON public.charge_categories
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('catalog', 'edit') OR public.has_permission('catalog', 'delete') OR public.has_permission('recycle_bin', 'edit'))
  );
CREATE POLICY "Delete charge categories by permission" ON public.charge_categories
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('catalog', 'delete'));

CREATE POLICY "Read charges catalog by permission" ON public.charges_catalog
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('catalog', 'view') OR public.has_permission('bookings', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert charges catalog by permission" ON public.charges_catalog
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('catalog', 'edit'));
CREATE POLICY "Update charges catalog by permission" ON public.charges_catalog
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('catalog', 'edit') OR public.has_permission('catalog', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('catalog', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('catalog', 'delete'))
    )
  );
CREATE POLICY "Delete charges catalog by permission" ON public.charges_catalog
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('catalog', 'delete'));

-- BOOKINGS, INVOICES, ITEMS, INSTALLMENTS, PAYMENTS
CREATE POLICY "Read bookings by permission" ON public.bookings
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('bookings', 'view')
        OR public.has_permission('calendar', 'view')
        OR public.has_permission('dashboard', 'view')
        OR public.has_permission('invoices', 'view')
        OR public.has_permission('payments', 'view')
        OR public.has_permission('reminders', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('daily_closing', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert bookings by permission" ON public.bookings
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('backup_import', 'edit'))
  );
CREATE POLICY "Update bookings by permission" ON public.bookings
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('bookings', 'edit') OR public.has_permission('bookings', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('bookings', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('bookings', 'delete'))
    )
  );
CREATE POLICY "Delete bookings by permission" ON public.bookings
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('bookings', 'delete'));

CREATE POLICY "Read invoices by permission" ON public.invoices
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('invoices', 'view')
        OR public.has_permission('bookings', 'view')
        OR public.has_permission('payments', 'view')
        OR public.has_permission('dashboard', 'view')
        OR public.has_permission('reports', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert invoices by permission" ON public.invoices
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('invoices', 'edit') OR public.has_permission('bookings', 'edit') OR public.has_permission('backup_import', 'edit'))
  );
CREATE POLICY "Update invoices by permission" ON public.invoices
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('invoices', 'edit') OR public.has_permission('bookings', 'edit') OR public.has_permission('recycle_bin', 'edit'))
  );
CREATE POLICY "Delete invoices by permission" ON public.invoices
  FOR DELETE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('invoices', 'delete') OR public.has_permission('bookings', 'delete'))
  );

CREATE POLICY "Read booking items by permission" ON public.booking_items
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('bookings', 'view')
        OR public.has_permission('invoices', 'view')
        OR public.has_permission('payments', 'view')
        OR public.has_permission('reminders', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('dashboard', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert booking items by permission" ON public.booking_items
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('backup_import', 'edit'))
  );
CREATE POLICY "Update booking items by permission" ON public.booking_items
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('recycle_bin', 'edit'))
  );
CREATE POLICY "Delete booking items by permission" ON public.booking_items
  FOR DELETE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('bookings', 'delete'))
  );

CREATE POLICY "Read installments by permission" ON public.installment_schedules
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('bookings', 'view')
        OR public.has_permission('payments', 'view')
        OR public.has_permission('reminders', 'view')
        OR public.has_permission('dashboard', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert installments by permission" ON public.installment_schedules
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('backup_import', 'edit'))
  );
CREATE POLICY "Update installments by permission" ON public.installment_schedules
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('payments', 'edit') OR public.has_permission('recycle_bin', 'edit'))
  );
CREATE POLICY "Delete installments by permission" ON public.installment_schedules
  FOR DELETE USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('bookings', 'edit') OR public.has_permission('bookings', 'delete'))
  );

CREATE POLICY "Read payments by permission" ON public.payments
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('payments', 'view')
        OR public.has_permission('bookings', 'view')
        OR public.has_permission('invoices', 'view')
        OR public.has_permission('daily_closing', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('dashboard', 'view')
        OR public.has_permission('reminders', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert payments by permission" ON public.payments
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('payments', 'edit') OR public.has_permission('bookings', 'edit') OR public.has_permission('backup_import', 'edit'))
  );
CREATE POLICY "Update payments by permission" ON public.payments
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('payments', 'edit') OR public.has_permission('payments', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('payments', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('payments', 'delete'))
    )
  );
CREATE POLICY "Delete payments by permission" ON public.payments
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('payments', 'delete'));

-- EXPENSES, STAFF, ATTENDANCE, SALARIES & ADVANCES
CREATE POLICY "Read expense categories by permission" ON public.expense_categories
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('expenses', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('salaries', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert expense categories by permission" ON public.expense_categories
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('expenses', 'edit'));
CREATE POLICY "Update expense categories by permission" ON public.expense_categories
  FOR UPDATE USING (public.can_access_hall(hall_id) AND (public.has_permission('expenses', 'edit') OR public.has_permission('expenses', 'delete') OR public.has_permission('recycle_bin', 'edit')));
CREATE POLICY "Delete expense categories by permission" ON public.expense_categories
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('expenses', 'delete'));

CREATE POLICY "Read employees by permission" ON public.employees
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('employees', 'view')
        OR public.has_permission('attendance', 'view')
        OR public.has_permission('salaries', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert employees by permission" ON public.employees
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('employees', 'edit'));
CREATE POLICY "Update employees by permission" ON public.employees
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('employees', 'edit') OR public.has_permission('employees', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('employees', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('employees', 'delete'))
    )
  );
CREATE POLICY "Delete employees by permission" ON public.employees
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('employees', 'delete'));

CREATE POLICY "Read attendance by permission" ON public.employee_attendance
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (public.has_permission('attendance', 'view') OR public.has_permission('salaries', 'view'))
  );
CREATE POLICY "Insert attendance by permission" ON public.employee_attendance
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('attendance', 'edit'));
CREATE POLICY "Update attendance by permission" ON public.employee_attendance
  FOR UPDATE USING (public.can_access_hall(hall_id) AND public.has_permission('attendance', 'edit'));
CREATE POLICY "Delete attendance by permission" ON public.employee_attendance
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('attendance', 'delete'));

CREATE POLICY "Read advances by permission" ON public.employee_advances
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND public.has_permission('salaries', 'view'))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert advances by permission" ON public.employee_advances
  FOR INSERT WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('salaries', 'edit'));
CREATE POLICY "Update advances by permission" ON public.employee_advances
  FOR UPDATE USING (public.can_access_hall(hall_id) AND (public.has_permission('salaries', 'edit') OR public.has_permission('recycle_bin', 'edit')));
CREATE POLICY "Delete advances by permission" ON public.employee_advances
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('salaries', 'delete'));

CREATE POLICY "Read expenses by permission" ON public.expenses
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('expenses', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('salaries', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );
CREATE POLICY "Insert expenses by permission" ON public.expenses
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND (public.has_permission('expenses', 'edit') OR public.has_permission('salaries', 'edit'))
  );
CREATE POLICY "Update expenses by permission" ON public.expenses
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('expenses', 'edit') OR public.has_permission('expenses', 'delete')))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'edit'))
    )
  )
  WITH CHECK (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (public.has_permission('expenses', 'edit') OR public.has_permission('recycle_bin', 'edit')))
      OR (deleted_at IS NOT NULL AND public.has_permission('expenses', 'delete'))
    )
  );
CREATE POLICY "Delete expenses by permission" ON public.expenses
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('expenses', 'delete'));

-- DAILY CASH CLOSING
CREATE POLICY "Read daily closings by permission" ON public.daily_closings
  FOR SELECT USING (public.can_access_hall(hall_id) AND public.has_permission('daily_closing', 'view'));
CREATE POLICY "Insert daily closings by permission" ON public.daily_closings
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('daily_closing', 'edit')
    AND status = 'submitted'
  );
CREATE POLICY "Review daily closings by permission" ON public.daily_closings
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND public.has_permission('daily_closing', 'edit')
    AND public.current_user_role() IN ('super_admin', 'admin')
  );
CREATE POLICY "Delete daily closings by permission" ON public.daily_closings
  FOR DELETE USING (public.can_access_hall(hall_id) AND public.has_permission('daily_closing', 'delete'));

-- APPROVAL REQUESTS
CREATE POLICY "Read approval requests by permission" ON public.approval_requests
  FOR SELECT USING (public.can_access_hall(hall_id) AND public.has_permission('bookings', 'view'));
CREATE POLICY "Submit approval requests by permission" ON public.approval_requests
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('bookings', 'edit')
    AND status = 'pending'
  );
CREATE POLICY "Review approval requests by permission" ON public.approval_requests
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND public.has_permission('bookings', 'edit')
    AND public.current_user_role() IN ('super_admin', 'admin')
  );

-- AUDIT LOGS
CREATE POLICY "Read audit logs by permission" ON public.audit_logs
  FOR SELECT USING (public.can_access_hall(hall_id) AND public.has_permission('audit_log', 'view'));
CREATE POLICY "Authenticated inserts audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND public.can_access_hall(hall_id));

-- ============================================================================
-- 7. SEED DATA FOR MARQUEE 1 (Idempotent)
-- ============================================================================

INSERT INTO public.profiles (id, hall_id, full_name, email, phone, role, is_active)
SELECT
  u.id,
  '11111111-1111-4111-8111-111111111101'::UUID,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(u.email, 'Admin'), '@', 1)),
  COALESCE(u.email, u.id::TEXT || '@marquee1.pk'),
  COALESCE(u.raw_user_meta_data->>'phone', ''),
  CASE
    WHEN public.profiles_is_empty()
      AND u.id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
    THEN 'super_admin'::public.user_role
    ELSE 'manager'::public.user_role
  END,
  true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Backfill default permission templates for any profile missing user_permissions rows
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, hall_id, role FROM public.profiles LOOP
    PERFORM public.seed_default_permissions_for_user(rec.id, rec.hall_id, rec.role);
  END LOOP;
END $$;

INSERT INTO public.hall_settings (hall_id)
VALUES ('11111111-1111-4111-8111-111111111101')
ON CONFLICT (hall_id) DO NOTHING;

INSERT INTO public.event_types (hall_id, name_en, name_ur, color_hex, is_default) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Baraat', 'بارات', '#F59E0B', true),
  ('11111111-1111-4111-8111-111111111101', 'Mayun', 'مایوں', '#EAB308', true),
  ('11111111-1111-4111-8111-111111111101', 'Walima', 'ولیمہ', '#06B6D4', true),
  ('11111111-1111-4111-8111-111111111101', 'Birthday', 'سالگرہ', '#EC4899', true),
  ('11111111-1111-4111-8111-111111111101', 'Conference', 'کانفرنس', '#8B5CF6', true),
  ('11111111-1111-4111-8111-111111111101', 'Seminar', 'سیمینار', '#10B981', true),
  ('11111111-1111-4111-8111-111111111101', 'Other', 'دیگر تقریب', '#64748B', true)
ON CONFLICT (hall_id, name_en) DO NOTHING;

INSERT INTO public.charge_categories (hall_id, name_en, name_ur, sort_order) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Default Package', 'بنیادی پیکج', 1),
  ('11111111-1111-4111-8111-111111111101', 'Decor & Setup', 'سجاوٹ اور سیٹ اپ', 2),
  ('11111111-1111-4111-8111-111111111101', 'Hall Services & Setup', 'ہال سروسز اور سیٹ اپ', 3),
  ('11111111-1111-4111-8111-111111111101', 'Beverages', 'مشروبات', 4),
  ('11111111-1111-4111-8111-111111111101', 'Outdoor & Add-ons', 'آؤٹ ڈور اور اضافی سہولیات', 5)
ON CONFLICT (hall_id, name_en) DO NOTHING;

INSERT INTO public.charges_catalog (hall_id, category_id, name_en, name_ur, default_rate, unit_label, is_default_package, is_crate_service)
SELECT '11111111-1111-4111-8111-111111111101', c.id, v.name_en, v.name_ur, v.default_rate, v.unit_label, v.is_default_package, v.is_crate_service
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
JOIN public.charge_categories c ON c.name_en = v.cat_name AND c.hall_id = '11111111-1111-4111-8111-111111111101'
WHERE NOT EXISTS (
  SELECT 1 FROM public.charges_catalog existing
  WHERE existing.hall_id = '11111111-1111-4111-8111-111111111101' AND existing.name_en = v.name_en
);

INSERT INTO public.expense_categories (hall_id, name_en, name_ur) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Sound', 'ساؤنڈ سسٹم'),
  ('11111111-1111-4111-8111-111111111101', 'Decoration', 'ڈیکوریشن'),
  ('11111111-1111-4111-8111-111111111101', 'Florist', 'پھولوں کا خرچ'),
  ('11111111-1111-4111-8111-111111111101', 'Peon', 'چپراسی / ہیلپر'),
  ('11111111-1111-4111-8111-111111111101', 'Sweeper', 'سویپر / صفائی عملہ'),
  ('11111111-1111-4111-8111-111111111101', 'Waiters (Daily Wage)', 'ویٹرز یومیہ اجرت'),
  ('11111111-1111-4111-8111-111111111101', 'Utilities', 'بجلی و گیس بل'),
  ('11111111-1111-4111-8111-111111111101', 'Cleaning', 'صفائی ستھرائی'),
  ('11111111-1111-4111-8111-111111111101', 'Maintenance', 'مرمت و دیکھ بھال'),
  ('11111111-1111-4111-8111-111111111101', 'Salaries', 'ماہانہ تنخواہیں'),
  ('11111111-1111-4111-8111-111111111101', 'Other', 'دیگر اخراجات')
ON CONFLICT (hall_id, name_en) DO NOTHING;

-- Seed sample customers, employees & bookings only if Marquee 1 currently has 0 bookings
DO $$
DECLARE
  mq1 UUID := '11111111-1111-4111-8111-111111111101';
  c1 UUID := gen_random_uuid();
  c2 UUID := gen_random_uuid();
  c3 UUID := gen_random_uuid();
  c4 UUID := gen_random_uuid();
  b1 UUID := gen_random_uuid();
  b2 UUID := gen_random_uuid();
  b3 UUID := gen_random_uuid();
  b4 UUID := gen_random_uuid();
  exp_sal_id UUID;
  exp_waiter_id UUID;
  exp_util_id UUID;
  exp_florist_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.bookings WHERE hall_id = mq1 LIMIT 1) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE hall_id = mq1 LIMIT 1) THEN
    INSERT INTO public.employees (hall_id, full_name, phone, nic, role_title, employment_type, base_rate, is_active) VALUES
      (mq1, 'Tariq Mahmood', '0301-8241109', '42101-7845123-1', 'Floor Supervisor', 'monthly', 55000, true),
      (mq1, 'Kamran Qureshi', '0321-3940211', '42201-5519834-5', 'Sound & Lighting Technician', 'monthly', 42000, true),
      (mq1, 'Salman Raza', '0333-2891044', '42301-9912301-3', 'Head Waiter (Table Service)', 'daily_wage', 2200, true),
      (mq1, 'Bilal Ahmed', '0345-6120933', '42101-3409812-7', 'Banquet Waiter', 'daily_wage', 1800, true),
      (mq1, 'Naveed Akhtar', '0312-9045118', '42401-6712390-9', 'Security Guard', 'monthly', 35000, true);
  END IF;

  INSERT INTO public.customers (id, hall_id, full_name, phone, nic, address, email) VALUES
    (c1, mq1, 'Haji Abdul Rehman Siddiqui', '0300-8219940', '42301-4451290-1', 'House 42-B, DHA Phase 6, Karachi', 'rehman.siddiqui@example.pk'),
    (c2, mq1, 'Dr. Ayesha Farooq', '0321-2948811', '42201-8891234-2', 'Flat 12, Clifton Block 4, Karachi', 'ayesha.farooq@example.pk'),
    (c3, mq1, 'Zainab & Hamza Malik', '0333-3109482', '42101-6620194-3', 'B-19, Gulshan-e-Iqbal Block 13-D, Karachi', 'hamza.malik@example.pk'),
    (c4, mq1, 'Engro Tech Summit Karachi', '0345-8201944', '42301-1190482-5', 'Harbour Front, Clifton, Karachi', 'events@engrotech.example.pk');

  SELECT id INTO exp_sal_id FROM public.expense_categories WHERE hall_id = mq1 AND name_en = 'Salaries' LIMIT 1;
  SELECT id INTO exp_waiter_id FROM public.expense_categories WHERE hall_id = mq1 AND name_en = 'Waiters (Daily Wage)' LIMIT 1;
  SELECT id INTO exp_util_id FROM public.expense_categories WHERE hall_id = mq1 AND name_en = 'Utilities' LIMIT 1;
  SELECT id INTO exp_florist_id FROM public.expense_categories WHERE hall_id = mq1 AND name_en = 'Florist' LIMIT 1;

  INSERT INTO public.bookings (
    id, hall_id, customer_id, customer_name, customer_address, customer_phone, customer_nic, customer_email,
    event_type, event_date, start_time, end_time, floors, guests_count, hall_rent, notes, inspection_notes, status,
    crates_ordered, crates_used, crates_returned, crate_rate, crate_handling_deduction_per_crate, crate_credit_amount,
    late_charge_method, late_charge_value, late_charge_amount,
    discount_type, discount_value, discount_amount, discount_reason
  ) VALUES
    (b1, mq1, c1, 'Haji Abdul Rehman Siddiqui', 'House 42-B, DHA Phase 6, Karachi', '0300-8219940', '42301-4451290-1', 'rehman.siddiqui@example.pk',
     'Baraat', CURRENT_DATE, '20:00', '00:00', ARRAY['First', 'Second'], 650, 340000, 'VIP Baraat stage with fresh red roses and valet parking.', 'AC chillers verified 1 hour prior.', 'Confirmed',
     45, 38, 7, 1600, 180, 9940, 'none', 0, 0, 'fixed', 15000, 15000, 'Early booking family courtesy'),
    (b2, mq1, c2, 'Dr. Ayesha Farooq', 'Flat 12, Clifton Block 4, Karachi', '0321-2948811', '42201-8891234-2', 'ayesha.farooq@example.pk',
     'Walima', CURRENT_DATE + 3, '20:00', '00:00', ARRAY['Full Hall'], 1100, 450000, 'Full marquee booking with outdoor BBQ courtyard.', '', 'Confirmed',
     60, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, ''),
    (b3, mq1, c3, 'Zainab & Hamza Malik', 'B-19, Gulshan-e-Iqbal Block 13-D, Karachi', '0333-3109482', '42101-6620194-3', 'hamza.malik@example.pk',
     'Mayun', CURRENT_DATE + 5, '19:30', '23:30', ARRAY['Third'], 250, 150000, 'Yellow marigold theme with outdoor BBQ space.', '', 'Tentative',
     20, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, ''),
    (b4, mq1, c4, 'Engro Tech Summit Karachi', 'Harbour Front, Clifton, Karachi', '0345-8201944', '42301-1190482-5', 'events@engrotech.example.pk',
     'Conference', CURRENT_DATE, '09:00', '15:00', ARRAY['First'], 300, 180000, 'Morning corporate seminar on First Floor.', 'Projector & mic tested.', 'Confirmed',
     15, 0, 0, 1600, 180, 0, 'none', 0, 0, 'fixed', 0, 0, '');

  INSERT INTO public.booking_items (hall_id, booking_id, item_name, item_name_ur, category_name, quantity, rate, amount, is_package_included, is_crate_service) VALUES
    (mq1, b1, 'Couple Entry', 'دولہا دلہن انٹری', 'Default Package', 1, 0, 0, true, false),
    (mq1, b1, 'Smoke', 'اسموک ایفیکٹ', 'Default Package', 1, 0, 0, true, false),
    (mq1, b1, 'Lighting', 'لائٹنگ سسٹم', 'Default Package', 1, 0, 0, true, false),
    (mq1, b1, 'Sound', 'ساؤنڈ سسٹم', 'Default Package', 1, 0, 0, true, false),
    (mq1, b1, 'Fresh Flowers', 'تازہ پھولوں کی سجاوٹ', 'Decor & Setup', 1, 35000, 35000, false, false),
    (mq1, b1, 'Table Service', 'ٹیبل سروس ویٹرز', 'Hall Services & Setup', 2, 15000, 30000, false, false),
    (mq1, b1, 'Cold Drinks', 'کولڈ ڈرنکس سروس', 'Beverages', 1, 62060, 62060, false, true),
    (mq1, b1, 'Outdoor Barbecue Space', 'آؤٹ ڈور باربی کیو اسپیس', 'Outdoor & Add-ons', 1, 5000, 5000, false, false);

  INSERT INTO public.payments (hall_id, booking_id, amount, payment_date, mode, reference_no, received_by, notes) VALUES
    (mq1, b1, 200000, CURRENT_DATE - 20, 'Online', 'MEEZAN-TX-88412', 'Kashif Manager', 'Advance booking confirmation'),
    (mq1, b1, 150000, CURRENT_DATE - 3, 'Cash', 'CASH-092', 'Admin Desk', 'Second installment'),
    (mq1, b2, 225000, CURRENT_DATE - 15, 'Online', 'HBL-IBFT-55901', 'Admin Desk', '50% Advance for Full Hall');

  INSERT INTO public.installment_schedules (hall_id, booking_id, title, due_date, amount, is_paid) VALUES
    (mq1, b1, 'Final Balance Settlement', CURRENT_DATE - 1, 117060, false),
    (mq1, b2, 'Second Installment', CURRENT_DATE + 1, 150000, false),
    (mq1, b3, 'Booking Confirmation Advance', CURRENT_DATE + 2, 75000, false);

  INSERT INTO public.expenses (hall_id, category_id, category_name, booking_id, amount, expense_date, payee, mode, reference_no, notes) VALUES
    (mq1, exp_util_id, 'Utilities', NULL, 94500, CURRENT_DATE - 5, 'K-Electric Commercial', 'Online', 'KE-2026-8841', 'Monthly electricity bill'),
    (mq1, exp_sal_id, 'Salaries', NULL, 55000, CURRENT_DATE - 4, 'Tariq Mahmood', 'Online', 'SAL-NOV-01', 'Monthly salary'),
    (mq1, exp_florist_id, 'Florist', b1, 22000, CURRENT_DATE - 1, 'Al-Madina Florist Saddar', 'Cash', 'FLR-210', 'Fresh red roses stage setup for Baraat'),
    (mq1, exp_waiter_id, 'Waiters (Daily Wage)', b1, 18000, CURRENT_DATE, 'Salman Raza & Waiter Team (10 Staff)', 'Cash', 'DW-441', 'Baraat event table service waiters');

  INSERT INTO public.audit_logs (hall_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, changes) VALUES
    (mq1, 'System Seed', 'super_admin', 'CREATE', 'booking', b1::TEXT, 'MQ1-2026-0001', '{"status": "Confirmed", "event_type": "Baraat"}'::jsonb);
END $$;
