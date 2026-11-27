import React, { useState } from 'react';
import { Ban, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Booking, PaymentMode } from '../types';
import { calculateBookingFinancials, formatPKR, todayISO } from '../utils/formatters';

interface CancelBookingModalProps {
  booking: Booking;
  onClose: () => void;
}

export const CancelBookingModal: React.FC<CancelBookingModalProps> = ({ booking, onClose }) => {
  const { db, currentUser, cancelBooking, submitApprovalRequest } = useApp();
  const fin = calculateBookingFinancials(booking, db.bookingItems, db.payments, db.expenses);
  const isManager = currentUser?.role === 'manager';

  const [amountPaidSoFar, setAmountPaidSoFar] = useState<number>(fin.totalPaid);
  const [deductionAmount, setDeductionAmount] = useState<number>(0);
  const [refundAmount, setRefundAmount] = useState<number>(fin.totalPaid);
  const [reason, setReason] = useState<string>('');
  const [refundDate, setRefundDate] = useState<string>(todayISO());
  const [refundMode, setRefundMode] = useState<PaymentMode>('Cash');
  const [saving, setSaving] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDeductionChange = (val: number) => {
    const safeDed = Math.max(0, val);
    setDeductionAmount(safeDed);
    setRefundAmount(Math.max(0, amountPaidSoFar - safeDed));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaving(true);
    const details = {
      amount_paid_so_far: Math.max(0, Number(amountPaidSoFar) || 0),
      deduction_amount: Math.max(0, Number(deductionAmount) || 0),
      refund_amount: Math.max(0, Number(refundAmount) || 0),
      reason: reason.trim() || 'Cancelled by customer request',
      refund_date: refundDate,
      refund_mode: refundMode,
      cancelled_by: currentUser?.full_name || 'Admin',
      cancelled_at: new Date().toISOString(),
    };

    if (isManager) {
      const res = await submitApprovalRequest({
        booking_id: booking.id,
        booking_code: booking.booking_code,
        customer_name: booking.customer_name,
        request_type: details.refund_amount > 0 ? 'refund' : 'cancellation',
        payload: { cancellation_details: details },
        reason: details.reason,
      });
      setSaving(false);
      if (!res.ok) {
        setErrorMsg(res.error || 'Could not submit cancellation request.');
        return;
      }
      setSubmittedRequest(true);
      return;
    }

    await cancelBooking(booking.id, details);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-rose-500/40 overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-800 bg-rose-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Cancel Booking · {booking.booking_code}</h3>
              <p className="text-[11px] text-slate-400">{booking.customer_name} ({booking.event_date})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submittedRequest ? (
          <div className="p-6 space-y-4 text-xs text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="text-sm font-bold text-white">Cancellation &amp; Refund Request Submitted</div>
            <p className="text-slate-300">
              Your request for <strong>{booking.booking_code}</strong> has been sent to your Hall Admin for approval.
              The booking remains active until approved.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            {isManager && (
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Managers cannot cancel or issue refunds directly. Submitting this form creates an approval request for your Hall Admin.
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 flex items-center justify-between">
              <div>
                <div className="text-slate-400">Final Agreed Total</div>
                <div className="font-bold text-white tabular-nums mt-0.5">{formatPKR(fin.grandTotal)}</div>
              </div>
              <div className="text-end">
                <div className="text-slate-400">Payments Recorded</div>
                <div className="font-bold text-cyan-300 tabular-nums mt-0.5">{formatPKR(fin.totalPaid)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Amount Paid So Far</label>
                <input
                  type="number"
                  min={0}
                  value={amountPaidSoFar}
                  onChange={(e) => {
                    const p = Math.max(0, Number(e.target.value));
                    setAmountPaidSoFar(p);
                    setRefundAmount(Math.max(0, p - deductionAmount));
                  }}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Deduction (Charges)</label>
                <input
                  type="number"
                  min={0}
                  value={deductionAmount}
                  onChange={(e) => handleDeductionChange(Number(e.target.value))}
                  className="w-full bg-slate-950/70 border border-amber-500/40 rounded-xl px-3 py-2 text-amber-300 font-semibold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Refund Amount (PKR)</label>
                <input
                  type="number"
                  min={0}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-950/70 border border-emerald-500/40 rounded-xl px-3 py-2 text-emerald-300 font-semibold tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Refund Date</label>
                <input
                  type="date"
                  required
                  value={refundDate}
                  onChange={(e) => setRefundDate(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Refund Mode</label>
                <select
                  value={refundMode}
                  onChange={(e) => setRefundMode(e.target.value as PaymentMode)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Online">Online</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Cancellation Reason *</label>
              <textarea
                rows={2}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Customer reason, date conflict, or terms applied..."
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>

            {!isManager && (
              <p className="text-[11px] text-slate-400">
                The booking stays permanently in history as Cancelled, and the floors/time slot are released immediately.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 font-semibold"
              >
                Keep Active
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                {saving
                  ? 'Submitting...'
                  : isManager
                    ? 'Submit Cancellation Request'
                    : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
