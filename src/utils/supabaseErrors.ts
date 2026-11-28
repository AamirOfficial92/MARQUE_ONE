import { formatDateDisplay, formatPKR } from './formatters';
import { pickLocalized } from '../i18n/translations';
import type { Language } from '../types';
import type { NavTabId } from '../components/Layout';

export interface SaveFeedbackViewTarget {
  tab: NavTabId;
  bookingId?: string;
  subTab?: string;
}

export interface SaveToastItem {
  id: string;
  kind: 'success' | 'error';
  title: string;
  details: string;
  technicalCode?: string;
  viewTarget?: SaveFeedbackViewTarget;
  createdAt: number;
}

export interface MappedSaveError {
  messageEn: string;
  messageUr: string;
  technicalCode: string;
}

interface RawSupabaseLikeError {
  code?: string;
  status?: number | string;
  message?: string;
  details?: string;
  hint?: string;
  name?: string;
}

function extractRawError(err: unknown): RawSupabaseLikeError {
  if (!err) return {};
  if (typeof err === 'string') return { message: err };
  if (err instanceof Error) {
    const extra = err as Error & RawSupabaseLikeError;
    return {
      name: err.name,
      message: err.message,
      code: extra.code,
      status: extra.status,
      details: extra.details,
      hint: extra.hint,
    };
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    return {
      code: typeof obj.code === 'string' ? obj.code : undefined,
      status: typeof obj.status === 'number' || typeof obj.status === 'string' ? obj.status : undefined,
      message: typeof obj.message === 'string' ? obj.message : typeof obj.error === 'string' ? obj.error : undefined,
      details: typeof obj.details === 'string' ? obj.details : undefined,
      hint: typeof obj.hint === 'string' ? obj.hint : undefined,
      name: typeof obj.name === 'string' ? obj.name : undefined,
    };
  }
  return {};
}

