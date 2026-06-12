import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

/** Read the persisted preference, defaulting to 'system'. */
export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve a preference to a concrete light/dark and toggle the .dark class on <html>. */
export function applyTheme(pref: ThemePreference): void {
  const isDark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * Enterprise theme hook: Light / Dark / System, persisted to localStorage,
 * and reactive to OS changes while in 'system' mode.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredTheme);

  // Apply on mount and whenever the preference changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS appearance changes while the user is on 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setThemeState(pref);
  }, []);

  return { theme, setTheme };
}
