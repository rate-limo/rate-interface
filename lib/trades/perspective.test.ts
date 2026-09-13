import { describe, expect, it } from "vitest";
import { sameAddress, viewerBought, viewerRole, viewerSide, wasTaker } from "./perspective";

const ME = "0xAAAAaaaAAAAaaaAAaAaAAAaAAAaaAAAAAAAaAaAa";
const THEM = "0xBBBBbbbBBBBbbbBBbBbBBBbBBBbbBBBBBBBbBbBb";

describe("sameAddress", () => {
  it("ignores case — the gateway sends checksummed, wagmi does not always", () => {
    expect(sameAddress(ME.toLowerCase(), ME.toUpperCase())).toBe(true);
  });

  it("is false for a missing address rather than matching another missing one", () => {
    expect(sameAddress(undefined, undefined)).toBe(false);
    expect(sameAddress(null, ME)).toBe(false);
    expect(sameAddress("", "")).toBe(false);
  });
});

describe("viewerSide", () => {
  it("agrees with isBid when the viewer took the trade", () => {
    expect(viewerSide(true, ME, ME)).toBe("Buy");
    expect(viewerSide(false, ME, ME)).toBe("Sell");
  });

  /* The whole reason this module exists: `isBid` is the TAKER's direction, so a
   * maker whose resting sell was hit by a buy has sold. Reported as a Buy, it
   * renders as a completely plausible trade the wallet never made. */
  it("inverts isBid when the viewer was the maker", () => {
    expect(viewerSide(true, THEM, ME)).toBe("Sell");
    expect(viewerSide(false, THEM, ME)).toBe("Buy");
  });

  it("reports isBid as-is when there is no viewer — the public tape has no 'you'", () => {
    expect(viewerSide(true, THEM)).toBe("Buy");
    expect(viewerSide(true, THEM, undefined)).toBe("Buy");
  });

  it("treats a self-match as taken, not made", () => {
    expect(viewerSide(true, ME, ME)).toBe("Buy");
  });

  it("agrees with viewerBought", () => {
    expect(viewerSide(true, THEM, ME)).toBe(viewerBought(true, THEM, ME) ? "Buy" : "Sell");
  });
});

describe("wasTaker", () => {
  it("defaults to true only when no viewer is given", () => {
    expect(wasTaker(THEM)).toBe(true);
    expect(wasTaker(THEM, ME)).toBe(false);
    expect(wasTaker(ME, ME)).toBe(true);
  });

  it("does not call a row with no taker at all a match", () => {
    expect(wasTaker(undefined, ME)).toBe(false);
  });
});

describe("viewerRole", () => {
  it("names the side of the fill the viewer was on", () => {
    expect(viewerRole(ME, ME)).toBe("Taker");
    expect(viewerRole(THEM, ME)).toBe("Maker");
  });

  it("reports nothing rather than guessing when no wallet is being viewed", () => {
    expect(viewerRole(THEM)).toBe("--");
  });
});
