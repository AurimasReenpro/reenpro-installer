import { useEffect, useState, useCallback } from 'react';

/**
 * The non-standard event Chromium fires when a site meets the installability
 * criteria. Not in lib.dom yet, so we describe the shape we use.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Listens for `beforeinstallprompt`. Exposes `canInstall` (true only when the
 * browser offered a prompt and the app isn't already installed) and `promptInstall`
 * to trigger the native install dialog on demand.
 */
/** True when the app is already running as an installed standalone PWA. */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectStandalone);

  useEffect(() => {
    // Already running standalone → nothing to subscribe to.
    if (isInstalled) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isInstalled]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsInstalled(true);
    // A prompt can only be used once.
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null && !isInstalled,
    promptInstall,
  };
}
