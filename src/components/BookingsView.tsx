import React, { useMemo, useState } from 'react';
import { Ban, CreditCard, Edit3, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr, translateFloor, translateStatus } from '../i18n/translations';
import { Booking, BookingStatus } from '../types';
import { calculateBookingFinancials, formatDateDisplay, formatPKR, formatTime12h } from '../utils/formatters';
import { CancelBookingModal } from './CancelBookingModal';

interface BookingsViewProps {
  onNewBooking: () => void;
  onEditBooking: (booking: Booking) => void;
  onOpenInvoice: (booking: Booking) => void;
  onGoToPayments: (bookingId: string) => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({
  onNewBooking,
  onEditBooking,
  onOpenInvoice,
  onGoToPayments,
}) => {
  const { db, lang, currentUser, softDeleteBooking } = useApp();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL');
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);

  const canModify = currentUser?.role === 'super_admin' || currentUser?.role === 'management';
  const canDelete = currentUser?.role === 'super_admin' || currentUser?.role === 'management';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.bookings
      .filter((b) => !b.deleted_at)
      .filter((b) => (statusFilter === 'ALL' ? true : b.status === statusFilter))
      .filter((b) => {
        if (!q) return true;
        return (
          b.booking_code.toLowerCase().includes(q) ||
          b.customer_name.toLowerCase().includes(q) ||
          b.customer_phone.toLowerCase().includes(q) ||
          b.customer_nic.toLowerCase().includes(q) ||
          b.event_date.includes(q)
        );
      })
      .sort((a, b) => b.event_date.localeCompare(a.event_date));
  }, [db.bookings, query, statusFilter]);

  const statusTextColor = (st: BookingStatus) => {
    switch (st) {
      case 'Confirmed':
        return 'text-emerald-400';
      case 'Tentative':
        return 'text-amber-400';
      case 'Completed':
        return 'text-cyan-400';
      case 'Cancelled':
        return 'text-rose-400';
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('searchPlaceholder', lang)}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          {(['ALL', 'Confirmed', 'Tentative', 'Completed', 'Cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {st === 'ALL' ? 'All' : translateStatus(st, lang)}
            </button>
          ))}
        </div>

        {canModify && (
          <button
            type="button"
            onClick={onNewBooking}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('newBooking', lang)}</span>
          </button>
        )}
      </div>

      {/* Bookings Table */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 text-start">Code &amp; Customer</th>
                <th className="py-3 px-4 text-start">Event &amp; Floors</th>
                <th className="py-3 px-4 text-start">Status &amp; Adjustments</th>
                <th className="py-3 px-4 text-end">Agreed Total / Profit</th>
                <th className="py-3 px-4 text-end">{tr('actions', lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((bk) => {
                const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);
                return (
                  <tr key={bk.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-cyan-300 tabular-nums">{bk.booking_code}</div>
                      <div className="font-semibold text-white mt-0.5">{bk.customer_name}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        {bk.customer_phone} · {bk.customer_nic}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-100">
                        {bk.event_type} · {bk.guests_count} guests
                      </div>
                      <div className="text-[11px] text-slate-300 tabular-nums mt-0.5">
                        {formatDateDisplay(bk.event_date, lang)} · {formatTime12h(bk.start_time)}–{formatTime12h(bk.end_time)}
                      </div>
                      <div className="text-[11px] text-violet-300 mt-0.5">
                        {bk.floors.map((f) => translateFloor(f, lang)).join(', ')}
                      </div>
                      {bk.reschedule_history && bk.reschedule_history.length > 0 && (
                        <div className="text-[11px] text-amber-300/80 mt-0.5 tabular-nums">
                          Rescheduled {bk.reschedule_history.length}×
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${statusTextColor(bk.status)}`}>
                        {translateStatus(bk.status, lang)}
                      </span>
                      {bk.status === 'Cancelled' && bk.cancellation_details && (
                        <div className="text-[11px] text-rose-300/90 tabular-nums mt-0.5">
                          Deducted: {formatPKR(bk.cancellation_details.deduction_amount)} · Refund: {formatPKR(bk.cancellation_details.refund_amount)}
                        </div>
                      )}
                      {fin.discountAmount > 0 && (
                        <div className="text-[11px] text-cyan-300 tabular-nums mt-0.5">
                          Discount: -{formatPKR(fin.discountAmount)}
                        </div>
                      )}
                      {bk.crate_credit_amount > 0 && (
                        <div className="text-[11px] text-emerald-400 tabular-nums mt-0.5">
                          Crate Credit: -{formatPKR(bk.crate_credit_amount)}
                        </div>
                      )}
                      {fin.lateCharge > 0 && (
                        <div className="text-[11px] text-amber-300 tabular-nums mt-0.5">
                          Late Charge: +{formatPKR(fin.lateCharge)}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-end min-w-[220px]">
                      <div className="font-bold text-white tabular-nums">{formatPKR(fin.grandTotal)}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        Paid: {formatPKR(fin.totalPaid)} ·{' '}
                        <span className={fin.balance > 0 ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                          Bal: {formatPKR(fin.balance)}
                        </span>
                      </div>
                      <div className="text-[11px] tabular-nums mt-0.5">
                        <span className="text-slate-500">Exp: {formatPKR(fin.linkedExpensesTotal)} · </span>
                        <span className={fin.bookingProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          Profit: {formatPKR(fin.bookingProfit)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                          style={{ width: `${fin.progressPercent}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-end">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditBooking(bk)}
                          title={tr('edit', lang)}
                          className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenInvoice(bk)}
                          title="Invoice PDF"
                          className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-amber-300 hover:border-amber-500/40"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {(currentUser?.role === 'super_admin' || currentUser?.role === 'finance') && (
                          <button
                            type="button"
                            onClick={() => onGoToPayments(bk.id)}
                            title="Record Payment"
                            className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canModify && bk.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => setCancellingBooking(bk)}
                            title={tr('cancelBooking', lang)}
                            className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-rose-400 hover:border-rose-500/40"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => softDeleteBooking(bk.id)}
                            title={tr('delete', lang)}
                            className="p-2 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    {tr('noRecords', lang)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cancellingBooking && (
        <CancelBookingModal booking={cancellingBooking} onClose={() => setCancellingBooking(null)} />
      )}
    </div>
  );
};
