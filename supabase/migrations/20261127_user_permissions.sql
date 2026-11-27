-- ============================================================================
-- Migration: Flexible Per-User, Per-Screen Permissions & Multi-Hall RLS
-- Safe, transactional, and idempotent for existing Supabase databases
-- containing tables and test data from earlier schema versions.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. DROP EXISTING PUBLIC POLICIES FIRST (avoids dependency errors on ALTER)
-- ============================================================================
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

-- ============================================================================
-- 2. ENUMS (Create if missing, or safely upgrade legacy role names)
-- ============================================================================
DO $$
DECLARE
  needs_role_upgrade BOOLEAN := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'manager');
  ELSE
    SELECT (
      EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'user_role'
          AND e.enumlabel IN ('management', 'finance')
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'user_role'
          AND e.enumlabel = 'admin'
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'user_role'
          AND e.enumlabel = 'manager'
      )
    ) INTO needs_role_upgrade;

    IF needs_role_upgrade THEN
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
      ) THEN
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT';
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role TYPE TEXT USING role::TEXT';
        EXECUTE 'UPDATE public.profiles SET role = ''manager'' WHERE role = ''management''';
        EXECUTE 'UPDATE public.profiles SET role = ''admin'' WHERE role = ''finance''';
      END IF;

      DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
      DROP FUNCTION IF EXISTS public.can_access_hall(UUID) CASCADE;
      DROP FUNCTION IF EXISTS public.has_permission(TEXT, TEXT) CASCADE;
      DROP FUNCTION IF EXISTS public.seed_default_permissions_for_user(UUID, UUID, public.user_role) CASCADE;
      DROP TYPE public.user_role CASCADE;

      CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'manager');

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
      ) THEN
        EXECUTE '
          ALTER TABLE public.profiles
          ALTER COLUMN role TYPE public.user_role
          USING (
            CASE
              WHEN role IN (''super_admin'', ''admin'', ''manager'') THEN role::public.user_role
              ELSE ''manager''::public.user_role
            END
          )';
        EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT ''manager''::public.user_role';
      END IF;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'booking_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.booking_status AS ENUM ('Tentative', 'Confirmed', 'Completed', 'Cancelled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'payment_mode' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.payment_mode AS ENUM ('Cash', 'Online');
  END IF;
END $$;