export function mapSupabaseWriteError(err: unknown, contextHint?: string): MappedSaveError {
  const raw = extractRawError(err);
  const code = String(raw.code || '').toUpperCase();
  const statusStr = String(raw.status || '');
  const fullText = `${raw.message || ''} ${raw.details || ''} ${raw.hint || ''} ${contextHint || ''}`.toLowerCase();

  // 1. Booking double-booking / overlap (constraint, trigger P0001, exclusion 23P01, or message)
  if (
    code === '23P01' ||
    fullText.includes('overlap') ||
    fullText.includes('double-booking') ||
    fullText.includes('double booking') ||
    fullText.includes('time slot') ||
    fullText.includes('conflict') ||
    fullText.includes('already booked') ||
    fullText.includes('cleaning buffer')
  ) {
    return {
      messageEn: 'This time slot overlaps another booking on the same floor.',
      messageUr: 'یہ وقت اسی فلور پر دوسری بکنگ سے ٹکرا رہا ہے۔',
      technicalCode: code || 'BOOKING_OVERLAP',
    };
  }

  // 2. RLS / Permission denied / Zero rows updated due to RLS
  if (
    code === '42501' ||
    code === 'RLS_0_ROWS' ||
    statusStr === '401' ||
    statusStr === '403' ||
    fullText.includes('permission') ||
    fullText.includes('row-level security') ||
    fullText.includes('row level security') ||
    fullText.includes('not allowed') ||
    fullText.includes('unauthorized') ||
    fullText.includes('forbidden') ||
    fullText.includes('only super admin') ||
    fullText.includes('only hall admin') ||
    fullText.includes('cannot grant') ||
    fullText.includes('only create manager') ||
    fullText.includes('own hall')
  ) {
    return {
      messageEn: 'You do not have permission.',
      messageUr: 'آپ کو یہ تبدیلی کرنے کی اجازت نہیں ہے۔',
      technicalCode: code || (statusStr ? `HTTP_${statusStr}` : '42501'),
    };
  }

  // 3. Unique constraint violations (23505)
  if (
    code === '23505' ||
    fullText.includes('duplicate key') ||
    fullText.includes('already exists') ||
    fullText.includes('already registered') ||
    fullText.includes('unique constraint')
  ) {
    if (fullText.includes('booking_code')) {
      return {
        messageEn: 'The booking code already exists.',
        messageUr: 'یہ بکنگ کوڈ پہلے سے موجود ہے۔',
        technicalCode: code || '23505',
      };
    }
    if (fullText.includes('invoice_number') || fullText.includes('invoice')) {
      return {
        messageEn: 'The invoice number already exists.',
        messageUr: 'یہ انوائس نمبر پہلے سے موجود ہے۔',
        technicalCode: code || '23505',
      };
    }
    if (fullText.includes('receipt_number') || fullText.includes('receipt')) {
      return {
        messageEn: 'The receipt number already exists.',
        messageUr: 'یہ رسید نمبر پہلے سے موجود ہے۔',
        technicalCode: code || '23505',
      };
    }
    if (fullText.includes('email')) {
      return {
        messageEn: 'This email address already exists.',
        messageUr: 'یہ ای میل ایڈریس پہلے سے موجود ہے۔',
        technicalCode: code || '23505',
      };
    }
    return {
      messageEn: 'A duplicate record already exists.',
      messageUr: 'یہ ریکارڈ پہلے سے موجود ہے۔',
      technicalCode: code || '23505',
    };
  }

  // 4. NOT NULL violation (23502)
  if (
    code === '23502' ||
    fullText.includes('null value in column') ||
    fullText.includes('violates not-null constraint') ||
    fullText.includes('is required') ||
    fullText.includes('missing required')
  ) {
    return {
      messageEn: 'A required field is missing.',
      messageUr: 'ایک لازمی خانہ خالی ہے۔',
      technicalCode: code || '23502',
    };
  }

  // 5. Foreign key violation / blocked hard delete (23503)
  if (
    code === '23503' ||
    fullText.includes('foreign key') ||
    fullText.includes('hard delete is disabled')
  ) {
    return {
      messageEn: 'This record is linked to other data and cannot be deleted. Deactivate it instead.',
      messageUr: 'یہ ریکارڈ دوسرے ڈیٹا سے منسلک ہے اس لیے حذف نہیں کیا جا سکتا۔ اس کے بجائے غیر فعال کریں۔',
      technicalCode: code || '23503',
    };
  }

  // 6. Check constraint (23514)
  if (code === '23514' || fullText.includes('check constraint')) {
    return {
      messageEn: 'One of the entered values is outside the allowed range.',
      messageUr: 'درج کردہ قدروں میں سے کوئی قدر مقررہ حد سے باہر ہے۔',
      technicalCode: code || '23514',
    };
  }

  // 7. Invalid text representation (22P02)
  if (code === '22P02' || fullText.includes('invalid input syntax')) {
    return {
      messageEn: 'One of the entered values has an invalid format.',
      messageUr: 'درج کردہ معلومات کا فارمیٹ درست نہیں ہے۔',
      technicalCode: code || '22P02',
    };
  }

  // 8. Edge function / network / gateway failures
  if (
    raw.name === 'FunctionsFetchError' ||
    fullText.includes('failed to fetch') ||
    fullText.includes('failed to send a request') ||
    fullText.includes('networkerror') ||
    fullText.includes('function not reachable') ||
    fullText.includes('err_network')
  ) {
    return {
      messageEn: 'Could not reach the server. Please check your connection and try again.',
      messageUr: 'سرور سے رابطہ نہیں ہو سکا۔ براہِ کرم انٹرنیٹ کنکشن چیک کر کے دوبارہ کوشش کریں۔',
      technicalCode: code || raw.name || 'NETWORK',
    };
  }

  // 9. PGRST116 (0 rows on .single())
  if (code === 'PGRST116' || fullText.includes('0 rows')) {
    return {
      messageEn: 'You do not have permission or the record no longer exists.',
      messageUr: 'آپ کو اس ریکارڈ میں تبدیلی کی اجازت نہیں ہے یا ریکارڈ موجود نہیں ہے۔',
      technicalCode: code || 'PGRST116',
    };
  }

  // 10. Custom Postgres trigger / raised exception (P0001) or known message
  if (code === 'P0001' && raw.message) {
    return {
      messageEn: raw.message,
      messageUr: raw.message,
      technicalCode: 'P0001',
    };
  }

  return {
    messageEn:
      raw.message && raw.message.length < 140
        ? raw.message
        : 'Database could not save this change. Please check your entries and try again.',
    messageUr:
      'ڈیٹابیس اس تبدیلی کو محفوظ نہیں کر سکا۔ براہِ کرم تفصیلات چیک کر کے دوبارہ کوشش کریں۔',
    technicalCode: code || (statusStr ? `HTTP_${statusStr}` : 'ERR_WRITE'),
  };
}

export type SaveDetailAction =
  | 'created'
  | 'updated'
  | 'added'
  | 'deleted'
  | 'restored'
  | 'recorded'
  | 'cancelled'
  | 'approved'
  | 'rejected'
  | 'submitted'
  | 'received'
  | 'flagged'
  | 'activated'
  | 'deactivated'
  | 'reset'
  | 'imported'
  | 'saved';

