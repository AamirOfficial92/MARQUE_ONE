-- ============================================================================
-- Migration: Halls & Hall Profile Module, 'halls' Permission Key,
-- Admin Hall Profile Guard Trigger, and 'hall-assets' Storage Bucket + RLS
-- Safe, transactional, and idempotent on existing databases.
-- ============================================================================

BEGIN;

-- 1. Expand public.halls with complete Hall Profile columns
ALTER TABLE public.halls
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline_en TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_secondary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS x_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signature_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ntn TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS strn TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_iban TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_bank_details BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_footer_en TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_footer_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_en TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS booking_code_prefix TEXT NOT NULL DEFAULT 'MQ1',
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PKR',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_halls_id ON public.halls (id);

-- Backfill terms & identity from hall_settings if halls columns are still blank
UPDATE public.halls h
SET
  terms_en = COALESCE(NULLIF(trim(h.terms_en), ''), NULLIF(trim(hs.terms_en), ''), ''),
  terms_ur = COALESCE(NULLIF(trim(h.terms_ur), ''), NULLIF(trim(hs.terms_ur), ''), ''),
  logo_url = COALESCE(NULLIF(trim(h.logo_url), ''), NULLIF(trim(hs.logo_url), ''), ''),
  phone = COALESCE(NULLIF(trim(h.phone), ''), NULLIF(trim(hs.phone), ''), ''),
  email = COALESCE(NULLIF(trim(h.email), ''), NULLIF(trim(hs.email), ''), ''),
  address = COALESCE(NULLIF(trim(h.address), ''), NULLIF(trim(hs.address), ''), ''),
  address_ur = COALESCE(NULLIF(trim(h.address_ur), ''), NULLIF(trim(hs.address_ur), ''), ''),
  name_ur = COALESCE(NULLIF(trim(h.name_ur), ''), NULLIF(trim(hs.hall_name_ur), ''), '')
FROM public.hall_settings hs
WHERE hs.hall_id = h.id;

-- Backfill sensible defaults on Marquee 1 if blank
UPDATE public.halls
SET
  city = CASE WHEN trim(COALESCE(city, '')) = '' THEN 'Karachi' ELSE city END,
  whatsapp = CASE WHEN trim(COALESCE(whatsapp, '')) = '' THEN '923002198844' ELSE whatsapp END,
  currency = CASE WHEN trim(COALESCE(currency, '')) = '' THEN 'PKR' ELSE currency END,
  tagline_en = CASE WHEN trim(COALESCE(tagline_en, '')) = '' THEN 'Luxury Banquet & Event Venue' ELSE tagline_en END,
  tagline_ur = CASE WHEN trim(COALESCE(tagline_ur, '')) = '' THEN 'لگژری بینکوئٹ اور ایونٹ ہال' ELSE tagline_ur END,
  invoice_footer_en = CASE WHEN trim(COALESCE(invoice_footer_en, '')) = '' THEN 'Thank you for choosing us for your memorable celebration.' ELSE invoice_footer_en END,
  invoice_footer_ur = CASE WHEN trim(COALESCE(invoice_footer_ur, '')) = '' THEN 'اپنی یادگار تقریب کے لیے ہمارا انتخاب کرنے کا شکریہ۔' ELSE invoice_footer_ur END
WHERE id = '11111111-1111-4111-8111-111111111101';

-- 2. Add 'halls' screen key to public.user_permissions CHECK constraint
DO $$
DECLARE
  con_rec RECORD;
BEGIN
  FOR con_rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_permissions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%screen_key%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS %I', con_rec.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_screen_key_check CHECK (
    screen_key IN (
      'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
      'expenses','employees','attendance','salaries','reports','invoices','reminders',
      'users','settings','halls','recycle_bin','audit_log','backup_import'
    )
  );

-- Ensure unique index exists before ON CONFLICT upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permissions_user_hall_screen
  ON public.user_permissions(user_id, hall_id, screen_key);

-- 3. Update seed_default_permissions_for_user to include 'halls'
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
    'users','settings','halls','recycle_bin','audit_log','backup_import'
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

-- Backfill 'halls' permission for existing users (and any other missing screen rows)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, hall_id, role FROM public.profiles LOOP
    PERFORM public.seed_default_permissions_for_user(rec.id, rec.hall_id, rec.role);
  END LOOP;
END $$;

-- 4. Hall Update Guard Trigger (prevents Hall Admin from altering prefixes, currency, id, or is_active)
CREATE OR REPLACE FUNCTION public.guard_hall_update_for_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_role public.user_role;
BEGIN
  IF auth.uid() IS NULL OR v_jwt_role = 'service_role' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role = 'super_admin' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_caller_role = 'admin' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.booking_code_prefix IS DISTINCT FROM OLD.booking_code_prefix
       OR NEW.invoice_prefix IS DISTINCT FROM OLD.invoice_prefix
       OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Hall Admin cannot modify hall ID, active status, prefixes, or currency.'
        USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only Super Admin or permitted Hall Admin can update hall records.'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_hall_update_for_admin ON public.halls;
CREATE TRIGGER trg_guard_hall_update_for_admin
  BEFORE UPDATE ON public.halls
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_hall_update_for_admin();

-- 5. Update RLS policies on public.halls
ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read permitted halls" ON public.halls;
CREATE POLICY "Users read permitted halls" ON public.halls
  FOR SELECT USING (
    public.current_user_role() = 'super_admin'
    OR id = public.current_user_hall_id()
  );

DROP POLICY IF EXISTS "Super admin manages halls" ON public.halls;
CREATE POLICY "Super admin manages halls" ON public.halls
  FOR ALL USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Hall admin updates own hall profile" ON public.halls;
CREATE POLICY "Hall admin updates own hall profile" ON public.halls
  FOR UPDATE USING (
    public.current_user_role() = 'admin'
    AND id = public.current_user_hall_id()
    AND public.has_permission('halls', 'edit')
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    AND id = public.current_user_hall_id()
    AND public.has_permission('halls', 'edit')
  );

-- 6. Create Supabase Storage bucket 'hall-assets' (public read, restricted upload/replace/delete)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hall-assets',
  'hall-assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read hall assets" ON storage.objects;
CREATE POLICY "Public read hall assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'hall-assets');

DROP POLICY IF EXISTS "Super admin and hall admin upload hall assets" ON storage.objects;
CREATE POLICY "Super admin and hall admin upload hall assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'hall-assets'
    AND (
      public.current_user_role() = 'super_admin'
      OR (
        public.current_user_role() = 'admin'
        AND public.has_permission('halls', 'edit')
        AND (storage.foldername(name))[1] = public.current_user_hall_id()::text
      )
    )
  );

DROP POLICY IF EXISTS "Super admin and hall admin update hall assets" ON storage.objects;
CREATE POLICY "Super admin and hall admin update hall assets" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'hall-assets'
    AND (
      public.current_user_role() = 'super_admin'
      OR (
        public.current_user_role() = 'admin'
        AND public.has_permission('halls', 'edit')
        AND (storage.foldername(name))[1] = public.current_user_hall_id()::text
      )
    )
  );

DROP POLICY IF EXISTS "Super admin and hall admin delete hall assets" ON storage.objects;
CREATE POLICY "Super admin and hall admin delete hall assets" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'hall-assets'
    AND (
      public.current_user_role() = 'super_admin'
      OR (
        public.current_user_role() = 'admin'
        AND public.has_permission('halls', 'edit')
        AND (storage.foldername(name))[1] = public.current_user_hall_id()::text
      )
    )
  );

COMMIT;
