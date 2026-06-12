import { defineConfig } from 'vitest/config';

// Standalone config (used instead of vite.config.ts) so the PWA/React plugins
// don't run during tests. These are pure-logic suites — Node environment, no DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
