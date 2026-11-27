import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import {
  pickLocalized,
  tr,
  translateChargeCategoryName,
  translateEventType,
  translateExpenseCategoryName,
} from '../i18n/translations';
import {
  addDaysISO,
  calculateBookingFinancials,
  formatDateDisplay,
  formatPKR,
  todayISO,
} from '../utils/formatters';

type RangePreset = 'weekly' | 'monthly' | 'yearly' | 'custom';

export const ReportsView: React.FC = () => {
  const { db, lang, currentUser } = useApp();
  const today = todayISO();
  const [preset, setPreset] = useState<RangePreset>('monthly');
  const [customStart, setCustomStart] = useState<string>(today.slice(0, 7) + '-01');
  const [customEnd, setCustomEnd] = useState<string>(today);

  const hallName = pickLocalized(db.settings.hall_name, db.settings.hall_name_ur, lang);
  const hallAddress = pickLocalized(db.settings.address, db.settings.address_ur, lang);

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'weekly') {
      return { startDate: addDaysISO(today, -7), endDate: addDaysISO(today, 7) };
    }
    if (preset === 'monthly') {
      return { startDate: today.slice(0, 7) + '-01', endDate: addDaysISO(today, 31) };
    }
    if (preset === 'yearly') {
      return { startDate: today.slice(0, 4) + '-01-01', endDate: today.slice(0, 4) + '-12-31' };
    }
    return { startDate: customStart, endDate: customEnd };
  }, [preset, customStart, customEnd, today]);

  const reportData = useMemo(() => {
    const paymentsInRange = db.payments.filter(
      (p) => !p.deleted_at && p.payment_date >= startDate && p.payment_date <= endDate
    );
    const expensesInRange = db.expenses.filter(
      (e) => !e.deleted_at && e.expense_date >= startDate && e.expense_date <= endDate
    );
    const bookingsInRange = db.bookings.filter(
      (b) =>
        !b.deleted_at &&
        b.status !== 'Cancelled' &&
        b.event_date >= startDate &&
        b.event_date <= endDate
    );

    const totalIncome = paymentsInRange.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expensesInRange.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = totalIncome - totalExpenses;

    const byEventType: Record<string, { label: string; count: number; total: number }> = {};
    const byChargeCategory: Record<string, { label: string; amount: number }> = {
      'Hall Rent': {
        label: translateChargeCategoryName('Hall Rent', lang, db.chargeCategories),
        amount: 0,
      },
      'Late Charges': {
        label: translateChargeCategoryName('Late Charges', lang, db.chargeCategories),
        amount: 0,
      },
      'Reschedule Fees': {
        label: translateChargeCategoryName('Reschedule Fees', lang, db.chargeCategories),
        amount: 0,
      },
    };
    let totalDiscounts = 0;

    for (const bk of bookingsInRange) {
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);
      const etLabel = translateEventType(bk.event_type, lang, db.eventTypes);
      if (!byEventType[etLabel]) byEventType[etLabel] = { label: etLabel, count: 0, total: 0 };
      byEventType[etLabel].count += 1;
      byEventType[etLabel].total += fin.grandTotal;

      byChargeCategory['Hall Rent'].amount += fin.hallRent;
      byChargeCategory['Late Charges'].amount += fin.lateCharge;
      byChargeCategory['Reschedule Fees'].amount += fin.rescheduleFeeTotal;
      totalDiscounts += fin.discountAmount;

      const items = db.bookingItems.filter((i) => i.booking_id === bk.id && !i.deleted_at);
      const hasColdDrinkLine = items.some(
        (i) => i.is_crate_service || i.item_name.toLowerCase().includes('cold drink')
      );
      if (!hasColdDrinkLine && fin.crateNet > 0) {
        if (!byChargeCategory['Beverages']) {
          byChargeCategory['Beverages'] = {
            label: translateChargeCategoryName('Beverages', lang, db.chargeCategories),
            amount: 0,
          };
        }
        byChargeCategory['Beverages'].amount += fin.crateNet;
      }
      for (const it of items) {
        const catLabel = translateChargeCategoryName(
          it.category_name,
          lang,
          db.chargeCategories
        );
        if (!byChargeCategory[catLabel]) {
          byChargeCategory[catLabel] = { label: catLabel, amount: 0 };
        }
        byChargeCategory[catLabel].amount += Number(it.amount);
      }
    }

    const byExpenseCategory: Record<string, { label: string; amount: number }> = {};
    for (const ex of expensesInRange) {
      const catLabel = translateExpenseCategoryName(
        ex.category_name,
        lang,
        db.expenseCategories,
        ex.category_id,
        ex.category_name_ur
      );
      if (!byExpenseCategory[catLabel]) {
        byExpenseCategory[catLabel] = { label: catLabel, amount: 0 };
      }
      byExpenseCategory[catLabel].amount += Number(ex.amount);
    }

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      totalDiscounts,
      paymentsCount: paymentsInRange.length,
      expensesCount: expensesInRange.length,
      bookingsCount: bookingsInRange.length,
      byEventType: Object.values(byEventType),
      byChargeCategory: Object.values(byChargeCategory).filter((v) => v.amount > 0),
      byExpenseCategory: Object.values(byExpenseCategory),
    };
  }, [db, startDate, endDate, lang]);

  const handleExportCSV = () => {
    const rows =
      lang === 'ur'
        ? [
            ['ہال', hallName],
            ['مدت', `${startDate} تا ${endDate}`],
            ['وصول شدہ آمدنی (PKR)', reportData.totalIncome],
            ['کل اخراجات (PKR)', reportData.totalExpenses],
            ['دی گئی خصوصی رعایت (PKR)', reportData.totalDiscounts],
            ['خالص منافع (PKR)', reportData.netProfit],
            [],
            ['تقریب کی قسم', 'تعداد', 'حتمی طے شدہ کل بل (PKR)'],
            ...reportData.byEventType.map((v) => [v.label, v.count, v.total]),
            [],
            ['بل کیٹیگری', 'رقم (PKR)'],
            ...reportData.byChargeCategory.map((v) => [v.label, v.amount]),
            [],
            ['اخراجات کیٹیگری', 'رقم (PKR)'],
            ...reportData.byExpenseCategory.map((v) => [v.label, v.amount]),
          ]
        : [
            ['Hall', hallName],
            ['Report Range', `${startDate} to ${endDate}`],
            ['Total Income (PKR)', reportData.totalIncome],
            ['Total Expenses (PKR)', reportData.totalExpenses],
            ['Special Discounts Given (PKR)', reportData.totalDiscounts],
            ['Net Profit (PKR)', reportData.netProfit],
            [],
            ['Event Type Breakdown', 'Count', 'Final Agreed Total (PKR)'],
            ...reportData.byEventType.map((v) => [v.label, v.count, v.total]),
            [],
            ['Charge Category Breakdown', 'Amount (PKR)'],
            ...reportData.byChargeCategory.map((v) => [v.label, v.amount]),
            [],
            ['Expense Category Breakdown', 'Amount (PKR)'],
            ...reportData.byExpenseCategory.map((v) => [v.label, v.amount]),
          ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marquee1-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(
      lang === 'ur'
        ? [
            { تفصیل: 'ہال', قدر: hallName },
            { تفصیل: 'تاریخ کی مدت', قدر: `${startDate} تا ${endDate}` },
            { تفصیل: 'کل وصول شدہ آمدنی (PKR)', قدر: reportData.totalIncome },
            { تفصیل: 'کل اخراجات (PKR)', قدر: reportData.totalExpenses },
            { تفصیل: 'دی گئی خصوصی رعایت (PKR)', قدر: reportData.totalDiscounts },
            { تفصیل: 'خالص منافع (PKR)', قدر: reportData.netProfit },
          ]
        : [
            { Metric: 'Hall', Value: hallName },
            { Metric: 'Date Range', Value: `${startDate} to ${endDate}` },
            { Metric: 'Total Collected Income (PKR)', Value: reportData.totalIncome },
            { Metric: 'Total Expenses (PKR)', Value: reportData.totalExpenses },
            { Metric: 'Special Discounts Given (PKR)', Value: reportData.totalDiscounts },
            { Metric: 'Net Profit (PKR)', Value: reportData.netProfit },
          ]
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, lang === 'ur' ? 'خلاصہ' : 'Summary');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        reportData.byEventType.map((v) =>
          lang === 'ur'
            ? { 'تقریب کی قسم': v.label, تعداد: v.count, 'کل رقم (PKR)': v.total }
            : { EventType: v.label, Count: v.count, TotalPKR: v.total }
        )
      ),
      lang === 'ur' ? 'تقریبات' : 'By Event Type'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        reportData.byExpenseCategory.map((v) =>
          lang === 'ur'
            ? { 'اخراجات کیٹیگری': v.label, 'رقم (PKR)': v.amount }
            : { ExpenseCategory: v.label, AmountPKR: v.amount }
        )
      ),
      lang === 'ur' ? 'اخراجات' : 'By Expense Category'
    );
    XLSX.writeFile(wb, `marquee1-financial-report-${startDate}.xlsx`);
  };

  const presetLabels: Record<RangePreset, string> = {
    weekly: tr('weekly', lang),
    monthly: tr('monthly', lang),
    yearly: tr('yearly', lang),
    custom: tr('custom', lang),
  };

  return (
    <div className="space-y-6">
      {/* Range Toolbar */}
      <div className="no-print glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          {(['weekly', 'monthly', 'yearly', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                preset === p
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {presetLabels[p]}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">{tr('fromLabel', lang)}</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-white tabular-nums"
            />
            <span className="text-slate-400">{tr('toLabel', lang)}</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-white tabular-nums"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-medium flex items-center gap-1.5 hover:border-cyan-500/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ur' ? 'سی ایس وی' : 'CSV'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-medium flex items-center gap-1.5 hover:border-cyan-500/40"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lang === 'ur' ? 'ایکسل' : 'Excel'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{tr('printPdf', lang)}</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Report Body (Strictly Single Language) */}
      <div
        dir={lang === 'ur' ? 'rtl' : 'ltr'}
        className={`print-only-sheet space-y-6 ${lang === 'ur' ? 'font-urdu' : ''}`}
      >
        {/* Report Header (Visible both on screen and A4 Print) */}
        <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-slate-800">
          <div>
            <div className="text-base font-bold text-white">{hallName}</div>
            {hallAddress && <div className="text-xs text-slate-400 mt-0.5">{hallAddress}</div>}
            <div className="text-xs text-cyan-300 font-semibold mt-1">
              {tr('financialReportsTitle', lang)}
            </div>
          </div>
          <div className="text-xs text-slate-300 sm:text-end space-y-0.5">
            <div>
              {tr('fromLabel', lang)}:{' '}
              <strong className="tabular-nums">{formatDateDisplay(startDate, lang)}</strong> ·{' '}
              {tr('toLabel', lang)}:{' '}
              <strong className="tabular-nums">{formatDateDisplay(endDate, lang)}</strong>
            </div>
            <div>
              {tr('generatedOn', lang)}:{' '}
              <span className="tabular-nums">{formatDateDisplay(today, lang)}</span>
              {currentUser?.full_name ? (
                <>
                  {' · '}
                  {tr('preparedBy', lang)}: {currentUser.full_name}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel neon-border-cyan rounded-2xl p-5">
            <div className="text-xs text-slate-400">{tr('collectedIncome', lang)}</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums mt-2">
              {formatPKR(reportData.totalIncome)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.paymentsCount}</span>{' '}
              {lang === 'ur' ? 'ادائیگیاں' : 'payments'}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">{tr('totalExpensesLabel', lang)}</div>
            <div className="text-xl font-bold text-rose-400 tabular-nums mt-2">
              {formatPKR(reportData.totalExpenses)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.expensesCount}</span>{' '}
              {lang === 'ur' ? 'اندراجات' : 'entries'}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">{tr('discountsGiven', lang)}</div>
            <div className="text-xl font-bold text-amber-300 tabular-nums mt-2">
              {formatPKR(reportData.totalDiscounts)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.bookingsCount}</span>{' '}
              {lang === 'ur' ? 'فعال تقریبات' : 'active events'}
            </div>
          </div>

          <div className="glass-panel neon-border-gold rounded-2xl p-5">
            <div className="text-xs text-slate-400">{tr('netProfit', lang)}</div>
            <div
              className={`text-xl font-bold tabular-nums mt-2 ${
                reportData.netProfit >= 0 ? 'text-cyan-300' : 'text-rose-400'
              }`}
            >
              {formatPKR(reportData.netProfit)}
            </div>
            <div className="text-xs text-slate-400 mt-1">{tr('a4StatementSubtitle', lang)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byEventType', lang)}</h3>
            <div className="space-y-3 text-xs">
              {reportData.byEventType.map((data) => (
                <div
                  key={data.label}
                  className="flex items-center justify-between border-b border-slate-800/70 pb-2 gap-2"
                >
                  <span className="text-slate-200">
                    {data.label}{' '}
                    <span className="text-slate-500 tabular-nums">({data.count})</span>
                  </span>
                  <span className="font-semibold text-cyan-300 tabular-nums">
                    {formatPKR(data.total)}
                  </span>
                </div>
              ))}
              {reportData.byEventType.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byChargeCategory', lang)}</h3>
            <div className="space-y-3 text-xs">
              {reportData.byChargeCategory.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between border-b border-slate-800/70 pb-2 gap-2"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <span className="font-semibold text-violet-300 tabular-nums">
                    {formatPKR(item.amount)}
                  </span>
                </div>
              ))}
              {reportData.byChargeCategory.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byExpenseCategory', lang)}</h3>
            <div className="space-y-3 text-xs">
              {reportData.byExpenseCategory.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between border-b border-slate-800/70 pb-2 gap-2"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <span className="font-semibold text-rose-300 tabular-nums">
                    {formatPKR(item.amount)}
                  </span>
                </div>
              ))}
              {reportData.byExpenseCategory.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
