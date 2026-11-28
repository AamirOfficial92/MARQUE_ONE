import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarCheck,
  Copy,
  Edit3,
  FolderTree,
  Loader2,
  Plus,
  Power,
  Tag,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  hasMissingBilingualPair,
  isOtherOptionName,
  pickLocalized,
  tr,
  translateAttendanceStatus,
  translateExpenseCategoryName,
  translateExpenseSubcategoryName,
  translatePaymentMode,
} from '../i18n/translations';
import { SearchableSelect } from './SearchableSelect';
import {
  AttendanceStatus,
  Employee,
  ExpenseCategory,
  ExpenseSubcategory,
  PaymentMode,
} from '../types';
import {
  formatDateDisplay,
  formatNICInput,
  formatPKR,
  formatPakistaniPhoneInput,
  todayISO,
} from '../utils/formatters';

type ExpenseSubTab = 'expenses' | 'staff' | 'attendance' | 'payroll' | 'categories';

interface ExpensesViewProps {
  attendanceOnly?: boolean;
  initialSubTab?: ExpenseSubTab;
  requestedSubTab?: { tab: ExpenseSubTab; nonce: number };
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  attendanceOnly = false,
  initialSubTab,
  requestedSubTab,
}) => {
  const {
    db,
    rawDb,
    activeHall,
    currentUser,
    lang,
    can,
    addExpense,
    softDeleteExpense,
    saveEmployee,
    toggleEmployeeActive,
    softDeleteEmployee,
    saveAttendance,
    addEmployeeAdvance,
    payEmployeeSalary,
    saveExpenseCategory,
    toggleExpenseCategoryActive,
    reorderExpenseCategories,
    softDeleteExpenseCategory,
    saveExpenseSubcategory,
    toggleExpenseSubcategoryActive,
    reorderExpenseSubcategories,
    softDeleteExpenseSubcategory,
    copyExpenseTaxonomyFromHall,
  } = useApp();

  const isUr = lang === 'ur';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const missingWarnTitle = tr('missingTranslationWarn', lang);

  const canViewExpenses = can('expenses', 'view');
  const canEditExpenses = can('expenses', 'edit');
  const canDeleteExpenses = can('expenses', 'delete');
  const canViewExpCats = can('expense_categories', 'view');
  const canEditExpCats = can('expense_categories', 'edit');
  const canDeleteExpCats = can('expense_categories', 'delete');
  const canViewEmployees = can('employees', 'view');
  const canEditEmployees = can('employees', 'edit');
  const canDeleteEmployees = can('employees', 'delete');
  const canViewAttendance = can('attendance', 'view');
  const canEditAttendance = can('attendance', 'edit');
  const canViewSalaries = can('salaries', 'view');
  const canEditSalaries = can('salaries', 'edit');

  const visibleSubTabs = useMemo(() => {
    const tabs: Array<{ id: ExpenseSubTab; label: string }> = [];
    if (attendanceOnly) {
      if (canViewAttendance) tabs.push({ id: 'attendance', label: tr('attendance', lang) });
      return tabs;
    }
    if (canViewExpenses)
      tabs.push({ id: 'expenses', label: isUr ? 'اخراجات کھاتہ' : 'Expenses Ledger' });
    if (canViewEmployees) tabs.push({ id: 'staff', label: tr('employees', lang) });
    if (canViewAttendance) tabs.push({ id: 'attendance', label: tr('attendance', lang) });
    if (canViewSalaries) tabs.push({ id: 'payroll', label: tr('salaries', lang) });
    if (canViewExpCats)
      tabs.push({ id: 'categories', label: isUr ? 'اخراجات کی اقسام' : 'Categories' });
    return tabs;
  }, [
    attendanceOnly,
    canViewExpenses,
    canViewExpCats,
    canViewEmployees,
    canViewAttendance,
    canViewSalaries,
    lang,
    isUr,
  ]);

  const defaultTab: ExpenseSubTab =
    initialSubTab && visibleSubTabs.some((t) => t.id === initialSubTab)
      ? initialSubTab
      : visibleSubTabs[0]?.id || 'attendance';

  const [subTab, setSubTab] = useState<ExpenseSubTab>(defaultTab);
  useEffect(() => {
    if (requestedSubTab && visibleSubTabs.some((t) => t.id === requestedSubTab.tab)) {
      setSubTab(requestedSubTab.tab);
    }
  }, [requestedSubTab, visibleSubTabs]);
  const activeSubTab: ExpenseSubTab = visibleSubTabs.some((t) => t.id === subTab)
    ? subTab
    : defaultTab;
  const today = todayISO();

  // Expense Categories & Subcategories (sorted)
  const allExpenseCategories = useMemo(
    () =>
      [...db.expenseCategories]
        .filter((c) => !c.deleted_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [db.expenseCategories]
  );
  const activeCategories = useMemo(
    () => allExpenseCategories.filter((c) => c.is_active !== false),
    [allExpenseCategories]
  );
  const allExpenseSubcategories = useMemo(
    () =>
      [...db.expenseSubcategories]
        .filter((s) => !s.deleted_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [db.expenseSubcategories]
  );
  const otherHallsForCopy = rawDb.halls.filter((h) => h.id !== activeHall.id && h.is_active !== false);

  const activeBookings = useMemo(
    () =>
      db.bookings
        .filter((b) => !b.deleted_at)
        .sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [db.bookings]
  );

  // New Expense Form
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id || '');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  const availableSubcategoriesForEntry = useMemo(
    () =>
      allExpenseSubcategories.filter(
        (s) => s.category_id === categoryId && s.is_active !== false
      ),
    [allExpenseSubcategories, categoryId]
  );

  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some((c) => c.id === categoryId)) {
      setCategoryId(activeCategories[0].id);
    }
  }, [activeCategories, categoryId]);

  useEffect(() => {
    if (availableSubcategoriesForEntry.length > 0) {
      if (!availableSubcategoriesForEntry.some((s) => s.id === subcategoryId)) {
        setSubcategoryId(availableSubcategoriesForEntry[0].id);
      }
    } else if (subcategoryId) {
      setSubcategoryId('');
    }
  }, [availableSubcategoriesForEntry, subcategoryId]);

  const selectedEntryCategory = activeCategories.find((c) => c.id === categoryId);
  const selectedEntrySubcategory = availableSubcategoriesForEntry.find((s) => s.id === subcategoryId);
  const isOtherExpenseSelected =
    isOtherOptionName(selectedEntryCategory?.name_en) ||
    isOtherOptionName(selectedEntrySubcategory?.name_en);

  // Employee Form (Add or Edit)
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empNic, setEmpNic] = useState('');
  const [empRoleTitle, setEmpRoleTitle] = useState('');
  const [empType, setEmpType] = useState<'monthly' | 'daily_wage'>('daily_wage');
  const [empRate, setEmpRate] = useState('2000');
  const [showInactiveStaff, setShowInactiveStaff] = useState(true);

  // Attendance state
  const [attDate, setAttDate] = useState<string>(today);
  const [attMonth, setAttMonth] = useState<string>(today.slice(0, 7));

  // Advances & Salary Sheet state
  const [payrollMonth, setPayrollMonth] = useState<string>(today.slice(0, 7));
  const [advEmpId, setAdvEmpId] = useState<string>('');
  const [advAmount, setAdvAmount] = useState<string>('');
  const [advDate, setAdvDate] = useState<string>(today);
  const [advMode, setAdvMode] = useState<PaymentMode>('Cash');
  const [advNotes, setAdvNotes] = useState<string>('');

  // Expense Category & Subcategory Management Forms
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catEn, setCatEn] = useState('');
  const [catUr, setCatUr] = useState('');
  const [catActive, setCatActive] = useState(true);

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [subParentCatId, setSubParentCatId] = useState<string>(allExpenseCategories[0]?.id || '');
  const [subEn, setSubEn] = useState('');
  const [subUr, setSubUr] = useState('');
  const [subActive, setSubActive] = useState(true);

  const [copySourceHallId, setCopySourceHallId] = useState<string>('');
  const [copyingExpenses, setCopyingExpenses] = useState(false);
  const [busyCatId, setBusyCatId] = useState<string | null>(null);
  const [busySubId, setBusySubId] = useState<string | null>(null);
  const [inUsePrompt, setInUsePrompt] = useState<{
    kind: 'category' | 'subcategory';
    id: string;
    name: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (allExpenseCategories.length > 0 && !allExpenseCategories.some((c) => c.id === subParentCatId)) {
      setSubParentCatId(allExpenseCategories[0].id);
    }
  }, [allExpenseCategories, subParentCatId]);

  useEffect(() => {
    if (otherHallsForCopy.length > 0 && !otherHallsForCopy.some((h) => h.id === copySourceHallId)) {
      setCopySourceHallId(otherHallsForCopy[0].id);
    }
  }, [otherHallsForCopy, copySourceHallId]);

  // Saving / mutation busy states
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [savingEmp, setSavingEmp] = useState(false);
  const [busyEmpToggleId, setBusyEmpToggleId] = useState<string | null>(null);
  const [deletingEmpId, setDeletingEmpId] = useState<string | null>(null);
  const [busyAttKey, setBusyAttKey] = useState<string | null>(null);
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [payingSalaryEmpId, setPayingSalaryEmpId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSubcategory, setSavingSubcategory] = useState(false);

  const activeExpenses = useMemo(
    () =>
      db.expenses
        .filter((e) => !e.deleted_at)
        .sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    [db.expenses]
  );

  const nonDeletedEmployees = useMemo(
    () => db.employees.filter((e) => !e.deleted_at),
    [db.employees]
  );

  const activeEmployees = useMemo(
    () => nonDeletedEmployees.filter((e) => e.is_active),
    [nonDeletedEmployees]
  );

  const visibleEmployees = useMemo(
    () => (showInactiveStaff ? nonDeletedEmployees : activeEmployees),
    [nonDeletedEmployees, activeEmployees, showInactiveStaff]
  );

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingExpense) return;
    setExpenseFormError(null);
    const numeric = Number(amount);
    if (!numeric || numeric <= 0 || !payee.trim()) {
      setExpenseFormError(
        isUr ? 'وصول کنندہ اور درست رقم درج کرنا لازمی ہے۔' : 'Payee and positive amount are required.'
      );
      return;
    }
    if (isOtherExpenseSelected && !manualDescription.trim()) {
      setExpenseFormError(
        isUr
          ? 'جب آپ "دیگر" منتخب کریں تو تفصیل درج کرنا لازمی ہے۔'
          : 'Description is required when "Other" is selected.'
      );
      return;
    }
    const cat = activeCategories.find((c) => c.id === categoryId);
    const sub = availableSubcategoriesForEntry.find((s) => s.id === subcategoryId);
    setSavingExpense(true);
    try {
      const res = await addExpense({
        category_id: categoryId,
        category_name: cat?.name_en || 'Other',
        category_name_ur: cat?.name_ur || '',
        subcategory_id: sub?.id || null,
        subcategory_name: sub?.name_en || '',
        subcategory_name_ur: sub?.name_ur || '',
        manual_description: isOtherExpenseSelected ? manualDescription.trim() : '',
        booking_id: bookingId || null,
        employee_id: null,
        amount: numeric,
        expense_date: expenseDate,
        payee: payee.trim(),
        mode,
        reference_no: referenceNo.trim(),
        notes: notes.trim(),
      });
      if (!res.ok) return;
      setAmount('');
      setPayee('');
      setReferenceNo('');
      setNotes('');
      setManualDescription('');
      setBookingId('');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleEditEmployeeClick = (emp: Employee) => {
    setEditingEmpId(emp.id);
    setEmpName(emp.full_name);
    setEmpPhone(emp.phone);
    setEmpNic(emp.nic);
    setEmpRoleTitle(emp.role_title);
    setEmpType(emp.employment_type);
    setEmpRate(String(emp.base_rate));
  };

  const resetEmployeeForm = () => {
    setEditingEmpId(null);
    setEmpName('');
    setEmpPhone('');
    setEmpNic('');
    setEmpRoleTitle('');
    setEmpType('daily_wage');
    setEmpRate('2000');
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingEmp) return;
    if (!empName.trim() || !empRoleTitle.trim()) return;
    const existing = editingEmpId
      ? nonDeletedEmployees.find((x) => x.id === editingEmpId)
      : undefined;
    setSavingEmp(true);
    try {
      const res = await saveEmployee({
        id: editingEmpId || undefined,
        full_name: empName.trim(),
        phone: empPhone.trim() || '0300-0000000',
        nic: empNic.trim(),
        role_title: empRoleTitle.trim(),
        employment_type: empType,
        base_rate: Number(empRate) || 0,
        is_active: existing ? existing.is_active : true,
      });
      if (!res.ok) return;
      resetEmployeeForm();
    } finally {
      setSavingEmp(false);
    }
  };

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAdvance) return;
    const targetEmpId = advEmpId || activeEmployees[0]?.id;
    const amt = Number(advAmount);
    if (!targetEmpId || !amt || amt <= 0) return;
    setSavingAdvance(true);
    try {
      const res = await addEmployeeAdvance({
        employee_id: targetEmpId,
        amount: amt,
        advance_date: advDate,
        mode: advMode,
        notes: advNotes.trim() || (isUr ? 'تنخواہ ایڈوانس' : 'Salary advance'),
      });
      if (!res.ok) return;
      setAdvAmount('');
      setAdvNotes('');
    } finally {
      setSavingAdvance(false);
    }
  };

  const startEditCategory = (cat: ExpenseCategory) => {
    setEditingCatId(cat.id);
    setCatEn(cat.name_en);
    setCatUr(cat.name_ur);
    setCatActive(cat.is_active !== false);
  };

  const resetCategoryForm = () => {
    setEditingCatId(null);
    setCatEn('');
    setCatUr('');
    setCatActive(true);
  };

  const startEditSubcategory = (sub: ExpenseSubcategory) => {
    setEditingSubId(sub.id);
    setSubParentCatId(sub.category_id);
    setSubEn(sub.name_en);
    setSubUr(sub.name_ur);
    setSubActive(sub.is_active !== false);
  };

  const resetSubcategoryForm = () => {
    setEditingSubId(null);
    setSubEn('');
    setSubUr('');
    setSubActive(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingCategory) return;
    if (!catEn.trim() && !catUr.trim()) return;
    setSavingCategory(true);
    try {
      const res = await saveExpenseCategory({
        id: editingCatId || undefined,
        name_en: catEn.trim() || catUr.trim(),
        name_ur: catUr.trim() || catEn.trim(),
        is_active: catActive,
      });
      if (!res.ok) return;
      if (res.category && !editingCatId) {
        setSubParentCatId(res.category.id);
      }
      resetCategoryForm();
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSaveSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSubcategory) return;
    if (!subParentCatId || (!subEn.trim() && !subUr.trim())) return;
    setSavingSubcategory(true);
    try {
      const res = await saveExpenseSubcategory({
        id: editingSubId || undefined,
        category_id: subParentCatId,
        name_en: subEn.trim() || subUr.trim(),
        name_ur: subUr.trim() || subEn.trim(),
        is_active: subActive,
      });
      if (!res.ok) return;
      resetSubcategoryForm();
    } finally {
      setSavingSubcategory(false);
    }
  };

  const moveExpCategoryOrder = async (catId: string, dir: -1 | 1) => {
    const idx = allExpenseCategories.findIndex((c) => c.id === catId);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= allExpenseCategories.length) return;
    const ids = allExpenseCategories.map((c) => c.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setBusyCatId(catId);
    try {
      await reorderExpenseCategories(ids);
    } finally {
      setBusyCatId(null);
    }
  };

  const moveExpSubcategoryOrder = async (parentCatId: string, subId: string, dir: -1 | 1) => {
    const siblings = allExpenseSubcategories.filter((s) => s.category_id === parentCatId);
    const idx = siblings.findIndex((s) => s.id === subId);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setBusySubId(subId);
    try {
      await reorderExpenseSubcategories(parentCatId, ids);
    } finally {
      setBusySubId(null);
    }
  };

  const getMonthlyAttendanceSummary = (employeeId: string, monthPrefix: string) => {
    const records = db.attendance.filter(
      (a) => a.employee_id === employeeId && a.attendance_date.startsWith(monthPrefix)
    );
    const present = records.filter((r) => r.status === 'Present').length;
    const absent = records.filter((r) => r.status === 'Absent').length;
    const halfDay = records.filter((r) => r.status === 'Half-day').length;
    const leave = records.filter((r) => r.status === 'Leave').length;
    return { present, absent, halfDay, leave };
  };

  const salarySheetRows = useMemo(() => {
    const [yrStr, moStr] = payrollMonth.split('-');
    const daysInMonth = new Date(Number(yrStr) || 2026, Number(moStr) || 1, 0).getDate() || 30;

    return activeEmployees.map((emp) => {
      const att = getMonthlyAttendanceSummary(emp.id, payrollMonth);
      let basicPay = emp.base_rate;
      let attendanceDeduction = 0;

      if (emp.employment_type === 'monthly') {
        const dailyEquiv = emp.base_rate / daysInMonth;
        attendanceDeduction = Math.round(dailyEquiv * (att.absent + 0.5 * att.halfDay));
      } else {
        const workedUnits = att.present + 0.5 * att.halfDay;
        basicPay = Math.round(emp.base_rate * workedUnits);
        attendanceDeduction = 0;
      }

      const unsettledAdvances = db.advances
        .filter(
          (a) =>
            !a.deleted_at &&
            !a.is_settled &&
            a.employee_id === emp.id &&
            a.advance_date.slice(0, 7) <= payrollMonth
        )
        .reduce((s, a) => s + Number(a.amount), 0);

      const netPayable = Math.max(0, basicPay - attendanceDeduction - unsettledAdvances);
      const alreadyPaidThisMonth = db.expenses.some(
        (ex) =>
          !ex.deleted_at &&
          ex.employee_id === emp.id &&
          ex.reference_no === `SAL-${payrollMonth}`
      );

      return {
        emp,
        att,
        basicPay,
        attendanceDeduction,
        unsettledAdvances,
        netPayable,
        alreadyPaidThisMonth,
      };
    });
  }, [activeEmployees, db.attendance, db.advances, db.expenses, payrollMonth]);

  return (
    <div className="space-y-6">
      {visibleSubTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 w-fit">
          {visibleSubTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeSubTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeSubTab === 'expenses' && canViewExpenses && (
        <div className={`grid grid-cols-1 ${canEditExpenses ? 'xl:grid-cols-3' : ''} gap-6`}>
          {canEditExpenses && (
            <form onSubmit={handleAddExpense} className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">
                {isUr ? 'نیا خرچ درج کریں' : 'Record Expense'}
              </h3>
              {expenseFormError && (
                <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs">
                  {expenseFormError}
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {tr('expenseCategoryLabel', lang)} *
                </label>
                <SearchableSelect
                  required
                  value={categoryId}
                  placeholder={tr('selectCategory', lang)}
                  searchPlaceholder={tr('searchOptionsPlaceholder', lang)}
                  emptyText={tr('noMatchingOptions', lang)}
                  options={activeCategories.map((c) => ({
                    value: c.id,
                    label: pickLocalized(c.name_en, c.name_ur, lang),
                  }))}
                  onChange={(nextCatId) => {
                    setCategoryId(nextCatId);
                    const subs = allExpenseSubcategories.filter(
                      (s) => s.category_id === nextCatId && s.is_active !== false
                    );
                    if (subs.length > 0) {
                      setSubcategoryId(subs[0].id);
                    } else {
                      setSubcategoryId('');
                    }
                  }}
                />
              </div>
              {availableSubcategoriesForEntry.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('expenseSubcategoryLabel', lang)} *
                  </label>
                  <SearchableSelect
                    required
                    value={subcategoryId}
                    placeholder={tr('selectSubcategory', lang)}
                    searchPlaceholder={tr('searchOptionsPlaceholder', lang)}
                    emptyText={tr('noMatchingOptions', lang)}
                    options={availableSubcategoriesForEntry.map((s) => ({
                      value: s.id,
                      label: pickLocalized(s.name_en, s.name_ur, lang),
                    }))}
                    onChange={(nextSubId) => {
                      setSubcategoryId(nextSubId);
                      const sub = availableSubcategoriesForEntry.find((x) => x.id === nextSubId);
                      if (
                        !isOtherOptionName(selectedEntryCategory?.name_en) &&
                        !isOtherOptionName(sub?.name_en)
                      ) {
                        setManualDescription('');
                      }
                    }}
                  />
                </div>
              )}
              {isOtherExpenseSelected && (
                <div>
                  <label className="block text-xs text-amber-300 font-semibold mb-1">
                    {tr('manualDescriptionLabel', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder={
                      isUr ? 'مثال: ہنگامی مرمت یا متفرق خریداری' : 'e.g. Emergency repair or miscellaneous supply'
                    }
                    className="w-full bg-slate-950/70 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {isUr ? 'بکنگ سے منسلک کریں (اختیاری)' : 'Link to Booking (Optional)'}
                </label>
                <select
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">
                    {isUr
                      ? 'عمومی ہال خرچ (کسی تقریب سے منسلک نہیں)'
                      : 'General Hall Expense (Not linked to event)'}
                  </option>
                  {activeBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.booking_code} · {b.customer_name} ({formatDateDisplay(b.event_date, lang)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {isUr ? 'وصول کنندہ / وینڈر *' : 'Payee / Vendor *'}
                </label>
                <input
                  type="text"
                  required
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder={
                    isUr
                      ? 'پھول والا / ساؤنڈ ٹیم / کے-الیکٹرک'
                      : 'Florist / Sound Team / Waiter Crew / K-Electric'
                  }
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {isUr ? 'رقم (روپے) *' : 'Amount (PKR) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{tr('dateCol', lang)}</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{tr('modeCol', lang)}</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Cash">{translatePaymentMode('Cash', lang)}</option>
                    <option value="Online">{translatePaymentMode('Online', lang)}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {tr('referenceCol', lang)}
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">{tr('notes', lang)}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                disabled={savingExpense}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {savingExpense ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>
                  {savingExpense
                    ? tr('saving', lang)
                    : isUr
                    ? 'خرچ محفوظ کریں'
                    : 'Save Expense'}
                </span>
              </button>
            </form>
          )}

          <div
            className={`${
              canEditExpenses ? 'xl:col-span-2' : ''
            } glass-panel rounded-2xl overflow-hidden`}
          >
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {isUr ? 'اخراجات کھاتہ' : 'Expenses Ledger'}
              </h3>
              <span className="text-xs text-rose-300 font-semibold tabular-nums">
                {isUr ? 'کل:' : 'Total:'}{' '}
                {formatPKR(activeExpenses.reduce((s, e) => s + e.amount, 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'تاریخ اور کیٹیگری' : 'Date & Category'}
                    </th>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'وصول کنندہ اور بکنگ' : 'Payee & Linked Booking'}
                    </th>
                    <th className="py-2.5 px-4 text-start">{tr('modeCol', lang)}</th>
                    <th className="py-2.5 px-4 text-end">{tr('amountCol', lang)}</th>
                    {canDeleteExpenses && (
                      <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeExpenses.map((ex) => {
                    const linkedBk = ex.booking_id
                      ? db.bookings.find((b) => b.id === ex.booking_id)
                      : null;
                    const catLabel = translateExpenseCategoryName(
                      ex.category_name,
                      lang,
                      db.expenseCategories,
                      ex.category_id,
                      ex.category_name_ur
                    );
                    const subLabel =
                      ex.subcategory_name || ex.subcategory_id
                        ? translateExpenseSubcategoryName(
                            ex.subcategory_name || '',
                            lang,
                            db.expenseSubcategories,
                            ex.subcategory_id,
                            ex.subcategory_name_ur
                          )
                        : '';
                    return (
                      <tr key={ex.id} className="hover:bg-slate-900/30">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {catLabel}
                            {subLabel ? ` · ${subLabel}` : ''}
                          </div>
                          {ex.manual_description && (
                            <div className="text-[11px] text-amber-300 mt-0.5">
                              {ex.manual_description}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {formatDateDisplay(ex.expense_date, lang)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-100">{ex.payee}</div>
                          {linkedBk && (
                            <div className="text-[11px] text-cyan-300 tabular-nums">
                              {isUr ? 'منسلک:' : 'Linked:'} {linkedBk.booking_code} (
                              {linkedBk.customer_name})
                            </div>
                          )}
                          {ex.notes && <div className="text-[11px] text-slate-400">{ex.notes}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {translatePaymentMode(ex.mode, lang)}{' '}
                          {ex.reference_no ? (
                            <span className="tabular-nums">· {ex.reference_no}</span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="py-3 px-4 text-end font-bold text-rose-300 tabular-nums">
                          {formatPKR(ex.amount)}
                        </td>
                        {canDeleteExpenses && (
                          <td className="py-3 px-4 text-end">
                            <button
                              type="button"
                              disabled={deletingExpenseId === ex.id}
                              onClick={async () => {
                                setDeletingExpenseId(ex.id);
                                try {
                                  await softDeleteExpense(ex.id);
                                } finally {
                                  setDeletingExpenseId(null);
                                }
                              }}
                              title={tr('delete', lang)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-50"
                            >
                              {deletingExpenseId === ex.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'staff' && canViewEmployees && (
        <div className={`grid grid-cols-1 ${canEditEmployees ? 'xl:grid-cols-3' : ''} gap-6`}>
          {canEditEmployees && (
            <form onSubmit={handleSaveEmployee} className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>
                    {editingEmpId
                      ? isUr
                        ? 'ملازم میں ترمیم کریں'
                        : 'Edit Staff Member'
                      : isUr
                      ? 'نیا ملازم شامل کریں'
                      : 'Add Staff Member'}
                  </span>
                </h3>
                {editingEmpId && (
                  <button
                    type="button"
                    onClick={resetEmployeeForm}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    {tr('cancel', lang)}
                  </button>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {isUr ? 'مکمل نام *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  {isUr ? 'عہدہ / کام *' : 'Role / Job Title *'}
                </label>
                <input
                  type="text"
                  required
                  value={empRoleTitle}
                  onChange={(e) => setEmpRoleTitle(e.target.value)}
                  placeholder={
                    isUr
                      ? 'ویٹر / چوکیدار / سپروائزر'
                      : 'Waiter / Peon / Sweeper / Supervisor'
                  }
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{tr('phone', lang)}</label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(formatPakistaniPhoneInput(e.target.value))}
                    placeholder="0300-1234567"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{tr('nic', lang)}</label>
                  <input
                    type="text"
                    value={empNic}
                    onChange={(e) => setEmpNic(formatNICInput(e.target.value))}
                    placeholder="42101-XXXXXXX-X"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {isUr ? 'تنخواہ کی قسم' : 'Pay Type'}
                  </label>
                  <select
                    value={empType}
                    onChange={(e) => setEmpType(e.target.value as 'monthly' | 'daily_wage')}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="monthly">
                      {isUr ? 'ماہانہ تنخواہ' : 'Monthly Salaried'}
                    </option>
                    <option value="daily_wage">
                      {isUr ? 'دیہاڑی (ویٹر وغیرہ)' : 'Daily Wage (Waiter)'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {isUr ? 'بنیادی ریٹ (روپے)' : 'Base Rate (PKR)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={empRate}
                    onChange={(e) => setEmpRate(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingEmp}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {savingEmp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {savingEmp
                    ? tr('saving', lang)
                    : editingEmpId
                    ? isUr
                      ? 'ملازم اپڈیٹ کریں'
                      : 'Update Staff Member'
                    : isUr
                    ? 'ملازم شامل کریں'
                    : 'Add Staff Member'}
                </span>
              </button>
            </form>
          )}

          <div
            className={`${
              canEditEmployees ? 'xl:col-span-2' : ''
            } glass-panel rounded-2xl overflow-hidden`}
          >
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                {isUr
                  ? `عملے کی فہرست (${activeEmployees.length} فعال)`
                  : `Staff Directory (${activeEmployees.length} Active)`}
              </h3>
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactiveStaff}
                  onChange={(e) => setShowInactiveStaff(e.target.checked)}
                />
                <span>{isUr ? 'غیر فعال عملہ بھی دکھائیں' : 'Show Deactivated'}</span>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'ملازم' : 'Staff Member'}
                    </th>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'قسم اور حالت' : 'Type & Status'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'ریٹ (PKR)' : 'Rate (PKR)'}
                    </th>
                    {(canEditEmployees || canDeleteEmployees) && (
                      <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {visibleEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      className={`hover:bg-slate-900/30 ${!emp.is_active ? 'opacity-55' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{emp.full_name}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {emp.role_title} · {emp.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div
                          className={
                            emp.employment_type === 'monthly' ? 'text-cyan-300' : 'text-amber-300'
                          }
                        >
                          {emp.employment_type === 'monthly'
                            ? isUr
                              ? 'ماہانہ تنخواہ'
                              : 'Monthly Salary'
                            : isUr
                            ? 'دیہاڑی'
                            : 'Daily Wage'}
                        </div>
                        <div
                          className={`text-[11px] ${
                            emp.is_active ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {emp.is_active ? tr('active', lang) : tr('inactive', lang)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-white tabular-nums">
                        {formatPKR(emp.base_rate)}
                      </td>
                      {(canEditEmployees || canDeleteEmployees) && (
                        <td className="py-3 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            {canEditEmployees && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEditEmployeeClick(emp)}
                                  title={tr('edit', lang)}
                                  className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busyEmpToggleId === emp.id}
                                  onClick={async () => {
                                    setBusyEmpToggleId(emp.id);
                                    try {
                                      await toggleEmployeeActive(emp.id, !emp.is_active);
                                    } finally {
                                      setBusyEmpToggleId(null);
                                    }
                                  }}
                                  title={
                                    emp.is_active
                                      ? isUr
                                        ? 'غیر فعال کریں'
                                        : 'Deactivate'
                                      : isUr
                                      ? 'فعال کریں'
                                      : 'Reactivate'
                                  }
                                  className={`p-1.5 rounded-lg border border-slate-800 disabled:opacity-50 ${
                                    emp.is_active
                                      ? 'text-slate-300 hover:text-amber-300'
                                      : 'text-emerald-400 hover:text-emerald-300'
                                  }`}
                                >
                                  {busyEmpToggleId === emp.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Power className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            )}
                            {canDeleteEmployees && (
                              <button
                                type="button"
                                disabled={deletingEmpId === emp.id}
                                onClick={async () => {
                                  setDeletingEmpId(emp.id);
                                  try {
                                    await softDeleteEmployee(emp.id);
                                  } finally {
                                    setDeletingEmpId(null);
                                  }
                                }}
                                title={tr('delete', lang)}
                                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-50"
                              >
                                {deletingEmpId === emp.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'attendance' && canViewAttendance && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-cyan-400" />
                <span>{isUr ? 'روزانہ حاضری' : 'Daily Attendance'}</span>
              </h3>
              <input
                type="date"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
              />
            </div>
            <div className="divide-y divide-slate-800/70">
              {activeEmployees.map((emp) => {
                const currentRec = db.attendance.find(
                  (a) => a.employee_id === emp.id && a.attendance_date === attDate
                );
                return (
                  <div
                    key={emp.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">{emp.full_name}</div>
                      <div className="text-[11px] text-slate-400">{emp.role_title}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['Present', 'Absent', 'Half-day', 'Leave'] as AttendanceStatus[]).map(
                        (st) => {
                          const selected = currentRec?.status === st;
                          const activeCls =
                            st === 'Present'
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                              : st === 'Absent'
                              ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                              : st === 'Half-day'
                              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                              : 'border-cyan-500 bg-cyan-500/20 text-cyan-300';
                          const attCellKey = `${emp.id}:${attDate}:${st}`;
                          const isBusyCell = busyAttKey === attCellKey;
                          const isEmpAttBusy = busyAttKey?.startsWith(`${emp.id}:${attDate}:`) ?? false;
                          return (
                            <button
                              key={st}
                              type="button"
                              disabled={!canEditAttendance || isEmpAttBusy}
                              onClick={async () => {
                                setBusyAttKey(attCellKey);
                                try {
                                  await saveAttendance(emp.id, attDate, st);
                                } finally {
                                  setBusyAttKey(null);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                                selected
                                  ? activeCls
                                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                              }`}
                            >
                              {isBusyCell && <Loader2 className="w-3 h-3 animate-spin" />}
                              <span>{translateAttendanceStatus(st, lang)}</span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                );
              })}
              {activeEmployees.length === 0 && (
                <p className="p-6 text-xs text-slate-500">
                  {isUr ? 'کوئی فعال ملازم موجود نہیں ہے۔' : 'No active employees found.'}
                </p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">
                {isUr ? 'ماہانہ حاضری شیٹ' : 'Monthly Attendance Sheet'}
              </h3>
              <input
                type="month"
                value={attMonth}
                onChange={(e) => setAttMonth(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">{isUr ? 'ملازم' : 'Employee'}</th>
                    <th className="py-2.5 px-3 text-end text-emerald-400">
                      {translateAttendanceStatus('Present', lang)}
                    </th>
                    <th className="py-2.5 px-3 text-end text-rose-400">
                      {translateAttendanceStatus('Absent', lang)}
                    </th>
                    <th className="py-2.5 px-3 text-end text-amber-300">
                      {translateAttendanceStatus('Half-day', lang)}
                    </th>
                    <th className="py-2.5 px-3 text-end text-cyan-300">
                      {translateAttendanceStatus('Leave', lang)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeEmployees.map((emp) => {
                    const sum = getMonthlyAttendanceSummary(emp.id, attMonth);
                    return (
                      <tr key={emp.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{emp.full_name}</div>
                          <div className="text-[11px] text-slate-400">{emp.role_title}</div>
                        </td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-emerald-300">
                          {sum.present}
                        </td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-rose-300">
                          {sum.absent}
                        </td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-amber-300">
                          {sum.halfDay}
                        </td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-cyan-300">
                          {sum.leave}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'payroll' && canViewSalaries && (
        <div className="space-y-6">
          <div className={`grid grid-cols-1 ${canEditSalaries ? 'xl:grid-cols-3' : ''} gap-6`}>
            {canEditSalaries && (
              <form
                onSubmit={handleAddAdvance}
                className="glass-panel rounded-2xl p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>{isUr ? 'تنخواہ ایڈوانس درج کریں' : 'Record Salary Advance'}</span>
                </h3>
                <div>
                  <label className="block text-slate-300 mb-1">
                    {isUr ? 'ملازم' : 'Employee'}
                  </label>
                  <select
                    value={advEmpId || activeEmployees[0]?.id || ''}
                    onChange={(e) => setAdvEmpId(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {activeEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.role_title})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">
                      {isUr ? 'ایڈوانس رقم (PKR) *' : 'Advance Amount (PKR) *'}
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={advAmount}
                      onChange={(e) => setAdvAmount(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">{tr('dateCol', lang)}</label>
                    <input
                      type="date"
                      required
                      value={advDate}
                      onChange={(e) => setAdvDate(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">{tr('modeCol', lang)}</label>
                    <select
                      value={advMode}
                      onChange={(e) => setAdvMode(e.target.value as PaymentMode)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="Cash">{translatePaymentMode('Cash', lang)}</option>
                      <option value="Online">{translatePaymentMode('Online', lang)}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">{tr('notes', lang)}</label>
                    <input
                      type="text"
                      value={advNotes}
                      onChange={(e) => setAdvNotes(e.target.value)}
                      placeholder={isUr ? 'وجہ...' : 'Reason...'}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={savingAdvance}
                  className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/30 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {savingAdvance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {savingAdvance
                      ? tr('saving', lang)
                      : isUr
                      ? 'ایڈوانس محفوظ کریں'
                      : 'Save Advance Entry'}
                  </span>
                </button>
              </form>
            )}

            <div
              className={`${
                canEditSalaries ? 'xl:col-span-2' : ''
              } glass-panel rounded-2xl overflow-hidden`}
            >
              <div className="px-5 py-3.5 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">
                  {isUr ? 'ملازمین کے ایڈوانسز' : 'Employee Salary Advances'}
                </h3>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-4 text-start">{isUr ? 'ملازم' : 'Employee'}</th>
                      <th className="py-2 px-4 text-start">
                        {isUr ? 'تاریخ اور تفصیل' : 'Date & Notes'}
                      </th>
                      <th className="py-2 px-4 text-start">{tr('status', lang)}</th>
                      <th className="py-2 px-4 text-end">{tr('amountCol', lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {db.advances
                      .filter((a) => !a.deleted_at)
                      .sort((a, b) => b.advance_date.localeCompare(a.advance_date))
                      .map((adv) => {
                        const emp = db.employees.find((e) => e.id === adv.employee_id);
                        return (
                          <tr key={adv.id}>
                            <td className="py-2.5 px-4 font-semibold text-white">
                              {emp?.full_name || (isUr ? 'عملہ' : 'Staff')}
                            </td>
                            <td className="py-2.5 px-4 text-slate-300">
                              <span className="tabular-nums">
                                {formatDateDisplay(adv.advance_date, lang)}
                              </span>{' '}
                              · {adv.notes}
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={
                                  adv.is_settled
                                    ? 'text-emerald-400'
                                    : 'text-amber-300 font-semibold'
                                }
                              >
                                {adv.is_settled
                                  ? isUr
                                    ? `منہا شدہ (${adv.settled_month})`
                                    : `Settled (${adv.settled_month})`
                                  : isUr
                                  ? 'باقی (تنخواہ سے کٹے گا)'
                                  : 'Unsettled (Will Deduct)'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-end font-bold text-amber-300 tabular-nums">
                              {formatPKR(adv.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    {db.advances.filter((a) => !a.deleted_at).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-500">
                          {isUr
                            ? 'کوئی ایڈوانس اندراج موجود نہیں ہے۔'
                            : 'No advance salary entries recorded.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {isUr
                    ? `ماہانہ تنخواہ شیٹ (${payrollMonth})`
                    : `Monthly Salary Sheet (${payrollMonth})`}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isUr
                    ? 'حاضری کی کٹوتی اور غیر منہا شدہ ایڈوانسز خودکار حساب سے کٹتے ہیں۔ ادائیگی پر خرچ خودکار درج ہو جاتا ہے۔'
                    : 'Automatically calculates attendance deductions and deducts unsettled advances. Clicking Pay creates the expense entry.'}
                </p>
              </div>
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white tabular-nums"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">{isUr ? 'ملازم' : 'Employee'}</th>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? `حاضری (${payrollMonth})` : `Attendance (${payrollMonth})`}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'بنیادی / کمائی' : 'Basic / Earned'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'حاضری کٹوتی' : 'Att. Deduction'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'ایڈوانسز' : 'Advances'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'خالص ادائیگی' : 'Net Payable'}
                    </th>
                    {canEditSalaries && (
                      <th className="py-2.5 px-4 text-end">{isUr ? 'ادائیگی' : 'Disburse'}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {salarySheetRows.map((row) => (
                    <tr key={row.emp.id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{row.emp.full_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.emp.role_title} ·{' '}
                          {row.emp.employment_type === 'monthly'
                            ? isUr
                              ? 'ماہانہ'
                              : 'Monthly'
                            : isUr
                            ? 'دیہاڑی'
                            : 'Daily Wage'}
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-[11px] text-slate-300">
                        {isUr
                          ? `حاضر:${row.att.present} · غیرحاضر:${row.att.absent} · نصف:${row.att.halfDay} · رخصت:${row.att.leave}`
                          : `P:${row.att.present} · A:${row.att.absent} · H:${row.att.halfDay} · L:${row.att.leave}`}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-white font-medium">
                        {formatPKR(row.basicPay)}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-rose-300">
                        {row.attendanceDeduction > 0
                          ? `- ${formatPKR(row.attendanceDeduction)}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-amber-300">
                        {row.unsettledAdvances > 0
                          ? `- ${formatPKR(row.unsettledAdvances)}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums font-bold text-emerald-400">
                        {formatPKR(row.netPayable)}
                      </td>
                      {canEditSalaries && (
                        <td className="py-3 px-4 text-end">
                          {row.alreadyPaidThisMonth ? (
                            <span className="text-[11px] font-semibold text-emerald-400">
                              {isUr ? `ادا شدہ (${payrollMonth})` : `Paid (${payrollMonth})`}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={payingSalaryEmpId === row.emp.id}
                              onClick={async () => {
                                setPayingSalaryEmpId(row.emp.id);
                                try {
                                  await payEmployeeSalary({
                                    employeeId: row.emp.id,
                                    month: payrollMonth,
                                    netPayable: row.netPayable,
                                    totalAdvancesDeducted: row.unsettledAdvances,
                                    mode: 'Cash',
                                    notes: `Salary Sheet ${payrollMonth} (${row.emp.role_title})`,
                                  });
                                } finally {
                                  setPayingSalaryEmpId(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              {payingSalaryEmpId === row.emp.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Banknote className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {payingSalaryEmpId === row.emp.id
                                  ? tr('saving', lang)
                                  : isUr
                                  ? 'ادا کریں اور خرچ درج کریں'
                                  : 'Pay & Post Expense'}
                              </span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'categories' && canViewExpCats && (
        <div className="space-y-6">
          {isSuperAdmin && canEditExpCats && otherHallsForCopy.length > 0 && (
            <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{tr('copyFromHall', lang)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={copySourceHallId}
                  onChange={(e) => setCopySourceHallId(e.target.value)}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  {otherHallsForCopy.map((h) => (
                    <option key={h.id} value={h.id}>
                      {pickLocalized(h.name, h.name_ur, lang)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={copyingExpenses || !copySourceHallId}
                  onClick={async () => {
                    if (!copySourceHallId) return;
                    setCopyingExpenses(true);
                    try {
                      await copyExpenseTaxonomyFromHall(copySourceHallId);
                    } finally {
                      setCopyingExpenses(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {copyingExpenses ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{tr('copyListBtn', lang)}</span>
                </button>
              </div>
            </div>
          )}

          {inUsePrompt && (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">{inUsePrompt.name}</div>
                  <div className="text-amber-100/90 mt-0.5">{inUsePrompt.message}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const target = inUsePrompt;
                    setInUsePrompt(null);
                    if (target.kind === 'category') {
                      setBusyCatId(target.id);
                      try {
                        await toggleExpenseCategoryActive(target.id, false);
                      } finally {
                        setBusyCatId(null);
                      }
                    } else {
                      setBusySubId(target.id);
                      try {
                        await toggleExpenseSubcategoryActive(target.id, false);
                      } finally {
                        setBusySubId(null);
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold"
                >
                  {tr('deactivateInstead', lang)}
                </button>
                <button
                  type="button"
                  onClick={() => setInUsePrompt(null)}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300"
                >
                  {tr('cancel', lang)}
                </button>
              </div>
            </div>
          )}

          <div className={`grid grid-cols-1 ${canEditExpCats ? 'xl:grid-cols-3' : ''} gap-6`}>
            {canEditExpCats && (
              <div className="space-y-6">
                {/* Add / Edit Expense Category */}
                <form onSubmit={handleSaveCategory} className="glass-panel rounded-2xl p-5 space-y-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-cyan-400" />
                      <span>
                        {editingCatId
                          ? isUr
                            ? 'اخراجات کیٹیگری میں ترمیم'
                            : 'Edit Expense Category'
                          : isUr
                          ? 'نئی اخراجات کیٹیگری شامل کریں'
                          : 'Add Expense Category'}
                      </span>
                    </h3>
                    {editingCatId && (
                      <button
                        type="button"
                        onClick={resetCategoryForm}
                        className="text-slate-400 hover:text-white"
                      >
                        {tr('cancel', lang)}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {tr('englishLabel', lang)}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        required
                        value={catEn}
                        onChange={(e) => setCatEn(e.target.value)}
                        placeholder="Generator Fuel"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {tr('urduLabel', lang)}
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={catUr}
                        onChange={(e) => setCatUr(e.target.value)}
                        placeholder="جنریٹر فیول"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catActive}
                      onChange={(e) => setCatActive(e.target.checked)}
                    />
                    <span>{tr('active', lang)}</span>
                  </label>
                  <button
                    type="submit"
                    disabled={savingCategory}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {savingCategory ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingCategory
                        ? tr('saving', lang)
                        : editingCatId
                        ? tr('updateItem', lang)
                        : isUr
                        ? 'کیٹیگری محفوظ کریں'
                        : 'Save Category'}
                    </span>
                  </button>
                </form>

                {/* Add / Edit Expense Sub-category */}
                <form onSubmit={handleSaveSubcategory} className="glass-panel rounded-2xl p-5 space-y-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-amber-400" />
                      <span>
                        {editingSubId
                          ? isUr
                            ? 'ذیلی کیٹیگری میں ترمیم'
                            : 'Edit Sub-category'
                          : isUr
                          ? 'نئی ذیلی کیٹیگری شامل کریں'
                          : 'Add Sub-category'}
                      </span>
                    </h3>
                    {editingSubId && (
                      <button
                        type="button"
                        onClick={resetSubcategoryForm}
                        className="text-slate-400 hover:text-white"
                      >
                        {tr('cancel', lang)}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {tr('expenseCategoryLabel', lang)} *
                    </label>
                    <select
                      required
                      value={subParentCatId}
                      onChange={(e) => setSubParentCatId(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {allExpenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name_en} {c.name_ur ? `(${c.name_ur})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {tr('englishLabel', lang)}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        required
                        value={subEn}
                        onChange={(e) => setSubEn(e.target.value)}
                        placeholder="e.g. Florist"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {tr('urduLabel', lang)}
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={subUr}
                        onChange={(e) => setSubUr(e.target.value)}
                        placeholder="پھول والا"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subActive}
                      onChange={(e) => setSubActive(e.target.checked)}
                    />
                    <span>{tr('active', lang)}</span>
                  </label>
                  <button
                    type="submit"
                    disabled={savingSubcategory || allExpenseCategories.length === 0}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-cyan-600 text-slate-950 font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {savingSubcategory ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingSubcategory
                        ? tr('saving', lang)
                        : editingSubId
                        ? tr('updateItem', lang)
                        : isUr
                        ? 'ذیلی کیٹیگری محفوظ کریں'
                        : 'Save Sub-category'}
                    </span>
                  </button>
                </form>
              </div>
            )}

            {/* Two-Level Hierarchy Tree (EN & UR side-by-side) */}
            <div className={`${canEditExpCats ? 'xl:col-span-2' : ''} space-y-4`}>
              {allExpenseCategories.length === 0 && (
                <div className="glass-panel rounded-2xl p-8 text-center text-xs text-slate-500">
                  {tr('noRecords', lang)}
                </div>
              )}

              {allExpenseCategories.map((c, catIdx) => {
                const subs = allExpenseSubcategories.filter((s) => s.category_id === c.id);
                const missingTr = hasMissingBilingualPair(c.name_en, c.name_ur);
                const catBusy = busyCatId === c.id;

                return (
                  <div
                    key={c.id}
                    className={`glass-panel rounded-2xl overflow-hidden border ${
                      c.is_active === false ? 'border-slate-800/60 opacity-75' : 'border-slate-800'
                    }`}
                  >
                    <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="font-bold text-sm text-white" dir="ltr">
                          {c.name_en}
                        </span>
                        <span className="text-slate-600">/</span>
                        <span className="font-bold text-sm text-amber-300 font-urdu" dir="rtl">
                          {c.name_ur || '—'}
                        </span>
                        {missingTr && (
                          <span title={missingWarnTitle} className="text-amber-400 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            c.is_active !== false
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {c.is_active !== false ? tr('active', lang) : tr('inactive', lang)}
                        </span>
                      </div>

                      {canEditExpCats && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              resetSubcategoryForm();
                              setSubParentCatId(c.id);
                            }}
                            className="px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[11px] font-medium hover:bg-cyan-500/20"
                          >
                            + {isUr ? 'ذیلی' : 'Sub'}
                          </button>
                          <button
                            type="button"
                            disabled={catBusy || catIdx === 0}
                            onClick={() => moveExpCategoryOrder(c.id, -1)}
                            title={tr('moveUp', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={catBusy || catIdx === allExpenseCategories.length - 1}
                            onClick={() => moveExpCategoryOrder(c.id, 1)}
                            title={tr('moveDown', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={catBusy}
                            onClick={async () => {
                              setBusyCatId(c.id);
                              try {
                                await toggleExpenseCategoryActive(c.id, c.is_active === false);
                              } finally {
                                setBusyCatId(null);
                              }
                            }}
                            title={c.is_active !== false ? tr('deactivate', lang) : tr('active', lang)}
                            className={`p-1.5 rounded-lg border border-slate-800 ${
                              c.is_active !== false
                                ? 'text-emerald-400 hover:text-amber-300'
                                : 'text-slate-500 hover:text-emerald-300'
                            }`}
                          >
                            {catBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditCategory(c)}
                            title={tr('edit', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDeleteExpCats && (
                            <button
                              type="button"
                              disabled={catBusy}
                              onClick={async () => {
                                setBusyCatId(c.id);
                                try {
                                  const res = await softDeleteExpenseCategory(c.id);
                                  if (!res.ok && res.inUse && res.error) {
                                    setInUsePrompt({
                                      kind: 'category',
                                      id: c.id,
                                      name: `${c.name_en} / ${c.name_ur}`,
                                      message: res.error,
                                    });
                                  }
                                } finally {
                                  setBusyCatId(null);
                                }
                              }}
                              title={tr('delete', lang)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="divide-y divide-slate-800/60 px-4 text-xs">
                      {subs.length === 0 ? (
                        <div className="py-3 text-slate-500 italic">
                          {isUr ? 'کوئی ذیلی کیٹیگری نہیں (براہ راست کیٹیگری)' : 'No sub-categories (direct category)'}
                        </div>
                      ) : (
                        subs.map((sub, subIdx) => {
                          const subMissing = hasMissingBilingualPair(sub.name_en, sub.name_ur);
                          const subBusy = busySubId === sub.id;
                          return (
                            <div
                              key={sub.id}
                              className={`py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                                sub.is_active === false ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                <span className="font-semibold text-slate-100" dir="ltr">
                                  {sub.name_en}
                                </span>
                                <span className="text-slate-600">·</span>
                                <span className="font-semibold text-cyan-200 font-urdu" dir="rtl">
                                  {sub.name_ur || '—'}
                                </span>
                                {subMissing && (
                                  <span title={missingWarnTitle} className="text-amber-400 shrink-0">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </span>
                                )}
                                {sub.is_active === false && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {tr('inactive', lang)}
                                  </span>
                                )}
                              </div>

                              {canEditExpCats && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={subBusy || subIdx === 0}
                                    onClick={() => moveExpSubcategoryOrder(c.id, sub.id, -1)}
                                    title={tr('moveUp', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={subBusy || subIdx === subs.length - 1}
                                    onClick={() => moveExpSubcategoryOrder(c.id, sub.id, 1)}
                                    title={tr('moveDown', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={subBusy}
                                    onClick={async () => {
                                      setBusySubId(sub.id);
                                      try {
                                        await toggleExpenseSubcategoryActive(sub.id, sub.is_active === false);
                                      } finally {
                                        setBusySubId(null);
                                      }
                                    }}
                                    title={sub.is_active !== false ? tr('deactivate', lang) : tr('active', lang)}
                                    className={`p-1 rounded-lg border border-slate-800 ${
                                      sub.is_active !== false
                                        ? 'text-emerald-400 hover:text-amber-300'
                                        : 'text-slate-500 hover:text-emerald-300'
                                    }`}
                                  >
                                    {subBusy ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Power className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditSubcategory(sub)}
                                    title={tr('edit', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  {canDeleteExpCats && (
                                    <button
                                      type="button"
                                      disabled={subBusy}
                                      onClick={async () => {
                                        setBusySubId(sub.id);
                                        try {
                                          const res = await softDeleteExpenseSubcategory(sub.id);
                                          if (!res.ok && res.inUse && res.error) {
                                            setInUsePrompt({
                                              kind: 'subcategory',
                                              id: sub.id,
                                              name: `${sub.name_en} / ${sub.name_ur}`,
                                              message: res.error,
                                            });
                                          }
                                        } finally {
                                          setBusySubId(null);
                                        }
                                      }}
                                      title={tr('delete', lang)}
                                      className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-40"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
