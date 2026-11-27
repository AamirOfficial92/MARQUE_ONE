import React, { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { formatPakistaniPhoneInput } from '../utils/formatters';

export const UsersView: React.FC = () => {
  const { db, supabaseLive, saveUserProfile } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('management');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!fullName.trim() || !email.trim()) return;
    const res = await saveUserProfile({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || '0300-0000000',
      role,
      is_active: true,
      password: password || undefined,
    });
    if (!res.ok) {
      setMsg(res.error || 'Could not create user');
      return;
    }
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setMsg('Staff account created successfully.');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <form onSubmit={handleCreateUser} className="glass-panel rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-cyan-400" />
          <span>Create Staff User & Role</span>
        </h3>
        {msg && (
          <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-xs">
            {msg}
          </div>
        )}
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
          <label className="block text-xs text-slate-300 mb-1">Mobile Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(formatPakistaniPhoneInput(e.target.value))}
            placeholder="03XX-XXXXXXX"
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="super_admin">Super Admin (Full Control)</option>
            <option value="management">Management (Bookings & Calendar)</option>
            <option value="finance">Finance (Payments, Expenses & Reports)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">
            Initial Password {supabaseLive ? '*' : '(Optional in Preview)'}
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
        <button
          type="submit"
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
        >
          Create User Account
        </button>
      </form>

      <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            <span>Staff Accounts & Permissions</span>
          </h3>
          <span className="text-xs text-slate-400 tabular-nums">{db.profiles.length} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 text-start">Staff Member</th>
                <th className="py-2.5 px-4 text-start">Contact</th>
                <th className="py-2.5 px-4 text-start">Role</th>
                <th className="py-2.5 px-4 text-end">Account Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {db.profiles.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{u.full_name}</div>
                    <div className="text-[11px] text-slate-400">{u.email}</div>
                  </td>
                  <td className="py-3 px-4 tabular-nums text-slate-300">{u.phone || '—'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => saveUserProfile({ ...u, role: e.target.value as UserRole })}
                      className="bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-cyan-300"
                    >
                      <option value="super_admin">super_admin</option>
                      <option value="management">management</option>
                      <option value="finance">finance</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 text-end">
                    <button
                      type="button"
                      onClick={() => saveUserProfile({ ...u, is_active: !u.is_active })}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
                        u.is_active
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
