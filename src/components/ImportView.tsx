import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { Booking, FloorName } from '../types';
import { findBookingConflict } from '../utils/formatters';

const BOOKING_TARGET_FIELDS = [
  { key: 'customer_name', label: 'Customer Name *' },
  { key: 'customer_phone', label: 'Mobile Phone' },
  { key: 'customer_nic', label: 'CNIC Number' },
  { key: 'customer_address', label: 'Address' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'event_date', label: 'Event Date (YYYY-MM-DD) *' },
  { key: 'start_time', label: 'Start Time (HH:MM)' },
  { key: 'end_time', label: 'End Time (HH:MM)' },
  { key: 'floors', label: 'Floors (e.g. First, Second or Full Hall)' },
  { key: 'guests_count', label: 'Guests Count' },
  { key: 'hall_rent', label: 'Hall Rent (PKR)' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
] as const;

export const ImportView: React.FC = () => {
  const { db, importBookingsBatch } = useApp();
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (json.length === 0) return;

      const headers = Object.keys(json[0]);
      setSheetHeaders(headers);
      setRawRows(json);

      // Auto-guess mappings by header similarity
      const autoMap: Record<string, string> = {};
      for (const field of BOOKING_TARGET_FIELDS) {
        const match = headers.find((h) => {
          const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          const targetNorm = field.key.replace(/_/g, '');
          return norm.includes(targetNorm) || targetNorm.includes(norm);
        });
        if (match) autoMap[field.key] = match;
      }
      setMapping(autoMap);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseFloors = (val: unknown): FloorName[] => {
    const s = String(val || 'First');
    if (s.toLowerCase().includes('full')) return ['Full Hall'];
    const valid: FloorName[] = [];
    if (s.toLowerCase().includes('first') || s.includes('1')) valid.push('First');
    if (s.toLowerCase().includes('second') || s.includes('2')) valid.push('Second');
    if (s.toLowerCase().includes('third') || s.includes('3')) valid.push('Third');
    return valid.length > 0 ? valid : ['First'];
  };

  const mappedPreview = useMemo(() => {
    return rawRows.map((row) => {
      const getVal = (field: string) => (mapping[field] ? row[mapping[field]] : '');
      const eventDateRaw = String(getVal('event_date') || '').slice(0, 10);
      const floors = parseFloors(getVal('floors'));
      const startTime = String(getVal('start_time') || '20:00').slice(0, 5);
      const endTime = String(getVal('end_time') || '00:00').slice(0, 5);
      const status = String(getVal('status') || 'Confirmed') as Booking['status'];

      const candidate: Partial<Booking> = {
        customer_name: String(getVal('customer_name') || '').trim(),
        customer_phone: String(getVal('customer_phone') || '0300-0000000').trim(),
        customer_nic: String(getVal('customer_nic') || '42101-0000000-0').trim(),
        customer_address: String(getVal('customer_address') || 'Karachi').trim(),
        event_type: String(getVal('event_type') || 'Baraat').trim(),
        event_date: eventDateRaw,
        start_time: startTime,
        end_time: endTime,
        floors,
        guests_count: Number(getVal('guests_count')) || 250,
        hall_rent: Number(getVal('hall_rent')) || db.settings.default_rent_first,
        status,
        notes: String(getVal('notes') || '').trim(),
      };

      const conflict = candidate.event_date
        ? findBookingConflict(
            {
              event_date: candidate.event_date,
              start_time: startTime,
              end_time: endTime,
              floors,
              status,
            },
            db.bookings,
            db.settings.cleaning_buffer_minutes
          )
        : null;

      return { candidate, conflict };
    });
  }, [rawRows, mapping, db.bookings, db.settings.default_rent_first, db.settings.cleaning_buffer_minutes]);

  const handleDownloadSample = () => {
    const sample = [
      {
        customer_name: 'Saeed Ahmed Khan',
        customer_phone: '0300-5544332',
        customer_nic: '42101-7766554-1',
        customer_address: 'North Nazimabad Block H, Karachi',
        event_type: 'Walima',
        event_date: '2026-12-20',
        start_time: '20:00',
        end_time: '23:30',
        floors: 'First, Second',
        guests_count: 550,
        hall_rent: 340000,
        status: 'Confirmed',
        notes: 'Imported from Google Sheet',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marquee1-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = async () => {
    const res = await importBookingsBatch(mappedPreview.map((m) => m.candidate));
    setResult(res);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
            <span>Import Bookings from Google Sheets (CSV / Excel)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Export your Google Sheet as .csv or .xlsx, map columns below, verify double-booking checks, and import.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadSample}
            className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 text-xs font-medium text-slate-200 flex items-center gap-1.5 hover:border-cyan-500/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sample CSV Template</span>
          </button>

          <label className="cursor-pointer px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload CSV / XLSX</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      {result && (
        <div className="glass-panel neon-border-cyan rounded-2xl p-4 text-xs space-y-2">
          <div className="font-bold text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Import complete: {result.imported} bookings added, {result.skipped} skipped.
            </span>
          </div>
          {result.errors.length > 0 && (
            <ul className="list-disc ps-5 text-amber-300 space-y-0.5">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sheetHeaders.length > 0 && (
        <>
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">Map Spreadsheet Columns</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BOOKING_TARGET_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-slate-400 mb-1">{field.label}</label>
                  <select
                    value={mapping[field.key] || ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  >
                    <option value="">-- Ignore --</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Preview ({mappedPreview.length} rows)</h3>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold"
              >
                Confirm & Import Valid Rows
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-start">Customer</th>
                    <th className="py-2.5 px-4 text-start">Event & Date</th>
                    <th className="py-2.5 px-4 text-start">Floors</th>
                    <th className="py-2.5 px-4 text-end">Rent</th>
                    <th className="py-2.5 px-4 text-start">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {mappedPreview.slice(0, 25).map(({ candidate, conflict }, i) => (
                    <tr key={i}>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-white">{candidate.customer_name || '—'}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">{candidate.customer_phone}</div>
                      </td>
                      <td className="py-2.5 px-4 tabular-nums text-slate-200">
                        {candidate.event_type} · {candidate.event_date || 'Missing'} ({candidate.start_time}–{candidate.end_time})
                      </td>
                      <td className="py-2.5 px-4 text-cyan-300">{candidate.floors?.join(', ')}</td>
                      <td className="py-2.5 px-4 text-end tabular-nums text-white">{candidate.hall_rent}</td>
                      <td className="py-2.5 px-4">
                        {conflict ? (
                          <span className="text-rose-400 font-semibold">Conflict: {conflict.booking_code}</span>
                        ) : !candidate.customer_name || !candidate.event_date ? (
                          <span className="text-amber-400">Missing required fields</span>
                        ) : (
                          <span className="text-emerald-400">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
