/**
 * Browser tests (gap H3) — `npm run test:e2e`.
 *
 * The server is started on the built frontend (`dist/ui`) with the memory
 * store and a test key, so what is driven is what is deployed, not the
 * source it was built from. Chromium only: the audience is a bank's desk,
 * and the responsive rules are checked by viewport rather than by device.
 */

'use strict';

const { defineConfig } = require('@playwright/test');

const PORT = 3097;

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    /* CI installs the Chromium this Playwright expects; a machine with a
       pre-installed one names it in PW_CHROMIUM. */
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'node src/server.js',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      FINTECH_API_PORT: String(PORT),
      STORAGE_BACKEND: 'memory',
      LOG_LEVEL: 'silent',
      UI_API_KEY: 'ck_test_e2e00000000000000000000000000000',
      /* The account the journeys sign in as has to be created by something
         holding `admin`, and the dashboard key deliberately stops short of
         it. The development key holds everything and is refused in
         production by config.validate(). */
      DEV_API_KEY: 'ck_test_e2eadmin000000000000000000000000',
      UI_DIR: 'dist/ui',
      API_KEY_SALT: 'e2e-salt-not-for-production',
      ALLOWED_ORIGINS: `http://127.0.0.1:${PORT}`,
    },
  },
});
