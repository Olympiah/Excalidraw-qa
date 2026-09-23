import { Page, expect } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}

// These key names come from excalidraw-app/app_constants.ts (STORAGE_KEYS).
// Excalidraw splits "the scene" across two localStorage keys, not one:
//   - "excalidraw"       -> the elements array (every shape ever drawn,
//                            including soft-deleted ones)
//   - "excalidraw-state" -> UI/app state (selection, active tool, zoom, etc.)
const STORAGE_KEY_ELEMENTS = "excalidraw";
const STORAGE_KEY_APP_STATE = "excalidraw-state";

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Excalidraw never removes an element from the array on delete/undo —
  // it flips isDeleted instead. So "how many shapes are on screen" is
  // NOT elements.length, it's elements.filter(el => !el.isDeleted).length.
  isDeleted: boolean;
  groupIds: string[];
  [key: string]: unknown;
}

export interface Scene {
  /** Raw elements array from localStorage, including soft-deleted entries. */
  allElements: ExcalidrawElement[];
  /** Elements with isDeleted === false — what's actually visible on canvas. */
  elements: ExcalidrawElement[];
}

/**
 * Page Object for the Excalidraw canvas + toolbar.
 *
 * Why a Page Object here at all: shapes are drawn on a single <canvas>
 * element, so there's no DOM node per rectangle/ellipse/etc. for Playwright
 * to locate. That rules out the usual `page.locator()` approach for
 * anything drawn on the canvas itself. Instead:
 *   - Interactions (drawing, dragging) go through raw mouse coordinates.
 *   - Assertions read the app's own persisted state (localStorage) rather
 *     than trying to inspect canvas pixels or a DOM tree that doesn't exist.
 * Toolbar buttons ARE real DOM elements (they have data-testid attributes),
 * so those use normal locators.
 */
export class CanvasPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
    // Wait for the canvas to be attached before any interaction, otherwise
    // early mouse events can land before Excalidraw finishes mounting.
    await this.page.locator("canvas.excalidraw__canvas").first().waitFor();
  }

  private toolbarButton(tool: string) {
    // Desktop toolbar buttons all follow the pattern data-testid="toolbar-<tool>"
    // (see packages/excalidraw/components/Tools.tsx).
    return this.page.locator(`[data-testid="toolbar-${tool}"]`);
  }

  async selectTool(tool: string) {
    await this.toolbarButton(tool).click();
  }

  /** Selects the rectangle tool, then drags from one point to another to draw it. */
  async drawRectangle(from: Point, to: Point) {
    await this.selectTool("rectangle");
    await this.dragOnCanvas(from, to);
  }

  /**
   * Low-level drag primitive: a real mouse down -> move -> up sequence, the
   * same input a human would send. This is deliberate per the test strategy
   * ("interactions use real mouse/keyboard input... because the point is to
   * test the editor as a user does") rather than calling internal app APIs.
   */
  async dragOnCanvas(from: Point, to: Point) {
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    // steps: 10 sends intermediate mousemove events along the path, which
    // matters because Excalidraw computes shape size/position from the drag
    // trajectory, not just the start/end points.
    await this.page.mouse.move(to.x, to.y, { steps: 10 });
    await this.page.mouse.up();
  }

  async undo() {
    // Ctrl+Z on Windows/Linux, Cmd+Z on macOS.
    await this.page.keyboard.press(
      process.platform === "darwin" ? "Meta+Z" : "Control+Z",
    );
  }

  async redo() {
    await this.page.keyboard.press(
      process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z",
    );
  }

  /**
   * Reads the persisted scene straight from localStorage — this is the
   * "scene data" tier of the assertion strategy (preferred over UI state or
   * visual snapshots because it's fast, deterministic, and reflects exactly
   * what the app considers to be true, not just what's rendered).
   */
  async getScene(): Promise<Scene> {
    const raw = await this.page.evaluate(
      ({ elementsKey }) => localStorage.getItem(elementsKey),
      { elementsKey: STORAGE_KEY_ELEMENTS },
    );
    const allElements: ExcalidrawElement[] = raw ? JSON.parse(raw) : [];
    return {
      allElements,
      elements: allElements.filter((el) => !el.isDeleted),
    };
  }

  async getAppState(): Promise<Record<string, unknown> | null> {
    const raw = await this.page.evaluate(
      ({ stateKey }) => localStorage.getItem(stateKey),
      { stateKey: STORAGE_KEY_APP_STATE },
    );
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Waits until the scene settles to `expectedCount` visible elements.
   *
   * Why poll instead of reading once: Excalidraw debounces its write to
   * localStorage (SAVE_TO_LOCAL_STORAGE_TIMEOUT in app_constants.ts) — it
   * doesn't persist on every single mouse event. Reading immediately after
   * an action can catch a stale value, so this retries until the value
   * matches or the default Playwright assertion timeout is hit.
   */
  async expectVisibleElementCount(expectedCount: number) {
    await expect
      .poll(async () => {
        const { elements } = await this.getScene();
        return elements.length;
      })
      .toBe(expectedCount);
  }
}
