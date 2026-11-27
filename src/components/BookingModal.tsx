import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  pickLocalized,
  tr,
  translateBookingItemName,
  translateChargeCategoryName,
  translateExpenseCategoryName,
  translateFloor,
  translatePaymentMode,
  translateStatus,
  translateUnitLabel,
} from '../i18n/translations';
import {
  Booking,
  BookingItem,
  BookingStatus,
  DiscountType,
  FloorName,
  InstallmentSchedule,
  LateChargeMethod,
} from '../types';
import {
  addDaysISO,
  calculateCrateBill,
  calculateDiscountAmount,
  calculateLateCharge,
  findBookingConflict,
  formatDateDisplay,
  formatNICInput,
  formatPKR,
  formatPakistaniPhoneInput,
  formatTime12h,
  getSuggestedHallRent,
  isValidPakistaniNIC,
  isValidPakistaniPhone,
  timeToMinutes,
  todayISO,
} from '../utils/formatters';

interface BookingModalProps {
  booking: Booking | null;
  initialDate?: string;
  onClose: () => void;
  onSaved?: (saved: Booking) => void;
}

type DraftItem = Omit<BookingItem, 'booking_id' | 'hall_id' | 'deleted_at'>;
type DraftInstallment = Omit<InstallmentSchedule, 'booking_id' | 'hall_id' | 'deleted_at'>;

function isCrateItem(it: { is_crate_service?: boolean; item_name: string }): boolean {
  return Boolean(it.is_crate_service) || it.item_name.toLowerCase().includes('cold drink');
}

