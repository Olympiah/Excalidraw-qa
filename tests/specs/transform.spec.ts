import { test, expect } from "../fixtures/base";
import type { ExcalidrawElement } from "../pages/CanvasPage";

// Coordinates stay right of x=500, same convention as undo-redo.spec.ts:
// once a shape is selected, Excalidraw's "Selected shape actions" panel
// occupies the left ~300px, and any drag landing on it (e.g. a rotate-handle
// drag, which swings wide) hits panel controls instead of the canvas.

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

// Covers plan item 4 (docs/02-test-strategy.md §3.3): move, resize, rotate,
// flip, each verified against the persisted scene JSON rather than pixels.
//
// Flip is the one transform that needs a rotated element to be observable at
// all: per excalidraw's actionFlip.ts + resizeElements.ts, flipping an
// axis-aligned (angle 0) rectangle about its own center leaves x/y/width/
// height/angle all unchanged - flip only shows up in the scene as
// `angle -> normalizeRadians(-angle)`. So the flip test rotates first, then
// flips, and asserts the mirrored angle.

test("move updates element position, not size @smoke", async ({
  canvasPage,
}) => {
  const draw = { x: 600, y: 200, width: 150, height: 100 };
  await canvasPage.drawRectangle(
    { x: draw.x, y: draw.y },
    { x: draw.x + draw.width, y: draw.y + draw.height },
  );
  const original = await canvasPage.waitForDrawnElement("rectangle", draw);

  await canvasPage.selectElement(original);
  await canvasPage.moveSelectedElement(original, 80, 40);

  const moved = await canvasPage.waitForElementChange(original.id, original);
  expectElementMatches(moved, {
    ...original,
    x: original.x + 80,
    y: original.y + 40,
  });
});

test("resize updates element size, not position @smoke", async ({
  canvasPage,
}) => {
  const draw = { x: 600, y: 200, width: 150, height: 100 };
  await canvasPage.drawRectangle(
    { x: draw.x, y: draw.y },
    { x: draw.x + draw.width, y: draw.y + draw.height },
  );
  const original = await canvasPage.waitForDrawnElement("rectangle", draw);

  await canvasPage.selectElement(original);
  await canvasPage.resizeSelectedElement(original, 60, 30);

  const resized = await canvasPage.waitForElementChange(original.id, original);
  expectElementMatches(resized, {
    ...original,
    width: original.width + 60,
    height: original.height + 30,
  });
});

test("rotate sets element angle without changing its bounding box @regression", async ({
  canvasPage,
}) => {
  const draw = { x: 600, y: 200, width: 150, height: 100 };
  await canvasPage.drawRectangle(
    { x: draw.x, y: draw.y },
    { x: draw.x + draw.width, y: draw.y + draw.height },
  );
  const original = await canvasPage.waitForDrawnElement("rectangle", draw);

  await canvasPage.selectElement(original);
  const targetAngle = Math.PI / 2; // 90 degrees
  await canvasPage.rotateSelectedElement(original, targetAngle);

  await expect
    .poll(async () => (await canvasPage.getElementById(original.id))?.angle)
    .toBeCloseTo(targetAngle, 1);

  const rotated = (await canvasPage.getElementById(original.id))!;
  // Rotation is about the element's own center and shouldn't resize it.
  expectElementMatches(rotated, original, ["width", "height"]);
});

test("flip mirrors the angle set by a prior rotation @regression", async ({
  canvasPage,
}) => {
  const draw = { x: 600, y: 200, width: 150, height: 100 };
  await canvasPage.drawRectangle(
    { x: draw.x, y: draw.y },
    { x: draw.x + draw.width, y: draw.y + draw.height },
  );
  const original = await canvasPage.waitForDrawnElement("rectangle", draw);

  await canvasPage.selectElement(original);
  const rotatedAngle = Math.PI / 4; // 45 degrees
  await canvasPage.rotateSelectedElement(original, rotatedAngle);

  await expect
    .poll(async () => (await canvasPage.getElementById(original.id))?.angle)
    .toBeCloseTo(rotatedAngle, 1);
  const beforeFlip = (await canvasPage.getElementById(original.id))!;

  // Selection persists across rotate, so flip applies to the same element.
  await canvasPage.flipSelectedElement("horizontal");

  const expectedAngle = (2 * Math.PI - beforeFlip.angle) % (2 * Math.PI);
  await expect
    .poll(async () => (await canvasPage.getElementById(original.id))?.angle)
    .toBeCloseTo(expectedAngle, 1);

  const flipped = (await canvasPage.getElementById(original.id))!;
  // Flip about the element's own center: bounding box size is unchanged.
  expectElementMatches(flipped, beforeFlip, ["width", "height"]);
});
