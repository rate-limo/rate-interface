import { describe, expect, it } from "vitest";
import { pinnedPosition, type LpToken } from "./positions";

const token = (tokenId: string, over: Partial<LpToken> = {}) =>
  ({ tokenId, active: true, ...over }) as LpToken;

describe("pinnedPosition", () => {
  it("prefers the live row, so an open dialog shows fresh numbers", () => {
    const live = token("5", { valueUSD: 90 });
    const stale = token("5", { valueUSD: 120 });
    expect(pinnedPosition(live, stale)).toBe(live);
  });

  /**
   * The failure this exists for. A withdrawal refetches the list, and while the
   * lookup misses — a refetch under a changed query key, a `pair:` key that now
   * matches two positions — the dialog used to unmount and take the success
   * screen with it.
   */
  it("keeps the dialog's position when the live lookup misses", () => {
    const opened = token("5");
    expect(pinnedPosition(undefined, opened)).toBe(opened);
  });

  /**
   * The case that could NEVER show a confirmation: withdrawing everything
   * closes the position, and closing it is what removes it from the list the
   * dialog was resolving itself from.
   */
  it("survives the position being closed by the withdrawal itself", () => {
    const closed = token("5", { active: false });
    expect(pinnedPosition(undefined, closed)).toBe(closed);
  });

  it("is undefined when nothing has ever resolved", () => {
    expect(pinnedPosition(undefined, undefined)).toBeUndefined();
  });
});
