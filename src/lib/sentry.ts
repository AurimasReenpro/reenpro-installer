import * as Sentry from "@sentry/react";

const DSN = String(import.meta.env.VITE_SENTRY_DSN || '');

export function initSentry() {
  if (!DSN) {
    console.warn("Sentry DSN not set – skipping init");
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: String(import.meta.env.MODE),
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    beforeSend(event) {
      // Neperduodame PII (asmeninių duomenų) į Sentry
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}
