import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, Printer, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import {
  isOtherOptionName,
  pickLocalized,
  tr,
  translateChargeCategoryName,
  translateEventCategoryName,
  translateEventType,
  translateExpenseCategoryName,
  translateExpenseSubcategoryName,
} from '../i18n/translations';
import {
  addDaysISO,
  calculateBookingFinancials,
  formatDateDisplay,
  formatPKR,
  todayISO,
} from '../utils/formatters';
import { SearchableSelect, SearchableSelectOption } from './SearchableSelect';

type RangePreset = 'weekly' | 'monthly' | 'yearly' | 'custom';

interface CustomNameBucket {
  name: string;
  count: number;
  total: number;
}

interface EventItemGroup {
  key: string;
  label: string;
  colorHex?: string;
  sortOrder: number;
  count: number;
  total: number;
  customEntries: CustomNameBucket[];
}

interface EventCategoryGroup {
  key: string;
  label: string;
  sortOrder: number;
  count: number;
  total: number;
  events: EventItemGroup[];
}

interface ExpenseManualBucket {
  name: string;
  count: number;
  amount: number;
}

interface ExpenseSubcategoryGroup {
  key: string;
  label: string;
  sortOrder: number;
  count: number;
  amount: number;
  manualEntries: ExpenseManualBucket[];
}

interface ExpenseCategoryGroup {
  key: string;
  label: string;
  sortOrder: number;
  count: number;
  amount: number;
  subcategories: ExpenseSubcategoryGroup[];
}

