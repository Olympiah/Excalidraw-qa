import { test, expect } from "../fixtures/base";

// Autosave is item 2 in the risk-ordered plan (docs/02-test-strategy.md
// §3.3): "edit, reload, scene restored." It's high-risk because it's the
// user's only safety net against an accidental refresh, tab close, or crash
// - if it silently fails, the user loses work with no error and no warning.
//
// How it actually works under the hood (see excalidraw-app/data/LocalData.ts):
// every scene mutation schedules a save to localStorage, but that save is
// DEBOUNCED (SAVE_TO_LOCAL_STORAGE_TIMEOUT, ~300ms) rather than synchronous.
// That debounce is the main thing that can make this flow flaky or subtly
// broken:
//   - reload too early relative to the last edit, and you're asserting
//     against whatever was last actually flushed, not what's on screen.
//   - a save mid-drag or mid-edit could persist a half-finished shape.
// Most tests below use CanvasPage.expectVisibleElementCount (which polls
// for two stable consecutive reads) before reloading, specifically to force
// past that debounce window and be certain the save being tested against
// has actually landed. The exception is the debounce edge-case test, which
// deliberately reloads WITHOUT that wait, because racing the debounce
// window is the entire point of that test.
//
// canvasPage.reload() (not goto()) is used throughout: this suite is
// modeling a real user hitting refresh or recovering from a crash
// mid-session on the SAME origin, which is a different code path from the
// fixture's own clean-slate goto() (that one explicitly clears localStorage
// first). Reusing goto() here would defeat the point of the test.