const EN_VERBS: Record<SaveDetailAction, string> = {
  created: 'was created',
  updated: 'was updated',
  added: 'was added',
  deleted: 'was moved to Recycle Bin',
  restored: 'was restored',
  recorded: 'was recorded',
  cancelled: 'was cancelled',
  approved: 'was approved',
  rejected: 'was rejected',
  submitted: 'was submitted',
  received: 'was marked as received',
  flagged: 'was flagged for review',
  activated: 'was activated',
  deactivated: 'was deactivated',
  reset: 'was reset',
  imported: 'were imported',
  saved: 'was saved',
};

const UR_VERBS: Record<SaveDetailAction, string> = {
  created: 'بن گئی۔',
  updated: 'اپڈیٹ ہو گیا۔',
  added: 'شامل کر دیا گیا۔',
  deleted: 'ری سائیکل بن میں منتقل ہو گیا۔',
  restored: 'بحال ہو گیا۔',
  recorded: 'درج کر لیا گیا۔',
  cancelled: 'منسوخ کر دی گئی۔',
  approved: 'منظور کر لی گئی۔',
  rejected: 'مسترد کر دی گئی۔',
  submitted: 'جمع کر دی گئی۔',
  received: 'وصول شدہ قرار دی گئی۔',
  flagged: 'فرق کے نوٹ کے ساتھ نشان زد کر دی گئی۔',
  activated: 'فعال ہو گیا۔',
  deactivated: 'غیر فعال ہو گیا۔',
  reset: 'تبدیل کر دیا گیا۔',
  imported: 'امپورٹ کر دی گئیں۔',
  saved: 'محفوظ ہو گیا۔',
};

export function formatBookingSaveDetail(
  lang: Language,
  bookingCode: string,
  customerName: string,
  eventDate: string,
  action: 'created' | 'updated' | 'cancelled' | 'deleted' | 'restored'
): string {
  const dateStr = formatDateDisplay(eventDate, lang);
  const label = `${bookingCode} (${customerName}, ${dateStr})`;
  if (lang === 'ur') {
    if (action === 'created') return `بکنگ: ${label} بن گئی۔`;
    if (action === 'updated') return `بکنگ: ${label} اپڈیٹ ہو گئی۔`;
    if (action === 'cancelled') return `بکنگ: ${bookingCode} (${customerName}) منسوخ کر دی گئی۔`;
    if (action === 'deleted') return `بکنگ: ${bookingCode} (${customerName}) ری سائیکل بن میں منتقل ہو گئی۔`;
    return `بکنگ: ${bookingCode} (${customerName}) بحال ہو گئی۔`;
  }
  if (action === 'cancelled' || action === 'deleted' || action === 'restored') {
    return `Booking: ${bookingCode} (${customerName}) ${EN_VERBS[action]}.`;
  }
  return `Booking: ${label} ${EN_VERBS[action]}.`;
}

export function formatPaymentSaveDetail(
  lang: Language,
  amount: number,
  bookingCode: string,
  action: 'recorded' | 'deleted' | 'restored',
  receiptNumber?: string
): string {
  const amtText = formatPKR(amount);
  if (lang === 'ur') {
    if (action === 'recorded') {
      return `ادائیگی: بکنگ ${bookingCode} کے لیے ${amtText} درج کر لی گئی۔`;
    }
    if (action === 'deleted') {
      return `ادائیگی: رسید ${receiptNumber || ''} (${amtText}) ری سائیکل بن میں منتقل ہو گئی۔`;
    }
    return `ادائیگی: رسید ${receiptNumber || ''} (${amtText}) بحال ہو گئی۔`;
  }
  if (action === 'recorded') {
    return `Payment: ${amtText} for booking ${bookingCode} was recorded.`;
  }
  return `Payment: ${receiptNumber || ''} (${amtText}) ${EN_VERBS[action]}.`;
}

export function formatEntitySaveDetail(
  lang: Language,
  entityEn: string,
  entityUr: string,
  recordLabel: string,
  action: SaveDetailAction
): string {
  if (lang === 'ur') {
    return `${entityUr}: ${recordLabel} ${UR_VERBS[action]}`;
  }
  return `${entityEn}: ${recordLabel} ${EN_VERBS[action]}.`;
}

export function formatBilingualEntitySaveDetail(
  lang: Language,
  entityEn: string,
  entityUr: string,
  nameEn: string | null | undefined,
  nameUr: string | null | undefined,
  action: SaveDetailAction
): string {
  const label = pickLocalized(nameEn, nameUr, lang) || '—';
  return formatEntitySaveDetail(lang, entityEn, entityUr, label, action);
}
