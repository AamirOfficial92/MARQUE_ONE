import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApprovalRequest, ApprovalRequestType } from '../types';
import { formatDateDisplay, formatPKR } from '../utils/formatters';

export const ApprovalsView: React.FC = () => {
  const { db, lang, currentUser, can, reviewApprovalRequest } = useApp();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const canReview =
    (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') &&
    can('bookings', 'edit');

  const items = useMemo(() => {
    const sorted = [...db.approvalRequests].sort((a, b) =>
      b.requested_at.localeCompare(a.requested_at)
    );
    return tab === 'pending' ? sorted.filter((r) => r.status === 'pending') : sorted;
  }, [db.approvalRequests, tab]);

  const pendingCount = useMemo(
    () => db.approvalRequests.filter((r) => r.status === 'pending').length,
    [db.approvalRequests]
  );

  const typeLabel = (t: ApprovalRequestType) => {
    switch (t) {
      case 'discount':
        return 'Discount';
      case 'cancellation':
        return 'Cancellation';
      case 'refund':
        return 'Refund & Cancel';
      case 'reschedule_fee':
        return 'Reschedule Fee';
      case 'late_charge_override':
        return 'Late Charge Override';
    }
  };

  const describePayload = (req: ApprovalRequest): string => {
    const p = req.payload || {};
    if (req.request_type === 'discount') {
      const dt = p.discount_type === 'percent' ? `${p.discount_value}%` : formatPKR(Number(p.discount_value) || 0);
      return `Requested Discount: ${dt} (approx. ${formatPKR(Number(p.discount_amount) || 0)})`;
    }
    if (req.request_type === 'late_charge_override') {
      return `Requested Late Charge: ${formatPKR(Number(p.late_charge_amount) || 0)} (${String(p.late_charge_method || 'manual')})`;
    }
    if (req.request_type === 'reschedule_fee') {
      return `Date ${String(p.old_date || '—')} → ${String(p.new_date || '—')} · Fee: ${formatPKR(Number(p.fee) || 0)}`;
    }
    if (req.request_type === 'cancellation' || req.request_type === 'refund') {
      const cd = (p.cancellation_details || p) as Record<string, unknown>;
      return `Paid: ${formatPKR(Number(cd.amount_paid_so_far) || 0)} · Deduction: ${formatPKR(
        Number(cd.deduction_amount) || 0
      )} · Refund: ${formatPKR(Number(cd.refund_amount) || 0)} (${String(cd.refund_mode || 'Cash')})`;
    }
    return JSON.stringify(p);
  };

  const handleDecision = async (req: ApprovalRequest, decision: 'approved' | 'rejected') => {
    setFeedback(null);
    const note = (notesById[req.id] || '').trim();
    const res = await reviewApprovalRequest(req.id, decision, note);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || 'Could not process approval.' });
      return;
    }
    setFeedback({
      ok: true,
      text: `${typeLabel(req.request_type)} request for ${req.booking_code} ${decision}.`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Manager Approval Requests</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Discounts, cancellations, refunds, reschedule fees, and late-charge overrides submitted by hall managers.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'pending'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            All History ({db.approvalRequests.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs ${
            feedback.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="space-y-3">
        {items.map((req) => (
          <div key={req.id} className="glass-panel rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 text-[11px] font-semibold">
                    {typeLabel(req.request_type)}
                  </span>
                  <span className="text-xs font-bold text-cyan-300 tabular-nums">{req.booking_code}</span>
                  <span className="text-xs font-semibold text-white">· {req.customer_name}</span>
                </div>
                <div className="text-xs font-medium text-slate-200">{describePayload(req)}</div>
                <div className="text-[11px] text-slate-400">
                  Requested by <strong className="text-slate-200">{req.requested_by_name}</strong> on{' '}
                  {formatDateDisplay(req.requested_at, lang)}
                  {req.reason ? ` · Reason: "${req.reason}"` : ''}
                </div>
                {req.review_note && (
                  <div className="text-[11px] text-amber-300">
                    Admin Note ({req.reviewed_by_name || 'Admin'}): {req.review_note}
                  </div>
                )}
              </div>

              <span
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold uppercase flex items-center gap-1 ${
                  req.status === 'approved'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : req.status === 'rejected'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                {req.status === 'pending' && <Clock className="w-3 h-3" />}
                {req.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                {req.status === 'rejected' && <XCircle className="w-3 h-3" />}
                <span>{req.status}</span>
              </span>
            </div>

            {canReview && req.status === 'pending' && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                <input
                  type="text"
                  value={notesById[req.id] || ''}
                  onChange={(e) => setNotesById((prev) => ({ ...prev, [req.id]: e.target.value }))}
                  placeholder="Optional approval or rejection note..."
                  className="flex-1 min-w-[200px] bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => handleDecision(req, 'rejected')}
                  className="px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs font-semibold flex items-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision(req, 'approved')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve &amp; Apply</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="glass-panel rounded-2xl py-12 text-center text-xs text-slate-500">
            {tab === 'pending' ? 'No pending approval requests.' : 'No approval history recorded.'}
          </div>
        )}
      </div>
    </div>
  );
};
