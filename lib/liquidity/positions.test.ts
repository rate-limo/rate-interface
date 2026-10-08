import { describe, expect, it } from "vitest";
import {
  type ChainBandView,
  type ChainPositionView,
  type GatewayLpPosition,
  mergeLpPositions,
  targetBps,
  withdrawPreview,
} from "./positions";

const B = (n: number | string) => BigInt(n);

function gwBand(band: number, valueUSD: number) {
  return {
    band,
    sharesBN: "1000",
    spreadFrac: [20_000_000, 60_000_000, 100_000_000][band] ?? null,
    tolerance: [20_000, 60_000, 100_000][band] ?? null,
    toleranceSell: [20_000, 60_000, 100_000][band] ?? null,
    feeMultiplier: 100_000_000,
    open: true,
    baseOwnedBN: "100",
    quoteOwnedBN: "100",
    valueUSD,
    snapshotAt: 1,
  };
}

function gw(tokenId: string, bands: { band: number; value: number }[]): GatewayLpPosition {
  return {
    tokenId,
    pool: "0xpool",
    active: true,
    bandMask: bands.reduce((m, b) => m | (1 << b.band), 0),
    costUSD: 300,
    feesUSD: 2,
    forfeitedUSD: 0,
    realizedPnlUSD: 0,
    mintedAt: 10,
    firstSeenAt: 10,
    closedAt: null,
    base: "0xbase",
    quote: "0xquote",
    maturity: "600",
    baseSymbol: "TITER",
    quoteSymbol: "USDC",
    baseDecimals: 18,
    quoteDecimals: 6,
    bands: bands.map((b) => gwBand(b.band, b.value)),
    valueUSD: bands.reduce((s, b) => s + b.value, 0),
    unrealizedPnlUSD: 0,
    snapshotAt: 1,
  };
}

function chainBand(band: number, over: Partial<ChainBandView> = {}): ChainBandView {
  return {
    band,
    spreadFrac: 20_000_000,
    toleranceBuy: 20_000,
    toleranceSell: 20_000,
    feeMultiplier: 100_000_000,
    open: true,
    shares: B(1000),
    bandShares: B(4000),
    createdAt: B(10),
    baseOwned: B(1000),
    quoteOwned: B(2000),
    pendingBase: B(0),
    pendingQuote: B(0),
    vestedBase: B(0),
    vestedQuote: B(0),
    vestedNum: 100_000_000,
    ...over,
  };
}

function view(tokenId: string, bands: ChainBandView[], owed: [number, number] = [0, 0]): ChainPositionView {
  return {
    tokenId: B(tokenId),
    pool: "0xpool",
    base: "0xbase",
    quote: "0xquote",
    holder: "0xholder",
    mintedAt: B(10),
    bandMask: bands.reduce((m, b) => m | (1 << b.band), 0),
    bands,
    owedBase: B(owed[0]),
    owedQuote: B(owed[1]),
  };
}

describe("mergeLpPositions", () => {
  it("keeps a three-band token as ONE position with three bands inside", () => {
    const out = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 100 }, { band: 1, value: 100 }, { band: 2, value: 100 }])], new Map());
    expect(out).toHaveLength(1);
    expect(out[0]!.bands.map((b) => b.band)).toEqual([0, 1, 2]);
  });

  it("splits the distribution by VALUE, not by share count", () => {
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 300 }, { band: 2, value: 100 }])], new Map());
    expect(p!.bands.map((b) => Math.round(b.sharePct))).toEqual([75, 25]);
  });

  it("claimable is owed plus every band's vested; vesting is the rest", () => {
    const chain = new Map([
      [
        "1",
        view(
          "1",
          [
            chainBand(0, { pendingBase: B(100), vestedBase: B(40) }),
            chainBand(1, { pendingQuote: B(50), vestedQuote: B(50) }),
          ],
          [5, 7],
        ),
      ],
    ]);
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 1 }, { band: 1, value: 1 }])], chain);
    expect(p!.claimableBase).toBe(B(45));
    expect(p!.claimableQuote).toBe(B(57));
    expect(p!.vestingBase).toBe(B(60));
    expect(p!.vestingQuote).toBe(B(0));
    expect(p!.live).toBe(true);
  });

  it("weights vesting by value, so a small fresh band does not drag a large mature one", () => {
    const chain = new Map([["1", view("1", [chainBand(0, { vestedNum: 100_000_000 }), chainBand(1, { vestedNum: 0 })])]]);
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 900 }, { band: 1, value: 100 }])], chain);
    expect(p!.vestedPct).toBeCloseTo(90);
  });

  it("lists a token the chain did not answer for, with fees unknown rather than zero-settled", () => {
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 1 }])], new Map());
    expect(p!.live).toBe(false);
    expect(p!.vestedPct).toBeNull();
  });

  it("keeps the gateway's value when only the CHAIN read failed", () => {
    // The two fail independently; a rate-limited eth_call must not blank a value
    // the ledger priced perfectly well.
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 42 }])], new Map());
    expect(p!.valueUSD).toBe(42);
  });

  it("reads widths as fractions of DENOM: 20,000 is 0.02%", () => {
    const [p] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 1 }])], new Map());
    expect(p!.bands[0]!.toleranceBuy).toBeCloseTo(0.0002);
    expect(p!.bands[0]!.spreadFrac).toBeCloseTo(0.2);
  });
});

describe("withdrawPreview", () => {
  const chain = new Map([
    [
      "1",
      view("1", [
        chainBand(0, { baseOwned: B(1000), quoteOwned: B(0), pendingBase: B(101), vestedBase: B(1) }),
        chainBand(1, { baseOwned: B(0), quoteOwned: B(3000) }),
      ]),
    ],
  ]);
  const [token] = mergeLpPositions("Arc", [gw("1", [{ band: 0, value: 1 }, { band: 1, value: 1 }])], chain);

  it("takes bps of every band and floors the minimums by the slippage allowance", () => {
    const p = withdrawPreview(token!, 2_500);
    expect(p.baseOut).toBe(B(250));
    expect(p.quoteOut).toBe(B(750));
    expect(p.minBase).toBe(B(248));
    expect(p.minQuote).toBe(B(746));
  });

  it("forfeits only the unvested share, rounded up; the vested fees are paid", () => {
    const p = withdrawPreview(token!, 3_333);
    expect(p.forfeitBase).toBe(B(34)); // ceil(100 x 0.3333)
    expect(p.feesPaidBase).toBe(B(1));
  });
});

describe("targetBps", () => {
  it("sums to exactly 10,000, the only total redistribute accepts", () => {
    const t = targetBps([
      { band: 0, pct: 33.3333 },
      { band: 1, pct: 33.3333 },
      { band: 2, pct: 33.3334 },
    ]);
    expect(t.bps.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(t.bands).toEqual([0, 1, 2]);
  });

  it("omits a 0% band, which redistribute empties, and keeps bands ascending", () => {
    const t = targetBps([
      { band: 2, pct: 25 },
      { band: 1, pct: 0 },
      { band: 0, pct: 75 },
    ]);
    expect(t.bands).toEqual([0, 2]);
    expect(t.bps).toEqual([7_500, 2_500]);
  });
});
