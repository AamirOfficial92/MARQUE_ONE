import React, { useState } from 'react';
import { Mail, MessageCircle, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import {
  pickLocalized,
  tr,
  translateBookingItemName,
  translateEventType,
  translateFloor,
  translatePaymentMode,
  translateStatus,
} from '../i18n/translations';
import { Booking } from '../types';
import {
  buildMailtoLink,
  buildWhatsAppLink,
  calculateBookingFinancials,
  calculateCrateBill,
  formatDateDisplay,
  formatPKR,
  formatTime12h,
  todayISO,
} from '../utils/formatters';

interface InvoiceModalProps {
  booking: Booking;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ booking, onClose }) => {
  const { db, lang } = useApp();
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const settings = db.settings;
  const hallName = pickLocalized(settings.hall_name, settings.hall_name_ur, lang);
  const hallAddress = pickLocalized(settings.address, settings.address_ur, lang);
  const hallTerms = pickLocalized(settings.terms_en, settings.terms_ur, lang);

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

  const separator = lang === 'ur' ? '، ' : ', ';
  const floorLabel = booking.floors
    .map((f) => translateFloor(f, lang, db.floors))
    .join(separator);
  const eventTypeLabel = translateEventType(booking.event_type, lang, db.eventTypes);
  const statusLabel = translateStatus(booking.status, lang);
  const eventDateLabel = formatDateDisplay(booking.event_date, lang);
  const timeRangeLabel = `${formatTime12h(booking.start_time, lang)} – ${formatTime12h(booking.end_time, lang)}`;

  const shareSummaryText =
    lang === 'ur'
      ? [
          `*${hallName}*`,
          `انوائس: ${booking.invoice_number} | بکنگ: ${booking.booking_code}`,
          `گاہک: ${booking.customer_name}`,
          `تقریب: ${eventTypeLabel} · ${eventDateLabel} (${timeRangeLabel})`,
          `فلورز: ${floorLabel}`,
          ...(fin.discountAmount > 0
            ? [
                `معیاری کل بل: ${formatPKR(fin.standardTotal)}`,
                `خصوصی رعایت: -${formatPKR(fin.discountAmount)}`,
              ]
            : []),
          `حتمی طے شدہ کل بل: ${formatPKR(fin.grandTotal)}`,
          `وصول شدہ رقم: ${formatPKR(fin.totalPaid)}`,
          `بقایا رقم: ${formatPKR(fin.balance)}`,
          `رابطہ: ${settings.phone}`,
        ].join('\n')
      : [
          `*${hallName}*`,
          `Invoice: ${booking.invoice_number} | Booking: ${booking.booking_code}`,
          `Customer: ${booking.customer_name}`,
          `Event: ${eventTypeLabel} on ${eventDateLabel} (${timeRangeLabel})`,
          `Floors: ${floorLabel}`,
          ...(fin.discountAmount > 0
            ? [
                `Standard Total: ${formatPKR(fin.standardTotal)}`,
                `Special Discount: -${formatPKR(fin.discountAmount)}`,
              ]
            : []),
          `Final Agreed Total: ${formatPKR(fin.grandTotal)}`,
          `Paid: ${formatPKR(fin.totalPaid)}`,
          `Remaining Balance: ${formatPKR(fin.balance)}`,
          `Contact: ${settings.phone}`,
        ].join('\n');

  const emailSubject =
    lang === 'ur'
      ? `${hallName} - انوائس ${booking.invoice_number} (${booking.booking_code})`
      : `${hallName} Invoice ${booking.invoice_number} (${booking.booking_code})`;

  const handleSendEmail = async () => {
    const targetEmail = booking.customer_email || settings.email;
    setEmailStatus(lang === 'ur' ? 'بھیجا جا رہا ہے...' : 'Sending...');
    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: emailSubject,
          text: shareSummaryText,
          html: `<pre dir="${lang === 'ur' ? 'rtl' : 'ltr'}" style="font-family:sans-serif;line-height:1.7">${shareSummaryText}</pre>`,
        }),
      });
      if (resp.ok) {
        const result = await resp.json().catch(() => ({}));
        if (result?.ok) {
          setEmailStatus(
            lang === 'ur'
              ? `${targetEmail} پر ای میل بھیج دی گئی`
              : `Sent via Resend to ${targetEmail}`
          );
          return;
        }
      }
    } catch {
      // Fallback to mailto
    }
    setEmailStatus(
      lang === 'ur' ? 'ای میل ایپ کھول دی گئی' : 'Opened default email client'
    );
    window.location.href = buildMailtoLink(targetEmail, emailSubject, shareSummaryText);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl space-y-4 my-auto">
        {/* Action Bar (hidden when printing) */}
        <div className="no-print glass-panel rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white tabular-nums">{booking.invoice_number}</span> ·{' '}
            <span className="text-cyan-300 tabular-nums">{booking.booking_code}</span> ·{' '}
            <span>{lang === 'ur' ? 'اے-4 پی ڈی ایف فارمیٹ' : 'A4 PDF Format'}</span>
            {emailStatus && <span className="ms-3 text-emerald-400">({emailStatus})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{tr('printPdf', lang)}</span>
            </button>
            <a
              href={buildWhatsAppLink(booking.customer_phone, shareSummaryText)}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{tr('shareWhatsApp', lang)}</span>
            </a>
            <button
              type="button"
              onClick={handleSendEmail}
              className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:border-cyan-500/40"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{tr('sendEmail', lang)}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('close', lang)}
              className="p-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Single-Language A4 Invoice Sheet */}
        <div
          dir={lang === 'ur' ? 'rtl' : 'ltr'}
          className={`print-only-sheet bg-white text-slate-900 rounded-2xl p-6 sm:p-10 shadow-2xl border border-slate-200 ${
            lang === 'ur' ? 'font-urdu' : ''
          }`}
        >
          {/* Letterhead */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div className="flex items-center gap-4">
              <img
                src={settings.logo_url || HALL_LOGO_SRC}
                alt={hallName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border border-slate-300"
              />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{hallName}</h1>
                {hallAddress && <p className="text-xs text-slate-600 mt-1">{hallAddress}</p>}
                <p className="text-xs text-slate-700 mt-1">
                  <span>{lang === 'ur' ? 'فون:' : 'Tel:'}</span>{' '}
                  <span className="tabular-nums">{settings.phone}</span>
                  {settings.email ? (
                    <>
                      {' · '}
                      <span>{lang === 'ur' ? 'ای میل:' : 'Email:'}</span>{' '}
                      <span className="tabular-nums">{settings.email}</span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="text-start sm:text-end">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                {tr('officialInvoice', lang)}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {booking.invoice_number}
              </div>
              <div className="text-xs text-slate-700 mt-1">
                <span>{tr('bookingCodeLabel', lang)}</span>{' '}
                <strong className="tabular-nums">{booking.booking_code}</strong>
              </div>
              <div className="text-xs text-slate-600">
                <span>{tr('bookingDateLabel', lang)}</span>{' '}
                <span className="tabular-nums">{formatDateDisplay(booking.booking_date, lang)}</span>
              </div>
              <div className="text-xs text-slate-600">
                <span>{tr('issueDateLabel', lang)}</span>{' '}
                <span className="tabular-nums">{formatDateDisplay(todayISO(), lang)}</span>
              </div>
            </div>
          </div>

          {booking.status === 'Cancelled' && booking.cancellation_details && (
            <div className="mt-4 p-3 rounded-lg border border-rose-300 bg-rose-50 text-xs text-rose-900 flex flex-wrap justify-between gap-2">
              <span className="font-bold">
                {lang === 'ur' ? 'منسوخ شدہ بکنگ' : 'CANCELLED BOOKING'}
              </span>
              <span className="tabular-nums">
                {lang === 'ur' ? 'وصول شدہ:' : 'Paid:'}{' '}
                {formatPKR(booking.cancellation_details.amount_paid_so_far)} |{' '}
                {lang === 'ur' ? 'کٹوتی:' : 'Deduction:'}{' '}
                {formatPKR(booking.cancellation_details.deduction_amount)} |{' '}
                {lang === 'ur' ? 'واپسی:' : 'Refund:'}{' '}
                {formatPKR(booking.cancellation_details.refund_amount)} (
                {translatePaymentMode(booking.cancellation_details.refund_mode, lang)})
              </span>
            </div>
          )}

          {/* Customer & Event Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 border-b border-slate-200 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-slate-700 mb-1.5">{tr('billTo', lang)}</div>
              <div className="text-sm font-bold text-slate-900">{booking.customer_name}</div>
              {booking.customer_address && (
                <div className="text-slate-600">{booking.customer_address}</div>
              )}
              <div className="text-slate-700">
                <span>{lang === 'ur' ? 'فون:' : 'Phone:'}</span>{' '}
                <span className="tabular-nums">{booking.customer_phone}</span>
              </div>
              {booking.customer_nic && (
                <div className="text-slate-700">
                  <span>{lang === 'ur' ? 'شناختی کارڈ:' : 'CNIC:'}</span>{' '}
                  <span className="tabular-nums">{booking.customer_nic}</span>
                </div>
              )}
            </div>

            <div className="space-y-1 sm:text-end">
              <div className="font-bold text-slate-700 mb-1.5">{tr('eventSchedule', lang)}</div>
              <div className="text-sm font-bold text-slate-900">
                {eventTypeLabel} (<span className="tabular-nums">{booking.guests_count}</span>{' '}
                {lang === 'ur' ? 'مہمان' : 'Guests'})
              </div>
              <div className="text-slate-700">
                <span>{tr('eventDateLabel', lang)}</span>{' '}
                <span className="tabular-nums">{eventDateLabel}</span> ·{' '}
                <span className="tabular-nums">{timeRangeLabel}</span>
              </div>
              <div className="text-slate-700">
                <span>{tr('floorsLabel', lang)}</span> {floorLabel}
              </div>
              <div className="text-slate-700">
                <span>{tr('status', lang)}:</span> {statusLabel}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="py-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-700 bg-slate-50">
                  <th className="py-2.5 px-3 text-start">{tr('descriptionCol', lang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('qtyCol', lang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('rateCol', lang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('amountCol', lang)} (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">
                      {tr('hallRentLineDesc', lang)} ({floorLabel})
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                  <td className="py-2.5 px-3 text-end tabular-nums">
                    {formatPKR(booking.hall_rent)}
                  </td>
                  <td className="py-2.5 px-3 text-end font-semibold tabular-nums">
                    {formatPKR(booking.hall_rent)}
                  </td>
                </tr>

                {items.map((it) => {
                  const isCrate =
                    it.is_crate_service || it.item_name.toLowerCase().includes('cold drink');
                  const itemLabel = translateBookingItemName(it, lang, db.chargesCatalog);
                  return (
                    <tr key={it.id} className={isCrate ? 'bg-slate-50/80' : ''}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">
                          {itemLabel}{' '}
                          {it.is_package_included && (
                            <span className="text-[11px] text-slate-500">
                              ({lang === 'ur' ? 'پیکج میں شامل' : 'Included in Package'})
                            </span>
                          )}
                        </div>
                        {isCrate && booking.crates_ordered > 0 && (
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            {lang === 'ur' ? (
                              <>
                                آرڈر: <span className="tabular-nums">{booking.crates_ordered}</span>،
                                استعمال: <span className="tabular-nums">{booking.crates_used}</span>،
                                واپسی: <span className="tabular-nums">{booking.crates_returned}</span> |
                                مجموعی مالیت:{' '}
                                <span className="tabular-nums">
                                  {formatPKR(crateCalc.grossOrdered)}
                                </span>{' '}
                                | واپسی کریڈٹ:{' '}
                                <span className="tabular-nums">
                                  -{formatPKR(crateCalc.netCreditReversed)}
                                </span>{' '}
                                (برف و ہینڈلنگ کٹوتی:{' '}
                                <span className="tabular-nums">
                                  -{formatPKR(crateCalc.iceAndHandlingDeduction)}
                                </span>
                                )
                              </>
                            ) : (
                              <span className="tabular-nums">
                                Ordered: {booking.crates_ordered}, Used: {booking.crates_used},
                                Returned: {booking.crates_returned} | Gross:{' '}
                                {formatPKR(crateCalc.grossOrdered)} | Returned Value:{' '}
                                {formatPKR(crateCalc.returnedGrossValue)} | Less Ice &amp; Handling:{' '}
                                -{formatPKR(crateCalc.iceAndHandlingDeduction)} | Net Credit Reversed:{' '}
                                -{formatPKR(crateCalc.netCreditReversed)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-end tabular-nums">
                        {isCrate
                          ? `${booking.crates_ordered - booking.crates_returned} ${
                              lang === 'ur' ? 'خالص' : 'net'
                            }`
                          : it.quantity}
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
                        {tr('coldDrinksServiceDesc', lang)} (
                        {lang === 'ur'
                          ? `آرڈر: ${booking.crates_ordered}، استعمال: ${booking.crates_used}، واپسی: ${booking.crates_returned}`
                          : `Ordered: ${booking.crates_ordered}, Used: ${booking.crates_used}, Returned: ${booking.crates_returned}`}
                        )
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {lang === 'ur' ? (
                          <>
                            مجموعی رقم:{' '}
                            <span className="tabular-nums">
                              {formatPKR(crateCalc.grossOrdered)}
                            </span>{' '}
                            | واپسی مالیت:{' '}
                            <span className="tabular-nums">
                              {formatPKR(crateCalc.returnedGrossValue)}
                            </span>{' '}
                            | برف و ہینڈلنگ کٹوتی:{' '}
                            <span className="tabular-nums">
                              -{formatPKR(crateCalc.iceAndHandlingDeduction)}
                            </span>{' '}
                            | خالص کریڈٹ:{' '}
                            <span className="tabular-nums">
                              -{formatPKR(crateCalc.netCreditReversed)}
                            </span>
                          </>
                        ) : (
                          <span className="tabular-nums">
                            Gross: {formatPKR(crateCalc.grossOrdered)} | Returned Value:{' '}
                            {formatPKR(crateCalc.returnedGrossValue)} | Less Ice &amp; Handling (
                            {booking.crates_returned} ×{' '}
                            {formatPKR(booking.crate_handling_deduction_per_crate)}): -
                            {formatPKR(crateCalc.iceAndHandlingDeduction)} | Net Reversal Credit: -
                            {formatPKR(crateCalc.netCreditReversed)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">
                      {booking.crates_ordered - booking.crates_returned}{' '}
                      {lang === 'ur' ? 'خالص' : 'net'}
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">
                      {formatPKR(booking.crate_rate)}
                    </td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">
                      {formatPKR(crateCalc.netCrateBill)}
                    </td>
                  </tr>
                )}

                {fin.lateCharge > 0 && (
                  <tr className="bg-amber-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        {tr('lateChargeOvertimeLine', lang)}
                        {booking.actual_end_time && (
                          <span className="text-[11px] font-normal text-slate-600 ms-1.5">
                            (
                            {lang === 'ur' ? 'مقررہ اختتام:' : 'Scheduled End:'}{' '}
                            <span className="tabular-nums">
                              {formatTime12h(booking.end_time, lang)}
                            </span>{' '}
                            → {lang === 'ur' ? 'حقیقی اختتام:' : 'Actual End:'}{' '}
                            <span className="tabular-nums">
                              {formatTime12h(booking.actual_end_time, lang)}
                            </span>
                            )
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-end tabular-nums">
                      {formatPKR(fin.lateCharge)}
                    </td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">
                      {formatPKR(fin.lateCharge)}
                    </td>
                  </tr>
                )}

                {fin.rescheduleFeeTotal > 0 && (
                  <tr>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        {tr('rescheduleFeeLine', lang)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-end tabular-nums">
                      {formatPKR(fin.rescheduleFeeTotal)}
                    </td>
                    <td className="py-2.5 px-3 text-end font-semibold tabular-nums">
                      {formatPKR(fin.rescheduleFeeTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Payments Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-300">
            <div>
              <div className="text-xs font-bold text-slate-800 mb-2">
                {tr('paymentsReceived', lang)}
              </div>
              {payments.length > 0 ? (
                <div className="space-y-1 text-xs">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between text-slate-700 border-b border-slate-100 py-1 gap-2"
                    >
                      <span>
                        <span className="tabular-nums">{p.receipt_number}</span> ·{' '}
                        <span className="tabular-nums">
                          {formatDateDisplay(p.payment_date, lang)}
                        </span>{' '}
                        ({translatePaymentMode(p.mode, lang)})
                      </span>
                      <span className="font-semibold tabular-nums">{formatPKR(p.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  {lang === 'ur' ? 'ابھی تک کوئی ادائیگی درج نہیں ہوئی۔' : 'No payments recorded yet.'}
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-700">
                <span>{tr('standardTotal', lang)}</span>
                <span className="tabular-nums">{formatPKR(fin.standardTotal)}</span>
              </div>
              {fin.crateCreditReversed > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{tr('crateCredit', lang)}</span>
                  <span className="tabular-nums">- {formatPKR(fin.crateCreditReversed)}</span>
                </div>
              )}
              {fin.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>
                    {tr('specialDiscount', lang)}
                    {!settings.hide_discount_reason_on_invoice && booking.discount_reason
                      ? ` (${booking.discount_reason})`
                      : ''}
                  </span>
                  <span className="tabular-nums">- {formatPKR(fin.discountAmount)}</span>
                </div>
              )}
              {booking.tax_percent > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>
                    {tr('taxLabel', lang)} (<span className="tabular-nums">{booking.tax_percent}%</span>)
                  </span>
                  <span className="tabular-nums">{formatPKR(fin.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-2">
                <span>{tr('finalAgreedTotal', lang)}</span>
                <span className="tabular-nums">{formatPKR(fin.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>{tr('totalPaidLabel', lang)}</span>
                <span className="tabular-nums">{formatPKR(fin.totalPaid)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 border-t-2 border-slate-900 pt-2">
                <span>{tr('balanceDueLabel', lang)}</span>
                <span className="tabular-nums">{formatPKR(fin.balance)}</span>
              </div>
            </div>
          </div>

          {/* Single-Language Terms & Signatures */}
          <div className="mt-6 pt-4 border-t border-slate-200 text-[11px] text-slate-600 space-y-6">
            {hallTerms && (
              <div>
                <div className="font-bold text-slate-800 mb-1">{tr('termsAndConditions', lang)}</div>
                <p className={lang === 'ur' ? 'leading-loose' : 'leading-relaxed'}>{hallTerms}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-8 pt-6">
              <div className="border-t border-slate-300 pt-2 text-center font-semibold text-slate-700">
                {tr('customerSignature', lang)}
              </div>
              <div className="border-t border-slate-300 pt-2 text-center font-semibold text-slate-700">
                {tr('authorizedSignature', lang)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
