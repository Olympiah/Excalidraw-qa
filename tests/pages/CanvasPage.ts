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
  // In Excalidraw's in-memory state, deleting an element flips isDeleted
  // rather than removing it from the array — BUT that's not what ends up
  // in localStorage. excalidraw-app/data/LocalData.ts calls
  // getNonDeletedElements() before every save, so deleted elements are
  // stripped entirely from what's persisted. In other words: reading the
  // scene back from localStorage, a deleted element isn't "present with
  // isDeleted: true" — it's just absent. isDeleted will always read false
  // here; it's kept on the type for clarity/future-proofing, not because
  // this suite currently observes it ever being true.
  isDeleted: boolean;
  groupIds: string[];
  [key: string]: unknown;
}

export interface Scene {
  // allElements and elements are currently identical: localStorage never
  // contains deleted elements (see the isDeleted note above), so there's
  // no "soft-deleted but still present" case to filter out here. Both
  // fields are kept so call sites can express intent (allElements for "the
  // full persisted set", elements for "what's visibly on canvas") even
  // though today they return the same data.
  allElements: ExcalidrawElement[];
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

  // Keyboard shortcuts per tool, shown right on the toolbar buttons
  // themselves (see packages/excalidraw/components/Tools.tsx). Switching
  // tools by shortcut rather than clicking the toolbar is deliberate here:
  // the selection tool's button is a ToolPopover (a split-button with a
  // flyout of selection variants, e.g. lasso), whose onSelect handler
  // unconditionally toggles that flyout open on every click — including
  // when selection is already the active tool. That leftover open popover
  // can intercept the next canvas interaction. A keyboard shortcut has no
  // such side effect, and is exactly what a real user would press anyway.
  private static readonly TOOL_SHORTCUTS: Record<string, string> = {
    selection: "v",
    rectangle: "r",
    diamond: "d",
    ellipse: "o",
    arrow: "a",
    line: "l",
    text: "t",
  };

