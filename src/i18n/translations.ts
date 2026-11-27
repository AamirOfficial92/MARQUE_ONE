import { Language } from '../types';

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
    previewModeBadge: 'Local Preview Storage',
    supabaseLiveBadge: 'Supabase Live Connected',
    theme: 'Theme',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    systemDefault: 'System Default',
    appearance: 'Appearance & Theme',
    activeHall: 'Active Hall',
    allHalls: 'All Halls',
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
    previewModeBadge: 'لوکل پری ویو اسٹوریج',
    supabaseLiveBadge: 'سوپابیس لائیو منسلک',
    theme: 'تھیم',
    darkMode: 'ڈارک موڈ',
    lightMode: 'لائٹ موڈ',
    systemDefault: 'سسٹم ڈیفالٹ',
    appearance: 'ظاہری شکل اور تھیم',
    activeHall: 'فعال ہال',
    allHalls: 'تمام ہالز',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

export function tr(key: TranslationKey, lang: Language): string {
  return TRANSLATIONS[lang][key] || TRANSLATIONS.en[key];
}

export function translateFloor(floor: string, lang: Language): string {
  if (lang !== 'ur') return floor === 'Full Hall' ? 'Full Hall' : `${floor} Floor`;
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
