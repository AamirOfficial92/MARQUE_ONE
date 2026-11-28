import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import {
  formatBookingEventDisplay,
  pickLocalized,
  tr,
  translateFloor,
  translatePaymentMode,
} from '../i18n/translations';
import { Booking, Payment } from '../types';
import { calculateBookingFinancials, formatDateDisplay, formatPKR } from '../utils/formatters';

interface ReceiptModalProps {
  payment: Payment;
  booking: Booking;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ payment, booking, onClose }) => {
  const { db, rawDb, activeHall, lang } = useApp();
  const settings = db.settings;
  const bookingHall = rawDb.halls.find((h) => h.id === booking.hall_id) || activeHall;
  const hallName = pickLocalized(bookingHall.name, bookingHall.name_ur, lang);
  const hallAddressBase = pickLocalized(bookingHall.address, bookingHall.address_ur, lang);
  const hallAddress = [hallAddressBase, bookingHall.city].filter(Boolean).join(', ');
  const hallFooter = pickLocalized(bookingHall.invoice_footer_en, bookingHall.invoice_footer_ur, lang);
  const logoSrc = bookingHall.logo_url || settings.logo_url || HALL_LOGO_SRC;
  const fin = calculateBookingFinancials(booking, db.bookingItems, db.payments, db.expenses);

  const floorLabel = booking.floors
    .map((f) => translateFloor(f, lang, db.floors))
    .join(lang === 'ur' ? '، ' : ' / ');
  const eventTypeLabel = formatBookingEventDisplay(booking, lang, db.eventTypes);

  useEffect(() => {
    document.body.classList.add('print-thermal');
    return () => {
      document.body.classList.remove('print-thermal');
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm space-y-3 my-auto">
        <div className="no-print glass-panel rounded-2xl p-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white tabular-nums">
              {payment.receipt_number}
            </div>
            <div className="text-[11px] text-cyan-300">
              {lang === 'ur' ? '80 ملی میٹر تھرمل رسید فارمیٹ' : '80mm Thermal Receipt Format'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{tr('printThermalReceipt', lang)}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('close', lang)}
              className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact 80mm Thermal Printer Layout (Strictly Single Language, Black on White) */}
        <div
          dir={lang === 'ur' ? 'rtl' : 'ltr'}
          className={`print-thermal-sheet mx-auto w-full max-w-[310px] bg-white text-slate-900 rounded-xl p-4 shadow-2xl border border-slate-300 text-[11px] leading-snug space-y-2.5 ${
            lang === 'ur' ? 'font-urdu' : 'font-mono'
          }`}
        >
          <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-1">
            <img
              src={logoSrc}
              alt={hallName}
              crossOrigin={logoSrc.startsWith('http') ? 'anonymous' : undefined}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover border border-slate-300 mx-auto"
            />
            <div className="text-sm font-bold tracking-tight">{hallName}</div>
            {hallAddress && (
              <div className="text-[9.5px] text-slate-600 leading-tight">{hallAddress}</div>
            )}
            <div className="text-[10px] text-slate-700 tabular-nums">
              {[bookingHall.phone || settings.phone, bookingHall.phone_secondary].filter(Boolean).join(' / ')}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider pt-0.5">
              {tr('paymentReceiptTitle', lang)}
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('receiptNoLabel', lang)}</span>
              <span className="font-bold tabular-nums">{payment.receipt_number}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('dateCol', lang)}:</span>
              <span className="tabular-nums">{formatDateDisplay(payment.payment_date, lang)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('bookingCodeLabel', lang)}</span>
              <span className="font-bold tabular-nums">{booking.booking_code}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('eventDateLabel', lang)}</span>
              <span className="tabular-nums">{formatDateDisplay(booking.event_date, lang)}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('customerName', lang)}:</span>
              <span className="font-bold text-end">{booking.customer_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('phone', lang)}:</span>
              <span className="tabular-nums">{booking.customer_phone}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('eventType', lang)}:</span>
              <span className="text-end">{eventTypeLabel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('floors', lang)}:</span>
              <span className="text-end">{floorLabel}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2.5 space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-bold">{tr('paidNowLabel', lang)}</span>
              <span className="text-base font-bold tabular-nums">{formatPKR(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-[10px] gap-2">
              <span className="text-slate-600">{tr('modeCol', lang)}:</span>
              <span>
                {translatePaymentMode(payment.mode, lang)}
                {payment.reference_no ? (
                  <span className="tabular-nums"> ({payment.reference_no})</span>
                ) : null}
              </span>
            </div>
            <div className="flex justify-between text-[10px] gap-2">
              <span className="text-slate-600">{tr('receivedByLabel', lang)}</span>
              <span>{payment.received_by}</span>
            </div>
            {payment.notes && (
              <div className="text-[10px] text-slate-700 pt-0.5">
                {tr('notes', lang)}: {payment.notes}
              </div>
            )}
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('totalBillLabel', lang)}</span>
              <span className="tabular-nums">{formatPKR(fin.grandTotal)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">{tr('totalPaidLabel', lang)}:</span>
              <span className="tabular-nums">{formatPKR(fin.totalPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs gap-2">
              <span>{tr('balanceDueLabel', lang)}:</span>
              <span className="tabular-nums">{formatPKR(fin.balance)}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-700 pt-1 space-y-0.5">
            <div>
              {lang === 'ur'
                ? `${hallName} کو منتخب کرنے کا شکریہ`
                : `Thank you for choosing ${hallName}`}
            </div>
            {hallFooter && <div className="text-[9.5px] text-slate-500">{hallFooter}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
