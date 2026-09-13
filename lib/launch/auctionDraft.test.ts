import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auctionDraftKey,
  legacyAuctionDraftKey,
  readAuctionDraft,
  writeAuctionDraft,
} from "./auctionDraft";

/**
 * The migration is the point of these tests.
 *
 * `/cookies` states that a presale exists nowhere but this browser and that
 * losing it is unrecoverable, so renaming `iter:white-launch:*` to
 * `iter:auction:*` without carrying the old values forward would destroy user
 * data. That is a claim worth a test rather than a comment.
 */

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { localStorage: store });
});

describe("auctionDraft", () => {
  it("round-trips a draft through the current key", () => {
    expect(writeAuctionDraft("rise", "atlas-1", { token: "ATLAS" })).toBe(true);
    expect(store.map.has(auctionDraftKey("rise", "atlas-1"))).toBe(true);
    expect(readAuctionDraft("rise", "atlas-1")).toEqual({ token: "ATLAS" });
  });

  it("finds a draft written under the legacy white-launch key", () => {
    store.map.set(legacyAuctionDraftKey("rise", "old-1"), JSON.stringify({ token: "OLD" }));
    expect(readAuctionDraft("rise", "old-1")).toEqual({ token: "OLD" });
  });

  it("rewrites a legacy draft forward and drops the old entry", () => {
    store.map.set(legacyAuctionDraftKey("rise", "old-2"), JSON.stringify({ token: "OLD" }));
    readAuctionDraft("rise", "old-2");
    expect(store.map.get(auctionDraftKey("rise", "old-2"))).toBe(JSON.stringify({ token: "OLD" }));
    // Left behind, the same draft would resurrect after the user edited the new
    // one — two entries for one auction, and the stale one winning nothing
    // predictably.
    expect(store.map.has(legacyAuctionDraftKey("rise", "old-2"))).toBe(false);
  });

  it("prefers the current key when both exist", () => {
    store.map.set(legacyAuctionDraftKey("rise", "both"), JSON.stringify({ token: "STALE" }));
    store.map.set(auctionDraftKey("rise", "both"), JSON.stringify({ token: "FRESH" }));
    expect(readAuctionDraft("rise", "both")).toEqual({ token: "FRESH" });
  });

  it("keeps drafts separate per network", () => {
    writeAuctionDraft("rise", "dup", { token: "RISE" });
    writeAuctionDraft("somnia", "dup", { token: "SOMNIA" });
    expect(readAuctionDraft("rise", "dup")).toEqual({ token: "RISE" });
    expect(readAuctionDraft("somnia", "dup")).toEqual({ token: "SOMNIA" });
  });

  it("reads a hand-edited entry as no draft rather than throwing", () => {
    store.map.set(auctionDraftKey("rise", "bad"), "{not json");
    expect(readAuctionDraft("rise", "bad")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(readAuctionDraft("rise", "missing")).toBeNull();
  });

  it("reports a refused write instead of promising persistence", () => {
    vi.stubGlobal("window", {
      localStorage: {
        ...store,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(writeAuctionDraft("rise", "full", { token: "X" })).toBe(false);
  });
});
