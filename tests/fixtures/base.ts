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

    // Excalidraw's save/load (via the browser-fs-access library) prefers
    // the native File System Access API (showSaveFilePicker /
    // showOpenFilePicker) when the browser supports it, which Chromium
    // does. That API opens a real OS-level dialog Playwright can't drive,
    // and produces neither a "download" event nor a "filechooser" event -
    // both export-import.spec.ts's save and load flows would hang
    // indefinitely without this. Deleting these before the app's own
    // scripts run forces browser-fs-access onto its fallback paths (a
    // downloadable <a> tag for save, a real <input type="file"> click for
    // load), which Playwright can observe/drive normally.
    await page.addInitScript(() => {
      // @ts-expect-error - not in this lib's DOM typings
      delete window.showSaveFilePicker;
      // @ts-expect-error - not in this lib's DOM typings
      delete window.showOpenFilePicker;
    });

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
