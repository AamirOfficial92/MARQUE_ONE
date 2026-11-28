-- ============================================================================
-- Migration: Two-Level Event Categories/Events & Expense Categories/Sub-categories
-- Plus 'event_categories' and 'expense_categories' permission keys
-- Fully idempotent & transactional
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. EVENT CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_categories_hall_name
  ON public.event_categories (hall_id, name_en);

-- ----------------------------------------------------------------------------
-- 2. ALTER EVENT_TYPES FOR TWO-LEVEL HIERARCHY
-- ----------------------------------------------------------------------------
ALTER TABLE public.event_types
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.event_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Replace old (hall_id, name_en) uniqueness with (hall_id, category_id, name_en)
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'event_types'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%category_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.event_types DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.uq_event_types_hall_name;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_types_hall_cat_name
  ON public.event_types (hall_id, category_id, name_en);

-- ----------------------------------------------------------------------------
-- 3. ALTER BOOKINGS FOR EVENT CATEGORY / EVENT FK + CUSTOM OTHER NAME
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS event_category_id UUID REFERENCES public.event_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS event_type_id UUID REFERENCES public.event_types(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS event_other_name TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- 4. ALTER EXPENSE_CATEGORIES & CREATE EXPENSE_SUBCATEGORIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_hall_name
  ON public.expense_categories (hall_id, name_en);

CREATE TABLE IF NOT EXISTS public.expense_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES public.halls(id) ON DELETE CASCADE DEFAULT '11111111-1111-4111-8111-111111111101',
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  name_en TEXT NOT NULL,
  name_ur TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_subcategories_hall_cat_name
  ON public.expense_subcategories (hall_id, category_id, name_en);

-- ----------------------------------------------------------------------------
-- 5. ALTER EXPENSES FOR SUB-CATEGORY & MANUAL OTHER DESCRIPTION
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category_name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.expense_subcategories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS subcategory_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subcategory_name_ur TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manual_description TEXT NOT NULL DEFAULT '';

-- Tighten expenses.category_id FK from ON DELETE SET NULL to ON DELETE RESTRICT
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'expenses'
    AND att.attname = 'category_id'
    AND con.contype = 'f'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.expenses DROP CONSTRAINT %I', fk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass AND conname = 'expenses_category_id_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. BLOCK HARD DELETES ON EVENT & EXPENSE TAXONOMY TABLES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_taxonomy_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is disabled for %. Deactivate or move to Recycle Bin instead.', TG_TABLE_NAME
    USING ERRCODE = '23503';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_hard_delete_event_categories ON public.event_categories;
CREATE TRIGGER trg_block_hard_delete_event_categories
  BEFORE DELETE ON public.event_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.block_taxonomy_hard_delete();

DROP TRIGGER IF EXISTS trg_block_hard_delete_event_types ON public.event_types;
CREATE TRIGGER trg_block_hard_delete_event_types
  BEFORE DELETE ON public.event_types
  FOR EACH ROW
  EXECUTE FUNCTION public.block_taxonomy_hard_delete();

DROP TRIGGER IF EXISTS trg_block_hard_delete_expense_categories ON public.expense_categories;
CREATE TRIGGER trg_block_hard_delete_expense_categories
  BEFORE DELETE ON public.expense_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.block_taxonomy_hard_delete();

DROP TRIGGER IF EXISTS trg_block_hard_delete_expense_subcategories ON public.expense_subcategories;
CREATE TRIGGER trg_block_hard_delete_expense_subcategories
  BEFORE DELETE ON public.expense_subcategories
  FOR EACH ROW
  EXECUTE FUNCTION public.block_taxonomy_hard_delete();

-- ----------------------------------------------------------------------------
-- 7. PERMISSION KEYS: ADD 'event_categories' AND 'expense_categories'
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_screen_key_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_screen_key_check CHECK (screen_key IN (
    'dashboard','calendar','bookings','customers','payments','daily_closing','catalog',
    'expenses','employees','attendance','salaries','reports','invoices','reminders',
    'users','settings','halls','event_categories','expense_categories',
    'recycle_bin','audit_log','backup_import'
  ));

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
    'users','settings','halls','event_categories','expense_categories',
    'recycle_bin','audit_log','backup_import'
  ];
