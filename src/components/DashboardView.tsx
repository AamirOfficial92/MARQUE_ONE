import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Bell,
  CalendarCheck,
  Mail,
  MessageCircle,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  pickLocalized,
  tr,
  translateEventType,
  translateFloor,
  translateStatus,
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
  normalizeWesternDigits,
  todayISO,
} from '../utils/formatters';

interface DashboardViewProps {
  onOpenBooking: (booking: Booking) => void;
  onOpenInvoice: (booking: Booking) => void;
  onNavigateReminders: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenBooking,
  onOpenInvoice,
  onNavigateReminders,
}) => {
  const { db, lang, can } = useApp();
  const isUr = lang === 'ur';
  const today = todayISO();
  const currentMonthPrefix = today.slice(0, 7);
  const next7End = addDaysISO(today, 7);
  const canSeeExpensesAndProfit = can('expenses', 'view') || can('reports', 'view');
  const canViewInvoices = can('invoices', 'view');
  const canViewReminders = can('reminders', 'view');

  const hallName = pickLocalized(db.settings.hall_name, db.settings.hall_name_ur, lang);

  const activeBookings = useMemo(
    () => db.bookings.filter((b) => !b.deleted_at && b.status !== 'Cancelled'),
    [db.bookings]
  );

  const todaysEvents = useMemo(
    () => activeBookings.filter((b) => b.event_date === today),
    [activeBookings, today]
  );

  const upcoming7Days = useMemo(
    () =>
      activeBookings
        .filter((b) => b.event_date >= today && b.event_date <= next7End)
        .sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [activeBookings, today, next7End]
  );

  const financialStats = useMemo(() => {
    const activePayments = db.payments.filter((p) => !p.deleted_at);
    const activeExpenses = db.expenses.filter((e) => !e.deleted_at);

    const monthIncome = activePayments
      .filter((p) => p.payment_date.startsWith(currentMonthPrefix))
      .reduce((s, p) => s + Number(p.amount), 0);

    const monthExpenses = activeExpenses
      .filter((e) => e.expense_date.startsWith(currentMonthPrefix))
      .reduce((s, e) => s + Number(e.amount), 0);

    const totalOutstanding = activeBookings.reduce((s, bk) => {
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments);
      return s + fin.balance;
    }, 0);

    return {
      monthIncome,
      monthExpenses,
      monthProfit: monthIncome - monthExpenses,
      totalOutstanding,
    };
  }, [db.payments, db.expenses, db.bookingItems, activeBookings, currentMonthPrefix]);

  const monthlySeries = useMemo(() => {
    const now = new Date();
    const months: Array<{ key: string; label: string; income: number; expense: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = normalizeWesternDigits(
        d.toLocaleDateString(isUr ? 'ur-PK-u-nu-latn' : 'en-US', { month: 'short' })
      );
      const income = db.payments
        .filter((p) => !p.deleted_at && p.payment_date.startsWith(key))
        .reduce((s, p) => s + Number(p.amount), 0);
      const expense = db.expenses
        .filter((e) => !e.deleted_at && e.expense_date.startsWith(key))
        .reduce((s, e) => s + Number(e.amount), 0);
      months.push({ key, label, income, expense });
    }
    return months;
  }, [db.payments, db.expenses, isUr]);

  const maxChartValue = Math.max(
    100000,
    ...monthlySeries.map((m) => Math.max(m.income, m.expense))
  );

  const eventBreakdown = useMemo(() => {
    const counts: Record<string, { label: string; count: number; total: number; color: string }> =
      {};
    for (const bk of activeBookings) {
      const et = db.eventTypes.find(
        (t) => t.name_en.toLowerCase() === bk.event_type.toLowerCase()
      );
      const etLabel = translateEventType(bk.event_type, lang, db.eventTypes);
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments);
      if (!counts[etLabel]) {
        counts[etLabel] = {
          label: etLabel,
          count: 0,
          total: 0,
          color: et?.color_hex || '#06B6D4',
        };
      }
      counts[etLabel].count += 1;
      counts[etLabel].total += fin.grandTotal;
    }
    return Object.values(counts).sort((a, b) => b.total - a.total);
  }, [activeBookings, db.eventTypes, db.bookingItems, db.payments, lang]);

  const installmentAlerts = useMemo(() => {
    return db.installments
      .filter((ins) => !ins.deleted_at && !ins.is_paid)
      .map((ins) => {
        const booking = db.bookings.find((b) => b.id === ins.booking_id && !b.deleted_at);
        if (!booking || booking.status === 'Cancelled') return null;
        return { ins, booking, isOverdue: ins.due_date < today };
      })
      .filter(Boolean) as Array<{
      ins: typeof db.installments[0];
      booking: Booking;
      isOverdue: boolean;
    }>;
  }, [db.installments, db.bookings, today]);

  const buildReminderMessage = (bk: Booking, amountDue?: number, dueDate?: string) => {
    const floorText = bk.floors
      .map((f) => translateFloor(f, lang, db.floors))
      .join(isUr ? '، ' : ', ');
    const eventDateText = formatDateDisplay(bk.event_date, lang);
    if (isUr) {
      return [
        `السلام علیکم ${bk.customer_name}،`,
        `${hallName} کی جانب سے یاددہانی:`,
        `بکنگ کوڈ: ${bk.booking_code}`,
        `تقریب کی تاریخ: ${eventDateText} (${floorText})`,
        ...(amountDue
          ? [
              `واجب الادا قسط: ${formatPKR(amountDue)} (آخری تاریخ: ${formatDateDisplay(
                dueDate || '',
                lang
              )})`,
            ]
          : []),
        `مزید معلومات کے لیے رابطہ کریں: ${db.settings.phone}`,
      ].join('\n');
    }
    return [
      `Assalam-o-Alaikum ${bk.customer_name},`,
      `Friendly reminder from ${hallName} (${db.settings.phone}):`,
      `Booking Code: ${bk.booking_code}`,
      `Event Date: ${eventDateText} (${floorText})`,
      ...(amountDue
        ? [
            `Installment Due: ${formatPKR(amountDue)} (Due Date: ${formatDateDisplay(
              dueDate || '',
              lang
            )})`,
          ]
        : []),
      `Thank you for choosing ${hallName}.`,
    ].join('\n');
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel neon-border-cyan rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{tr('todayEvents', lang)}</span>
            <CalendarCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3 text-3xl font-bold text-white tabular-nums">
            {todaysEvents.length}
          </div>
          <div className="mt-2 text-xs text-slate-400 truncate">
            {todaysEvents.length > 0
              ? todaysEvents
                  .map(
                    (e) =>
                      `${translateEventType(e.event_type, lang, db.eventTypes)} · ${e.floors
                        .map((f) => translateFloor(f, lang, db.floors))
                        .join('/')}`
                  )
                  .join(' | ')
              : tr('noEventsToday', lang)}
          </div>
        </div>

        <div className="glass-panel neon-border-violet rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{tr('monthIncome', lang)}</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tabular-nums">
            {formatPKR(financialStats.monthIncome)}
          </div>
          <div className="mt-2 text-xs text-slate-400 tabular-nums">{currentMonthPrefix}</div>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {canSeeExpensesAndProfit ? tr('monthExpenses', lang) : tr('activeBookingsLabel', lang)}
            </span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tabular-nums">
            {canSeeExpensesAndProfit
              ? formatPKR(financialStats.monthExpenses)
              : activeBookings.length}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {canSeeExpensesAndProfit ? (
              <>
                {tr('netProfit', lang)}:{' '}
                <span className="tabular-nums">{formatPKR(financialStats.monthProfit)}</span>
              </>
            ) : (
              <>
                <span className="tabular-nums">{upcoming7Days.length}</span>{' '}
                {tr('upcoming7dSub', lang)}
              </>
            )}
          </div>
        </div>

        <div className="glass-panel neon-border-gold rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{tr('outstandingBalance', lang)}</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-300 tabular-nums">
            {formatPKR(financialStats.totalOutstanding)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="tabular-nums">{installmentAlerts.length}</span>{' '}
            {isUr ? 'اقساط باقی' : 'open installments'}
          </div>
        </div>
      </div>

      {/* Main Analytics + Reminders Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">
                {canSeeExpensesAndProfit
                  ? tr('revenueVsExpenses', lang)
                  : isUr
                  ? '6 ماہ کی وصولیاں (PKR)'
                  : '6-Month Collections (PKR)'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {canSeeExpensesAndProfit
                  ? isUr
                    ? 'وصول شدہ ادائیگیاں بمقابلہ ہال کے اخراجات'
                    : 'Collected payments against hall operational expenses'
                  : isUr
                  ? 'ماہانہ وصول شدہ ادائیگیاں'
                  : 'Monthly customer payments collected'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
                {tr('incomeLegend', lang)}
              </span>
              {canSeeExpensesAndProfit && (
                <span className="flex items-center gap-1.5 text-violet-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />
                  {tr('expensesLegend', lang)}
                </span>
              )}
            </div>
          </div>

          <div className="w-full overflow-x-auto" dir="ltr">
            <svg viewBox="0 0 600 220" className="w-full min-w-[440px] h-56">
              {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = 180 - ratio * 150;
                return (
                  <g key={idx}>
                    <line
                      x1="40"
                      y1={y}
                      x2="585"
                      y2={y}
                      stroke="rgba(148,163,184,0.12)"
                      strokeDasharray="3 3"
                    />
                    <text x="4" y={y + 4} fill="#64748b" fontSize="10" fontFamily="JetBrains Mono">
                      {Math.round((maxChartValue * ratio) / 1000)}k
                    </text>
                  </g>
                );
              })}

              {monthlySeries.map((m, idx) => {
                const groupX = 65 + idx * 88;
                const incH = Math.max(4, (m.income / maxChartValue) * 150);
                const expH = Math.max(4, (m.expense / maxChartValue) * 150);
                return (
                  <g key={m.key}>
                    <rect
                      x={canSeeExpensesAndProfit ? groupX : groupX + 14}
                      y={180 - incH}
                      width="24"
                      height={incH}
                      rx="4"
                      fill="#06B6D4"
                      opacity="0.9"
                    >
                      <title>{`${m.label} ${tr('incomeLegend', lang)}: ${formatPKR(m.income)}`}</title>
                    </rect>
                    {canSeeExpensesAndProfit && (
                      <rect
                        x={groupX + 28}
                        y={180 - expH}
                        width="24"
                        height={expH}
                        rx="4"
                        fill="#8B5CF6"
                        opacity="0.85"
                      >
                        <title>{`${m.label} ${tr('expensesLegend', lang)}: ${formatPKR(
                          m.expense
                        )}`}</title>
                      </rect>
                    )}
                    <text
                      x={groupX + 26}
                      y="202"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="11"
                      fontFamily={isUr ? 'Noto Nastaliq Urdu' : 'Plus Jakarta Sans'}
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-white mb-1">
              {isUr ? 'تقریبات کی قسم کے لحاظ سے آمدنی' : 'Revenue by Event Type'}
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              {isUr ? 'فعال بکنگز کی کل مالیت' : 'Active bookings contract value'}
            </p>
            <div className="space-y-4">
              {eventBreakdown.map((data) => {
                const maxTotal = Math.max(1, eventBreakdown[0]?.total || 1);
                const pct = Math.round((data.total / maxTotal) * 100);
                return (
                  <div key={data.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-200">
                        {data.label}{' '}
                        <span className="text-slate-500 tabular-nums">· {data.count}</span>
                      </span>
                      <span className="tabular-nums text-slate-300">{formatPKR(data.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: data.color }}
                      />
                    </div>
                  </div>
                );
              })}
              {eventBreakdown.length === 0 && (
                <p className="text-xs text-slate-500">{tr('noRecords', lang)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming 7 Days & Installment Reminders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{tr('upcomingEvents7d', lang)}</h2>
            <span className="text-xs text-cyan-400 tabular-nums">
              {upcoming7Days.length} {isUr ? 'تقریبات' : 'events'}
            </span>
          </div>
          <div className="divide-y divide-slate-800/70">
            {upcoming7Days.map((bk) => {
              const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments);
              const msg = buildReminderMessage(bk);
              return (
                <div
                  key={bk.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenBooking(bk)}
                      className="text-sm font-semibold text-white hover:text-cyan-300 transition-colors text-start flex items-center gap-1.5"
                    >
                      <span className="tabular-nums text-cyan-400">{bk.booking_code}</span>
                      <span>·</span>
                      <span className="truncate">{bk.customer_name}</span>
                    </button>
                    <div className="text-xs text-slate-400 mt-1">
                      <span className="tabular-nums">{formatDateDisplay(bk.event_date, lang)}</span>{' '}
                      ·{' '}
                      <span className="tabular-nums">
                        {formatTime12h(bk.start_time, lang)}–{formatTime12h(bk.end_time, lang)}
                      </span>{' '}
                      ·{' '}
                      {bk.floors
                        .map((f) => translateFloor(f, lang, db.floors))
                        .join(isUr ? '، ' : ', ')}{' '}
                      · {translateStatus(bk.status, lang)}
                    </div>
                    <div className="text-xs text-amber-300/90 mt-1">
                      {tr('remainingBalance', lang)}:{' '}
                      <span className="tabular-nums">{formatPKR(fin.balance)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppLink(bk.customer_phone, msg)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 flex items-center gap-1 whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{tr('whatsApp', lang)}</span>
                    </a>
                    {canViewInvoices && (
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(bk)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 text-xs font-medium hover:border-cyan-500/40 flex items-center gap-1 whitespace-nowrap"
                      >
                        <span>{isUr ? 'انوائس' : 'Invoice'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {upcoming7Days.length === 0 && (
              <p className="py-6 text-xs text-slate-500">{tr('noRecords', lang)}</p>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>{tr('upcomingDue', lang)}</span>
            </h2>
            {canViewReminders && (
              <button
                type="button"
                onClick={onNavigateReminders}
                className="text-xs text-cyan-400 hover:underline whitespace-nowrap"
              >
                {tr('viewAll', lang)}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-800/70">
            {installmentAlerts.slice(0, 5).map(({ ins, booking, isOverdue }) => {
              const msg = buildReminderMessage(booking, ins.amount, ins.due_date);
              const mailSubject = isUr
                ? `ادائیگی کی یاددہانی - ${booking.booking_code}`
                : `Payment Reminder - ${booking.booking_code}`;
              return (
                <div
                  key={ins.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {booking.customer_name}{' '}
                      <span className="text-xs font-normal text-slate-400 tabular-nums">
                        ({booking.booking_code})
                      </span>
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-2">
                      <span
                        className={
                          isOverdue
                            ? 'text-rose-400 font-semibold'
                            : 'text-amber-300 font-semibold'
                        }
                      >
                        {isOverdue ? tr('overdue', lang) : tr('dueSoon', lang)}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-300">{ins.title}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400 tabular-nums">
                        {formatDateDisplay(ins.due_date, lang)}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-cyan-300 mt-1 tabular-nums">
                      {formatPKR(ins.amount)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppLink(booking.customer_phone, msg)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 flex items-center gap-1 whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{tr('sendReminder', lang)}</span>
                    </a>
                    {booking.customer_email && (
                      <a
                        href={buildMailtoLink(booking.customer_email, mailSubject, msg)}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/70 text-slate-300 hover:border-cyan-500/40"
                        title={tr('email', lang)}
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {installmentAlerts.length === 0 && (
              <p className="py-6 text-xs text-slate-500">{tr('noInstallmentsDue', lang)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
