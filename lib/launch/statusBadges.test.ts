import { describe, expect, it } from "vitest";
import { statusBadges } from "./statusBadges";

const labels = (t: Parameters<typeof statusBadges>[0]) => statusBadges(t).map((b) => b.label);

describe("statusBadges", () => {
  it("a graduated coin never reads launching (the bug)", () => {
    expect(labels({ launchedOnIter: true, ladderState: "graduated" })).toEqual(["graduated"]);
    expect(labels({ launchedOnIter: true, graduatedAt: 1_790_000_000 })).toEqual(["graduated"]);
  });

  it("follows the ladder before graduation", () => {
    expect(labels({ launchedOnIter: true, ladderState: "selling" })).toEqual(["launching"]);
    expect(labels({ launchedOnIter: true, ladderState: "soldOut" })).toEqual(["graduating"]);
    expect(labels({ launchedOnIter: true, ladderState: "armed" })).toEqual(["graduating"]);
    expect(labels({ launchedOnIter: true })).toEqual(["launching"]);
  });

  it("listing is its own chip, beside the ladder's", () => {
    expect(labels({ launchedOnIter: true, ladderState: "graduated", verified: true })).toEqual(["graduated", "listed"]);
    expect(labels({ launchedOnIter: false, verified: true })).toEqual(["listed"]);
  });

  it("a token that did not launch here and is not listed is unlisted", () => {
    expect(labels({ launchedOnIter: false })).toEqual(["unlisted"]);
  });
});
