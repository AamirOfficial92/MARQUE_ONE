import React, { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AuditLogView: React.FC = () => {
  const { db } = useApp();
  const [filter, setFilter] = useState('');

  const logs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return db.auditLogs.filter((l) => {
      if (!q) return true;
      return (
        l.actor_name.toLowerCase().includes(q) ||
        l.entity_label.toLowerCase().includes(q) ||
        l.entity_type.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    });
  }, [db.auditLogs, filter]);

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-violet-400" />
            <span>System Audit Log</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Tracks all bookings, event date changes, payments, expenses, deletions, restorations, and settings updates.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 rtl:left-auto rtl:right-3" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter actor, code, or action..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white"
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 text-start">Timestamp</th>
                <th className="py-3 px-4 text-start">Actor & Role</th>
                <th className="py-3 px-4 text-start">Action</th>
                <th className="py-3 px-4 text-start">Target</th>
                <th className="py-3 px-4 text-start">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/30">
                  <td className="py-3 px-4 tabular-nums text-slate-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-PK')}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{log.actor_name}</div>
                    <div className="text-[11px] text-amber-300 capitalize">{log.actor_role.replace('_', ' ')}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    <span
                      className={
                        log.action === 'PERMISSIONS'
                          ? 'text-amber-300'
                          : log.action === 'DELETE'
                          ? 'text-rose-400'
                          : 'text-cyan-300'
                      }
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-white font-medium">{log.entity_label}</div>
                    <div className="text-[11px] text-slate-500">{log.entity_type}</div>
                  </td>
                  <td className="py-3 px-4 text-[11px] text-slate-300 max-w-md break-words">
                    {log.action === 'PERMISSIONS' &&
                    Array.isArray((log.changes as { changed_screens?: unknown[] })?.changed_screens) ? (
                      <div className="space-y-1">
                        {(
                          (log.changes as {
                            changed_screens: Array<{
                              screen_key: string;
                              before: { view: boolean; edit: boolean; delete: boolean };
                              after: { view: boolean; edit: boolean; delete: boolean };
                            }>;
                          }).changed_screens || []
                        ).map((diff) => (
                          <div key={diff.screen_key} className="font-mono text-[10px] text-slate-300">
                            <span className="text-cyan-300 font-semibold">{diff.screen_key}</span>:{' '}
                            <span className="text-slate-400">
                              [V:{diff.before.view ? '1' : '0'} E:{diff.before.edit ? '1' : '0'} D:{diff.before.delete ? '1' : '0'}]
                            </span>
                            {' → '}
                            <span className="text-emerald-300">
                              [V:{diff.after.view ? '1' : '0'} E:{diff.after.edit ? '1' : '0'} D:{diff.after.delete ? '1' : '0'}]
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono">{JSON.stringify(log.changes)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
