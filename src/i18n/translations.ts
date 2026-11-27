import {
  BookingItem,
  ChargeCatalogItem,
  ChargeCategory,
  EventTypeItem,
  ExpenseCategory,
  FloorConfig,
  Language,
} from '../types';

export const TRANSLATIONS = {
  en: {
    appTitle: 'Marquee 1',
    appSubtitle: 'Hall Management System · Karachi',
    dashboard: 'Dashboard',
    calendar: 'Floor Calendar',
    bookings: 'Bookings',
    customers: 'Customers',
    payments: 'Payments & Receipts',
    invoices: 'Invoices',
    dailyClosing: 'Daily Closing',
    catalog: 'Services & Charges Catalog',
    approvals: 'Approvals',
    expenses: 'Expenses',
    employees: 'Employees',
    attendance: 'Attendance',
    salaries: 'Salaries & Advances',
    reports: 'Reports',
    reminders: 'Reminders',
    importData: 'Backup & Import',
    recycleBin: 'Recycle Bin',
    auditLog: 'Audit Log',
    users: 'Users',
    settings: 'Settings',
    more: 'More',
    searchPlaceholder: 'Search booking code, customer, phone, NIC, or date...',
    newBooking: 'New Booking',
    todayEvents: "Today's Events",
    monthIncome: 'Monthly Income',
    monthExpenses: 'Monthly Expenses',
    netProfit: 'Net Profit',
    outstandingBalance: 'Outstanding Balances',
    upcomingEvents7d: 'Upcoming Events (Next 7 Days)',
    upcomingDue: 'Upcoming & Overdue Installments',
    sendReminder: 'Send Reminder',
    whatsApp: 'WhatsApp',
    email: 'Email',
    printPdf: 'Print / PDF',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Move to Bin',
    restore: 'Restore',
    actions: 'Actions',
    status: 'Status',
    floors: 'Floors',
    firstFloor: 'First Floor',
    secondFloor: 'Second Floor',
    thirdFloor: 'Third Floor',
    fullHall: 'Full Hall (All 3 Floors)',
    customerName: 'Customer Name',
    address: 'Address',
    phone: 'Mobile Phone',
    nic: 'CNIC Number',
    eventType: 'Event Type',
    eventDate: 'Event Date',
    bookingDate: 'Booking Date (Fixed)',
    startTime: 'Start Time',
    endTime: 'End Time',
    guests: 'Guests',
    hallRent: 'Hall Rent (PKR)',
    notes: 'Notes',
    inspectionNotes: 'Hall Inspection Notes',
    cratesTitle: 'Cold Drink Crates & Return Reversal',
    cratesOrdered: 'Crates Ordered',
    cratesUsed: 'Crates Used',
    cratesReturned: 'Crates Returned',
    crateRate: 'Rate / Crate',
    crateHandling: 'Ice & Handling Deduction / Crate',
    crateCredit: 'Net Credit Reversed',
    defaultPackageIncluded: 'Default Package (Included)',
    addChargeItem: 'Add Charge Item',
    totalBill: 'Final Agreed Total',
    standardTotal: 'Standard Total',
    specialDiscount: 'Special Discount',
    paidAmount: 'Paid',
    remainingBalance: 'Remaining Balance',
    cancelBooking: 'Cancel Booking',
    bookingProfit: 'Booking Profit',
    downloadBackup: 'Download Backup',
    logout: 'Sign Out',
    loginTitle: 'Staff Sign In',
    role: 'Role',
    noRecords: 'No records found matching your criteria.',
    conflictPrefix: 'Double-booking blocked:',
    overdue: 'Overdue',
    dueSoon: 'Due Soon',
    supabaseLiveBadge: 'Supabase Live Connected',
    theme: 'Theme',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    systemDefault: 'System Default',
    appearance: 'Appearance & Theme',
    activeHall: 'Active Hall',
    allHalls: 'All Halls',
    // Language & Localization helpers
    languageLabel: 'Language',
    englishName: 'English',
    urduName: 'Urdu',
    switchToOtherLang: 'Urdu',
    missingTranslationWarn: 'Missing English or Urdu translation. Please fill both in admin settings.',
    // Auth & App Shell
    appNotConfiguredTitle: 'App is not configured',
    appNotConfiguredDesc: 'App is not configured. Please contact the administrator.',
    signInSubtitle: 'Sign in with your Supabase staff account to manage halls, bookings, receipts, and finances.',
    emailAddress: 'Email Address',
    passwordLabel: 'Password',
    signingIn: 'Signing in...',
    signInBtn: 'Sign In',
    passwordRequiredNotice: 'Sign-in requires a verified staff email and password. Contact your Super Admin or Hall Admin for credentials.',
    missingProfileNotice: 'Your account signed in, but no active staff profile row was found. Contact your Super Admin.',
    roleScopeNotice: 'You have read-only permission for this screen. Create and edit actions require Edit rights.',
    switchingLanguageSaved: 'Language preference saved.',
    close: 'Close',
    // Invoice & Receipt
    officialInvoice: 'Official Invoice',
    billTo: 'Bill To',
    eventSchedule: 'Event Schedule',
    invoiceNoLabel: 'Invoice No:',
    bookingCodeLabel: 'Booking Code:',
    issueDateLabel: 'Issue Date:',
    bookingDateLabel: 'Booking Date:',
    eventDateLabel: 'Event Date:',
    eventTypeLabel: 'Event Type:',
    timingLabel: 'Timing:',
    floorsLabel: 'Floors:',
    guestsLabel: 'Guests:',
    descriptionCol: 'Description',
    qtyCol: 'Qty',
    rateCol: 'Rate',
    amountCol: 'Amount',
    hallRentLineDesc: 'Banquet Hall Rent & Utilities',
    coldDrinksServiceDesc: 'Cold Drinks Service',
    lateChargeOvertimeLine: 'Late Charge / Overtime Fee',
    rescheduleFeeLine: 'Event Reschedule Fee',
    paymentsReceived: 'Payments Received',
    receiptCol: 'Receipt',
    dateCol: 'Date',
    modeCol: 'Mode',
    referenceCol: 'Reference',
    subtotalAfterDiscount: 'Subtotal After Discount',
    taxLabel: 'Tax',
    finalAgreedTotal: 'Final Agreed Total',
    totalPaidLabel: 'Total Paid',
    balanceDueLabel: 'Balance Due',
    termsAndConditions: 'Terms & Conditions',
    customerSignature: 'Customer Signature',
    authorizedSignature: 'Authorized Management Signature',
    paymentReceiptTitle: 'Payment Receipt',
    receiptNoLabel: 'Receipt #:',
    receivedByLabel: 'Received By:',
    paidNowLabel: 'PAID NOW:',
    totalBillLabel: 'Total Bill:',
    thankYouReceipt: 'Thank you for choosing us.',
    printThermalReceipt: 'Print 80mm Receipt',
    shareWhatsApp: 'Share on WhatsApp',
    sendEmail: 'Send Email',
    // Common buttons & states
    all: 'All',
    active: 'Active',
    inactive: 'Inactive',
    view: 'View',
    create: 'Create',
    update: 'Update',
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading...',
    saving: 'Saving...',
    creating: 'Creating...',
    updating: 'Updating...',
    weekday: 'Weekday',
    weekend: 'Weekend',
    standardRate: 'Standard Rate',
    // Dashboard
    activeBookingsLabel: 'Active Bookings',
    upcoming7dSub: 'events in next 7 days',
    revenueVsExpenses: '6-Month Revenue vs Expenses',
    incomeLegend: 'Income',
    expensesLegend: 'Expenses',
    viewAll: 'View All',
    noEventsToday: 'No events scheduled for today.',
    noInstallmentsDue: 'No pending or overdue installments.',
    allHallsAggregate: 'All Halls Aggregate',
    // Reports
    financialReportsTitle: 'Financial Reports & A4 Statements',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    custom: 'Custom',
    fromLabel: 'From',
    toLabel: 'To',
    exportExcelCsv: 'Export Excel / CSV',
    collectedIncome: 'Collected Income',
    totalExpensesLabel: 'Total Expenses',
    discountsGiven: 'Special Discounts Given',
    byEventType: 'Income by Event Type',
    byChargeCategory: 'Billed Items by Category',
    byExpenseCategory: 'Expenses by Category',
    a4StatementSubtitle: 'Official Financial Statement',
    preparedBy: 'Prepared By',
    generatedOn: 'Generated On',
    noDataInPeriod: 'No financial records found in the selected period.',
    // Settings & Catalog
    hallProfileTab: 'Hall Profile & Terms',
    pricingRatesTab: 'Pricing, Floors & Late Rules',
    eventTypesTab: 'Event Types',
    catalogTab: 'Charges & Categories',
    hallsManageTab: 'Manage Halls',
    floorLabelsTitle: 'Floor Labels (English & Urdu)',
    englishLabel: 'English Name',
    urduLabel: 'Urdu Name',
    editItem: 'Edit Item',
    updateItem: 'Update Item',
    addNew: 'Add New',
  },
  ur: {
    appTitle: 'مارکی 1',
    appSubtitle: 'ہال مینجمنٹ سسٹم · کراچی',
    dashboard: 'ڈیش بورڈ',
    calendar: 'فلور کیلنڈر',
    bookings: 'بکنگز',
    customers: 'گاہک',
    payments: 'ادائیگیاں اور رسیدیں',
    invoices: 'انوائسز',
    dailyClosing: 'روزانہ کیش کلوزنگ',
    catalog: 'سروسز و چارجز کیٹلاگ',
    approvals: 'منظوریاں',
    expenses: 'اخراجات',
    employees: 'ملازمین',
    attendance: 'حاضری',
    salaries: 'تنخواہیں اور ایڈوانس',
    reports: 'مالی رپورٹس',
    reminders: 'یاددہانیاں',
    importData: 'بیک اپ اور امپورٹ',
    recycleBin: 'ری سائیکل بن',
    auditLog: 'آڈٹ لاگ',
    users: 'صارفین',
    settings: 'سیٹنگز',
    more: 'مزید',
    searchPlaceholder: 'بکنگ کوڈ، نام، فون، شناختی کارڈ یا تاریخ سے تلاش کریں...',
    newBooking: 'نئی بکنگ',
    todayEvents: 'آج کی تقریبات',
    monthIncome: 'ماہانہ آمدنی',
    monthExpenses: 'ماہانہ اخراجات',
    netProfit: 'خالص منافع',
    outstandingBalance: 'واجب الادا بقایا جات',
    upcomingEvents7d: 'آئندہ 7 دن کی تقریبات',
    upcomingDue: 'آنے والی اور واجب الادا اقساط',
    sendReminder: 'یاددہانی بھیجیں',
    whatsApp: 'واٹس ایپ',
    email: 'ای میل',
    printPdf: 'پرنٹ / پی ڈی ایف',
    save: 'محفوظ کریں',
    cancel: 'منسوخ کریں',
    edit: 'ترمیم',
    delete: 'بن میں منتقل کریں',
    restore: 'بحال کریں',
    actions: 'عمل',
    status: 'حالت',
    floors: 'فلورز',
    firstFloor: 'پہلا فلور',
    secondFloor: 'دوسرا فلور',
    thirdFloor: 'تیسرا فلور',
    fullHall: 'مکمل ہال (تینوں فلور)',
    customerName: 'گاہک کا نام',
    address: 'پتہ',
    phone: 'موبائل نمبر',
    nic: 'شناختی کارڈ نمبر',
    eventType: 'تقریب کی قسم',
    eventDate: 'تقریب کی تاریخ',
    bookingDate: 'بکنگ کی تاریخ (مستقل)',
    startTime: 'آغاز کا وقت',
    endTime: 'اختتام کا وقت',
    guests: 'مہمانوں کی تعداد',
    hallRent: 'ہال کرایہ (روپے)',
    notes: 'مزید تفصیلات',
    inspectionNotes: 'ہال معائنہ نوٹس',
    cratesTitle: 'کولڈ ڈرنک کریٹس اور واپسی ایڈجسٹمنٹ',
    cratesOrdered: 'آرڈر کردہ کریٹس',
    cratesUsed: 'استعمال شدہ کریٹس',
    cratesReturned: 'واپس شدہ کریٹس',
    crateRate: 'فی کریٹ قیمت',
    crateHandling: 'فی کریٹ برف و ہینڈلنگ کٹوتی',
    crateCredit: 'بل سے کم کی گئی رقم',
    defaultPackageIncluded: 'بنیادی پیکج (شامل ہے)',
    addChargeItem: 'اضافی چارج شامل کریں',
    totalBill: 'حتمی طے شدہ بل',
    standardTotal: 'معیاری کل بل',
    specialDiscount: 'خصوصی رعایت',
    paidAmount: 'وصول شدہ رقم',
    remainingBalance: 'بقایا رقم',
    cancelBooking: 'بکنگ منسوخ کریں',
    bookingProfit: 'بکنگ منافع',
    downloadBackup: 'مکمل بیک اپ ڈاؤن لوڈ',
    logout: 'لاگ آؤٹ',
    loginTitle: 'عملہ لاگ ان',
    role: 'عہدہ / اختیار',
    noRecords: 'کوئی ریکارڈ دستیاب نہیں ہے۔',
    conflictPrefix: 'ڈبل بکنگ کی ممانعت:',
    overdue: 'تاخیر شدہ',
    dueSoon: 'جلد واجب الادا',
    supabaseLiveBadge: 'لائیو ڈیٹابیس منسلک',
    theme: 'تھیم',
    darkMode: 'ڈارک موڈ',
    lightMode: 'لائٹ موڈ',
    systemDefault: 'سسٹم ڈیفالٹ',
    appearance: 'ظاہری شکل اور تھیم',
    activeHall: 'فعال ہال',
    allHalls: 'تمام ہالز',
    // Language & Localization helpers
    languageLabel: 'زبان',
    englishName: 'انگریزی',
    urduName: 'اردو',
    switchToOtherLang: 'انگریزی',
    missingTranslationWarn: 'انگریزی یا اردو نام خالی ہے۔ براہِ کرم ایڈمن سیٹنگز میں دونوں زبانیں درج کریں۔',
    // Auth & App Shell
    appNotConfiguredTitle: 'ایپ سیٹ اپ مکمل نہیں ہے',
    appNotConfiguredDesc: 'ایپ سیٹ اپ مکمل نہیں ہے۔ براہِ کرم منتظم سے رابطہ کریں۔',
    signInSubtitle: 'ہال، بکنگز، رسیدیں اور مالی حسابات سنبھالنے کے لیے اپنے عملے کے اکاؤنٹ سے سائن ان کریں۔',
    emailAddress: 'ای میل ایڈریس',
    passwordLabel: 'پاس ورڈ',
    signingIn: 'سائن ان ہو رہا ہے...',
    signInBtn: 'سائن ان کریں',
    passwordRequiredNotice: 'سائن ان کے لیے تصدیق شدہ ای میل اور پاس ورڈ لازمی ہے۔ لاگ ان تفصیلات کے لیے سپر ایڈمن یا ہال ایڈمن سے رابطہ کریں۔',
    missingProfileNotice: 'آپ کا لاگ ان کامیاب رہا، لیکن آپ کا عملہ پروفائل موجود نہیں ہے۔ براہِ کرم سپر ایڈمن سے رابطہ کریں۔',
    roleScopeNotice: 'آپ کو اس اسکرین کو صرف دیکھنے کی اجازت ہے۔ نیا اندراج یا تبدیلی کے لیے ترمیم کا اختیار درکار ہے۔',
    switchingLanguageSaved: 'زبان کی ترجیح محفوظ کر لی گئی ہے۔',
    close: 'بند کریں',
    // Invoice & Receipt
    officialInvoice: 'سرکاری بل / انوائس',
    billTo: 'گاہک کی تفصیلات',
    eventSchedule: 'تقریب کی تفصیلات',
    invoiceNoLabel: 'بل نمبر:',
    bookingCodeLabel: 'بکنگ کوڈ:',
    issueDateLabel: 'تاریخ اجرا:',
    bookingDateLabel: 'بکنگ کی تاریخ:',
    eventDateLabel: 'تقریب کی تاریخ:',
    eventTypeLabel: 'تقریب کی قسم:',
    timingLabel: 'وقت:',
    floorsLabel: 'فلورز:',
    guestsLabel: 'مہمان:',
    descriptionCol: 'تفصیل',
    qtyCol: 'تعداد',
    rateCol: 'ریٹ',
    amountCol: 'رقم',
    hallRentLineDesc: 'بینکوئٹ ہال کرایہ اور بنیادی سہولیات',
    coldDrinksServiceDesc: 'کولڈ ڈرنکس سروس',
    lateChargeOvertimeLine: 'تاخیر چارجز / اضافی وقت فیس',
    rescheduleFeeLine: 'تاریخ تبدیلی فیس',
    paymentsReceived: 'وصول شدہ ادائیگیاں',
    receiptCol: 'رسید نمبر',
    dateCol: 'تاریخ',
    modeCol: 'طریقہ',
    referenceCol: 'حوالہ نمبر',
    subtotalAfterDiscount: 'رعایت کے بعد ذیلی کل',
    taxLabel: 'ٹیکس',
    finalAgreedTotal: 'حتمی طے شدہ کل بل',
    totalPaidLabel: 'وصول شدہ رقم',
    balanceDueLabel: 'واجب الادا بقایا رقم',
    termsAndConditions: 'شرائط و ضوابط',
    customerSignature: 'دستخط گاہک',
    authorizedSignature: 'دستخط مجاز افسر',
    paymentReceiptTitle: 'رسیدِ ادائیگی',
    receiptNoLabel: 'رسید نمبر:',
    receivedByLabel: 'وصول کنندہ:',
    paidNowLabel: 'ابھی ادا شدہ رقم:',
    totalBillLabel: 'کل بل:',
    thankYouReceipt: 'ہمیں منتخب کرنے کا شکریہ۔',
    printThermalReceipt: '80 ملی میٹر رسید پرنٹ کریں',
    shareWhatsApp: 'واٹس ایپ پر بھیجیں',
    sendEmail: 'ای میل بھیجیں',
    // Common buttons & states
    all: 'تمام',
    active: 'فعال',
    inactive: 'غیر فعال',
    view: 'دیکھیں',
    create: 'بنائیں',
    update: 'اپڈیٹ کریں',
    submit: 'جمع کرائیں',
    approve: 'منظور کریں',
    reject: 'مسترد کریں',
    yes: 'ہاں',
    no: 'نہیں',
    loading: 'لوڈ ہو رہا ہے...',
    saving: 'محفوظ ہو رہا ہے...',
    creating: 'بنایا جا رہا ہے...',
    updating: 'اپڈیٹ ہو رہا ہے...',
    weekday: 'عام دن',
    weekend: 'ویک اینڈ',
    standardRate: 'معیاری نرخ',
    // Dashboard
    activeBookingsLabel: 'فعال بکنگز',
    upcoming7dSub: 'آئندہ 7 دن میں تقریبات',
    revenueVsExpenses: '6 ماہ کی آمدنی بمقابلہ اخراجات',
    incomeLegend: 'آمدنی',
    expensesLegend: 'اخراجات',
    viewAll: 'سب دیکھیں',
    noEventsToday: 'آج کوئی تقریب شیڈول نہیں ہے۔',
    noInstallmentsDue: 'کوئی واجب الادا قسط موجود نہیں ہے۔',
    allHallsAggregate: 'تمام ہالز کا مجموعہ',
    // Reports
    financialReportsTitle: 'مالی رپورٹس اور اے-4 اسٹیٹمنٹس',
    weekly: 'ہفتہ وار',
    monthly: 'ماہانہ',
    yearly: 'سالانہ',
    custom: 'مخصوص مدت',
    fromLabel: 'تاریخ سے',
    toLabel: 'تاریخ تک',
    exportExcelCsv: 'ایکسپورٹ ایکسل / سی ایس وی',
    collectedIncome: 'وصول شدہ آمدنی',
    totalExpensesLabel: 'کل اخراجات',
    discountsGiven: 'دی گئی خصوصی رعایت',
    byEventType: 'تقریب کی قسم کے لحاظ سے آمدنی',
    byChargeCategory: 'کیٹیگری کے لحاظ سے بل آئٹمز',
    byExpenseCategory: 'کیٹیگری کے لحاظ سے اخراجات',
    a4StatementSubtitle: 'سرکاری مالی رپورٹ',
    preparedBy: 'تیار کنندہ',
    generatedOn: 'تیاری کی تاریخ',
    noDataInPeriod: 'منتخب مدت میں کوئی مالی ریکارڈ موجود نہیں ہے۔',
    // Settings & Catalog
    hallProfileTab: 'ہال پروفائل اور شرائط',
    pricingRatesTab: 'کرایہ، فلورز اور تاخیر اصول',
    eventTypesTab: 'تقریبات کی اقسام',
    catalogTab: 'سروسز اور کیٹیگریز',
    hallsManageTab: 'ہالز کا انتظام',
    floorLabelsTitle: 'فلورز کے نام (انگریزی اور اردو)',
    englishLabel: 'انگریزی نام',
    urduLabel: 'اردو نام',
    editItem: 'ترمیم کریں',
    updateItem: 'اپڈیٹ کریں',
    addNew: 'نیا شامل کریں',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

export function tr(key: TranslationKey, lang: Language): string {
  return TRANSLATIONS[lang][key] || TRANSLATIONS.en[key];
}

/**
 * Strictly returns ONE language value matching `lang` with safe fallback to the non-empty alternate.
 */
export function pickLocalized(
  enValue: string | null | undefined,
  urValue: string | null | undefined,
  lang: Language
): string {
  const en = (enValue || '').trim();
  const ur = (urValue || '').trim();
  if (lang === 'ur') return ur || en;
  return en || ur;
}

/**
 * Returns true if an admin-managed bilingual pair is missing either English or Urdu.
 */
export function hasMissingBilingualPair(
  enValue: string | null | undefined,
  urValue: string | null | undefined
): boolean {
  return !(enValue || '').trim() || !(urValue || '').trim();
}

export function translateFloor(
  floor: string,
  lang: Language,
  floorConfigs?: FloorConfig[]
): string {
  const matched = (floorConfigs || []).find((f) => f.floor_key === floor);
  if (matched) {
    return pickLocalized(matched.name_en, matched.name_ur, lang);
  }
  if (lang !== 'ur') {
    switch (floor) {
      case 'Full Hall':
        return 'Full Hall (All 3 Floors)';
      case 'First':
        return 'First Floor';
      case 'Second':
        return 'Second Floor';
      case 'Third':
        return 'Third Floor';
      default:
        return floor;
    }
  }
  switch (floor) {
    case 'First':
      return 'پہلا فلور';
    case 'Second':
      return 'دوسرا فلور';
    case 'Third':
      return 'تیسرا فلور';
    case 'Full Hall':
      return 'مکمل ہال';
    default:
      return floor;
  }
}

export function translateEventType(
  eventTypeName: string,
  lang: Language,
  eventTypes?: EventTypeItem[]
): string {
  if (!eventTypeName) return '—';
  const norm = eventTypeName.trim().toLowerCase();
  const matched = (eventTypes || []).find(
    (et) =>
      et.name_en.trim().toLowerCase() === norm ||
      et.name_ur.trim().toLowerCase() === norm
  );
  if (matched) {
    return pickLocalized(matched.name_en, matched.name_ur, lang);
  }
  if (lang !== 'ur') return eventTypeName;
  const fallbackMap: Record<string, string> = {
    baraat: 'بارات',
    mayun: 'مایوں',
    walima: 'ولیمہ',
    mehndi: 'مہندی',
    nikkah: 'نکاح',
    birthday: 'سالگرہ',
    conference: 'کانفرنس',
    seminar: 'سیمینار',
    other: 'دیگر تقریب',
  };
  return fallbackMap[norm] || eventTypeName;
}

export function translateChargeCategoryName(
  categoryName: string,
  lang: Language,
  categories?: ChargeCategory[]
): string {
  if (!categoryName) return '—';
  const norm = categoryName.trim().toLowerCase();
  const matched = (categories || []).find(
    (c) =>
      c.name_en.trim().toLowerCase() === norm ||
      c.name_ur.trim().toLowerCase() === norm
  );
  if (matched) {
    return pickLocalized(matched.name_en, matched.name_ur, lang);
  }
  if (lang !== 'ur') return categoryName;
  const fallbackMap: Record<string, string> = {
    'hall rent': 'ہال کرایہ',
    'default package': 'بنیادی پیکج',
    'decor & setup': 'سجاوٹ اور سیٹ اپ',
    'hall services & setup': 'ہال سروسز اور سیٹ اپ',
    beverages: 'مشروبات',
    'outdoor & add-ons': 'آؤٹ ڈور اور اضافی سہولیات',
    'late charges': 'تاخیر چارجز',
    'reschedule fees': 'تاریخ تبدیلی فیس',
    general: 'عمومی',
  };
  return fallbackMap[norm] || categoryName;
}

export function translateExpenseCategoryName(
  categoryName: string,
  lang: Language,
  categories?: ExpenseCategory[],
  categoryId?: string | null,
  fallbackUr?: string | null
): string {
  const matched =
    (categoryId ? (categories || []).find((c) => c.id === categoryId) : undefined) ||
    (categories || []).find(
      (c) =>
        c.name_en.trim().toLowerCase() === (categoryName || '').trim().toLowerCase() ||
        c.name_ur.trim().toLowerCase() === (categoryName || '').trim().toLowerCase()
    );
  if (matched) {
    return pickLocalized(matched.name_en, matched.name_ur, lang);
  }
  if (lang === 'ur' && fallbackUr && fallbackUr.trim()) {
    return fallbackUr.trim();
  }
  return categoryName || '—';
}

export function translateBookingItemName(
  item: Pick<BookingItem, 'charge_id' | 'item_name' | 'item_name_ur'>,
  lang: Language,
  catalog?: ChargeCatalogItem[]
): string {
  const catalogMatch =
    (item.charge_id ? (catalog || []).find((c) => c.id === item.charge_id) : undefined) ||
    (catalog || []).find(
      (c) => c.name_en.trim().toLowerCase() === item.item_name.trim().toLowerCase()
    );
  const en = catalogMatch?.name_en || item.item_name;
  const ur = item.item_name_ur || catalogMatch?.name_ur || '';
  return pickLocalized(en, ur, lang);
}

export function translateUnitLabel(
  unit: string,
  lang: Language,
  unitUr?: string | null
): string {
  if (lang !== 'ur') return unit || 'Event';
  if (unitUr && unitUr.trim()) return unitUr.trim();
  const norm = (unit || '').trim().toLowerCase();
  const map: Record<string, string> = {
    event: 'تقریب',
    package: 'پیکج',
    unit: 'یونٹ',
    crew: 'عملہ',
    setup: 'سیٹ اپ',
    crate: 'کریٹ',
    hour: 'گھنٹہ',
    day: 'دن',
  };
  return map[norm] || unit || 'تقریب';
}

export function translateStatus(status: string, lang: Language): string {
  if (lang !== 'ur') return status;
  switch (status) {
    case 'Tentative':
      return 'عارضی';
    case 'Confirmed':
      return 'کنفرم';
    case 'Completed':
      return 'مکمل';
    case 'Cancelled':
      return 'منسوخ';
    default:
      return status;
  }
}

export function translateRole(role: string, lang: Language): string {
  if (lang === 'ur') {
    switch (role) {
      case 'super_admin':
        return 'سپر ایڈمن';
      case 'admin':
        return 'ہال ایڈمن';
      case 'manager':
        return 'ہال مینیجر';
      default:
        return role;
    }
  }
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Hall Admin';
    case 'manager':
      return 'Hall Manager';
    default:
      return role;
  }
}

export function translatePaymentMode(mode: string, lang: Language): string {
  if (lang !== 'ur') return mode;
  if (mode === 'Cash') return 'نقد (کیش)';
  if (mode === 'Online') return 'آن لائن / بینک';
  return mode;
}

export function translateAttendanceStatus(status: string, lang: Language): string {
  if (lang !== 'ur') return status;
  switch (status) {
    case 'Present':
      return 'حاضر';
    case 'Absent':
      return 'غیر حاضر';
    case 'Half-day':
      return 'نصف دن';
    case 'Leave':
      return 'رخصت';
    default:
      return status;
  }
}

export function translateApprovalType(type: string, lang: Language): string {
  if (lang === 'ur') {
    switch (type) {
      case 'discount':
        return 'خصوصی رعایت';
      case 'cancellation':
        return 'بکنگ منسوخی';
      case 'refund':
        return 'رقم واپسی';
      case 'reschedule_fee':
        return 'تاریخ تبدیلی فیس';
      case 'late_charge_override':
        return 'تاخیر چارج میں تبدیلی';
      default:
        return type;
    }
  }
  switch (type) {
    case 'discount':
      return 'Special Discount';
    case 'cancellation':
      return 'Cancellation';
    case 'refund':
      return 'Refund';
    case 'reschedule_fee':
      return 'Reschedule Fee';
    case 'late_charge_override':
      return 'Late Charge Override';
    default:
      return type;
  }
}

export function translateApprovalStatus(status: string, lang: Language): string {
  if (lang !== 'ur') {
    if (status === 'pending') return 'Pending';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return status;
  }
  if (status === 'pending') return 'زیرِ غور';
  if (status === 'approved') return 'منظور شدہ';
  if (status === 'rejected') return 'مسترد';
  return status;
}

export function translateClosingStatus(status: string, lang: Language): string {
  if (lang !== 'ur') {
    if (status === 'submitted') return 'Submitted';
    if (status === 'received') return 'Received';
    if (status === 'flagged') return 'Flagged';
    return status;
  }
  if (status === 'submitted') return 'جمع شدہ';
  if (status === 'received') return 'وصول شدہ';
  if (status === 'flagged') return 'فرق / نشاندہی شدہ';
  return status;
}

export function getWeekdayNames(lang: Language): string[] {
  if (lang === 'ur') {
    return ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
  }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}
