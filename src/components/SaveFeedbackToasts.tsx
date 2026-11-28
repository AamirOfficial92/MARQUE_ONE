import React from 'react';
import { AlertOctagon, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { tr } from '../i18n/translations';
import { SaveToastItem } from '../utils/supabaseErrors';

interface ToastCardProps {
  toast: SaveToastItem;
  onDismiss: (id: string) => void;
  onView?: (toast: SaveToastItem) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss, onView }) => {
  const { lang } = useApp();
  const isSuccess = toast.kind === 'success';
  const isUr = lang === 'ur';

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      aria-live={isSuccess ? 'polite' : 'assertive'}
      className={`pointer-events-auto rounded-2xl border backdrop-blur-xl px-4 py-3.5 transition-all duration-200 ${
        isSuccess
          ? 'border-emerald-500/60 bg-emerald-50/95 text-emerald-950 shadow-[0_12px_36px_-10px_rgba(16,185,129,0.38)] dark:bg-[#061813]/95 dark:text-emerald-50 dark:border-emerald-400/55 dark:shadow-[0_12px_40px_-8px_rgba(16,185,129,0.5)]'
          : 'border-rose-500/65 bg-rose-50/95 text-rose-950 shadow-[0_12px_36px_-10px_rgba(244,63,94,0.38)] dark:bg-[#1b0810]/95 dark:text-rose-50 dark:border-rose-400/60 dark:shadow-[0_12px_40px_-8px_rgba(244,63,94,0.52)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
            isSuccess
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertOctagon className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div
              className={`text-xs sm:text-sm font-bold leading-snug ${
                isSuccess
                  ? 'text-emerald-900 dark:text-emerald-200'
                  : 'text-rose-900 dark:text-rose-200'
              }`}
            >
              {toast.title}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={tr('dismissToast', lang)}
              title={tr('close', lang)}
              className={`p-1 rounded-lg transition-colors shrink-0 ${
                isSuccess
                  ? 'text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                  : 'text-rose-700 hover:bg-rose-500/15 dark:text-rose-300'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p
            className={`text-xs mt-1 leading-relaxed break-words ${
              isSuccess
                ? 'text-emerald-800 dark:text-emerald-100/90'
                : 'text-rose-800 dark:text-rose-100/90'
            }`}
          >
            {toast.details}
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {!isSuccess && toast.technicalCode ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-rose-500/35 bg-rose-500/15 text-[10px] font-mono font-semibold text-rose-800 dark:text-rose-200">
                {tr('technicalCodeLabel', lang)}: {toast.technicalCode}
              </span>
            ) : (
              <span />
            )}

            {isSuccess && toast.viewTarget && onView && (
              <button
                type="button"
                onClick={() => onView(toast)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-600/40 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30 text-[11px] font-semibold transition-colors"
              >
                <span>{tr('viewRecordBtn', lang)}</span>
                <ExternalLink className={`w-3 h-3 ${isUr ? 'scale-x-[-1]' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SaveFeedbackToasts: React.FC = () => {
  const { toasts, dismissToast, requestViewTarget, lang } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="save-toast-root no-print fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-1.5rem)] max-w-lg pointer-events-none flex flex-col gap-2.5"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={dismissToast}
          onView={
            t.viewTarget
              ? (item) => {
                  if (item.viewTarget) {
                    requestViewTarget(item.viewTarget);
                  }
                  dismissToast(item.id);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
};
