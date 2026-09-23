import { test, expect } from "../fixtures/base";
import type { ExcalidrawElement } from "../pages/CanvasPage";

// Coordinates for every test in this file stay right of x=500. Reason:
// once a shape is selected, Excalidraw opens a ~300px-wide "Selected shape
// actions" panel on the left, and any mouse interaction that lands on it
// hits panel controls instead of the canvas — found by an early test
// silently failing to draw a second rectangle whose start point overlapped
// the panel.

/** Asserts that `actual` matches `expected` on every listed geometry key. */
function expectElementMatches(
  actual: ExcalidrawElement,
  expected: ExcalidrawElement,
  keys: Array<keyof ExcalidrawElement> = ["x", "y", "width", "height"],
) {
  for (const key of keys) {
    expect(actual[key], `expected ${String(key)} to match`).toBeCloseTo(
      expected[key] as number,
      0,
    );
  }
}

// Undo/redo is the highest risk-scored flow in the test strategy (§3.3,
// item 1). Tags live on individual tests, not this describe block — putting
// them on the block would stamp EVERY test below with the same tag
// (Playwright matches against the full title, describe + test name
// combined), which would make "@smoke" mean "the whole file" instead of "the
// core functionality checks that run on every PR." Only the core happy-path
// test below is @smoke; the history walk and edge cases are @regression.
test.describe("Undo / redo", () => {
  test("undo removes a drawn rectangle, redo restores it @smoke", async ({
    canvasPage,
  }) => {
    const from = { x: 550, y: 300 };
    const to = { x: 700, y: 400 };
    // Known target geometry from the draw coordinates - waited for directly
    // via waitForDrawnElement rather than expectVisibleElementCount +
    // elements[0]. That combination can catch a mid-drag, not-yet-final
    // size (dragOnCanvas sends 10 intermediate pointermove events, and
    // Excalidraw inserts the element at pointerdown before the drag
    // finishes) - a real flake found in autosave.spec.ts's equivalent
    // pattern. Waiting for the known final size instead can't be fooled by
    // a momentarily-stable in-between value the way a "stopped changing"
    // check still technically can.
    const geometry = {
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
    };

    await canvasPage.drawRectangle(from, to);
    const drawn = await canvasPage.waitForDrawnElement("rectangle", geometry);
    expect(drawn.type).toBe("rectangle");

    // Undo removes the shape from the visible scene. Note this doesn't mean
    // the element sits around flagged isDeleted somewhere retrievable —
    // Excalidraw's save path strips deleted elements from what's persisted
    // entirely (see the isDeleted note on ExcalidrawElement in
    // CanvasPage.ts), so "undone" and "redone" are really "absent" and
    // "present," not a flag flipping on the same retained record.
    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.redo();
    await canvasPage.expectVisibleElementCount(1);

    // Look the element back up by id, not array position — proves redo
    // brought back the SAME element, not a new one that happens to look
    // similar.
    const restored = await canvasPage.getElementById(drawn.id);
    expect(restored).toBeDefined();
    expect(restored!.type).toBe("rectangle");
    expectElementMatches(restored!, drawn);
  });

  test("undo reverts a move, redo reapplies it @regression", async ({ canvasPage }) => {
    // Known target geometry, waited for directly - see the core smoke
    // test's comment above for why this replaces expectVisibleElementCount
    // + elements[0]. This geometry becomes the move's starting point below,
    // so it has to be the real final draw, not a mid-drag snapshot.
    const geometry = { x: 550, y: 300, width: 150, height: 100 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 700, y: 400 });
    const drawn = await canvasPage.waitForDrawnElement("rectangle", geometry);

    await canvasPage.selectElement(drawn);
    await canvasPage.moveSelectedElement(drawn, 100, 50);
    // waitForElementChange (not a plain read) because the move, like
    // everything else here, lands via a debounced localStorage write —
    // this also doubles as proof the move actually changed something,
    // rather than moveSelectedElement silently doing nothing.
    const moved = await canvasPage.waitForElementChange(drawn.id, drawn);

    await canvasPage.undo();
    // Full position AND size check: a move-undo that restores x but not y
    // (or shifts size) would slip past a single-property assertion.
    const afterUndo = await canvasPage.waitForElementMatch(drawn.id, drawn);
    expectElementMatches(afterUndo, drawn);

    await canvasPage.redo();
    const afterRedo = await canvasPage.waitForElementMatch(drawn.id, moved);
    expectElementMatches(afterRedo, moved);
  });

  test("undo reverts a resize, redo reapplies it @regression", async ({ canvasPage }) => {
    // Known target geometry, waited for directly (see the core smoke test's
    // comment for why) - this becomes the resize's starting point below.
    const geometry = { x: 550, y: 300, width: 150, height: 100 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 700, y: 400 });
    const drawn = await canvasPage.waitForDrawnElement("rectangle", geometry);

    await canvasPage.selectElement(drawn);
    await canvasPage.resizeSelectedElement(drawn, 80, 60);
    const resized = await canvasPage.waitForElementChange(drawn.id, drawn);
    expect(resized.width).toBeGreaterThan(drawn.width);
    expect(resized.height).toBeGreaterThan(drawn.height);

    await canvasPage.undo();
    // Checks x/y too, not just width/height — a resize-undo that restores
    // size but leaves the shape displaced (dragging a corner handle can
    // shift x/y as well as width/height) would otherwise go unnoticed.
    const afterUndo = await canvasPage.waitForElementMatch(drawn.id, drawn);
    expectElementMatches(afterUndo, drawn);

    await canvasPage.redo();
    const afterRedo = await canvasPage.waitForElementMatch(drawn.id, resized);
    expectElementMatches(afterRedo, resized);
  });

  test("undo reverts a delete, redo reapplies it @regression", async ({ canvasPage }) => {
    // Known target geometry, waited for directly (see the core smoke test's
    // comment for why) - drives selectElement's marquee-select below, so a
    // mid-drag capture here would make the delete select/delete nothing.
    const geometry = { x: 550, y: 300, width: 150, height: 100 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 700, y: 400 });
    const drawn = await canvasPage.waitForDrawnElement("rectangle", geometry);

    await canvasPage.selectElement(drawn);
    await canvasPage.deleteSelected();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(1);
    const afterUndo = await canvasPage.waitForElementMatch(drawn.id, drawn);
    expect(afterUndo.isDeleted).toBe(false);
    expectElementMatches(afterUndo, drawn);

    await canvasPage.redo();
    await canvasPage.expectVisibleElementCount(0);
    // A re-deleted element isn't "present with isDeleted: true" in what
    // localStorage holds — Excalidraw's save path filters deleted elements
    // out entirely before persisting (see the isDeleted note on
    // ExcalidrawElement in CanvasPage.ts). So the correct assertion here is
    // that the element is gone, not that a flag is set on it.
    const afterRedo = await canvasPage.getElementById(drawn.id);
    expect(afterRedo).toBeUndefined();
  });

  test("a full draw/move/resize/delete history walks back and forward correctly @regression", async ({
    canvasPage,
  }) => {
    // This is the integration case the per-operation tests above can't
    // cover individually: it proves the undo/redo STACK correctly handles
    // a mix of different operation types in sequence, not just that each
    // operation type undoes/redoes in isolation.
    // Known target geometry, waited for directly (see the core smoke test's
    // comment for why) - this feeds the whole move/resize/delete chain
    // below, so it has to be the real final draw, not a mid-drag snapshot.
    const geometry = { x: 550, y: 300, width: 150, height: 100 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 700, y: 400 });
    const drawn = await canvasPage.waitForDrawnElement("rectangle", geometry);

    await canvasPage.selectElement(drawn);
    await canvasPage.moveSelectedElement(drawn, 100, 50);
    const moved = await canvasPage.waitForElementChange(drawn.id, drawn);

    await canvasPage.selectElement(moved);
    await canvasPage.resizeSelectedElement(moved, 80, 60);
    const resized = await canvasPage.waitForElementChange(drawn.id, moved);

    await canvasPage.selectElement(resized);
    await canvasPage.deleteSelected();
    await canvasPage.expectVisibleElementCount(0);

    // Walk backwards: undo delete -> resize -> move -> draw. History order
    // is last-action-first, so the first undo should land at the
    // post-resize geometry, not the original drawn geometry. Each read uses
    // waitForElementMatch rather than a plain getElementById, since undo
    // writes to localStorage on the same debounced path as every other
    // change.
    await canvasPage.undo(); // undoes delete
    await canvasPage.waitForElementMatch(drawn.id, resized);

    await canvasPage.undo(); // undoes resize
    await canvasPage.waitForElementMatch(drawn.id, moved);

    await canvasPage.undo(); // undoes move
    await canvasPage.waitForElementMatch(drawn.id, drawn);

    await canvasPage.undo(); // undoes draw
    await canvasPage.expectVisibleElementCount(0);

    // Walk forwards again, asserting geometry at every step — not just the
    // final element count, which stays the same (0, since we land back on
    // "deleted") regardless of whether the intermediate re-move/re-resize
    // steps actually replayed correctly.
    await canvasPage.redo(); // redraws
    await canvasPage.waitForElementMatch(drawn.id, drawn);

    await canvasPage.redo(); // re-moves
    await canvasPage.waitForElementMatch(drawn.id, moved);

    await canvasPage.redo(); // re-resizes
    await canvasPage.waitForElementMatch(drawn.id, resized);

    await canvasPage.redo(); // re-deletes
    await canvasPage.expectVisibleElementCount(0);
  });

  test("a new action after undo clears the redo stack @regression", async ({
    canvasPage,
  }) => {
    // Classic history-management bug class: draw A, undo it, draw B —
    // the old "redo A" branch should be gone. If it isn't, redo either
    // resurrects A (wrong element entirely) or corrupts the history.
    // Known target geometry for both shapes, waited for directly (see the
    // core smoke test's comment for why) rather than expectVisibleElementCount
    // + elements[0].
    const geometryA = { x: 550, y: 300, width: 100, height: 100 };
    const geometryB = { x: 750, y: 300, width: 100, height: 100 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 400 });
    const shapeA = await canvasPage.waitForDrawnElement(
      "rectangle",
      geometryA,
    );

    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.drawRectangle({ x: 750, y: 300 }, { x: 850, y: 400 });
    const shapeB = await canvasPage.waitForDrawnElement(
      "rectangle",
      geometryB,
    );
    expect(shapeB.id).not.toBe(shapeA.id);

    // Redo should be a no-op now — there's nothing ahead of B in history.
    await canvasPage.redo();
    await canvasPage.expectVisibleElementCount(1);
    const afterRedo = (await canvasPage.getScene()).elements[0];
    expect(afterRedo.id).toBe(shapeB.id);

    // And shape A must not be reachable via redo at all — it should stay
    // permanently gone, not just temporarily out of view. Since deleted
    // elements are stripped entirely from what's persisted (see the
    // isDeleted note on ExcalidrawElement in CanvasPage.ts), "gone" here
    // means getElementById finds nothing — it will never come back with
    // isDeleted: true. The `?? true` fallback covers exactly that expected
    // undefined case; if shape A is somehow still present, this correctly
    // fails on whatever isDeleted value it actually has.
    const shapeAInScene = await canvasPage.getElementById(shapeA.id);
    expect(shapeAInScene?.isDeleted ?? true).toBe(true);
  });

  test("undo on an empty history is a no-op, not an error @regression", async ({
    canvasPage,
  }) => {
    // Negative case: nothing has been drawn yet. A naive undo implementation
    // could throw, or corrupt state by "undoing" something that doesn't
    // exist. Excalidraw should simply do nothing.
    await canvasPage.undo();
    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(0);

    // The app should still be fully functional afterwards — prove it by
    // drawing normally right after the no-op undos.
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 400 });
    await canvasPage.expectVisibleElementCount(1);
  });

  test("redo beyond the end of history is a no-op @regression", async ({
    canvasPage,
  }) => {
    // Negative case: draw one shape, undo it, then redo MORE times than
    // there are things to redo. The extra redo presses should be silently
    // ignored rather than erroring or somehow duplicating the element.
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 400 });
    await canvasPage.undo();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.redo();
    await canvasPage.redo(); // no more history to redo — should be a no-op
    await canvasPage.redo();
    await canvasPage.expectVisibleElementCount(1);
  });

  test("undoing past the start of history stays empty, doesn't go negative @regression", async ({
    canvasPage,
  }) => {
    // Negative case: draw two shapes, then undo far more times than there
    // are actions on the stack. This should bottom out at an empty scene
    // and stay there — not crash, not somehow remove elements that were
    // never added.
    await canvasPage.drawRectangle({ x: 550, y: 200 }, { x: 650, y: 300 });
    await canvasPage.drawRectangle({ x: 750, y: 200 }, { x: 850, y: 300 });
    await canvasPage.expectVisibleElementCount(2);

    for (let i = 0; i < 5; i++) {
      await canvasPage.undo();
    }
    await canvasPage.expectVisibleElementCount(0);
  });
});
