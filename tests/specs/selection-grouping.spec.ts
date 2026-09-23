import { test, expect } from "../fixtures/base";
import type { CanvasPage, ExcalidrawElement } from "../pages/CanvasPage";

// Covers plan item 5 (docs/02-test-strategy.md §3.3): selection and grouping,
// verified against persisted state - selectedElementIds in "excalidraw-state"
// for selection, and each element's groupIds in "excalidraw" for grouping.
//
// Shared geometry, defined once so every test draws the same scene and the
// numbers can't drift between tests. All x values stay right of 500 for the
// same reason as the other specs: a selected shape opens the left properties
// panel, which would swallow drags that land on it.
//
// The three rectangles sit side by side with a 50px gap between them. That
// gap is what makes "select A and B but NOT C" possible: the marquee grows
// MARQUEE_MARGIN px outward from A and B, so the margin has to stay smaller
// than the gap to C or C gets swept in too.
const RECT_A = { x: 600, y: 200, width: 100, height: 80 };
const RECT_B = { x: 750, y: 200, width: 100, height: 80 };
const RECT_C = { x: 900, y: 200, width: 100, height: 80 };
const MARQUEE_MARGIN = 10; // must stay < the 50px gap between rectangles

/**
 * Draws A, B and C and returns them with their real ids.
 *
 * Each rectangle is waited for by its KNOWN geometry (waitForDrawnElement)
 * rather than by "the count settled", because Excalidraw inserts a shape at
 * mousedown and grows it during the drag - a settle check can accept a
 * half-drawn shape. We know exactly what we drew, so we wait for exactly that.
 */
async function drawThreeRectangles(canvasPage: CanvasPage) {
  const drawn: ExcalidrawElement[] = [];
  for (const r of [RECT_A, RECT_B, RECT_C]) {
    await canvasPage.drawRectangle(
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
    );
    drawn.push(await canvasPage.waitForDrawnElement("rectangle", r));
  }
  const [a, b, c] = drawn;
  // The last shape drawn is left selected. Clear that so every test starts
  // from a known "nothing selected" state.
  await canvasPage.deselectAll();
  await canvasPage.waitForSelectedIds([]);
  return { a, b, c };
}

test("marquee selects only the shapes it fully encloses @regression", async ({
  canvasPage,
}) => {
  const { a, b, c } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectElements([a, b], MARQUEE_MARGIN);

  // Exactly A and B - C sits 50px away, outside the box.
  await canvasPage.waitForSelectedIds([a.id, b.id]);
  expect(await canvasPage.getSelectedIds()).not.toContain(c.id);
});

test("shift-click adds to and removes from the selection @regression", async ({
  canvasPage,
}) => {
  const { a, b } = await drawThreeRectangles(canvasPage);

  await canvasPage.clickElement(a);
  await canvasPage.waitForSelectedIds([a.id]);

  await canvasPage.shiftClickElement(b);
  await canvasPage.waitForSelectedIds([a.id, b.id]);

  // Shift-clicking an already-selected shape toggles it back off.
  await canvasPage.shiftClickElement(a);
  await canvasPage.waitForSelectedIds([b.id]);
});

test("select all picks every shape and Escape clears it @regression", async ({
  canvasPage,
}) => {
  const { a, b, c } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectAll();
  await canvasPage.waitForSelectedIds([a.id, b.id, c.id]);

  await canvasPage.deselectAll();
  await canvasPage.waitForSelectedIds([]);
});

test("grouping gives the selected shapes one shared group id @regression", async ({
  canvasPage,
}) => {
  const { a, b, c } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectElements([a, b], MARQUEE_MARGIN);
  await canvasPage.waitForSelectedIds([a.id, b.id]);
  await canvasPage.groupSelected();

  const groupId = await canvasPage.waitForSharedGroup([a.id, b.id]);
  expect(groupId).toBeTruthy();
  // C was never selected, so it must not have been pulled into the group.
  expect((await canvasPage.getElementById(c.id))!.groupIds).toEqual([]);
});

test("clicking one member of a group selects the whole group @regression", async ({
  canvasPage,
}) => {
  const { a, b, c } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectElements([a, b], MARQUEE_MARGIN);
  await canvasPage.waitForSelectedIds([a.id, b.id]);
  await canvasPage.groupSelected();
  await canvasPage.waitForSharedGroup([a.id, b.id]);

  // Drop the selection, then click only A: the group should come with it.
  await canvasPage.deselectAll();
  await canvasPage.waitForSelectedIds([]);
  await canvasPage.clickElement(a);

  await canvasPage.waitForSelectedIds([a.id, b.id]);
  expect(await canvasPage.getSelectedIds()).not.toContain(c.id);
});

test("moving a group moves every member by the same amount @smoke @regression", async ({
  canvasPage,
}) => {
  const { a, b, c } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectElements([a, b], MARQUEE_MARGIN);
  await canvasPage.waitForSelectedIds([a.id, b.id]);
  await canvasPage.groupSelected();
  await canvasPage.waitForSharedGroup([a.id, b.id]);

  const dx = 60;
  const dy = 40;
  await canvasPage.dragElementByEdge(a, dx, dy);

  // Known target for each member, so wait for that value rather than for
  // the scene to stop changing.
  await canvasPage.waitForElementMatch(a.id, { ...a, x: a.x + dx, y: a.y + dy });
  await canvasPage.waitForElementMatch(b.id, { ...b, x: b.x + dx, y: b.y + dy });
  // The ungrouped shape must not have moved.
  await canvasPage.waitForElementMatch(c.id, c);
});

test("ungrouping removes the shared group id @regression", async ({
  canvasPage,
}) => {
  const { a, b } = await drawThreeRectangles(canvasPage);

  await canvasPage.selectElements([a, b], MARQUEE_MARGIN);
  await canvasPage.waitForSelectedIds([a.id, b.id]);
  await canvasPage.groupSelected();
  await canvasPage.waitForSharedGroup([a.id, b.id]);

  // The group is still selected after grouping, so ungroup applies to it.
  await canvasPage.ungroupSelected();

  await canvasPage.waitForUngrouped([a.id, b.id]);
});