test.describe("Autosave", () => {
  test("editing the canvas persists across a reload @smoke @regression", async ({
    canvasPage,
  }) => {
    // This is the core, highest-value flow: the single most common thing a
    // real user does that autosave exists to protect against — draw
    // something, accidentally (or deliberately) refresh the page, and
    // expect their work to still be there. If only one autosave test could
    // exist, it would be this one, hence @smoke.
    const from = { x: 550, y: 300 };
    const to = { x: 700, y: 400 };
    // The draw coordinates already tell us the target geometry, so wait for
    // THAT known value directly rather than for "the scene stopped
    // changing" - the latter can in principle settle on the wrong
    // in-between plateau mid-drag (see expectVisibleElementCount's doc
    // comment for a real example of that happening).
    const expectedGeometry = {
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
    };

    await canvasPage.drawRectangle(from, to);
    const drawn = await canvasPage.waitForDrawnElement(
      "rectangle",
      expectedGeometry,
    );

    await canvasPage.reload();

    const restored = await canvasPage.waitForDrawnElement(
      "rectangle",
      expectedGeometry,
    );

    // Asserting on the SAME id (not just "a rectangle showed up somewhere")
    // is the important check here — it proves the reload restored the
    // actual persisted element rather than the app coincidentally
    // recreating a similar-looking default shape, which would pass a
    // sloppier "count == 1" assertion while masking real data loss.
    expect(restored.id).toBe(drawn.id);
  });

  test("multiple edits and a delete all persist across a reload @regression", async ({
    canvasPage,
  }) => {
    // Real editing sessions aren't "draw one shape and stop" - they're a
    // sequence of draws, moves, and deletes. This test's value is proving
    // autosave captures the NET RESULT of a whole editing session, not just
    // a single isolated action. It also specifically exercises deletion,
    // which is a distinct risk from "did my shape survive": if the delete
    // path has a bug where the deleted element lingers in localStorage
    // under isDeleted rather than being stripped (see the isDeleted note on
    // ExcalidrawElement in CanvasPage.ts), a naive reload+count check could
    // still pass while a deleted shape secretly reappears.
    // Known target geometry from the draw coordinates - waited for directly
    // (not via expectVisibleElementCountSettled's "stopped changing" guess)
    // since this shape's geometry is fed into selectElement's marquee-select
    // below, and a mid-drag capture would make that marquee miss the shape.
    // Waiting for a known exact value can't be fooled by a stable-but-wrong
    // in-between size the way a stability check still technically could.
    const firstGeometry = { x: 550, y: 300, width: 100, height: 80 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 380 });
    const first = await canvasPage.waitForDrawnElement(
      "rectangle",
      firstGeometry,
    );

    await canvasPage.drawRectangle({ x: 700, y: 300 }, { x: 800, y: 380 });
    await canvasPage.expectVisibleElementCount(2);

    // Delete the first shape so the persisted scene reflects a mix of
    // surviving and removed elements, not just an ever-growing list -
    // closer to how a real editing session actually looks.
    await canvasPage.selectElement(first);
    await canvasPage.deleteSelected();
    await canvasPage.expectVisibleElementCount(1);

    // Find the survivor explicitly by excluding the deleted id and any
    // isDeleted record, rather than assuming elements[0] is it. If deleted
    // elements are ever retained in storage with isDeleted: true instead of
    // being stripped, elements[0] could still be the deleted shape (array
    // order isn't guaranteed), which would silently make `surviving` the
    // wrong element and invalidate everything asserted below.
    const surviving = (await canvasPage.getScene()).elements.find(
      (el) => el.id !== first.id && !el.isDeleted,
    );
    expect(surviving, "exactly one non-deleted element should remain").toBeDefined();

    await canvasPage.reload();

    await canvasPage.expectVisibleElementCount(1);
    const restored = await canvasPage.getElementById(surviving!.id);
    expect(restored).toBeDefined();

    // The deleted shape must stay gone after reload. This is the assertion
    // that actually matters for this test - without it, a bug where
    // deletes don't make it into the persisted save (or get reverted by a
    // stale in-memory snapshot flushing after the delete) would slip
    // through undetected. Note getElementById searches allElements, not the
    // isDeleted-filtered elements list, so this only passes if the deleted
    // element is genuinely absent, not merely flagged.
    const deletedStillGone = await canvasPage.getElementById(first.id);
    expect(deletedStillGone).toBeUndefined();
  });

  test("moving and resizing a shape persists the updated geometry, not the original @regression", async ({
    canvasPage,
  }) => {
    // This flow exists because "autosave works" is easy to fake by only
    // testing the moment right after a shape is first drawn - the save that
    // happens at creation time. It says nothing about whether LATER
    // mutations to an already-persisted element (move, resize) also get
    // captured. A plausible real bug here: the initial draw saves fine, but
    // an in-place update to an existing element's x/y/width/height doesn't
    // correctly re-trigger the debounced save, so a reload would silently
    // roll the shape back to its as-drawn position/size.
    // Known target geometry, waited for directly instead of via
    // expectVisibleElementCountSettled: this becomes the move/resize
    // starting point below, so it has to be the real final draw, not a
    // mid-drag snapshot - and a known-value wait can't lock onto the wrong
    // stable-looking in-between size the way a stability check still could.
    const initialGeometry = { x: 550, y: 300, width: 100, height: 80 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 380 });
    let shape = await canvasPage.waitForDrawnElement(
      "rectangle",
      initialGeometry,
    );

    await canvasPage.selectElement(shape);
    await canvasPage.moveSelectedElement(shape, 80, 40);
    // waitForElementChange now requires two stable consecutive reads (not
    // just "the first read that differs from the pre-move geometry"), so
    // `shape` here is guaranteed to be the drag's final resting position,
    // not an in-between point that a slow drag could otherwise hand back.
    shape = await canvasPage.waitForElementChange(shape.id, shape);

    await canvasPage.selectElement(shape);
    await canvasPage.resizeSelectedElement(shape, 50, 30);
    shape = await canvasPage.waitForElementChange(shape.id, shape);

    // Capture the fully moved-and-resized geometry as the expectation
    // BEFORE reloading - this is what should come back, not the shape's
    // original as-drawn coordinates from the top of the test.
    const expected = shape;

    await canvasPage.reload();

    await canvasPage.expectVisibleElementCount(1);
    const restored = await canvasPage.waitForElementMatch(shape.id, expected);

    expect(restored.x).toBeCloseTo(expected.x, 0);
    expect(restored.y).toBeCloseTo(expected.y, 0);
    expect(restored.width).toBeCloseTo(expected.width, 0);
    expect(restored.height).toBeCloseTo(expected.height, 0);
  });

  test("a reload immediately after drawing still restores the shape (debounce edge case) @regression", async ({
    canvasPage,
    page,
  }) => {
    // This is the edge case the whole debounce mechanism makes possible:
    // what happens if the user reloads BEFORE the ~300ms debounced save has
    // had a chance to fire? A correct implementation should still flush the
    // pending save (e.g. on a beforeunload/visibility handler) so the user
    // never loses the very last thing they drew just because they refreshed
    // a split second too soon. This is deliberately NOT waiting on
    // expectVisibleElementCount before reloading (unlike the other tests in
    // this file) - that's the point: it's probing the race window that the
    // other tests are careful to avoid, rather than the steady-state
    // behavior after the debounce has already settled.
    const from = { x: 550, y: 300 };
    const to = { x: 700, y: 400 };
    // Known target geometry, from the draw coordinates - used as the
    // post-reload expectation directly. Deliberately NOT read from
    // getScene()/localStorage before reloading: any such read would have to
    // wait for the debounced save to land first (storage is empty until it
    // does), which would mean the save had already happened by the time we
    // reload - eliminating the exact race this test exists to probe.
    const expectedGeometry = {
      x: from.x,
      y: from.y,
      width: to.x - from.x,
      height: to.y - from.y,
    };

    // One-shot (non-polling) read, purely for the annotation below - this
    // doesn't wait for anything, it just samples storage's state right now.
    const savedBeforeReload = await page.evaluate(() => {
      const raw = localStorage.getItem("excalidraw");
      return !!raw && JSON.parse(raw).length > 0;
    });

    await canvasPage.drawRectangle(from, to);

    // No settle-wait here on purpose - reload as fast as Playwright will
    // let us, right on the heels of the draw.
    await canvasPage.reload();

    // Record whether storage already had data going into the draw. Kept as
    // an annotation, not an assertion: it's diagnostic context for
    // investigating a failure/flake, not something this test should fail on
    // by itself.
    test.info().annotations.push({
      type: "race",
      description: savedBeforeReload
        ? "storage already had data before this test's draw even started - investigate test isolation"
        : "storage was empty going into the draw, as expected",
    });

    // Now that we're past the reload, waiting for the known target geometry
    // is safe - the debounce is irrelevant once the page has already
    // reloaded, whatever ends up in storage is final. If this is flaky or
    // fails outright, that's a genuine finding about the save-on-unload
    // path, not a test bug - resist the urge to "fix" it by adding a
    // pre-reload wait, which would just delete the scenario this test
    // exists to cover.
    const restored = await canvasPage.waitForDrawnElement(
      "rectangle",
      expectedGeometry,
    );
    expect(restored.type).toBe("rectangle");
  });

  test("an empty canvas after deleting everything reloads as empty, not with the old scene back @regression", async ({
    canvasPage,
  }) => {
    // This has to go through an actual something -> nothing transition, not
    // just reload an already-empty fixture. The fixture clears localStorage
    // before every test, so a bare "reload with nothing drawn" test would
    // pass unconditionally - there'd be no stale data available to
    // incorrectly resurrect, so the test couldn't fail even if empty scenes
    // were never saved at all. Going from one shape to zero, and confirming
    // the reload doesn't bring the shape back, is the version that actually
    // exercises whether "the scene is now empty" gets persisted.
    // Known target geometry, waited for directly - this geometry drives
    // selectElement's marquee-select below, and a mid-drag capture would
    // make the marquee miss the actual shape, so the delete would silently
    // select/delete nothing and this test would time out waiting for a
    // count drop that was never coming. Originally fixed with
    // expectVisibleElementCountSettled (flaked intermittently with the
    // plain expectVisibleElementCount before that); switched to
    // waitForDrawnElement since a known-value wait is strictly more
    // reliable than any "stopped changing" guess, however strict.
    const shapeGeometry = { x: 550, y: 300, width: 100, height: 80 };
    await canvasPage.drawRectangle({ x: 550, y: 300 }, { x: 650, y: 380 });
    const shape = await canvasPage.waitForDrawnElement(
      "rectangle",
      shapeGeometry,
    );

    await canvasPage.selectElement(shape);
    await canvasPage.deleteSelected();
    await canvasPage.expectVisibleElementCount(0);

    await canvasPage.reload();

    await canvasPage.expectVisibleElementCount(0);
    const stillGone = await canvasPage.getElementById(shape.id);
    expect(stillGone).toBeUndefined();
  });

  test("EX-015: scene with two shapes and text is restored after reload @regression", async ({
    canvasPage,
    page,
  }) => {
    // Automates testcase EX-015 ("Autosave and reload persistence") as
    // written: fixture scene of 2 shapes + 1 text element, reload via F5,
    // expect all three present after reload with the same positions and
    // content, and the scene present in localStorage under the "excalidraw"
    // key. This overlaps with the tests above (which is deliberate - they
    // exist for granular, single-variable coverage during development/CI
    // triage), but this test is kept as its own case so EX-015 maps to
    // exactly one automated test, traceable 1:1 back to the manual test
    // case it replaces. Not tagged @smoke: that tag is reserved for the one
    // core happy-path test at the top of this file (same convention as
    // undo-redo.spec.ts), and this test's scenario is a superset/variant of
    // it rather than a second "the" critical path.
    const rect1From = { x: 550, y: 300 };
    const rect1To = { x: 650, y: 380 };
    const rect2From = { x: 700, y: 300 };
    const rect2To = { x: 800, y: 380 };
    const textAt = { x: 550, y: 450 };
    const textContent = "EX-015";

    await canvasPage.drawRectangle(rect1From, rect1To);
    await canvasPage.drawRectangle(rect2From, rect2To);
    await canvasPage.addText(textAt, textContent);

    // "Wait for autosave (verify interval)" from the manual steps -
    // expectVisibleElementCount is that wait: it polls until the scene has
    // two consecutive identical reads, which is the concrete, non-flaky
    // stand-in for "the debounced save has definitely fired" (see the
    // file-level comment on the debounce for why this matters).
    await canvasPage.expectVisibleElementCount(3);

    const before = (await canvasPage.getScene()).elements;
    const rect1 = before.find(
      (el) => el.type === "rectangle" && Math.abs(el.x - rect1From.x) < 5,
    );
    const rect2 = before.find(
      (el) => el.type === "rectangle" && Math.abs(el.x - rect2From.x) < 5,
    );
    const text = before.find((el) => el.type === "text");
    expect(rect1, "first rectangle should exist before reload").toBeDefined();
    expect(rect2, "second rectangle should exist before reload").toBeDefined();
    expect(text, "text element should exist before reload").toBeDefined();
    // Check the typed content BEFORE reloading. If addText typed the wrong
    // thing (a page-object bug, not an autosave bug), catching it here
    // means the failure points at text entry, not at "autosave lost my
    // text" - which is what it would look like if this check only ran
    // after the reload.
    expect(text!.text).toBe(textContent);

    // The manual case's acceptance criteria explicitly names the
    // localStorage key and expects the scene to be present there, not just
    // "restored on screen" - assert against the parsed storage content
    // directly, not just that the key is non-null (a stale or half-written
    // scene would also make it non-null).
    const rawBeforeReload = await page.evaluate(() =>
      localStorage.getItem("excalidraw"),
    );
    const storedIdsBeforeReload = JSON.parse(rawBeforeReload ?? "[]")
      .filter((el: { isDeleted: boolean }) => !el.isDeleted)
      .map((el: { id: string }) => el.id);
    expect(storedIdsBeforeReload).toEqual(
      expect.arrayContaining([rect1!.id, rect2!.id, text!.id]),
    );

    // F5 / page reload, per the manual steps.
    await canvasPage.reload();

    await canvasPage.expectVisibleElementCount(3);

    const rawAfterReload = await page.evaluate(() =>
      localStorage.getItem("excalidraw"),
    );
    const storedIdsAfterReload = JSON.parse(rawAfterReload ?? "[]")
      .filter((el: { isDeleted: boolean }) => !el.isDeleted)
      .map((el: { id: string }) => el.id);
    expect(storedIdsAfterReload).toEqual(
      expect.arrayContaining([rect1!.id, rect2!.id, text!.id]),
    );

    // Same ids as before reload - proves these are the SAME three elements
    // restored from storage, not three coincidentally-matching elements the
    // app happened to recreate.
    const restoredRect1 = await canvasPage.getElementById(rect1!.id);
    const restoredRect2 = await canvasPage.getElementById(rect2!.id);
    const restoredText = await canvasPage.getElementById(text!.id);

    expect(restoredRect1, "first rectangle should survive reload").toBeDefined();
    expect(restoredRect1!.x).toBeCloseTo(rect1!.x, 0);
    expect(restoredRect1!.y).toBeCloseTo(rect1!.y, 0);
    expect(restoredRect1!.width).toBeCloseTo(rect1!.width, 0);
    expect(restoredRect1!.height).toBeCloseTo(rect1!.height, 0);

    expect(restoredRect2, "second rectangle should survive reload").toBeDefined();
    expect(restoredRect2!.x).toBeCloseTo(rect2!.x, 0);
    expect(restoredRect2!.y).toBeCloseTo(rect2!.y, 0);
    expect(restoredRect2!.width).toBeCloseTo(rect2!.width, 0);
    expect(restoredRect2!.height).toBeCloseTo(rect2!.height, 0);

    expect(restoredText, "text element should survive reload").toBeDefined();
    expect(restoredText!.x).toBeCloseTo(text!.x, 0);
    expect(restoredText!.y).toBeCloseTo(text!.y, 0);
    // Content, not just position - a text element restored with the right
    // geometry but empty/garbled text would still be data loss.
    expect(restoredText!.text).toBe(textContent);
  });
});
