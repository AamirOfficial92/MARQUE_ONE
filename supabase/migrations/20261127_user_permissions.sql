-- ============================================================================
-- Migration: Flexible Per-User, Per-Screen Permissions & RLS Enforcement
-- Safe & idempotent for existing running Supabase databases.
-- Preserves unrestricted Super Admin access and backfills default role templates
-- for existing Admin and Manager accounts (with Delete OFF by default).
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

CREATE INDEX IF NOT EXISTS idx_user_permissions_lookup
  ON public.user_permissions(user_id, hall_id, screen_key);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- SQL helper used in RLS policies across every business table
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

-- Update new auth user trigger so future accounts also receive default template rows
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

-- Backfill permissions for all existing profiles without overwriting any customized rows
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, hall_id, role FROM public.profiles LOOP
    PERFORM public.seed_default_permissions_for_user(rec.id, rec.hall_id, rec.role);
  END LOOP;
END $$;

-- Recreate all public RLS policies using has_permission() + can_access_hall()
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
