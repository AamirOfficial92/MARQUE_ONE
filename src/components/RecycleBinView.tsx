import React, { useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  pickLocalized,
  tr,
  translateExpenseCategoryName,
  translatePaymentMode,
} from '../i18n/translations';
import { formatDateDisplay, formatPKR } from '../utils/formatters';

export const RecycleBinView: React.FC = () => {
  const { db, lang, can, restoreRecord } = useApp();
  const isUr = lang === 'ur';
  const canRestore = can('recycle_bin', 'edit');
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const handleRestore = async (
    entityType:
      | 'booking'
      | 'payment'
      | 'expense'
      | 'charge'
      | 'employee'
      | 'customer'
      | 'event_category'
      | 'event_type'
      | 'expense_category'
      | 'expense_subcategory',
    id: string
  ) => {
    const key = `${entityType}:${id}`;
    if (restoringKey) return;
    setRestoringKey(key);
    try {
      await restoreRecord(entityType, id);
    } finally {
      setRestoringKey(null);
    }
  };

  const deletedBookings = db.bookings.filter((b) => b.deleted_at);
  const deletedCustomers = db.customers.filter((c) => c.deleted_at);
  const deletedPayments = db.payments.filter((p) => p.deleted_at);
  const deletedExpenses = db.expenses.filter((e) => e.deleted_at);
  const deletedCharges = db.chargesCatalog.filter((c) => c.deleted_at);
  const deletedEmployees = db.employees.filter((e) => e.deleted_at);
  const deletedEventCats = db.eventCategories.filter((c) => c.deleted_at);
  const deletedEventTypes = db.eventTypes.filter((e) => e.deleted_at);
  const deletedExpCats = db.expenseCategories.filter((c) => c.deleted_at);
  const deletedExpSubcats = db.expenseSubcategories.filter((s) => s.deleted_at);

  const totalDeleted =
    deletedBookings.length +
    deletedCustomers.length +
    deletedPayments.length +
    deletedExpenses.length +
    deletedCharges.length +
    deletedEmployees.length +
    deletedEventCats.length +
    deletedEventTypes.length +
    deletedExpCats.length +
    deletedExpSubcats.length;

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>{tr('recycleBin', lang)}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isUr
              ? 'تمام حذف شدہ ریکارڈز عارضی طور پر محفوظ رہتے ہیں۔ مجاز صارفین انہیں دیکھ کر دوبارہ بحال کر سکتے ہیں۔'
              : 'All deletions are soft-deleted. Users with Recycle Bin permission can inspect and restore archived records.'}
          </p>
        </div>
        <span className="text-xs font-semibold text-cyan-300 tabular-nums shrink-0">
          {totalDeleted} {isUr ? 'محفوظ آئٹمز' : 'archived items'}
        </span>
      </div>

      {totalDeleted === 0 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-xs text-slate-500">
          {isUr ? 'ری سائیکل بن اس وقت خالی ہے۔' : 'Recycle Bin is currently empty.'}
        </div>
      )}

      {deletedBookings.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ بکنگز' : 'Deleted Bookings'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedBookings.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-cyan-300 tabular-nums">
                    {b.booking_code} · <span className="text-white">{b.customer_name}</span>
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    {isUr ? 'تقریب:' : 'Event:'} {formatDateDisplay(b.event_date, lang)} ·{' '}
                    {isUr ? 'حذف کی تاریخ:' : 'Deleted:'}{' '}
                    {formatDateDisplay(b.deleted_at || '', lang)}
                  </div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `booking:${b.id}`}
                    onClick={() => handleRestore('booking', b.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `booking:${b.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedPayments.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ ادائیگیاں' : 'Deleted Payments'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedPayments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white tabular-nums">
                    {p.receipt_number} · {formatPKR(p.amount)}
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    {translatePaymentMode(p.mode, lang)} · {formatDateDisplay(p.payment_date, lang)}
                  </div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `payment:${p.id}`}
                    onClick={() => handleRestore('payment', p.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `payment:${p.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedExpenses.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ اخراجات' : 'Deleted Expenses'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedExpenses.map((e) => (
              <div key={e.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">
                    {e.payee} · <span className="tabular-nums text-rose-300">{formatPKR(e.amount)}</span>
                  </div>
                  <div className="text-slate-400 tabular-nums mt-0.5">
                    {translateExpenseCategoryName(
                      e.category_name,
                      lang,
                      db.expenseCategories,
                      e.category_id,
                      e.category_name_ur
                    )}{' '}
                    · {formatDateDisplay(e.expense_date, lang)}
                  </div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `expense:${e.id}`}
                    onClick={() => handleRestore('expense', e.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `expense:${e.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedCharges.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ کیٹلاگ چارجز' : 'Deleted Catalog Charges'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedCharges.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{pickLocalized(c.name_en, c.name_ur, lang)}</div>
                  <div className="text-slate-400 tabular-nums">{formatPKR(c.default_rate)}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `charge:${c.id}`}
                    onClick={() => handleRestore('charge', c.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `charge:${c.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedEmployees.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ عملہ ریکارڈز' : 'Deleted Staff Records'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedEmployees.map((emp) => (
              <div key={emp.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{emp.full_name}</div>
                  <div className="text-slate-400">{emp.role_title}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `employee:${emp.id}`}
                    onClick={() => handleRestore('employee', emp.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `employee:${emp.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedCustomers.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ گاہک' : 'Deleted Customers'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedCustomers.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{c.full_name}</div>
                  <div className="text-slate-400 tabular-nums">
                    {c.phone} · {c.nic || (isUr ? 'شناختی کارڈ درج نہیں' : 'No CNIC')}
                  </div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `customer:${c.id}`}
                    onClick={() => handleRestore('customer', c.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `customer:${c.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(deletedEventCats.length > 0 ||
        deletedEventTypes.length > 0 ||
        deletedExpCats.length > 0 ||
        deletedExpSubcats.length > 0) && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">
            {isUr ? 'حذف شدہ ایونٹ اور اخراجات کی اقسام' : 'Deleted Event & Expense Categories'}
          </h3>
          <div className="divide-y divide-slate-800/70">
            {deletedEventCats.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{pickLocalized(c.name_en, c.name_ur, lang)}</div>
                  <div className="text-slate-400">{tr('eventCategory', lang)}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `event_category:${c.id}`}
                    onClick={() => handleRestore('event_category', c.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `event_category:${c.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
            {deletedEventTypes.map((ev) => (
              <div key={ev.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{pickLocalized(ev.name_en, ev.name_ur, lang)}</div>
                  <div className="text-slate-400">{tr('eventItemLabel', lang)}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `event_type:${ev.id}`}
                    onClick={() => handleRestore('event_type', ev.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `event_type:${ev.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
            {deletedExpCats.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{pickLocalized(c.name_en, c.name_ur, lang)}</div>
                  <div className="text-slate-400">{tr('expenseCategoryLabel', lang)}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `expense_category:${c.id}`}
                    onClick={() => handleRestore('expense_category', c.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `expense_category:${c.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
            {deletedExpSubcats.map((sub) => (
              <div key={sub.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-white">{pickLocalized(sub.name_en, sub.name_ur, lang)}</div>
                  <div className="text-slate-400">{tr('expenseSubcategoryLabel', lang)}</div>
                </div>
                {canRestore && (
                  <button
                    type="button"
                    disabled={restoringKey === `expense_subcategory:${sub.id}`}
                    onClick={() => handleRestore('expense_subcategory', sub.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {restoringKey === `expense_subcategory:${sub.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('restore', lang)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
