import {
  Booking,
  BookingItem,
  DiscountType,
  Expense,
  FloorName,
  HallSettings,
  Language,
  LateChargeMethod,
  Payment,
} from '../types';

export function normalizeWesternDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function formatPKR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `PKR ${safe.toLocaleString('en-PK')}`;
}

export function formatDateDisplay(dateStr: string, lang: Language = 'en'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const formatted = d.toLocaleDateString(lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return normalizeWesternDigits(formatted);
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const d = new Date(`${baseISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Validates Pakistani Mobile Phone:
 * Accepts 03XX-XXXXXXX, 03XXXXXXXXX, +92 3XX XXXXXXX, +923XXXXXXXXX
 */
export function isValidPakistaniPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(?:\+92|92|0)3[0-9]{9}$/.test(cleaned);
}

export function formatPakistaniPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('923') && digits.length <= 12) {
    const local = '0' + digits.slice(2);
    return local.length > 4 ? `${local.slice(0, 4)}-${local.slice(4, 11)}` : local;
  }
  if (digits.startsWith('03') && digits.length <= 11) {
    return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4, 11)}` : digits;
  }
  return raw;
}

export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('03') && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  if (digits.startsWith('92') && digits.length === 12) {
    return digits;
  }
  return digits;
}

/**
 * Validates Pakistani CNIC: XXXXX-XXXXXXX-X (13 digits)
 */
export function isValidPakistaniNIC(nic: string): boolean {
  const cleaned = nic.trim();
  return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(cleaned);
}

export function formatNICInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * Cold Drink Crate Math
 */
export interface CrateCalculation {
  grossOrdered: number;
  returnedGrossValue: number;
  iceAndHandlingDeduction: number;
  netCreditReversed: number;
  netCrateBill: number;
}

export function calculateCrateBill(
  ordered: number,
  returned: number,
  ratePerCrate: number,
  handlingDeductionPerCrate: number
): CrateCalculation {
  const safeOrdered = Math.max(0, Number(ordered) || 0);
  const safeReturned = Math.min(safeOrdered, Math.max(0, Number(returned) || 0));
  const safeRate = Math.max(0, Number(ratePerCrate) || 0);
  const safeDeduction = Math.max(0, Number(handlingDeductionPerCrate) || 0);

  const grossOrdered = safeOrdered * safeRate;
  const returnedGrossValue = safeReturned * safeRate;
  const iceAndHandlingDeduction = safeReturned * safeDeduction;
  const netCreditReversed = Math.max(0, returnedGrossValue - iceAndHandlingDeduction);
  const netCrateBill = Math.max(0, grossOrdered - netCreditReversed);

  return {
    grossOrdered,
    returnedGrossValue,
    iceAndHandlingDeduction,
    netCreditReversed,
    netCrateBill,
  };
}

/**
 * Flexible Late Charge Calculation (None / Fixed / % of Rent / Per Hour / Per 30 Min)
 */
export interface LateChargeBreakdown {
  overtimeMinutes: number;
  graceMinutes: number;
  billableMinutes: number;
  billableUnits: number;
  unitSizeMinutes: number;
  calculatedAmount: number;
}

export function calculateLateCharge(params: {
  method: LateChargeMethod;
  value: number;
  hallRent: number;
  startTime: string;
  scheduledEndTime: string;
  actualEndTime: string | null | undefined;
  graceMinutes: number;
}): LateChargeBreakdown {
  const grace = Math.max(0, Number(params.graceMinutes) || 0);
  const val = Math.max(0, Number(params.value) || 0);
  const unitSizeMinutes = params.method === 'per_30min' ? 30 : 60;

  let overtimeMinutes = 0;
  let billableMinutes = 0;
  let billableUnits = 0;

  if (params.actualEndTime) {
    const startMin = timeToMinutes(params.startTime);
    let schedEndMin = timeToMinutes(params.scheduledEndTime);
    if (schedEndMin <= startMin) schedEndMin += 1440;

    let actualEndMin = timeToMinutes(params.actualEndTime);
    if (actualEndMin <= startMin) actualEndMin += 1440;

    overtimeMinutes = Math.max(0, actualEndMin - schedEndMin);
    billableMinutes = Math.max(0, overtimeMinutes - grace);
    billableUnits = billableMinutes > 0 ? Math.ceil(billableMinutes / unitSizeMinutes) : 0;
  }

  let calculatedAmount = 0;
  if (params.method === 'fixed') {
    calculatedAmount = Math.round(val);
  } else if (params.method === 'percent_rent') {
    calculatedAmount = Math.round((Math.max(0, Number(params.hallRent) || 0) * val) / 100);
  } else if (params.method === 'per_hour' || params.method === 'per_30min') {
    calculatedAmount = Math.round(billableUnits * val);
  }

  return {
    overtimeMinutes,
    graceMinutes: grace,
    billableMinutes,
    billableUnits,
    unitSizeMinutes,
    calculatedAmount,
  };
}

