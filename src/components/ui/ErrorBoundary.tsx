import React from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle } from 'lucide-react';

interface FallbackProps {
  error: Error;
  resetError: () => void;
}

const ErrorFallback = ({ error, resetError }: FallbackProps) => {
  const isDev = import.meta.env.DEV;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-danger dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="h-8 w-8" />
        </div>

        <h1 className="mb-4 text-[24px] font-bold text-text">Įvyko klaida</h1>

        <p className="mb-8 text-[15px] leading-relaxed text-muted">
          Atsiprašome už nepatogumą. Klaida jau užfiksuota. Spustelėkite mygtuką, kad bandytumėte iš naujo.
        </p>

        {isDev && (
          <div className="mb-8 overflow-auto rounded-xl border border-border bg-surface-2 p-4 text-left">
            <p className="font-mono text-[13px] text-primary">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={resetError}
            className="h-[48px] w-full rounded-xl bg-primary text-[15px] font-bold text-white transition-colors hover:opacity-90 active:scale-[0.98]"
          >
            Bandyti iš naujo
          </button>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="h-[48px] w-full rounded-xl border border-border bg-surface text-[15px] font-bold text-text transition-colors hover:bg-surface-2 active:scale-[0.98]"
          >
            Grįžti į pradžią
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={(props) => (
        <ErrorFallback
          error={props.error instanceof Error ? props.error : new Error(String(props.error))}
          resetError={() => {
            props.resetError();
          }}
        />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
