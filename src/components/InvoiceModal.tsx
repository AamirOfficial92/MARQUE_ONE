import React, { useState } from 'react';
import { Mail, MessageCircle, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { Booking } from '../types';
import {
  buildMailtoLink,
  buildWhatsAppLink,
  calculateBookingFinancials,
  calculateCrateBill,
  formatDateDisplay,
  formatPKR,
  formatTime12h,
} from '../utils/formatters';

interface InvoiceModalProps {
  booking: Booking;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ booking, onClose }) => {
  const { db } = useApp();
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const settings = db.settings;
  const items = db.bookingItems.filter((i) => i.booking_id === booking.id && !i.deleted_at);
  const payments = db.payments.filter((p) => p.booking_id === booking.id && !p.deleted_at);
  const fin = calculateBookingFinancials(booking, db.bookingItems, db.payments, db.expenses);
  const crateCalc = calculateCrateBill(
    booking.crates_ordered,
    booking.crates_returned,
    booking.crate_rate,
    booking.crate_handling_deduction_per_crate
  );

  const hasCrateItemRow = items.some(
    (it) => it.is_crate_service || it.item_name.toLowerCase().includes('cold drink')
  );

  const shareSummaryText = [
    `*${settings.hall_name} (${settings.hall_name_ur})*`,
    `Invoice: ${booking.invoice_number} | Booking: ${booking.booking_code}`,
    `Customer: ${booking.customer_name}`,
    `Event: ${booking.event_type} on ${booking.event_date} (${booking.start_time}–${booking.end_time})`,
    `Floors: ${booking.floors.join(', ')}`,
    ...(fin.discountAmount > 0 ? [`Standard Total: ${formatPKR(fin.standardTotal)}`, `Special Discount: -${formatPKR(fin.discountAmount)}`] : []),
    `Final Agreed Total: ${formatPKR(fin.grandTotal)}`,
    `Paid: ${formatPKR(fin.totalPaid)}`,
    `Remaining Balance: ${formatPKR(fin.balance)}`,
    `Contact: ${settings.phone}`,
  ].join('\n');

  const handleSendEmail = async () => {
    const targetEmail = booking.customer_email || settings.email;
    setEmailStatus('Sending...');
    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: `${settings.hall_name} Invoice ${booking.invoice_number} (${booking.booking_code})`,
          text: shareSummaryText,
          html: `<pre style="font-family:sans-serif;line-height:1.6">${shareSummaryText}</pre>`,
        }),
      });
      if (resp.ok) {
        const result = await resp.json().catch(() => ({}));
        if (result?.ok) {
          setEmailStatus(`Sent via Resend to ${targetEmail}`);
          return;
        }
      }
    } catch {
      // Fallback to mailto
    }
    setEmailStatus('Opened default email client');
    window.location.href = buildMailtoLink(
      targetEmail,
      `${settings.hall_name} Invoice ${booking.invoice_number} - ${booking.booking_code}`,
      shareSummaryText
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl space-y-4 my-auto">
        {/* Action Bar (hidden when printing) */}
        <div className="no-print glass-panel rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white">{booking.invoice_number}</span> ·{' '}
            <span className="text-cyan-300">{booking.booking_code}</span> · A4 PDF Format
            {emailStatus && <span className="ms-3 text-emerald-400">({emailStatus})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save A4 PDF</span>
            </button>
            <a
              href={buildWhatsAppLink(booking.customer_phone, shareSummaryText)}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Share on WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={handleSendEmail}
              className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:border-cyan-500/40"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Send by Email</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Bilingual A4 Invoice Sheet */}
        <div className="print-only-sheet bg-white text-slate-900 rounded-2xl p-6 sm:p-10 shadow-2xl border border-slate-200">
          {/* Letterhead */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div className="flex items-center gap-4">
              <img
                src={settings.logo_url || HALL_LOGO_SRC}
                alt={settings.hall_name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border border-slate-300"
              />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{settings.hall_name}</h1>
                <p className="font-urdu text-lg font-bold text-slate-800" dir="rtl">
                  {settings.hall_name_ur}
                </p>
                <p className="text-xs text-slate-600 mt-1">{settings.address}</p>
                <p className="font-urdu text-xs text-slate-600" dir="rtl">
                  {settings.address_ur}
                </p>
                <p className="text-xs text-slate-700 mt-1 tabular-nums">
                  Tel: {settings.phone} · Email: {settings.email}
                </p>
              </div>
            </div>

            <div className="text-start sm:text-end">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Official Invoice / سرکاری بل
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {booking.invoice_number}
              </div>
              <div className="text-xs text-slate-700 tabular-nums mt-1">
                Booking Code: <strong>{booking.booking_code}</strong>
              </div>
              <div className="text-xs text-slate-600 tabular-nums">
                Booking Date: {formatDateDisplay(booking.booking_date, 'en')}
              </div>
            </div>
          </div>

          {booking.status === 'Cancelled' && booking.cancellation_details && (
            <div className="mt-4 p-3 rounded-lg border border-rose-300 bg-rose-50 text-xs text-rose-900 flex flex-wrap justify-between gap-2">
              <span className="font-bold">CANCELLED BOOKING / منسوخ شدہ بکنگ</span>
              <span className="tabular-nums">
                Paid: {formatPKR(booking.cancellation_details.amount_paid_so_far)} | Deduction:{' '}
                {formatPKR(booking.cancellation_details.deduction_amount)} | Refund:{' '}
                {formatPKR(booking.cancellation_details.refund_amount)} ({booking.cancellation_details.refund_mode})
              </span>
            </div>
          )}

          {/* Customer & Event Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 border-b border-slate-200 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-slate-700 mb-1.5">
                Bill To / تفصیلاتِ گاہک
              </div>
              <div className="text-sm font-bold text-slate-900">{booking.customer_name}</div>
              <div className="text-slate-600">{booking.customer_address}</div>
              <div className="text-slate-700 tabular-nums">Phone: {booking.customer_phone}</div>
              <div className="text-slate-700 tabular-nums">CNIC: {booking.customer_nic}</div>
            </div>
            <div className="space-y-1 sm:text-end">
              <div className="font-bold text-slate-700 mb-1.5">
                Event Schedule / تفصیلاتِ تقریب
              </div>
              <div className="text-sm font-bold text-slate-900">
                {booking.event_type} ({booking.guests_count} Guests)
              </div>
              <div className="text-slate-700 tabular-nums">
                Date: {formatDateDisplay(booking.event_date, 'en')} · {formatTime12h(booking.start_time)} –{' '}
                {formatTime12h(booking.end_time)}
              </div>
              <div className="text-slate-700">Floors: {booking.floors.join(', ')}</div>
              <div className="text-slate-700">Status: {booking.status}</div>
            </div>
          </div>

          {/* Line Items */}
          <div className="py-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-700 bg-slate-50">
                  <th className="py-2.5 px-3 text-start">Description / تفصیل</th>
                  <th className="py-2.5 px-3 text-end">Qty / تعداد</th>
                  <th className="py-2.5 px-3 text-end">Rate / ریٹ</th>
                  <th className="py-2.5 px-3 text-end">Amount / رقم (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">
                      Banquet Hall Rent ({booking.floors.join(', ')})
                    </div>
                    <div className="font-urdu text-[11px] text-slate-600">ہال کرایہ</div>
                  </td>
                  <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                  <td className="py-2.5 px-3 text-end tabular-nums">{formatPKR(booking.hall_rent)}</td>
                  <td className="py-2.5 px-3 text-end font-semibold tabular-nums">{formatPKR(booking.hall_rent)}</td>
                </tr>

                {items.map((it) => {
                  const isCrate = it.is_crate_service || it.item_name.toLowerCase().includes('cold drink');
                  return (
                    <tr key={it.id} className={isCrate ? 'bg-slate-50/80' : ''}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">
                          {it.item_name}{' '}
                          {it.is_package_included && (
                            <span className="text-[11px] text-slate-500">(Included in Package)</span>
                          )}
                        </div>
                        {it.item_name_ur && (
                          <div className="font-urdu text-[11px] text-slate-600">{it.item_name_ur}</div>
                        )}
                        {isCrate && booking.crates_ordered > 0 && (
                          <div className="text-[11px] text-slate-600 tabular-nums mt-0.5">
                            Ordered: {booking.crates_ordered}, Used: {booking.crates_used}, Returned: {booking.crates_returned} |
                            Gross: {formatPKR(crateCalc.grossOrdered)} | Returned Value: {formatPKR(crateCalc.returnedGrossValue)} |
                            Less Ice &amp; Handling: -{formatPKR(crateCalc.iceAndHandlingDeduction)} |
                            Net Credit Reversed: -{formatPKR(crateCalc.netCreditReversed)}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-end tabular-nums">
                        {isCrate ? `${booking.crates_ordered - booking.crates_returned} net` : it.quantity}
                      </td>
                      <td className="py-2 px-3 text-end tabular-nums">
                        {isCrate ? formatPKR(booking.crate_rate) : formatPKR(it.rate)}
                      </td>
                      <td className="py-2 px-3 text-end font-semibold tabular-nums">
                        {formatPKR(isCrate ? crateCalc.netCrateBill : it.amount)}
                      </td>
                    </tr>
                  );
                })}

                {!hasCrateItemRow && booking.crates_ordered > 0 && (
                  <tr className="bg-slate-50/80">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        Cold Drink Crates (Ordered: {booking.crates_ordered}, Used: {booking.crates_used}, Returned: {booking.crates_returned})
                      </div>
                      <div className="text-[11px] text-slate-600 tabular-nums">
                        Gross: {formatPKR(crateCalc.grossOrdered)} | Returned Value: {formatPKR(crateCalc.returnedGrossValue)} | Less Ice &amp; Handling ({booking.crates_returned} × {formatPKR(booking.crate_handling_deduction_per_crate)}): -{formatPKR(crateCalc.iceAndHandlingDeduction)} | Net Reversal Credit: -{formatPKR(crateCalc.netCreditReversed)}
                      </div>
                      <div className="font-urdu text-[11px] text-slate-600" dir="rtl">
                        کولڈ ڈرنک کریٹس حساب: واپسی کریٹس پر برف اور ہینڈلنگ منہا کر کے بل میں کریڈٹ کیا گیا
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">{booking.crates_ordered - booking.crates_returned} net</td>
                    <td className="py-2.5 px-3 text-end tabular-nums">{formatPKR(booking.crate_rate)}</td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">{formatPKR(crateCalc.netCrateBill)}</td>
                  </tr>
                )}

                {fin.lateCharge > 0 && (
                  <tr className="bg-amber-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        Late Exit / Overtime Charges
                        {booking.actual_end_time
                          ? ` (Scheduled End: ${formatTime12h(booking.end_time)} → Actual End: ${formatTime12h(booking.actual_end_time)})`
                          : ''}
                      </div>
                      <div className="font-urdu text-[11px] text-slate-600" dir="rtl">
                        مقررہ وقت کے بعد اضافی وقت کے چارجز
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-end tabular-nums">{formatPKR(fin.lateCharge)}</td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">{formatPKR(fin.lateCharge)}</td>
                  </tr>
                )}

                {fin.rescheduleFeeTotal > 0 && (
                  <tr>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">Event Reschedule Fee</div>
                      <div className="font-urdu text-[11px] text-slate-600" dir="rtl">
                        تقریب کی تاریخ تبدیلی فیس
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-end tabular-nums">{formatPKR(fin.rescheduleFeeTotal)}</td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">{formatPKR(fin.rescheduleFeeTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Payments Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-300">
            <div>
              <div className="text-xs font-bold text-slate-800 mb-2">
                Payments Received / وصول شدہ ادائیگیاں
              </div>
              {payments.length > 0 ? (
                <div className="space-y-1 text-xs">
                  {payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-slate-700 tabular-nums border-b border-slate-100 py-1">
                      <span>
                        {p.receipt_number} · {formatDateDisplay(p.payment_date, 'en')} ({p.mode})
                      </span>
                      <span className="font-semibold">{formatPKR(p.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">No payments recorded yet.</div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-700 tabular-nums">
                <span>Standard Total / معیاری کل بل</span>
                <span>{formatPKR(fin.standardTotal)}</span>
              </div>
              {fin.crateCreditReversed > 0 && (
                <div className="flex justify-between text-emerald-700 tabular-nums">
                  <span>Crate Return Reversal / کریٹ واپسی کریڈٹ</span>
                  <span>- {formatPKR(fin.crateCreditReversed)}</span>
                </div>
              )}
              {fin.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 tabular-nums font-medium">
                  <span>
                    Special Discount / خصوصی رعایت
                    {!settings.hide_discount_reason_on_invoice && booking.discount_reason
                      ? ` (${booking.discount_reason})`
                      : ''}
                  </span>
                  <span>- {formatPKR(fin.discountAmount)}</span>
                </div>
              )}
              {booking.tax_percent > 0 && (
                <div className="flex justify-between text-slate-700 tabular-nums">
                  <span>Tax ({booking.tax_percent}%) / ٹیکس</span>
                  <span>{formatPKR(fin.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-2 tabular-nums">
                <span>Final Agreed Total / حتمی طے شدہ کل بل</span>
                <span>{formatPKR(fin.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-700 tabular-nums">
                <span>Total Paid / کل وصولی</span>
                <span>{formatPKR(fin.totalPaid)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 border-t-2 border-slate-900 pt-2 tabular-nums">
                <span>Balance Due / بقایا رقم</span>
                <span>{formatPKR(fin.balance)}</span>
              </div>
            </div>
          </div>

          {/* Bilingual Terms */}
          <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] text-slate-600">
            <div>
              <div className="font-bold text-slate-800 mb-1">Terms &amp; Conditions</div>
              <p className="leading-relaxed">{settings.terms_en}</p>
            </div>
            <div dir="rtl" className="text-right">
              <div className="font-urdu font-bold text-slate-800 mb-1">شرائط و ضوابط</div>
              <p className="font-urdu leading-loose">{settings.terms_ur}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
