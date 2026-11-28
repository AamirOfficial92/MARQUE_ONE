import React, { useState } from 'react';
import { Globe, Mail, MessageCircle, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import {
  formatBookingEventDisplay,
  pickLocalized,
  tr,
  translateBookingItemName,
  translateFloor,
  translatePaymentMode,
  translateStatus,
} from '../i18n/translations';
import { Booking, Language } from '../types';
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
  const { db, rawDb, activeHall, lang } = useApp();
  const [invLang, setInvLang] = useState<Language>(lang);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const settings = db.settings;
  const bookingHall = rawDb.halls.find((h) => h.id === booking.hall_id) || activeHall;

  const hallName = pickLocalized(bookingHall.name, bookingHall.name_ur, invLang);
  const hallTagline = pickLocalized(bookingHall.tagline_en, bookingHall.tagline_ur, invLang);
  const hallAddressBase = pickLocalized(bookingHall.address, bookingHall.address_ur, invLang);
  const hallAddress = [hallAddressBase, bookingHall.city].filter(Boolean).join(', ');
  const hallFooter = pickLocalized(bookingHall.invoice_footer_en, bookingHall.invoice_footer_ur, invLang);
  const hallTerms =
    pickLocalized(bookingHall.terms_en, bookingHall.terms_ur, invLang) ||
    pickLocalized(settings.terms_en, settings.terms_ur, invLang);

  const logoSrc = bookingHall.logo_url || settings.logo_url || HALL_LOGO_SRC;
  const signatureSrc = bookingHall.signature_url || '';
  const hasBankDetails =
    Boolean(bookingHall.show_bank_details) &&
    Boolean(bookingHall.bank_name || bookingHall.bank_account_title || bookingHall.bank_iban);

  const socialItems = [
    { label: 'FB', url: bookingHall.facebook_url },
    { label: 'IG', url: bookingHall.instagram_url },
    { label: 'TikTok', url: bookingHall.tiktok_url },
    { label: 'YT', url: bookingHall.youtube_url },
    { label: 'X', url: bookingHall.x_url },
    { label: invLang === 'ur' ? 'لوکیشن' : 'Map', url: bookingHall.google_maps_url },
  ].filter((s) => Boolean(s.url && s.url.trim()));

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

  const separator = invLang === 'ur' ? '، ' : ', ';
  const floorLabel = booking.floors
    .map((f) => translateFloor(f, invLang, db.floors))
    .join(separator);
  const eventTypeLabel = formatBookingEventDisplay(booking, invLang, db.eventTypes);
  const statusLabel = translateStatus(booking.status, invLang);
  const eventDateLabel = formatDateDisplay(booking.event_date, invLang);
  const timeRangeLabel = `${formatTime12h(booking.start_time, invLang)} – ${formatTime12h(
    booking.end_time,
    invLang
  )}`;

  const contactSummaryLine = [
    bookingHall.phone,
    bookingHall.phone_secondary,
    bookingHall.whatsapp ? `WhatsApp: +${bookingHall.whatsapp}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const shareSummaryText =
    invLang === 'ur'
      ? [
          `*${hallName}*`,
          ...(hallTagline ? [hallTagline] : []),
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
          `رابطہ: ${contactSummaryLine || settings.phone}`,
          ...(bookingHall.website ? [`ویب سائٹ: ${bookingHall.website}`] : []),
        ].join('\n')
      : [
          `*${hallName}*`,
          ...(hallTagline ? [hallTagline] : []),
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
          `Contact: ${contactSummaryLine || settings.phone}`,
          ...(bookingHall.website ? [`Website: ${bookingHall.website}`] : []),
        ].join('\n');

  const emailSubject =
    invLang === 'ur'
      ? `${hallName} - انوائس ${booking.invoice_number} (${booking.booking_code})`
      : `${hallName} Invoice ${booking.invoice_number} (${booking.booking_code})`;

  const handleSendEmail = async () => {
    const targetEmail = booking.customer_email || bookingHall.email || settings.email;
    setEmailStatus(lang === 'ur' ? 'بھیجا جا رہا ہے...' : 'Sending...');
    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: emailSubject,
          text: shareSummaryText,
          html: `<pre dir="${invLang === 'ur' ? 'rtl' : 'ltr'}" style="font-family:sans-serif;line-height:1.7">${shareSummaryText}</pre>`,
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
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-200">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">{tr('invoiceLanguage', lang)}:</span>
              <select
                value={invLang}
                onChange={(e) => setInvLang(e.target.value as Language)}
                aria-label={tr('invoiceLanguage', lang)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="en" className="bg-slate-900 text-white">
                  {tr('englishName', lang)}
                </option>
                <option value="ur" className="bg-slate-900 text-white">
                  {tr('urduName', lang)}
                </option>
              </select>
            </label>
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

        {/* Printable Official A4 Invoice Sheet */}
        <div
          dir={invLang === 'ur' ? 'rtl' : 'ltr'}
          className={`print-only-sheet bg-white text-slate-900 rounded-2xl p-6 sm:p-10 shadow-2xl border border-slate-200 ${
            invLang === 'ur' ? 'font-urdu' : ''
          }`}
        >
          {/* Letterhead */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-slate-900 pb-5">
            <div className="flex items-center gap-4">
              <img
                src={logoSrc}
                alt={hallName}
                crossOrigin={logoSrc.startsWith('http') ? 'anonymous' : undefined}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border border-slate-300"
              />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{hallName}</h1>
                {hallTagline && (
                  <p className="text-xs font-medium text-slate-700 mt-0.5">{hallTagline}</p>
                )}
                {hallAddress && <p className="text-xs text-slate-600 mt-0.5">{hallAddress}</p>}
                <p className="text-xs text-slate-700 mt-1">
                  <span>{invLang === 'ur' ? 'فون:' : 'Tel:'}</span>{' '}
                  <span className="tabular-nums">{bookingHall.phone || settings.phone}</span>
                  {bookingHall.phone_secondary ? (
                    <>
                      {' / '}
                      <span className="tabular-nums">{bookingHall.phone_secondary}</span>
                    </>
                  ) : null}
                  {bookingHall.whatsapp ? (
                    <>
                      {' · '}
                      <span>{tr('whatsappLabel', invLang)}:</span>{' '}
                      <span className="tabular-nums">+{bookingHall.whatsapp}</span>
                    </>
                  ) : null}
                  {bookingHall.email ? (
                    <>
                      {' · '}
                      <span>{invLang === 'ur' ? 'ای میل:' : 'Email:'}</span>{' '}
                      <span className="tabular-nums">{bookingHall.email}</span>
                    </>
                  ) : null}
                </p>
                {(bookingHall.website || bookingHall.ntn || bookingHall.strn || socialItems.length > 0) && (
                  <p className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    {bookingHall.website && (
                      <span>
                        {tr('websiteLabel', invLang)}: {bookingHall.website}
                      </span>
                    )}
                    {bookingHall.ntn && (
                      <span className="tabular-nums">
                        {tr('ntnLabel', invLang)}: {bookingHall.ntn}
                      </span>
                    )}
                    {bookingHall.strn && (
                      <span className="tabular-nums">
                        {tr('strnLabel', invLang)}: {bookingHall.strn}
                      </span>
                    )}
                    {socialItems.map((s) => (
                      <a
                        key={s.label}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-slate-600"
                      >
                        {s.label}
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </div>

            <div className="text-start sm:text-end">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                {tr('officialInvoice', invLang)}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {booking.invoice_number}
              </div>
              <div className="text-xs text-slate-700 mt-1">
                <span>{tr('bookingCodeLabel', invLang)}</span>{' '}
                <strong className="tabular-nums">{booking.booking_code}</strong>
              </div>
              <div className="text-xs text-slate-600">
                <span>{tr('bookingDateLabel', invLang)}</span>{' '}
                <span className="tabular-nums">{formatDateDisplay(booking.booking_date, invLang)}</span>
              </div>
              <div className="text-xs text-slate-600">
                <span>{tr('issueDateLabel', invLang)}</span>{' '}
                <span className="tabular-nums">{formatDateDisplay(todayISO(), invLang)}</span>
              </div>
            </div>
          </div>

          {booking.status === 'Cancelled' && booking.cancellation_details && (
            <div className="mt-4 p-3 rounded-lg border border-rose-300 bg-rose-50 text-xs text-rose-900 flex flex-wrap justify-between gap-2">
              <span className="font-bold">
                {invLang === 'ur' ? 'منسوخ شدہ بکنگ' : 'CANCELLED BOOKING'}
              </span>
              <span className="tabular-nums">
                {invLang === 'ur' ? 'وصول شدہ:' : 'Paid:'}{' '}
                {formatPKR(booking.cancellation_details.amount_paid_so_far)} |{' '}
                {invLang === 'ur' ? 'کٹوتی:' : 'Deduction:'}{' '}
                {formatPKR(booking.cancellation_details.deduction_amount)} |{' '}
                {invLang === 'ur' ? 'واپسی:' : 'Refund:'}{' '}
                {formatPKR(booking.cancellation_details.refund_amount)} (
                {translatePaymentMode(booking.cancellation_details.refund_mode, invLang)})
              </span>
            </div>
          )}

          {/* Customer & Event Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 border-b border-slate-200 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-slate-700 mb-1.5">{tr('billTo', invLang)}</div>
              <div className="text-sm font-bold text-slate-900">{booking.customer_name}</div>
              {booking.customer_address && (
                <div className="text-slate-600">{booking.customer_address}</div>
              )}
              <div className="text-slate-700">
                <span>{invLang === 'ur' ? 'فون:' : 'Phone:'}</span>{' '}
                <span className="tabular-nums">{booking.customer_phone}</span>
              </div>
              {booking.customer_nic && (
                <div className="text-slate-700">
                  <span>{invLang === 'ur' ? 'شناختی کارڈ:' : 'CNIC:'}</span>{' '}
                  <span className="tabular-nums">{booking.customer_nic}</span>
                </div>
              )}
            </div>

            <div className="space-y-1 sm:text-end">
              <div className="font-bold text-slate-700 mb-1.5">{tr('eventSchedule', invLang)}</div>
              <div className="text-sm font-bold text-slate-900">
                {eventTypeLabel} (<span className="tabular-nums">{booking.guests_count}</span>{' '}
                {invLang === 'ur' ? 'مہمان' : 'Guests'})
              </div>
              <div className="text-slate-700">
                <span>{tr('eventDateLabel', invLang)}</span>{' '}
                <span className="tabular-nums">{eventDateLabel}</span> ·{' '}
                <span className="tabular-nums">{timeRangeLabel}</span>
              </div>
              <div className="text-slate-700">
                <span>{tr('floorsLabel', invLang)}</span> {floorLabel}
              </div>
              <div className="text-slate-700">
                <span>{tr('status', invLang)}:</span> {statusLabel}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="py-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 text-slate-700 bg-slate-50">
                  <th className="py-2.5 px-3 text-start">{tr('descriptionCol', invLang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('qtyCol', invLang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('rateCol', invLang)}</th>
                  <th className="py-2.5 px-3 text-end">{tr('amountCol', invLang)} (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">
                      {tr('hallRentLineDesc', invLang)} ({floorLabel})
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
                  const itemLabel = translateBookingItemName(it, invLang, db.chargesCatalog);
                  return (
                    <tr key={it.id} className={isCrate ? 'bg-slate-50/80' : ''}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">
                          {itemLabel}{' '}
                          {it.is_package_included && (
                            <span className="text-[11px] text-slate-500">
                              ({invLang === 'ur' ? 'پیکج میں شامل' : 'Included in Package'})
                            </span>
                          )}
                        </div>
                        {isCrate && booking.crates_ordered > 0 && (
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            {invLang === 'ur' ? (
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
                              invLang === 'ur' ? 'خالص' : 'net'
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
                        {tr('coldDrinksServiceDesc', invLang)} (
                        {invLang === 'ur'
                          ? `آرڈر: ${booking.crates_ordered}، استعمال: ${booking.crates_used}، واپسی: ${booking.crates_returned}`
                          : `Ordered: ${booking.crates_ordered}, Used: ${booking.crates_used}, Returned: ${booking.crates_returned}`}
                        )
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {invLang === 'ur' ? (
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
                      {invLang === 'ur' ? 'خالص' : 'net'}
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
                        {tr('lateChargeOvertimeLine', invLang)}
                        {booking.actual_end_time && (
                          <span className="text-[11px] font-normal text-slate-600 ms-1.5">
                            (
                            {invLang === 'ur' ? 'مقررہ اختتام:' : 'Scheduled End:'}{' '}
                            <span className="tabular-nums">
                              {formatTime12h(booking.end_time, invLang)}
                            </span>{' '}
                            → {invLang === 'ur' ? 'حقیقی اختتام:' : 'Actual End:'}{' '}
                            <span className="tabular-nums">
                              {formatTime12h(booking.actual_end_time, invLang)}
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
                        {tr('rescheduleFeeLine', invLang)}
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
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  {tr('paymentsReceived', invLang)}
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
                            {formatDateDisplay(p.payment_date, invLang)}
                          </span>{' '}
                          ({translatePaymentMode(p.mode, invLang)})
                        </span>
                        <span className="font-semibold tabular-nums">{formatPKR(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    {invLang === 'ur' ? 'ابھی تک کوئی ادائیگی درج نہیں ہوئی۔' : 'No payments recorded yet.'}
                  </div>
                )}
              </div>

              {hasBankDetails && (
                <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 space-y-0.5">
                  <div className="font-bold text-slate-800">
                    {tr('bankPaymentDetails', invLang)}
                  </div>
                  {bookingHall.bank_name && (
                    <div>
                      {tr('bankNameLabel', invLang)}: {bookingHall.bank_name}
                    </div>
                  )}
                  {bookingHall.bank_account_title && (
                    <div>
                      {tr('accountTitleLabel', invLang)}: {bookingHall.bank_account_title}
                    </div>
                  )}
                  {bookingHall.bank_iban && (
                    <div className="tabular-nums font-mono">
                      {tr('ibanLabel', invLang)}: {bookingHall.bank_iban}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-700">
                <span>{tr('standardTotal', invLang)}</span>
                <span className="tabular-nums">{formatPKR(fin.standardTotal)}</span>
              </div>
              {fin.crateCreditReversed > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{tr('crateCredit', invLang)}</span>
                  <span className="tabular-nums">- {formatPKR(fin.crateCreditReversed)}</span>
                </div>
              )}
              {fin.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>
                    {tr('specialDiscount', invLang)}
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
                    {tr('taxLabel', invLang)} (<span className="tabular-nums">{booking.tax_percent}%</span>)
                  </span>
                  <span className="tabular-nums">{formatPKR(fin.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-2">
                <span>{tr('finalAgreedTotal', invLang)}</span>
                <span className="tabular-nums">{formatPKR(fin.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>{tr('totalPaidLabel', invLang)}</span>
                <span className="tabular-nums">{formatPKR(fin.totalPaid)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 border-t-2 border-slate-900 pt-2">
                <span>{tr('balanceDueLabel', invLang)}</span>
                <span className="tabular-nums">{formatPKR(fin.balance)}</span>
              </div>
            </div>
          </div>

          {/* Terms, Footer & Signatures */}
          <div className="mt-6 pt-4 border-t border-slate-200 text-[11px] text-slate-600 space-y-6">
            {hallTerms && (
              <div>
                <div className="font-bold text-slate-800 mb-1">{tr('termsAndConditions', invLang)}</div>
                <p className={invLang === 'ur' ? 'leading-loose' : 'leading-relaxed'}>{hallTerms}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-8 pt-6 items-end">
              <div className="border-t border-slate-300 pt-2 text-center font-semibold text-slate-700">
                {tr('customerSignature', invLang)}
              </div>
              <div className="text-center">
                {signatureSrc && (
                  <img
                    src={signatureSrc}
                    alt={tr('authorizedSignature', invLang)}
                    crossOrigin={signatureSrc.startsWith('http') ? 'anonymous' : undefined}
                    referrerPolicy="no-referrer"
                    className="h-12 max-w-[160px] object-contain mx-auto mb-1"
                  />
                )}
                <div className="border-t border-slate-300 pt-2 text-center font-semibold text-slate-700">
                  {tr('authorizedSignature', invLang)}
                </div>
              </div>
            </div>

            {hallFooter && (
              <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                {hallFooter}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