-- ============================================================================
-- 3. HALLS & SEQUENCES (Ensure tables, columns & unique indexes before inserts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Marquee 1',
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

ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Marquee 1';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS address_ur TEXT NOT NULL DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS booking_code_prefix TEXT NOT NULL DEFAULT 'MQ1';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS invoice_prefix TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.halls ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_halls_id ON public.halls (id);

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

CREATE TABLE IF NOT EXISTS public.hall_sequences (
  hall_id UUID PRIMARY KEY REFERENCES public.halls(id) ON DELETE CASCADE,
  booking_seq BIGINT NOT NULL DEFAULT 0,
  invoice_seq BIGINT NOT NULL DEFAULT 0,
  receipt_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hall_sequences ADD COLUMN IF NOT EXISTS booking_seq BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.hall_sequences ADD COLUMN IF NOT EXISTS invoice_seq BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.hall_sequences ADD COLUMN IF NOT EXISTS receipt_seq BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.hall_sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_sequences_hall_id ON public.hall_sequences (hall_id);

INSERT INTO public.hall_sequences (hall_id, booking_seq, invoice_seq, receipt_seq)
VALUES ('11111111-1111-4111-8111-111111111101', 0, 0, 0)
ON CONFLICT (hall_id) DO NOTHING;

-- ============================================================================
-- 4. PROFILES & BUSINESS TABLES (CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hall_id UUID REFERENCES public.halls(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL DEFAULT 'Staff',
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  role public.user_role NOT NULL DEFAULT 'manager',
  is_active BOOLEAN NOT NULL DEFAULT true,
  preferred_theme TEXT CHECK (preferred_theme IN ('dark', 'light')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'Staff';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'manager';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_theme TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.profiles
SET preferred_theme = NULL
WHERE preferred_theme IS NOT NULL AND preferred_theme NOT IN ('dark', 'light');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'chk_profiles_preferred_theme'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_preferred_theme
      CHECK (preferred_theme IS NULL OR preferred_theme IN ('dark', 'light'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_id ON public.profiles (id);

UPDATE public.profiles
SET hall_id = '11111111-1111-4111-8111-111111111101'::UUID
WHERE hall_id IS NULL AND role IN ('admin', 'manager');

-- HALL SETTINGS
CREATE TABLE IF NOT EXISTS public.hall_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE,
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
  default_language TEXT NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS hall_name TEXT NOT NULL DEFAULT 'Marquee 1';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS hall_name_ur TEXT NOT NULL DEFAULT 'مارکی 1 بینکوئٹ ہال';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS address_ur TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS invoice_format TEXT NOT NULL DEFAULT 'INV-{YYYY}-{0000}';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS default_rent_first NUMERIC(12,2) NOT NULL DEFAULT 180000.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS default_rent_second NUMERIC(12,2) NOT NULL DEFAULT 165000.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS default_rent_third NUMERIC(12,2) NOT NULL DEFAULT 150000.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS default_rent_full NUMERIC(12,2) NOT NULL DEFAULT 450000.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS weekday_weekend_rates JSONB NOT NULL DEFAULT '{
  "First": {"weekday": 165000, "weekend": 195000},
  "Second": {"weekday": 150000, "weekend": 180000},
  "Third": {"weekday": 135000, "weekend": 165000},
  "Full Hall": {"weekday": 410000, "weekend": 480000}
}'::jsonb;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS rent_seasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS crate_deduction_per_returned NUMERIC(12,2) NOT NULL DEFAULT 180.00;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS cleaning_buffer_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS late_grace_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS hide_discount_reason_on_invoice BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS terms_en TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS terms_ur TEXT NOT NULL DEFAULT '';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.hall_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.hall_settings
SET hall_id = '11111111-1111-4111-8111-111111111101'::UUID
WHERE hall_id IS NULL;

WITH ranked_hs AS (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY hall_id
           ORDER BY updated_at DESC NULLS LAST, ctid DESC
         ) AS rn
  FROM public.hall_settings
)
DELETE FROM public.hall_settings hs
USING ranked_hs r
WHERE hs.ctid = r.ctid AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_settings_hall_id ON public.hall_settings (hall_id);

DO $$
DECLARE
  mq1 UUID := '11111111-1111-4111-8111-111111111101';
  id_type TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hall_settings WHERE hall_id = mq1) THEN
    SELECT data_type INTO id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hall_settings' AND column_name = 'id';

    IF id_type = 'uuid' THEN
      INSERT INTO public.hall_settings (hall_id)
      VALUES (mq1)
      ON CONFLICT (hall_id) DO NOTHING;
    ELSE
      INSERT INTO public.hall_settings (id, hall_id)
      VALUES (1, mq1)
      ON CONFLICT (hall_id) DO NOTHING;
    END IF;
  END IF;
END $$;

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  nic TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EVENT TYPES
CREATE TABLE IF NOT EXISTS public.event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  color_hex TEXT NOT NULL DEFAULT '#06B6D4',
  is_default BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHARGE CATEGORIES
CREATE TABLE IF NOT EXISTS public.charge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHARGES CATALOG
CREATE TABLE IF NOT EXISTS public.charges_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  category_id UUID REFERENCES public.charge_categories(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  default_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  unit_label TEXT NOT NULL DEFAULT 'Event',
  is_default_package BOOLEAN NOT NULL DEFAULT false,
  is_crate_service BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  booking_code TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_nic TEXT NOT NULL DEFAULT '',
  customer_email TEXT,
  event_type TEXT NOT NULL DEFAULT 'Other',
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME NOT NULL DEFAULT '20:00',
  end_time TIME NOT NULL DEFAULT '00:00',
  floors TEXT[] NOT NULL DEFAULT ARRAY['First'],
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
  late_charge_method TEXT NOT NULL DEFAULT 'none',
  late_charge_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  late_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  late_charge_overridden BOOLEAN NOT NULL DEFAULT false,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
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
  deleted_by UUID REFERENCES auth.users(id)
);

-- INVOICES
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
  deleted_at TIMESTAMPTZ
);

-- BOOKING ITEMS
CREATE TABLE IF NOT EXISTS public.booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES public.charges_catalog(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL DEFAULT '',
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

-- INSTALLMENT SCHEDULES
CREATE TABLE IF NOT EXISTS public.installment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Installment',
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  receipt_number TEXT NOT NULL DEFAULT '',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mode public.payment_mode NOT NULL DEFAULT 'Cash',
  reference_no TEXT DEFAULT '',
  received_by TEXT NOT NULL DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EXPENSE CATEGORIES
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  nic TEXT,
  role_title TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'monthly',
  base_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EMPLOYEE ATTENDANCE
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Present',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EMPLOYEE ADVANCES
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

-- EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL DEFAULT 'Other',
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payee TEXT NOT NULL DEFAULT '',
  mode public.payment_mode NOT NULL DEFAULT 'Cash',
  reference_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DAILY CLOSINGS
CREATE TABLE IF NOT EXISTS public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  closing_date DATE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id),
  submitted_by_name TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cash_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  online_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  bookings_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  manager_notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  discrepancy_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  admin_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- APPROVAL REQUESTS
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  request_type TEXT NOT NULL,
  requested_by UUID REFERENCES auth.users(id),
  requested_by_name TEXT NOT NULL DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT DEFAULT ''
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  entity_label TEXT NOT NULL DEFAULT '',
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. UPGRADE PRE-EXISTING BUSINESS TABLES WITH MISSING COLUMNS & UNIQUE INDEXES
-- ============================================================================
DO $$
DECLARE
  mq1_id UUID := '11111111-1111-4111-8111-111111111101';
  tbl TEXT;
BEGIN
  -- Ensure hall_id exists and is backfilled on every business table
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'event_types', 'charge_categories', 'charges_catalog',
      'bookings', 'invoices', 'booking_items', 'installment_schedules', 'payments',
      'expense_categories', 'employees', 'employee_attendance', 'employee_advances',
      'expenses', 'daily_closings', 'approval_requests', 'audit_logs'
    ])
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE',
      tbl
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN hall_id SET DEFAULT %L::uuid',
      tbl, mq1_id
    );
    EXECUTE format(
      'UPDATE public.%I SET hall_id = $1 WHERE hall_id IS NULL',
      tbl
    ) USING mq1_id;
  END LOOP;

  -- Ensure soft-delete columns exist on all soft-deletable tables
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'event_types', 'charge_categories', 'charges_catalog',
      'bookings', 'booking_items', 'installment_schedules', 'payments',
      'expense_categories', 'employees', 'employee_advances', 'expenses'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id)', tbl);
  END LOOP;

  ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  ALTER TABLE public.charges_catalog ADD COLUMN IF NOT EXISTS is_crate_service BOOLEAN NOT NULL DEFAULT false;

  -- Upgrade bookings columns from early schemas if missing
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS inspection_notes TEXT DEFAULT '';
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crates_ordered INT NOT NULL DEFAULT 0;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crates_used INT NOT NULL DEFAULT 0;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crates_returned INT NOT NULL DEFAULT 0;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crate_rate NUMERIC(12,2) NOT NULL DEFAULT 1600.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crate_handling_deduction_per_crate NUMERIC(12,2) NOT NULL DEFAULT 180.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS crate_credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS actual_end_time TIME;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_charge_method TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_charge_value NUMERIC(12,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS late_charge_overridden BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'fixed';
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT '';
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reschedule_history JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_details JSONB;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invoice_number TEXT;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

  ALTER TABLE public.daily_closings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted';
  ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

  -- Replace single-hall global unique constraints with per-hall unique indexes
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_code_key;
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_invoice_number_key;
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_receipt_number_key;
  ALTER TABLE public.event_types DROP CONSTRAINT IF EXISTS event_types_name_en_key;
  ALTER TABLE public.charge_categories DROP CONSTRAINT IF EXISTS charge_categories_name_en_key;
  ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_en_key;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_hall_code ON public.bookings (hall_id, booking_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_hall_invoice ON public.bookings (hall_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_hall_number ON public.invoices (hall_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_hall_receipt ON public.payments (hall_id, receipt_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_types_hall_name ON public.event_types (hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_categories_hall_name ON public.charge_categories (hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_hall_name ON public.expense_categories (hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_attendance_emp_date ON public.employee_attendance (employee_id, attendance_date);

-- ============================================================================
-- 6. USER_PERMISSIONS TABLE (Explicit columns, check constraint, & unique index)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  screen_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101';
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS screen_key TEXT;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS can_view BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS can_edit BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.user_permissions
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE public.user_permissions
SET hall_id = '11111111-1111-4111-8111-111111111101'::UUID
WHERE hall_id IS NULL;

-- Drop any legacy 2-column unique constraint/index or outdated screen_key check constraints
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_screen_key_key;
DROP INDEX IF EXISTS public.idx_user_permissions_lookup;

DO $$
DECLARE
  chk RECORD;
BEGIN
  FOR chk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_permissions'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS %I', chk.conname);
  END LOOP;
END $$;

DELETE FROM public.user_permissions
WHERE user_id IS NULL
   OR screen_key IS NULL
   OR screen_key NOT IN (
     'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
     'expenses','employees','attendance','salaries','reports','invoices','reminders',
     'users','settings','recycle_bin','audit_log','backup_import'
   );

ALTER TABLE public.user_permissions
  ADD CONSTRAINT chk_user_permissions_screen_key
  CHECK (screen_key IN (
    'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
    'expenses','employees','attendance','salaries','reports','invoices','reminders',
    'users','settings','recycle_bin','audit_log','backup_import'
  ));

-- Deduplicate any existing rows before creating the required non-partial unique index
WITH ranked_perms AS (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY user_id, hall_id, screen_key
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, ctid DESC
         ) AS rn
  FROM public.user_permissions
)
DELETE FROM public.user_permissions up
USING ranked_perms r
WHERE up.ctid = r.ctid AND r.rn > 1;

-- Guaranteed matching unique index for INSERT ... ON CONFLICT (user_id, hall_id, screen_key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permissions_user_hall_screen
  ON public.user_permissions (user_id, hall_id, screen_key);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. HELPER FUNCTIONS, PERMISSION SEEDER & AUTH TRIGGER
-- ============================================================================
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

CREATE OR REPLACE FUNCTION public.profiles_is_empty()
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
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

  -- Super Admin retains full access across all screens & halls
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

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role public.user_role;
  assigned_hall UUID;
  raw_role TEXT;
BEGIN
  IF public.profiles_is_empty() THEN
    assigned_role := 'super_admin';
    assigned_hall := '11111111-1111-4111-8111-111111111101'::UUID;
  ELSE
    raw_role := COALESCE(NEW.raw_user_meta_data->>'role', 'manager');
    IF raw_role IN ('super_admin', 'admin', 'manager') THEN
      assigned_role := raw_role::public.user_role;
    ELSE
      assigned_role := 'manager'::public.user_role;
    END IF;
    assigned_hall := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'hall_id', '')::UUID,
      '11111111-1111-4111-8111-111111111101'::UUID
    );
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

-- ============================================================================
-- 8. IDEMPOTENT BACKFILL (Profiles for any auth users + user_permissions)
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
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE u.email IS NOT NULL AND LOWER(p.email) = LOWER(u.email)
  )
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, hall_id, role FROM public.profiles LOOP
    PERFORM public.seed_default_permissions_for_user(rec.id, rec.hall_id, rec.role);
  END LOOP;
END $$;

-- ============================================================================
-- 9. ENABLE RLS & RECREATE PER-PERMISSION + HALL-ISOLATED POLICIES
-- ============================================================================
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
CREATE POLICY "First user bootstrap super_admin" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id AND role = 'super_admin' AND public.profiles_is_empty());
CREATE POLICY "Users update own theme preference" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = public.current_user_role() AND is_active = true);
CREATE POLICY "Super admin manages all profiles" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'super_admin');
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
  FOR ALL USING (public.current_user_role() = 'super_admin');
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

COMMIT;
