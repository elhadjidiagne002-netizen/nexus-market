// playwright.config.js
// Documentation : https://playwright.dev/docs/test-configuration
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // 60s : l'app est un monolithe lourd (~2 Mo de HTML + nombreux scripts tiers,
  // pubs, vidéos). Un goto 'domcontentloaded' peut prendre plusieurs secondes,
  // puis on attend l'apparition des cartes produit (chargées via Supabase).
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    // URL de base : preview Cloudflare ou local
    baseURL: process.env.NEXUS_BASE_URL || 'https://5d15ae2f.nexus-market-asb.pages.dev',
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
});