  async selectTool(tool: string) {
    const shortcut = CanvasPage.TOOL_SHORTCUTS[tool];
    if (!shortcut) {
      throw new Error(`No keyboard shortcut mapped for tool "${tool}"`);
    }
    await this.page.keyboard.press(shortcut);
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

  /**
   * Selects an element by dragging a marquee (rubber-band) box around its
   * full bounding box, rather than clicking its center.
   *
   * Why not click the center: Excalidraw shapes default to a transparent
   * background, so a click in the middle of an unfilled rectangle hits
   * nothing — only the stroke outline is clickable. A marquee-select that
   * encloses the whole element selects it regardless of fill, which is
   * both more reliable and closer to how a real user would rubber-band
   * select a shape.
   */
  async selectElement(element: ExcalidrawElement) {
    await this.selectTool("selection");
    const margin = 10;
    await this.dragOnCanvas(
      { x: element.x - margin, y: element.y - margin },
      {
        x: element.x + element.width + margin,
        y: element.y + element.height + margin,
      },
    );
  }

  /**
   * Drags a selected element by (dx, dy). Assumes the element is already
   * selected and the selection tool is active — dragging from its center
   * moves it, whereas dragging from a corner (see resizeSelectedElement)
   * resizes it instead.
   */
  async moveSelectedElement(element: ExcalidrawElement, dx: number, dy: number) {
    const center = {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    };
    await this.dragOnCanvas(center, { x: center.x + dx, y: center.y + dy });
  }

  /**
   * Drags the selected element's bottom-right resize handle by (dx, dy).
   * Excalidraw renders a small resize handle exactly at each corner of a
   * selected element's bounding box, so dragging from that corner point
   * (rather than the shape's center) grabs the handle instead of moving
   * the whole shape.
   */
  async resizeSelectedElement(element: ExcalidrawElement, dx: number, dy: number) {
    const bottomRight = { x: element.x + element.width, y: element.y + element.height };
    await this.dragOnCanvas(bottomRight, {
      x: bottomRight.x + dx,
      y: bottomRight.y + dy,
    });
  }

  /** Deletes whatever is currently selected. */
  async deleteSelected() {
    await this.page.keyboard.press("Delete");
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

  /**
   * Looks up an element by id rather than array position. Excalidraw
   * doesn't guarantee array order stays stable across operations (and
   * deleted-but-retained elements make position even less meaningful once
   * more than one shape is in play), so tests should track "the shape I
   * drew" by its id, not by assuming it's always elements[0].
   */
  async getElementById(id: string): Promise<ExcalidrawElement | undefined> {
    const { allElements } = await this.getScene();
    return allElements.find((el) => el.id === id);
  }

  /**
   * Polls until the element identified by `id` has geometry different from
   * `previous` on at least one of x/y/width/height, then returns the
   * settled element. Used after move/resize actions: like the scene write
   * itself, these are debounced, so reading immediately after the action
   * can still see the pre-action geometry.
   */
  async waitForElementChange(
    id: string,
    previous: ExcalidrawElement,
  ): Promise<ExcalidrawElement> {
    await expect
      .poll(async () => {
        const el = await this.getElementById(id);
        if (!el) return false;
        return (
          el.x !== previous.x ||
          el.y !== previous.y ||
          el.width !== previous.width ||
          el.height !== previous.height
        );
      })
      .toBe(true);
    return (await this.getElementById(id))!;
  }

  /**
   * Polls until the element identified by `id` matches `expected` on
   * x/y/width/height (within 1px), then returns it. Undo/redo write to
   * localStorage on the same debounced path as everything else, so a read
   * immediately after pressing undo/redo can still return pre-undo state.
   */
  async waitForElementMatch(
    id: string,
    expected: ExcalidrawElement,
  ): Promise<ExcalidrawElement> {
    const closeEnough = (a: number, b: number) => Math.abs(a - b) < 1;
    await expect
      .poll(async () => {
        const el = await this.getElementById(id);
        if (!el) return false;
        return (
          closeEnough(el.x, expected.x) &&
          closeEnough(el.y, expected.y) &&
          closeEnough(el.width, expected.width) &&
          closeEnough(el.height, expected.height)
        );
      })
      .toBe(true);
    return (await this.getElementById(id))!;
  }

  async getAppState(): Promise<Record<string, unknown> | null> {
    const raw = await this.page.evaluate(
      ({ stateKey }) => localStorage.getItem(stateKey),
      { stateKey: STORAGE_KEY_APP_STATE },
    );
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Waits until the scene settles to `expectedCount` visible elements, with
   * stable (unchanging) geometry — not just a matching count.
   *
   * Why count alone isn't enough: confirmed in App.tsx, Excalidraw inserts
   * a new element into the scene at pointerDOWN, before the drag even
   * starts moving — its size then grows with every pointermove until
   * pointerup. So during a drag, elements.length can already read 1 while
   * the shape is still tiny and mid-draw. Combined with the 300ms
   * localStorage debounce (SAVE_TO_LOCAL_STORAGE_TIMEOUT), a poll that only
   * checks length can catch and accept an in-progress, not-yet-final
   * snapshot — which is exactly what produced a flaky "width 30 instead of
   * 150" failure in practice. Requiring the same serialized elements array
   * on two consecutive polls confirms the scene has actually stopped
   * changing, not just that something showed up.
   */
  async expectVisibleElementCount(expectedCount: number) {
    let previousSnapshot: string | null = null;
    await expect
      .poll(async () => {
        const { elements } = await this.getScene();
        const snapshot = JSON.stringify(elements);
        const isStable = snapshot === previousSnapshot;
        previousSnapshot = snapshot;
        return isStable ? elements.length : NaN; // NaN never equals expectedCount, so an unstable read keeps polling
      })
      .toBe(expectedCount);
  }
}
