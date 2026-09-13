import { describe, expect, it } from "vitest";
import {
  addTotals,
  aggregate,
  chainsWithHoldings,
  partitionByStatus,
  toChainPositions,
  EMPTY_TOTALS,
  type ChainPositions,
} from "./crossChain";
import type { PositionTotals, SpotPosition } from "./types";

function totals(over: Partial<PositionTotals> = {}): PositionTotals {
  return { ...EMPTY_TOTALS, ...over };
}

function position(over: Partial<SpotPosition> = {}): SpotPosition {
  return {
    token: "0xtoken",
    symbol: "NOVA",
    logoURI: null,
    amount: 10,
    costUSD: 100,
    avgEntryUSD: 10,
    valueUSD: 120,
    unrealizedPnlUSD: 20,
    realizedPnlUSD: 5,
    untrackedSold: 0,
    tradeCount: 3,
    firstTradeAt: 1,
    lastTradeAt: 2,
    priced: true,
    ...over,
  } as SpotPosition;
}

function chain(name: string, over: Partial<ChainPositions> = {}): ChainPositions {
  return { networkName: name, positions: [], totals: EMPTY_TOTALS, failed: false, ...over };
}

describe("addTotals", () => {
  it("sums every field, unpricedCount included", () => {
    // unpricedCount is what qualifies the other three — value, cost and
    // unrealised are partial by exactly that many rows. Dropping it in the sum
    // would leave a cross-chain total that looks complete and is not.
    expect(
      addTotals(
        totals({ valueUSD: 100, costUSD: 80, unrealizedPnlUSD: 20, realizedPnlUSD: 5, unpricedCount: 1 }),
        totals({ valueUSD: 50, costUSD: 60, unrealizedPnlUSD: -10, realizedPnlUSD: 7, unpricedCount: 2 }),
      ),
    ).toEqual({
      valueUSD: 150,
      costUSD: 140,
      unrealizedPnlUSD: 10,
      realizedPnlUSD: 12,
      unpricedCount: 3,
    });
  });

  it("is identity against EMPTY_TOTALS", () => {
    const t = totals({ valueUSD: 9, realizedPnlUSD: 3 });
    expect(addTotals(EMPTY_TOTALS, t)).toEqual(t);
  });
});

describe("aggregate", () => {
  it("sums the chains that answered", () => {
    const result = aggregate([
      chain("Arc Testnet", { totals: totals({ valueUSD: 100, realizedPnlUSD: 10 }) }),
      chain("RISE Testnet", { totals: totals({ valueUSD: 40, realizedPnlUSD: -4 }) }),
    ]);
    expect(result.totals.valueUSD).toBe(140);
    expect(result.totals.realizedPnlUSD).toBe(6);
    expect(result.answeredChains).toEqual(["Arc Testnet", "RISE Testnet"]);
    expect(result.failedChains).toEqual([]);
  });

  it("a FAILED chain contributes nothing and is named", () => {
    // The whole point. Zero would be a claim — "this wallet holds nothing
    // there". Absence plus a name is the truth — "we could not ask". A dead
    // gateway must not render as a confident smaller portfolio.
    const result = aggregate([
      chain("Arc Testnet", { totals: totals({ valueUSD: 100, realizedPnlUSD: 10 }) }),
      chain("RISE Testnet", { failed: true }),
    ]);
    expect(result.totals.valueUSD).toBe(100);
    expect(result.failedChains).toEqual(["RISE Testnet"]);
    expect(result.answeredChains).toEqual(["Arc Testnet"]);
  });

  it("reports every chain failing without pretending the portfolio is empty", () => {
    const result = aggregate([
      chain("Arc Testnet", { failed: true }),
      chain("RISE Testnet", { failed: true }),
    ]);
    expect(result.totals).toEqual(EMPTY_TOTALS);
    expect(result.failedChains).toHaveLength(2);
    expect(result.answeredChains).toEqual([]);
  });

  it("concatenates positions from answering chains only", () => {
    const result = aggregate([
      chain("Arc Testnet", { positions: [position({ symbol: "KEPT" })] }),
      chain("RISE Testnet", { positions: [position({ symbol: "GHOST" })], failed: true }),
    ]);
    expect(result.positions.map((p) => p.symbol)).toEqual(["KEPT"]);
  });

  it("keeps every chain in `chains`, failed ones included", () => {
    // The per-chain breakdown is the reason to fan out at all; a failed chain
    // still needs a row saying so.
    const result = aggregate([chain("Arc Testnet"), chain("RISE Testnet", { failed: true })]);
    expect(result.chains.map((c) => c.networkName)).toEqual(["Arc Testnet", "RISE Testnet"]);
  });

  it("returns empty totals for no chains at all", () => {
    expect(aggregate([]).totals).toEqual(EMPTY_TOTALS);
  });
});

