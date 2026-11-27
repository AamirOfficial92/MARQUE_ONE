import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { formatDateDisplay, formatPKR } from '../utils/formatters';

export const RecycleBinView: React.FC = () => {
  const { db, lang, restoreRecord } = useApp();

  const deletedBookings = db.bookings.filter((b) => b.deleted_at);
  const deletedPayments = db.payments.filter((p) => p.deleted_at);
  const deletedExpenses = db.expenses.filter((e) => e.deleted_at);
  const deletedCharges = db.chargesCatalog.filter((c) => c.deleted_at);
  const deletedEmployees = db.employees.filter((e) => e.deleted_at);

  const totalDeleted =
    deletedBookings.length +
    deletedPayments.length +
    deletedExpenses.length +
    deletedCharges.length +
    deletedEmployees.length;

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>{tr('recycleBin', lang)}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            All deletions are soft-deleted. Only Super Admin can view and restore records.
          </p>
        </div>
        <span className="text-xs font-semibold text-cyan-300 tabular-nums">{totalDeleted} archived items</span>
      </div>

      {totalDeleted === 0 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-xs text-slate-500">
          Recycle Bin is currently empty.
        </div>
      )}

      {deletedBookings.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Deleted Bookings</h3>
          <div className="divide-y divide-slate-800/70">
            {deletedBookings.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-cyan-300 tabular-nums">
                    {b.booking_code} · <span className="text-white">{b.customer_name}</span>
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    Event: {formatDateDisplay(b.event_date, lang)} · Deleted: {formatDateDisplay(b.deleted_at || '', lang)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreRecord('booking', b.id)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('restore', lang)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedPayments.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Deleted Payments</h3>
          <div className="divide-y divide-slate-800/70">
            {deletedPayments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white tabular-nums">
                    {p.receipt_number} · {formatPKR(p.amount)}
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    {p.mode} · {formatDateDisplay(p.payment_date, lang)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreRecord('payment', p.id)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('restore', lang)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedExpenses.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Deleted Expenses</h3>
          <div className="divide-y divide-slate-800/70">
            {deletedExpenses.map((e) => (
              <div key={e.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">
                    {e.payee} · <span className="tabular-nums text-rose-300">{formatPKR(e.amount)}</span>
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    {e.category_name} · {formatDateDisplay(e.expense_date, lang)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreRecord('expense', e.id)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('restore', lang)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedCharges.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Deleted Catalog Charges</h3>
          <div className="divide-y divide-slate-800/70">
            {deletedCharges.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{c.name_en}</div>
                  <div className="text-slate-400 tabular-nums">{formatPKR(c.default_rate)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreRecord('charge', c.id)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('restore', lang)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedEmployees.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Deleted Staff Records</h3>
          <div className="divide-y divide-slate-800/70">
            {deletedEmployees.map((emp) => (
              <div key={emp.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{emp.full_name}</div>
                  <div className="text-slate-400">{emp.role_title}</div>
                </div>
                <button
                  type="button"
                  onClick={() => restoreRecord('employee', emp.id)}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('restore', lang)}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
