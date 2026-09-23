import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a locally hosted Excalidraw instance (see repo README for the
 * pinned commit). Start the app separately with `yarn start` in the
 * excalidraw-app workspace before running tests.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  // Default expect() timeout is 5s. Bumped to 8s: local runs with several
  // parallel workers hitting one dev server can genuinely slow down
  // Excalidraw's debounced localStorage writes under CPU contention, and a
  // test that's correct but just slow shouldn't fail differently than a
  // test that's actually broken. Isolated single-test runs confirmed the
  // underlying behavior was correct — only concurrent runs were timing out.
  expect: {
    timeout: 8000,
  },
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Enabled once the Chromium suite is stable (per test strategy §4).
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],
});