BEGIN
  FOREACH v_screen IN ARRAY all_screens LOOP
    IF p_role = 'super_admin' THEN
      v_view := true;
      v_edit := true;
      v_del := true;
    ELSIF p_role = 'admin' THEN
      v_view := v_screen NOT IN ('recycle_bin', 'audit_log', 'event_categories', 'expense_categories');
      v_edit := v_screen NOT IN ('recycle_bin', 'audit_log', 'event_categories', 'expense_categories');
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

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, hall_id, role FROM public.profiles LOOP
    PERFORM public.seed_default_permissions_for_user(rec.id, rec.hall_id, rec.role);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY POLICIES FOR EVENT & EXPENSE TAXONOMY TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_subcategories ENABLE ROW LEVEL SECURITY;

-- event_categories
DROP POLICY IF EXISTS "Read hall event categories by permission" ON public.event_categories;
CREATE POLICY "Read hall event categories by permission" ON public.event_categories
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('event_categories', 'view')
        OR public.has_permission('settings', 'view')
        OR public.has_permission('bookings', 'view')
        OR public.has_permission('calendar', 'view')
        OR public.has_permission('dashboard', 'view')
        OR public.has_permission('reports', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );

DROP POLICY IF EXISTS "Insert hall event categories by permission" ON public.event_categories;
CREATE POLICY "Insert hall event categories by permission" ON public.event_categories
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('event_categories', 'edit')
  );

DROP POLICY IF EXISTS "Update hall event categories by permission" ON public.event_categories;
CREATE POLICY "Update hall event categories by permission" ON public.event_categories
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      public.has_permission('event_categories', 'edit')
      OR public.has_permission('event_categories', 'delete')
      OR public.has_permission('recycle_bin', 'edit')
    )
  );

DROP POLICY IF EXISTS "Block hard delete event categories" ON public.event_categories;
CREATE POLICY "Block hard delete event categories" ON public.event_categories
  FOR DELETE USING (false);

-- event_types
DROP POLICY IF EXISTS "Read hall event types by permission" ON public.event_types;
CREATE POLICY "Read hall event types by permission" ON public.event_types
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('event_categories', 'view')
        OR public.has_permission('settings', 'view')
        OR public.has_permission('bookings', 'view')
        OR public.has_permission('calendar', 'view')
        OR public.has_permission('dashboard', 'view')
        OR public.has_permission('reports', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );

DROP POLICY IF EXISTS "Insert hall event types by permission" ON public.event_types;
CREATE POLICY "Insert hall event types by permission" ON public.event_types
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('event_categories', 'edit')
  );

DROP POLICY IF EXISTS "Update hall event types by permission" ON public.event_types;
CREATE POLICY "Update hall event types by permission" ON public.event_types
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      public.has_permission('event_categories', 'edit')
      OR public.has_permission('event_categories', 'delete')
      OR public.has_permission('recycle_bin', 'edit')
    )
  );

DROP POLICY IF EXISTS "Delete hall event types by permission" ON public.event_types;
CREATE POLICY "Block hard delete event types" ON public.event_types
  FOR DELETE USING (false);

-- expense_categories
DROP POLICY IF EXISTS "Read expense categories by permission" ON public.expense_categories;
CREATE POLICY "Read expense categories by permission" ON public.expense_categories
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('expense_categories', 'view')
        OR public.has_permission('expenses', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('salaries', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );

DROP POLICY IF EXISTS "Insert expense categories by permission" ON public.expense_categories;
CREATE POLICY "Insert expense categories by permission" ON public.expense_categories
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('expense_categories', 'edit')
  );

DROP POLICY IF EXISTS "Update expense categories by permission" ON public.expense_categories;
CREATE POLICY "Update expense categories by permission" ON public.expense_categories
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      public.has_permission('expense_categories', 'edit')
      OR public.has_permission('expense_categories', 'delete')
      OR public.has_permission('recycle_bin', 'edit')
    )
  );

DROP POLICY IF EXISTS "Delete expense categories by permission" ON public.expense_categories;
CREATE POLICY "Block hard delete expense categories" ON public.expense_categories
  FOR DELETE USING (false);

