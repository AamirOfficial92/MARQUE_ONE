import React, { useEffect, useMemo, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ApprovalsView } from './components/ApprovalsView';
import { AuthScreen } from './components/AuthScreen';
import { AuditLogView } from './components/AuditLogView';
import { BookingModal } from './components/BookingModal';
import { BookingsView } from './components/BookingsView';
import { CalendarView } from './components/CalendarView';
import { CustomersView } from './components/CustomersView';
import { DailyClosingView } from './components/DailyClosingView';
import { DashboardView } from './components/DashboardView';
import { ExpensesView } from './components/ExpensesView';
import { HallsView } from './components/HallsView';
import { ImportView } from './components/ImportView';
import { InvoiceModal } from './components/InvoiceModal';
import { InvoicesView } from './components/InvoicesView';
import { Layout, NavTabId, TAB_TO_SCREEN_KEY } from './components/Layout';
import { PaymentsView } from './components/PaymentsView';
import { RecycleBinView } from './components/RecycleBinView';
import { RemindersView } from './components/RemindersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { SaveFeedbackToasts } from './components/SaveFeedbackToasts';
import { UsersView } from './components/UsersView';
import { tr } from './i18n/translations';
import { Booking } from './types';

import { isSupabaseConfigured } from './lib/supabase';

const TAB_ORDER: NavTabId[] = [
  'dashboard',
  'calendar',
  'bookings',
  'approvals',
  'customers',
  'payments',
  'invoices',
  'closing',
  'catalog',
  'expenses',
  'employees',
  'attendance',
  'salaries',
  'reports',
  'reminders',
  'import',
  'recycle',
  'audit',
  'users',
  'halls',
  'settings',
];

