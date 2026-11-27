import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Edit3,
  KeyRound,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { translateRole } from '../i18n/translations';
import {
  PermissionAction,
  PermissionScreenKey,
  ScreenPermissionEntry,
  UserProfile,
  UserRole,
} from '../types';
import { formatPakistaniPhoneInput } from '../utils/formatters';
import {
  SCREEN_DEFINITIONS,
  getDefaultPermissionsForRole,
  hasMatrixPermission,
  toPermissionMatrix,
} from '../utils/permissions';

interface PermissionsChecklistProps {
  entries: ScreenPermissionEntry[];
  onChange: (next: ScreenPermissionEntry[]) => void;
  targetRole: UserRole;
  actorRole: UserRole | undefined;
  actorMatrix: ReturnType<typeof useApp>['currentUserPermissions'];
  lang: 'en' | 'ur';
  disabled?: boolean;
}

const PermissionsChecklist: React.FC<PermissionsChecklistProps> = ({
  entries,
  onChange,
  targetRole,
  actorRole,
  actorMatrix,
  lang,
  disabled = false,
}) => {
  const matrix = useMemo(() => toPermissionMatrix(entries, targetRole), [entries, targetRole]);
  const isTargetSuperAdmin = targetRole === 'super_admin';
  const isActorAdmin = actorRole === 'admin';

  const isCellLocked = (screenKey: PermissionScreenKey, action: PermissionAction): boolean => {
    if (disabled || isTargetSuperAdmin) return true;
    if (isActorAdmin) {
      return !hasMatrixPermission(actorMatrix, actorRole, screenKey, action);
    }
    return false;
  };

  const handleToggle = (screenKey: PermissionScreenKey, action: PermissionAction, checked: boolean) => {
    if (isCellLocked(screenKey, action)) return;

    const nextEntries = SCREEN_DEFINITIONS.map((def) => {
      const current = matrix[def.key] || {
        screen_key: def.key,
        can_view: false,
        can_edit: false,
        can_delete: false,
      };
      if (def.key !== screenKey) return { ...current };

      let { can_view, can_edit, can_delete } = current;
      if (action === 'view') {
        can_view = checked;
        if (!checked) {
          can_edit = false;
          can_delete = false;
        }
      } else if (action === 'edit') {
        can_edit = checked;
        if (checked && !isCellLocked(screenKey, 'view')) {
          can_view = true;
        }
      } else {
        can_delete = checked;
        if (checked && !isCellLocked(screenKey, 'view')) {
          can_view = true;
        }
      }
      return { screen_key: def.key, can_view, can_edit, can_delete };
    });

    onChange(nextEntries);
  };

  const handleResetTemplate = () => {
    if (disabled || isTargetSuperAdmin) return;
    const template = getDefaultPermissionsForRole(targetRole);
    if (isActorAdmin) {
      // Clamp template to permissions the Admin holds
      onChange(
        template.map((entry) => ({
          screen_key: entry.screen_key,
          can_view:
            entry.can_view && hasMatrixPermission(actorMatrix, actorRole, entry.screen_key, 'view'),
          can_edit:
            entry.can_edit && hasMatrixPermission(actorMatrix, actorRole, entry.screen_key, 'edit'),
          can_delete:
            entry.can_delete && hasMatrixPermission(actorMatrix, actorRole, entry.screen_key, 'delete'),
        }))
      );
    } else {
      onChange(template);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Screen Permissions Matrix (19 Screens)</span>
        </div>
        {!disabled && !isTargetSuperAdmin && (
          <button
            type="button"
            onClick={handleResetTemplate}
            className="text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900/60"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to {translateRole(targetRole, lang)} Default</span>
          </button>
        )}
      </div>

      {isTargetSuperAdmin && (
        <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-[11px] text-cyan-200">
          Super Admin automatically has unrestricted View, Edit, and Delete access across all screens and all halls.
        </div>
      )}

      {isActorAdmin && !isTargetSuperAdmin && (
        <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-200 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Delegation rule: You can only grant permissions that you hold yourself. Locked options are permissions not enabled on your own account.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-80 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
            <tr>
              <th className="py-2 px-3 text-start">Screen</th>
              <th className="py-2 px-2.5 text-center w-14">View</th>
              <th className="py-2 px-2.5 text-center w-14">Edit</th>
              <th className="py-2 px-2.5 text-center w-14">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {SCREEN_DEFINITIONS.map((def) => {
              const row = matrix[def.key] || {
                screen_key: def.key,
                can_view: false,
                can_edit: false,
                can_delete: false,
              };
              const viewChecked = isTargetSuperAdmin ? true : row.can_view;
              const editChecked = isTargetSuperAdmin ? true : row.can_edit;
              const deleteChecked = isTargetSuperAdmin ? true : row.can_delete;

              const viewLocked = isCellLocked(def.key, 'view');
              const editLocked = isCellLocked(def.key, 'edit');
              const deleteLocked = isCellLocked(def.key, 'delete');

              return (
                <tr key={def.key} className="hover:bg-slate-900/40">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {def.sensitive && (
                        <span title="Sensitive financial / system screen">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </span>
                      )}
                      <span className="font-medium text-slate-100">
                        {lang === 'ur' ? def.labelUr : def.labelEn}
                      </span>
                      {def.sensitive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-300">
                          Sensitive
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={viewChecked}
                      disabled={viewLocked}
                      title={viewLocked && isActorAdmin ? 'You do not hold View permission for this screen' : 'View'}
                      onChange={(e) => handleToggle(def.key, 'view', e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="py-2 px-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={editChecked}
                      disabled={editLocked}
                      title={editLocked && isActorAdmin ? 'You do not hold Edit permission for this screen' : 'Create / Edit'}
                      onChange={(e) => handleToggle(def.key, 'edit', e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-violet-500 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="py-2 px-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={deleteChecked}
                      disabled={deleteLocked}
                      title={
                        deleteLocked && isActorAdmin
                          ? 'You do not hold Delete permission for this screen'
                          : 'Delete (Off by default except Super Admin)'
                      }
                      onChange={(e) => handleToggle(def.key, 'delete', e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const UsersView: React.FC = () => {
  const {
    db,
    lang,
    currentUser,
    currentUserPermissions,
    can,
    getPermissionsForUser,
    activeHallId,
    activeHall,
    supabaseLive,
    manageUserWithEdgeFunction,
  } = useApp();

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canEditUsers = can('users', 'edit');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('manager');
  const [hallId, setHallId] = useState<string>(activeHallId);
  const [password, setPassword] = useState('');
  const [createPermissions, setCreatePermissions] = useState<ScreenPermissionEntry[]>(() =>
    getDefaultPermissionsForRole('manager')
  );
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Edit User & Permissions modal state
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('manager');
  const [editHallId, setEditHallId] = useState<string>(activeHallId);
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editPermissions, setEditPermissions] = useState<ScreenPermissionEntry[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Password modal state
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const clampPermissionsForActor = (entries: ScreenPermissionEntry[]): ScreenPermissionEntry[] => {
    if (isSuperAdmin) return entries;
    return entries.map((entry) => ({
      screen_key: entry.screen_key,
      can_view:
        entry.can_view &&
        hasMatrixPermission(currentUserPermissions, currentUser?.role, entry.screen_key, 'view'),
      can_edit:
        entry.can_edit &&
        hasMatrixPermission(currentUserPermissions, currentUser?.role, entry.screen_key, 'edit'),
      can_delete:
        entry.can_delete &&
        hasMatrixPermission(currentUserPermissions, currentUser?.role, entry.screen_key, 'delete'),
    }));
  };

  const handleCreateRoleSelect = (nextRole: UserRole) => {
    setRole(nextRole);
    setCreatePermissions(clampPermissionsForActor(getDefaultPermissionsForRole(nextRole)));
  };

  const visibleProfiles = useMemo(() => {
    if (isSuperAdmin) return db.profiles;
    // Hall Admin only manages managers in their own hall (+ sees own row)
    return db.profiles.filter(
      (p) => p.hall_id === activeHallId && (p.role === 'manager' || p.id === currentUser?.id)
    );
  }, [db.profiles, isSuperAdmin, activeHallId, currentUser?.id]);

  const hallNameFor = (hid: string | null) => {
    if (!hid) return 'All Halls (Global)';
    return db.halls.find((h) => h.id === hid)?.name || 'Marquee 1';
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditUsers) return;
    setMsg(null);
    if (!fullName.trim() || !email.trim()) return;

    const effectiveRole: UserRole = isSuperAdmin ? role : 'manager';
    const effectiveHallId: string | null = isSuperAdmin
      ? effectiveRole === 'super_admin'
        ? null
        : hallId || activeHallId
      : activeHallId;

    setSubmitting(true);
    const res = await manageUserWithEdgeFunction({
      action: 'create_user',
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || '0300-0000000',
      role: effectiveRole,
      hall_id: effectiveHallId,
      password: password || undefined,
      is_active: true,
      permissions: clampPermissionsForActor(createPermissions),
    });
    setSubmitting(false);

    if (!res.ok) {
      setMsg({ ok: false, text: res.error || 'Could not create user' });
      return;
    }
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setCreatePermissions(clampPermissionsForActor(getDefaultPermissionsForRole(effectiveRole)));
    setMsg({
      ok: true,
      text: `${translateRole(effectiveRole, lang)} account created with custom screen permissions.`,
    });
  };

  const openEditModal = (u: UserProfile) => {
    setMsg(null);
    setEditTarget(u);
    setEditName(u.full_name);
    setEditPhone(u.phone || '');
    setEditRole(u.role);
    setEditHallId(u.hall_id || activeHallId);
    setEditActive(u.is_active);
    setEditPermissions(getPermissionsForUser(u.id));
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !canEditUsers) return;
    const effectiveRole = isSuperAdmin ? editRole : editTarget.role;
    const effectiveHall = isSuperAdmin
      ? effectiveRole === 'super_admin'
        ? null
        : editHallId || activeHallId
      : editTarget.hall_id;

    setSavingEdit(true);
    const res = await manageUserWithEdgeFunction({
      action: 'update_user',
      userId: editTarget.id,
      full_name: editName.trim() || editTarget.full_name,
      phone: editPhone.trim(),
      role: effectiveRole,
      hall_id: effectiveHall,
      is_active: editActive,
      permissions: clampPermissionsForActor(editPermissions),
    });
    setSavingEdit(false);

    if (!res.ok) {
      setMsg({ ok: false, text: res.error || 'Could not update user & permissions' });
      return;
    }
    setMsg({
      ok: true,
      text: `Updated profile & screen permissions for ${editName.trim() || editTarget.full_name}. Changes apply on their next refresh.`,
    });
    setEditTarget(null);
  };

  const handleHallChange = async (u: UserProfile, nextHallId: string) => {
    if (!canEditUsers) return;
    setMsg(null);
    const res = await manageUserWithEdgeFunction({
      action: 'update_user',
      userId: u.id,
      hall_id: nextHallId || null,
    });
    if (!res.ok) {
      setMsg({ ok: false, text: res.error || 'Could not assign hall' });
    } else {
      setMsg({ ok: true, text: `Updated hall assignment for ${u.full_name}.` });
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    if (!canEditUsers) return;
    setMsg(null);
    const res = await manageUserWithEdgeFunction({
      action: 'toggle_active',
      userId: u.id,
      is_active: !u.is_active,
    });
    if (!res.ok) {
      setMsg({ ok: false, text: res.error || 'Could not update account status' });
    } else {
      setMsg({
        ok: true,
        text: `${u.full_name} is now ${!u.is_active ? 'Active' : 'Deactivated'}.`,
      });
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || newPassword.length < 6 || !canEditUsers) return;
    setResetting(true);
    const res = await manageUserWithEdgeFunction({
      action: 'reset_password',
      userId: resetTarget.id,
      password: newPassword,
    });
    setResetting(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error || 'Could not reset password' });
      return;
    }
    setMsg({ ok: true, text: `Password reset for ${resetTarget.full_name}.` });
    setResetTarget(null);
    setNewPassword('');
  };

  const getUserPermSummary = (u: UserProfile) => {
    if (u.role === 'super_admin') {
      return { viewCount: SCREEN_DEFINITIONS.length, editCount: SCREEN_DEFINITIONS.length, deleteCount: SCREEN_DEFINITIONS.length };
    }
    const list = getPermissionsForUser(u.id);
    return {
      viewCount: list.filter((x) => x.can_view).length,
      editCount: list.filter((x) => x.can_edit).length,
      deleteCount: list.filter((x) => x.can_delete).length,
    };
  };

  return (
    <div className="space-y-5">
      {supabaseLive && (
        <div className="glass-panel rounded-2xl p-4 border border-cyan-500/30 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-slate-300 leading-relaxed">
            User accounts and per-screen database permissions are enforced both in PostgreSQL Row Level Security and securely managed via the{' '}
            <code className="text-cyan-300 font-mono">manage-users</code> Edge Function.
          </div>
        </div>
      )}

      {!canEditUsers && (
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 text-xs text-amber-200">
          You have View-only access to the Users directory. Users Edit permission is required to create accounts or modify screen permissions.
        </div>
      )}

      {msg && (
        <div
          className={`p-3 rounded-xl border text-xs ${
            msg.ok
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className={`grid grid-cols-1 ${canEditUsers ? 'xl:grid-cols-12' : ''} gap-6`}>
        {canEditUsers && (
          <form onSubmit={handleCreateUser} className="xl:col-span-5 glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-400" />
              <span>{isSuperAdmin ? 'Create Staff User & Permissions' : 'Create Hall Manager & Permissions'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Mobile Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(formatPakistaniPhoneInput(e.target.value))}
                  placeholder="03XX-XXXXXXX"
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Initial Password {supabaseLive ? '*' : '(Optional)'}
                </label>
                <input
                  type="password"
                  required={supabaseLive}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            {isSuperAdmin ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Role Template</label>
                  <select
                    value={role}
                    onChange={(e) => handleCreateRoleSelect(e.target.value as UserRole)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="super_admin">Super Admin (All Halls)</option>
                    <option value="admin">Hall Admin (Template)</option>
                    <option value="manager">Hall Manager (Template)</option>
                  </select>
                </div>
                {role !== 'super_admin' && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Assigned Hall</label>
                    <select
                      value={hallId}
                      onChange={(e) => setHallId(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {db.halls.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.booking_code_prefix})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-xs flex items-center justify-between">
                <span className="text-slate-400">Role Template &amp; Hall</span>
                <span className="font-semibold text-cyan-300">
                  Hall Manager · {activeHall.name}
                </span>
              </div>
            )}

            <PermissionsChecklist
              entries={createPermissions}
              onChange={setCreatePermissions}
              targetRole={isSuperAdmin ? role : 'manager'}
              actorRole={currentUser?.role}
              actorMatrix={currentUserPermissions}
              lang={lang}
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creating...' : isSuperAdmin ? 'Create User & Save Permissions' : 'Create Manager & Save Permissions'}
            </button>
          </form>
        )}

        <div className={`${canEditUsers ? 'xl:col-span-7' : ''} glass-panel rounded-2xl overflow-hidden self-start`}>
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              <span>{isSuperAdmin ? 'All Staff Accounts & Permissions' : `${activeHall.name} Staff & Permissions`}</span>
            </h3>
            <span className="text-xs text-slate-400 tabular-nums">{visibleProfiles.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 text-start">Staff Member</th>
                  <th className="py-2.5 px-4 text-start">Hall &amp; Role</th>
                  <th className="py-2.5 px-4 text-start">Access Summary</th>
                  <th className="py-2.5 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visibleProfiles.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const canManageTarget = canEditUsers && !isSelf && (isSuperAdmin || u.role === 'manager');
                  const summary = getUserPermSummary(u);
                  return (
                    <tr key={u.id} className={!u.is_active ? 'opacity-60' : ''}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">
                          {u.full_name} {isSelf && <span className="text-[11px] text-cyan-400">(You)</span>}
                        </div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">{u.phone || '—'}</div>
                      </td>
                      <td className="py-3 px-4 space-y-1">
                        <div className="font-semibold text-cyan-300">{translateRole(u.role, lang)}</div>
                        {canEditUsers && isSuperAdmin && u.role !== 'super_admin' ? (
                          <select
                            value={u.hall_id || activeHallId}
                            onChange={(e) => handleHallChange(u, e.target.value)}
                            className="bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200"
                          >
                            {db.halls.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Building2 className="w-3 h-3 text-amber-400" />
                            <span>{hallNameFor(u.hall_id)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[11px] text-slate-200 tabular-nums">
                          {summary.viewCount}/{SCREEN_DEFINITIONS.length} View · {summary.editCount} Edit
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {summary.deleteCount > 0 ? (
                            <span className="text-rose-300">{summary.deleteCount} Delete enabled</span>
                          ) : (
                            <span>No Delete rights</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-end">
                        {canManageTarget ? (
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="px-2.5 py-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-xs font-medium inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit &amp; Permissions</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(u);
                                setNewPassword('');
                              }}
                              title="Reset Password"
                              className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 hover:border-cyan-500/40 text-xs inline-flex items-center gap-1"
                            >
                              <KeyRound className="w-3 h-3 text-amber-400" />
                              <span>PW</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(u)}
                              className={`px-2 py-1 rounded-lg border text-xs font-medium ${
                                u.is_active
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                              }`}
                            >
                              {u.is_active ? 'Active' : 'Off'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            {u.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit User & Screen Permissions Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-2xl w-full p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Edit User &amp; Screen Permissions</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{editTarget.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatPakistaniPhoneInput(e.target.value))}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-slate-300 mb-1">Role Template</label>
                  {isSuperAdmin ? (
                    <select
                      value={editRole}
                      onChange={(e) => {
                        const nr = e.target.value as UserRole;
                        setEditRole(nr);
                        setEditPermissions(clampPermissionsForActor(getDefaultPermissionsForRole(nr)));
                      }}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="super_admin">super_admin</option>
                      <option value="admin">admin</option>
                      <option value="manager">manager</option>
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/60 text-cyan-300 font-semibold">
                      {translateRole(editTarget.role, lang)}
                    </div>
                  )}
                </div>

                {isSuperAdmin && editRole !== 'super_admin' && (
                  <div>
                    <label className="block text-slate-300 mb-1">Assigned Hall</label>
                    <select
                      value={editHallId}
                      onChange={(e) => setEditHallId(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {db.halls.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="inline-flex items-center gap-2 py-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span>Account Active</span>
                </label>
              </div>

              <PermissionsChecklist
                entries={editPermissions}
                onChange={setEditPermissions}
                targetRole={isSuperAdmin ? editRole : editTarget.role}
                actorRole={currentUser?.role}
                actorMatrix={currentUserPermissions}
                lang={lang}
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save User & Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Reset Password</span>
              </h3>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmResetPassword} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Set a new login password for <strong>{resetTarget.full_name}</strong> ({resetTarget.email}).
              </p>
              <div>
                <label className="block text-slate-300 mb-1">New Password (min 6 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold disabled:opacity-50"
                >
                  {resetting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
