import React, { useState } from 'react';
import { CalendarRange, Database, Download, FileSpreadsheet, Monitor, Moon, Plus, RotateCcw, Save, Sun, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { FloorName, FloorRatePair, HallSettings, RentSeasonRule } from '../types';
import { formatPKR } from '../utils/formatters';

type SettingsTab = 'hall' | 'pricing' | 'catalog' | 'events' | 'backup';

const FLOOR_LIST: FloorName[] = ['First', 'Second', 'Third', 'Full Hall'];

export const SettingsView: React.FC = () => {
  const {
    db,
    lang,
    theme,
    themePreferenceSource,
    setTheme,
    resetThemeToSystem,
    supabaseLive,
    updateSettings,
    saveChargeCategory,
    saveChargeItem,
    softDeleteChargeItem,
    saveEventType,
    resetDemoDatabase,
  } = useApp();

  const [tab, setTab] = useState<SettingsTab>('hall');
  const [form, setForm] = useState<HallSettings>(db.settings);
  const [savedNotice, setSavedNotice] = useState(false);

  // Catalog Category & Item creation
  const activeCategories = db.chargeCategories.filter((c) => !c.deleted_at);
  const activeCharges = db.chargesCatalog.filter((c) => !c.deleted_at);
  const activeEventTypes = db.eventTypes.filter((e) => !e.deleted_at);

  const [newCatEn, setNewCatEn] = useState('');
  const [newCatUr, setNewCatUr] = useState('');

  const [chargeCatId, setChargeCatId] = useState(activeCategories[0]?.id || '');
  const [chargeNameEn, setChargeNameEn] = useState('');
  const [chargeNameUr, setChargeNameUr] = useState('');
  const [chargeRate, setChargeRate] = useState('5000');
  const [chargeUnit, setChargeUnit] = useState('Event');
  const [chargeDefaultPkg, setChargeDefaultPkg] = useState(false);
  const [chargeIsCrate, setChargeIsCrate] = useState(false);

  const [etEn, setEtEn] = useState('');
  const [etUr, setEtUr] = useState('');
  const [etColor, setEtColor] = useState('#06B6D4');

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await updateSettings(form);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
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
      name: 'New Season',
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

  const handleDownloadJsonBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marquee1-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcelBackup = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.bookings), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.bookingItems), 'BookingItems');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.payments), 'Payments');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.expenses), 'Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.employees), 'Employees');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.attendance), 'Attendance');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.advances), 'Advances');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.chargesCatalog), 'ChargesCatalog');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.auditLogs), 'AuditLogs');
    XLSX.writeFile(wb, `marquee1-full-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 w-fit">
        {(
          [
            { id: 'hall', label: 'Hall & Invoice Policy' },
            { id: 'pricing', label: 'Suggested Rent & Seasons' },
            { id: 'catalog', label: 'Charges & Packages Catalog' },
            { id: 'events', label: 'Event Types' },
            { id: 'backup', label: 'Full Backup' },
          ] as Array<{ id: SettingsTab; label: string }>
        ).map((t) => (
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

      {tab === 'hall' && (
        <div className="space-y-6">
          {/* Appearance & Theme Selector */}
          <div className="glass-panel rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">{tr('appearance', lang)}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === 'ur'
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
              <h3 className="text-base font-bold text-white">Hall Profile, Invoice Rules & Operational Buffers</h3>
              {savedNotice && <span className="text-xs font-semibold text-emerald-400">Settings Saved</span>}
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Hall Name (English)</label>
              <input
                type="text"
                value={form.hall_name}
                onChange={(e) => setForm({ ...form, hall_name: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Hall Name (Urdu)</label>
              <input
                type="text"
                dir="rtl"
                value={form.hall_name_ur}
                onChange={(e) => setForm({ ...form, hall_name_ur: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Address (English)</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Address (Urdu)</label>
              <input
                type="text"
                dir="rtl"
                value={form.address_ur}
                onChange={(e) => setForm({ ...form, address_ur: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Logo URL (Optional)</label>
              <input
                type="text"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-300 mb-1">Invoice Format</label>
                <input
                  type="text"
                  value={form.invoice_format}
                  onChange={(e) => setForm({ ...form, invoice_format: e.target.value })}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Tax %</label>
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
                <label className="block text-slate-300 mb-1">Default Lang</label>
                <select
                  value={form.default_language}
                  onChange={(e) => setForm({ ...form, default_language: e.target.value as 'en' | 'ur' })}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="en">English</option>
                  <option value="ur">Urdu (RTL)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-3 border-t border-slate-800">
            <div>
              <label className="block text-slate-300 mb-1">Cleaning / Setup Buffer (Minutes)</label>
              <input
                type="number"
                min={0}
                value={form.cleaning_buffer_minutes}
                onChange={(e) => setForm({ ...form, cleaning_buffer_minutes: Math.max(0, Number(e.target.value)) })}
                className="w-full bg-slate-950/70 border border-cyan-500/35 rounded-xl px-3 py-2 text-white tabular-nums"
              />
              <p className="text-[11px] text-slate-500 mt-1">Required gap between events on overlapping floors.</p>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Late Charge Grace Period (Minutes)</label>
              <input
                type="number"
                min={0}
                value={form.late_grace_minutes}
                onChange={(e) => setForm({ ...form, late_grace_minutes: Math.max(0, Number(e.target.value)) })}
                className="w-full bg-slate-950/70 border border-amber-500/35 rounded-xl px-3 py-2 text-white tabular-nums"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default 60 min; late charge rates are selected per booking.</p>
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Crate Handling Deduction (PKR / Crate)</label>
              <input
                type="number"
                min={0}
                value={form.crate_deduction_per_returned}
                onChange={(e) =>
                  setForm({ ...form, crate_deduction_per_returned: Math.max(0, Number(e.target.value)) })
                }
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
              />
              <p className="text-[11px] text-slate-500 mt-1">Deducted for ice & handling on returned cold drink crates.</p>
            </div>
          </div>

          <div className="pt-2">
            <label className="inline-flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.hide_discount_reason_on_invoice)}
                onChange={(e) => setForm({ ...form, hide_discount_reason_on_invoice: e.target.checked })}
                className="rounded border-slate-700 bg-slate-950"
              />
              <span>
                Hide discount reason/note on customer A4 Invoice (only show &ldquo;Special Discount&rdquo;)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Invoice Terms (English)</label>
              <textarea
                rows={3}
                value={form.terms_en}
                onChange={(e) => setForm({ ...form, terms_en: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Invoice Terms (Urdu)</label>
              <textarea
                rows={3}
                dir="rtl"
                value={form.terms_ur}
                onChange={(e) => setForm({ ...form, terms_ur: e.target.value })}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Hall Settings</span>
          </button>
        </form>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="space-y-6">
          {/* Standard Weekday / Weekend Suggested Rent Table */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">Standard Suggested Hall Rent Table</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Auto-suggested on new bookings based on floor &amp; day type (Weekday Mon–Thu vs Weekend Fri–Sun). Staff can always override rent manually.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {savedNotice && <span className="text-xs font-semibold text-emerald-400">Pricing Saved</span>}
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Rent Tables</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Floor Option</th>
                    <th className="py-2.5 px-4 text-end">Weekday Rate (Mon–Thu)</th>
                    <th className="py-2.5 px-4 text-end">Weekend Rate (Fri–Sun)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {FLOOR_LIST.map((fl) => (
                    <tr key={fl}>
                      <td className="py-3 px-4 font-semibold text-white">
                        {fl === 'Full Hall' ? 'Full Hall (All 3 Floors)' : `${fl} Floor`}
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

          {/* Seasonal Pricing Rules */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-cyan-400" />
                  <span>Seasonal Suggested Rent Rules (Editable Date Ranges)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When an event date falls inside a season range, its rates override the Standard table for auto-suggestion.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddSeason}
                className="px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Season Rule</span>
              </button>
            </div>

            <div className="space-y-4">
              {(form.rent_seasons || []).map((season) => (
                <div key={season.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-400 mb-1">Season Name</label>
                      <input
                        type="text"
                        value={season.name}
                        onChange={(e) => updateSeason(season.id, (s) => ({ ...s, name: e.target.value }))}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={season.start_date}
                        onChange={(e) => updateSeason(season.id, (s) => ({ ...s, start_date: e.target.value }))}
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white tabular-nums"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-[11px] text-slate-400 mb-1">End Date</label>
                        <input
                          type="date"
                          value={season.end_date}
                          onChange={(e) => updateSeason(season.id, (s) => ({ ...s, end_date: e.target.value }))}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white tabular-nums"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSeason(season.id)}
                        className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                        title="Remove season"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {FLOOR_LIST.map((fl) => (
                      <div key={fl} className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 space-y-2">
                        <div className="font-semibold text-cyan-300 text-[11px]">{fl}</div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">Wkday</span>
                          <input
                            type="number"
                            min={0}
                            value={season.rates[fl]?.weekday ?? 0}
                            onChange={(e) =>
                              updateSeason(season.id, (s) => ({
                                ...s,
                                rates: {
                                  ...s.rates,
                                  [fl]: { ...s.rates[fl], weekday: Math.max(0, Number(e.target.value)) },
                                },
                              }))
                            }
                            className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-end text-white tabular-nums"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">Wkend</span>
                          <input
                            type="number"
                            min={0}
                            value={season.rates[fl]?.weekend ?? 0}
                            onChange={(e) =>
                              updateSeason(season.id, (s) => ({
                                ...s,
                                rates: {
                                  ...s.rates,
                                  [fl]: { ...s.rates[fl], weekend: Math.max(0, Number(e.target.value)) },
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
              ))}
              {(form.rent_seasons || []).length === 0 && (
                <p className="text-xs text-slate-500">No custom seasons configured. Standard Weekday/Weekend table applies year-round.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCatEn.trim()) return;
                await saveChargeCategory({ name_en: newCatEn.trim(), name_ur: newCatUr.trim() || newCatEn.trim() });
                setNewCatEn('');
                setNewCatUr('');
              }}
              className="glass-panel rounded-2xl p-5 space-y-3 text-xs"
            >
              <h3 className="text-sm font-bold text-white">Add Charge Category</h3>
              <input
                type="text"
                required
                value={newCatEn}
                onChange={(e) => setNewCatEn(e.target.value)}
                placeholder="Category (English)"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
              <input
                type="text"
                dir="rtl"
                value={newCatUr}
                onChange={(e) => setNewCatUr(e.target.value)}
                placeholder="زمرہ (اردو)"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Category</span>
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chargeNameEn.trim()) return;
                await saveChargeItem({
                  category_id: chargeCatId,
                  name_en: chargeNameEn.trim(),
                  name_ur: chargeNameUr.trim() || chargeNameEn.trim(),
                  default_rate: Number(chargeRate) || 0,
                  unit_label: chargeUnit.trim() || 'Event',
                  is_default_package: chargeDefaultPkg,
                  is_crate_service: chargeIsCrate,
                });
                setChargeNameEn('');
                setChargeNameUr('');
                setChargeIsCrate(false);
              }}
              className="glass-panel rounded-2xl p-5 space-y-3 text-xs"
            >
              <h3 className="text-sm font-bold text-white">Add Catalog Service / Charge</h3>
              <select
                value={chargeCatId}
                onChange={(e) => setChargeCatId(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              >
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={chargeNameEn}
                onChange={(e) => setChargeNameEn(e.target.value)}
                placeholder="Charge Name (English)"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
              />
              <input
                type="text"
                dir="rtl"
                value={chargeNameUr}
                onChange={(e) => setChargeNameUr(e.target.value)}
                placeholder="چارج کا نام (اردو)"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  value={chargeRate}
                  onChange={(e) => setChargeRate(e.target.value)}
                  placeholder="Default Rate"
                  className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white tabular-nums"
                />
                <input
                  type="text"
                  value={chargeUnit}
                  onChange={(e) => setChargeUnit(e.target.value)}
                  placeholder="Unit (Event/Crate)"
                  className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={chargeDefaultPkg}
                  onChange={(e) => setChargeDefaultPkg(e.target.checked)}
                />
                <span>Include automatically in Default Package</span>
              </label>
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={chargeIsCrate}
                  onChange={(e) => setChargeIsCrate(e.target.checked)}
                />
                <span>Use Cold Drink Crate fields (Ordered/Used/Returned)</span>
              </label>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold"
              >
                Add Charge Item
              </button>
            </form>
          </div>

          <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Hall Services &amp; Charges Catalog</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Item</th>
                    <th className="py-2.5 px-4 text-start">Category</th>
                    <th className="py-2.5 px-4 text-end">Default Rate</th>
                    <th className="py-2.5 px-4 text-end">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {activeCharges.map((ch) => {
                    const cat = activeCategories.find((c) => c.id === ch.category_id);
                    return (
                      <tr key={ch.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {ch.name_en}{' '}
                            {ch.is_default_package && <span className="text-[11px] text-cyan-400">· Default Pkg</span>}
                            {(ch.is_crate_service || ch.name_en.toLowerCase().includes('cold drink')) && (
                              <span className="text-[11px] text-emerald-400">· Crate Reversal</span>
                            )}
                          </div>
                          <div className="font-urdu text-[11px] text-slate-400">{ch.name_ur}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{cat?.name_en || 'General'}</td>
                        <td className="py-3 px-4 text-end tabular-nums font-semibold text-amber-300">
                          {formatPKR(ch.default_rate)} / {ch.unit_label}
                        </td>
                        <td className="py-3 px-4 text-end">
                          <button
                            type="button"
                            onClick={() => softDeleteChargeItem(ch.id)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {tab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!etEn.trim()) return;
              await saveEventType({
                name_en: etEn.trim(),
                name_ur: etUr.trim() || etEn.trim(),
                color_hex: etColor,
              });
              setEtEn('');
              setEtUr('');
            }}
            className="glass-panel rounded-2xl p-5 space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-white">Add Custom Event Type</h3>
            <input
              type="text"
              required
              value={etEn}
              onChange={(e) => setEtEn(e.target.value)}
              placeholder="Event Name (English), e.g. Mehndi / Aqeeqah"
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white"
            />
            <input
              type="text"
              dir="rtl"
              value={etUr}
              onChange={(e) => setEtUr(e.target.value)}
              placeholder="تقریب کا نام (اردو)"
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-white font-urdu"
            />
            <div className="flex items-center gap-3">
              <label className="text-slate-300">Calendar Color:</label>
              <input
                type="color"
                value={etColor}
                onChange={(e) => setEtColor(e.target.value)}
                className="w-10 h-8 rounded bg-transparent border-0"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold"
            >
              Add Event Type
            </button>
          </form>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">Configured Event Types</h3>
            <div className="divide-y divide-slate-800/70 text-xs">
              {activeEventTypes.map((et) => (
                <div key={et.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: et.color_hex }} />
                    <span className="font-semibold text-white">{et.name_en}</span>
                  </div>
                  <span className="font-urdu text-slate-300">{et.name_ur}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="glass-panel rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              <span>Full System Backup &amp; Restore</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Download a complete snapshot of all bookings, payments, installments, expenses, employees, attendance, advances, catalog, and audit logs.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Full Backup (JSON)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadExcelBackup}
              className="px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-semibold flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Full Backup (Excel .xlsx)</span>
            </button>
            {!supabaseLive && (
              <button
                type="button"
                onClick={resetDemoDatabase}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 text-xs font-semibold flex items-center gap-2 hover:border-rose-500/40 hover:text-rose-300"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Seed Data (Preview)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
