import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarRange,
  Copy,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  FolderTree,
  Loader2,
  Monitor,
  Moon,
  Plus,
  Power,
  Save,
  Sun,
  Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import {
  hasMissingBilingualPair,
  pickLocalized,
  tr,
  translateChargeCategoryName,
  translateFloor,
  translateUnitLabel,
} from '../i18n/translations';
import {
  ChargeCatalogItem,
  ChargeCategory,
  EventCategory,
  EventTypeItem,
  FloorConfig,
  FloorName,
  FloorRatePair,
  HallSettings,
  RentSeasonRule,
} from '../types';
import { formatPKR } from '../utils/formatters';

type SettingsTab = 'hall' | 'pricing' | 'catalog' | 'events' | 'backup';

interface SettingsViewProps {
  initialTab?: SettingsTab;
  catalogOnly?: boolean;
  requestedSubTab?: { tab: SettingsTab; nonce: number };
}

const FLOOR_LIST: FloorName[] = ['First', 'Second', 'Third', 'Full Hall'];

const MissingTranslationIcon: React.FC<{ show: boolean; title: string }> = ({ show, title }) => {
  if (!show) return null;
  return (
    <span title={title} className="inline-flex items-center text-amber-400 shrink-0">
      <AlertTriangle className="w-3.5 h-3.5" />
    </span>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialTab,
  catalogOnly = false,
  requestedSubTab,
}) => {
  const {
    db,
    rawDb,
    activeHall,
    currentUser,
    can,
    lang,
    theme,
    themePreferenceSource,
    setTheme,
    resetThemeToSystem,
    updateSettings,
    saveFloorLabelsBatch,
    saveChargeCategory,
    saveChargeItem,
    softDeleteChargeItem,
    saveEventCategory,
    toggleEventCategoryActive,
    reorderEventCategories,
    softDeleteEventCategory,
    saveEventType,
    toggleEventTypeActive,
    reorderEventTypes,
    softDeleteEventType,
    copyEventTaxonomyFromHall,
  } = useApp();

  const isUr = lang === 'ur';
  const missingWarnTitle = tr('missingTranslationWarn', lang);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canViewSettings = can('settings', 'view');
  const canEditSettings = can('settings', 'edit');
  const canViewCatalog = can('catalog', 'view');
  const canEditCatalog = can('catalog', 'edit');
  const canDeleteCatalog = can('catalog', 'delete');
  const canViewEventCats = can('event_categories', 'view');
  const canEditEventCats = can('event_categories', 'edit');
  const canDeleteEventCats = can('event_categories', 'delete');
  const canViewBackup = can('backup_import', 'view');

  const visibleTabs: Array<{ id: SettingsTab; label: string }> = catalogOnly
    ? canViewCatalog
      ? [{ id: 'catalog', label: tr('catalogTab', lang) }]
      : []
    : [
        ...(canViewSettings
          ? [
              { id: 'hall' as SettingsTab, label: tr('hallProfileTab', lang) },
              { id: 'pricing' as SettingsTab, label: tr('pricingRatesTab', lang) },
            ]
          : []),
        ...(canViewCatalog
          ? [{ id: 'catalog' as SettingsTab, label: tr('catalogTab', lang) }]
          : []),
        ...(canViewEventCats
          ? [{ id: 'events' as SettingsTab, label: tr('eventTypesTab', lang) }]
          : []),
        ...(isSuperAdmin && canViewBackup
          ? [{ id: 'backup' as SettingsTab, label: tr('importData', lang) }]
          : []),
      ];

  const defaultTab: SettingsTab =
    initialTab && visibleTabs.some((t) => t.id === initialTab)
      ? initialTab
      : visibleTabs[0]?.id || 'hall';

  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  useEffect(() => {
    if (!catalogOnly && requestedSubTab && visibleTabs.some((t) => t.id === requestedSubTab.tab)) {
      setTab(requestedSubTab.tab);
    }
  }, [requestedSubTab, catalogOnly, visibleTabs]);
  const [form, setForm] = useState<HallSettings>(db.settings);
  const [savedNotice, setSavedNotice] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingFloors, setSavingFloors] = useState(false);
  const [savingCat, setSavingCat] = useState(false);
  const [savingCharge, setSavingCharge] = useState(false);
  const [deletingChargeId, setDeletingChargeId] = useState<string | null>(null);
  const [savingEventCat, setSavingEventCat] = useState(false);
  const [savingEventType, setSavingEventType] = useState(false);
  const [busyEventCatId, setBusyEventCatId] = useState<string | null>(null);
  const [busyEventTypeId, setBusyEventTypeId] = useState<string | null>(null);
  const [copyingEvents, setCopyingEvents] = useState(false);
  const [copySourceHallId, setCopySourceHallId] = useState<string>('');
  const [inUsePrompt, setInUsePrompt] = useState<{
    kind: 'category' | 'event';
    id: string;
    name: string;
    message: string;
  } | null>(null);

  // Floor label edits
  const [floorDrafts, setFloorDrafts] = useState<Record<FloorName, { en: string; ur: string }>>({
    First: { en: 'First Floor', ur: 'پہلا فلور' },
    Second: { en: 'Second Floor', ur: 'دوسرا فلور' },
    Third: { en: 'Third Floor', ur: 'تیسرا فلور' },
    'Full Hall': { en: 'Full Hall (All 3 Floors)', ur: 'مکمل ہال (تینوں فلور)' },
  });
  const [floorsSavedNotice, setFloorsSavedNotice] = useState(false);

  useEffect(() => {
    const nextDrafts: Record<FloorName, { en: string; ur: string }> = {
      First: { en: 'First Floor', ur: 'پہلا فلور' },
      Second: { en: 'Second Floor', ur: 'دوسرا فلور' },
      Third: { en: 'Third Floor', ur: 'تیسرا فلور' },
      'Full Hall': { en: 'Full Hall (All 3 Floors)', ur: 'مکمل ہال (تینوں فلور)' },
    };
    for (const fl of db.floors) {
      nextDrafts[fl.floor_key] = { en: fl.name_en, ur: fl.name_ur };
    }
    setFloorDrafts(nextDrafts);
  }, [db.floors]);

  useEffect(() => {
    setForm(db.settings);
  }, [db.settings]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const activeCategories = db.chargeCategories.filter((c) => !c.deleted_at);
  const activeCharges = db.chargesCatalog.filter((c) => !c.deleted_at);
  const activeEventCategories = [...db.eventCategories]
    .filter((c) => !c.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const activeEventTypes = [...db.eventTypes]
    .filter((e) => !e.deleted_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const otherHallsForCopy = rawDb.halls.filter((h) => h.id !== activeHall.id && h.is_active !== false);

  // Catalog Category Add/Edit
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [newCatEn, setNewCatEn] = useState('');
  const [newCatUr, setNewCatUr] = useState('');

  // Catalog Item Add/Edit
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [chargeCatId, setChargeCatId] = useState(activeCategories[0]?.id || '');
  const [chargeNameEn, setChargeNameEn] = useState('');
  const [chargeNameUr, setChargeNameUr] = useState('');
  const [chargeRate, setChargeRate] = useState('5000');
  const [chargeUnit, setChargeUnit] = useState('Event');
  const [chargeUnitUr, setChargeUnitUr] = useState('تقریب');
  const [chargeDefaultPkg, setChargeDefaultPkg] = useState(false);
  const [chargeIsCrate, setChargeIsCrate] = useState(false);

  // Event Category Add/Edit
  const [editingEventCatId, setEditingEventCatId] = useState<string | null>(null);
  const [evCatEn, setEvCatEn] = useState('');
  const [evCatUr, setEvCatUr] = useState('');
  const [evCatActive, setEvCatActive] = useState(true);

  // Event Type Add/Edit
  const [editingEtId, setEditingEtId] = useState<string | null>(null);
  const [etCatId, setEtCatId] = useState<string>(activeEventCategories[0]?.id || '');
  const [etEn, setEtEn] = useState('');
  const [etUr, setEtUr] = useState('');
  const [etColor, setEtColor] = useState('#06B6D4');
  const [etActive, setEtActive] = useState(true);

  useEffect(() => {
    if (!activeEventCategories.some((c) => c.id === etCatId)) {
      setEtCatId(activeEventCategories[0]?.id || '');
    }
  }, [activeEventCategories, etCatId]);

  useEffect(() => {
    if (otherHallsForCopy.length > 0 && !otherHallsForCopy.some((h) => h.id === copySourceHallId)) {
      setCopySourceHallId(otherHallsForCopy[0].id);
    }
  }, [otherHallsForCopy, copySourceHallId]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const res = await updateSettings(form);
      if (!res.ok) return;
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveAllFloors = async () => {
    if (savingFloors) return;
    setSavingFloors(true);
    try {
      const payloads = FLOOR_LIST.map((fk, i) => {
        const existing: FloorConfig | undefined = db.floors.find((f) => f.floor_key === fk);
        return {
          id: existing?.id,
          floor_key: fk,
          name_en: floorDrafts[fk]?.en ?? '',
          name_ur: floorDrafts[fk]?.ur ?? '',
          sort_order: existing?.sort_order ?? i + 1,
        };
      });
      const res = await saveFloorLabelsBatch(payloads);
      if (!res.ok) return;
      setFloorsSavedNotice(true);
      setTimeout(() => setFloorsSavedNotice(false), 2500);
    } finally {
      setSavingFloors(false);
    }
  };

  const updateBaseRate = (floor: FloorName, dayType: keyof FloorRatePair, val: number) => {
    const safeVal = Math.max(0, Number(val) || 0);
    setForm((prev) => ({
      ...prev,
      weekday_weekend_rates: {
        ...prev.weekday_weekend_rates,
        [floor]: {
          ...(prev.weekday_weekend_rates?.[floor] || { weekday: 0, weekend: 0 }),
          [dayType]: safeVal,
        },
      },
    }));
  };

  const handleAddSeason = () => {
    const yr = new Date().getFullYear();
    const newSeason: RentSeasonRule = {
      id: `sea-${Date.now()}`,
      name: isUr ? 'New Season' : 'New Season',
      name_ur: 'نیا سیزن',
      start_date: `${yr}-03-01`,
      end_date: `${yr}-04-30`,
      rates: {
        First: { ...form.weekday_weekend_rates.First },
        Second: { ...form.weekday_weekend_rates.Second },
        Third: { ...form.weekday_weekend_rates.Third },
        'Full Hall': { ...form.weekday_weekend_rates['Full Hall'] },
      },
    };
    setForm((prev) => ({
      ...prev,
      rent_seasons: [...(prev.rent_seasons || []), newSeason],
    }));
  };

  const updateSeason = (seasonId: string, updater: (s: RentSeasonRule) => RentSeasonRule) => {
    setForm((prev) => ({
      ...prev,
      rent_seasons: (prev.rent_seasons || []).map((s) => (s.id === seasonId ? updater(s) : s)),
    }));
  };

  const removeSeason = (seasonId: string) => {
    setForm((prev) => ({
      ...prev,
      rent_seasons: (prev.rent_seasons || []).filter((s) => s.id !== seasonId),
    }));
  };

  useEffect(() => {
    if (!activeCategories.some((c) => c.id === chargeCatId)) {
      setChargeCatId(activeCategories[0]?.id || '');
    }
  }, [activeCategories, chargeCatId]);

  const startEditCategory = (cat: ChargeCategory) => {
    setEditingCatId(cat.id);
    setNewCatEn(cat.name_en);
    setNewCatUr(cat.name_ur);
  };

  const resetCategoryForm = () => {
    setEditingCatId(null);
    setNewCatEn('');
    setNewCatUr('');
  };

  const startEditChargeItem = (ch: ChargeCatalogItem) => {
    setEditingChargeId(ch.id);
    setChargeCatId(ch.category_id || activeCategories[0]?.id || '');
    setChargeNameEn(ch.name_en);
    setChargeNameUr(ch.name_ur);
    setChargeRate(String(ch.default_rate));
    setChargeUnit(ch.unit_label || 'Event');
    setChargeUnitUr(ch.unit_label_ur || '');
    setChargeDefaultPkg(Boolean(ch.is_default_package));
    setChargeIsCrate(Boolean(ch.is_crate_service));
  };

  const resetChargeForm = () => {
    setEditingChargeId(null);
    setChargeNameEn('');
    setChargeNameUr('');
    setChargeRate('5000');
    setChargeUnit('Event');
    setChargeUnitUr('تقریب');
    setChargeDefaultPkg(false);
    setChargeIsCrate(false);
  };

  const startEditEventCategory = (cat: EventCategory) => {
    setEditingEventCatId(cat.id);
    setEvCatEn(cat.name_en);
    setEvCatUr(cat.name_ur);
    setEvCatActive(cat.is_active !== false);
  };

  const resetEventCategoryForm = () => {
    setEditingEventCatId(null);
    setEvCatEn('');
    setEvCatUr('');
    setEvCatActive(true);
  };

  const startEditEventType = (et: EventTypeItem) => {
    setEditingEtId(et.id);
    setEtCatId(et.category_id || activeEventCategories[0]?.id || '');
    setEtEn(et.name_en);
    setEtUr(et.name_ur);
    setEtColor(et.color_hex || '#06B6D4');
    setEtActive(et.is_active !== false);
  };

  const resetEventTypeForm = () => {
    setEditingEtId(null);
    setEtEn('');
    setEtUr('');
    setEtColor('#06B6D4');
    setEtActive(true);
  };

  const moveCategoryOrder = async (catId: string, dir: -1 | 1) => {
    const idx = activeEventCategories.findIndex((c) => c.id === catId);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= activeEventCategories.length) return;
    const ids = activeEventCategories.map((c) => c.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setBusyEventCatId(catId);
    try {
      await reorderEventCategories(ids);
    } finally {
      setBusyEventCatId(null);
    }
  };

  const moveEventOrder = async (categoryId: string, eventId: string, dir: -1 | 1) => {
    const siblings = activeEventTypes.filter((e) => (e.category_id || '') === categoryId);
    const idx = siblings.findIndex((e) => e.id === eventId);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return;
    const ids = siblings.map((e) => e.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setBusyEventTypeId(eventId);
    try {
      await reorderEventTypes(categoryId, ids);
    } finally {
      setBusyEventTypeId(null);
    }
  };

  const handleDownloadJsonBackup = () => {
    const blob = new Blob([JSON.stringify(rawDb, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marquee-all-halls-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcelBackup = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.halls), 'Halls');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.floors), 'Floors');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.customers), 'Customers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.bookings), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.bookingItems), 'BookingItems');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.payments), 'Payments');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.dailyClosings), 'DailyClosings');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rawDb.approvalRequests),
      'ApprovalRequests'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.expenses), 'Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.employees), 'Employees');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.attendance), 'Attendance');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.advances), 'Advances');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rawDb.chargesCatalog),
      'ChargesCatalog'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawDb.auditLogs), 'AuditLogs');
    XLSX.writeFile(wb, `marquee-all-halls-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 w-fit">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'hall' && (
        <div className="space-y-6">
          {/* Appearance & Theme Selector */}
          <div className="glass-panel rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">{tr('appearance', lang)}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isUr
                  ? 'ڈارک یا لائٹ موڈ منتخب کریں۔ پرنٹ ہونے والے تمام بل اور رپورٹس ہمیشہ صاف سفید کاغذ پر پرنٹ ہوں گی۔'
                  : 'Choose Dark (neon) or Light mode. Invoices and reports always print in light A4 colors and 80mm black-on-white receipts.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                  theme === 'dark' && themePreferenceSource === 'saved'
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-cyan-500/40'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-violet-400" />
                <span>{tr('darkMode', lang)}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                  theme === 'light' && themePreferenceSource === 'saved'
                    ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-cyan-500/40'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>{tr('lightMode', lang)}</span>
              </button>
              <button
                type="button"
                onClick={resetThemeToSystem}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                  themePreferenceSource === 'system'
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                    : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-violet-500/40'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>{tr('systemDefault', lang)}</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="glass-panel rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {isUr
                  ? 'انوائس کے اصول، ٹیکس اور اوقات کے وقفے'
                  : 'Invoice Rules, Tax & Operational Buffers'}
              </h3>
              {savedNotice && (
                <span className="text-xs font-semibold text-emerald-400">
                  {isUr ? 'سیٹنگز محفوظ ہو گئیں' : 'Settings Saved'}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200 flex items-center gap-2.5">
              <Building2 className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>
                {isUr
                  ? `ہال کی پروفائل، لوگو، پتہ، رابطہ نمبر، بینک تفصیلات اور انوائس شرائط "${pickLocalized(activeHall.name, activeHall.name_ur, lang)}" کے ہال پروفائل مینو سے سنبھالی جاتی ہیں۔`
                  : `Hall branding, logo, contacts, bank details, and invoice terms for "${activeHall.name}" are managed in the ${isSuperAdmin ? 'Halls' : 'Hall Profile'} screen.`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr ? 'انوائس فارمیٹ' : 'Invoice Format'}
                </label>
                <input
                  type="text"
                  value={form.invoice_format}
                  onChange={(e) => setForm({ ...form, invoice_format: e.target.value })}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr ? 'ٹیکس %' : 'Tax %'}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.tax_percent}
                  onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr ? 'بنیادی زبان' : 'Default Language'}
                </label>
                <select
                  value={form.default_language}
                  onChange={(e) =>
                    setForm({ ...form, default_language: e.target.value as 'en' | 'ur' })
                  }
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="en">{tr('englishName', lang)}</option>
                  <option value="ur">{tr('urduName', lang)}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-3 border-t border-slate-800">
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr
                    ? 'صفائی و سیٹ اپ وقفہ (منٹ)'
                    : 'Cleaning / Setup Buffer (Minutes)'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.cleaning_buffer_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cleaning_buffer_minutes: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-slate-950/70 border border-cyan-500/35 rounded-xl px-3 py-2 text-white tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isUr
                    ? 'ایک ہی فلور پر دو تقریبات کے درمیان لازمی وقفہ۔'
                    : 'Required gap between events on overlapping floors.'}
                </p>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr ? 'تاخیر رعایتی وقت (منٹ)' : 'Late Charge Grace Period (Minutes)'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.late_grace_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      late_grace_minutes: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-slate-950/70 border border-amber-500/35 rounded-xl px-3 py-2 text-white tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isUr
                    ? 'بنیادی طور پر 60 منٹ؛ تاخیر چارج کا طریقہ ہر بکنگ پر طے ہوتا ہے۔'
                    : 'Default 60 min; late charge rates are selected per booking.'}
                </p>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">
                  {isUr
                    ? 'کریٹ ہینڈلنگ کٹوتی (روپے / کریٹ)'
                    : 'Crate Handling Deduction (PKR / Crate)'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.crate_deduction_per_returned}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      crate_deduction_per_returned: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isUr
                    ? 'واپس شدہ کولڈ ڈرنک کریٹس پر برف و ہینڈلنگ کٹوتی۔'
                    : 'Deducted for ice and handling on returned cold drink crates.'}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <label className="inline-flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.hide_discount_reason_on_invoice)}
                  onChange={(e) =>
                    setForm({ ...form, hide_discount_reason_on_invoice: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-950"
                />
                <span>
                  {isUr
                    ? 'گاہک کی اے-4 انوائس پر رعایت کی وجہ/نوٹ چھپائیں (صرف "خصوصی رعایت" دکھائیں)'
                    : 'Hide discount reason/note on customer A4 Invoice (only show "Special Discount")'}
                </span>
              </label>
            </div>

            {canEditSettings && (
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{savingSettings ? tr('saving', lang) : isUr ? 'سیٹنگز محفوظ کریں' : 'Save Settings'}</span>
              </button>
            )}
          </form>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="space-y-6">
          {/* Standard Weekday / Weekend Suggested Rent Table */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  {isUr ? 'ہال کرایہ کا معیاری جدول' : 'Standard Suggested Hall Rent Table'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isUr
                    ? 'نئی بکنگ پر فلور اور دن کے مطابق کرایہ خودکار تجویز ہوتا ہے۔ عملہ کرایہ دستی طور پر بھی تبدیل کر سکتا ہے۔'
                    : 'Auto-suggested on new bookings based on floor and day type (Weekday Mon–Thu vs Weekend Fri–Sun). Staff can always override rent manually.'}
                </p>
              </div>
              {canEditSettings && (
                <div className="flex items-center gap-3">
                  {savedNotice && (
                    <span className="text-xs font-semibold text-emerald-400">
                      {isUr ? 'کرایہ محفوظ ہو گیا' : 'Pricing Saved'}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => handleSaveSettings()}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{savingSettings ? tr('saving', lang) : isUr ? 'کرایہ محفوظ کریں' : 'Save Rent Tables'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'فلور' : 'Floor Option'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'عام دن (پیر تا جمعرات)' : 'Weekday Rate (Mon–Thu)'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'ویک اینڈ (جمعہ تا اتوار)' : 'Weekend Rate (Fri–Sun)'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {FLOOR_LIST.map((fl) => (
                    <tr key={fl}>
                      <td className="py-3 px-4 font-semibold text-white">
                        {translateFloor(fl, lang, db.floors)}
                      </td>
                      <td className="py-2.5 px-4 text-end">
                        <input
                          type="number"
                          min={0}
                          value={form.weekday_weekend_rates?.[fl]?.weekday ?? 0}
                          onChange={(e) => updateBaseRate(fl, 'weekday', Number(e.target.value))}
                          className="w-36 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-1.5 text-end text-white tabular-nums"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-end">
                        <input
                          type="number"
                          min={0}
                          value={form.weekday_weekend_rates?.[fl]?.weekend ?? 0}
                          onChange={(e) => updateBaseRate(fl, 'weekend', Number(e.target.value))}
                          className="w-36 bg-slate-950/70 border border-amber-500/35 rounded-lg px-3 py-1.5 text-end text-amber-300 font-semibold tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bilingual Floor Labels Configuration */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">{tr('floorLabelsTitle', lang)}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isUr
                    ? 'انگریزی اور اردو دونوں نام محفوظ کریں تاکہ ہر زبان میں درست فلور نام دکھائی دے۔'
                    : 'Set both English and Urdu names for each floor so every screen, invoice, and calendar uses the active language.'}
                </p>
              </div>
              {canEditSettings && (
                <div className="flex items-center gap-3">
                  {floorsSavedNotice && (
                    <span className="text-xs font-semibold text-emerald-400">
                      {isUr ? 'فلورز کے نام محفوظ ہو گئے' : 'Floor Labels Saved'}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={savingFloors}
                    onClick={handleSaveAllFloors}
                    className="px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingFloors ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>{savingFloors ? tr('saving', lang) : isUr ? 'فلورز محفوظ کریں' : 'Save Floor Labels'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {FLOOR_LIST.map((fk) => {
                const draft = floorDrafts[fk] || { en: '', ur: '' };
                const missing = hasMissingBilingualPair(draft.en, draft.ur);
                return (
                  <div
                    key={fk}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-300">
                        {translateFloor(fk, lang, db.floors)}
                      </span>
                      <MissingTranslationIcon show={missing} title={missingWarnTitle} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {tr('englishLabel', lang)}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draft.en}
                          onChange={(e) =>
                            setFloorDrafts((prev) => ({
                              ...prev,
                              [fk]: { ...prev[fk], en: e.target.value },
                            }))
                          }
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {tr('urduLabel', lang)}
                        </label>
                        <input
                          type="text"
                          dir="rtl"
                          value={draft.ur}
                          onChange={(e) =>
                            setFloorDrafts((prev) => ({
                              ...prev,
                              [fk]: { ...prev[fk], ur: e.target.value },
                            }))
                          }
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-urdu"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Seasonal Pricing Rules */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-cyan-400" />
                  <span>
                    {isUr
                      ? 'سیزن کے مطابق کرایہ کے اصول'
                      : 'Seasonal Suggested Rent Rules (Editable Date Ranges)'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isUr
                    ? 'اگر تقریب کی تاریخ کسی سیزن میں آئے تو معیاری جدول کے بجائے اس سیزن کے نرخ تجویز ہوں گے۔'
                    : 'When an event date falls inside a season range, its rates override the Standard table for auto-suggestion.'}
                </p>
              </div>
              {canEditSettings && (
                <button
                  type="button"
                  onClick={handleAddSeason}
                  className="px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isUr ? 'نیا سیزن شامل کریں' : 'Add Season Rule'}</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {(form.rent_seasons || []).map((season) => {
                const missingSeasonTr = hasMissingBilingualPair(season.name, season.name_ur);
                return (
                  <div
                    key={season.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                          <span>{isUr ? 'سیزن نام (انگریزی)' : 'Season Name (English)'}</span>
                          <MissingTranslationIcon show={missingSeasonTr} title={missingWarnTitle} />
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={season.name}
                          onChange={(e) =>
                            updateSeason(season.id, (s) => ({ ...s, name: e.target.value }))
                          }
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                          <span>{isUr ? 'سیزن نام (اردو)' : 'Season Name (Urdu)'}</span>
                          <MissingTranslationIcon show={missingSeasonTr} title={missingWarnTitle} />
                        </label>
                        <input
                          type="text"
                          dir="rtl"
                          value={season.name_ur || ''}
                          onChange={(e) =>
                            updateSeason(season.id, (s) => ({ ...s, name_ur: e.target.value }))
                          }
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-urdu"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {isUr ? 'شروع تاریخ' : 'Start Date'}
                        </label>
                        <input
                          type="date"
                          value={season.start_date}
                          onChange={(e) =>
                            updateSeason(season.id, (s) => ({ ...s, start_date: e.target.value }))
                          }
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white tabular-nums"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-[11px] text-slate-400 mb-1">
                            {isUr ? 'اختتام تاریخ' : 'End Date'}
                          </label>
                          <input
                            type="date"
                            value={season.end_date}
                            onChange={(e) =>
                              updateSeason(season.id, (s) => ({ ...s, end_date: e.target.value }))
                            }
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white tabular-nums"
                          />
                        </div>
                        {canEditSettings && (
                          <button
                            type="button"
                            onClick={() => removeSeason(season.id)}
                            className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                            title={isUr ? 'سیزن حذف کریں' : 'Remove season'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {FLOOR_LIST.map((fl) => (
                        <div
                          key={fl}
                          className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 space-y-2"
                        >
                          <div className="font-semibold text-cyan-300 text-[11px]">
                            {translateFloor(fl, lang, db.floors)}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              {tr('weekday', lang)}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={season.rates[fl]?.weekday ?? 0}
                              onChange={(e) =>
                                updateSeason(season.id, (s) => ({
                                  ...s,
                                  rates: {
                                    ...s.rates,
                                    [fl]: {
                                      ...s.rates[fl],
                                      weekday: Math.max(0, Number(e.target.value)),
                                    },
                                  },
                                }))
                              }
                              className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-end text-white tabular-nums"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              {tr('weekend', lang)}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={season.rates[fl]?.weekend ?? 0}
                              onChange={(e) =>
                                updateSeason(season.id, (s) => ({
                                  ...s,
                                  rates: {
                                    ...s.rates,
                                    [fl]: {
                                      ...s.rates[fl],
                                      weekend: Math.max(0, Number(e.target.value)),
                                    },
                                  },
                                }))
                              }
                              className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-end text-amber-300 tabular-nums"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {(form.rent_seasons || []).length === 0 && (
                <p className="text-xs text-slate-500">
                  {isUr
                    ? 'کوئی مخصوص سیزن درج نہیں ہے۔ سال بھر معیاری جدول لاگو ہوگا۔'
                    : 'No custom seasons configured. Standard Weekday/Weekend table applies year-round.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'catalog' && canViewCatalog && (
        <div className={`grid grid-cols-1 ${canEditCatalog ? 'xl:grid-cols-3' : ''} gap-6`}>
          {canEditCatalog && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (savingCat) return;
                  if (!newCatEn.trim() && !newCatUr.trim()) return;
                  setSavingCat(true);
                  try {
                    const res = await saveChargeCategory({
                      id: editingCatId || undefined,
                      name_en: newCatEn.trim(),
                      name_ur: newCatUr.trim(),
                    });
                    if (!res.ok) return;
                    resetCategoryForm();
                  } finally {
                    setSavingCat(false);
                  }
                }}
                className="glass-panel rounded-2xl p-5 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    {editingCatId
                      ? isUr
                        ? 'چارج کیٹیگری میں ترمیم'
                        : 'Edit Charge Category'
                      : isUr
                      ? 'نئی چارج کیٹیگری شامل کریں'
                      : 'Add Charge Category'}
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
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {tr('englishLabel', lang)}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newCatEn}
                    onChange={(e) => setNewCatEn(e.target.value)}
                    placeholder="e.g. Decor & Setup"
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
                    value={newCatUr}
                    onChange={(e) => setNewCatUr(e.target.value)}
                    placeholder="سجاوٹ اور سیٹ اپ"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingCat}
                  className="px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingCat ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {savingCat
                      ? tr('saving', lang)
                      : editingCatId
                      ? tr('updateItem', lang)
                      : isUr
                      ? 'کیٹیگری شامل کریں'
                      : 'Add Category'}
                  </span>
                </button>
              </form>

              {/* Category List with Warning Icons & Edit */}
              <div className="glass-panel rounded-2xl p-4 space-y-2 text-xs">
                <div className="font-bold text-slate-200 mb-2">
                  {isUr ? 'موجودہ چارج کیٹیگریز' : 'Charge Categories'}
                </div>
                <div className="divide-y divide-slate-800/70">
                  {activeCategories.map((c) => {
                    const missing = hasMissingBilingualPair(c.name_en, c.name_ur);
                    return (
                      <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-100 truncate">
                            {pickLocalized(c.name_en, c.name_ur, lang)}
                          </span>
                          <MissingTranslationIcon show={missing} title={missingWarnTitle} />
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditCategory(c)}
                          className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-cyan-300 shrink-0"
                          title={tr('edit', lang)}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (savingCharge) return;
                  if (!chargeNameEn.trim() && !chargeNameUr.trim()) return;
                  setSavingCharge(true);
                  try {
                    const res = await saveChargeItem({
                      id: editingChargeId || undefined,
                      category_id: chargeCatId,
                      name_en: chargeNameEn.trim(),
                      name_ur: chargeNameUr.trim(),
                      default_rate: Number(chargeRate) || 0,
                      unit_label: chargeUnit.trim() || 'Event',
                      unit_label_ur: chargeUnitUr.trim(),
                      is_default_package: chargeDefaultPkg,
                      is_crate_service: chargeIsCrate,
                    });
                    if (!res.ok) return;
                    resetChargeForm();
                  } finally {
                    setSavingCharge(false);
                  }
                }}
                className="glass-panel rounded-2xl p-5 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    {editingChargeId
                      ? isUr
                        ? 'سروس / چارج میں ترمیم'
                        : 'Edit Service / Charge'
                      : isUr
                      ? 'کیٹلاگ سروس / چارج شامل کریں'
                      : 'Add Catalog Service / Charge'}
                  </h3>
                  {editingChargeId && (
                    <button
                      type="button"
                      onClick={resetChargeForm}
                      className="text-slate-400 hover:text-white"
                    >
                      {tr('cancel', lang)}
                    </button>
                  )}
                </div>
                <select
                  value={chargeCatId}
                  onChange={(e) => setChargeCatId(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {pickLocalized(c.name_en, c.name_ur, lang)}
                    </option>
                  ))}
                </select>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {tr('englishLabel', lang)}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={chargeNameEn}
                    onChange={(e) => setChargeNameEn(e.target.value)}
                    placeholder="e.g. Stage Lighting"
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
                    value={chargeNameUr}
                    onChange={(e) => setChargeNameUr(e.target.value)}
                    placeholder="اسٹیج لائٹنگ"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {tr('rateCol', lang)}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={chargeRate}
                      onChange={(e) => setChargeRate(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {isUr ? 'اکائی (انگریزی)' : 'Unit (EN)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={chargeUnit}
                      onChange={(e) => setChargeUnit(e.target.value)}
                      placeholder="Event"
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {isUr ? 'اکائی (اردو)' : 'Unit (UR)'}
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={chargeUnitUr}
                      onChange={(e) => setChargeUnitUr(e.target.value)}
                      placeholder="تقریب"
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={chargeDefaultPkg}
                    onChange={(e) => setChargeDefaultPkg(e.target.checked)}
                  />
                  <span>
                    {isUr
                      ? 'بنیادی پیکج میں خودکار شامل کریں'
                      : 'Include automatically in Default Package'}
                  </span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={chargeIsCrate}
                    onChange={(e) => setChargeIsCrate(e.target.checked)}
                  />
                  <span>
                    {isUr
                      ? 'کولڈ ڈرنک کریٹ کے خانے استعمال کریں (آرڈر/استعمال/واپسی)'
                      : 'Use Cold Drink Crate fields (Ordered/Used/Returned)'}
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={savingCharge}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {savingCharge && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {savingCharge
                      ? tr('saving', lang)
                      : editingChargeId
                      ? tr('updateItem', lang)
                      : isUr
                      ? 'چارج شامل کریں'
                      : 'Add Charge Item'}
                  </span>
                </button>
              </form>
            </div>
          )}

          <div
            className={`${
              canEditCatalog ? 'xl:col-span-2' : ''
            } glass-panel rounded-2xl overflow-hidden`}
          >
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">{tr('catalog', lang)}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">{tr('descriptionCol', lang)}</th>
                    <th className="py-2.5 px-4 text-start">
                      {isUr ? 'کیٹیگری' : 'Category'}
                    </th>
                    <th className="py-2.5 px-4 text-end">
                      {isUr ? 'بنیادی نرخ' : 'Default Rate'}
                    </th>
                    {(canEditCatalog || canDeleteCatalog) && (
                      <th className="py-2.5 px-4 text-end">{tr('actions', lang)}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeCharges.map((ch) => {
                    const cat = activeCategories.find((c) => c.id === ch.category_id);
                    const missingTr =
                      hasMissingBilingualPair(ch.name_en, ch.name_ur) ||
                      hasMissingBilingualPair(ch.unit_label, ch.unit_label_ur);
                    const catLabel = cat
                      ? pickLocalized(cat.name_en, cat.name_ur, lang)
                      : translateChargeCategoryName('General', lang, db.chargeCategories);
                    return (
                      <tr key={ch.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white flex items-center gap-1.5 flex-wrap">
                            <span>{pickLocalized(ch.name_en, ch.name_ur, lang)}</span>
                            <MissingTranslationIcon show={missingTr} title={missingWarnTitle} />
                            {ch.is_default_package && (
                              <span className="text-[11px] text-cyan-400">
                                · {tr('defaultPackageIncluded', lang)}
                              </span>
                            )}
                            {(ch.is_crate_service ||
                              ch.name_en.toLowerCase().includes('cold drink')) && (
                              <span className="text-[11px] text-emerald-400">
                                · {isUr ? 'کریٹ واپسی ایڈجسٹمنٹ' : 'Crate Reversal'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{catLabel}</td>
                        <td className="py-3 px-4 text-end tabular-nums font-semibold text-amber-300">
                          {formatPKR(ch.default_rate)} /{' '}
                          {translateUnitLabel(ch.unit_label, lang, ch.unit_label_ur)}
                        </td>
                        {(canEditCatalog || canDeleteCatalog) && (
                          <td className="py-3 px-4 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              {canEditCatalog && (
                                <button
                                  type="button"
                                  onClick={() => startEditChargeItem(ch)}
                                  className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                                  title={tr('edit', lang)}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDeleteCatalog && (
                                <button
                                  type="button"
                                  disabled={deletingChargeId === ch.id}
                                  onClick={async () => {
                                    setDeletingChargeId(ch.id);
                                    try {
                                      await softDeleteChargeItem(ch.id);
                                    } finally {
                                      setDeletingChargeId(null);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-50"
                                  title={tr('delete', lang)}
                                >
                                  {deletingChargeId === ch.id ? (
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'events' && canViewEventCats && (
        <div className="space-y-6">
          {/* Top toolbar: Super Admin Copy from another Hall + In-Use Deactivate Prompt */}
          {isSuperAdmin && canEditEventCats && otherHallsForCopy.length > 0 && (
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
                  disabled={copyingEvents || !copySourceHallId}
                  onClick={async () => {
                    if (!copySourceHallId) return;
                    setCopyingEvents(true);
                    try {
                      await copyEventTaxonomyFromHall(copySourceHallId);
                    } finally {
                      setCopyingEvents(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {copyingEvents ? (
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
                      setBusyEventCatId(target.id);
                      try {
                        await toggleEventCategoryActive(target.id, false);
                      } finally {
                        setBusyEventCatId(null);
                      }
                    } else {
                      setBusyEventTypeId(target.id);
                      try {
                        await toggleEventTypeActive(target.id, false);
                      } finally {
                        setBusyEventTypeId(null);
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

          <div className={`grid grid-cols-1 ${canEditEventCats ? 'xl:grid-cols-3' : ''} gap-6`}>
            {canEditEventCats && (
              <div className="space-y-6">
                {/* Add / Edit Event Category */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (savingEventCat) return;
                    if (!evCatEn.trim() && !evCatUr.trim()) return;
                    setSavingEventCat(true);
                    try {
                      const res = await saveEventCategory({
                        id: editingEventCatId || undefined,
                        name_en: evCatEn.trim() || evCatUr.trim(),
                        name_ur: evCatUr.trim() || evCatEn.trim(),
                        is_active: evCatActive,
                      });
                      if (res.ok) {
                        if (res.category && !editingEventCatId) {
                          setEtCatId(res.category.id);
                        }
                        resetEventCategoryForm();
                      }
                    } finally {
                      setSavingEventCat(false);
                    }
                  }}
                  className="glass-panel rounded-2xl p-5 space-y-3.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-cyan-400" />
                      <span>
                        {editingEventCatId
                          ? isUr
                            ? 'ایونٹ کیٹیگری میں ترمیم'
                            : 'Edit Event Category'
                          : isUr
                          ? 'نئی ایونٹ کیٹیگری شامل کریں'
                          : 'Add Event Category'}
                      </span>
                    </h3>
                    {editingEventCatId && (
                      <button
                        type="button"
                        onClick={resetEventCategoryForm}
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
                        value={evCatEn}
                        onChange={(e) => setEvCatEn(e.target.value)}
                        placeholder="Wedding Ceremony"
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
                        value={evCatUr}
                        onChange={(e) => setEvCatUr(e.target.value)}
                        placeholder="شادی کی تقریبات"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={evCatActive}
                      onChange={(e) => setEvCatActive(e.target.checked)}
                    />
                    <span>{tr('active', lang)}</span>
                  </label>
                  <button
                    type="submit"
                    disabled={savingEventCat}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {savingEventCat ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingEventCat
                        ? tr('saving', lang)
                        : editingEventCatId
                        ? tr('updateItem', lang)
                        : isUr
                        ? 'کیٹیگری محفوظ کریں'
                        : 'Save Category'}
                    </span>
                  </button>
                </form>

                {/* Add / Edit Event inside a Category */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (savingEventType) return;
                    if (!etEn.trim() && !etUr.trim()) return;
                    setSavingEventType(true);
                    try {
                      const res = await saveEventType({
                        id: editingEtId || undefined,
                        category_id: etCatId || null,
                        name_en: etEn.trim() || etUr.trim(),
                        name_ur: etUr.trim() || etEn.trim(),
                        color_hex: etColor,
                        is_active: etActive,
                      });
                      if (!res.ok) return;
                      resetEventTypeForm();
                    } finally {
                      setSavingEventType(false);
                    }
                  }}
                  className="glass-panel rounded-2xl p-5 space-y-3.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CalendarRange className="w-4 h-4 text-amber-400" />
                      <span>
                        {editingEtId
                          ? isUr
                            ? 'ایونٹ میں ترمیم'
                            : 'Edit Event'
                          : isUr
                          ? 'نیا ایونٹ شامل کریں'
                          : 'Add Event'}
                      </span>
                    </h3>
                    {editingEtId && (
                      <button
                        type="button"
                        onClick={resetEventTypeForm}
                        className="text-slate-400 hover:text-white"
                      >
                        {tr('cancel', lang)}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {tr('eventCategory', lang)} *
                    </label>
                    <select
                      required
                      value={etCatId}
                      onChange={(e) => setEtCatId(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      {activeEventCategories.map((c) => (
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
                        value={etEn}
                        onChange={(e) => setEtEn(e.target.value)}
                        placeholder="e.g. Baraat"
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
                        value={etUr}
                        onChange={(e) => setEtUr(e.target.value)}
                        placeholder="بارات"
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-slate-300">
                        {isUr ? 'کیلنڈر کا رنگ:' : 'Calendar Color:'}
                      </label>
                      <input
                        type="color"
                        value={etColor}
                        onChange={(e) => setEtColor(e.target.value)}
                        className="w-10 h-8 rounded bg-transparent border-0"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={etActive}
                        onChange={(e) => setEtActive(e.target.checked)}
                      />
                      <span>{tr('active', lang)}</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={savingEventType || activeEventCategories.length === 0}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-cyan-600 text-slate-950 font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {savingEventType ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingEventType
                        ? tr('saving', lang)
                        : editingEtId
                        ? tr('updateItem', lang)
                        : isUr
                        ? 'ایونٹ محفوظ کریں'
                        : 'Save Event'}
                    </span>
                  </button>
                </form>
              </div>
            )}

            {/* Two-Level Hierarchy List (Side-by-Side EN & UR) */}
            <div className={`${canEditEventCats ? 'xl:col-span-2' : ''} space-y-4`}>
              {activeEventCategories.length === 0 && (
                <div className="glass-panel rounded-2xl p-8 text-center text-xs text-slate-500">
                  {tr('noRecords', lang)}
                </div>
              )}

              {activeEventCategories.map((cat, catIdx) => {
                const catEvents = activeEventTypes.filter((e) => e.category_id === cat.id);
                const catMissing = hasMissingBilingualPair(cat.name_en, cat.name_ur);
                const catBusy = busyEventCatId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`glass-panel rounded-2xl overflow-hidden border ${
                      cat.is_active === false ? 'border-slate-800/60 opacity-75' : 'border-slate-800'
                    }`}
                  >
                    {/* Category Header: EN + UR side by side */}
                    <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="font-bold text-sm text-white" dir="ltr">
                          {cat.name_en}
                        </span>
                        <span className="text-slate-600">/</span>
                        <span className="font-bold text-sm text-amber-300 font-urdu" dir="rtl">
                          {cat.name_ur || '—'}
                        </span>
                        <MissingTranslationIcon show={catMissing} title={missingWarnTitle} />
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            cat.is_active !== false
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {cat.is_active !== false ? tr('active', lang) : tr('inactive', lang)}
                        </span>
                      </div>

                      {canEditEventCats && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              resetEventTypeForm();
                              setEtCatId(cat.id);
                            }}
                            className="px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[11px] font-medium hover:bg-cyan-500/20"
                          >
                            + {isUr ? 'ایونٹ' : 'Event'}
                          </button>
                          <button
                            type="button"
                            disabled={catBusy || catIdx === 0}
                            onClick={() => moveCategoryOrder(cat.id, -1)}
                            title={tr('moveUp', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={catBusy || catIdx === activeEventCategories.length - 1}
                            onClick={() => moveCategoryOrder(cat.id, 1)}
                            title={tr('moveDown', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={catBusy}
                            onClick={async () => {
                              setBusyEventCatId(cat.id);
                              try {
                                await toggleEventCategoryActive(cat.id, cat.is_active === false);
                              } finally {
                                setBusyEventCatId(null);
                              }
                            }}
                            title={cat.is_active !== false ? tr('deactivate', lang) : tr('active', lang)}
                            className={`p-1.5 rounded-lg border border-slate-800 ${
                              cat.is_active !== false
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
                            onClick={() => startEditEventCategory(cat)}
                            title={tr('edit', lang)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDeleteEventCats && (
                            <button
                              type="button"
                              disabled={catBusy}
                              onClick={async () => {
                                setBusyEventCatId(cat.id);
                                try {
                                  const res = await softDeleteEventCategory(cat.id);
                                  if (!res.ok && res.inUse && res.error) {
                                    setInUsePrompt({
                                      kind: 'category',
                                      id: cat.id,
                                      name: `${cat.name_en} / ${cat.name_ur}`,
                                      message: res.error,
                                    });
                                  }
                                } finally {
                                  setBusyEventCatId(null);
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

                    {/* Nested Events under this Category */}
                    <div className="divide-y divide-slate-800/60 px-4 text-xs">
                      {catEvents.length === 0 ? (
                        <div className="py-3 text-slate-500 italic">
                          {isUr ? 'اس کیٹیگری میں کوئی ذیلی ایونٹ نہیں' : 'No events in this category'}
                        </div>
                      ) : (
                        catEvents.map((et, evIdx) => {
                          const evMissing = hasMissingBilingualPair(et.name_en, et.name_ur);
                          const evBusy = busyEventTypeId === et.id;
                          return (
                            <div
                              key={et.id}
                              className={`py-2.5 flex flex-wrap items-center justify-between gap-2 ${
                                et.is_active === false ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                <span
                                  className="w-3 h-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: et.color_hex }}
                                />
                                <span className="font-semibold text-slate-100" dir="ltr">
                                  {et.name_en}
                                </span>
                                <span className="text-slate-600">·</span>
                                <span className="font-semibold text-cyan-200 font-urdu" dir="rtl">
                                  {et.name_ur || '—'}
                                </span>
                                <MissingTranslationIcon show={evMissing} title={missingWarnTitle} />
                                {et.is_active === false && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {tr('inactive', lang)}
                                  </span>
                                )}
                              </div>

                              {canEditEventCats && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={evBusy || evIdx === 0}
                                    onClick={() => moveEventOrder(cat.id, et.id, -1)}
                                    title={tr('moveUp', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={evBusy || evIdx === catEvents.length - 1}
                                    onClick={() => moveEventOrder(cat.id, et.id, 1)}
                                    title={tr('moveDown', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={evBusy}
                                    onClick={async () => {
                                      setBusyEventTypeId(et.id);
                                      try {
                                        await toggleEventTypeActive(et.id, et.is_active === false);
                                      } finally {
                                        setBusyEventTypeId(null);
                                      }
                                    }}
                                    title={et.is_active !== false ? tr('deactivate', lang) : tr('active', lang)}
                                    className={`p-1 rounded-lg border border-slate-800 ${
                                      et.is_active !== false
                                        ? 'text-emerald-400 hover:text-amber-300'
                                        : 'text-slate-500 hover:text-emerald-300'
                                    }`}
                                  >
                                    {evBusy ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Power className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditEventType(et)}
                                    title={tr('edit', lang)}
                                    className="p-1 rounded-lg border border-slate-800 text-slate-300 hover:text-cyan-300"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  {canDeleteEventCats && (
                                    <button
                                      type="button"
                                      disabled={evBusy}
                                      onClick={async () => {
                                        setBusyEventTypeId(et.id);
                                        try {
                                          const res = await softDeleteEventType(et.id);
                                          if (!res.ok && res.inUse && res.error) {
                                            setInUsePrompt({
                                              kind: 'event',
                                              id: et.id,
                                              name: `${et.name_en} / ${et.name_ur}`,
                                              message: res.error,
                                            });
                                          }
                                        } finally {
                                          setBusyEventTypeId(null);
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

      {isSuperAdmin && tab === 'backup' && (
        <div className="glass-panel rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              <span>
                {isUr
                  ? 'مکمل سسٹم بیک اپ (تمام ہالز)'
                  : 'Full System Backup (All Halls)'}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isUr
                ? 'تمام ہالز، گاہکوں، بکنگز، ادائیگیوں، کلوزنگ، منظوریوں، اخراجات، ملازمین، حاضری، کیٹلاگ اور آڈٹ لاگز کا مکمل بیک اپ ڈاؤن لوڈ کریں۔'
                : 'Download a complete multi-hall snapshot of all halls, customers, bookings, payments, daily closings, approvals, expenses, employees, attendance, advances, catalog, and audit logs.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{isUr ? 'مکمل بیک اپ (JSON)' : 'Download Full Backup (JSON)'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadExcelBackup}
              className="px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isUr ? 'مکمل بیک اپ (Excel)' : 'Download Full Backup (Excel .xlsx)'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
