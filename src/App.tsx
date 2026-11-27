import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { AuditLogView } from './components/AuditLogView';
import { BookingModal } from './components/BookingModal';
import { BookingsView } from './components/BookingsView';
import { CalendarView } from './components/CalendarView';
import { DashboardView } from './components/DashboardView';
import { ExpensesView } from './components/ExpensesView';
import { ImportView } from './components/ImportView';
import { InvoiceModal } from './components/InvoiceModal';
import { Layout, NavTabId } from './components/Layout';
import { PaymentsView } from './components/PaymentsView';
import { RecycleBinView } from './components/RecycleBinView';
import { RemindersView } from './components/RemindersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { UsersView } from './components/UsersView';
import { Booking } from './types';

const MainShell: React.FC = () => {
  const { currentUser, errorMsg, clearError, loading } = useApp();
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [editingBooking, setEditingBooking] = useState<Booking | null | undefined>(undefined);
  const [newBookingInitialDate, setNewBookingInitialDate] = useState<string | undefined>(undefined);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);

  if (!currentUser) {
    return <AuthScreen />;
  }

  const openNewBooking = (dateISO?: string) => {
    setNewBookingInitialDate(dateISO);
    setEditingBooking(null);
  };

  const openExistingBooking = (bk: Booking) => {
    setNewBookingInitialDate(undefined);
    setEditingBooking(bk);
  };

  return (
    <Layout
      activeTab={activeTab}
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

      {activeTab === 'dashboard' && (
        <DashboardView
          onOpenBooking={openExistingBooking}
          onOpenInvoice={(bk) => setInvoiceBooking(bk)}
          onNavigateReminders={() => setActiveTab('reminders')}
        />
      )}

      {activeTab === 'calendar' && (
        <CalendarView
          onSelectBooking={openExistingBooking}
          onCreateOnDate={(iso) => openNewBooking(iso)}
        />
      )}

      {activeTab === 'bookings' && (
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

      {activeTab === 'payments' && (
        <PaymentsView
          initialBookingId={paymentBookingId}
          onOpenInvoice={(bk) => setInvoiceBooking(bk)}
        />
      )}

      {activeTab === 'expenses' && <ExpensesView />}
      {activeTab === 'reports' && <ReportsView />}
      {activeTab === 'reminders' && <RemindersView />}
      {activeTab === 'import' && <ImportView />}
      {activeTab === 'recycle' && <RecycleBinView />}
      {activeTab === 'audit' && <AuditLogView />}
      {activeTab === 'users' && <UsersView />}
      {activeTab === 'settings' && <SettingsView />}

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
