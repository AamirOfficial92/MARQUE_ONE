import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { translateFloor, translateStatus } from '../i18n/translations';
import { Booking, FloorName } from '../types';
import { addDaysISO, formatDateDisplay, formatTime12h, todayISO } from '../utils/formatters';

interface CalendarViewProps {
  onSelectBooking: (booking: Booking) => void;
  onCreateOnDate: (dateISO: string) => void;
}

type CalMode = 'month' | 'week' | 'day';

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectBooking, onCreateOnDate }) => {
  const { db, lang, currentUser } = useApp();
  const [mode, setMode] = useState<CalMode>('month');
  const [cursorDate, setCursorDate] = useState<string>(todayISO());
  const [floorFilter, setFloorFilter] = useState<'ALL' | FloorName>('ALL');

  const canCreate = currentUser?.role === 'super_admin' || currentUser?.role === 'management';

  const filteredBookings = useMemo(() => {
    return db.bookings
      .filter((b) => {
        if (b.deleted_at || b.status === 'Cancelled') return false;
        if (floorFilter === 'ALL') return true;
        return b.floors.includes(floorFilter) || b.floors.includes('Full Hall');
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [db.bookings, floorFilter]);

  const getEventColor = (eventType: string) => {
    return db.eventTypes.find((e) => e.name_en === eventType)?.color_hex || '#06B6D4';
  };

  const parsedCursor = new Date(`${cursorDate}T00:00:00`);
  const year = parsedCursor.getFullYear();
  const month = parsedCursor.getMonth();

  const shiftCursor = (delta: number) => {
    if (mode === 'month') {
      const d = new Date(year, month + delta, 1);
      setCursorDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    } else if (mode === 'week') {
      setCursorDate(addDaysISO(cursorDate, delta * 7));
    } else {
      setCursorDate(addDaysISO(cursorDate, delta));
    }
  };

  // Month grid cells
  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ iso: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, dayNum: d });
    }
    return cells;
  }, [year, month]);

  // Week 7 days starting Sunday of cursorDate
  const weekDays = useMemo(() => {
    const d = new Date(`${cursorDate}T00:00:00`);
    const sundayOffset = -d.getDay();
    return Array.from({ length: 7 }, (_, i) => addDaysISO(cursorDate, sundayOffset + i));
  }, [cursorDate]);

  const floorsList: Array<'ALL' | FloorName> = ['ALL', 'First', 'Second', 'Third', 'Full Hall'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftCursor(-1)}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 text-slate-300"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
          <div className="min-w-[160px] text-center font-semibold text-sm text-white">
            {mode === 'month'
              ? parsedCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : formatDateDisplay(cursorDate, lang)}
          </div>
          <button
            type="button"
            onClick={() => shiftCursor(1)}
            className="p-2 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 text-slate-300"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => setCursorDate(todayISO())}
            className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/70 text-xs text-cyan-300 hover:border-cyan-500/40"
          >
            Today
          </button>
        </div>

        {/* Floor filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          {floorsList.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFloorFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                floorFilter === f
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {f === 'ALL' ? (lang === 'ur' ? 'تمام فلورز' : 'All Floors') : translateFloor(f, lang)}
            </button>
          ))}
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
          {(['month', 'week', 'day'] as CalMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                mode === m
                  ? 'bg-violet-500/25 text-violet-200 border border-violet-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Event Type Color Key */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-400">
        {db.eventTypes
          .filter((e) => !e.deleted_at)
          .map((et) => (
            <span key={et.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: et.color_hex }} />
              <span>{lang === 'ur' ? et.name_ur : et.name_en}</span>
            </span>
          ))}
      </div>

      {/* MONTH VIEW */}
      {mode === 'month' && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/60">
            {dayNames.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(105px,auto)]">
            {monthCells.map((cell, idx) => {
              if (!cell.iso) {
                return <div key={`empty-${idx}`} className="border-b border-e border-slate-800/60 bg-slate-950/30" />;
              }
              const dayBookings = filteredBookings.filter((b) => b.event_date === cell.iso);
              const isToday = cell.iso === todayISO();
              return (
                <div
                  key={cell.iso}
                  className={`border-b border-e border-slate-800/60 p-1.5 sm:p-2 flex flex-col gap-1 transition-colors ${
                    isToday ? 'bg-cyan-500/5' : 'hover:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                        isToday ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => onCreateOnDate(cell.iso!)}
                        title="Book this date"
                        className="p-1 rounded text-slate-500 hover:text-cyan-300 hover:bg-slate-800/80"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayBookings.map((bk) => {
                      const col = getEventColor(bk.event_type);
                      return (
                        <button
                          key={bk.id}
                          type="button"
                          onClick={() => onSelectBooking(bk)}
                          className="w-full text-start px-1.5 py-1 rounded-md text-[11px] leading-tight border transition-opacity hover:opacity-90 truncate"
                          style={{
                            borderColor: `${col}66`,
                            backgroundColor: `${col}22`,
                            color: '#f8fafc',
                          }}
                        >
                          <div className="font-semibold truncate">{bk.customer_name}</div>
                          <div className="text-[10px] text-slate-300 truncate tabular-nums">
                            {bk.floors.join(', ')} · {formatTime12h(bk.start_time)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {mode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((iso) => {
            const dayBookings = filteredBookings.filter((b) => b.event_date === iso);
            const isToday = iso === todayISO();
            return (
              <div
                key={iso}
                className={`glass-panel rounded-2xl p-3 flex flex-col gap-2 min-h-[220px] ${
                  isToday ? 'neon-border-cyan' : ''
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-semibold text-white tabular-nums">
                    {formatDateDisplay(iso, lang)}
                  </span>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => onCreateOnDate(iso)}
                      className="p-1 rounded-lg bg-slate-800/80 text-cyan-300 hover:bg-cyan-500/20"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  {dayBookings.map((bk) => {
                    const col = getEventColor(bk.event_type);
                    return (
                      <button
                        key={bk.id}
                        type="button"
                        onClick={() => onSelectBooking(bk)}
                        className="w-full text-start p-2.5 rounded-xl border transition-transform hover:scale-[1.01]"
                        style={{ borderColor: `${col}70`, backgroundColor: `${col}1F` }}
                      >
                        <div className="text-xs font-bold text-white truncate">{bk.event_type}</div>
                        <div className="text-xs text-slate-200 truncate mt-0.5">{bk.customer_name}</div>
                        <div className="text-[11px] text-slate-300 mt-1 tabular-nums">
                          {formatTime12h(bk.start_time)}–{formatTime12h(bk.end_time)}
                        </div>
                        <div className="text-[11px] text-cyan-300 mt-0.5">{bk.floors.join(', ')}</div>
                      </button>
                    );
                  })}
                  {dayBookings.length === 0 && (
                    <div className="text-[11px] text-slate-600 py-4 text-center">Available</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DAY VIEW */}
      {mode === 'day' && (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white tabular-nums">
              {formatDateDisplay(cursorDate, lang)}
            </h3>
            {canCreate && (
              <button
                type="button"
                onClick={() => onCreateOnDate(cursorDate)}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Book This Date</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(['First', 'Second', 'Third', 'Full Hall'] as FloorName[]).map((fl) => {
              const floorBookings = filteredBookings.filter(
                (b) =>
                  b.event_date === cursorDate &&
                  (b.floors.includes(fl) || (fl !== 'Full Hall' && b.floors.includes('Full Hall')))
              );
              return (
                <div key={fl} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="text-xs font-semibold text-cyan-300 border-b border-slate-800 pb-2">
                    {translateFloor(fl, lang)}
                  </div>
                  {floorBookings.map((bk) => {
                    const col = getEventColor(bk.event_type);
                    return (
                      <button
                        key={bk.id}
                        type="button"
                        onClick={() => onSelectBooking(bk)}
                        className="w-full text-start p-3 rounded-xl border"
                        style={{ borderColor: `${col}66`, backgroundColor: `${col}1E` }}
                      >
                        <div className="text-xs font-bold text-white">{bk.booking_code}</div>
                        <div className="text-xs text-slate-200 mt-0.5">{bk.customer_name}</div>
                        <div className="text-[11px] text-slate-300 mt-1 tabular-nums">
                          {bk.event_type} · {bk.start_time}–{bk.end_time}
                        </div>
                        <div className="text-[11px] text-amber-300 mt-0.5">
                          {translateStatus(bk.status, lang)} · {bk.guests_count} guests
                        </div>
                      </button>
                    );
                  })}
                  {floorBookings.length === 0 && (
                    <div className="text-xs text-slate-500 py-4">Open for booking</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