export const ReportsView: React.FC = () => {
  const { db, activeHall, lang, currentUser } = useApp();
  const isUr = lang === 'ur';
  const today = todayISO();
  const [preset, setPreset] = useState<RangePreset>('monthly');
  const [customStart, setCustomStart] = useState<string>(today.slice(0, 7) + '-01');
  const [customEnd, setCustomEnd] = useState<string>(today);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('ALL');
  const [expenseSubcategoryFilter, setExpenseSubcategoryFilter] = useState<string>('ALL');

  const hallName = pickLocalized(activeHall.name, activeHall.name_ur, lang);
  const hallTagline = pickLocalized(activeHall.tagline_en, activeHall.tagline_ur, lang);
  const hallAddressBase = pickLocalized(activeHall.address, activeHall.address_ur, lang);
  const hallAddress = [hallAddressBase, activeHall.city].filter(Boolean).join(', ');
  const logoSrc = activeHall.logo_url || db.settings.logo_url || HALL_LOGO_SRC;

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'weekly') {
      return { startDate: addDaysISO(today, -7), endDate: addDaysISO(today, 7) };
    }
    if (preset === 'monthly') {
      return { startDate: today.slice(0, 7) + '-01', endDate: addDaysISO(today, 31) };
    }
    if (preset === 'yearly') {
      return { startDate: today.slice(0, 4) + '-01-01', endDate: today.slice(0, 4) + '-12-31' };
    }
    return { startDate: customStart, endDate: customEnd };
  }, [preset, customStart, customEnd, today]);

  const activeExpenseCategories = useMemo(
    () =>
      db.expenseCategories
        .filter((c) => !c.deleted_at)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [db.expenseCategories]
  );

  const activeExpenseSubcategories = useMemo(
    () =>
      db.expenseSubcategories
        .filter((s) => !s.deleted_at)
        .filter((s) =>
          expenseCategoryFilter === 'ALL' ? true : s.category_id === expenseCategoryFilter
        )
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [db.expenseSubcategories, expenseCategoryFilter]
  );

  const expenseCategoryFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: 'ALL', label: tr('allCategories', lang) },
      ...activeExpenseCategories.map((c) => ({
        value: c.id,
        label: pickLocalized(c.name_en, c.name_ur, lang),
      })),
    ];
  }, [activeExpenseCategories, lang]);

  const expenseSubcategoryFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    return [
      { value: 'ALL', label: tr('allSubcategories', lang) },
      ...activeExpenseSubcategories.map((s) => {
        const parentCat = activeExpenseCategories.find((c) => c.id === s.category_id);
        return {
          value: s.id,
          label: pickLocalized(s.name_en, s.name_ur, lang),
          sublabel:
            expenseCategoryFilter === 'ALL' && parentCat
              ? pickLocalized(parentCat.name_en, parentCat.name_ur, lang)
              : undefined,
        };
      }),
    ];
  }, [activeExpenseSubcategories, activeExpenseCategories, expenseCategoryFilter, lang]);

  const handleExpenseCategoryFilterChange = (nextCatId: string) => {
    setExpenseCategoryFilter(nextCatId);
    if (nextCatId !== 'ALL' && expenseSubcategoryFilter !== 'ALL') {
      const subStillValid = db.expenseSubcategories.some(
        (s) => !s.deleted_at && s.id === expenseSubcategoryFilter && s.category_id === nextCatId
      );
      if (!subStillValid) {
        setExpenseSubcategoryFilter('ALL');
      }
    }
  };

  const reportData = useMemo(() => {
    const paymentsInRange = db.payments.filter(
      (p) => !p.deleted_at && p.payment_date >= startDate && p.payment_date <= endDate
    );
    const expensesInRange = db.expenses.filter((e) => {
      if (e.deleted_at || e.expense_date < startDate || e.expense_date > endDate) return false;
      if (expenseCategoryFilter !== 'ALL') {
        const catMatch =
          e.category_id === expenseCategoryFilter ||
          db.expenseCategories.some(
            (c) =>
              c.id === expenseCategoryFilter &&
              (c.name_en.trim().toLowerCase() === (e.category_name || '').trim().toLowerCase() ||
                c.name_ur.trim().toLowerCase() === (e.category_name || '').trim().toLowerCase())
          );
        if (!catMatch) return false;
      }
      if (expenseSubcategoryFilter !== 'ALL') {
        const subMatch =
          e.subcategory_id === expenseSubcategoryFilter ||
          db.expenseSubcategories.some(
            (s) =>
              s.id === expenseSubcategoryFilter &&
              (e.subcategory_name || '').trim().toLowerCase() === s.name_en.trim().toLowerCase()
          );
        if (!subMatch) return false;
      }
      return true;
    });
    const bookingsInRange = db.bookings.filter(
      (b) =>
        !b.deleted_at &&
        b.status !== 'Cancelled' &&
        b.event_date >= startDate &&
        b.event_date <= endDate
    );

    const totalIncome = paymentsInRange.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expensesInRange.reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = totalIncome - totalExpenses;

    // Two-level Event Category -> Event grouping (with custom names under 'Other')
    const eventCatMap = new Map<
      string,
      {
        key: string;
        label: string;
        sortOrder: number;
        count: number;
        total: number;
        eventsMap: Map<
          string,
          {
            key: string;
            label: string;
            colorHex?: string;
            sortOrder: number;
            count: number;
            total: number;
            customMap: Map<string, CustomNameBucket>;
          }
        >;
      }
    >();

    const byChargeCategory: Record<string, { label: string; amount: number }> = {
      'Hall Rent': {
        label: translateChargeCategoryName('Hall Rent', lang, db.chargeCategories),
        amount: 0,
      },
      'Late Charges': {
        label: translateChargeCategoryName('Late Charges', lang, db.chargeCategories),
        amount: 0,
      },
      'Reschedule Fees': {
        label: translateChargeCategoryName('Reschedule Fees', lang, db.chargeCategories),
        amount: 0,
      },
    };
    let totalDiscounts = 0;

    for (const bk of bookingsInRange) {
      const fin = calculateBookingFinancials(bk, db.bookingItems, db.payments, db.expenses);

      const matchedEt =
        (bk.event_type_id
          ? db.eventTypes.find((t) => t.id === bk.event_type_id)
          : undefined) ||
        db.eventTypes.find(
          (t) =>
            t.name_en.trim().toLowerCase() === (bk.event_type || '').trim().toLowerCase() ||
            t.name_ur.trim().toLowerCase() === (bk.event_type || '').trim().toLowerCase()
        );
      const matchedCat =
        (bk.event_category_id
          ? db.eventCategories.find((c) => c.id === bk.event_category_id)
          : undefined) ||
        (matchedEt?.category_id
          ? db.eventCategories.find((c) => c.id === matchedEt.category_id)
          : undefined) ||
        (isOtherOptionName(bk.event_type)
          ? db.eventCategories.find((c) => isOtherOptionName(c.name_en))
          : undefined);

      const catKey = matchedCat?.id || (isOtherOptionName(bk.event_type) ? '__other__' : '__uncat__');
      const catLabel = matchedCat
        ? pickLocalized(matchedCat.name_en, matchedCat.name_ur, lang)
        : isOtherOptionName(bk.event_type)
        ? isUr
          ? 'دیگر'
          : 'Other'
        : translateEventCategoryName('', lang, db.eventCategories, bk.event_category_id);
      const catSort = matchedCat?.sort_order ?? 999;

      let catGroup = eventCatMap.get(catKey);
      if (!catGroup) {
        catGroup = {
          key: catKey,
          label: catLabel,
          sortOrder: catSort,
          count: 0,
          total: 0,
          eventsMap: new Map(),
        };
        eventCatMap.set(catKey, catGroup);
      }
      catGroup.count += 1;
      catGroup.total += fin.grandTotal;

      const isOtherChoice =
        isOtherOptionName(bk.event_type) ||
        isOtherOptionName(matchedEt?.name_en) ||
        isOtherOptionName(matchedCat?.name_en);
      const customTypedName = (bk.event_other_name || '').trim();

      const eventKey = matchedEt?.id || (isOtherChoice ? '__other_event__' : bk.event_type || '—');
      const eventLabel = matchedEt
        ? pickLocalized(matchedEt.name_en, matchedEt.name_ur, lang)
        : isOtherChoice
        ? isUr
          ? 'دیگر'
          : 'Other'
        : translateEventType(bk.event_type, lang, db.eventTypes, null, bk.event_type_id);
      const eventSort = matchedEt?.sort_order ?? 999;

      let evGroup = catGroup.eventsMap.get(eventKey);
      if (!evGroup) {
        evGroup = {
          key: eventKey,
          label: eventLabel,
          colorHex: matchedEt?.color_hex,
          sortOrder: eventSort,
          count: 0,
          total: 0,
          customMap: new Map(),
        };
        catGroup.eventsMap.set(eventKey, evGroup);
      }
      evGroup.count += 1;
      evGroup.total += fin.grandTotal;

      if (isOtherChoice && customTypedName) {
        const existingCustom = evGroup.customMap.get(customTypedName);
        if (existingCustom) {
          existingCustom.count += 1;
          existingCustom.total += fin.grandTotal;
        } else {
          evGroup.customMap.set(customTypedName, {
            name: customTypedName,
            count: 1,
            total: fin.grandTotal,
          });
        }
      }

      byChargeCategory['Hall Rent'].amount += fin.hallRent;
      byChargeCategory['Late Charges'].amount += fin.lateCharge;
      byChargeCategory['Reschedule Fees'].amount += fin.rescheduleFeeTotal;
      totalDiscounts += fin.discountAmount;

      const items = db.bookingItems.filter((i) => i.booking_id === bk.id && !i.deleted_at);
      const hasColdDrinkLine = items.some(
        (i) => i.is_crate_service || i.item_name.toLowerCase().includes('cold drink')
      );
      if (!hasColdDrinkLine && fin.crateNet > 0) {
        if (!byChargeCategory['Beverages']) {
          byChargeCategory['Beverages'] = {
            label: translateChargeCategoryName('Beverages', lang, db.chargeCategories),
            amount: 0,
          };
        }
        byChargeCategory['Beverages'].amount += fin.crateNet;
      }
      for (const it of items) {
        const catLabelCharge = translateChargeCategoryName(
          it.category_name,
          lang,
          db.chargeCategories
        );
        if (!byChargeCategory[catLabelCharge]) {
          byChargeCategory[catLabelCharge] = { label: catLabelCharge, amount: 0 };
        }
        byChargeCategory[catLabelCharge].amount += Number(it.amount);
      }
    }

    const byEventHierarchy: EventCategoryGroup[] = Array.from(eventCatMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((cat) => ({
        key: cat.key,
        label: cat.label,
        sortOrder: cat.sortOrder,
        count: cat.count,
        total: cat.total,
        events: Array.from(cat.eventsMap.values())
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
          .map((ev) => ({
            key: ev.key,
            label: ev.label,
            colorHex: ev.colorHex,
            sortOrder: ev.sortOrder,
            count: ev.count,
            total: ev.total,
            customEntries: Array.from(ev.customMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name)
            ),
          })),
      }));

    // Two-level Expense Category -> Sub-category grouping
    const expenseCatMap = new Map<
      string,
      {
        key: string;
        label: string;
        sortOrder: number;
        count: number;
        amount: number;
        subMap: Map<
          string,
          {
            key: string;
            label: string;
            sortOrder: number;
            count: number;
            amount: number;
            manualMap: Map<string, ExpenseManualBucket>;
          }
        >;
      }
    >();

    for (const ex of expensesInRange) {
      const matchedCat =
        (ex.category_id
          ? db.expenseCategories.find((c) => c.id === ex.category_id)
          : undefined) ||
        db.expenseCategories.find(
          (c) =>
            c.name_en.trim().toLowerCase() === (ex.category_name || '').trim().toLowerCase() ||
            c.name_ur.trim().toLowerCase() === (ex.category_name || '').trim().toLowerCase()
        );
      const catKey =
        matchedCat?.id ||
        ex.category_id ||
        (ex.category_name || '').trim().toLowerCase() ||
        '__other_cat__';
      const catLabel = translateExpenseCategoryName(
        ex.category_name,
        lang,
        db.expenseCategories,
        ex.category_id,
        ex.category_name_ur
      );
      const catSort = matchedCat?.sort_order ?? 999;

      let catGroup = expenseCatMap.get(catKey);
      if (!catGroup) {
        catGroup = {
          key: catKey,
          label: catLabel,
          sortOrder: catSort,
          count: 0,
          amount: 0,
          subMap: new Map(),
        };
        expenseCatMap.set(catKey, catGroup);
      }
      catGroup.count += 1;
      catGroup.amount += Number(ex.amount);

      const matchedSub =
        (ex.subcategory_id
          ? db.expenseSubcategories.find((s) => s.id === ex.subcategory_id)
          : undefined) ||
        (ex.subcategory_name
          ? db.expenseSubcategories.find(
              (s) =>
                (!matchedCat || s.category_id === matchedCat.id) &&
                (s.name_en.trim().toLowerCase() === ex.subcategory_name!.trim().toLowerCase() ||
                  s.name_ur.trim().toLowerCase() === ex.subcategory_name!.trim().toLowerCase())
            )
          : undefined);

      const hasSub = Boolean(matchedSub || (ex.subcategory_name || '').trim());
      const subKey = hasSub
        ? matchedSub?.id || (ex.subcategory_name || '').trim().toLowerCase()
        : '__general__';
      const subLabel = hasSub
        ? translateExpenseSubcategoryName(
            ex.subcategory_name,
            lang,
            db.expenseSubcategories,
            ex.subcategory_id,
            ex.subcategory_name_ur
          )
        : isUr
        ? 'عمومی / براہِ راست'
        : 'General / Direct';
      const subSort = matchedSub?.sort_order ?? 999;

      let subGroup = catGroup.subMap.get(subKey);
      if (!subGroup) {
        subGroup = {
          key: subKey,
          label: subLabel,
          sortOrder: subSort,
          count: 0,
          amount: 0,
          manualMap: new Map(),
        };
        catGroup.subMap.set(subKey, subGroup);
      }
      subGroup.count += 1;
      subGroup.amount += Number(ex.amount);

      const manualText = (ex.manual_description || '').trim();
      if (manualText) {
        const existingManual = subGroup.manualMap.get(manualText);
        if (existingManual) {
          existingManual.count += 1;
          existingManual.amount += Number(ex.amount);
        } else {
          subGroup.manualMap.set(manualText, {
            name: manualText,
            count: 1,
            amount: Number(ex.amount),
          });
        }
      }
    }

    const byExpenseHierarchy: ExpenseCategoryGroup[] = Array.from(expenseCatMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((cat) => ({
        key: cat.key,
        label: cat.label,
        sortOrder: cat.sortOrder,
        count: cat.count,
        amount: cat.amount,
        subcategories: Array.from(cat.subMap.values())
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
          .map((sub) => ({
            key: sub.key,
            label: sub.label,
            sortOrder: sub.sortOrder,
            count: sub.count,
            amount: sub.amount,
            manualEntries: Array.from(sub.manualMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name)
            ),
          })),
      }));

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      totalDiscounts,
      paymentsCount: paymentsInRange.length,
      expensesCount: expensesInRange.length,
      bookingsCount: bookingsInRange.length,
      byEventHierarchy,
      byChargeCategory: Object.values(byChargeCategory).filter((v) => v.amount > 0),
      byExpenseHierarchy,
    };
  }, [
    db,
    startDate,
    endDate,
    lang,
    isUr,
    expenseCategoryFilter,
    expenseSubcategoryFilter,
  ]);

  const flattenedEventExportRows = useMemo(() => {
    const rows: Array<{
      category: string;
      event: string;
      customName: string;
      count: number;
      total: number;
    }> = [];
    for (const cat of reportData.byEventHierarchy) {
      for (const ev of cat.events) {
        if (ev.customEntries.length > 0) {
          for (const custom of ev.customEntries) {
            rows.push({
              category: cat.label,
              event: ev.label,
              customName: custom.name,
              count: custom.count,
              total: custom.total,
            });
          }
          const customCountSum = ev.customEntries.reduce((s, c) => s + c.count, 0);
          const customTotalSum = ev.customEntries.reduce((s, c) => s + c.total, 0);
          if (ev.count > customCountSum) {
            rows.push({
              category: cat.label,
              event: ev.label,
              customName: '—',
              count: ev.count - customCountSum,
              total: ev.total - customTotalSum,
            });
          }
        } else {
          rows.push({
            category: cat.label,
            event: ev.label,
            customName: '',
            count: ev.count,
            total: ev.total,
          });
        }
      }
    }
    return rows;
  }, [reportData.byEventHierarchy]);

  const flattenedExpenseExportRows = useMemo(() => {
    const rows: Array<{
      category: string;
      subcategory: string;
      description: string;
      count: number;
      amount: number;
    }> = [];
    for (const cat of reportData.byExpenseHierarchy) {
      for (const sub of cat.subcategories) {
        if (sub.manualEntries.length > 0) {
          for (const manual of sub.manualEntries) {
            rows.push({
              category: cat.label,
              subcategory: sub.label,
              description: manual.name,
              count: manual.count,
              amount: manual.amount,
            });
          }
          const manualCountSum = sub.manualEntries.reduce((s, m) => s + m.count, 0);
          const manualAmountSum = sub.manualEntries.reduce((s, m) => s + m.amount, 0);
          if (sub.count > manualCountSum) {
            rows.push({
              category: cat.label,
              subcategory: sub.label,
              description: '',
              count: sub.count - manualCountSum,
              amount: sub.amount - manualAmountSum,
            });
          }
        } else {
          rows.push({
            category: cat.label,
            subcategory: sub.label,
            description: '',
            count: sub.count,
            amount: sub.amount,
          });
        }
      }
    }
    return rows;
  }, [reportData.byExpenseHierarchy]);

  const handleExportCSV = () => {
    const rows = isUr
      ? [
          ['ہال', hallName],
          ['مدت', `${startDate} تا ${endDate}`],
          ['وصول شدہ آمدنی (PKR)', reportData.totalIncome],
          ['کل اخراجات (PKR)', reportData.totalExpenses],
          ['دی گئی خصوصی رعایت (PKR)', reportData.totalDiscounts],
          ['خالص منافع (PKR)', reportData.netProfit],
          [],
          ['ایونٹ کیٹیگری', 'ایونٹ / تقریب', 'مخصوص نام (دیگر)', 'تعداد', 'حتمی طے شدہ کل بل (PKR)'],
          ...flattenedEventExportRows.map((v) => [
            v.category,
            v.event,
            v.customName,
            v.count,
            v.total,
          ]),
          [],
          ['بل کیٹیگری', 'رقم (PKR)'],
          ...reportData.byChargeCategory.map((v) => [v.label, v.amount]),
          [],
          ['اخراجات کیٹیگری', 'ذیلی کیٹیگری', 'تفصیل', 'تعداد', 'رقم (PKR)'],
          ...flattenedExpenseExportRows.map((v) => [
            v.category,
            v.subcategory,
            v.description,
            v.count,
            v.amount,
          ]),
        ]
      : [
          ['Hall', hallName],
          ['Report Range', `${startDate} to ${endDate}`],
          ['Total Income (PKR)', reportData.totalIncome],
          ['Total Expenses (PKR)', reportData.totalExpenses],
          ['Special Discounts Given (PKR)', reportData.totalDiscounts],
          ['Net Profit (PKR)', reportData.netProfit],
          [],
          ['Event Category', 'Event', 'Custom Event Name', 'Count', 'Final Agreed Total (PKR)'],
          ...flattenedEventExportRows.map((v) => [
            v.category,
            v.event,
            v.customName,
            v.count,
            v.total,
          ]),
          [],
          ['Charge Category Breakdown', 'Amount (PKR)'],
          ...reportData.byChargeCategory.map((v) => [v.label, v.amount]),
          [],
          ['Expense Category', 'Sub-category', 'Description', 'Entries', 'Amount (PKR)'],
          ...flattenedExpenseExportRows.map((v) => [
            v.category,
            v.subcategory,
            v.description,
            v.count,
            v.amount,
          ]),
        ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marquee1-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(
      isUr
        ? [
            { تفصیل: 'ہال', قدر: hallName },
            { تفصیل: 'تاریخ کی مدت', قدر: `${startDate} تا ${endDate}` },
            { تفصیل: 'کل وصول شدہ آمدنی (PKR)', قدر: reportData.totalIncome },
            { تفصیل: 'کل اخراجات (PKR)', قدر: reportData.totalExpenses },
            { تفصیل: 'دی گئی خصوصی رعایت (PKR)', قدر: reportData.totalDiscounts },
            { تفصیل: 'خالص منافع (PKR)', قدر: reportData.netProfit },
          ]
        : [
            { Metric: 'Hall', Value: hallName },
            { Metric: 'Date Range', Value: `${startDate} to ${endDate}` },
            { Metric: 'Total Collected Income (PKR)', Value: reportData.totalIncome },
            { Metric: 'Total Expenses (PKR)', Value: reportData.totalExpenses },
            { Metric: 'Special Discounts Given (PKR)', Value: reportData.totalDiscounts },
            { Metric: 'Net Profit (PKR)', Value: reportData.netProfit },
          ]
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, isUr ? 'خلاصہ' : 'Summary');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        flattenedEventExportRows.map((v) =>
          isUr
            ? {
                'ایونٹ کیٹیگری': v.category,
                'ایونٹ / تقریب': v.event,
                'مخصوص نام (دیگر)': v.customName,
                تعداد: v.count,
                'کل رقم (PKR)': v.total,
              }
            : {
                EventCategory: v.category,
                Event: v.event,
                CustomName: v.customName,
                Count: v.count,
                TotalPKR: v.total,
              }
        )
      ),
      isUr ? 'تقریبات' : 'By Event'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        flattenedExpenseExportRows.map((v) =>
          isUr
            ? {
                'اخراجات کیٹیگری': v.category,
                'ذیلی کیٹیگری': v.subcategory,
                تفصیل: v.description,
                تعداد: v.count,
                'رقم (PKR)': v.amount,
              }
            : {
                ExpenseCategory: v.category,
                Subcategory: v.subcategory,
                Description: v.description,
                Entries: v.count,
                AmountPKR: v.amount,
              }
        )
      ),
      isUr ? 'اخراجات' : 'By Expense'
    );
    XLSX.writeFile(wb, `marquee1-financial-report-${startDate}.xlsx`);
  };

  const presetLabels: Record<RangePreset, string> = {
    weekly: tr('weekly', lang),
    monthly: tr('monthly', lang),
    yearly: tr('yearly', lang),
    custom: tr('custom', lang),
  };

  const hasExpenseFilter = expenseCategoryFilter !== 'ALL' || expenseSubcategoryFilter !== 'ALL';

  const activeFilterBadgeText = useMemo(() => {
    if (!hasExpenseFilter) return '';
    const parts: string[] = [];
    if (expenseCategoryFilter !== 'ALL') {
      const cat = activeExpenseCategories.find((c) => c.id === expenseCategoryFilter);
      if (cat) parts.push(pickLocalized(cat.name_en, cat.name_ur, lang));
    }
    if (expenseSubcategoryFilter !== 'ALL') {
      const sub = db.expenseSubcategories.find((s) => s.id === expenseSubcategoryFilter);
      if (sub) parts.push(pickLocalized(sub.name_en, sub.name_ur, lang));
    }
    return parts.join(' › ');
  }, [
    hasExpenseFilter,
    expenseCategoryFilter,
    expenseSubcategoryFilter,
    activeExpenseCategories,
    db.expenseSubcategories,
    lang,
  ]);

  return (
    <div className="space-y-6">
      {/* Range & Expense Filter Toolbar */}
      <div className="no-print glass-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
            {(['weekly', 'monthly', 'yearly', 'custom'] as RangePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  preset === p
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {presetLabels[p]}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{tr('fromLabel', lang)}</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-white tabular-nums"
              />
              <span className="text-slate-400">{tr('toLabel', lang)}</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-white tabular-nums"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-medium flex items-center gap-1.5 hover:border-cyan-500/40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isUr ? 'سی ایس وی' : 'CSV'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-medium flex items-center gap-1.5 hover:border-cyan-500/40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isUr ? 'ایکسل' : 'Excel'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{tr('printPdf', lang)}</span>
            </button>
          </div>
        </div>

        {/* Expense Category & Sub-category Filters */}
        <div className="pt-3 border-t border-slate-800/70 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isUr ? 'اخراجات فلٹر:' : 'Expense Filter:'}</span>
          </div>
          <div className="w-56">
            <SearchableSelect
              value={expenseCategoryFilter}
              options={expenseCategoryFilterOptions}
              onChange={handleExpenseCategoryFilterChange}
              placeholder={tr('allCategories', lang)}
              searchPlaceholder={tr('searchOptionsPlaceholder', lang)}
              emptyText={tr('noMatchingOptions', lang)}
            />
          </div>
          <div className="w-56">
            <SearchableSelect
              value={expenseSubcategoryFilter}
              options={expenseSubcategoryFilterOptions}
              onChange={setExpenseSubcategoryFilter}
              placeholder={tr('allSubcategories', lang)}
              searchPlaceholder={tr('searchOptionsPlaceholder', lang)}
              emptyText={tr('noMatchingOptions', lang)}
            />
          </div>
          {hasExpenseFilter && (
            <button
              type="button"
              onClick={() => {
                setExpenseCategoryFilter('ALL');
                setExpenseSubcategoryFilter('ALL');
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{isUr ? 'فلٹر صاف کریں' : 'Clear Filter'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable A4 Report Body (Strictly Single Language) */}
      <div
        dir={isUr ? 'rtl' : 'ltr'}
        className={`print-only-sheet space-y-6 ${isUr ? 'font-urdu' : ''}`}
      >
        {/* Report Header (Visible both on screen and A4 Print) */}
        <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border border-slate-800">
          <div className="flex items-center gap-3.5">
            <img
              src={logoSrc}
              alt={hallName}
              crossOrigin={logoSrc.startsWith('http') ? 'anonymous' : undefined}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
            />
            <div>
              <div className="text-base font-bold text-white">{hallName}</div>
              {hallTagline && <div className="text-[11px] text-slate-300">{hallTagline}</div>}
              {hallAddress && <div className="text-xs text-slate-400 mt-0.5">{hallAddress}</div>}
              <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                {activeHall.phone && <span className="tabular-nums">{activeHall.phone}</span>}
                {activeHall.email && <span>· {activeHall.email}</span>}
                {activeHall.ntn && (
                  <span className="tabular-nums">
                    · {tr('ntnLabel', lang)}: {activeHall.ntn}
                  </span>
                )}
                {activeHall.strn && (
                  <span className="tabular-nums">
                    · {tr('strnLabel', lang)}: {activeHall.strn}
                  </span>
                )}
              </div>
              <div className="text-xs text-cyan-300 font-semibold mt-1">
                {tr('financialReportsTitle', lang)}
                {activeFilterBadgeText ? ` · ${activeFilterBadgeText}` : ''}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-300 sm:text-end space-y-0.5">
            <div>
              {tr('fromLabel', lang)}:{' '}
              <strong className="tabular-nums">{formatDateDisplay(startDate, lang)}</strong> ·{' '}
              {tr('toLabel', lang)}:{' '}
              <strong className="tabular-nums">{formatDateDisplay(endDate, lang)}</strong>
            </div>
            <div>
              {tr('generatedOn', lang)}:{' '}
              <span className="tabular-nums">{formatDateDisplay(today, lang)}</span>
              {currentUser?.full_name ? (
                <>
                  {' · '}
                  {tr('preparedBy', lang)}: {currentUser.full_name}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel neon-border-cyan rounded-2xl p-5">
            <div className="text-xs text-slate-400">{tr('collectedIncome', lang)}</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums mt-2">
              {formatPKR(reportData.totalIncome)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.paymentsCount}</span>{' '}
              {isUr ? 'ادائیگیاں' : 'payments'}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">
              {tr('totalExpensesLabel', lang)}
              {activeFilterBadgeText ? ` (${activeFilterBadgeText})` : ''}
            </div>
            <div className="text-xl font-bold text-rose-400 tabular-nums mt-2">
              {formatPKR(reportData.totalExpenses)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.expensesCount}</span>{' '}
              {isUr ? 'اندراجات' : 'entries'}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <div className="text-xs text-slate-400">{tr('discountsGiven', lang)}</div>
            <div className="text-xl font-bold text-amber-300 tabular-nums mt-2">
              {formatPKR(reportData.totalDiscounts)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="tabular-nums">{reportData.bookingsCount}</span>{' '}
              {isUr ? 'فعال تقریبات' : 'active events'}
            </div>
          </div>

          <div className="glass-panel neon-border-gold rounded-2xl p-5">
            <div className="text-xs text-slate-400">{tr('netProfit', lang)}</div>
            <div
              className={`text-xl font-bold tabular-nums mt-2 ${
                reportData.netProfit >= 0 ? 'text-cyan-300' : 'text-rose-400'
              }`}
            >
              {formatPKR(reportData.netProfit)}
            </div>
            <div className="text-xs text-slate-400 mt-1">{tr('a4StatementSubtitle', lang)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Two-Level Event Category -> Event Breakdown */}
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byEventType', lang)}</h3>
            <div className="space-y-4 text-xs">
              {reportData.byEventHierarchy.map((cat) => (
                <div key={cat.key} className="space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 gap-2">
                    <span className="font-bold text-white">
                      {cat.label}{' '}
                      <span className="text-slate-400 font-normal tabular-nums">({cat.count})</span>
                    </span>
                    <span className="font-bold text-cyan-300 tabular-nums">
                      {formatPKR(cat.total)}
                    </span>
                  </div>
                  <div className="ps-3 space-y-1.5">
                    {cat.events.map((ev) => (
                      <div key={ev.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-slate-200">
                          <span className="flex items-center gap-1.5 min-w-0 truncate">
                            {ev.colorHex && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.colorHex }}
                              />
                            )}
                            <span className="truncate">{ev.label}</span>
                            <span className="text-slate-500 tabular-nums">({ev.count})</span>
                          </span>
                          <span className="font-semibold text-cyan-200 tabular-nums shrink-0">
                            {formatPKR(ev.total)}
                          </span>
                        </div>
                        {ev.customEntries.length > 0 && (
                          <div className="ps-3 border-s border-slate-800 space-y-0.5 text-[11px] text-slate-400">
                            {ev.customEntries.map((custom) => (
                              <div
                                key={custom.name}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {custom.name}{' '}
                                  <span className="text-slate-500 tabular-nums">
                                    ({custom.count})
                                  </span>
                                </span>
                                <span className="tabular-nums text-slate-300 shrink-0">
                                  {formatPKR(custom.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {reportData.byEventHierarchy.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>

          {/* Charge Category Breakdown */}
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byChargeCategory', lang)}</h3>
            <div className="space-y-3 text-xs">
              {reportData.byChargeCategory.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between border-b border-slate-800/70 pb-2 gap-2"
                >
                  <span className="text-slate-200">{item.label}</span>
                  <span className="font-semibold text-violet-300 tabular-nums">
                    {formatPKR(item.amount)}
                  </span>
                </div>
              ))}
              {reportData.byChargeCategory.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>

          {/* Two-Level Expense Category -> Sub-category Breakdown */}
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">{tr('byExpenseCategory', lang)}</h3>
            <div className="space-y-4 text-xs">
              {reportData.byExpenseHierarchy.map((cat) => (
                <div key={cat.key} className="space-y-1.5">
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 gap-2">
                    <span className="font-bold text-white">
                      {cat.label}{' '}
                      <span className="text-slate-400 font-normal tabular-nums">({cat.count})</span>
                    </span>
                    <span className="font-bold text-rose-300 tabular-nums">
                      {formatPKR(cat.amount)}
                    </span>
                  </div>
                  <div className="ps-3 space-y-1.5">
                    {cat.subcategories.map((sub) => (
                      <div key={sub.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-slate-200">
                          <span className="truncate">
                            {sub.label}{' '}
                            <span className="text-slate-500 tabular-nums">({sub.count})</span>
                          </span>
                          <span className="font-semibold text-rose-200 tabular-nums shrink-0">
                            {formatPKR(sub.amount)}
                          </span>
                        </div>
                        {sub.manualEntries.length > 0 && (
                          <div className="ps-3 border-s border-slate-800 space-y-0.5 text-[11px] text-slate-400">
                            {sub.manualEntries.map((manual) => (
                              <div
                                key={manual.name}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {manual.name}{' '}
                                  <span className="text-slate-500 tabular-nums">
                                    ({manual.count})
                                  </span>
                                </span>
                                <span className="tabular-nums text-slate-300 shrink-0">
                                  {formatPKR(manual.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {reportData.byExpenseHierarchy.length === 0 && (
                <p className="text-slate-500">{tr('noDataInPeriod', lang)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

