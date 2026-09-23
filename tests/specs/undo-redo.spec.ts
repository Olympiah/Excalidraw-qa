import { test, expect } from "../fixtures/base";

// @smoke: highest risk-scored flow in the test strategy (§3.3, item 1).
// Tagged for both @smoke (fast, every PR) and @regression (full nightly run)
// since it's cheap to run and covers a core editing guarantee.
test.describe("Undo / redo @smoke @regression", () => {
  test("undo removes a drawn rectangle, redo restores it", async ({
    canvasPage,
  }) => {
    // Arbitrary on-canvas drag coordinates — no meaning beyond "far enough
    // apart to produce a non-zero-size rectangle".
    const from = { x: 300, y: 300 };
    const to = { x: 500, y: 450 };

    // Step 1: draw a shape and confirm it actually landed in the scene.
    await canvasPage.drawRectangle(from, to);
    await canvasPage.expectVisibleElementCount(1);

    // Capture the drawn element's geometry now, so we have a known-good
    // baseline to compare the redo result against later.
    const { elements: beforeUndo } = await canvasPage.getScene();
    const drawn = beforeUndo[0];
    expect(drawn.type).toBe("rectangle");

    // Step 2: undo should remove the shape from the visible scene. Note
    // this does NOT mean the element disappears from localStorage entirely
    // — Excalidraw flags it isDeleted rather than deleting the array entry,
    // which is why expectVisibleElementCount filters on isDeleted internally.
    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(0);

    // Step 3: redo should bring the exact same shape back, not a new one.
    await canvasPage.redo();
    await canvasPage.expectVisibleElementCount(1);

    const { elements: afterRedo } = await canvasPage.getScene();
    const restored = afterRedo[0];

    // toBeCloseTo (not toBe) because Excalidraw can round/adjust drag
    // coordinates by sub-pixel amounts; asserting "close enough" avoids
    // flaking on harmless floating-point noise while still catching real
    // position/size regressions.
    expect(restored.type).toBe("rectangle");
    expect(restored.x).toBeCloseTo(drawn.x, 0);
    expect(restored.y).toBeCloseTo(drawn.y, 0);
    expect(restored.width).toBeCloseTo(drawn.width, 0);
    expect(restored.height).toBeCloseTo(drawn.height, 0);
  });
});