-- expense_subcategories
DROP POLICY IF EXISTS "Read expense subcategories by permission" ON public.expense_subcategories;
CREATE POLICY "Read expense subcategories by permission" ON public.expense_subcategories
  FOR SELECT USING (
    public.can_access_hall(hall_id)
    AND (
      (deleted_at IS NULL AND (
        public.has_permission('expense_categories', 'view')
        OR public.has_permission('expenses', 'view')
        OR public.has_permission('reports', 'view')
        OR public.has_permission('salaries', 'view')
      ))
      OR (deleted_at IS NOT NULL AND public.has_permission('recycle_bin', 'view'))
    )
  );

DROP POLICY IF EXISTS "Insert expense subcategories by permission" ON public.expense_subcategories;
CREATE POLICY "Insert expense subcategories by permission" ON public.expense_subcategories
  FOR INSERT WITH CHECK (
    public.can_access_hall(hall_id)
    AND public.has_permission('expense_categories', 'edit')
  );

DROP POLICY IF EXISTS "Update expense subcategories by permission" ON public.expense_subcategories;
CREATE POLICY "Update expense subcategories by permission" ON public.expense_subcategories
  FOR UPDATE USING (
    public.can_access_hall(hall_id)
    AND (
      public.has_permission('expense_categories', 'edit')
      OR public.has_permission('expense_categories', 'delete')
      OR public.has_permission('recycle_bin', 'edit')
    )
  );

DROP POLICY IF EXISTS "Block hard delete expense subcategories" ON public.expense_subcategories;
CREATE POLICY "Block hard delete expense subcategories" ON public.expense_subcategories
  FOR DELETE USING (false);

-- ----------------------------------------------------------------------------
-- 9. DATA MIGRATION & TWO-LEVEL SAMPLE SEEDING ACROSS EVERY HALL
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  h_rec RECORD;
  v_uncat_id UUID;
  v_wed_id UUID;
  v_fam_id UUID;
  v_corp_id UUID;
  v_ev_other_cat_id UUID;

  v_sal_id UUID;
  v_dw_id UUID;
  v_util_id UUID;
  v_clean_id UUID;
  v_maint_id UUID;
  v_vend_id UUID;
  v_exp_other_id UUID;

  v_sub_sal_monthly UUID;
  v_sub_sal_adv UUID;
  v_sub_dw_waiters UUID;
  v_sub_dw_helpers UUID;
  v_sub_vend_sound UUID;
  v_sub_vend_decor UUID;
  v_sub_vend_florist UUID;
