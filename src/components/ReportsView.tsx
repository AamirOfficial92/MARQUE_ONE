import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { addDaysISO, calculateBookingFinancials, formatPKR, todayISO } from '../utils/formatters';

type RangePreset = 'weekly' | 'monthly' | 'yearly' | 'custom';

export const ReportsView: React.FC = () => {
  const { db, lang } = useApp();
  const today = todayISO();
  const [preset, setPreset] = useState<RangePreset>('monthly');
  const [customStart, setCustomStart] = useState<string>(today.slice(0, 7) + '-01');
  const [customEnd, setCustomEnd] = useState<string>(today);

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
      (b) => !b.deleted_at && b.status !== 'Cancelled' && b.event_date >= startDate && b.event_date <= endDate
    );

    const totalIncome = paymentsInRange.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expensesInRange.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = totalIncome - totalExpenses;

    const byEventType: Record<string, { count: number; total: number }> = {};
    const byChargeCategory: Record<string, number> = {
      'Hall Rent': 0,
      'Late Charges': 0,
      'Reschedule Fees': 0,
    };
    let totalDiscounts = 0;

    for (const bk of bookingsInRange) {
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);
      if (!byEventType[bk.event_type]) byEventType[bk.event_type] = { count: 0, total: 0 };
      byEventType[bk.event_type].count += 1;
      byEventType[bk.event_type].total += fin.grandTotal;

      byChargeCategory['Hall Rent'] += fin.hallRent;
      byChargeCategory['Late Charges'] += fin.lateCharge;
      byChargeCategory['Reschedule Fees'] += fin.rescheduleFeeTotal;
      totalDiscounts += fin.discountAmount;

      const items = db.bookingItems.filter((i) => i.booking_id === bk.id && !i.deleted_at);
      const hasColdDrinkLine = items.some(
        (i) => i.is_crate_service || i.item_name.toLowerCase().includes('cold drink')
      );
      if (!hasColdDrinkLine && fin.crateNet > 0) {
        byChargeCategory['Beverages'] = (byChargeCategory['Beverages'] || 0) + fin.crateNet;
      }
      for (const it of items) {
        byChargeCategory[it.category_name] = (byChargeCategory[it.category_name] || 0) + Number(it.amount);
      }
    }

    const byExpenseCategory: Record<string, number> = {};
    for (const ex of expensesInRange) {
      byExpenseCategory[ex.category_name] = (byExpenseCategory[ex.category_name] || 0) + Number(ex.amount);
    }

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      totalDiscounts,
      paymentsCount: paymentsInRange.length,
      expensesCount: expensesInRange.length,
      bookingsCount: bookingsInRange.length,
      byEventType: Object.entries(byEventType),
      byChargeCategory: Object.entries(byChargeCategory).filter(([, val]) => val > 0),
      byExpenseCategory: Object.entries(byExpenseCategory),
    };
  }, [db, startDate, endDate]);

  const handleExportCSV = () => {
    const rows = [
      ['Report Range', `${startDate} to ${endDate}`],
      ['Total Income (PKR)', reportData.totalIncome],
      ['Total Expenses (PKR)', reportData.totalExpenses],
      ['Special Discounts Given (PKR)', reportData.totalDiscounts],
      ['Net Profit (PKR)', reportData.netProfit],
      [],
      ['Event Type Breakdown', 'Count', 'Final Agreed Total (PKR)'],
      ...reportData.byEventType.map(([k, v]) => [k, v.count, v.total]),
      [],
      ['Charge Category Breakdown', 'Amount (PKR)'],
      ...reportData.byChargeCategory.map(([k, v]) => [k, v]),
      [],
      ['Expense Category Breakdown', 'Amount (PKR)'],
      ...reportData.byExpenseCategory.map(([k, v]) => [k, v]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
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
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Date Range', Value: `${startDate} to ${endDate}` },
      { Metric: 'Total Collected Income (PKR)', Value: reportData.totalIncome },
      { Metric: 'Total Expenses (PKR)', Value: reportData.totalExpenses },
      { Metric: 'Special Discounts Given (PKR)', Value: reportData.totalDiscounts },
      { Metric: 'Net Profit (PKR)', Value: reportData.netProfit },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(reportData.byEventType.map(([type, v]) => ({ EventType: type, Count: v.count, TotalPKR: v.total }))),
      'By Event Type'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(reportData.byExpenseCategory.map(([cat, amt]) => ({ ExpenseCategory: cat, AmountPKR: amt }))),
      'By Expense Category'
    );
    XLSX.writeFile(wb, `marquee1-financial-report-${startDate}.xlsx`);
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                preset === p
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-white tabular-nums"
            />
            <span className="text-slate-500">to</span>
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
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-medium flex items-center gap-1.5 hover:border-cyan-500/40"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print A4 PDF</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Report Body */}
      <div className="print-only-sheet space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="glass-panel neon-border-cyan rounded-2xl p-5">
            <div className="text-xs text-slate-400">Collected Income ({startDate} → {endDate})</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums mt-2">
              {formatPKR(reportData.totalIncome)}
            </div>
            <div className="text-xs text-slate-400 mt-1 tabular-nums">{reportData.paymentsCount} payments</div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">Total Expenses</div>
            <div className="text-xl font-bold text-rose-400 tabular-nums mt-2">
              {formatPKR(reportData.totalExpenses)}
            </div>
            <div className="text-xs text-slate-400 mt-1 tabular-nums">{reportData.expensesCount} entries</div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">Special Discounts Given</div>
            <div className="text-xl font-bold text-amber-300 tabular-nums mt-2">
              {formatPKR(reportData.totalDiscounts)}
            </div>
            <div className="text-xs text-slate-400 mt-1 tabular-nums">{reportData.bookingsCount} active events</div>
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
            <div className="text-xs text-slate-400 mt-1 tabular-nums">A4 Financial Summary</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">By Event Type</h3>
            <div className="space-y-3 text-xs">
              {reportData.byEventType.map(([type, data]) => (
                <div key={type} className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                  <span className="text-slate-200">
                    {type} <span className="text-slate-500">({data.count})</span>
                  </span>
                  <span className="font-semibold text-cyan-300 tabular-nums">{formatPKR(data.total)}</span>
                </div>
              ))}
              {reportData.byEventType.length === 0 && <p className="text-slate-500">{tr('noRecords', lang)}</p>}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">By Charge Category</h3>
            <div className="space-y-3 text-xs">
              {reportData.byChargeCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                  <span className="text-slate-200">{cat}</span>
                  <span className="font-semibold text-violet-300 tabular-nums">{formatPKR(amt)}</span>
                </div>
              ))}
              {reportData.byChargeCategory.length === 0 && <p className="text-slate-500">{tr('noRecords', lang)}</p>}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">By Expense Category</h3>
            <div className="space-y-3 text-xs">
              {reportData.byExpenseCategory.map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                  <span className="text-slate-200">{cat}</span>
                  <span className="font-semibold text-rose-300 tabular-nums">{formatPKR(amt)}</span>
                </div>
              ))}
              {reportData.byExpenseCategory.length === 0 && <p className="text-slate-500">{tr('noRecords', lang)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
