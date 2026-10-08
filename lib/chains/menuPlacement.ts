/**
 * Which corner the chain menu grows from.
 *
 * ## The bug this is the fix for
 *
 * The panel was hard-anchored `absolute right-0 top-[calc(100%+0.75rem)]` —
 * down, and aligned to the trigger's right edge. That is correct for the
 * trigger in a top bar, and wrong for the one `AppSidebar` pins to the FOOT of
 * a 76px rail: 340px of menu, 12px below a trigger already at the bottom of the
 * viewport, anchored to the right edge of a column a fifth of its width. Both
 * axes land off-screen, so clicking the sidebar switcher opened a panel nobody
 * could see and it read as a dead control — and with no working switcher,
 * whichever chain `?chain=` happens to name is the only one you ever see.
 *
 * ## Measured, not configured
 *
 * This could have been a `placement` prop. It is not, because the bug WAS a
 * caller that could not have known: `AppSidebar` places the trigger and the
 * menu's size lives in the switcher, so neither side alone holds the answer. A
 * prop moves the decision to the one place it cannot be checked. The trigger's
 * box is a fact, the menu's box is a constant, and "does it fit" is arithmetic.
 */

/**
 * The menu's own box.
 *
 * **Keep in step with the panel's classes in `ChainSwitcher`** — `w-[340px]`,
 * `p-2.5`, the `h-12` search field with `mb-2`, and the list's `max-h-[25rem]`.
 * The height is the sum, not the list alone: counting only `25rem` reports that
 * a menu fits in 400px when it needs 476, which puts the last two networks
 * under the fold — a subtler version of the same bug.
 */
export const MENU_WIDTH = 340;
/** 10 + 48 + 8 + 400 + 10, rounded up for the border. */
export const MENU_HEIGHT = 480;

/** The gap the panel leaves between itself and the trigger (`0.75rem`). */
const MENU_GAP = 12;

export interface MenuPlacement {
  /** Open upward — the panel's bottom sits above the trigger's top. */
  up: boolean;
  /** Align to the trigger's right edge, so the panel extends leftward. */
  left: boolean;
}

/**
 * Decide from the trigger's viewport rect and the viewport's size.
 *
 * Only the four numbers that matter are taken, so a caller can pass a real
 * `DOMRect` and a test can pass a literal.
 */
export function chooseMenuPlacement(
  trigger: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number },
): MenuPlacement {
  const roomBelow = viewport.height - trigger.bottom - MENU_GAP;
  const roomAbove = trigger.top - MENU_GAP;
  return {
    /*
     * Down is the default and only gives way when there is genuinely no room —
     * AND there is more room the other way. A trigger in a viewport too short
     * for the menu either way keeps the familiar direction rather than flipping
     * into an equally bad one.
     */
    up: roomBelow < MENU_HEIGHT && roomAbove > roomBelow,
    /*
     * Right-aligned wherever the panel has the width to its left, which is
     * every trigger in a bar. A narrow rail hugging the left edge does not, so
     * it opens rightward instead of off-screen.
     */
    left: trigger.right >= MENU_WIDTH,
  };
}
