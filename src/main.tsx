import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import ErrorBoundary from './components/ui/ErrorBoundary'

initSentry()

// One-time self-heal: the app previously shipped a PWA service worker. It has
// been removed, but a service worker already installed on a device keeps serving
// its stale cached bundle indefinitely. Unregister any existing worker and drop
// its caches so every device picks up the latest code on the next load. This is
// a cheap no-op once no workers/caches remain.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => { void reg.unregister(); });
  });
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      keys.forEach((key) => { void caches.delete(key); });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