describe("toChainPositions", () => {
  it("marks a null read as failed rather than empty", () => {
    const c = toChainPositions("RISE Testnet", null);
    expect(c.failed).toBe(true);
    expect(c.totals).toEqual(EMPTY_TOTALS);
  });

  it("carries a real answer through untouched", () => {
    const data = {
      address: "0xa",
      positions: [position()],
      totals: totals({ valueUSD: 120, realizedPnlUSD: 5 }),
    };
    const c = toChainPositions("Arc Testnet", data as never);
    expect(c.failed).toBe(false);
    expect(c.totals.valueUSD).toBe(120);
    expect(c.positions).toHaveLength(1);
  });
});

describe("chainsWithHoldings", () => {
  it("counts chains the wallet HOLDS on, not chains we queried", () => {
    // "3 chains" beside a net worth reads as "your money is spread across 3
    // chains", not "we asked 3 gateways". A wallet that never touched RISE must
    // not be told it is on two chains.
    expect(
      chainsWithHoldings([
        chain("Arc Testnet", { positions: [position({ amount: 10 })] }),
        chain("RISE Testnet", { positions: [] }),
      ]),
    ).toEqual(["Arc Testnet"]);
  });

  it("ignores closed positions — amount 0 is not a holding", () => {
    expect(
      chainsWithHoldings([chain("RISE Testnet", { positions: [position({ amount: 0 })] })]),
    ).toEqual([]);
  });

  it("never counts a failed chain, whose holdings are unknown", () => {
    expect(
      chainsWithHoldings([
        chain("Arc Testnet", { positions: [position({ amount: 5 })], failed: true }),
      ]),
    ).toEqual([]);
  });
});

describe("partitionByStatus", () => {
  const NETWORKS = ["Arc Testnet", "RISE Testnet"];

  it("treats a PENDING chain as unknown — neither answered nor failed", () => {
    // The offline bug. This used to filter on `!isLoading`, and in TanStack v5
    // `isLoading === isPending && isFetching` — so a paused fetch (offline) or a
    // disabled query reports isLoading:false while holding no data. Such a chain
    // counted as settled, fell through to `data ?? null`, and was marked FAILED,
    // so the card printed a confident settled $0 for chains it never read.
    const { settled, pending } = partitionByStatus(
      [
        { status: "success", data: chain("Arc Testnet", { totals: totals({ valueUSD: 100 }) }) },
        { status: "pending" },
      ],
      NETWORKS,
    );
    expect(pending).toEqual(["RISE Testnet"]);
    expect(settled).toHaveLength(1);
    // Crucially NOT in failedChains — we did not fail to read it, we have not
    // finished reading it.
    expect(aggregate(settled).failedChains).toEqual([]);
    expect(aggregate(settled).totals.valueUSD).toBe(100);
  });

  it("treats an ERRORED chain as failed, not pending", () => {
    const { settled, pending } = partitionByStatus(
      [{ status: "error" }, { status: "success", data: chain("RISE Testnet") }],
      NETWORKS,
    );
    expect(pending).toEqual([]);
    expect(aggregate(settled).failedChains).toEqual(["Arc Testnet"]);
  });

  it("treats a settled chain with no data as failed", () => {
    // status success with undefined data should not silently vanish.
    const { settled } = partitionByStatus([{ status: "success" }], ["Arc Testnet"]);
    expect(settled[0]?.failed).toBe(true);
  });

  it("reports every chain pending before anything resolves", () => {
    const { settled, pending } = partitionByStatus(
      [{ status: "pending" }, { status: "pending" }],
      NETWORKS,
    );
    expect(settled).toEqual([]);
    expect(pending).toEqual(NETWORKS);
  });
});
