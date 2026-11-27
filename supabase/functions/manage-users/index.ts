// Supabase Edge Function: manage-users
// Deploy with: supabase functions deploy manage-users
// Secrets required (available by default in Supabase Edge Functions):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY (NEVER exposed to frontend)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowedOrigin =
    origin && (origin.startsWith('https://') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
      ? origin
      : 'null';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type UserRole = 'super_admin' | 'admin' | 'manager';

const DEFAULT_FALLBACK_HALL_ID = '11111111-1111-4111-8111-111111111101';

const ALL_SCREEN_KEYS = [
  'dashboard',
  'calendar',
  'bookings',
  'customers',
  'payments',
  'daily_closing',
  'catalog',
  'expenses',
  'employees',
  'attendance',
  'salaries',
  'reports',
  'invoices',
  'reminders',
  'users',
  'settings',
  'recycle_bin',
  'audit_log',
  'backup_import',
] as const;

type ScreenKey = (typeof ALL_SCREEN_KEYS)[number];

interface PermissionEntryInput {
  screen_key: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ManageUsersPayload {
  action: 'create_user' | 'update_user' | 'update_permissions' | 'reset_password' | 'toggle_active';
  userId?: string;
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  hall_id?: string | null;
  is_active?: boolean;
  permissions?: PermissionEntryInput[];
}

function getAllFalsePermissions(): Record<ScreenKey, PermissionEntryInput> {
  const map = {} as Record<ScreenKey, PermissionEntryInput>;
  for (const key of ALL_SCREEN_KEYS) {
    map[key] = { screen_key: key, can_view: false, can_edit: false, can_delete: false };
  }
  return map;
}

function getDefaultPermissionsForRole(role: UserRole): Record<ScreenKey, PermissionEntryInput> {
  const adminScreens = new Set<string>([
    'dashboard',
    'calendar',
    'bookings',
    'customers',
    'payments',
    'daily_closing',
    'catalog',
    'expenses',
    'employees',
    'attendance',
    'salaries',
    'reports',
    'invoices',
    'reminders',
    'users',
    'settings',
    'backup_import',
  ]);
  const managerEditScreens = new Set<string>([
    'dashboard',
    'calendar',
    'bookings',
    'customers',
    'payments',
    'daily_closing',
    'invoices',
    'reminders',
    'attendance',
  ]);
  const managerViewOnly = new Set<string>(['catalog', 'employees']);

  const map = {} as Record<ScreenKey, PermissionEntryInput>;
  for (const key of ALL_SCREEN_KEYS) {
    if (role === 'super_admin') {
      map[key] = { screen_key: key, can_view: true, can_edit: true, can_delete: true };
    } else if (role === 'admin') {
      const enabled = adminScreens.has(key);
      map[key] = { screen_key: key, can_view: enabled, can_edit: enabled, can_delete: false };
    } else {
      const canEdit = managerEditScreens.has(key);
      const canView = canEdit || managerViewOnly.has(key);
      map[key] = { screen_key: key, can_view: canView, can_edit: canEdit, can_delete: false };
    }
  }
  return map;
}

function normalizePermissionsInput(
  input: PermissionEntryInput[] | undefined,
  fallbackRole: UserRole
): Record<ScreenKey, PermissionEntryInput> {
  if (!input || input.length === 0) {
    return getDefaultPermissionsForRole(fallbackRole);
  }
  const map = getAllFalsePermissions();
  for (const row of input) {
    if ((ALL_SCREEN_KEYS as readonly string[]).includes(row.screen_key)) {
      const k = row.screen_key as ScreenKey;
      const canEdit = Boolean(row.can_edit);
      const canDelete = Boolean(row.can_delete);
      const canView = Boolean(row.can_view) || canEdit || canDelete;
      map[k] = {
        screen_key: k,
        can_view: canView,
        can_edit: canEdit,
        can_delete: canDelete,
      };
    }
  }
  return map;
}

function normalizeDbPermissionRows(
  rows: PermissionEntryInput[] | null | undefined,
  role: UserRole
): Record<ScreenKey, PermissionEntryInput> {
  if (role === 'super_admin') {
    return getDefaultPermissionsForRole('super_admin');
  }
  const map = getAllFalsePermissions();
  for (const row of rows || []) {
    if ((ALL_SCREEN_KEYS as readonly string[]).includes(row.screen_key)) {
      const k = row.screen_key as ScreenKey;
      map[k] = {
        screen_key: k,
        can_view: Boolean(row.can_view),
        can_edit: Boolean(row.can_edit),
        can_delete: Boolean(row.can_delete),
      };
    }
  }
  return map;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: 'Server environment is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse({ ok: false, error: 'Missing Authorization bearer token.' }, 401);
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData?.user) {
      return jsonResponse({ ok: false, error: 'Invalid or expired session token.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile, error: profErr } = await adminClient
      .from('profiles')
      .select('id, role, hall_id, is_active, full_name, email')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profErr || !callerProfile || !callerProfile.is_active) {
      return jsonResponse({ ok: false, error: 'Caller profile is inactive or missing.' }, 403);
    }

    const callerRole = callerProfile.role as UserRole;
    if (callerRole !== 'super_admin' && callerRole !== 'admin') {
      return jsonResponse({ ok: false, error: 'Only Super Admin or Hall Admin can manage users.' }, 403);
    }

    // Load caller's own permissions strictly from DB for Hall Admin (never synthesize defaults)
    const callerPermsMap = new Map<ScreenKey, PermissionEntryInput>();
    if (callerRole === 'admin') {
      if (!callerProfile.hall_id) {
        return jsonResponse({ ok: false, error: 'Admin account has no hall assigned.' }, 403);
      }
      const { data: callerPermRows, error: callerPermErr } = await adminClient
        .from('user_permissions')
        .select('screen_key, can_view, can_edit, can_delete')
        .eq('user_id', callerProfile.id)
        .eq('hall_id', callerProfile.hall_id);

      if (callerPermErr) {
        return jsonResponse({ ok: false, error: callerPermErr.message }, 500);
      }

      for (const k of ALL_SCREEN_KEYS) {
        callerPermsMap.set(k, { screen_key: k, can_view: false, can_edit: false, can_delete: false });
      }
      for (const r of callerPermRows || []) {
        if ((ALL_SCREEN_KEYS as readonly string[]).includes(r.screen_key)) {
          callerPermsMap.set(r.screen_key as ScreenKey, {
            screen_key: r.screen_key,
            can_view: Boolean(r.can_view),
            can_edit: Boolean(r.can_edit),
            can_delete: Boolean(r.can_delete),
          });
        }
      }

      const usersPerm = callerPermsMap.get('users');
      if (!usersPerm?.can_edit) {
        return jsonResponse(
          { ok: false, error: 'You do not have Edit permission on the Users screen.' },
          403
        );
      }
    }

    const validateAdminDelegation = (targetMatrix: Record<ScreenKey, PermissionEntryInput>): string | null => {
      if (callerRole !== 'admin') return null;
      for (const key of ALL_SCREEN_KEYS) {
        const reqPerm = targetMatrix[key];
        const callerPerm = callerPermsMap.get(key) ?? {
          screen_key: key,
          can_view: false,
          can_edit: false,
          can_delete: false,
        };
        if (reqPerm.can_view && !callerPerm.can_view) {
          return `Admin cannot grant View permission for "${key}" because you do not hold it yourself.`;
        }
        if (reqPerm.can_edit && !callerPerm.can_edit) {
          return `Admin cannot grant Edit permission for "${key}" because you do not hold it yourself.`;
        }
        if (reqPerm.can_delete && !callerPerm.can_delete) {
          return `Admin cannot grant Delete permission for "${key}" because you do not hold it yourself.`;
        }
      }
      return null;
    };

    const payload = (await req.json()) as ManageUsersPayload;
    const { action } = payload;

    if (action === 'create_user') {
      const email = (payload.email || '').trim().toLowerCase();
      const password = payload.password || '';
      const fullName = (payload.full_name || '').trim();
      const phone = (payload.phone || '').trim();
      const requestedRole = (payload.role || 'manager') as UserRole;

      if (!email || !fullName || password.length < 6) {
        return jsonResponse(
          { ok: false, error: 'Full name, valid email, and password (min 6 characters) are required.' },
          400
        );
      }

      if (!['super_admin', 'admin', 'manager'].includes(requestedRole)) {
        return jsonResponse({ ok: false, error: 'Invalid role specified.' }, 400);
      }

      let targetHallId: string | null = null;
      if (callerRole === 'admin') {
        if (requestedRole !== 'manager') {
          return jsonResponse(
            { ok: false, error: 'Hall Admin can only create Manager accounts.' },
            403
          );
        }
        if (payload.hall_id !== undefined && payload.hall_id !== callerProfile.hall_id) {
          return jsonResponse(
            { ok: false, error: 'Hall Admin can only create users in their own hall.' },
            403
          );
        }
        targetHallId = callerProfile.hall_id;
      } else {
        targetHallId = requestedRole === 'super_admin' ? null : payload.hall_id || null;
      }

      if (requestedRole !== 'super_admin' && !targetHallId) {
        return jsonResponse({ ok: false, error: 'Please select a Hall for this user.' }, 400);
      }

      if (targetHallId) {
        const { data: hallRow, error: hallErr } = await adminClient
          .from('halls')
          .select('id')
          .eq('id', targetHallId)
          .maybeSingle();
        if (hallErr || !hallRow) {
          return jsonResponse({ ok: false, error: 'Selected hall does not exist.' }, 400);
        }
      }

      const desiredMatrix = normalizePermissionsInput(payload.permissions, requestedRole);
      const delegationErr = validateAdminDelegation(desiredMatrix);
      if (delegationErr) {
        return jsonResponse({ ok: false, error: delegationErr }, 403);
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          role: requestedRole,
          hall_id: targetHallId,
        },
      });

      if (createErr || !created?.user) {
        return jsonResponse({ ok: false, error: createErr?.message || 'Failed to create auth user.' }, 400);
      }

      const { data: upsertedProfile, error: upsertErr } = await adminClient
        .from('profiles')
        .upsert({
          id: created.user.id,
          hall_id: targetHallId,
          full_name: fullName,
          email,
          phone,
          role: requestedRole,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (upsertErr) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ ok: false, error: upsertErr.message }, 400);
      }

      const permHallId = targetHallId || DEFAULT_FALLBACK_HALL_ID;
      const nowIso = new Date().toISOString();
      const permRows = ALL_SCREEN_KEYS.map((key) => ({
        user_id: created.user.id,
        hall_id: permHallId,
        screen_key: key,
        can_view: desiredMatrix[key].can_view,
        can_edit: desiredMatrix[key].can_edit,
        can_delete: desiredMatrix[key].can_delete,
        updated_at: nowIso,
      }));

      const { data: savedPermissions, error: permSaveErr } = await adminClient
        .from('user_permissions')
        .upsert(permRows, { onConflict: 'user_id,hall_id,screen_key' })
        .select('*');

      if (permSaveErr) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ ok: false, error: permSaveErr.message }, 400);
      }

      await adminClient.from('audit_logs').insert({
        hall_id: permHallId,
        actor_id: callerProfile.id,
        actor_name: callerProfile.full_name,
        actor_role: callerRole,
        action: 'PERMISSIONS',
        entity_type: 'user_permissions',
        entity_id: created.user.id,
        entity_label: email,
        changes: {
          event: 'user_created_with_permissions',
          target_role: requestedRole,
          granted_screens: permRows
            .filter((r) => r.can_view || r.can_edit || r.can_delete)
            .map((r) => ({
              screen_key: r.screen_key,
              view: r.can_view,
              edit: r.can_edit,
              delete: r.can_delete,
            })),
        },
      });

      return jsonResponse({ ok: true, profile: upsertedProfile, permissions: savedPermissions || [] });
    }

    // Existing-user operations require userId
    const targetUserId = payload.userId;
    if (!targetUserId) {
      return jsonResponse({ ok: false, error: 'Target userId is required.' }, 400);
    }

    const { data: targetProfile, error: targetErr } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return jsonResponse({ ok: false, error: 'Target user profile not found.' }, 404);
    }

    const isSelfTarget = targetUserId === callerProfile.id;

    if (callerRole === 'admin') {
      if (isSelfTarget) {
        return jsonResponse(
          { ok: false, error: 'Hall Admin cannot modify their own account, role, hall, or permissions.' },
          403
        );
      }
      if (targetProfile.role !== 'manager' || targetProfile.hall_id !== callerProfile.hall_id) {
        return jsonResponse(
          { ok: false, error: 'Hall Admin can only manage Manager accounts in their own hall.' },
          403
        );
      }
    }

    if (action === 'reset_password') {
      const newPassword = payload.password || '';
      if (newPassword.length < 6) {
        return jsonResponse({ ok: false, error: 'New password must be at least 6 characters.' }, 400);
      }
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (pwErr) {
        return jsonResponse({ ok: false, error: pwErr.message }, 400);
      }
      return jsonResponse({ ok: true });
    }

    if (action === 'toggle_active') {
      if (isSelfTarget) {
        return jsonResponse({ ok: false, error: 'Users cannot change their own active status.' }, 403);
      }
      const nextActive = Boolean(payload.is_active);
      const { data: updated, error: actErr } = await adminClient
        .from('profiles')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', targetUserId)
        .select('*')
        .single();
      if (actErr) {
        return jsonResponse({ ok: false, error: actErr.message }, 400);
      }
      return jsonResponse({ ok: true, profile: updated });
    }

    if (action === 'update_user' || action === 'update_permissions') {
      if (isSelfTarget) {
        if (action === 'update_permissions' || (payload.permissions && payload.permissions.length > 0)) {
          return jsonResponse({ ok: false, error: 'Users cannot modify their own permissions.' }, 403);
        }
        if (payload.role !== undefined && payload.role !== targetProfile.role) {
          return jsonResponse({ ok: false, error: 'Users cannot change their own role.' }, 403);
        }
        if (payload.hall_id !== undefined && payload.hall_id !== targetProfile.hall_id) {
          return jsonResponse({ ok: false, error: 'Users cannot change their own hall assignment.' }, 403);
        }
        if (payload.is_active !== undefined && Boolean(payload.is_active) !== Boolean(targetProfile.is_active)) {
          return jsonResponse({ ok: false, error: 'Users cannot change their own active status.' }, 403);
        }
      }

      if (payload.role !== undefined && !['super_admin', 'admin', 'manager'].includes(payload.role)) {
        return jsonResponse({ ok: false, error: 'Invalid role specified.' }, 400);
      }

      if (callerRole === 'admin') {
        if (payload.role !== undefined && payload.role !== 'manager') {
          return jsonResponse({ ok: false, error: 'Hall Admin cannot promote users above Manager.' }, 403);
        }
        if (payload.hall_id !== undefined && payload.hall_id !== callerProfile.hall_id) {
          return jsonResponse({ ok: false, error: 'Hall Admin cannot move users to another hall.' }, 403);
        }
      }

      const nextRole = callerRole === 'super_admin' ? ((payload.role ?? targetProfile.role) as UserRole) : (targetProfile.role as UserRole);
      const nextHallIdCandidate =
        callerRole === 'super_admin'
          ? nextRole === 'super_admin'
            ? null
            : payload.hall_id !== undefined
              ? payload.hall_id
              : targetProfile.hall_id
          : targetProfile.hall_id;

      if (nextRole !== 'super_admin' && !nextHallIdCandidate) {
        return jsonResponse({ ok: false, error: 'Assigned hall is required for Admin and Manager accounts.' }, 400);
      }

      let desiredMatrix: Record<ScreenKey, PermissionEntryInput> | null = null;
      if (payload.permissions && payload.permissions.length > 0) {
        desiredMatrix = normalizePermissionsInput(payload.permissions, nextRole);
        const delegationErr = validateAdminDelegation(desiredMatrix);
        if (delegationErr) {
          return jsonResponse({ ok: false, error: delegationErr }, 403);
        }
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (payload.full_name !== undefined) patch.full_name = payload.full_name.trim();
      if (payload.phone !== undefined) patch.phone = payload.phone.trim();
      if (payload.is_active !== undefined && !isSelfTarget) {
        patch.is_active = Boolean(payload.is_active);
      }
      if (callerRole === 'super_admin' && !isSelfTarget) {
        if (payload.role !== undefined) patch.role = nextRole;
        if (payload.hall_id !== undefined || nextRole === 'super_admin') patch.hall_id = nextHallIdCandidate;
      }

      const { data: updated, error: updErr } = await adminClient
        .from('profiles')
        .update(patch)
        .eq('id', targetUserId)
        .select('*')
        .single();
      if (updErr) {
        return jsonResponse({ ok: false, error: updErr.message }, 400);
      }

      let savedPermissions: unknown[] | undefined = undefined;
      if (desiredMatrix) {
        const nextHallId = (updated.hall_id || targetProfile.hall_id || DEFAULT_FALLBACK_HALL_ID) as string;

        // Load old permissions for diff audit log (no synthetic defaults for non-super_admin)
        const oldHallId = (targetProfile.hall_id || nextHallId) as string;
        const { data: oldRows } = await adminClient
          .from('user_permissions')
          .select('screen_key, can_view, can_edit, can_delete')
          .eq('user_id', targetUserId)
          .eq('hall_id', oldHallId);

        const oldMatrix = normalizeDbPermissionRows(
          oldRows as PermissionEntryInput[] | null,
          targetProfile.role as UserRole
        );

        const changedScreens: Array<{
          screen_key: string;
          before: { view: boolean; edit: boolean; delete: boolean };
          after: { view: boolean; edit: boolean; delete: boolean };
        }> = [];

        for (const key of ALL_SCREEN_KEYS) {
          const o = oldMatrix[key];
          const n = desiredMatrix[key];
          if (
            Boolean(o.can_view) !== Boolean(n.can_view) ||
            Boolean(o.can_edit) !== Boolean(n.can_edit) ||
            Boolean(o.can_delete) !== Boolean(n.can_delete)
          ) {
            changedScreens.push({
              screen_key: key,
              before: { view: Boolean(o.can_view), edit: Boolean(o.can_edit), delete: Boolean(o.can_delete) },
              after: { view: Boolean(n.can_view), edit: Boolean(n.can_edit), delete: Boolean(n.can_delete) },
            });
          }
        }

        if (targetProfile.hall_id && targetProfile.hall_id !== nextHallId) {
          await adminClient
            .from('user_permissions')
            .delete()
            .eq('user_id', targetUserId)
            .eq('hall_id', targetProfile.hall_id);
        }

        const nowIso = new Date().toISOString();
        const permRows = ALL_SCREEN_KEYS.map((key) => ({
          user_id: targetUserId,
          hall_id: nextHallId,
          screen_key: key,
          can_view: desiredMatrix![key].can_view,
          can_edit: desiredMatrix![key].can_edit,
          can_delete: desiredMatrix![key].can_delete,
          updated_at: nowIso,
        }));

        const { data: upsertedPerms, error: permSaveErr } = await adminClient
          .from('user_permissions')
          .upsert(permRows, { onConflict: 'user_id,hall_id,screen_key' })
          .select('*');

        if (permSaveErr) {
          return jsonResponse({ ok: false, error: permSaveErr.message }, 400);
        }
        savedPermissions = upsertedPerms || [];

        if (changedScreens.length > 0) {
          await adminClient.from('audit_logs').insert({
            hall_id: nextHallId,
            actor_id: callerProfile.id,
            actor_name: callerProfile.full_name,
            actor_role: callerRole,
            action: 'PERMISSIONS',
            entity_type: 'user_permissions',
            entity_id: targetUserId,
            entity_label: targetProfile.email,
            changes: {
              event: 'permissions_updated',
              target_role: nextRole,
              changed_screens: changedScreens,
            },
          });
        }
      }

      return jsonResponse({ ok: true, profile: updated, permissions: savedPermissions });
    }

    return jsonResponse({ ok: false, error: 'Unknown action.' }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected server error.';
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
