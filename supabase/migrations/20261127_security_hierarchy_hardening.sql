-- ============================================================================
-- Migration: Security & Role Hierarchy Hardening
-- Enforces database-level protection so:
--   1. No user (including Admin and Super Admin) can change their own role,
--      hall assignment, active status, or screen permissions via client JWT.
--   2. Hall Admins can only manage Managers in their own hall and can only
--      grant permissions they personally hold in public.user_permissions.
--   3. Direct client-side profile inserts and metadata-based role escalation
--      in handle_new_auth_user() are blocked.
-- Safe, transactional, and idempotent.
-- ============================================================================

BEGIN;

-- 1. Harden handle_new_auth_user() so client-supplied user_metadata cannot self-assign admin/super_admin
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
    -- Server-side manage-users Edge Function sets elevated roles/halls via service_role upsert.
    -- Auth trigger defaults all non-bootstrap signups strictly to manager.
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

-- 2. Block direct client inserts into public.profiles
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

-- 3. Prevent self role/hall/active-status changes & enforce Admin -> Manager / own-hall hierarchy on profiles UPDATE
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

-- 4. Prevent self-modification of permissions & enforce hierarchy/delegation on user_permissions
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

-- 5. Tighten RLS policies on public.profiles and public.user_permissions
DROP POLICY IF EXISTS "First user bootstrap super_admin" ON public.profiles;
DROP POLICY IF EXISTS "Users update own theme preference" ON public.profiles;
DROP POLICY IF EXISTS "Super admin manages all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin with users edit manages managers in own hall" ON public.profiles;

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

DROP POLICY IF EXISTS "Super admin manages all user permissions" ON public.user_permissions;
CREATE POLICY "Super admin manages all user permissions" ON public.user_permissions
  FOR ALL USING (public.current_user_role() = 'super_admin' AND user_id <> auth.uid())
  WITH CHECK (public.current_user_role() = 'super_admin' AND user_id <> auth.uid());

COMMIT;
