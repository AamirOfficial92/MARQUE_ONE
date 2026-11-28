import React, { useMemo, useState } from 'react';
import { FileText, Printer, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBookingEventDisplay, tr, translateStatus } from '../i18n/translations';
import { Booking } from '../types';
import { calculateBookingFinancials, formatDateDisplay, formatPKR } from '../utils/formatters';

interface InvoicesViewProps {
  onOpenInvoice: (booking: Booking) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ onOpenInvoice }) => {
  const { db, lang } = useApp();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Balance Due'>('All');
  const isUr = lang === 'ur';

  const activeBookings = useMemo(
    () =>
      db.bookings
        .filter((b) => !b.deleted_at)
        .sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [db.bookings]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeBookings
      .map((bk) => {
        const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);
        const inv = db.invoices.find((i) => i.booking_id === bk.id && !i.deleted_at);
        return { bk, fin, inv };
      })
      .filter(({ bk, fin }) => {
        if (statusFilter === 'Paid' && fin.balance > 0) return false;
        if (statusFilter === 'Balance Due' && fin.balance <= 0) return false;
        if (!q) return true;
        return (
          bk.invoice_number.toLowerCase().includes(q) ||
          bk.booking_code.toLowerCase().includes(q) ||
          bk.customer_name.toLowerCase().includes(q) ||
          bk.customer_phone.toLowerCase().includes(q)
        );
      });
  }, [activeBookings, db.bookingItems, db.payments, db.expenses, db.invoices, query, statusFilter]);

  const totalBilled = useMemo(() => rows.reduce((s, r) => s + r.fin.grandTotal, 0), [rows]);
  const totalCollected = useMemo(() => rows.reduce((s, r) => s + r.fin.totalPaid, 0), [rows]);
  const totalOutstanding = useMemo(() => rows.reduce((s, r) => s + r.fin.balance, 0), [rows]);

  const filterLabel = (st: 'All' | 'Paid' | 'Balance Due') => {
    if (!isUr) return st;
    if (st === 'All') return 'تمام';
    if (st === 'Paid') return 'مکمل ادا شدہ';
    return 'واجب الادا';
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-400">
            {isUr ? 'منتخب انوائسز کا کل بل' : 'Filtered Invoices Billed'}
          </div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">{formatPKR(totalBilled)}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-400">
            {isUr ? 'انوائسز کی مد میں وصول شدہ' : 'Collected Against Invoices'}
          </div>
          <div className="text-xl font-bold text-emerald-400 tabular-nums mt-1">{formatPKR(totalCollected)}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-400">{tr('remainingBalance', lang)}</div>
          <div className="text-xl font-bold text-amber-400 tabular-nums mt-1">{formatPKR(totalOutstanding)}</div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isUr
                ? 'بل نمبر، بکنگ کوڈ، گاہک یا موبائل نمبر سے تلاش کریں...'
                : 'Search invoice #, booking code, customer, or phone...'
            }
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-white"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['All', 'Balance Due', 'Paid'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium ${
                statusFilter === st
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400'
              }`}
            >
              {filterLabel(st)}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>{isUr ? 'انوائسز کی فہرست' : 'Invoices Directory'}</span>
          </h3>
          <span className="text-xs text-slate-400 tabular-nums">
            {rows.length} {isUr ? 'انوائسز' : 'invoices'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 text-start">{isUr ? 'بل نمبر' : 'Invoice #'}</th>
                <th className="py-2.5 px-4 text-start">{isUr ? 'بکنگ اور گاہک' : 'Booking & Customer'}</th>
                <th className="py-2.5 px-4 text-start">{tr('eventDate', lang)}</th>
                <th className="py-2.5 px-4 text-end">{tr('totalBill', lang)}</th>
                <th className="py-2.5 px-4 text-end">{tr('paidAmount', lang)}</th>
                <th className="py-2.5 px-4 text-end">{tr('remainingBalance', lang)}</th>
                <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {tr('noRecords', lang)}
                  </td>
                </tr>
              ) : (
                rows.map(({ bk, fin, inv }) => (
                  <tr key={bk.id} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-mono font-semibold text-cyan-300 tabular-nums">
                      <div>{inv?.invoice_number || bk.invoice_number}</div>
                      <div className="text-[11px] text-slate-400">{bk.booking_code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{bk.customer_name}</div>
                      <div className="text-[11px] text-slate-400">
                        {bk.customer_phone} · {formatBookingEventDisplay(bk, lang, db.eventTypes)} ·{' '}
                        {translateStatus(bk.status, lang)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 tabular-nums">
                      {formatDateDisplay(bk.event_date, lang)}
                    </td>
                    <td className="py-3 px-4 text-end font-semibold text-white tabular-nums">
                      {formatPKR(fin.grandTotal)}
                      {fin.discountAmount > 0 && (
                        <div className="text-[10px] text-amber-400">
                          {isUr ? 'رعایت' : 'Disc'} -{formatPKR(fin.discountAmount)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-end text-emerald-400 tabular-nums">
                      {formatPKR(fin.totalPaid)}
                    </td>
                    <td className="py-3 px-4 text-end font-semibold tabular-nums">
                      <span className={fin.balance > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                        {formatPKR(fin.balance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-end">
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(bk)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 font-medium"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{isUr ? 'انوائس / پرنٹ اے-4' : 'View / Print A4'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
