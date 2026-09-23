import { Download, Page, expect } from "@playwright/test";

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
  // Rotation in radians, normalized to [0, 2*PI). Typed explicitly so
  // transform tests can do arithmetic on it without a cast.
  angle: number;
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
  // Only present on text elements. Typed explicitly (rather than reading it
  // through the [key: string]: unknown index and casting at the call site)
  // so autosave tests can assert on restored text content without an
  // `as unknown as { text: string }` cast.
  text?: string;
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

  /**
   * Reloads the current page and waits for the canvas to remount.
   *
   * Deliberately not goto(): goto() navigates to "/" fresh, which is the
   * fixture's clean-slate path (used once per test, before localStorage has
   * anything in it). reload() is what autosave tests need instead — it
   * models a real user hitting refresh or recovering from a crash
   * mid-session on the SAME origin, exercising the actual load-from-storage
   * path rather than a fresh navigation.
   */
  async reload() {
    await this.page.reload();
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
   * Selects the text tool, clicks to place a text cursor at `at`, types
   * `content`, then presses Escape to commit it as an element.
   *
   * Unlike drawRectangle, this isn't a drag: Excalidraw's text tool creates
   * an editable text box at a single click point rather than a
   * click-and-drag bounding box, and the element isn't finalized (written
   * into the scene) until the editor loses focus/commits - Escape does
   * that without leaving stray focus on the canvas the way clicking
   * elsewhere might.
   */
  async addText(at: Point, content: string) {
    await this.selectTool("text");
    await this.page.mouse.click(at.x, at.y);
    await this.page.keyboard.type(content);
    await this.page.keyboard.press("Escape");
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

  /**
   * Rotates the selected element to `targetAngle` (radians, 0 = upright,
   * increasing clockwise) by dragging its rotation handle.
   *
   * Excalidraw computes the new angle from the drag's absolute pointer
   * position, not from a delta: per resizeElements.ts,
   * `angle = normalizeRadians(PI/2 + atan2(pointerY - cy, pointerX - cx))`,
   * where (cx, cy) is the element's own center. So rather than dragging by
   * some (dx, dy), this works backwards from that formula to find the
   * pointer position that produces `targetAngle`, and drags there directly.
   * The mousedown point only needs to land within the rotation handle's hit
   * area (rendered just above the element's top-center edge) - it's the
   * mouseup position that determines the resulting angle.
   */
  async rotateSelectedElement(element: ExcalidrawElement, targetAngle: number) {
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const handle = { x: cx, y: element.y - 20 };
    // Any radius works since only the angle from center matters; 100px keeps
    // the drag well clear of the element itself.
    const radius = 100;
    const theta = targetAngle - Math.PI / 2;
    const target = {
      x: cx + radius * Math.cos(theta),
      y: cy + radius * Math.sin(theta),
    };
    await this.dragOnCanvas(handle, target);
  }

  /** Flips the current selection horizontally or vertically about its own center. */
  async flipSelectedElement(direction: "horizontal" | "vertical") {
    const key = direction === "horizontal" ? "H" : "V";
    await this.page.keyboard.press(`Shift+${key}`);
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
   * `previous` on at least one of x/y/width/height AND has stopped changing
   * (two consecutive identical reads), then returns the settled element.
   * Used after move/resize actions: like the scene write itself, these are
   * debounced, so reading immediately after the action can still see the
   * pre-action geometry.
   *
   * The stability check (not just "first read that differs") matters for a
   * slow drag: an early poll could catch the element mid-drag, already
   * different from `previous` but not yet at its final position. Returning
   * that in-between read would hand a caller a target geometry that never
   * actually gets persisted, since the drag keeps moving after that read.
   */
  async waitForElementChange(
    id: string,
    previous: ExcalidrawElement,
  ): Promise<ExcalidrawElement> {
    let lastSnapshot: string | null = null;
    await expect
      .poll(async () => {
        const el = await this.getElementById(id);
        if (!el) return false;
        const changed =
          el.x !== previous.x ||
          el.y !== previous.y ||
          el.width !== previous.width ||
          el.height !== previous.height;
        if (!changed) return false;
        const snapshot = JSON.stringify(el);
        const stable = snapshot === lastSnapshot;
        lastSnapshot = snapshot;
        return stable;
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

  /**
   * Polls until an element of `type` matching `expected` geometry (within
   * 1px) shows up in the scene, then returns it. For use right after
   * drawing, when the target geometry is already known from the draw
   * coordinates but the element's id isn't yet - waiting for a known target
   * value is more reliable than expectVisibleElementCount's "stopped
   * changing" check, which can in principle settle on the wrong stable
   * plateau if a drag produces more than one (see its doc comment).
   */
  async waitForDrawnElement(
    type: string,
    expected: { x: number; y: number; width: number; height: number },
  ): Promise<ExcalidrawElement> {
    const closeEnough = (a: number, b: number) => Math.abs(a - b) < 1;
    const matches = (el: ExcalidrawElement) =>
      el.type === type &&
      closeEnough(el.x, expected.x) &&
      closeEnough(el.y, expected.y) &&
      closeEnough(el.width, expected.width) &&
      closeEnough(el.height, expected.height);
    await expect
      .poll(async () => {
        const { elements } = await this.getScene();
        return elements.some(matches);
      })
      .toBe(true);
    const { elements } = await this.getScene();
    return elements.find(matches)!;
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
   *
   * This two-reads check is good enough for undo-redo.spec.ts, the only
   * other consumer of this method - it doesn't chain a draw straight into
   * reading exact geometry off elements[0] the way the autosave test that
   * flaked did. If a similar flake shows up here for undo/redo, reach for
   * expectVisibleElementCountSettled (stricter, slower) or
   * waitForDrawnElement (when the target geometry is already known) rather
   * than tightening this method - it's shared, and unrelated tests
   * shouldn't get slower or behave differently to fix a problem specific to
   * one spec file.
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

  /**
   * Stricter, slower sibling of expectVisibleElementCount: requires three
   * consecutive matching reads instead of two, spaced past the ~300ms save
   * debounce (100ms/250ms/350ms intervals), so two reads can't both land
   * inside the same in-flight write during a multi-step drag.
   *
   * Added for autosave.spec.ts after a real flake there: dragOnCanvas sends
   * 10 intermediate pointermove events, and localStorage's debounced save
   * fired more than once during a drag, letting an in-between size (e.g.
   * width 15 instead of the final 150) sit unchanged across two fast poll
   * ticks before the real write landed - exactly what
   * expectVisibleElementCount's two-reads check is supposed to catch, but
   * didn't in that case.
   *
   * Deliberately a separate method rather than a change to
   * expectVisibleElementCount itself: undo-redo.spec.ts uses that method
   * too and has shown no sign of this flake, so there's no reason to make
   * every one of its calls ~0.7s slower to guard against a failure mode it
   * hasn't hit. Where a test already knows its exact target geometry (e.g.
   * "should end up 150px wide"), prefer waitForDrawnElement or
   * waitForElementMatch instead of either of these two - waiting for a
   * known value is more reliable than waiting for change to stop.
   */
  async expectVisibleElementCountSettled(expectedCount: number) {
    let previousSnapshot: string | null = null;
    let stableStreak = 0;
    await expect
      .poll(
        async () => {
          const { elements } = await this.getScene();
          const snapshot = JSON.stringify(elements);
          stableStreak = snapshot === previousSnapshot ? stableStreak + 1 : 0;
          previousSnapshot = snapshot;
          return stableStreak >= 2 ? elements.length : NaN;
        },
        { intervals: [100, 250, 350], timeout: 8000 },
      )
      .toBe(expectedCount);
  }

  /** Selects everything on the canvas and deletes it, leaving an empty scene. */
  async clearCanvas() {
    await this.selectTool("selection");
    await this.page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await this.deleteSelected();
  }

  /**
   * Opens the top-left hamburger menu (Save/Load/Export live there).
   * Deliberately NOT getByTestId("dropdown-menu-button") - that testid is
   * shared by every DropdownMenuTrigger in the app (e.g. the toolbar's
   * "More tools" flyout), so it isn't unique to this menu. This menu's
   * trigger has its own testid, "main-menu-trigger" (see MainMenu.tsx),
   * which is what actually identifies it.
   */
  private async openMainMenu() {
    await this.page.getByTestId("main-menu-trigger").click();
  }

  /**
   * Saves the current scene to a new .excalidraw file and returns the
   * Playwright Download.
   *
   * Deliberately NOT the main menu's "save-button" (SaveToActiveFile,
   * labeled "Save to current file"): its predicate requires
   * appState.fileHandle to already be set (see actionExport.tsx), so on a
   * scene that's never been saved/opened before, that item doesn't render
   * at all - clicking a locator for it just hangs waiting for an element
   * that will never appear. The item that's actually present for a
   * first-time save is "Save to..." (json-export-button, buttons.export),
   * which opens a dialog whose "Save to file" button (exportDialog.disk_button)
   * triggers the real download - this method drives that flow instead.
   */
  async saveSceneToFile(): Promise<Download> {
    await this.openMainMenu();
    await this.page.getByTestId("json-export-button").click();
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByRole("button", { name: "Save to file" }).click(),
    ]);
    return download;
  }

  /**
   * Loads a scene from a local file via the main menu's Open item. Assumes
   * the canvas is currently empty — Excalidraw shows an "overwrite scene?"
   * confirm modal instead of the file picker when there's existing content,
   * which this method doesn't handle.
   */
  async loadSceneFromFile(filePath: string) {
    await this.openMainMenu();
    const [chooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      this.page.getByTestId("load-button").click(),
    ]);
    await chooser.setFiles(filePath);
  }

  /**
   * Opens the image export dialog from the main menu and exports as PNG,
   * returning the Playwright Download. There's no data-testid on the
   * dialog's PNG button (see ImageExportDialog.tsx), so it's targeted by
   * its visible label instead.
   */
  async exportImageAsPng(): Promise<Download> {
    await this.openMainMenu();
    await this.page.getByTestId("image-export-button").click();
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByRole("button", { name: "Export to PNG" }).click(),
    ]);
    return download;
  }
}
