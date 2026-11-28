import React, { useMemo } from 'react';
import { Bell, CalendarClock, Mail, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatBookingEventDisplay,
  pickLocalized,
  tr,
  translateFloor,
} from '../i18n/translations';
import { Booking } from '../types';
import {
  addDaysISO,
  buildMailtoLink,
  buildWhatsAppLink,
  calculateBookingFinancials,
  formatDateDisplay,
  formatPKR,
  formatTime12h,
  todayISO,
} from '../utils/formatters';

export const RemindersView: React.FC = () => {
  const { db, rawDb, activeHall, lang } = useApp();
  const today = todayISO();
  const next7 = addDaysISO(today, 7);

  const installmentAlerts = useMemo(() => {
    return db.installments
      .filter((ins) => !ins.deleted_at && !ins.is_paid)
      .map((ins) => {
        const booking = db.bookings.find((b) => b.id === ins.booking_id && !b.deleted_at);
        if (!booking || booking.status === 'Cancelled') return null;
        return { ins, booking, overdue: ins.due_date < today };
      })
      .filter(Boolean)
      .sort((a, b) => a!.ins.due_date.localeCompare(b!.ins.due_date)) as Array<{
      ins: typeof db.installments[0];
      booking: Booking;
      overdue: boolean;
    }>;
  }, [db.installments, db.bookings, today]);

  const upcomingEvents = useMemo(() => {
    return db.bookings
      .filter(
        (b) =>
          !b.deleted_at &&
          b.status !== 'Cancelled' &&
          b.event_date >= today &&
          b.event_date <= next7
      )
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [db.bookings, today, next7]);

  const makeReminderMsg = (bk: Booking, extraLine: string) => {
    const bookingHall = rawDb.halls.find((h) => h.id === bk.hall_id) || activeHall;
    const bkHallName = pickLocalized(bookingHall.name, bookingHall.name_ur, lang);
    const contactPhone = bookingHall.whatsapp
      ? `+${bookingHall.whatsapp}`
      : bookingHall.phone || db.settings.phone;
    const eventLabel = formatBookingEventDisplay(bk, lang, db.eventTypes);
    const dateLabel = formatDateDisplay(bk.event_date, lang);
    if (lang === 'ur') {
      return [
        `السلام علیکم ${bk.customer_name}،`,
        `${bkHallName} کی جانب سے یاددہانی`,
        `بکنگ کوڈ: ${bk.booking_code} | تقریب: ${eventLabel} (${dateLabel})`,
        extraLine,
        `رابطہ نمبر: ${contactPhone}`,
      ].join('\n');
    }
    return [
      `Assalam-o-Alaikum ${bk.customer_name},`,
      `Reminder from ${bkHallName}`,
      `Booking: ${bk.booking_code} | Event: ${eventLabel} on ${dateLabel}`,
      extraLine,
      `Contact: ${contactPhone}`,
    ].join('\n');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-amber-400" />
          <span>{tr('upcomingDue', lang)}</span>
        </h2>
        <div className="divide-y divide-slate-800/70">
          {installmentAlerts.map(({ ins, booking, overdue }) => {
            const dueFormatted = formatDateDisplay(ins.due_date, lang);
            const extraLine =
              lang === 'ur'
                ? `قسط: ${ins.title} — ${formatPKR(ins.amount)} (آخری تاریخ: ${dueFormatted})`
                : `Installment: ${ins.title} — ${formatPKR(ins.amount)} (Due: ${dueFormatted})`;
            const msg = makeReminderMsg(booking, extraLine);
            const mailSubject =
              lang === 'ur'
                ? `قسط کی یاددہانی - ${booking.booking_code}`
                : `Installment Reminder - ${booking.booking_code}`;

            return (
              <div
                key={ins.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    {booking.customer_name}{' '}
                    <span className="text-xs text-cyan-400 tabular-nums">
                      ({booking.booking_code})
                    </span>
                  </div>
                  <div className="text-xs mt-1">
                    <span
                      className={
                        overdue ? 'text-rose-400 font-bold' : 'text-amber-300 font-bold'
                      }
                    >
                      {overdue ? tr('overdue', lang) : tr('dueSoon', lang)}
                    </span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-300">{ins.title}</span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-400">
                      {lang === 'ur' ? 'آخری تاریخ:' : 'Due'}{' '}
                      <span className="tabular-nums">{dueFormatted}</span>
                    </span>
                  </div>
                  <div className="text-sm font-bold text-cyan-300 tabular-nums mt-1">
                    {formatPKR(ins.amount)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={buildWhatsAppLink(booking.customer_phone, msg)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{tr('whatsApp', lang)}</span>
                  </a>
                  {booking.customer_email && (
                    <a
                      href={buildMailtoLink(booking.customer_email, mailSubject, msg)}
                      className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{tr('email', lang)}</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {installmentAlerts.length === 0 && (
            <p className="py-8 text-xs text-slate-500">{tr('noInstallmentsDue', lang)}</p>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <CalendarClock className="w-4 h-4 text-cyan-400" />
          <span>{tr('upcomingEvents7d', lang)}</span>
        </h2>
        <div className="divide-y divide-slate-800/70">
          {upcomingEvents.map((bk) => {
            const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments);
            const floorText = bk.floors
              .map((f) => translateFloor(f, lang, db.floors))
              .join(lang === 'ur' ? '، ' : ', ');
            const timeText = `${formatTime12h(bk.start_time, lang)} – ${formatTime12h(
              bk.end_time,
              lang
            )}`;
            const extraLine =
              lang === 'ur'
                ? `فلورز: ${floorText} (${timeText}) | بقایا رقم: ${formatPKR(fin.balance)}`
                : `Floors: ${floorText} (${timeText}) | Balance: ${formatPKR(fin.balance)}`;
            const msg = makeReminderMsg(bk, extraLine);

            return (
              <div
                key={bk.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    <span className="text-cyan-400 tabular-nums">{bk.booking_code}</span> ·{' '}
                    {bk.customer_name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <span className="tabular-nums">{formatDateDisplay(bk.event_date, lang)}</span>{' '}
                    · <span className="tabular-nums">{timeText}</span> · {floorText}
                  </div>
                  <div className="text-xs text-amber-300 mt-1">
                    {tr('remainingBalance', lang)}:{' '}
                    <span className="tabular-nums">{formatPKR(fin.balance)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={buildWhatsAppLink(bk.customer_phone, msg)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{tr('sendReminder', lang)}</span>
                  </a>
                </div>
              </div>
            );
          })}
          {upcomingEvents.length === 0 && (
            <p className="py-8 text-xs text-slate-500">{tr('noRecords', lang)}</p>
          )}
        </div>
      </div>
    </div>
  );
};
