import {
  AppDatabase,
  ChargeCatalogItem,
  ChargeCategory,
  EventTypeItem,
  ExpenseCategory,
  HallSettings,
} from '../types';

export const HALL_LOGO_SRC = '/src/assets/images/marquee_logo_1795763096758.jpg';
export const DEFAULT_HALL_ID = '11111111-1111-4111-8111-111111111101';

export function createDefaultHallSettings(hallId: string, overrides?: Partial<HallSettings>): HallSettings {
  const year = new Date().getFullYear();
  return {
    id: `set-${hallId}`,
    hall_id: hallId,
    hall_name: overrides?.hall_name || 'Marquee 1',
    hall_name_ur: overrides?.hall_name_ur || 'مارکی 1 بینکوئٹ ہال',
    address: overrides?.address || 'Plot 14-C, Main Shahrah-e-Faisal, Block 6 PECHS, Karachi',
    address_ur: overrides?.address_ur || 'پلاٹ 14-سی، مین شاہراہِ فیصل، بلاک 6 پی ای سی ایچ ایس، کراچی',
    phone: overrides?.phone || '0300-2198844',
    email: overrides?.email || 'bookings@marquee1.pk',
    logo_url: overrides?.logo_url ?? HALL_LOGO_SRC,
    invoice_format: overrides?.invoice_format || 'INV-{YYYY}-{0000}',
    tax_percent: 0,
    default_rent_first: 180000,
    default_rent_second: 165000,
    default_rent_third: 150000,
    default_rent_full: 450000,
    weekday_weekend_rates: {
      First: { weekday: 165000, weekend: 195000 },
      Second: { weekday: 150000, weekend: 180000 },
      Third: { weekday: 135000, weekend: 165000 },
      'Full Hall': { weekday: 410000, weekend: 480000 },
    },
    rent_seasons: [
      {
        id: `sea-wedding-${hallId}`,
        name: 'Wedding Peak Season',
        start_date: `${year}-11-01`,
        end_date: `${year + 1}-02-28`,
        rates: {
          First: { weekday: 190000, weekend: 225000 },
          Second: { weekday: 175000, weekend: 205000 },
          Third: { weekday: 155000, weekend: 185000 },
          'Full Hall': { weekday: 470000, weekend: 540000 },
        },
      },
      {
        id: `sea-off-${hallId}`,
        name: 'Summer Off-Season',
        start_date: `${year}-05-01`,
        end_date: `${year}-08-31`,
        rates: {
          First: { weekday: 145000, weekend: 170000 },
          Second: { weekday: 135000, weekend: 155000 },
          Third: { weekday: 120000, weekend: 140000 },
          'Full Hall': { weekday: 360000, weekend: 420000 },
        },
      },
    ],
    crate_deduction_per_returned: 180,
    cleaning_buffer_minutes: 60,
    late_grace_minutes: 60,
    hide_discount_reason_on_invoice: false,
    terms_en:
      '1. 50% advance is required to confirm booking. 2. Remaining balance must be cleared 7 days prior to event date. 3. Returned cold drink crates are credited after deducting PKR 180/crate for ice and handling. 4. Management is not responsible for personal valuables.',
    terms_ur:
      '1۔ بکنگ کنفرم کرنے کے لیے 50 فیصد پیشگی ادائیگی لازمی ہے۔ 2۔ بقیہ رقم تقریب سے 7 روز قبل ادا کرنا ہوگی۔ 3۔ واپس کی گئی کولڈ ڈرنک کریٹس پر 180 روپے فی کریٹ برف اور ہینڈلنگ منہا کر کے رقم بل سے کم کی جائے گی۔ 4۔ ذاتی قیمتی اشیاء کی حفاظت مہمانوں کی اپنی ذمہ داری ہوگی۔',
    default_language: 'en',
    ...overrides,
  };
}

export function createEmptyDatabase(): AppDatabase {
  const defaultSettings = createDefaultHallSettings(DEFAULT_HALL_ID);
  return {
    halls: [],
    hallSettings: [],
    settings: defaultSettings,
    perHallSequences: {},
    sequences: { booking: 0, invoice: 0, receipt: 0 },
    profiles: [],
    userPermissions: [],
    customers: [],
    eventTypes: [],
    chargeCategories: [],
    chargesCatalog: [],
    bookings: [],
    invoices: [],
    bookingItems: [],
    installments: [],
    payments: [],
    expenseCategories: [],
    employees: [],
    attendance: [],
    advances: [],
    expenses: [],
    dailyClosings: [],
    approvalRequests: [],
    auditLogs: [],
  };
}