/**
 * Discount calculation
 */
export function calculateDiscountAmount(
  standardTotal: number,
  discountType: DiscountType,
  discountValue: number
): number {
  const base = Math.max(0, Number(standardTotal) || 0);
  const val = Math.max(0, Number(discountValue) || 0);
  const raw = discountType === 'percent' ? Math.round((base * val) / 100) : Math.round(val);
  return Math.min(base, raw);
}

/**
 * Flexible Suggested Hall Rent (Weekday/Weekend + Season)
 */
export interface SuggestedRentInfo {
  amount: number;
  dayType: 'weekday' | 'weekend';
  seasonName: string;
  seasonNameUr: string;
  isStandard: boolean;
}

export function getSuggestedHallRent(
  floors: FloorName[],
  eventDate: string,
  settings: HallSettings
): SuggestedRentInfo {
  const d = eventDate ? new Date(`${eventDate}T00:00:00`) : new Date();
  const day = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const dayType: 'weekday' | 'weekend' = day === 0 || day === 5 || day === 6 ? 'weekend' : 'weekday';

  const matchedSeason = (settings.rent_seasons || []).find(
    (s) => eventDate >= s.start_date && eventDate <= s.end_date
  );
  const rateTable = matchedSeason?.rates || settings.weekday_weekend_rates;
  const seasonName = matchedSeason ? matchedSeason.name : 'Standard';
  const seasonNameUr = matchedSeason ? (matchedSeason.name_ur || matchedSeason.name) : 'معیاری نرخ';

  let amount = 0;
  if (floors.includes('Full Hall') || floors.length >= 3) {
    amount = rateTable?.['Full Hall']?.[dayType] ?? settings.default_rent_full;
  } else {
    if (floors.includes('First')) amount += rateTable?.First?.[dayType] ?? settings.default_rent_first;
    if (floors.includes('Second')) amount += rateTable?.Second?.[dayType] ?? settings.default_rent_second;
    if (floors.includes('Third')) amount += rateTable?.Third?.[dayType] ?? settings.default_rent_third;
  }

  return { amount, dayType, seasonName, seasonNameUr, isStandard: !matchedSeason };
}

/**
 * Booking Financial Summary (with Standard Total, Discount, Final Agreed Total, Reschedule Fees & Linked Expenses)
 */
export interface BookingFinancials {
  hallRent: number;
  itemsSubtotal: number;
  crateGross: number;
  crateCreditReversed: number;
  crateNet: number;
  lateCharge: number;
  rescheduleFeeTotal: number;
  standardTotal: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  taxAmount: number;
  grandTotal: number; // Final Agreed Total
  totalPaid: number;
  balance: number;
  progressPercent: number;
  linkedExpensesTotal: number;
  bookingProfit: number;
}