const MainShell: React.FC = () => {
  const {
    db,
    rawDb,
    currentUser,
    can,
    errorMsg,
    clearError,
    loading,
    authInitializing,
    lang,
    pendingViewTarget,
    clearPendingViewTarget,
  } = useApp();
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [editingBooking, setEditingBooking] = useState<Booking | null | undefined>(undefined);
  const [newBookingInitialDate, setNewBookingInitialDate] = useState<string | undefined>(undefined);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);
  const [requestedSettingsSubTab, setRequestedSettingsSubTab] = useState<
    { tab: 'hall' | 'pricing' | 'catalog' | 'events' | 'backup'; nonce: number } | undefined
  >(undefined);
  const [requestedExpenseSubTab, setRequestedExpenseSubTab] = useState<
    { tab: 'expenses' | 'staff' | 'attendance' | 'payroll' | 'categories'; nonce: number } | undefined
  >(undefined);

  const canAccessTab = React.useCallback(
    (tab: NavTabId): boolean => {
      if (tab === 'expenses') {
        return can('expenses', 'view') || can('expense_categories', 'view');
      }
      if (tab === 'settings') {
        return (
          can('settings', 'view') ||
          can('event_categories', 'view') ||
          can('catalog', 'view')
        );
      }
      return can(TAB_TO_SCREEN_KEY[tab], 'view');
    },
    [can]
  );

  const firstPermittedTab = useMemo<NavTabId | null>(() => {
    if (!currentUser) return null;
    for (const tab of TAB_ORDER) {
      if (canAccessTab(tab)) return tab;
    }
    return null;
  }, [currentUser, canAccessTab]);

  useEffect(() => {
    if (!currentUser || !firstPermittedTab) return;
    if (!canAccessTab(activeTab)) {
      setActiveTab(firstPermittedTab);
    }
  }, [currentUser, activeTab, canAccessTab, firstPermittedTab]);

  useEffect(() => {
    if (!pendingViewTarget || !currentUser) return;
    const { tab, bookingId, subTab } = pendingViewTarget;
    if (canAccessTab(tab)) {
      setActiveTab(tab);
      if (tab === 'payments' && bookingId) {
        setPaymentBookingId(bookingId);
      } else if (tab === 'bookings' && bookingId) {
        const targetBk =
          db.bookings.find((b) => b.id === bookingId) ||
          rawDb.bookings.find((b) => b.id === bookingId);
        if (targetBk && !targetBk.deleted_at) {
          setNewBookingInitialDate(undefined);
          setEditingBooking(targetBk);
        }
      }
      if (tab === 'settings' && subTab) {
        if (
          subTab === 'hall' ||
          subTab === 'pricing' ||
          subTab === 'catalog' ||
          subTab === 'events' ||
          subTab === 'backup'
        ) {
          setRequestedSettingsSubTab({ tab: subTab, nonce: Date.now() });
        }
      }
      if (tab === 'expenses' && subTab) {
        if (
          subTab === 'expenses' ||
          subTab === 'staff' ||
          subTab === 'attendance' ||
          subTab === 'payroll' ||
          subTab === 'categories'
        ) {
          setRequestedExpenseSubTab({ tab: subTab, nonce: Date.now() });
        }
      }
    }
    clearPendingViewTarget();
  }, [pendingViewTarget, currentUser, can, db.bookings, rawDb.bookings, clearPendingViewTarget]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] text-slate-900 dark:text-slate-100">
        <div className="max-w-md w-full rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 text-center shadow-lg">
          <p className="text-sm font-medium">
            {tr('appNotConfiguredDesc', lang)}
          </p>
        </div>
      </div>
    );
  }

  if (authInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] text-slate-700 dark:text-slate-300">
        <div className="text-sm font-medium">
          {lang === 'ur' ? 'سیشن کی تصدیق ہو رہی ہے...' : 'Verifying session...'}
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  const openNewBooking = (dateISO?: string) => {
    if (!can('bookings', 'edit')) return;
    setNewBookingInitialDate(dateISO);
    setEditingBooking(null);
  };

  const openExistingBooking = (bk: Booking) => {
    if (!can('bookings', 'view') && !can('calendar', 'view') && !can('dashboard', 'view')) return;
    setNewBookingInitialDate(undefined);
    setEditingBooking(bk);
  };

  const safeTab: NavTabId | null = canAccessTab(activeTab)
    ? activeTab
    : firstPermittedTab;

  return (
    <Layout
      activeTab={safeTab || 'dashboard'}
      onSelectTab={setActiveTab}
      onNewBooking={() => openNewBooking()}
      onOpenBookingFromSearch={(bk) => openExistingBooking(bk)}
    >
      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-200 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={clearError} className="underline ms-3">
            {lang === 'ur' ? 'بند کریں' : 'Dismiss'}
          </button>
        </div>
      )}

      {loading && (
        <div className="mb-4 p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-xs">
          {lang === 'ur' ? 'ریکارڈز سنک ہو رہے ہیں...' : 'Syncing records...'}
        </div>
      )}

      {!safeTab && (
        <div className="glass-panel rounded-2xl p-8 text-center space-y-2">
          <div className="text-base font-bold text-white">
            {lang === 'ur' ? 'کوئی اسکرین تفویض نہیں کی گئی' : 'No Screens Assigned'}
          </div>
          <p className="text-xs text-slate-400">
            {lang === 'ur'
              ? 'آپ کے اکاؤنٹ کو فی الحال کسی اسکرین کو دیکھنے کی اجازت نہیں ہے۔ براہِ کرم سپر ایڈمن یا ہال ایڈمن سے رابطہ کریں۔'
              : 'Your account does not currently have View permission for any screens. Please ask your Super Admin or Hall Admin to grant access.'}
          </p>
        </div>
      )}

      {safeTab === 'dashboard' && (
        <DashboardView
          onOpenBooking={openExistingBooking}
          onOpenInvoice={(bk) => setInvoiceBooking(bk)}
          onNavigateReminders={() => setActiveTab('reminders')}
        />
      )}

      {safeTab === 'calendar' && (
        <CalendarView
          onSelectBooking={openExistingBooking}
          onCreateOnDate={(iso) => openNewBooking(iso)}
        />
      )}

      {safeTab === 'bookings' && (
        <BookingsView
          onNewBooking={() => openNewBooking()}
          onEditBooking={openExistingBooking}
          onOpenInvoice={(bk) => setInvoiceBooking(bk)}
          onGoToPayments={(bookingId) => {
            setPaymentBookingId(bookingId);
            setActiveTab('payments');
          }}
        />
      )}

      {safeTab === 'customers' && <CustomersView />}

      {safeTab === 'payments' && (
        <PaymentsView
          initialBookingId={paymentBookingId}
          onOpenInvoice={(bk) => setInvoiceBooking(bk)}
        />
      )}

      {safeTab === 'invoices' && (
        <InvoicesView onOpenInvoice={(bk) => setInvoiceBooking(bk)} />
      )}

      {safeTab === 'closing' && <DailyClosingView />}
      {safeTab === 'approvals' && <ApprovalsView />}
      {safeTab === 'catalog' && <SettingsView key="catalog" initialTab="catalog" catalogOnly />}
      {safeTab === 'expenses' && (
        <ExpensesView
          key="expenses"
          initialSubTab="expenses"
          requestedSubTab={requestedExpenseSubTab}
        />
      )}
      {safeTab === 'employees' && <ExpensesView key="employees" initialSubTab="staff" />}
      {safeTab === 'attendance' && <ExpensesView key="attendance" initialSubTab="attendance" />}
      {safeTab === 'salaries' && <ExpensesView key="salaries" initialSubTab="payroll" />}
      {safeTab === 'reports' && <ReportsView />}
      {safeTab === 'reminders' && <RemindersView />}
      {safeTab === 'import' && <ImportView />}
      {safeTab === 'recycle' && <RecycleBinView />}
      {safeTab === 'audit' && <AuditLogView />}
      {safeTab === 'users' && <UsersView />}
      {safeTab === 'halls' && <HallsView />}
      {safeTab === 'settings' && (
        <SettingsView key="settings" requestedSubTab={requestedSettingsSubTab} />
      )}

      {editingBooking !== undefined && (
        <BookingModal
          booking={editingBooking}
          initialDate={newBookingInitialDate}
          onClose={() => setEditingBooking(undefined)}
        />
      )}

      {invoiceBooking && (
        <InvoiceModal
          booking={invoiceBooking}
          onClose={() => setInvoiceBooking(null)}
        />
      )}

      <SaveFeedbackToasts />
    </Layout>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainShell />
    </AppProvider>
  );
}
