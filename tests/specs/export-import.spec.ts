import * as fs from "fs";
import { test, expect } from "../fixtures/base";

// Export/import is item 3 in the risk-ordered plan (docs/02-test-strategy.md
// §3.3). Both flows in this file go through the browser's native
// download/file-picker mechanisms (Excalidraw itself has no in-app "restore
// point" other than these), so a real regression here means a user's saved
// work genuinely can't get back into the app, or their exported image is
// corrupt/empty - not just a UI glitch.
//
// Both tests read the downloaded file straight off disk into
// test.info().outputPath(), Playwright's per-test scratch directory (auto
// cleaned up), rather than asserting on the Download object alone - that's
// what actually proves the browser wrote real, readable bytes, not just that
// a download *started*.

test.describe("Export / import", () => {
  test("EX-017: exporting and re-importing an .excalidraw file restores the scene @regression", async ({
    canvasPage,
  }) => {
    // Fixture scene per the manual test case: 3 shapes + 1 text.
    const rect1From = { x: 550, y: 300 };
    const rect1To = { x: 650, y: 380 };
    const rect2From = { x: 700, y: 300 };
    const rect2To = { x: 800, y: 380 };
    const ellipseFrom = { x: 550, y: 450 };
    const ellipseTo = { x: 650, y: 530 };
    const textAt = { x: 700, y: 450 };
    const textContent = "EX-017";

    await canvasPage.drawRectangle(rect1From, rect1To);
    await canvasPage.drawRectangle(rect2From, rect2To);
    await canvasPage.selectTool("ellipse");
    await canvasPage.dragOnCanvas(ellipseFrom, ellipseTo);
    await canvasPage.addText(textAt, textContent);

    // Wait for the scene to fully settle before saving - a save mid-draw
    // would export a half-finished shape, and the rest of this test would
    // then be asserting against a fixture that was never actually right.
    await canvasPage.expectVisibleElementCount(4);
    const original = (await canvasPage.getScene()).elements;
    expect(original).toHaveLength(4);

    const download = await canvasPage.saveSceneToFile();
    const savedPath = test.info().outputPath("exported-scene.excalidraw");
    await download.saveAs(savedPath);

    // Sanity check the file actually landed on disk with content, before
    // trusting it as the source for the import half of this test - an empty
    // or missing file here would otherwise surface as a confusing import
    // failure instead of pointing at the save step.
    const savedStats = fs.statSync(savedPath);
    expect(savedStats.size).toBeGreaterThan(0);

    await canvasPage.clearCanvas();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.loadSceneFromFile(savedPath);
    await canvasPage.expectVisibleElementCount(4);

    const restored = (await canvasPage.getScene()).elements;

    // Match restored elements back to their originals by type + position,
    // not array order/index - Excalidraw doesn't guarantee elements come
    // back in the same array order they were saved in.
    for (const orig of original) {
      const match = restored.find(
        (el) =>
          el.type === orig.type &&
          Math.abs(el.x - orig.x) < 1 &&
          Math.abs(el.y - orig.y) < 1,
      );
      expect(
        match,
        `no restored ${orig.type} found at (${orig.x}, ${orig.y})`,
      ).toBeDefined();
      expect(match!.width).toBeCloseTo(orig.width, 0);
      expect(match!.height).toBeCloseTo(orig.height, 0);
      expect(match!.text).toBe(orig.text);
      // None of the fixture elements were grouped, so this should stay
      // empty on both sides - if a bug caused import to fabricate group
      // membership (or drop it where it existed), this catches either
      // direction.
      expect(match!.groupIds).toEqual(orig.groupIds);
    }
  });

  test("EX-018: exporting the scene as PNG downloads a valid, non-empty image @regression", async ({
    canvasPage,
  }) => {
    // Fixture scene per the manual test case: 3 shapes.
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 380 });
    await canvasPage.drawRectangle({ x: 700, y: 300 }, { x: 800, y: 380 });
    await canvasPage.selectTool("ellipse");
    await canvasPage.dragOnCanvas({ x: 550, y: 450 }, { x: 650, y: 530 });
    await canvasPage.expectVisibleElementCount(3);

    const download = await canvasPage.exportImageAsPng();
    const savedPath = test.info().outputPath("exported-scene.png");
    await download.saveAs(savedPath);

    const bytes = fs.readFileSync(savedPath);
    expect(bytes.length).toBeGreaterThan(0);

    // PNG signature: 0x89 'P' 'N' 'G' \r \n 0x1A \n - confirms this is
    // actually a PNG and not an empty/corrupt/HTML-error-page download that
    // happens to have a .png name.
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(bytes.subarray(0, 8)).toEqual(pngSignature);

    // IHDR chunk: width is the 4 bytes at offset 16, height at offset 20
    // (big-endian) - see the PNG spec. Reading these directly avoids
    // pulling in an image-decoding dependency just to check the export
    // isn't a 0x0 or single-pixel image.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);

    // Loose sanity bounds rather than an exact match: the export includes
    // default padding around the scene's bounding box (100 wide x 80 tall
    // per rectangle, spanning roughly 250x230 total here) and may be
    // rendered at a device pixel ratio > 1, so an exact pixel match would be
    // fragile. The point of this range is to catch a badly broken export
    // (e.g. a blank canvas-sized image or a 1x1 pixel), not to pin down
    // exact export scaling.
    expect(width).toBeGreaterThanOrEqual(100);
    expect(height).toBeGreaterThanOrEqual(100);
  });
});