export function calculateBookingFinancials(
  booking: Booking,
  items: BookingItem[],
  payments: Payment[],
  expenses: Expense[] = []
): BookingFinancials {
  const activeItems = items.filter((i) => i.booking_id === booking.id && !i.deleted_at);
  const hasColdDrinkLine = activeItems.some(
    (i) => i.is_crate_service || i.item_name.toLowerCase().includes('cold drink')
  );

  const crateMath = calculateCrateBill(
    booking.crates_ordered,
    booking.crates_returned,
    booking.crate_rate,
    booking.crate_handling_deduction_per_crate
  );

  // If Cold Drinks line item exists, its amount already reflects netCrateBill (or we prevent double-counting)
  const itemsSubtotal = activeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const extraCrateBill = hasColdDrinkLine ? 0 : crateMath.netCrateBill;

  const hallRent = Number(booking.hall_rent) || 0;
  const lateCharge = Math.max(0, Number(booking.late_charge_amount) || 0);
  const rescheduleFeeTotal = (booking.reschedule_history || []).reduce(
    (s, r) => s + (Number(r.fee) || 0),
    0
  );

  const standardTotal = hallRent + itemsSubtotal + extraCrateBill + lateCharge + rescheduleFeeTotal;
  const discountAmount = calculateDiscountAmount(
    standardTotal,
    booking.discount_type || 'fixed',
    booking.discount_value ?? booking.discount_amount ?? 0
  );
  const subtotalAfterDiscount = Math.max(0, standardTotal - discountAmount);
  const taxRate = Number(booking.tax_percent) || 0;
  const taxAmount = Math.round((subtotalAfterDiscount * taxRate) / 100);
  const grandTotal = subtotalAfterDiscount + taxAmount;

  const totalPaid = payments
    .filter((p) => p.booking_id === booking.id && !p.deleted_at)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const balance = Math.max(0, grandTotal - totalPaid);
  const progressPercent = grandTotal > 0 ? Math.min(100, Math.round((totalPaid / grandTotal) * 100)) : 0;

  const linkedExpensesTotal = expenses
    .filter((e) => !e.deleted_at && e.booking_id === booking.id)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const bookingProfit = grandTotal - linkedExpensesTotal;

  return {
    hallRent,
    itemsSubtotal,
    crateGross: crateMath.grossOrdered,
    crateCreditReversed: crateMath.netCreditReversed,
    crateNet: crateMath.netCrateBill,
    lateCharge,
    rescheduleFeeTotal,
    standardTotal,
    discountAmount,
    subtotalAfterDiscount,
    taxAmount,
    grandTotal,
    totalPaid,
    balance,
    progressPercent,
    linkedExpensesTotal,
    bookingProfit,
  };
}

/**
 * Floor & Time Conflict Detector (with midnight rollover & cleaning buffer)
 */
export function timeToMinutes(t: string): number {
  const [hh, mm] = (t || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  return hh * 60 + mm;
}

export function formatTime12h(t: string, lang: Language = 'en'): string {
  if (!t) return '';
  const [hhStr, mmStr] = t.split(':');
  const hh = parseInt(hhStr, 10) || 0;
  const mm = String(parseInt(mmStr, 10) || 0).padStart(2, '0');
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (lang === 'ur') {
    const periodUr = hh < 12 ? 'صبح' : hh < 16 ? 'دوپہر' : hh < 19 ? 'شام' : 'رات';
    return `${h12}:${mm} ${periodUr}`;
  }
  const period = hh >= 12 ? 'PM' : 'AM';
  return `${h12}:${mm} ${period}`;
}

function dateISOToEpochMinutes(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map((n) => parseInt(n, 10) || 0);
  return Math.floor(Date.UTC(y, m - 1, d) / 60000);
}

function bookingIntervalEpochMinutes(eventDate: string, startTime: string, endTime: string): [number, number] {
  const dayBase = dateISOToEpochMinutes(eventDate);
  const startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) {
    endMin += 1440; // Crosses midnight into next calendar day
  }
  return [dayBase + startMin, dayBase + endMin];
}

export function doFloorsOverlap(a: FloorName[], b: FloorName[]): boolean {
  if (a.includes('Full Hall') || b.includes('Full Hall')) return true;
  return a.some((f) => b.includes(f));
}

export function findBookingConflict(
  candidate: {
    id?: string;
    hall_id?: string;
    event_date: string;
    start_time: string;
    end_time: string;
    floors: FloorName[];
    status: string;
  },
  existingBookings: Booking[],
  bufferMinutes = 60
): Booking | null {
  if (candidate.status === 'Cancelled') return null;
  if (!candidate.event_date || candidate.floors.length === 0) return null;

  const safeBuffer = Math.max(0, Number(bufferMinutes) || 0);
  const [candStart, candEnd] = bookingIntervalEpochMinutes(
    candidate.event_date,
    candidate.start_time,
    candidate.end_time
  );

  for (const b of existingBookings) {
    if (b.id === candidate.id) continue;
    if (candidate.hall_id && b.hall_id && b.hall_id !== candidate.hall_id) continue;
    if (b.deleted_at || b.status === 'Cancelled') continue;
    if (!doFloorsOverlap(candidate.floors, b.floors)) continue;

    const [exStart, exEnd] = bookingIntervalEpochMinutes(b.event_date, b.start_time, b.end_time);

    if (candStart < exEnd + safeBuffer && exStart < candEnd + safeBuffer) {
      return b;
    }
  }
  return null;
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const wa = toWhatsAppNumber(phone);
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
