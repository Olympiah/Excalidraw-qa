import { test as base } from "@playwright/test";
import { CanvasPage } from "../pages/CanvasPage";

interface Fixtures {
  canvasPage: CanvasPage;
}

/**
 * Extends the base Playwright test with a `canvasPage` fixture that's
 * already navigated to a genuinely clean scene.
 *
 * Why this exists: Playwright already gives every test a fresh browser
 * context, but Excalidraw persists to localStorage, which is scoped to the
 * origin (http://localhost:3001), not the context. So the very first
 * `page.goto("/")` in a fresh context can still load a scene saved by a
 * previous run against that same origin. This fixture navigates once,
 * explicitly clears localStorage, then reloads — guaranteeing every test
 * starts from an empty canvas regardless of what ran before it.
 */
export const test = base.extend<Fixtures>({
  canvasPage: async ({ page }, use) => {
    const canvasPage = new CanvasPage(page);

    // Navigate first so there's an origin to clear storage against
    // (localStorage isn't accessible before a page has loaded that origin),
    // then clear and reload for a genuinely empty scene.
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await canvasPage.goto();

    // Hand the ready-to-use page object to the test.
    await use(canvasPage);
  },
});

export { expect } from "@playwright/test";
