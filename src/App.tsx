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
import { ImportView } from './components/ImportView';
import { InvoiceModal } from './components/InvoiceModal';
import { InvoicesView } from './components/InvoicesView';
import { Layout, NavTabId, TAB_TO_SCREEN_KEY } from './components/Layout';
import { PaymentsView } from './components/PaymentsView';
import { RecycleBinView } from './components/RecycleBinView';
import { RemindersView } from './components/RemindersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { UsersView } from './components/UsersView';
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
  'settings',
];

const MainShell: React.FC = () => {
  const { currentUser, can, errorMsg, clearError, loading, authInitializing } = useApp();
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [editingBooking, setEditingBooking] = useState<Booking | null | undefined>(undefined);
  const [newBookingInitialDate, setNewBookingInitialDate] = useState<string | undefined>(undefined);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);

  const firstPermittedTab = useMemo<NavTabId | null>(() => {
    if (!currentUser) return null;
    for (const tab of TAB_ORDER) {
      if (can(TAB_TO_SCREEN_KEY[tab], 'view')) return tab;
    }
    return null;
  }, [currentUser, can]);

  useEffect(() => {
    if (!currentUser || !firstPermittedTab) return;
    if (!can(TAB_TO_SCREEN_KEY[activeTab], 'view')) {
      setActiveTab(firstPermittedTab);
    }
  }, [currentUser, activeTab, can, firstPermittedTab]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] text-slate-900 dark:text-slate-100">
        <div className="max-w-md w-full rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 text-center shadow-lg">
          <p className="text-sm font-medium">
            App is not configured. Please contact the administrator.
          </p>
        </div>
      </div>
    );
  }

  if (authInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-[#060913] text-slate-700 dark:text-slate-300">
        <div className="text-sm font-medium">Verifying session...</div>
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

  const safeTab: NavTabId | null = can(TAB_TO_SCREEN_KEY[activeTab], 'view')
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
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <div className="mb-4 p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-xs">
          Syncing records...
        </div>
      )}

      {!safeTab && (
        <div className="glass-panel rounded-2xl p-8 text-center space-y-2">
          <div className="text-base font-bold text-white">No Screens Assigned</div>
          <p className="text-xs text-slate-400">
            Your account does not currently have View permission for any screens. Please ask your Super Admin or Hall Admin to grant access.
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
      {safeTab === 'expenses' && <ExpensesView key="expenses" initialSubTab="expenses" />}
      {safeTab === 'employees' && <ExpensesView key="employees" initialSubTab="staff" />}
      {safeTab === 'attendance' && <ExpensesView key="attendance" initialSubTab="attendance" />}
      {safeTab === 'salaries' && <ExpensesView key="salaries" initialSubTab="payroll" />}
      {safeTab === 'reports' && <ReportsView />}
      {safeTab === 'reminders' && <RemindersView />}
      {safeTab === 'import' && <ImportView />}
      {safeTab === 'recycle' && <RecycleBinView />}
      {safeTab === 'audit' && <AuditLogView />}
      {safeTab === 'users' && <UsersView />}
      {safeTab === 'settings' && <SettingsView key="settings" />}

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