export const BookingModal: React.FC<BookingModalProps> = ({
  booking,
  initialDate,
  onClose,
  onSaved,
}) => {
  const { db, lang, currentUser, can, saveBooking, submitApprovalRequest } = useApp();
  const isUr = lang === 'ur';
  const role = currentUser?.role || 'manager';
  const isManager = role === 'manager';
  const readOnly = !currentUser || !can('bookings', 'edit');
  const canSeeExpensesProfit = can('expenses', 'view') || can('reports', 'view');

  const activeCustomers = useMemo(
    () =>
      db.customers
        .filter((c) => !c.deleted_at)
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [db.customers]
  );

  const defaultPkgItems = useMemo(
    () => db.chargesCatalog.filter((c) => !c.deleted_at && c.is_default_package),
    [db.chargesCatalog]
  );

  const extraCatalogItems = useMemo(
    () => db.chargesCatalog.filter((c) => !c.deleted_at && !c.is_default_package),
    [db.chargesCatalog]
  );

  const initialDateVal = booking?.event_date || initialDate || addDaysISO(todayISO(), 7);
  const initialFloors = booking?.floors || (['First'] as FloorName[]);
  const initialSuggested = getSuggestedHallRent(initialFloors, initialDateVal, db.settings);

  const [customerId, setCustomerId] = useState<string | null>(booking?.customer_id || null);
  const [customerName, setCustomerName] = useState(booking?.customer_name || '');
  const [customerAddress, setCustomerAddress] = useState(booking?.customer_address || '');
  const [customerPhone, setCustomerPhone] = useState(booking?.customer_phone || '');
  const [customerNic, setCustomerNic] = useState(booking?.customer_nic || '');
  const [customerEmail, setCustomerEmail] = useState(booking?.customer_email || '');
  const [eventType, setEventType] = useState(booking?.event_type || 'Baraat');
  const [eventDate, setEventDate] = useState(initialDateVal);
  const [startTime, setStartTime] = useState(booking?.start_time || '20:00');
  const [endTime, setEndTime] = useState(booking?.end_time || '00:00');
  const [floors, setFloors] = useState<FloorName[]>(initialFloors);
  const [guestsCount, setGuestsCount] = useState(booking?.guests_count ?? 350);
  const [hallRent, setHallRent] = useState<number>(booking?.hall_rent ?? initialSuggested.amount);
  const [rentEditedManually, setRentEditedManually] = useState<boolean>(Boolean(booking));
  const [status, setStatus] = useState<BookingStatus>(booking?.status || 'Confirmed');
  const [notes, setNotes] = useState(booking?.notes || '');
  const [inspectionNotes, setInspectionNotes] = useState(booking?.inspection_notes || '');
  const [approvalNotice, setApprovalNotice] = useState<string[] | null>(null);

  const dateChangedFromOriginal = Boolean(booking && eventDate !== booking.event_date);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleFee, setRescheduleFee] = useState<number>(0);

  const [actualEndTime, setActualEndTime] = useState<string>(booking?.actual_end_time || '');
  const [lateChargeMethod, setLateChargeMethod] = useState<LateChargeMethod>(
    booking?.late_charge_method || 'none'
  );
  const [lateChargeValue, setLateChargeValue] = useState<number>(booking?.late_charge_value ?? 0);
  const [lateChargeOverridden, setLateChargeOverridden] = useState<boolean>(
    Boolean(booking?.late_charge_overridden)
  );
  const [manualLateCharge, setManualLateCharge] = useState<number>(
    booking?.late_charge_amount ?? 0
  );

  const [cratesOrdered, setCratesOrdered] = useState(booking?.crates_ordered ?? 0);
  const [cratesUsed, setCratesUsed] = useState(booking?.crates_used ?? 0);
  const [cratesReturned, setCratesReturned] = useState(booking?.crates_returned ?? 0);
  const [crateRate, setCrateRate] = useState(booking?.crate_rate ?? 1600);
  const [crateHandling, setCrateHandling] = useState(
    booking?.crate_handling_deduction_per_crate ?? db.settings.crate_deduction_per_returned
  );

  const [discountType, setDiscountType] = useState<DiscountType>(
    booking?.discount_type || 'fixed'
  );
  const [discountValue, setDiscountValue] = useState<number>(booking?.discount_value ?? 0);
  const [discountReason, setDiscountReason] = useState<string>(booking?.discount_reason || '');

  const [items, setItems] = useState<DraftItem[]>(() => {
    if (booking) {
      return db.bookingItems
        .filter((i) => i.booking_id === booking.id && !i.deleted_at)
        .map(({ booking_id: _b, deleted_at: _d, hall_id: _h, ...rest }) => rest);
    }
    return defaultPkgItems.map((pkg, idx) => ({
      id: `new-pkg-${idx}`,
      charge_id: pkg.id,
      item_name: pkg.name_en,
      item_name_ur: pkg.name_ur,
      category_name: 'Default Package',
      category_name_ur: 'بنیادی پیکج',
      quantity: 1,
      rate: pkg.default_rate,
      amount: pkg.default_rate,
      is_package_included: true,
      is_crate_service: pkg.is_crate_service,
    }));
  });

  const [installments, setInstallments] = useState<DraftInstallment[]>(() => {
    if (booking) {
      return db.installments
        .filter((ins) => ins.booking_id === booking.id && !ins.deleted_at)
        .map(({ booking_id: _b, deleted_at: _d, hall_id: _h, ...rest }) => rest);
    }
    return [];
  });

  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    extraCatalogItems[0]?.id || ''
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestedRent = useMemo(
    () => getSuggestedHallRent(floors, eventDate, db.settings),
    [floors, eventDate, db.settings]
  );

  useEffect(() => {
    if (!booking && !rentEditedManually) {
      setHallRent(suggestedRent.amount);
    }
  }, [suggestedRent.amount, booking, rentEditedManually]);

  const crateCalc = useMemo(
    () => calculateCrateBill(cratesOrdered, cratesReturned, crateRate, crateHandling),
    [cratesOrdered, cratesReturned, crateRate, crateHandling]
  );

  const hasCrateLineItem = useMemo(() => items.some(isCrateItem), [items]);

  const effectiveItems = useMemo(
    () =>
      items.map((it) =>
        isCrateItem(it)
          ? {
              ...it,
              is_crate_service: true,
              quantity: 1,
              rate: crateCalc.netCrateBill,
              amount: crateCalc.netCrateBill,
            }
          : { ...it, amount: Number(it.quantity) * Number(it.rate) }
      ),
    [items, crateCalc.netCrateBill]
  );

  const liveConflict = useMemo(
    () =>
      findBookingConflict(
        {
          id: booking?.id,
          event_date: eventDate,
          start_time: startTime,
          end_time: endTime,
          floors,
          status,
        },
        db.bookings,
        db.settings.cleaning_buffer_minutes
      ),
    [
      booking?.id,
      eventDate,
      startTime,
      endTime,
      floors,
      status,
      db.bookings,
      db.settings.cleaning_buffer_minutes,
    ]
  );

  const lateCalc = useMemo(
    () =>
      calculateLateCharge({
        method: lateChargeMethod,
        value: lateChargeValue,
        hallRent,
        startTime,
        scheduledEndTime: endTime,
        actualEndTime: actualEndTime || null,
        graceMinutes: db.settings.late_grace_minutes,
      }),
    [
      lateChargeMethod,
      lateChargeValue,
      hallRent,
      startTime,
      endTime,
      actualEndTime,
      db.settings.late_grace_minutes,
    ]
  );

  const effectiveLateCharge =
    lateChargeMethod === 'none' && !lateChargeOverridden
      ? 0
      : lateChargeOverridden
      ? Math.max(0, Number(manualLateCharge) || 0)
      : lateCalc.calculatedAmount;

  const crossesMidnight = timeToMinutes(endTime) <= timeToMinutes(startTime);

  const itemsTotal = effectiveItems.reduce((sum, i) => sum + Number(i.amount), 0);
  const existingRescheduleFees = (booking?.reschedule_history || []).reduce(
    (s, r) => s + (Number(r.fee) || 0),
    0
  );
  const pendingRescheduleFee = dateChangedFromOriginal
    ? Math.max(0, Number(rescheduleFee) || 0)
    : 0;
  const totalRescheduleFees = existingRescheduleFees + pendingRescheduleFee;

  const standardTotal =
    (Number(hallRent) || 0) + itemsTotal + effectiveLateCharge + totalRescheduleFees;
  const discountAmount = calculateDiscountAmount(standardTotal, discountType, discountValue);
  const subtotalAfterDiscount = Math.max(0, standardTotal - discountAmount);
  const taxPercent = booking?.tax_percent ?? db.settings.tax_percent;
  const taxAmount = Math.round((subtotalAfterDiscount * taxPercent) / 100);
  const finalAgreedTotal = subtotalAfterDiscount + taxAmount;

  const linkedExpenses = useMemo(
    () => (booking ? db.expenses.filter((e) => !e.deleted_at && e.booking_id === booking.id) : []),
    [booking, db.expenses]
  );
  const linkedExpensesTotal = linkedExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const bookingProfit = finalAgreedTotal - linkedExpensesTotal;

  const toggleFloor = (fl: FloorName) => {
    if (readOnly) return;
    if (fl === 'Full Hall') {
      setFloors(['Full Hall']);
      return;
    }
    const withoutFull = floors.filter((f) => f !== 'Full Hall');
    if (withoutFull.includes(fl)) {
      const next = withoutFull.filter((f) => f !== fl);
      setFloors(next.length > 0 ? next : [fl]);
    } else {
      const next = [...withoutFull, fl];
      if (next.length === 3) {
        setFloors(['Full Hall']);
      } else {
        setFloors(next);
      }
    }
  };

  const handleAddCatalogItem = () => {
    const ch = extraCatalogItems.find((c) => c.id === selectedCatalogId);
    if (!ch) return;
    const cat = db.chargeCategories.find((c) => c.id === ch.category_id);
    const isCrate = Boolean(ch.is_crate_service) || ch.name_en.toLowerCase().includes('cold drink');
    if (isCrate && hasCrateLineItem) {
      setValidationError(
        isUr
          ? 'کولڈ ڈرنکس سروس پہلے سے نیچے شامل ہے۔ کریٹ کی تعداد اسی سطر میں تبدیل کریں۔'
          : 'Cold Drinks service is already added below. Adjust crate counts directly on that line.'
      );
      return;
    }
    if (isCrate && cratesOrdered === 0) {
      setCratesOrdered(25);
      setCrateRate(ch.default_rate || 1600);
    }
    setItems((prev) => [
      ...prev,
      {
        id: `new-it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        charge_id: ch.id,
        item_name: ch.name_en,
        item_name_ur: ch.name_ur,
        category_name: cat?.name_en || 'General',
        category_name_ur: cat?.name_ur || 'عمومی',
        quantity: 1,
        rate: ch.default_rate,
        amount: ch.default_rate,
        is_package_included: false,
        is_crate_service: isCrate,
      },
    ]);
  };

  const handleAddInstallment = () => {
    setInstallments((prev) => [
      ...prev,
      {
        id: `new-ins-${Date.now()}`,
        title: isUr ? `قسط ${prev.length + 1}` : `Installment ${prev.length + 1}`,
        due_date: addDaysISO(todayISO(), 14),
        amount: Math.max(0, Math.round(finalAgreedTotal / 2)),
        is_paid: false,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!customerName.trim() || !customerAddress.trim()) {
      setValidationError(
        isUr ? 'گاہک کا نام اور پتہ درج کرنا لازمی ہے۔' : 'Customer name and address are required.'
      );
      return;
    }
    if (!isValidPakistaniPhone(customerPhone)) {
      setValidationError(
        isUr
          ? 'موبائل نمبر درست فارمیٹ میں نہیں ہے (مثال: 0300-1234567)۔'
          : 'Invalid Pakistani mobile phone format. Expected 03XX-XXXXXXX or +92 3XX XXXXXXX.'
      );
      return;
    }
    if (!isValidPakistaniNIC(customerNic)) {
      setValidationError(
        isUr
          ? 'شناختی کارڈ نمبر درست فارمیٹ میں نہیں ہے (XXXXX-XXXXXXX-X)۔'
          : 'Invalid CNIC format. Expected 13 digits formatted as XXXXX-XXXXXXX-X.'
      );
      return;
    }
    if (hasCrateLineItem && cratesReturned > cratesOrdered) {
      setValidationError(
        isUr
          ? 'واپس شدہ کریٹس کی تعداد آرڈر کردہ کریٹس سے زیادہ نہیں ہو سکتی۔'
          : 'Returned crates cannot exceed ordered crates.'
      );
      return;
    }
    if (liveConflict) {
      const floorNames = liveConflict.floors
        .map((f) => translateFloor(f, lang, db.floors))
        .join(isUr ? '، ' : ', ');
      setValidationError(
        `${tr('conflictPrefix', lang)} ${liveConflict.booking_code} (${floorNames} · ${formatTime12h(
          liveConflict.start_time,
          lang
        )}–${formatTime12h(liveConflict.end_time, lang)})`
      );
      return;
    }

    const discountRequestedByManager =
      isManager &&
      discountValue > 0 &&
      (!booking ||
        discountValue !== (booking.discount_value ?? 0) ||
        discountType !== (booking.discount_type || 'fixed'));

    const lateOverrideRequestedByManager =
      isManager &&
      lateChargeOverridden &&
      (!booking || effectiveLateCharge !== (booking.late_charge_amount ?? 0));

    const rescheduleFeeRequestedByManager =
      isManager && dateChangedFromOriginal && pendingRescheduleFee > 0;

    setSaving(true);
    const res = await saveBooking(
      {
        id: booking?.id,
        customer_id: customerId,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        customer_phone: customerPhone.trim(),
        customer_nic: customerNic.trim(),
        customer_email: customerEmail.trim(),
        event_type: eventType,
        event_date: eventDate,
        start_time: startTime,
        end_time: endTime,
        floors,
        guests_count: Number(guestsCount) || 0,
        hall_rent: Number(hallRent) || 0,
        notes: notes.trim(),
        inspection_notes: inspectionNotes.trim(),
        status,
        crates_ordered: hasCrateLineItem ? Number(cratesOrdered) || 0 : 0,
        crates_used: hasCrateLineItem ? Number(cratesUsed) || 0 : 0,
        crates_returned: hasCrateLineItem ? Number(cratesReturned) || 0 : 0,
        crate_rate: Number(crateRate) || 0,
        crate_handling_deduction_per_crate: Number(crateHandling) || 0,
        crate_credit_amount: hasCrateLineItem ? crateCalc.netCreditReversed : 0,
        actual_end_time: actualEndTime || null,
        late_charge_method: lateOverrideRequestedByManager
          ? booking?.late_charge_method || 'none'
          : lateChargeMethod,
        late_charge_value: lateOverrideRequestedByManager
          ? booking?.late_charge_value ?? 0
          : Number(lateChargeValue) || 0,
        late_charge_amount: lateOverrideRequestedByManager
          ? booking?.late_charge_amount ?? 0
          : effectiveLateCharge,
        late_charge_overridden: lateOverrideRequestedByManager
          ? Boolean(booking?.late_charge_overridden)
          : lateChargeOverridden,
        discount_type: discountRequestedByManager
          ? booking?.discount_type || 'fixed'
          : discountType,
        discount_value: discountRequestedByManager
          ? booking?.discount_value ?? 0
          : Number(discountValue) || 0,
        discount_amount: discountRequestedByManager
          ? booking?.discount_amount ?? 0
          : discountAmount,
        discount_reason: discountRequestedByManager
          ? booking?.discount_reason || ''
          : discountReason.trim(),
        tax_percent: taxPercent,
      },
      effectiveItems,
      installments,
      dateChangedFromOriginal
        ? {
            reason:
              rescheduleReason.trim() ||
              (isUr ? 'تقریب کی تاریخ تبدیل کی گئی' : 'Event date updated'),
            fee: rescheduleFeeRequestedByManager ? 0 : pendingRescheduleFee,
          }
        : undefined
    );

    if (!res.ok) {
      setSaving(false);
      setValidationError(`${tr('conflictPrefix', lang)} ${res.error}`);
      return;
    }

    const queuedApprovals: string[] = [];
    if (res.booking) {
      if (discountRequestedByManager) {
        await submitApprovalRequest({
          booking_id: res.booking.id,
          booking_code: res.booking.booking_code,
          customer_name: res.booking.customer_name,
          request_type: 'discount',
          payload: {
            discount_type: discountType,
            discount_value: Number(discountValue) || 0,
            discount_amount: discountAmount,
            discount_reason: discountReason.trim(),
          },
          reason:
            discountReason.trim() ||
            (isUr ? 'مینیجر کی جانب سے خصوصی رعایت کی درخواست' : 'Manager requested special discount'),
        });
        queuedApprovals.push(`${tr('specialDiscount', lang)} (${formatPKR(discountAmount)})`);
      }

      if (lateOverrideRequestedByManager) {
        await submitApprovalRequest({
          booking_id: res.booking.id,
          booking_code: res.booking.booking_code,
          customer_name: res.booking.customer_name,
          request_type: 'late_charge_override',
          payload: {
            late_charge_method: lateChargeMethod,
            late_charge_value: Number(lateChargeValue) || 0,
            late_charge_amount: effectiveLateCharge,
          },
          reason: isUr
            ? 'مینیجر کی جانب سے تاخیر چارج میں تبدیلی کی درخواست'
            : 'Manager requested late charge override',
        });
        queuedApprovals.push(
          `${isUr ? 'تاخیر چارج تبدیلی' : 'Late Charge Override'} (${formatPKR(
            effectiveLateCharge
          )})`
        );
      }

      if (rescheduleFeeRequestedByManager) {
        await submitApprovalRequest({
          booking_id: res.booking.id,
          booking_code: res.booking.booking_code,
          customer_name: res.booking.customer_name,
          request_type: 'reschedule_fee',
          payload: {
            old_date: booking?.event_date || '',
            new_date: eventDate,
            fee: pendingRescheduleFee,
            reason:
              rescheduleReason.trim() ||
              (isUr ? 'تقریب کی تاریخ تبدیل کی گئی' : 'Event date rescheduled'),
          },
          reason:
            rescheduleReason.trim() ||
            (isUr ? 'تاریخ تبدیلی فیس کی درخواست' : 'Reschedule fee request'),
        });
        queuedApprovals.push(
          `${tr('rescheduleFeeLine', lang)} (${formatPKR(pendingRescheduleFee)})`
        );
      }
    }

    setSaving(false);
    if (res.booking && onSaved) onSaved(res.booking);
    if (queuedApprovals.length > 0) {
      setApprovalNotice(queuedApprovals);
      return;
    }
    onClose();
  };

  const suggestedSeasonText = isUr ? suggestedRent.seasonNameUr : suggestedRent.seasonName;
  const conflictFloors = liveConflict
    ? liveConflict.floors.map((f) => translateFloor(f, lang, db.floors)).join(isUr ? '، ' : ', ')
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-4xl glass-panel neon-border-cyan rounded-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/70">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {booking ? `${booking.booking_code} · ${booking.customer_name}` : tr('newBooking', lang)}
            </h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">
              {tr('bookingDate', lang)}:{' '}
              {formatDateDisplay(booking?.booking_date || todayISO(), lang)}
              {booking?.invoice_number ? ` · ${booking.invoice_number}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('close', lang)}
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        {approvalNotice ? (
          <div className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">
              {isUr
                ? 'بکنگ محفوظ ہو گئی اور منظوری کی درخواست بھیج دی گئی'
                : 'Booking Saved & Approval Request Submitted'}
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              {isUr
                ? 'بکنگ محفوظ کر لی گئی ہے۔ مالی تبدیلیوں کے لیے ہال ایڈمن کی منظوری درکار ہے، درج ذیل درخواستیں منظوری کی قطار میں بھیج دی گئی ہیں:'
                : 'The booking has been saved. Because managers require Hall Admin approval for financial adjustments, the following request(s) were sent to the Approvals queue:'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {approvalNotice.map((item) => (
                <span
                  key={item}
                  className="px-3 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-semibold"
                >
                  {item}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
            >
              {isUr ? 'مکمل' : 'Done'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {booking?.status === 'Cancelled' && booking.cancellation_details && (
              <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/25 text-xs space-y-1.5">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <Ban className="w-4 h-4" />
                  <span>
                    {isUr ? 'بکنگ منسوخ شدہ' : 'Booking Cancelled'} (
                    <span className="tabular-nums">
                      {formatDateDisplay(booking.cancellation_details.refund_date, lang)}
                    </span>
                    )
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-slate-200 tabular-nums pt-1">
                  <div>
                    {isUr ? 'وصول شدہ:' : 'Paid So Far:'}{' '}
                    <strong>{formatPKR(booking.cancellation_details.amount_paid_so_far)}</strong>
                  </div>
                  <div>
                    {isUr ? 'کٹوتی:' : 'Deduction:'}{' '}
                    <strong className="text-amber-300">
                      {formatPKR(booking.cancellation_details.deduction_amount)}
                    </strong>
                  </div>
                  <div>
                    {isUr ? 'واپسی' : 'Refund'} (
                    {translatePaymentMode(booking.cancellation_details.refund_mode, lang)}):{' '}
                    <strong className="text-emerald-300">
                      {formatPKR(booking.cancellation_details.refund_amount)}
                    </strong>
                  </div>
                </div>
                <div className="text-slate-400">
                  {isUr ? 'وجہ:' : 'Reason:'} {booking.cancellation_details.reason}
                </div>
              </div>
            )}

            {liveConflict && (
              <div className="p-3.5 rounded-xl border border-rose-500/50 bg-rose-500/15 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">{tr('conflictPrefix', lang)}</div>
                  <div className="mt-0.5">
                    {isUr ? (
                      <>
                        یہ وقت (بشمول {db.settings.cleaning_buffer_minutes} منٹ صفائی وقفہ){' '}
                        <strong>{liveConflict.booking_code}</strong> ({liveConflict.customer_name})
                        کے ساتھ ٹکرا رہا ہے — {formatDateDisplay(liveConflict.event_date, lang)} ·{' '}
                        {conflictFloors} ·{' '}
                        <span className="tabular-nums">
                          {formatTime12h(liveConflict.start_time, lang)}–
                          {formatTime12h(liveConflict.end_time, lang)}
                        </span>
                      </>
                    ) : (
                      <span className="tabular-nums">
                        Overlaps (including {db.settings.cleaning_buffer_minutes}-min cleaning
                        buffer) with <strong>{liveConflict.booking_code}</strong> (
                        {liveConflict.customer_name}) on{' '}
                        {formatDateDisplay(liveConflict.event_date, lang)} · {conflictFloors} ·{' '}
                        {formatTime12h(liveConflict.start_time, lang)}–
                        {formatTime12h(liveConflict.end_time, lang)}.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {validationError && (
              <div className="p-3.5 rounded-xl border border-rose-500/50 bg-rose-500/15 text-rose-200 text-xs">
                {validationError}
              </div>
            )}

            {/* Customer Details */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold text-cyan-300">
                  {isUr ? 'گاہک کی معلومات' : 'Customer Information'}
                </h3>
                {!readOnly && activeCustomers.length > 0 && (
                  <select
                    value={customerId || ''}
                    onChange={(e) => {
                      const cid = e.target.value;
                      if (!cid) {
                        setCustomerId(null);
                        return;
                      }
                      const found = activeCustomers.find((c) => c.id === cid);
                      if (found) {
                        setCustomerId(found.id);
                        setCustomerName(found.full_name);
                        setCustomerPhone(found.phone);
                        setCustomerNic(found.nic);
                        setCustomerAddress(found.address);
                        setCustomerEmail(found.email);
                      }
                    }}
                    className="bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 max-w-xs"
                  >
                    <option value="">
                      {isUr ? 'نیا یا دستی گاہک درج کریں...' : 'New / Custom Customer Details...'}
                    </option>
                    {activeCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.phone})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('customerName', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={readOnly}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('phone', lang)} (03XX-XXXXXXX) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={readOnly}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(formatPakistaniPhoneInput(e.target.value))}
                    placeholder="0300-8219940"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('nic', lang)} (XXXXX-XXXXXXX-X) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={readOnly}
                    value={customerNic}
                    onChange={(e) => setCustomerNic(formatNICInput(e.target.value))}
                    placeholder="42301-4451290-1"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('address', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={readOnly}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder={
                      isUr ? 'مکان / گلی / سیکٹر، کراچی' : 'House / Street / Sector, Karachi'
                    }
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">{tr('email', lang)}</label>
                  <input
                    type="email"
                    disabled={readOnly}
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@example.pk"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Event Schedule & Floors */}
            <div className="pt-4 border-t border-slate-800/80">
              <h3 className="text-xs font-semibold text-cyan-300 mb-3">
                {tr('eventSchedule', lang)} &amp; {tr('floors', lang)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('eventType', lang)}
                  </label>
                  <select
                    disabled={readOnly}
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {db.eventTypes
                      .filter((et) => !et.deleted_at)
                      .map((et) => (
                        <option key={et.id} value={et.name_en}>
                          {pickLocalized(et.name_en, et.name_ur, lang)}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('eventDate', lang)} *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={readOnly}
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('startTime', lang)} ({formatTime12h(startTime, lang)})
                  </label>
                  <input
                    type="time"
                    required
                    disabled={readOnly}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('endTime', lang)} ({formatTime12h(endTime, lang)}
                    {crossesMidnight ? (isUr ? ' · اگلا دن' : ' · Next Day') : ''})
                  </label>
                  <input
                    type="time"
                    required
                    disabled={readOnly}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {dateChangedFromOriginal && !readOnly && (
                <div className="mt-3 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-amber-200 font-semibold mb-1">
                      {isUr
                        ? `تاریخ تبدیلی کی وجہ (${booking?.event_date} ← ${eventDate})`
                        : `Reschedule Reason (From ${booking?.event_date} → ${eventDate})`}
                    </label>
                    <input
                      type="text"
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder={isUr ? 'تاریخ تبدیلی کی وجہ...' : 'Reason for date change...'}
                      className="w-full bg-slate-950/80 border border-amber-500/30 rounded-lg px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-amber-200 font-semibold mb-1">
                      {tr('rescheduleFeeLine', lang)} (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={rescheduleFee}
                      onChange={(e) => setRescheduleFee(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-slate-950/80 border border-amber-500/30 rounded-lg px-3 py-1.5 text-amber-300 tabular-nums font-semibold"
                    />
                  </div>
                </div>
              )}

              {!readOnly && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-400">
                    {isUr ? 'فوری اوقات:' : 'Quick Slots:'}
                  </span>
                  {[
                    {
                      label: isUr ? 'صبح (9:00 – 3:00)' : 'Morning (9:00 AM – 3:00 PM)',
                      start: '09:00',
                      end: '15:00',
                    },
                    {
                      label: isUr ? 'دوپہر (2:00 – 6:00)' : 'Afternoon (2:00 PM – 6:00 PM)',
                      start: '14:00',
                      end: '18:00',
                    },
                    {
                      label: isUr ? 'رات (8:00 – 12:00)' : 'Night (8:00 PM – 12:00 AM)',
                      start: '20:00',
                      end: '00:00',
                    },
                  ].map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => {
                        setStartTime(slot.start);
                        setEndTime(slot.end);
                      }}
                      className={`px-2.5 py-1 rounded-lg border transition-colors ${
                        startTime === slot.start && endTime === slot.end
                          ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                  <span className="text-slate-500 ms-auto tabular-nums">
                    {isUr
                      ? `صفائی وقفہ: ${db.settings.cleaning_buffer_minutes} منٹ`
                      : `Cleaning buffer: ${db.settings.cleaning_buffer_minutes} min`}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                <div className="lg:col-span-2">
                  <label className="block text-xs text-slate-300 mb-1.5">
                    {tr('floors', lang)}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['First', 'Second', 'Third', 'Full Hall'] as FloorName[]).map((fl) => {
                      const active = floors.includes(fl);
                      return (
                        <button
                          key={fl}
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggleFloor(fl)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                            active
                              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                          <span>{translateFloor(fl, lang, db.floors)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      {tr('guests', lang)}
                    </label>
                    <input
                      type="number"
                      min={10}
                      disabled={readOnly}
                      value={guestsCount}
                      onChange={(e) => setGuestsCount(Number(e.target.value))}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      {tr('status', lang)}
                    </label>
                    <select
                      disabled={readOnly}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as BookingStatus)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="Tentative">{translateStatus('Tentative', lang)}</option>
                      <option value="Confirmed">{translateStatus('Confirmed', lang)}</option>
                      <option value="Completed">{translateStatus('Completed', lang)}</option>
                      <option value="Cancelled">{translateStatus('Cancelled', lang)}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Hall Rent & Services Line Items */}
            <div className="pt-4 border-t border-slate-800/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-cyan-300">
                    {isUr
                      ? 'ہال کرایہ، بنیادی پیکج اور ہال سروسز'
                      : 'Hall Rent, Default Package & Hall Services'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isUr ? 'تجویز کردہ کرایہ' : 'Suggested'} ({suggestedSeasonText} ·{' '}
                    {suggestedRent.dayType === 'weekend'
                      ? tr('weekend', lang)
                      : tr('weekday', lang)}
                    ):{' '}
                    <span className="text-amber-300 font-semibold tabular-nums">
                      {formatPKR(suggestedRent.amount)}
                    </span>
                    {!readOnly && hallRent !== suggestedRent.amount && (
                      <button
                        type="button"
                        onClick={() => {
                          setHallRent(suggestedRent.amount);
                          setRentEditedManually(false);
                        }}
                        className="ms-2 text-cyan-400 hover:underline"
                      >
                        {isUr ? 'تجویز کردہ کرایہ لاگو کریں' : 'Apply Suggested'}
                      </button>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-300">{tr('hallRent', lang)}:</label>
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={hallRent}
                    onChange={(e) => {
                      setRentEditedManually(true);
                      setHallRent(Math.max(0, Number(e.target.value)));
                    }}
                    className="w-36 bg-slate-950/80 border border-amber-500/40 rounded-xl px-3 py-1.5 text-sm font-semibold text-amber-300 tabular-nums focus:outline-none"
                  />
                </div>
              </div>

              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCatalogId}
                    onChange={(e) => setSelectedCatalogId(e.target.value)}
                    className="flex-1 min-w-[220px] bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {extraCatalogItems.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {pickLocalized(ch.name_en, ch.name_ur, lang)} — {formatPKR(ch.default_rate)}{' '}
                        / {translateUnitLabel(ch.unit_label, lang, ch.unit_label_ur)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCatalogItem}
                    className="px-3.5 py-2 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-200 text-xs font-semibold hover:bg-violet-500/30 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{tr('addChargeItem', lang)}</span>
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{tr('descriptionCol', lang)}</th>
                      <th className="py-2.5 px-3 text-end">{tr('qtyCol', lang)}</th>
                      <th className="py-2.5 px-3 text-end">{tr('rateCol', lang)} (PKR)</th>
                      <th className="py-2.5 px-3 text-end">{tr('amountCol', lang)}</th>
                      {!readOnly && (
                        <th className="py-2.5 px-3 text-end">{isUr ? 'حذف' : 'Remove'}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {effectiveItems.map((it, idx) => {
                      const crateRow = isCrateItem(it);
                      const itemTitle = translateBookingItemName(it, lang, db.chargesCatalog);
                      const catTitle = translateChargeCategoryName(
                        it.category_name,
                        lang,
                        db.chargeCategories
                      );
                      return (
                        <React.Fragment key={it.id}>
                          <tr className="hover:bg-slate-900/30">
                            <td className="py-2 px-3">
                              <div className="font-medium text-slate-100">{itemTitle}</div>
                              <div className="text-[11px] text-slate-400">
                                {catTitle}{' '}
                                {it.is_package_included
                                  ? `· ${tr('defaultPackageIncluded', lang)}`
                                  : ''}
                                {crateRow
                                  ? ` · ${
                                      isUr
                                        ? 'کریٹ واپسی ایڈجسٹمنٹ لاگو'
                                        : 'Crate Return Adjustment Applied'
                                    }`
                                  : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-end">
                              {crateRow ? (
                                <span className="text-slate-300 tabular-nums">
                                  {cratesOrdered - cratesReturned}{' '}
                                  {isUr ? 'خالص کریٹس' : 'net crates'}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  disabled={readOnly}
                                  value={it.quantity}
                                  onChange={(e) => {
                                    const qty = Math.max(0, Number(e.target.value));
                                    setItems((prev) =>
                                      prev.map((row, rIdx) =>
                                        rIdx === idx
                                          ? { ...row, quantity: qty, amount: qty * row.rate }
                                          : row
                                      )
                                    );
                                  }}
                                  className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-end tabular-nums text-white"
                                />
                              )}
                            </td>
                            <td className="py-2 px-3 text-end">
                              {crateRow ? (
                                <span className="text-slate-300 tabular-nums">
                                  {formatPKR(crateRate)}/{isUr ? 'کریٹ' : 'crate'}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  disabled={readOnly}
                                  value={it.rate}
                                  onChange={(e) => {
                                    const rate = Math.max(0, Number(e.target.value));
                                    setItems((prev) =>
                                      prev.map((row, rIdx) =>
                                        rIdx === idx
                                          ? { ...row, rate, amount: row.quantity * rate }
                                          : row
                                      )
                                    );
                                  }}
                                  className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-end tabular-nums text-white"
                                />
                              )}
                            </td>
                            <td className="py-2 px-3 text-end font-semibold text-slate-100 tabular-nums">
                              {formatPKR(it.amount)}
                            </td>
                            {!readOnly && (
                              <td className="py-2 px-3 text-end">
                                {(!isManager || it.id.startsWith('new-')) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setItems((prev) => prev.filter((_, rIdx) => rIdx !== idx))
                                    }
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                          {crateRow && (
                            <tr className="bg-cyan-950/15">
                              <td colSpan={readOnly ? 4 : 5} className="p-3.5">
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      {tr('cratesOrdered', lang)}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={readOnly}
                                      value={cratesOrdered}
                                      onChange={(e) =>
                                        setCratesOrdered(Math.max(0, Number(e.target.value)))
                                      }
                                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      {tr('cratesUsed', lang)}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={readOnly}
                                      value={cratesUsed}
                                      onChange={(e) =>
                                        setCratesUsed(Math.max(0, Number(e.target.value)))
                                      }
                                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      {tr('cratesReturned', lang)}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={cratesOrdered}
                                      disabled={readOnly}
                                      value={cratesReturned}
                                      onChange={(e) =>
                                        setCratesReturned(Math.max(0, Number(e.target.value)))
                                      }
                                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      {tr('crateRate', lang)}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={readOnly}
                                      value={crateRate}
                                      onChange={(e) =>
                                        setCrateRate(Math.max(0, Number(e.target.value)))
                                      }
                                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      {tr('crateHandling', lang)}
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={readOnly}
                                      value={crateHandling}
                                      onChange={(e) =>
                                        setCrateHandling(Math.max(0, Number(e.target.value)))
                                      }
                                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-white"
                                    />
                                  </div>
                                </div>
                                <div className="mt-2.5 flex flex-wrap gap-4 text-[11px] text-slate-300">
                                  <span>
                                    {isUr ? 'مجموعی آرڈر:' : 'Gross Ordered:'}{' '}
                                    <strong className="tabular-nums">
                                      {formatPKR(crateCalc.grossOrdered)}
                                    </strong>
                                  </span>
                                  <span>
                                    {isUr ? 'واپسی مالیت:' : 'Returned Value:'}{' '}
                                    <strong className="tabular-nums">
                                      {formatPKR(crateCalc.returnedGrossValue)}
                                    </strong>
                                  </span>
                                  <span className="text-amber-300">
                                    {isUr ? 'برف و ہینڈلنگ کٹوتی:' : 'Ice/Handling Deduction:'}{' '}
                                    <strong className="tabular-nums">
                                      -{formatPKR(crateCalc.iceAndHandlingDeduction)}
                                    </strong>
                                  </span>
                                  <span className="text-emerald-400">
                                    {tr('crateCredit', lang)}:{' '}
                                    <strong className="tabular-nums">
                                      -{formatPKR(crateCalc.netCreditReversed)}
                                    </strong>
                                  </span>
                                  <span className="text-cyan-300 ms-auto">
                                    {isUr ? 'خالص کولڈ ڈرنکس بل:' : 'Net Cold Drinks Line:'}{' '}
                                    <strong className="tabular-nums">
                                      {formatPKR(crateCalc.netCrateBill)}
                                    </strong>
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Flexible Late Charges */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-cyan-300">
                  {isUr
                    ? `تاخیر چارجز (لچکدار حساب · رعایتی وقت: ${db.settings.late_grace_minutes} منٹ)`
                    : `Late Charges (Manual & Flexible · Grace: ${db.settings.late_grace_minutes} min)`}
                </h3>
                {lateCalc.overtimeMinutes > 0 && (
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {isUr
                      ? `اضافی وقت: ${lateCalc.overtimeMinutes} منٹ − ${lateCalc.graceMinutes} منٹ رعایت = ${lateCalc.billableMinutes} قابلِ بل منٹ`
                      : `Overtime: ${lateCalc.overtimeMinutes}m − ${lateCalc.graceMinutes}m grace = ${lateCalc.billableMinutes}m billable`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isUr ? 'تاخیر چارج کا طریقہ' : 'Late Charge Method'}
                  </label>
                  <select
                    disabled={readOnly}
                    value={lateChargeMethod}
                    onChange={(e) => {
                      setLateChargeMethod(e.target.value as LateChargeMethod);
                      setLateChargeOverridden(false);
                    }}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="none">{isUr ? 'کوئی تاخیر چارج نہیں' : 'No Late Charge'}</option>
                    <option value="fixed">{isUr ? 'مقررہ رقم (PKR)' : 'Fixed Amount (PKR)'}</option>
                    <option value="percent_rent">
                      {isUr ? 'ہال کرایہ کا فیصد (%)' : 'Percentage (%) of Hall Rent'}
                    </option>
                    <option value="per_hour">
                      {isUr ? 'فی گھنٹہ اوور ٹائم ریٹ' : 'Per Hour Overtime Rate'}
                    </option>
                    <option value="per_30min">
                      {isUr ? 'فی 30 منٹ اوور ٹائم ریٹ' : 'Per 30 Minutes Overtime Rate'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {lateChargeMethod === 'percent_rent'
                      ? isUr
                        ? 'فیصد (%)'
                        : 'Percentage (%)'
                      : lateChargeMethod === 'per_hour'
                      ? isUr
                        ? 'فی گھنٹہ ریٹ (PKR)'
                        : 'Rate / Hour (PKR)'
                      : lateChargeMethod === 'per_30min'
                      ? isUr
                        ? 'فی 30 منٹ ریٹ (PKR)'
                        : 'Rate / 30 Min (PKR)'
                      : isUr
                      ? 'رقم (PKR)'
                      : 'Value (PKR)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly || lateChargeMethod === 'none'}
                    value={lateChargeValue}
                    onChange={(e) => {
                      setLateChargeValue(Math.max(0, Number(e.target.value)));
                      setLateChargeOverridden(false);
                    }}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums disabled:opacity-40"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isUr ? 'حقیقی اختتامی وقت' : 'Actual End Time'}{' '}
                    {actualEndTime
                      ? `(${formatTime12h(actualEndTime, lang)})`
                      : isUr
                      ? '(اختیاری)'
                      : '(Optional)'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      disabled={readOnly}
                      value={actualEndTime}
                      onChange={(e) => setActualEndTime(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                    />
                    {!readOnly && actualEndTime && (
                      <button
                        type="button"
                        onClick={() => setActualEndTime('')}
                        className="px-2 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-400 hover:text-white"
                      >
                        {isUr ? 'صاف' : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-slate-400">
                      {isUr ? 'تاخیر چارج' : 'Late Amount'}
                      {lateChargeOverridden
                        ? isUr
                          ? ' · دستی'
                          : ' · Manual'
                        : isUr
                        ? ' · خودکار'
                        : ' · Auto'}
                    </label>
                    {!readOnly && lateChargeOverridden && (
                      <button
                        type="button"
                        onClick={() => {
                          setLateChargeOverridden(false);
                          setManualLateCharge(lateCalc.calculatedAmount);
                        }}
                        className="text-[11px] text-cyan-400 hover:underline"
                      >
                        {isUr ? 'ری سیٹ' : 'Reset'}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={effectiveLateCharge}
                    onChange={(e) => {
                      setLateChargeOverridden(true);
                      setManualLateCharge(Math.max(0, Number(e.target.value)));
                    }}
                    className="w-full bg-slate-950/80 border border-amber-500/35 rounded-xl px-3 py-2 text-xs font-semibold text-amber-300 tabular-nums focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Special Discount Section */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs font-semibold text-cyan-300">
                  {isUr ? 'رعایت اور حتمی طے شدہ کل بل' : 'Discount & Final Agreed Total'}
                </h3>
                <div className="flex items-center gap-3">
                  {isManager && (
                    <span className="text-[11px] text-amber-300 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      <span>
                        {isUr
                          ? 'نئی یا تبدیل شدہ رعایت کے لیے ایڈمن منظوری درکار ہے'
                          : 'New/changed discounts require Admin approval'}
                      </span>
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {tr('standardTotal', lang)}: {formatPKR(standardTotal)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isUr ? 'رعایت کی قسم' : 'Discount Type'}
                  </label>
                  <select
                    disabled={readOnly}
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="fixed">
                      {isUr ? 'مقررہ رقم (PKR)' : 'Fixed Amount (PKR)'}
                    </option>
                    <option value="percent">{isUr ? 'فیصد (%)' : 'Percentage (%)'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {discountType === 'percent'
                      ? isUr
                        ? 'رعایت (%)'
                        : 'Discount (%)'
                      : isUr
                      ? 'رعایت رقم (PKR)'
                      : 'Discount Amount (PKR)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isUr ? 'رعایت کی وجہ / نوٹ' : 'Discount Reason / Note'}
                  </label>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder={
                      isUr
                        ? 'حوالہ / وی آئی پی رعایت / خاندانی رعایت...'
                        : 'Reference / VIP courtesy / family discount...'
                    }
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Installment Plan */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-cyan-300">
                  {isUr ? 'اقساط کا شیڈول (اختیاری)' : 'Installment Schedule (Optional Due Dates)'}
                </h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleAddInstallment}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs text-cyan-300 hover:border-cyan-500/40 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isUr ? 'قسط شامل کریں' : 'Add Installment'}</span>
                  </button>
                )}
              </div>
              {installments.length > 0 && (
                <div className="space-y-2">
                  {installments.map((ins, idx) => (
                    <div
                      key={ins.id}
                      className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
                    >
                      <input
                        type="text"
                        disabled={readOnly}
                        value={ins.title}
                        onChange={(e) =>
                          setInstallments((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, title: e.target.value } : row
                            )
                          )
                        }
                        placeholder={isUr ? 'قسط کا عنوان' : 'Installment label'}
                        className="sm:col-span-2 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      <input
                        type="date"
                        disabled={readOnly}
                        value={ins.due_date}
                        onChange={(e) =>
                          setInstallments((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, due_date: e.target.value } : row
                            )
                          )
                        }
                        className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          disabled={readOnly}
                          value={ins.amount}
                          onChange={(e) =>
                            setInstallments((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, amount: Number(e.target.value) } : row
                              )
                            )
                          }
                          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
                        />
                        {!readOnly && (!isManager || ins.id.startsWith('new-')) && (
                          <button
                            type="button"
                            onClick={() =>
                              setInstallments((prev) => prev.filter((_, rIdx) => rIdx !== idx))
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked Expenses & Reschedule History */}
            {booking && (
              <div
                className={`grid grid-cols-1 ${
                  canSeeExpensesProfit ? 'lg:grid-cols-2' : ''
                } gap-4 pt-4 border-t border-slate-800/80 text-xs`}
              >
                {canSeeExpensesProfit && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">
                        {isUr ? 'منسلک وینڈر و تقریب اخراجات' : 'Linked Vendor & Event Expenses'}
                      </h4>
                      <span className="font-bold tabular-nums text-rose-300">
                        {formatPKR(linkedExpensesTotal)}
                      </span>
                    </div>
                    {linkedExpenses.length > 0 ? (
                      <div className="space-y-1.5 max-h-28 overflow-y-auto">
                        {linkedExpenses.map((ex) => (
                          <div
                            key={ex.id}
                            className="flex justify-between text-[11px] text-slate-300 border-b border-slate-800/60 pb-1"
                          >
                            <span>
                              {translateExpenseCategoryName(
                                ex.category_name,
                                lang,
                                db.expenseCategories,
                                ex.category_id,
                                ex.category_name_ur
                              )}{' '}
                              · {ex.payee}
                            </span>
                            <span className="tabular-nums font-semibold">
                              {formatPKR(ex.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        {isUr
                          ? 'اس بکنگ سے ابھی کوئی خرچ منسلک نہیں ہے۔'
                          : 'No vendor expenses linked to this booking yet (link from Expenses screen).'}
                      </p>
                    )}
                    <div className="pt-1 flex justify-between font-bold border-t border-slate-800">
                      <span className="text-slate-300">{tr('bookingProfit', lang)}</span>
                      <span
                        className={`tabular-nums ${
                          bookingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPKR(bookingProfit)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                  <h4 className="font-semibold text-white flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {isUr ? 'تاریخ تبدیلی کا ریکارڈ' : 'Reschedule History'} (
                      <span className="tabular-nums">
                        {(booking.reschedule_history || []).length}
                      </span>
                      )
                    </span>
                  </h4>
                  {booking.reschedule_history && booking.reschedule_history.length > 0 ? (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {booking.reschedule_history.map((r) => (
                        <div
                          key={r.id}
                          className="text-[11px] text-slate-300 border-b border-slate-800/60 pb-1"
                        >
                          <div className="tabular-nums font-semibold text-amber-300">
                            {formatDateDisplay(r.old_date, lang)} →{' '}
                            {formatDateDisplay(r.new_date, lang)}{' '}
                            {r.fee > 0
                              ? `(${isUr ? 'فیس:' : 'Fee:'} ${formatPKR(r.fee)})`
                              : ''}
                          </div>
                          <div className="text-slate-400">
                            {r.changed_by} · {r.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {isUr
                        ? 'اس بکنگ کی تاریخ میں کوئی تبدیلی نہیں کی گئی۔'
                        : 'No date changes recorded for this booking.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Notes & Hall Inspection Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">{tr('notes', lang)}</label>
                <textarea
                  rows={2}
                  disabled={readOnly}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {tr('inspectionNotes', lang)}
                </label>
                <textarea
                  rows={2}
                  disabled={readOnly}
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder={
                    isUr
                      ? 'تقریب سے پہلے اور بعد ہال کی حالت، اے سی / جنریٹر چیک، نقصان کے نوٹس...'
                      : 'Pre/post-event hall condition, AC/generator check, damage notes...'
                  }
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Summary Bar */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-5 text-xs">
                <div>
                  <div className="text-slate-400">{isUr ? 'ہال کرایہ' : 'Hall Rent'}</div>
                  <div className="font-semibold text-white tabular-nums">
                    {formatPKR(hallRent)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">{isUr ? 'سروسز' : 'Services'}</div>
                  <div className="font-semibold text-white tabular-nums">
                    {formatPKR(itemsTotal)}
                  </div>
                </div>
                {effectiveLateCharge > 0 && (
                  <div>
                    <div className="text-slate-400">{isUr ? 'تاخیر چارجز' : 'Late Charges'}</div>
                    <div className="font-semibold text-amber-300 tabular-nums">
                      {formatPKR(effectiveLateCharge)}
                    </div>
                  </div>
                )}
                {totalRescheduleFees > 0 && (
                  <div>
                    <div className="text-slate-400">{tr('rescheduleFeeLine', lang)}</div>
                    <div className="font-semibold text-amber-300 tabular-nums">
                      {formatPKR(totalRescheduleFees)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-slate-400">{tr('standardTotal', lang)}</div>
                  <div className="font-semibold text-slate-200 tabular-nums">
                    {formatPKR(standardTotal)}
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div>
                    <div className="text-slate-400">{tr('specialDiscount', lang)}</div>
                    <div className="font-semibold text-emerald-400 tabular-nums">
                      - {formatPKR(discountAmount)}
                    </div>
                  </div>
                )}
                {taxPercent > 0 && (
                  <div>
                    <div className="text-slate-400">
                      {tr('taxLabel', lang)} (<span className="tabular-nums">{taxPercent}%</span>)
                    </div>
                    <div className="font-semibold text-white tabular-nums">
                      {formatPKR(taxAmount)}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-end">
                <div className="text-xs text-slate-400">{tr('totalBill', lang)}</div>
                <div className="text-xl font-bold text-cyan-300 tabular-nums">
                  {formatPKR(finalAgreedTotal)}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                {tr('cancel', lang)}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  disabled={saving || Boolean(liveConflict)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold hover:opacity-95 disabled:opacity-40"
                >
                  {saving ? tr('saving', lang) : tr('save', lang)}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
