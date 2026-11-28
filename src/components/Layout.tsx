import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HALL_LOGO_SRC } from '../data/seedData';
import { pickLocalized, tr, translateFloor, translateRole, translateStatus } from '../i18n/translations';
import { Booking, PermissionScreenKey, UserRole } from '../types';
import { formatDateDisplay } from '../utils/formatters';

export type NavTabId =
  | 'dashboard'
  | 'calendar'
  | 'bookings'
  | 'approvals'
  | 'customers'
  | 'payments'
  | 'invoices'
  | 'closing'
  | 'catalog'
  | 'expenses'
  | 'employees'
  | 'attendance'
  | 'salaries'
  | 'reports'
  | 'reminders'
  | 'import'
  | 'recycle'
  | 'audit'
  | 'users'
  | 'halls'
  | 'settings';

interface LayoutProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  onNewBooking: () => void;
  onOpenBookingFromSearch: (booking: Booking) => void;
  children: React.ReactNode;
}

export interface NavItemConfig {
  id: NavTabId;
  screenKey: PermissionScreenKey;
  labelKey: Parameters<typeof tr>[0];
  icon: React.ReactNode;
}

export const TAB_TO_SCREEN_KEY: Record<NavTabId, PermissionScreenKey> = {
  dashboard: 'dashboard',
  calendar: 'calendar',
  bookings: 'bookings',
  approvals: 'bookings',
  customers: 'customers',
  payments: 'payments',
  invoices: 'invoices',
  closing: 'daily_closing',
  catalog: 'catalog',
  expenses: 'expenses',
  employees: 'employees',
  attendance: 'attendance',
  salaries: 'salaries',
  reports: 'reports',
  reminders: 'reminders',
  import: 'backup_import',
  recycle: 'recycle_bin',
  audit: 'audit_log',
  users: 'users',
  halls: 'halls',
  settings: 'settings',
};

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onSelectTab,
  onNewBooking,
  onOpenBookingFromSearch,
  children,
}) => {
  const {
    db,
    activeHall,
    activeHallId,
    setActiveHallId,
    currentUser,
    can,
    lang,
    toggleLang,
    theme,
    toggleTheme,
    signOut,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const role: UserRole = currentUser?.role || 'manager';

  const pendingApprovalsCount = useMemo(
    () => db.approvalRequests.filter((r) => r.status === 'pending').length,
    [db.approvalRequests]
  );

  const navItems: NavItemConfig[] = useMemo(
    () => [
      { id: 'dashboard', screenKey: 'dashboard', labelKey: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'calendar', screenKey: 'calendar', labelKey: 'calendar', icon: <CalendarDays className="w-4 h-4" /> },
      { id: 'bookings', screenKey: 'bookings', labelKey: 'bookings', icon: <ClipboardList className="w-4 h-4" /> },
      { id: 'approvals', screenKey: 'bookings', labelKey: 'approvals', icon: <ShieldCheck className="w-4 h-4" /> },
      { id: 'customers', screenKey: 'customers', labelKey: 'customers', icon: <Users className="w-4 h-4" /> },
      { id: 'payments', screenKey: 'payments', labelKey: 'payments', icon: <CreditCard className="w-4 h-4" /> },
      { id: 'invoices', screenKey: 'invoices', labelKey: 'invoices', icon: <FileText className="w-4 h-4" /> },
      { id: 'closing', screenKey: 'daily_closing', labelKey: 'dailyClosing', icon: <ClipboardCheck className="w-4 h-4" /> },
      { id: 'catalog', screenKey: 'catalog', labelKey: 'catalog', icon: <Sparkles className="w-4 h-4" /> },
      { id: 'expenses', screenKey: 'expenses', labelKey: 'expenses', icon: <Receipt className="w-4 h-4" /> },
      { id: 'employees', screenKey: 'employees', labelKey: 'employees', icon: <UserCheck className="w-4 h-4" /> },
      { id: 'attendance', screenKey: 'attendance', labelKey: 'attendance', icon: <CalendarCheck className="w-4 h-4" /> },
      { id: 'salaries', screenKey: 'salaries', labelKey: 'salaries', icon: <Wallet className="w-4 h-4" /> },
      { id: 'reports', screenKey: 'reports', labelKey: 'reports', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'reminders', screenKey: 'reminders', labelKey: 'reminders', icon: <Bell className="w-4 h-4" /> },
      { id: 'import', screenKey: 'backup_import', labelKey: 'importData', icon: <FileSpreadsheet className="w-4 h-4" /> },
      { id: 'recycle', screenKey: 'recycle_bin', labelKey: 'recycleBin', icon: <Trash2 className="w-4 h-4" /> },
      { id: 'audit', screenKey: 'audit_log', labelKey: 'auditLog', icon: <History className="w-4 h-4" /> },
      { id: 'users', screenKey: 'users', labelKey: 'users', icon: <UserCog className="w-4 h-4" /> },
      { id: 'halls', screenKey: 'halls', labelKey: role === 'super_admin' ? 'halls' : 'hallProfile', icon: <Building2 className="w-4 h-4" /> },
      { id: 'settings', screenKey: 'settings', labelKey: 'settings', icon: <Settings className="w-4 h-4" /> },
    ],
    [role]
  );

  const permittedNav = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.id === 'expenses') {
          return can('expenses', 'view') || can('expense_categories', 'view');
        }
        if (item.id === 'settings') {
          return (
            can('settings', 'view') ||
            can('event_categories', 'view') ||
            can('catalog', 'view')
          );
        }
        return can(item.screenKey, 'view');
      }),
    [navItems, can]
  );

  const canSearchBookings =
    can('bookings', 'view') ||
    can('calendar', 'view') ||
    can('dashboard', 'view') ||
    can('invoices', 'view') ||
    can('payments', 'view');

  // Global search across active hall's booking code, customer name, phone, NIC, or event date
  const searchResults = useMemo(() => {
    if (!canSearchBookings) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return db.bookings
      .filter((b) => !b.deleted_at)
      .filter(
        (b) =>
          b.booking_code.toLowerCase().includes(q) ||
          b.customer_name.toLowerCase().includes(q) ||
          b.customer_phone.toLowerCase().includes(q) ||
          b.customer_nic.toLowerCase().includes(q) ||
          b.event_date.includes(q)
      )
      .slice(0, 6);
  }, [searchQuery, db.bookings, canSearchBookings]);

  const canCreateBooking = can('bookings', 'edit');

  const mobilePrimary = permittedNav.slice(0, 4);
  const mobileOverflow = permittedNav.slice(4);

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900 dark:bg-[#060913] dark:text-slate-100 transition-colors">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-e border-slate-800/80 bg-white/95 dark:bg-[#090E1B]/95 backdrop-blur-xl sticky top-0 h-screen">
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <img
            src={activeHall.logo_url || HALL_LOGO_SRC}
            alt={activeHall.name}
            crossOrigin={(activeHall.logo_url || '').startsWith('http') ? 'anonymous' : undefined}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-amber-500/30 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-bold text-sm text-white truncate">
              {pickLocalized(activeHall.name, activeHall.name_ur, lang)}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {tr('supabaseLiveBadge', lang)}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {permittedNav.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/15 text-cyan-300 border border-cyan-500/35 shadow-[0_0_20px_-8px_rgba(6,182,212,0.5)]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{tr(item.labelKey, lang)}</span>
                </span>
                {item.id === 'approvals' && pendingApprovalsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold tabular-nums">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-3">
          <button
            type="button"
            onClick={toggleLang}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 text-xs font-medium text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {lang === 'ur'
                  ? `${tr('languageLabel', lang)}: ${tr('urduName', lang)}`
                  : `${tr('languageLabel', lang)}: ${tr('englishName', lang)}`}
              </span>
            </span>
            <span className="text-cyan-400 font-semibold">{tr('switchToOtherLang', lang)}</span>
          </button>

          <div className="flex items-center justify-between gap-2 px-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100 truncate">
                {currentUser?.full_name}
              </div>
              <div className="text-[11px] text-amber-400/90 truncate">
                {translateRole(role, lang)}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              title={tr('logout', lang)}
              className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 border-b border-slate-800/80 bg-white/90 dark:bg-[#060913]/90 backdrop-blur-xl px-4 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={activeHall.logo_url || HALL_LOGO_SRC}
              alt={activeHall.name}
              crossOrigin={(activeHall.logo_url || '').startsWith('http') ? 'anonymous' : undefined}
              referrerPolicy="no-referrer"
              className="lg:hidden w-8 h-8 rounded-lg object-cover border border-amber-500/30 shrink-0"
            />
            <span className="text-base lg:text-lg font-bold text-white whitespace-nowrap shrink-0 truncate">
              {tr(permittedNav.find((n) => n.id === activeTab)?.labelKey || 'dashboard', lang)}
            </span>

            {/* Hall Switcher (Super Admin) or Locked Hall Indicator (Admin / Manager) */}
            {role === 'super_admin' ? (
              <div className="hidden md:flex items-center gap-1.5 ms-2 px-2.5 py-1 rounded-xl border border-cyan-500/35 bg-cyan-500/10">
                <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <select
                  aria-label={tr('activeHall', lang)}
                  value={activeHallId}
                  onChange={(e) => setActiveHallId(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-cyan-200 focus:outline-none cursor-pointer"
                >
                  {db.halls.map((h) => (
                    <option key={h.id} value={h.id} className="bg-slate-900 text-white">
                      {pickLocalized(h.name, h.name_ur, lang)} ({h.booking_code_prefix})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 ms-2 px-2.5 py-1 rounded-xl border border-slate-800 bg-slate-900/70 text-xs text-slate-300">
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate max-w-[140px]">
                  {pickLocalized(activeHall.name, activeHall.name_ur, lang)}
                </span>
              </div>
            )}
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('searchPlaceholder', lang)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-700 bg-white dark:bg-[#0B1120] shadow-2xl overflow-hidden z-50">
                {searchResults.map((bk) => (
                  <button
                    key={bk.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      onOpenBookingFromSearch(bk);
                    }}
                    className="w-full text-start px-3.5 py-2.5 hover:bg-slate-800/70 border-b border-slate-800/60 last:border-b-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-cyan-300 tabular-nums">
                        {bk.booking_code} · <span className="text-slate-100">{bk.customer_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate tabular-nums">
                        {bk.customer_phone} · {formatDateDisplay(bk.event_date, lang)} ·{' '}
                        {bk.floors.map((f) => translateFloor(f, lang, db.floors)).join(lang === 'ur' ? '، ' : ', ')}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-300 shrink-0">
                      {translateStatus(bk.status, lang)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? tr('lightMode', lang) : tr('darkMode', lang)}
              aria-label={theme === 'dark' ? tr('lightMode', lang) : tr('darkMode', lang)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-violet-400" />
              )}
              <span className="hidden md:inline">
                {theme === 'dark' ? tr('lightMode', lang) : tr('darkMode', lang)}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="lg:hidden px-2.5 py-2 rounded-xl border border-slate-800 bg-slate-900/70 text-xs font-medium text-cyan-300 whitespace-nowrap shrink-0"
            >
              {tr('switchToOtherLang', lang)}
            </button>
            {canCreateBooking && (
              <button
                type="button"
                onClick={onNewBooking}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-[0_0_20px_-6px_rgba(6,182,212,0.7)]"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('newBooking', lang)}</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Hall Switcher + search bar */}
        <div className="no-print sm:hidden px-4 pt-3 space-y-2">
          {role === 'super_admin' && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-500/35 bg-cyan-500/10">
              <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                value={activeHallId}
                onChange={(e) => setActiveHallId(e.target.value)}
                className="flex-1 bg-transparent text-xs font-semibold text-cyan-200 focus:outline-none"
              >
                {db.halls.map((h) => (
                  <option key={h.id} value={h.id} className="bg-slate-900 text-white">
                    {pickLocalized(h.name, h.name_ur, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('searchPlaceholder', lang)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-700 bg-white dark:bg-[#0B1120] shadow-2xl overflow-hidden z-50">
                {searchResults.map((bk) => (
                  <button
                    key={bk.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      onOpenBookingFromSearch(bk);
                    }}
                    className="w-full text-start px-3.5 py-2.5 hover:bg-slate-800/70 border-b border-slate-800/60 last:border-b-0"
                  >
                    <div className="text-xs font-semibold text-cyan-300 tabular-nums">
                      {bk.booking_code} · <span className="text-slate-100">{bk.customer_name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {bk.customer_phone} · {formatDateDisplay(bk.event_date, lang)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800 bg-white/95 dark:bg-[#090E1B]/95 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around">
        {mobilePrimary.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setMoreDrawerOpen(false);
              }}
              className={`flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-xl min-w-[56px] min-h-[44px] transition-colors ${
                active ? 'text-cyan-400' : 'text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium whitespace-nowrap truncate max-w-[68px]">
                {tr(item.labelKey, lang)}
              </span>
            </button>
          );
        })}
        {mobileOverflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-xl min-w-[56px] min-h-[44px] text-slate-400"
          >
            <Menu className="w-4 h-4" />
            <span className="text-[10px] font-medium whitespace-nowrap">{tr('more', lang)}</span>
          </button>
        )}
      </nav>

      {/* Mobile More Drawer */}
      {moreDrawerOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full rounded-t-2xl border-t border-slate-700 bg-white dark:bg-[#0B1120] p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{currentUser?.full_name}</div>
                <div className="text-xs text-amber-400">
                  {translateRole(role, lang)} · {pickLocalized(activeHall.name, activeHall.name_ur, lang)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoreDrawerOpen(false)}
                className="p-2 rounded-lg border border-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mobileOverflow.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMoreDrawerOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 px-3 py-3 rounded-xl border text-xs font-medium ${
                    activeTab === item.id
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {item.icon}
                    <span className="truncate">{tr(item.labelKey, lang)}</span>
                  </span>
                  {item.id === 'approvals' && pendingApprovalsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      {pendingApprovalsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-semibold"
            >
              <LogOut className="w-4 h-4" />
              <span>{tr('logout', lang)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
