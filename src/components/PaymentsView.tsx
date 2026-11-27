import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { Booking, Payment, PaymentMode } from '../types';
import { calculateBookingFinancials, formatDateDisplay, formatPKR, todayISO } from '../utils/formatters';
import { ReceiptModal } from './ReceiptModal';

interface PaymentsViewProps {
  initialBookingId?: string | null;
  onOpenInvoice: (booking: Booking) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ initialBookingId, onOpenInvoice }) => {
  const { db, lang, currentUser, can, addPayment, softDeletePayment, toggleInstallmentPaid } = useApp();
  const canEdit = can('payments', 'edit');
  const canDelete = can('payments', 'delete');
  const canViewInvoices = can('invoices', 'view');

  const activeBookings = useMemo(
    () => db.bookings.filter((b) => !b.deleted_at && b.status !== 'Cancelled'),
    [db.bookings]
  );

  const [selectedBookingId, setSelectedBookingId] = useState<string>(
    initialBookingId || activeBookings[0]?.id || ''
  );

  useEffect(() => {
    if (initialBookingId && activeBookings.some((b) => b.id === initialBookingId)) {
      setSelectedBookingId(initialBookingId);
    } else if (activeBookings.length > 0 && !activeBookings.some((b) => b.id === selectedBookingId)) {
      setSelectedBookingId(activeBookings[0].id);
    }
  }, [initialBookingId, activeBookings, selectedBookingId]);

  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(todayISO());
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [receivedBy, setReceivedBy] = useState<string>(currentUser?.full_name || 'Accounts Desk');
  const [notes, setNotes] = useState<string>('');
  const [receiptTarget, setReceiptTarget] = useState<{ payment: Payment; booking: Booking } | null>(null);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const selectedBooking = activeBookings.find((b) => b.id === selectedBookingId) || activeBookings[0] || null;
  const fin = selectedBooking
    ? calculateBookingFinancials(selectedBooking, db.bookingItems, db.payments)
    : null;

  const bookingPayments = useMemo(
    () =>
      db.payments
        .filter((p) => !p.deleted_at && (!selectedBooking || p.booking_id === selectedBooking.id))
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
    [db.payments, selectedBooking]
  );

  const bookingInstallments = useMemo(
    () =>
      db.installments
        .filter((ins) => !ins.deleted_at && selectedBooking && ins.booking_id === selectedBooking.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [db.installments, selectedBooking]
  );

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    const numeric = Number(amount);
    if (!numeric || numeric <= 0) {
      setFormMsg('Enter a valid positive amount in PKR.');
      return;
    }

    const res = await addPayment({
      booking_id: selectedBooking.id,
      amount: numeric,
      payment_date: paymentDate,
      mode,
      reference_no: referenceNo.trim(),
      received_by: receivedBy.trim() || 'Accounts Desk',
      notes: notes.trim(),
    });

    if (res.ok && res.payment) {
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setFormMsg(`Recorded ${res.payment.receipt_number}`);
      setReceiptTarget({ payment: res.payment, booking: selectedBooking });
    } else {
      setFormMsg(res.error || 'Failed to record payment');
    }
  };

  return (
    <div className="space-y-6">
      {/* Booking Selector + Balance Progress */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs text-slate-400 mb-1.5">Select Booking Account</label>
            <select
              value={selectedBooking?.id || ''}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              {activeBookings.map((bk) => (
                <option key={bk.id} value={bk.id}>
                  {bk.booking_code} — {bk.customer_name} ({bk.event_date} · {bk.event_type})
                </option>
              ))}
            </select>
          </div>

          {selectedBooking && canViewInvoices && (
            <button
              type="button"
              onClick={() => onOpenInvoice(selectedBooking)}
              className="px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-500/20"
            >
              <FileText className="w-4 h-4" />
              <span>Open Official Invoice ({selectedBooking.invoice_number})</span>
            </button>
          )}
        </div>

        {fin && selectedBooking && (
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-slate-400">{tr('totalBill', lang)}</div>
                <div className="text-base font-bold text-white tabular-nums mt-0.5">{formatPKR(fin.grandTotal)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-slate-400">{tr('paidAmount', lang)}</div>
                <div className="text-base font-bold text-emerald-400 tabular-nums mt-0.5">{formatPKR(fin.totalPaid)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-slate-400">{tr('remainingBalance', lang)}</div>
                <div className="text-base font-bold text-amber-300 tabular-nums mt-0.5">{formatPKR(fin.balance)}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-slate-400">Collection Progress</div>
                <div className="text-base font-bold text-cyan-300 tabular-nums mt-0.5">{fin.progressPercent}%</div>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-emerald-400 transition-all"
                style={{ width: `${fin.progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Record Payment + Installment Schedule */}
      <div className={`grid grid-cols-1 ${canEdit ? 'xl:grid-cols-3' : ''} gap-6`}>
        {canEdit && (
          <form onSubmit={handleRecordPayment} className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Record Advance / Installment</h3>
          {formMsg && (
            <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-xs">
              {formMsg}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-300 mb-1">Amount (PKR) *</label>
            <input
              type="number"
              required
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={fin ? String(fin.balance) : '50000'}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Date</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online / IBFT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Reference Number</label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="IBFT / Slip / Cheque Ref"
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Received By</label>
            <input
              type="text"
              required
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">{tr('notes', lang)}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Advance / 2nd Installment / Final Settlement"
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            type="submit"
            disabled={!selectedBooking}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment & Generate Receipt</span>
          </button>
        </form>
        )}

        {/* Payment History + Planned Installments */}
        <div className={`${canEdit ? 'xl:col-span-2' : ''} space-y-6`}>
          {bookingInstallments.length > 0 && (
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-3">Planned Installment Schedule</h3>
              <div className="divide-y divide-slate-800/70">
                {bookingInstallments.map((ins) => (
                  <div key={ins.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-100">{ins.title}</div>
                      <div className="text-slate-400 tabular-nums">Due: {formatDateDisplay(ins.due_date, lang)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-cyan-300 tabular-nums">{formatPKR(ins.amount)}</span>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleInstallmentPaid(ins.id, !ins.is_paid)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                          ins.is_paid
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/40'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{ins.is_paid ? 'Cleared' : 'Mark Paid'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Payment Receipts Ledger</h3>
              <span className="text-xs text-slate-400 tabular-nums">{bookingPayments.length} receipts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Receipt & Date</th>
                    <th className="py-2.5 px-4 text-start">Mode & Ref</th>
                    <th className="py-2.5 px-4 text-start">Received By</th>
                    <th className="py-2.5 px-4 text-end">Amount</th>
                    <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {bookingPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4">
                        <div className="font-bold text-cyan-300 tabular-nums">{p.receipt_number}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {formatDateDisplay(p.payment_date, lang)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{p.mode}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">{p.reference_no || '—'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{p.received_by}</div>
                        {p.notes && <div className="text-[11px] text-slate-400">{p.notes}</div>}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-emerald-400 tabular-nums">
                        {formatPKR(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          {selectedBooking && (
                            <button
                              type="button"
                              onClick={() => setReceiptTarget({ payment: p, booking: selectedBooking })}
                              title="Print Receipt"
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => softDeletePayment(p.id)}
                              title={tr('delete', lang)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {bookingPayments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        {tr('noRecords', lang)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {receiptTarget && (
        <ReceiptModal
          payment={receiptTarget.payment}
          booking={receiptTarget.booking}
          onClose={() => setReceiptTarget(null)}
        />
      )}
    </div>
  );
};
