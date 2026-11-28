import {
  AppDatabase,
  ChargeCatalogItem,
  ChargeCategory,
  EventCategory,
  EventTypeItem,
  ExpenseCategory,
  ExpenseSubcategory,
  FloorConfig,
  Hall,
  HallSettings,
} from '../types';

export const HALL_LOGO_SRC = '/src/assets/images/marquee_logo_1795763096758.jpg';
export const DEFAULT_HALL_ID = '11111111-1111-4111-8111-111111111101';

export function createDefaultHallRecord(hallId = DEFAULT_HALL_ID, overrides?: Partial<Hall>): Hall {
  const now = new Date().toISOString();
  return {
    id: hallId,
    name: 'Marquee 1',
    name_ur: 'مارکی 1 بینکوئٹ ہال',
    tagline_en: 'Luxury Banquet & Event Venue',
    tagline_ur: 'لگژری بینکوئٹ اور ایونٹ ہال',
    address: 'Plot 14-C, Main Shahrah-e-Faisal, Block 6 PECHS, Karachi',
    address_ur: 'پلاٹ 14-سی، مین شاہراہِ فیصل، بلاک 6 پی ای سی ایچ ایس، کراچی',
    city: 'Karachi',
    phone: '0300-2198844',
    phone_secondary: '',
    whatsapp: '923002198844',
    email: 'bookings@marquee1.pk',
    website: '',
    facebook_url: '',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    x_url: '',
    google_maps_url: '',
    logo_url: HALL_LOGO_SRC,
    signature_url: '',
    ntn: '',
    strn: '',
    bank_account_title: '',
    bank_name: '',
    bank_iban: '',
    show_bank_details: false,
    invoice_footer_en: 'Thank you for choosing us for your memorable celebration.',
    invoice_footer_ur: 'اپنی یادگار تقریب کے لیے ہمارا انتخاب کرنے کا شکریہ۔',
    terms_en:
      '1. 50% advance is required to confirm booking. 2. Remaining balance must be cleared 7 days prior to event date. 3. Returned cold drink crates are credited after deducting PKR 180/crate for ice and handling. 4. Management is not responsible for personal valuables.',
    terms_ur:
      '1۔ بکنگ کنفرم کرنے کے لیے 50 فیصد پیشگی ادائیگی لازمی ہے۔ 2۔ بقیہ رقم تقریب سے 7 روز قبل ادا کرنا ہوگی۔ 3۔ واپس کی گئی کولڈ ڈرنک کریٹس پر 180 روپے فی کریٹ برف اور ہینڈلنگ منہا کر کے رقم بل سے کم کی جائے گی۔ 4۔ ذاتی قیمتی اشیاء کی حفاظت مہمانوں کی اپنی ذمہ داری ہوگی۔',
    booking_code_prefix: 'MQ1',
    invoice_prefix: 'INV',
    currency: 'PKR',
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function createDefaultFloorsForHall(hallId: string): FloorConfig[] {
  return [
    { id: `fl-1-${hallId}`, hall_id: hallId, floor_key: 'First', name_en: 'First Floor', name_ur: 'پہلا فلور', sort_order: 1 },
    { id: `fl-2-${hallId}`, hall_id: hallId, floor_key: 'Second', name_en: 'Second Floor', name_ur: 'دوسرا فلور', sort_order: 2 },
    { id: `fl-3-${hallId}`, hall_id: hallId, floor_key: 'Third', name_en: 'Third Floor', name_ur: 'تیسرا فلور', sort_order: 3 },
    { id: `fl-full-${hallId}`, hall_id: hallId, floor_key: 'Full Hall', name_en: 'Full Hall (All 3 Floors)', name_ur: 'مکمل ہال (تینوں فلور)', sort_order: 4 },
  ];
}

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
        name_ur: 'شادیوں کا پیک سیزن',
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
        name_ur: 'موسم گرما / آف سیزن',
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
    floors: [],
    hallSettings: [],
    settings: defaultSettings,
    perHallSequences: {},
    sequences: { booking: 0, invoice: 0, receipt: 0 },
    profiles: [],
    userPermissions: [],
    customers: [],
    eventCategories: [],
    eventTypes: [],
    chargeCategories: [],
    chargesCatalog: [],
    bookings: [],
    invoices: [],
    bookingItems: [],
    installments: [],
    payments: [],
    expenseCategories: [],
    expenseSubcategories: [],
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
  eventCategories: EventCategory[];
  eventTypes: EventTypeItem[];
  chargeCategories: ChargeCategory[];
  chargesCatalog: ChargeCatalogItem[];
  expenseCategories: ExpenseCategory[];
  expenseSubcategories: ExpenseSubcategory[];
  floors: FloorConfig[];
} {
  const evCatWedId = makeId();
  const evCatFamId = makeId();
  const evCatCorpId = makeId();
  const evCatOtherId = makeId();

  const eventCategories: EventCategory[] = [
    { id: evCatWedId, hall_id: hallId, name_en: 'Wedding Ceremony', name_ur: 'شادی کی تقریبات', sort_order: 1, is_active: true, deleted_at: null },
    { id: evCatFamId, hall_id: hallId, name_en: 'Family & Social', name_ur: 'خاندانی و سماجی تقریبات', sort_order: 2, is_active: true, deleted_at: null },
    { id: evCatCorpId, hall_id: hallId, name_en: 'Corporate', name_ur: 'کارپوریٹ تقریبات', sort_order: 3, is_active: true, deleted_at: null },
    { id: evCatOtherId, hall_id: hallId, name_en: 'Other', name_ur: 'دیگر', sort_order: 4, is_active: true, deleted_at: null },
  ];

  const eventTypes: EventTypeItem[] = [
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Baraat', name_ur: 'بارات', color_hex: '#F59E0B', is_default: true, sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Mayun', name_ur: 'مایوں', color_hex: '#EAB308', is_default: true, sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Mangni (Engagement)', name_ur: 'منگنی', color_hex: '#FB7185', is_default: true, sort_order: 3, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Nikah', name_ur: 'نکاح', color_hex: '#14B8A6', is_default: true, sort_order: 4, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Mehendi', name_ur: 'مہندی', color_hex: '#22C55E', is_default: true, sort_order: 5, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatWedId, name_en: 'Walima', name_ur: 'ولیمہ', color_hex: '#06B6D4', is_default: true, sort_order: 6, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatFamId, name_en: 'Birthday', name_ur: 'سالگرہ', color_hex: '#EC4899', is_default: true, sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatFamId, name_en: 'Aqiqah', name_ur: 'عقیقہ', color_hex: '#6366F1', is_default: true, sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatFamId, name_en: 'Anniversary', name_ur: 'سالگرہِ شادی', color_hex: '#F97316', is_default: true, sort_order: 3, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatCorpId, name_en: 'Conference', name_ur: 'کانفرنس', color_hex: '#8B5CF6', is_default: true, sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatCorpId, name_en: 'Seminar', name_ur: 'سیمینار', color_hex: '#10B981', is_default: true, sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatCorpId, name_en: 'Workshop', name_ur: 'ورکشاپ', color_hex: '#0EA5E9', is_default: true, sort_order: 3, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: evCatOtherId, name_en: 'Other', name_ur: 'دیگر', color_hex: '#64748B', is_default: true, sort_order: 1, is_active: true, deleted_at: null },
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
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Couple Entry', name_ur: 'دولہا دلہن انٹری', default_rate: 0, unit_label: 'Package', unit_label_ur: 'پیکج', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Smoke', name_ur: 'اسموک ایفیکٹ', default_rate: 0, unit_label: 'Package', unit_label_ur: 'پیکج', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Lighting', name_ur: 'لائٹنگ سسٹم', default_rate: 0, unit_label: 'Package', unit_label_ur: 'پیکج', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDefaultId, name_en: 'Sound', name_ur: 'ساؤنڈ سسٹم', default_rate: 0, unit_label: 'Package', unit_label_ur: 'پیکج', is_default_package: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Partition', name_ur: 'پارٹیشن / پردہ', default_rate: 12000, unit_label: 'Unit', unit_label_ur: 'یونٹ', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Decoration', name_ur: 'اسٹیج ڈیکوریشن', default_rate: 45000, unit_label: 'Event', unit_label_ur: 'تقریب', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Fresh Flowers', name_ur: 'تازہ پھولوں کی سجاوٹ', default_rate: 35000, unit_label: 'Event', unit_label_ur: 'تقریب', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccDecorId, name_en: 'Artificial Flowers', name_ur: 'مصنوعی پھولوں کی سجاوٹ', default_rate: 18000, unit_label: 'Event', unit_label_ur: 'تقریب', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccServicesId, name_en: 'Table Service', name_ur: 'ٹیبل سروس ویٹرز', default_rate: 15000, unit_label: 'Crew', unit_label_ur: 'عملہ', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccServicesId, name_en: 'VIP Lounge Setup', name_ur: 'وی آئی پی لاؤنج سیٹ اپ', default_rate: 18000, unit_label: 'Setup', unit_label_ur: 'سیٹ اپ', is_default_package: false, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccBeveragesId, name_en: 'Cold Drinks', name_ur: 'کولڈ ڈرنکس سروس', default_rate: 1600, unit_label: 'Crate', unit_label_ur: 'کریٹ', is_default_package: false, is_crate_service: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ccOutdoorId, name_en: 'Outdoor Barbecue Space', name_ur: 'آؤٹ ڈور باربی کیو اسپیس', default_rate: 5000, unit_label: 'Event', unit_label_ur: 'تقریب', is_default_package: false, deleted_at: null },
  ];

  const ecSalId = makeId();
  const ecDwId = makeId();
  const ecUtilId = makeId();
  const ecCleanId = makeId();
  const ecMaintId = makeId();
  const ecVendId = makeId();
  const ecOtherId = makeId();

  const expenseCategories: ExpenseCategory[] = [
    { id: ecSalId, hall_id: hallId, name_en: 'Salaries', name_ur: 'تنخواہیں', sort_order: 1, is_active: true, deleted_at: null },
    { id: ecDwId, hall_id: hallId, name_en: 'Daily Wages', name_ur: 'یومیہ اجرت', sort_order: 2, is_active: true, deleted_at: null },
    { id: ecUtilId, hall_id: hallId, name_en: 'Utilities', name_ur: 'بجلی، گیس اور یوٹیلیٹیز', sort_order: 3, is_active: true, deleted_at: null },
    { id: ecCleanId, hall_id: hallId, name_en: 'Cleaning', name_ur: 'صفائی ستھرائی', sort_order: 4, is_active: true, deleted_at: null },
    { id: ecMaintId, hall_id: hallId, name_en: 'Maintenance', name_ur: 'مرمت و دیکھ بھال', sort_order: 5, is_active: true, deleted_at: null },
    { id: ecVendId, hall_id: hallId, name_en: 'Vendors', name_ur: 'وینڈرز / ٹھیکیدار', sort_order: 6, is_active: true, deleted_at: null },
    { id: ecOtherId, hall_id: hallId, name_en: 'Other', name_ur: 'دیگر اخراجات', sort_order: 7, is_active: true, deleted_at: null },
  ];

  const expenseSubcategories: ExpenseSubcategory[] = [
    { id: makeId(), hall_id: hallId, category_id: ecSalId, name_en: 'Monthly Salaries', name_ur: 'ماہانہ تنخواہیں', sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecSalId, name_en: 'Advances', name_ur: 'ایڈوانس تنخواہ', sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecDwId, name_en: 'Waiters', name_ur: 'ویٹرز', sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecDwId, name_en: 'Helpers', name_ur: 'ہیلپرز', sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecUtilId, name_en: 'Electricity', name_ur: 'بجلی', sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecUtilId, name_en: 'Gas', name_ur: 'گیس', sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecUtilId, name_en: 'Water', name_ur: 'پانی', sort_order: 3, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecUtilId, name_en: 'Internet', name_ur: 'انٹرنیٹ', sort_order: 4, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecVendId, name_en: 'Sound', name_ur: 'ساؤنڈ سسٹم', sort_order: 1, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecVendId, name_en: 'Decoration', name_ur: 'ڈیکوریشن', sort_order: 2, is_active: true, deleted_at: null },
    { id: makeId(), hall_id: hallId, category_id: ecVendId, name_en: 'Florist', name_ur: 'پھولوں کا خرچ', sort_order: 3, is_active: true, deleted_at: null },
  ];

  const floors = createDefaultFloorsForHall(hallId);

  return {
    eventCategories,
    eventTypes,
    chargeCategories,
    chargesCatalog,
    expenseCategories,
    expenseSubcategories,
    floors,
  };
}