export function createNewHallCatalogTemplates(
  hallId: string,
  makeId: () => string
): {
  eventTypes: EventTypeItem[];
  chargeCategories: ChargeCategory[];
  chargesCatalog: ChargeCatalogItem[];
  expenseCategories: ExpenseCategory[];
} {
  const eventTypes: EventTypeItem[] = [
    { id: makeId(), hall_id: hallId, name_en: 'Baraat', name_ur: 'بارات', color_hex: '#F59E0B', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Mayun', name_ur: 'مایوں', color_hex: '#EAB308', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Walima', name_ur: 'ولیمہ', color_hex: '#06B6D4', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Birthday', name_ur: 'سالگرہ', color_hex: '#EC4899', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Conference', name_ur: 'کانفرنس', color_hex: '#8B5CF6', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Seminar', name_ur: 'سیمینار', color_hex: '#10B981', is_default: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Other', name_ur: 'دیگر تقریب', color_hex: '#64748B', is_default: true, deleted_at: null },
  ];

  const ccDefaultId = makeId();
  const ccDecorId = makeId();
  const ccServicesId = makeId();
  const ccBeveragesId = makeId();
  const ccOutdoorId = makeId();

  const chargeCategories: ChargeCategory[] = [
    { id: ccDefaultId, hall_id: hallId, name_en: 'Default Package', name_ur: 'بنیادی پیکج', sort_order: 1, deleted_at: null },
    { id: ccDecorId, hall_id: hallId, name_en: 'Decor & Setup', name_ur: 'سجاوٹ اور سیٹ اپ', sort_order: 2, deleted_at: null },
    { id: ccServicesId, hall_id: hallId, name_en: 'Hall Services & Setup', name_ur: 'ہال سروسز اور سیٹ اپ', sort_order: 3, deleted_at: null },
    { id: ccBeveragesId, hall_id: hallId, name_en: 'Beverages', name_ur: 'مشروبات', sort_order: 4, deleted_at: null },
    { id: ccOutdoorId, hall_id: hallId, name_en: 'Outdoor & Add-ons', name_ur: 'آؤٹ ڈور اور اضافی سہولیات', sort_order: 5, deleted_at: null },
  ];

  const chargesCatalog: ChargeCatalogItem[] = [
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Couple Entry', name_ur: 'دولہا دلہن انٹری', default_rate: 0, unit_label: 'Package', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Smoke', name_ur: 'اسموک ایفیکٹ', default_rate: 0, unit_label: 'Package', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Lighting', name_ur: 'لائٹنگ سسٹم', default_rate: 0, unit_label: 'Package', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Sound', name_ur: 'ساؤنڈ سسٹم', default_rate: 0, unit_label: 'Package', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Partition', name_ur: 'پارٹیشن / پردہ', default_rate: 12000, unit_label: 'Unit', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Decoration', name_ur: 'اسٹیج ڈیکوریشن', default_rate: 45000, unit_label: 'Event', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Fresh Flowers', name_ur: 'تازہ پھولوں کی سجاوٹ', default_rate: 35000, unit_label: 'Event', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Artificial Flowers', name_ur: 'مصنوعی پھولوں کی سجاوٹ', default_rate: 18000, unit_label: 'Event', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccServicesId, name_en: 'Table Service', name_ur: 'ٹیبل سروس ویٹرز', default_rate: 15000, unit_label: 'Crew', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccServicesId, name_en: 'VIP Lounge Setup', name_ur: 'وی آئی پی لاؤنج سیٹ اپ', default_rate: 18000, unit_label: 'Setup', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccBeveragesId, name_en: 'Cold Drinks', name_ur: 'کولڈ ڈرنکس سروس', default_rate: 1600, unit_label: 'Crate', is_default_package: false, is_crate_service: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccOutdoorId, name_en: 'Outdoor Barbecue Space', name_ur: 'آؤٹ ڈور باربی کیو اسپیس', default_rate: 5000, unit_label: 'Event', is_default_package: false, deleted_at: null },
  ];

  const expenseCategories: ExpenseCategory[] = [
    { id: makeId(), hall_id: hallId, name_en: 'Sound', name_ur: 'ساؤنڈ سسٹم', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Decoration', name_ur: 'ڈیکوریشن', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Florist', name_ur: 'پھولوں کا خرچ', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Peon', name_ur: 'چپراسی / ہیلپر', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Sweeper', name_ur: 'سویپر / صفائی عملہ', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Waiters (Daily Wage)', name_ur: 'ویٹرز یومیہ اجرت', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Utilities', name_ur: 'بجلی و گیس بل', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Cleaning', name_ur: 'صفائی ستھرائی', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Maintenance', name_ur: 'مرمت و دیکھ بھال', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Salaries', name_ur: 'ماہانہ تنخواہیں', deleted_at: null },
    { id: makeId(), hall_id: hallId, name_en: 'Other', name_ur: 'دیگر اخراجات', deleted_at: null },
  ];

  return { eventTypes, chargeCategories, chargesCatalog, expenseCategories };
}
