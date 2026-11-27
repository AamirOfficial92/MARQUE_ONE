import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { Booking, Payment } from '../types';
import { calculateBookingFinancials, formatDateDisplay, formatPKR } from '../utils/formatters';

interface ReceiptModalProps {
  payment: Payment;
  booking: Booking;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ payment, booking, onClose }) => {
  const { db } = useApp();
  const settings = db.settings;
  const fin = calculateBookingFinancials(booking, db.bookingItems, db.payments, db.expenses);

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
            <div className="text-xs font-semibold text-white tabular-nums">{payment.receipt_number}</div>
            <div className="text-[11px] text-cyan-300">80mm Thermal Receipt Format</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print 80mm</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact 80mm Thermal Printer Layout */}
        <div className="print-thermal-sheet mx-auto w-full max-w-[310px] bg-white text-slate-900 rounded-xl p-4 shadow-2xl border border-slate-300 font-mono text-[11px] leading-snug space-y-2.5">
          <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-1">
            <img
              src={settings.logo_url || HALL_LOGO_SRC}
              alt={settings.hall_name}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover border border-slate-300 mx-auto"
            />
            <div className="text-sm font-bold tracking-tight">{settings.hall_name}</div>
            <div className="font-urdu text-xs font-bold" dir="rtl">{settings.hall_name_ur}</div>
            <div className="text-[10px] text-slate-700">{settings.phone}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider pt-0.5">
              Payment Receipt / رسید ادائیگی
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-600">Receipt #:</span>
              <span className="font-bold">{payment.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Date:</span>
              <span>{formatDateDisplay(payment.payment_date, 'en')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Booking:</span>
              <span className="font-bold">{booking.booking_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Event Date:</span>
              <span>{formatDateDisplay(booking.event_date, 'en')}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-slate-600">Customer:</span>
              <span className="font-bold text-end">{booking.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Phone:</span>
              <span className="tabular-nums">{booking.customer_phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Event / Floors:</span>
              <span className="text-end">{booking.event_type} ({booking.floors.join('/')})</span>
            </div>
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2.5 space-y-1.5 tabular-nums">
            <div className="flex justify-between items-baseline">
              <span className="font-bold">PAID NOW:</span>
              <span className="text-base font-bold">{formatPKR(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-600">Mode:</span>
              <span>{payment.mode}{payment.reference_no ? ` (${payment.reference_no})` : ''}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-600">Received By:</span>
              <span>{payment.received_by}</span>
            </div>
            {payment.notes && (
              <div className="text-[10px] text-slate-700 pt-0.5">Note: {payment.notes}</div>
            )}
          </div>

          <div className="border-b border-dashed border-slate-400 pb-2 space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-600">Agreed Total:</span>
              <span>{formatPKR(fin.grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Paid:</span>
              <span>{formatPKR(fin.totalPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs">
              <span>Balance Due:</span>
              <span>{formatPKR(fin.balance)}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-700 pt-1 space-y-0.5">
            <div>Thank you for choosing {settings.hall_name}</div>
            <div className="font-urdu" dir="rtl">آپ کی آمد کا شکریہ</div>
          </div>
        </div>
      </div>
    </div>
  );
};
