import React, { useMemo, useState } from 'react';
import { Banknote, CalendarCheck, Edit3, Plus, Power, Trash2, Users, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { AttendanceStatus, Employee, PaymentMode } from '../types';
import { formatDateDisplay, formatNICInput, formatPKR, formatPakistaniPhoneInput, todayISO } from '../utils/formatters';

type ExpenseSubTab = 'expenses' | 'staff' | 'attendance' | 'payroll' | 'categories';

interface ExpensesViewProps {
  attendanceOnly?: boolean;
  initialSubTab?: ExpenseSubTab;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  attendanceOnly = false,
  initialSubTab,
}) => {
  const {
    db,
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
  } = useApp();

  const canViewExpenses = can('expenses', 'view');
  const canEditExpenses = can('expenses', 'edit');
  const canDeleteExpenses = can('expenses', 'delete');
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
      if (canViewAttendance) tabs.push({ id: 'attendance', label: 'Attendance' });
      return tabs;
    }
    if (canViewExpenses) tabs.push({ id: 'expenses', label: 'Expenses Ledger' });
    if (canViewEmployees) tabs.push({ id: 'staff', label: 'Employees' });
    if (canViewAttendance) tabs.push({ id: 'attendance', label: 'Attendance' });
    if (canViewSalaries) tabs.push({ id: 'payroll', label: 'Advances & Salary Sheet' });
    if (canViewExpenses) tabs.push({ id: 'categories', label: 'Categories' });
    return tabs;
  }, [attendanceOnly, canViewExpenses, canViewEmployees, canViewAttendance, canViewSalaries]);

  const defaultTab: ExpenseSubTab =
    initialSubTab && visibleSubTabs.some((t) => t.id === initialSubTab)
      ? initialSubTab
      : visibleSubTabs[0]?.id || 'attendance';

  const [subTab, setSubTab] = useState<ExpenseSubTab>(defaultTab);
  const activeSubTab: ExpenseSubTab = visibleSubTabs.some((t) => t.id === subTab)
    ? subTab
    : defaultTab;
  const today = todayISO();

  // New Expense Form
  const activeCategories = db.expenseCategories.filter((c) => !c.deleted_at);
  const activeBookings = useMemo(
    () => db.bookings.filter((b) => !b.deleted_at).sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [db.bookings]
  );
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id || '');
  const [bookingId, setBookingId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

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

  // New Category Form
  const [catEn, setCatEn] = useState('');
  const [catUr, setCatUr] = useState('');

  const activeExpenses = useMemo(
    () => db.expenses.filter((e) => !e.deleted_at).sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
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
    const numeric = Number(amount);
    if (!numeric || numeric <= 0 || !payee.trim()) return;
    const cat = activeCategories.find((c) => c.id === categoryId);
    await addExpense({
      category_id: categoryId,
      category_name: cat?.name_en || 'Other',
      booking_id: bookingId || null,
      employee_id: null,
      amount: numeric,
      expense_date: expenseDate,
      payee: payee.trim(),
      mode,
      reference_no: referenceNo.trim(),
      notes: notes.trim(),
    });
    setAmount('');
    setPayee('');
    setReferenceNo('');
    setNotes('');
    setBookingId('');
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
    if (!empName.trim() || !empRoleTitle.trim()) return;
    const existing = editingEmpId ? nonDeletedEmployees.find((x) => x.id === editingEmpId) : undefined;
    await saveEmployee({
      id: editingEmpId || undefined,
      full_name: empName.trim(),
      phone: empPhone.trim() || '0300-0000000',
      nic: empNic.trim(),
      role_title: empRoleTitle.trim(),
      employment_type: empType,
      base_rate: Number(empRate) || 0,
      is_active: existing ? existing.is_active : true,
    });
    resetEmployeeForm();
  };

  const handleAddAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = advEmpId || activeEmployees[0]?.id;
    const amt = Number(advAmount);
    if (!targetEmpId || !amt || amt <= 0) return;
    await addEmployeeAdvance({
      employee_id: targetEmpId,
      amount: amt,
      advance_date: advDate,
      mode: advMode,
      notes: advNotes.trim() || 'Salary advance',
    });
    setAdvAmount('');
    setAdvNotes('');
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catEn.trim()) return;
    await saveExpenseCategory({ name_en: catEn.trim(), name_ur: catUr.trim() || catEn.trim() });
    setCatEn('');
    setCatUr('');
  };

  // Monthly Attendance summary helper
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

  // Monthly Salary Sheet calculation
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
        // Daily wage: earnings based on worked days (Present + 0.5 * Half-day)
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
      {/* Sub-navigation tabs */}
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
              <h3 className="text-sm font-bold text-white">Record Expense</h3>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'ur' ? `${c.name_ur} (${c.name_en})` : c.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Link to Booking (Optional)</label>
              <select
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">General Hall Expense (Not linked to event)</option>
                {activeBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.booking_code} · {b.customer_name} ({b.event_date})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Payee / Vendor *</label>
              <input
                type="text"
                required
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Florist / Sound Team / Waiter Crew / K-Electric"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Amount (PKR) *</label>
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
                <label className="block text-xs text-slate-300 mb-1">Date</label>
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
                <label className="block text-xs text-slate-300 mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Reference</label>
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
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Save Expense</span>
            </button>
          </form>
          )}

          <div className={`${canEditExpenses ? 'xl:col-span-2' : ''} glass-panel rounded-2xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Expenses Ledger</h3>
              <span className="text-xs text-rose-300 font-semibold tabular-nums">
                Total: {formatPKR(activeExpenses.reduce((s, e) => s + e.amount, 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Date &amp; Category</th>
                    <th className="py-2.5 px-4 text-start">Payee &amp; Linked Booking</th>
                    <th className="py-2.5 px-4 text-start">Mode</th>
                    <th className="py-2.5 px-4 text-end">Amount</th>
                    {canDeleteExpenses && <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeExpenses.map((ex) => {
                    const linkedBk = ex.booking_id
                      ? db.bookings.find((b) => b.id === ex.booking_id)
                      : null;
                    return (
                      <tr key={ex.id} className="hover:bg-slate-900/30">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{ex.category_name}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {formatDateDisplay(ex.expense_date, lang)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-100">{ex.payee}</div>
                          {linkedBk && (
                            <div className="text-[11px] text-cyan-300 tabular-nums">
                              Linked: {linkedBk.booking_code} ({linkedBk.customer_name})
                            </div>
                          )}
                          {ex.notes && <div className="text-[11px] text-slate-400">{ex.notes}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {ex.mode} {ex.reference_no ? `· ${ex.reference_no}` : ''}
                        </td>
                        <td className="py-3 px-4 text-end font-bold text-rose-300 tabular-nums">
                          {formatPKR(ex.amount)}
                        </td>
                        {canDeleteExpenses && (
                          <td className="py-3 px-4 text-end">
                            <button
                              type="button"
                              onClick={() => softDeleteExpense(ex.id)}
                              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                  <span>{editingEmpId ? 'Edit Staff Member' : 'Add Staff Member'}</span>
                </h3>
              {editingEmpId && (
                <button
                  type="button"
                  onClick={resetEmployeeForm}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Role / Job Title *</label>
              <input
                type="text"
                required
                value={empRoleTitle}
                onChange={(e) => setEmpRoleTitle(e.target.value)}
                placeholder="Waiter / Peon / Sweeper / Supervisor"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(formatPakistaniPhoneInput(e.target.value))}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">CNIC</label>
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
                <label className="block text-xs text-slate-300 mb-1">Pay Type</label>
                <select
                  value={empType}
                  onChange={(e) => setEmpType(e.target.value as 'monthly' | 'daily_wage')}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="monthly">Monthly Salaried</option>
                  <option value="daily_wage">Daily Wage (Waiter)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Base Rate (PKR)</label>
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
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
            >
              {editingEmpId ? 'Update Staff Member' : 'Add Staff Member'}
            </button>
          </form>
          )}

          <div className={`${canEditEmployees ? 'xl:col-span-2' : ''} glass-panel rounded-2xl overflow-hidden`}>
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Staff Directory ({activeEmployees.length} Active)</h3>
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactiveStaff}
                  onChange={(e) => setShowInactiveStaff(e.target.checked)}
                />
                <span>Show Deactivated</span>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Staff Member</th>
                    <th className="py-2.5 px-4 text-start">Type &amp; Status</th>
                    <th className="py-2.5 px-4 text-end">Rate (PKR)</th>
                    {(canEditEmployees || canDeleteEmployees) && (
                      <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {visibleEmployees.map((emp) => (
                    <tr key={emp.id} className={`hover:bg-slate-900/30 ${!emp.is_active ? 'opacity-55' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{emp.full_name}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {emp.role_title} · {emp.phone}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={emp.employment_type === 'monthly' ? 'text-cyan-300' : 'text-amber-300'}>
                          {emp.employment_type === 'monthly' ? 'Monthly Salary' : 'Daily Wage'}
                        </div>
                        <div className={`text-[11px] ${emp.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {emp.is_active ? 'Active' : 'Deactivated'}
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
                                  title="Edit employee"
                                  className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleEmployeeActive(emp.id, !emp.is_active)}
                                  title={emp.is_active ? 'Deactivate' : 'Reactivate'}
                                  className={`p-1.5 rounded-lg border border-slate-800 ${
                                    emp.is_active
                                      ? 'text-slate-300 hover:text-amber-300'
                                      : 'text-emerald-400 hover:text-emerald-300'
                                  }`}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canDeleteEmployees && (
                              <button
                                type="button"
                                onClick={() => softDeleteEmployee(emp.id)}
                                title="Move to Bin"
                                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          {/* Daily Attendance Marking */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-cyan-400" />
                <span>Daily Attendance</span>
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
                  <div key={emp.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">{emp.full_name}</div>
                      <div className="text-[11px] text-slate-400">{emp.role_title}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['Present', 'Absent', 'Half-day', 'Leave'] as AttendanceStatus[]).map((st) => {
                        const selected = currentRec?.status === st;
                        const activeCls =
                          st === 'Present'
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                            : st === 'Absent'
                            ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                            : st === 'Half-day'
                            ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                            : 'border-cyan-500 bg-cyan-500/20 text-cyan-300';
                        return (
                          <button
                            key={st}
                            type="button"
                            disabled={!canEditAttendance}
                            onClick={() => saveAttendance(emp.id, attDate, st)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              selected
                                ? activeCls
                                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                            }`}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {activeEmployees.length === 0 && (
                <p className="p-6 text-xs text-slate-500">No active employees found.</p>
              )}
            </div>
          </div>

          {/* Monthly Attendance Sheet */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">Monthly Attendance Sheet</h3>
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
                    <th className="py-2.5 px-4 text-start">Employee</th>
                    <th className="py-2.5 px-3 text-end text-emerald-400">Present</th>
                    <th className="py-2.5 px-3 text-end text-rose-400">Absent</th>
                    <th className="py-2.5 px-3 text-end text-amber-300">Half-day</th>
                    <th className="py-2.5 px-3 text-end text-cyan-300">Leave</th>
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
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-emerald-300">{sum.present}</td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-rose-300">{sum.absent}</td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-amber-300">{sum.halfDay}</td>
                        <td className="py-3 px-3 text-end tabular-nums font-semibold text-cyan-300">{sum.leave}</td>
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
          {/* Advances Form + Recent Advances */}
          <div className={`grid grid-cols-1 ${canEditSalaries ? 'xl:grid-cols-3' : ''} gap-6`}>
            {canEditSalaries && (
              <form onSubmit={handleAddAdvance} className="glass-panel rounded-2xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-400" />
                <span>Record Salary Advance</span>
              </h3>
              <div>
                <label className="block text-slate-300 mb-1">Employee</label>
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
                  <label className="block text-slate-300 mb-1">Advance Amount (PKR) *</label>
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
                  <label className="block text-slate-300 mb-1">Date</label>
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
                  <label className="block text-slate-300 mb-1">Mode</label>
                  <select
                    value={advMode}
                    onChange={(e) => setAdvMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Notes</label>
                  <input
                    type="text"
                    value={advNotes}
                    onChange={(e) => setAdvNotes(e.target.value)}
                    placeholder="Reason..."
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold hover:bg-amber-500/30"
              >
                Save Advance Entry
              </button>
            </form>
            )}

            <div className={`${canEditSalaries ? 'xl:col-span-2' : ''} glass-panel rounded-2xl overflow-hidden`}>
              <div className="px-5 py-3.5 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Employee Salary Advances</h3>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-4 text-start">Employee</th>
                      <th className="py-2 px-4 text-start">Date &amp; Notes</th>
                      <th className="py-2 px-4 text-start">Status</th>
                      <th className="py-2 px-4 text-end">Amount</th>
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
                            <td className="py-2.5 px-4 font-semibold text-white">{emp?.full_name || 'Staff'}</td>
                            <td className="py-2.5 px-4 text-slate-300 tabular-nums">
                              {formatDateDisplay(adv.advance_date, lang)} · {adv.notes}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className={adv.is_settled ? 'text-emerald-400' : 'text-amber-300 font-semibold'}>
                                {adv.is_settled ? `Settled (${adv.settled_month})` : 'Unsettled (Will Deduct)'}
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
                          No advance salary entries recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Monthly Salary Sheet */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Monthly Salary Sheet ({payrollMonth})</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Automatically calculates attendance deductions &amp; deducts unsettled advances. Clicking Pay creates the expense entry.
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
                    <th className="py-2.5 px-4 text-start">Employee</th>
                    <th className="py-2.5 px-4 text-start">Attendance ({payrollMonth})</th>
                    <th className="py-2.5 px-4 text-end">Basic / Earned</th>
                    <th className="py-2.5 px-4 text-end">Att. Deduction</th>
                    <th className="py-2.5 px-4 text-end">Advances</th>
                    <th className="py-2.5 px-4 text-end">Net Payable</th>
                    {canEditSalaries && <th className="py-2.5 px-4 text-end">Disburse</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {salarySheetRows.map((row) => (
                    <tr key={row.emp.id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{row.emp.full_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.emp.role_title} · {row.emp.employment_type === 'monthly' ? 'Monthly' : 'Daily Wage'}
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-[11px] text-slate-300">
                        P:{row.att.present} · A:{row.att.absent} · H:{row.att.halfDay} · L:{row.att.leave}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-white font-medium">
                        {formatPKR(row.basicPay)}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-rose-300">
                        {row.attendanceDeduction > 0 ? `- ${formatPKR(row.attendanceDeduction)}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums text-amber-300">
                        {row.unsettledAdvances > 0 ? `- ${formatPKR(row.unsettledAdvances)}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-end tabular-nums font-bold text-emerald-400">
                        {formatPKR(row.netPayable)}
                      </td>
                      {canEditSalaries && (
                        <td className="py-3 px-4 text-end">
                          {row.alreadyPaidThisMonth ? (
                            <span className="text-[11px] font-semibold text-emerald-400">Paid ({payrollMonth})</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                payEmployeeSalary({
                                  employeeId: row.emp.id,
                                  month: payrollMonth,
                                  netPayable: row.netPayable,
                                  totalAdvancesDeducted: row.unsettledAdvances,
                                  mode: 'Cash',
                                  notes: `Salary Sheet ${payrollMonth} (${row.emp.role_title})`,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/25"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>Pay &amp; Post Expense</span>
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

      {activeSubTab === 'categories' && canViewExpenses && (
        <div className={`grid grid-cols-1 ${canEditExpenses ? 'md:grid-cols-2' : ''} gap-6`}>
          {canEditExpenses && (
            <form onSubmit={handleAddCategory} className="glass-panel rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">Add Expense Category</h3>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category Name (English) *</label>
                <input
                  type="text"
                  required
                  value={catEn}
                  onChange={(e) => setCatEn(e.target.value)}
                  placeholder="Generator Fuel"
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category Name (Urdu)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={catUr}
                  onChange={(e) => setCatUr(e.target.value)}
                  placeholder="جنریٹر فیول"
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-urdu"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
              >
                Add Category
              </button>
            </form>
          )}

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Active Expense Categories</h3>
            <div className="divide-y divide-slate-800/70">
              {activeCategories.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-white">{c.name_en}</span>
                  <span className="font-urdu text-slate-300">{c.name_ur}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
