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
    <div className="min-h-screen flex items-center justify-center bg-[#f6f5fa] p-4">
      <div className="bg-white p-8 rounded-[16px] shadow-[0_4px_20px_rgba(29,3,58,0.05)] max-w-md w-full text-center">
        <div className="w-16 h-16 bg-[#ffdad6] rounded-full flex items-center justify-center mx-auto mb-6 text-[#ba1a1a]">
          <AlertCircle className="w-8 h-8" />
        </div>
        
        <h1 className="text-[24px] font-bold text-[#1d033a] mb-4">Įvyko klaida</h1>
        
        <p className="text-[15px] text-[#4b4452] mb-8 leading-relaxed">
          Atsiprašome už nepatogumą. Klaida jau užfiksuota. Spustelėkite mygtuką, kad bandytumėte iš naujo.
        </p>

        {isDev && (
          <div className="bg-[#fbf0ff] p-4 rounded-[8px] mb-8 text-left overflow-auto border border-[#490891]/20">
            <p className="text-[13px] font-mono text-[#490891]">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={resetError}
            className="w-full h-[48px] bg-[#490891] text-white rounded-[12px] font-bold text-[15px] hover:bg-[#8052b2] transition-colors active:scale-[0.98]"
          >
            Bandyti iš naujo
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="w-full h-[48px] bg-white text-[#1d033a] border border-[#cdc3d4] rounded-[12px] font-bold text-[15px] hover:bg-[#f6f5fa] transition-colors active:scale-[0.98]"
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
    <Sentry.ErrorBoundary fallback={(props) => <ErrorFallback error={props.error instanceof Error ? props.error : new Error(String(props.error))} resetError={() => { props.resetError(); }} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
