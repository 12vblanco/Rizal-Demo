// @ts-check
// Playwright runs against the *built* dist/ (served by scripts/serve.js), not a
// dev build — smoke + axe tests exercise the real output. `npm run check` builds
// first, so the webServer only serves; set PW_BUILD=1 to build on demand when
// running `npm run test:e2e` standalone.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Skip the progressive-enhancement View Transition animations so clicks
    // aren't blocked by a lingering ::view-transition overlay between documents.
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PW_BUILD ? "npm run build && node scripts/serve.js" : "node scripts/serve.js",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
