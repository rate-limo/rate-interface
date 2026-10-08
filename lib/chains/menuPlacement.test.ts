import { describe, expect, it } from "vitest";
import { chooseMenuPlacement, MENU_HEIGHT, MENU_WIDTH } from "./menuPlacement";

/** A 1540x784 desktop viewport — the width the sidebar shell appears at. */
const VIEWPORT = { width: 1540, height: 784 };

describe("chooseMenuPlacement", () => {
  it("opens down and right-aligned from a trigger in a top bar", () => {
    // The shape every other mount has, and the one the panel was hardcoded for.
    // It must not change, or ten call sites move at once.
    expect(
      chooseMenuPlacement({ top: 14, bottom: 58, right: 1180 }, VIEWPORT),
    ).toEqual({ up: false, left: true });
  });

  it("opens UP from the sidebar's bottom-pinned trigger", () => {
    /*
     * `AppSidebar` pins the switcher with `mt-auto`, so it sits at the foot of
     * the viewport: 40px tall, ending ~20px from the bottom. Anchored down, the
     * panel started below the fold entirely — the click looked like it did
     * nothing, and with no way to switch, the chain in `?chain=` was the only
     * one you could ever see.
     */
    expect(chooseMenuPlacement({ top: 724, bottom: 764, right: 52 }, VIEWPORT).up).toBe(true);
  });

  it("opens RIGHTWARD from a trigger narrower than the menu", () => {
    // The rail is 76px wide. Right-aligning a 340px panel to a trigger whose
    // right edge is at 52 puts it from -288 to 52 — off the left of the screen.
    expect(chooseMenuPlacement({ top: 724, bottom: 764, right: 52 }, VIEWPORT).left).toBe(false);
  });

  it("keeps right alignment the moment there is room for it", () => {
    const exact = chooseMenuPlacement({ top: 100, bottom: 140, right: MENU_WIDTH }, VIEWPORT);
    expect(exact.left).toBe(true);
    const oneShort = chooseMenuPlacement({ top: 100, bottom: 140, right: MENU_WIDTH - 1 }, VIEWPORT);
    expect(oneShort.left).toBe(false);
  });

  it("counts the whole panel, not just its scrolling list", () => {
    /*
     * The list is `max-h-[25rem]` (400px), but the panel also carries its
     * padding and the search field — 480 in total.
     *
     * 430px of room below is the discriminating case: it clears the list's
     * 400 and not the panel's 480. Measuring the list alone would call that a
     * fit and push the last networks under the fold — a quieter version of the
     * bug this module exists for. A tall viewport is needed to isolate it,
     * because the tie-break below only yields when above is roomier.
     */
    const tall = { width: 1540, height: 1200 };
    const bottom = tall.height - 430 - 12;
    expect(chooseMenuPlacement({ top: bottom - 40, bottom, right: 900 }, tall).up).toBe(true);
    // And the constant is what makes that true, so pin it rather than the
    // arithmetic alone.
    expect(MENU_HEIGHT).toBeGreaterThan(430);
  });

  it("stays DOWN when neither direction fits", () => {
    // A short viewport has no good answer, so it keeps the familiar one rather
    // than flipping into an equally bad direction.
    const short = { width: 1540, height: 420 };
    expect(chooseMenuPlacement({ top: 180, bottom: 220, right: 900 }, short).up).toBe(false);
  });

  it("flips up only when above is genuinely roomier", () => {
    // Mid-viewport, room is symmetric-ish and below wins ties.
    const mid = Math.round(VIEWPORT.height / 2);
    expect(chooseMenuPlacement({ top: mid - 20, bottom: mid + 20, right: 900 }, VIEWPORT).up).toBe(
      false,
    );
  });
});
