import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  dotColor?: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No matching options',
  disabled = false,
  required = false,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="sr-only"
        />
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={`w-full bg-slate-950/70 border ${
          open ? 'border-cyan-500' : 'border-slate-800'
        } rounded-xl px-3 py-2 text-sm text-white flex items-center justify-between gap-2 focus:outline-none focus:border-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {selectedOption?.dotColor && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          )}
          <span className={selectedOption ? 'text-white truncate' : 'text-slate-400 truncate'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-800 flex items-center gap-1.5 bg-slate-900/90">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-start px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    {opt.dotColor && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: opt.dotColor }}
                      />
                    )}
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[11px] text-slate-400 truncate">
                        ({opt.sublabel})
                      </span>
                    )}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">{emptyText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
