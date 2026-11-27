import React, { useMemo, useState } from 'react';
import { Edit3, Mail, MapPin, Phone, Plus, Search, Trash2, UserCheck, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { Customer } from '../types';
import {
  calculateBookingFinancials,
  formatDateDisplay,
  formatNICInput,
  formatPKR,
  formatPakistaniPhoneInput,
  isValidPakistaniNIC,
  isValidPakistaniPhone,
} from '../utils/formatters';

export const CustomersView: React.FC = () => {
  const { db, lang, can, saveCustomer, softDeleteCustomer } = useApp();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nic, setNic] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = can('customers', 'edit');
  const canDelete = can('customers', 'delete');

  const openNew = () => {
    setEditing(null);
    setFullName('');
    setPhone('');
    setNic('');
    setAddress('');
    setEmail('');
    setNotes('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setFullName(c.full_name);
    setPhone(c.phone);
    setNic(c.nic);
    setAddress(c.address);
    setEmail(c.email);
    setNotes(c.notes);
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!isValidPakistaniPhone(phone)) {
      setError('Enter a valid Pakistani mobile number (03XX-XXXXXXX).');
      return;
    }
    if (nic.trim() && !isValidPakistaniNIC(nic)) {
      setError('Enter a valid 13-digit CNIC (XXXXX-XXXXXXX-X).');
      return;
    }
    setSaving(true);
    const res = await saveCustomer({
      id: editing?.id,
      full_name: fullName.trim(),
      phone: phone.trim(),
      nic: nic.trim(),
      address: address.trim(),
      email: email.trim(),
      notes: notes.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error || 'Could not save customer.');
      return;
    }
    setModalOpen(false);
  };

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totalAgreed: number; totalPaid: number; lastDate: string }
    >();
    for (const bk of db.bookings) {
      if (bk.deleted_at || bk.status === 'Cancelled') continue;
      const key = bk.customer_id || `${bk.customer_name.toLowerCase()}|${bk.customer_phone}`;
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);
      const prev = map.get(key) || { count: 0, totalAgreed: 0, totalPaid: 0, lastDate: '' };
      map.set(key, {
        count: prev.count + 1,
        totalAgreed: prev.totalAgreed + fin.grandTotal,
        totalPaid: prev.totalPaid + fin.totalPaid,
        lastDate: !prev.lastDate || bk.event_date > prev.lastDate ? bk.event_date : prev.lastDate,
      });
    }
    return map;
  }, [db.bookings, db.bookingItems, db.payments, db.expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.customers
      .filter((c) => !c.deleted_at)
      .filter((c) => {
        if (!q) return true;
        return (
          c.full_name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.nic.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [db.customers, query]);

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer name, phone, CNIC, address..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 tabular-nums flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>{filtered.length} customers</span>
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={openNew}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Customer</span>
            </button>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 text-start">Customer</th>
                <th className="py-3 px-4 text-start">Contact &amp; CNIC</th>
                <th className="py-3 px-4 text-start">Address</th>
                <th className="py-3 px-4 text-end">Bookings &amp; Ledger</th>
                {(canEdit || canDelete) && <th className="py-3 px-4 text-end">{tr('actions', lang)}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((c) => {
                const stats =
                  customerStats.get(c.id) ||
                  customerStats.get(`${c.full_name.toLowerCase()}|${c.phone}`) ||
                  { count: 0, totalAgreed: 0, totalPaid: 0, lastDate: '' };
                const bal = Math.max(0, stats.totalAgreed - stats.totalPaid);
                return (
                  <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{c.full_name}</span>
                      </div>
                      {c.notes && <div className="text-[11px] text-slate-400 mt-0.5">{c.notes}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-200 tabular-nums flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        CNIC: {c.nic || '—'}
                      </div>
                      {c.email && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{c.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-xs">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                        <span>{c.address || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-end">
                      <div className="font-semibold text-cyan-300 tabular-nums">
                        {stats.count} {stats.count === 1 ? 'event' : 'events'}
                      </div>
                      <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        Billed: {formatPKR(stats.totalAgreed)} · Paid: {formatPKR(stats.totalPaid)}
                      </div>
                      <div className="text-[11px] tabular-nums mt-0.5">
                        {bal > 0 ? (
                          <span className="text-amber-300 font-semibold">Bal: {formatPKR(bal)}</span>
                        ) : (
                          <span className="text-emerald-400">Settled</span>
                        )}
                        {stats.lastDate && (
                          <span className="text-slate-500"> · Last: {formatDateDisplay(stats.lastDate, lang)}</span>
                        )}
                      </div>
                    </td>
                    {(canEdit || canDelete) && (
                      <td className="py-3.5 px-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              title={tr('edit', lang)}
                              className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => softDeleteCustomer(c.id)}
                              title={tr('delete', lang)}
                              className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit || canDelete ? 5 : 4} className="py-10 text-center text-slate-500">
                    {tr('noRecords', lang)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editing ? 'Edit Customer' : 'Add Customer'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(formatPakistaniPhoneInput(e.target.value))}
                    placeholder="03XX-XXXXXXX"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">CNIC Number</label>
                  <input
                    type="text"
                    value={nic}
                    onChange={(e) => setNic(formatNICInput(e.target.value))}
                    placeholder="42101-XXXXXXX-X"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300"
                >
                  {tr('cancel', lang)}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : tr('save', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
