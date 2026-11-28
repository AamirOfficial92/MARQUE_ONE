import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Landmark,
  Loader2,
  Send,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { pickLocalized, tr, translateClosingStatus, translatePaymentMode } from '../i18n/translations';
import { DailyClosing, DailyClosingBookingBreakdown } from '../types';
import { formatDateDisplay, formatPKR, todayISO } from '../utils/formatters';

export const DailyClosingView: React.FC = () => {
  const { db, activeHall, lang, currentUser, can, saveDailyClosing, reviewDailyClosing } = useApp();
  const [closingDate, setClosingDate] = useState(todayISO());
  const [managerNotes, setManagerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [discrepancyInput, setDiscrepancyInput] = useState<number>(0);
  const [adminReviewNotes, setAdminReviewNotes] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState<'received' | 'flagged' | null>(null);

  const isUr = lang === 'ur';
  const hallLabel = pickLocalized(activeHall.name, activeHall.name_ur, lang);

  const canSubmitClosing = can('daily_closing', 'edit');
  const canReview =
    (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && canSubmitClosing;

  // Aggregate active payments for the selected date grouped per booking
  const daySummary = useMemo(() => {
    const dayPayments = db.payments.filter(
      (p) => !p.deleted_at && p.payment_date === closingDate
    );
    const byBooking = new Map<string, DailyClosingBookingBreakdown>();

    let cashTotal = 0;
    let onlineTotal = 0;

    for (const p of dayPayments) {
      const amt = Number(p.amount) || 0;
      if (p.mode === 'Cash') cashTotal += amt;
      else onlineTotal += amt;

      const bk = db.bookings.find((b) => b.id === p.booking_id);
      const existing = byBooking.get(p.booking_id) || {
        booking_id: p.booking_id,
        booking_code: bk?.booking_code || '—',
        customer_name: bk?.customer_name || '—',
        cash_amount: 0,
        online_amount: 0,
        total_amount: 0,
        payment_count: 0,
      };
      if (p.mode === 'Cash') existing.cash_amount += amt;
      else existing.online_amount += amt;
      existing.total_amount += amt;
      existing.payment_count += 1;
      byBooking.set(p.booking_id, existing);
    }

    const breakdown = Array.from(byBooking.values()).sort((a, b) =>
      a.booking_code.localeCompare(b.booking_code)
    );

    return {
      cashTotal,
      onlineTotal,
      grandTotal: cashTotal + onlineTotal,
      paymentCount: dayPayments.length,
      breakdown,
    };
  }, [db.payments, db.bookings, closingDate]);

  const existingForDate = useMemo(
    () => db.dailyClosings.find((c) => c.closing_date === closingDate),
    [db.dailyClosings, closingDate]
  );

  const history = useMemo(
    () => [...db.dailyClosings].sort((a, b) => b.closing_date.localeCompare(a.closing_date)),
    [db.dailyClosings]
  );

  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    const res = await saveDailyClosing({
      closing_date: closingDate,
      cash_total: daySummary.cashTotal,
      online_total: daySummary.onlineTotal,
      grand_total: daySummary.grandTotal,
      bookings_breakdown: daySummary.breakdown,
      manager_notes: managerNotes.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ ok: false, text: res.error || (isUr ? 'کلوزنگ جمع نہیں ہو سکی۔' : 'Could not submit closing.') });
      return;
    }
    setFeedback({
      ok: true,
      text: isUr
        ? `${formatDateDisplay(closingDate, lang)} کی روزانہ کلوزنگ ایڈمن کی تصدیق کے لیے جمع کر دی گئی ہے۔`
        : `Daily closing for ${formatDateDisplay(closingDate, lang)} submitted for admin verification.`,
    });
    setManagerNotes('');
  };

  const openReview = (c: DailyClosing) => {
    setReviewingId(c.id);
    setDiscrepancyInput(c.discrepancy_amount || 0);
    setAdminReviewNotes(c.admin_notes || '');
  };

  const handleReviewDecision = async (c: DailyClosing, decision: 'received' | 'flagged') => {
    if (reviewBusy) return;
    setFeedback(null);
    setReviewBusy(decision);
    try {
      const res = await reviewDailyClosing(
        c.id,
        decision,
        decision === 'flagged' ? Math.max(0, Number(discrepancyInput) || 0) : 0,
        adminReviewNotes.trim()
      );
      if (!res.ok) {
        setFeedback({ ok: false, text: res.error || (isUr ? 'جائزہ محفوظ نہیں ہو سکا۔' : 'Could not save review.') });
        return;
      }
      setReviewingId(null);
      setFeedback({
        ok: true,
        text:
          decision === 'received'
            ? isUr
              ? `${formatDateDisplay(c.closing_date, lang)} کی کلوزنگ وصول شدہ قرار دے دی گئی۔`
              : `Closing for ${formatDateDisplay(c.closing_date, lang)} marked as Received.`
            : isUr
            ? `${formatDateDisplay(c.closing_date, lang)} کی کلوزنگ پر فرق کا نوٹ درج کر دیا گیا۔`
            : `Closing for ${formatDateDisplay(c.closing_date, lang)} flagged with discrepancy note.`,
      });
    } finally {
      setReviewBusy(null);
    }
  };

  const statusBadge = (st: DailyClosing['status']) => {
    switch (st) {
      case 'received':
        return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
      case 'flagged':
        return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
      default:
        return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Date selector & KPI totals */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-cyan-400" />
              <span>
                {isUr ? 'روزانہ کیش اور آن لائن وصولی کلوزنگ' : 'Daily Cash & Online Collection Closing'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isUr
                ? `${hallLabel} کے لیے ہر بکنگ کی تفصیلی وصولی۔ مینیجر کلوزنگ جمع کرواتا ہے اور ہال ایڈمن تصدیق کرتا ہے۔`
                : `Itemized per-booking collection for ${hallLabel}. Manager submits closing; Hall Admin verifies receipt.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
            />
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{isUr ? 'نقد وصولی' : 'Cash Collected'}</span>
              <Banknote className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-300 tabular-nums mt-1">
              {formatPKR(daySummary.cashTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{translatePaymentMode('Online', lang)}</span>
              <Landmark className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-bold text-cyan-300 tabular-nums mt-1">
              {formatPKR(daySummary.onlineTotal)}
            </div>
          </div>
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {isUr
                  ? `مجموعی کل (${daySummary.paymentCount} رسیدیں)`
                  : `Grand Total (${daySummary.paymentCount} receipts)`}
              </span>
              <ClipboardCheck className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">
              {formatPKR(daySummary.grandTotal)}
            </div>
          </div>
        </div>

        {/* Per-booking itemized breakdown for selected date */}
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 text-start">{isUr ? 'بکنگ' : 'Booking'}</th>
                <th className="py-2.5 px-4 text-start">{tr('customerName', lang)}</th>
                <th className="py-2.5 px-4 text-end">{isUr ? 'رسیدیں' : 'Receipts'}</th>
                <th className="py-2.5 px-4 text-end">{translatePaymentMode('Cash', lang)}</th>
                <th className="py-2.5 px-4 text-end">{isUr ? 'آن لائن' : 'Online'}</th>
                <th className="py-2.5 px-4 text-end">{isUr ? 'کل' : 'Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {daySummary.breakdown.map((row) => (
                <tr key={row.booking_id}>
                  <td className="py-2.5 px-4 font-bold text-cyan-300 tabular-nums">{row.booking_code}</td>
                  <td className="py-2.5 px-4 text-white">{row.customer_name}</td>
                  <td className="py-2.5 px-4 text-end text-slate-400 tabular-nums">{row.payment_count}</td>
                  <td className="py-2.5 px-4 text-end text-emerald-300 tabular-nums">{formatPKR(row.cash_amount)}</td>
                  <td className="py-2.5 px-4 text-end text-cyan-300 tabular-nums">{formatPKR(row.online_amount)}</td>
                  <td className="py-2.5 px-4 text-end font-semibold text-white tabular-nums">
                    {formatPKR(row.total_amount)}
                  </td>
                </tr>
              ))}
              {daySummary.breakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    {isUr
                      ? `${formatDateDisplay(closingDate, lang)} کو کوئی ادائیگی درج نہیں ہوئی۔`
                      : `No payments recorded on ${formatDateDisplay(closingDate, lang)}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Submit / Resubmit form */}
        {existingForDate?.status === 'received' ? (
          <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {isUr
                ? `${formatDateDisplay(closingDate, lang)} کی کلوزنگ ${existingForDate.reviewed_by_name || 'ایڈمن'} کی جانب سے تصدیق و وصول کر لی گئی ہے۔`
                : `Closing for ${formatDateDisplay(closingDate, lang)} was verified & received by ${existingForDate.reviewed_by_name || 'Admin'}.`}
            </span>
          </div>
        ) : canSubmitClosing ? (
          <form onSubmit={handleSubmitClosing} className="flex flex-wrap items-end gap-3 pt-1">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs text-slate-300 mb-1">
                {isUr
                  ? 'مینیجر ہینڈ اوور نوٹس (کیش لفافہ / ڈپازٹ سلپ کی تفصیل)'
                  : 'Manager Handover Notes (cash envelope / deposit slip details)'}
              </label>
              <input
                type="text"
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                placeholder={
                  isUr
                    ? 'مثلاً نقد رقم لفافے میں حوالے کی، آن لائن اسٹیٹمنٹ سے تصدیق شدہ'
                    : 'e.g. Cash handed over in sealed bag; online verified in bank statement'
                }
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>
                {submitting
                  ? tr('saving', lang)
                  : existingForDate
                  ? isUr
                    ? 'روزانہ کلوزنگ دوبارہ جمع کروائیں'
                    : 'Resubmit Daily Closing'
                  : isUr
                  ? 'روزانہ کلوزنگ جمع کروائیں'
                  : 'Submit Daily Closing'}
              </span>
            </button>
          </form>
        ) : null}
      </div>

      {/* Closing History */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'کلوزنگ تاریخچہ اور مطابقت' : 'Closing History & Reconciliation'}
          </h3>
          <span className="text-xs text-slate-400 tabular-nums">
            {history.length} {isUr ? 'ریکارڈ' : 'records'}
          </span>
        </div>

        <div className="divide-y divide-slate-800/70">
          {history.map((c) => {
            const isExpanded = expandedId === c.id;
            const isReviewing = reviewingId === c.id;
            return (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tabular-nums">
                        {formatDateDisplay(c.closing_date, lang)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadge(
                          c.status
                        )}`}
                      >
                        {translateClosingStatus(c.status, lang)}
                      </span>
                      {c.discrepancy_amount > 0 && (
                        <span className="text-[11px] font-semibold text-rose-300 tabular-nums">
                          {isUr ? 'فرق:' : 'Diff:'} {formatPKR(c.discrepancy_amount)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isUr ? `جمع کنندہ: ${c.submitted_by_name}` : `Submitted by ${c.submitted_by_name}`}
                      {c.manager_notes ? ` · "${c.manager_notes}"` : ''}
                    </div>
                    {c.admin_notes && (
                      <div className="text-[11px] text-amber-300">
                        {isUr
                          ? `ایڈمن نوٹ (${c.reviewed_by_name || 'ایڈمن'}): ${c.admin_notes}`
                          : `Admin Note (${c.reviewed_by_name || 'Admin'}): ${c.admin_notes}`}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-end text-xs tabular-nums">
                      <div className="font-bold text-white">{formatPKR(c.grand_total)}</div>
                      <div className="text-[11px] text-slate-400">
                        {isUr ? 'نقد' : 'Cash'} {formatPKR(c.cash_total)} ·{' '}
                        {isUr ? 'آن لائن' : 'Online'} {formatPKR(c.online_total)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/70 text-xs text-slate-300 flex items-center gap-1"
                      >
                        <span>
                          {isUr
                            ? `بکنگز (${c.bookings_breakdown.length})`
                            : `Bookings (${c.bookings_breakdown.length})`}
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {canReview && (
                        <button
                          type="button"
                          onClick={() => (isReviewing ? setReviewingId(null) : openReview(c))}
                          className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-semibold"
                        >
                          {c.status === 'submitted'
                            ? isUr
                              ? 'تصدیق / نشاندہی'
                              : 'Verify / Flag'
                            : isUr
                            ? 'جائزہ اپڈیٹ کریں'
                            : 'Update Review'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && c.bookings_breakdown.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-start">{isUr ? 'کوڈ' : 'Code'}</th>
                          <th className="py-2 px-3 text-start">{tr('customerName', lang)}</th>
                          <th className="py-2 px-3 text-end">{isUr ? 'نقد' : 'Cash'}</th>
                          <th className="py-2 px-3 text-end">{isUr ? 'آن لائن' : 'Online'}</th>
                          <th className="py-2 px-3 text-end">{isUr ? 'کل' : 'Total'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {c.bookings_breakdown.map((b) => (
                          <tr key={b.booking_id}>
                            <td className="py-2 px-3 text-cyan-300 font-semibold tabular-nums">{b.booking_code}</td>
                            <td className="py-2 px-3 text-slate-200">{b.customer_name}</td>
                            <td className="py-2 px-3 text-end text-emerald-300 tabular-nums">{formatPKR(b.cash_amount)}</td>
                            <td className="py-2 px-3 text-end text-cyan-300 tabular-nums">{formatPKR(b.online_amount)}</td>
                            <td className="py-2 px-3 text-end font-semibold text-white tabular-nums">{formatPKR(b.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isReviewing && canReview && (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3.5 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-300 mb-1">
                          {isUr ? 'فرق کی رقم (PKR، اگر فرق ہو)' : 'Discrepancy Amount (PKR, if flagging)'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={discrepancyInput}
                          onChange={(e) => setDiscrepancyInput(Number(e.target.value) || 0)}
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-slate-300 mb-1">
                          {isUr ? 'ایڈمن تصدیقی نوٹ' : 'Admin Reconciliation Note'}
                        </label>
                        <input
                          type="text"
                          value={adminReviewNotes}
                          onChange={(e) => setAdminReviewNotes(e.target.value)}
                          placeholder={
                            isUr
                              ? 'نقد رقم گن کر وصول کی گئی، یا کمی/زیادتی کی تفصیل لکھیں...'
                              : 'Cash counted & verified, or describe shortage/excess...'
                          }
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={reviewBusy !== null}
                        onClick={() => handleReviewDecision(c, 'flagged')}
                        className="px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {reviewBusy === 'flagged' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        <span>{isUr ? 'فرق کی نشاندہی کریں' : 'Flag Difference'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusy !== null}
                        onClick={() => handleReviewDecision(c, 'received')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {reviewBusy === 'received' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isUr ? 'وصول شدہ نشان زد کریں' : 'Mark as Received'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {history.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-500">
              {isUr ? 'ابھی تک کوئی روزانہ کلوزنگ جمع نہیں کروائی گئی۔' : 'No daily closings submitted yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
