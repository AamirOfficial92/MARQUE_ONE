-- ============================================================================
-- Migration: Single-Language Enforcement, Profile Language Persistence,
-- and Bilingual (EN/UR) Catalog, Floors & Settings Columns
-- Safe, transactional, and idempotent on existing databases.
-- ============================================================================

BEGIN;

-- 1. User preferred language persistence on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'ur'));

-- Replace self-preference RLS policy cleanly to document theme + language updates
DROP POLICY IF EXISTS "Users update own theme preference" ON public.profiles;
DROP POLICY IF EXISTS "Users update own preferences" ON public.profiles;
CREATE POLICY "Users update own preferences" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.current_user_role()
    AND hall_id IS NOT DISTINCT FROM public.current_user_hall_id()
    AND is_active = true
  );

-- 2. Bilingual columns on halls & hall_settings
ALTER TABLE public.halls
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Marquee 1',
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_ur TEXT NOT NULL DEFAULT '';

ALTER TABLE public.hall_settings
  ADD COLUMN IF NOT EXISTS hall_name TEXT NOT NULL DEFAULT 'Marquee 1',
  ADD COLUMN IF NOT EXISTS hall_name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_en TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terms_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en';

-- Ensure rent_seasons & terms/names fallbacks copy existing non-empty English data
UPDATE public.halls
SET
  name = COALESCE(NULLIF(trim(name), ''), 'Marquee 1'),
  address = COALESCE(address, '')
WHERE name IS NULL OR trim(name) = '' OR address IS NULL;

UPDATE public.hall_settings hs
SET
  hall_name = COALESCE(NULLIF(trim(hs.hall_name), ''), h.name, 'Marquee 1'),
  hall_name_ur = COALESCE(NULLIF(trim(hs.hall_name_ur), ''), NULLIF(trim(h.name_ur), ''), ''),
  address = COALESCE(NULLIF(trim(hs.address), ''), h.address, ''),
  address_ur = COALESCE(NULLIF(trim(hs.address_ur), ''), NULLIF(trim(h.address_ur), ''), ''),
  terms_en = COALESCE(hs.terms_en, ''),
  terms_ur = COALESCE(hs.terms_ur, '')
FROM public.halls h
WHERE h.id = hs.hall_id;

-- 3. Bilingual columns on event_types, charge_categories, charges_catalog, expense_categories
ALTER TABLE public.event_types
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '';

ALTER TABLE public.charge_categories
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '';

ALTER TABLE public.charges_catalog
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_label_ur TEXT NOT NULL DEFAULT '';

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ur TEXT NOT NULL DEFAULT '';

-- Copy legacy single-language "name" column into name_en if any table still had "name"
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['event_types', 'charge_categories', 'charges_catalog', 'expense_categories']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'name'
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET name_en = COALESCE(NULLIF(trim(name_en), ''''), trim(name), ''Unnamed'') WHERE name_en IS NULL OR trim(name_en) = ''''',
        tbl
      );
    END IF;
    EXECUTE format(
      'UPDATE public.%I SET name_en = COALESCE(NULLIF(trim(name_en), ''''), ''Unnamed''), name_ur = COALESCE(name_ur, '''') WHERE name_en IS NULL OR name_ur IS NULL',
      tbl
    );
  END LOOP;
END $$;

-- Backfill common Urdu unit labels for charges_catalog where blank
UPDATE public.charges_catalog
SET unit_label_ur = CASE lower(trim(unit_label))
  WHEN 'event' THEN 'تقریب'
  WHEN 'package' THEN 'پیکج'
  WHEN 'unit' THEN 'یونٹ'
  WHEN 'crew' THEN 'عملہ'
  WHEN 'setup' THEN 'سیٹ اپ'
  WHEN 'crate' THEN 'کریٹ'
  WHEN 'hour' THEN 'گھنٹہ'
  WHEN 'day' THEN 'دن'
  ELSE unit_label_ur
END
WHERE (unit_label_ur IS NULL OR trim(unit_label_ur) = '')
  AND unit_label IS NOT NULL;

-- Ensure unique constraints / indexes exist on (hall_id, name_en) before upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_types_hall_name_en ON public.event_types (hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_categories_hall_name_en ON public.charge_categories (hall_id, name_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_hall_name_en ON public.expense_categories (hall_id, name_en);

-- 4. Bilingual item & expense category snapshots for single-language invoices/reports
ALTER TABLE public.booking_items
  ADD COLUMN IF NOT EXISTS item_name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category_name_ur TEXT NOT NULL DEFAULT '';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_name_ur TEXT NOT NULL DEFAULT '';

UPDATE public.booking_items bi
SET
  item_name_ur = COALESCE(NULLIF(trim(bi.item_name_ur), ''), cc.name_ur, ''),
  category_name_ur = COALESCE(NULLIF(trim(bi.category_name_ur), ''), cat.name_ur, '')
FROM public.charges_catalog cc
LEFT JOIN public.charge_categories cat ON cat.id = cc.category_id
WHERE bi.charge_id = cc.id
  AND (trim(COALESCE(bi.item_name_ur, '')) = '' OR trim(COALESCE(bi.category_name_ur, '')) = '');

UPDATE public.booking_items bi
SET category_name_ur = COALESCE(NULLIF(trim(bi.category_name_ur), ''), cat.name_ur, '')
FROM public.charge_categories cat
WHERE cat.hall_id = bi.hall_id
  AND lower(trim(cat.name_en)) = lower(trim(bi.category_name))
  AND trim(COALESCE(bi.category_name_ur, '')) = '';

UPDATE public.expenses ex
SET category_name_ur = COALESCE(NULLIF(trim(ex.category_name_ur), ''), ec.name_ur, '')
FROM public.expense_categories ec
WHERE (ex.category_id = ec.id OR (ex.hall_id = ec.hall_id AND lower(trim(ex.category_name)) = lower(trim(ec.name_en))))
  AND trim(COALESCE(ex.category_name_ur, '')) = '';

-- 5. Bilingual Floors table (preserves 'First' | 'Second' | 'Third' | 'Full Hall' booking keys)
CREATE TABLE IF NOT EXISTS public.floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  floor_key TEXT NOT NULL CHECK (floor_key IN ('First', 'Second', 'Third', 'Full Hall')),
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_hall_floor_key ON public.floors (hall_id, floor_key);

ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read floors in accessible hall" ON public.floors;
CREATE POLICY "Read floors in accessible hall" ON public.floors
  FOR SELECT USING (public.can_access_hall(hall_id));

DROP POLICY IF EXISTS "Edit floors by settings permission" ON public.floors;
CREATE POLICY "Edit floors by settings permission" ON public.floors
  FOR ALL USING (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'))
  WITH CHECK (public.can_access_hall(hall_id) AND public.has_permission('settings', 'edit'));

-- Seed bilingual floor rows for every existing hall safely
INSERT INTO public.floors (hall_id, floor_key, name_en, name_ur, sort_order)
SELECT
  h.id,
  v.floor_key,
  v.name_en,
  v.name_ur,
  v.sort_order
FROM public.halls h
CROSS JOIN (VALUES
  ('First', 'First Floor', 'پہلا فلور', 1),
  ('Second', 'Second Floor', 'دوسرا فلور', 2),
  ('Third', 'Third Floor', 'تیسرا فلور', 3),
  ('Full Hall', 'Full Hall (All 3 Floors)', 'مکمل ہال (تینوں فلور)', 4)
) AS v(floor_key, name_en, name_ur, sort_order)
ON CONFLICT (hall_id, floor_key) DO NOTHING;

COMMIT;