BEGIN
  FOR h_rec IN SELECT id FROM public.halls LOOP
    -- A) Preserve any legacy flat event_types under 'Uncategorized'
    IF EXISTS (
      SELECT 1 FROM public.event_types
      WHERE hall_id = h_rec.id AND category_id IS NULL
    ) THEN
      INSERT INTO public.event_categories (hall_id, name_en, name_ur, sort_order, is_active)
      VALUES (h_rec.id, 'Uncategorized', 'غیر زمرہ بند', 99, true)
      ON CONFLICT (hall_id, name_en) DO UPDATE
        SET name_ur = COALESCE(NULLIF(public.event_categories.name_ur, ''), EXCLUDED.name_ur)
      RETURNING id INTO v_uncat_id;

      UPDATE public.event_types
      SET category_id = v_uncat_id
      WHERE hall_id = h_rec.id AND category_id IS NULL;
    END IF;

    -- B) Seed Two-Level Event Categories & Events
    INSERT INTO public.event_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Wedding Ceremony', 'شادی کی تقریبات', 1, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_wed_id;

    INSERT INTO public.event_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Family & Social', 'خاندانی و سماجی تقریبات', 2, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_fam_id;

    INSERT INTO public.event_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Corporate', 'کارپوریٹ تقریبات', 3, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_corp_id;

    INSERT INTO public.event_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Other', 'دیگر', 4, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_ev_other_cat_id;

    INSERT INTO public.event_types (hall_id, category_id, name_en, name_ur, color_hex, is_default, sort_order, is_active)
    VALUES
      (h_rec.id, v_wed_id, 'Baraat', 'بارات', '#F59E0B', true, 1, true),
      (h_rec.id, v_wed_id, 'Mayun', 'مایوں', '#EAB308', true, 2, true),
      (h_rec.id, v_wed_id, 'Mangni (Engagement)', 'منگنی', '#FB7185', true, 3, true),
      (h_rec.id, v_wed_id, 'Nikah', 'نکاح', '#14B8A6', true, 4, true),
      (h_rec.id, v_wed_id, 'Mehendi', 'مہندی', '#22C55E', true, 5, true),
      (h_rec.id, v_wed_id, 'Walima', 'ولیمہ', '#06B6D4', true, 6, true),
      (h_rec.id, v_fam_id, 'Birthday', 'سالگرہ', '#EC4899', true, 1, true),
      (h_rec.id, v_fam_id, 'Aqiqah', 'عقیقہ', '#6366F1', true, 2, true),
      (h_rec.id, v_fam_id, 'Anniversary', 'سالگرہِ شادی', '#F97316', true, 3, true),
      (h_rec.id, v_corp_id, 'Conference', 'کانفرنس', '#8B5CF6', true, 1, true),
      (h_rec.id, v_corp_id, 'Seminar', 'سیمینار', '#10B981', true, 2, true),
      (h_rec.id, v_corp_id, 'Workshop', 'ورکشاپ', '#0EA5E9', true, 3, true),
      (h_rec.id, v_ev_other_cat_id, 'Other', 'دیگر', '#64748B', true, 1, true)
    ON CONFLICT (hall_id, category_id, name_en) DO NOTHING;

    -- Backfill existing bookings with matching event_type_id / event_category_id (preferring existing event_type match)
    UPDATE public.bookings b
    SET
      event_type_id = et.id,
      event_category_id = et.category_id
    FROM LATERAL (
      SELECT t.id, t.category_id
      FROM public.event_types t
      WHERE t.hall_id = b.hall_id
        AND lower(trim(t.name_en)) = lower(trim(b.event_type))
      ORDER BY (t.category_id = v_uncat_id) DESC, t.created_at ASC
      LIMIT 1
    ) et
    WHERE b.hall_id = h_rec.id
      AND (b.event_type_id IS NULL OR b.event_category_id IS NULL);

    -- C) Seed Two-Level Expense Categories & Sub-categories
    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Salaries', 'تنخواہیں', 1, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_sal_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Daily Wages', 'یومیہ اجرت', 2, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_dw_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Utilities', 'بجلی، گیس اور یوٹیلیٹیز', 3, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_util_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Cleaning', 'صفائی ستھرائی', 4, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_clean_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Maintenance', 'مرمت و دیکھ بھال', 5, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_maint_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Vendors', 'وینڈرز / ٹھیکیدار', 6, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_vend_id;

    INSERT INTO public.expense_categories (hall_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, 'Other', 'دیگر اخراجات', 7, true)
    ON CONFLICT (hall_id, name_en) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, is_active = true
    RETURNING id INTO v_exp_other_id;

    -- Seed Expense Subcategories
    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_sal_id, 'Monthly Salaries', 'ماہانہ تنخواہیں', 1, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_sal_monthly;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_sal_id, 'Advances', 'ایڈوانس تنخواہ', 2, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_sal_adv;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_dw_id, 'Waiters', 'ویٹرز', 1, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_dw_waiters;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_dw_id, 'Helpers', 'ہیلپرز', 2, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_dw_helpers;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES
      (h_rec.id, v_util_id, 'Electricity', 'بجلی', 1, true),
      (h_rec.id, v_util_id, 'Gas', 'گیس', 2, true),
      (h_rec.id, v_util_id, 'Water', 'پانی', 3, true),
      (h_rec.id, v_util_id, 'Internet', 'انٹرنیٹ', 4, true)
    ON CONFLICT (hall_id, category_id, name_en) DO NOTHING;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_vend_id, 'Sound', 'ساؤنڈ سسٹم', 1, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_vend_sound;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_vend_id, 'Decoration', 'ڈیکوریشن', 2, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_vend_decor;

    INSERT INTO public.expense_subcategories (hall_id, category_id, name_en, name_ur, sort_order, is_active)
    VALUES (h_rec.id, v_vend_id, 'Florist', 'پھولوں کا خرچ', 3, true)
    ON CONFLICT (hall_id, category_id, name_en) DO UPDATE SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_sub_vend_florist;

    -- D) Re-map existing flat expenses to the new 2-level categories/subcategories
    UPDATE public.expenses
    SET
      category_id = v_vend_id,
      category_name = 'Vendors',
      category_name_ur = 'وینڈرز / ٹھیکیدار',
      subcategory_id = v_sub_vend_sound,
      subcategory_name = 'Sound',
      subcategory_name_ur = 'ساؤنڈ سسٹم'
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) = 'sound' AND subcategory_id IS NULL;

    UPDATE public.expenses
    SET
      category_id = v_vend_id,
      category_name = 'Vendors',
      category_name_ur = 'وینڈرز / ٹھیکیدار',
      subcategory_id = v_sub_vend_decor,
      subcategory_name = 'Decoration',
      subcategory_name_ur = 'ڈیکوریشن'
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) = 'decoration' AND subcategory_id IS NULL;

    UPDATE public.expenses
    SET
      category_id = v_vend_id,
      category_name = 'Vendors',
      category_name_ur = 'وینڈرز / ٹھیکیدار',
      subcategory_id = v_sub_vend_florist,
      subcategory_name = 'Florist',
      subcategory_name_ur = 'پھولوں کا خرچ'
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) = 'florist' AND subcategory_id IS NULL;

    UPDATE public.expenses
    SET
      category_id = v_dw_id,
      category_name = 'Daily Wages',
      category_name_ur = 'یومیہ اجرت',
      subcategory_id = v_sub_dw_waiters,
      subcategory_name = 'Waiters',
      subcategory_name_ur = 'ویٹرز'
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) IN ('waiters (daily wage)', 'waiters') AND subcategory_id IS NULL;

    UPDATE public.expenses
    SET
      category_id = v_dw_id,
      category_name = 'Daily Wages',
      category_name_ur = 'یومیہ اجرت',
      subcategory_id = v_sub_dw_helpers,
      subcategory_name = 'Helpers',
      subcategory_name_ur = 'ہیلپرز'
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) IN ('peon', 'sweeper', 'helpers') AND subcategory_id IS NULL;

    UPDATE public.expenses
    SET
      category_id = v_sal_id,
      category_name = 'Salaries',
      category_name_ur = 'تنخواہیں',
      subcategory_id = CASE
        WHEN COALESCE(reference_no, '') ILIKE 'ADV-%' OR COALESCE(notes, '') ILIKE '%advance%'
        THEN v_sub_sal_adv
        ELSE v_sub_sal_monthly
      END,
      subcategory_name = CASE
        WHEN COALESCE(reference_no, '') ILIKE 'ADV-%' OR COALESCE(notes, '') ILIKE '%advance%'
        THEN 'Advances'
        ELSE 'Monthly Salaries'
      END,
      subcategory_name_ur = CASE
        WHEN COALESCE(reference_no, '') ILIKE 'ADV-%' OR COALESCE(notes, '') ILIKE '%advance%'
        THEN 'ایڈوانس تنخواہ'
        ELSE 'ماہانہ تنخواہیں'
      END
    WHERE hall_id = h_rec.id AND lower(trim(category_name)) = 'salaries' AND subcategory_id IS NULL;

    -- Populate missing Urdu names on remaining expenses from expense_categories
    UPDATE public.expenses e
    SET category_name_ur = ec.name_ur
    FROM public.expense_categories ec
    WHERE e.hall_id = h_rec.id
      AND e.category_id = ec.id
      AND COALESCE(e.category_name_ur, '') = '';

    -- Archive (soft-delete) old flat categories that are now represented as sub-categories,
    -- only if no expense row still points directly to them
    UPDATE public.expense_categories ec
    SET is_active = false, deleted_at = COALESCE(ec.deleted_at, now())
    WHERE ec.hall_id = h_rec.id
      AND ec.name_en IN ('Sound', 'Decoration', 'Florist', 'Peon', 'Sweeper', 'Waiters (Daily Wage)')
      AND NOT EXISTS (
        SELECT 1 FROM public.expenses ex WHERE ex.category_id = ec.id
      );
  END LOOP;
END $$;

COMMIT;
