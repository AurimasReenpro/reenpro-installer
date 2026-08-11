import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

type AdminEmptyStateProps = {
  title?: string;
  message?: string;
  icon?: ReactNode;
  className?: string;
};

export function AdminEmptyState({
  title = 'Įrašų nerasta.',
  message,
  icon,
  className = '',
}: AdminEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-12 text-center ${className}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-subtle">
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="text-[14px] font-semibold text-text">{title}</p>
      {message ? <p className="mt-1 max-w-md text-[13px] text-subtle">{message}</p> : null}
    </div>
  );
}

type AdminPageErrorProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function AdminPageError({
  title = 'Duomenų nepavyko įkelti.',
  message,
  onRetry,
  className = '',
}: AdminPageErrorProps) {
  return (
    <div
      className={`rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-[14px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 ${className}`}
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            {message ? <p className="mt-1 text-[13px] opacity-90">{message}</p> : null}
          </div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="h-10 shrink-0 rounded-xl border border-current px-4 text-[13px] font-semibold transition-colors hover:bg-red-100/70 active:scale-[0.98] dark:hover:bg-red-500/15"
          >
            Bandyti dar kartą
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AdminTableSkeletonRowsProps = {
  columns: number;
  rows?: number;
};

export function AdminTableSkeletonRows({ columns, rows = 6 }: AdminTableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} className="border-b border-border dark:border-white/5">
          <td colSpan={columns} className="px-4 py-3">
            <div className="h-6 animate-pulse rounded-lg bg-surface-2 dark:bg-white/5" />
          </td>
        </tr>
      ))}
    </>
  );
}

type AdminPanelSkeletonProps = {
  className?: string;
};

export function AdminPanelSkeleton({ className = 'h-72' }: AdminPanelSkeletonProps) {
  return <div className={`${className} animate-pulse rounded-2xl bg-surface-2 dark:bg-white/5`} />;
}
