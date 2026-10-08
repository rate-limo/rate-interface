import { describe, it, expect } from "vitest";
import {
  bufferGas,
  bufferedGasFor,
  orderGasLimit,
  GAS_PER_MATCH,
  POOL_FALLBACK_GAS,
  MATCH_GAS_RESERVE,
  ORDER_GAS_MULTIPLIER,
  ORDER_TAIL_GAS,
  FIRST_MATCH_GAS,
  orderGasFloor,
} from "./gasBuffer";

describe("bufferGas", () => {
  it("covers the measured empty-book to one-match jump", () => {
    // 240k estimated against an empty book; 373k actually needed once an ask
    // exists. This is the real failure, with the real numbers.
    const estimatedOnEmptyBook = BigInt(240_000);
    const neededWhenItMatches = BigInt(373_367);
    expect(bufferGas(estimatedOnEmptyBook)).toBeGreaterThan(neededWhenItMatches);
  });

  it("doubles by default", () => {
    expect(bufferGas(BigInt(100))).toBe(BigInt(200));
    expect(ORDER_GAS_MULTIPLIER).toBe(BigInt(2));
  });

  it("returns zero for a zero or negative estimate rather than a bogus limit", () => {
    expect(bufferGas(BigInt(0))).toBe(BigInt(0));
    expect(bufferGas(BigInt(-5))).toBe(BigInt(0));
  });

  it("treats a non-positive multiplier as no buffer, never as zero gas", () => {
    expect(bufferGas(BigInt(21_000), BigInt(0))).toBe(BigInt(21_000));
  });
});

describe("bufferedGasFor", () => {
  it("buffers what the estimator returns, when that clears the floor", async () => {
    const client = { estimateContractGas: async () => BigInt(900_000) };
    const expected = orderGasLimit(BigInt(900_000), 1);
    expect(expected).toBeGreaterThan(orderGasFloor(1));
    expect(await bufferedGasFor(client, {}, { maxMatches: 1 })).toBe(expected);
  });

  it("never returns less than the floor, even for a tiny estimate", async () => {
    const client = { estimateContractGas: async () => BigInt(150_000) };
    expect(await bufferedGasFor(client, {})).toBe(orderGasFloor());
  });

  it("passes the sender as `account`, so the node estimates with its allowance", async () => {
    const seen: unknown[] = [];
    const client = {
      estimateContractGas: async (req: never) => {
        seen.push(req);
        return BigInt(400_000);
      },
    };
    const account = "0x00000000000000000000000000000000000000aa" as const;
    await bufferedGasFor(client, { functionName: "marketBuy" }, { account });
    expect(seen[0]).toMatchObject({ functionName: "marketBuy", account });
  });

  it("falls back to the FLOOR when estimation reverts — never to no gas field", async () => {
    // The live failure: estimation ran without `from`, reverted
    // ERC20InsufficientAllowance, and the order went out with the wallet's bare
    // 468,546 against a 500,000 reserve — matched nothing, rested, "succeeded".
    const client = {
      estimateContractGas: async () => {
        throw new Error("execution reverted: ERC20InsufficientAllowance");
      },
    };
    const limit = await bufferedGasFor(client, {}, { maxMatches: 3, poolLeg: true });
    expect(limit).toBe(orderGasFloor(3, true));
    expect(limit).toBeGreaterThan(BigInt(468_546));
    // Enough to clear the reserve AND pay for every level it may cross.
    expect(limit).toBeGreaterThanOrEqual(
      ORDER_TAIL_GAS + BigInt(3) * GAS_PER_MATCH + MATCH_GAS_RESERVE + POOL_FALLBACK_GAS,
    );
  });

  it("returns the floor without a client", async () => {
    expect(await bufferedGasFor(undefined, {}, { maxMatches: 2 })).toBe(orderGasFloor(2));
  });
});

describe("orderGasFloor", () => {
  it("budgets at least one match even for a book it does not cross today", () => {
    expect(orderGasFloor(0)).toBe(orderGasFloor(1));
    expect(orderGasFloor(undefined)).toBe(
      ORDER_TAIL_GAS + FIRST_MATCH_GAS + MATCH_GAS_RESERVE,
    );
  });

  it("adds one marginal level per extra match and the pool leg for a taker", () => {
    expect(orderGasFloor(4) - orderGasFloor(1)).toBe(BigInt(3) * GAS_PER_MATCH);
    expect(orderGasFloor(4, true) - orderGasFloor(4)).toBe(POOL_FALLBACK_GAS);
  });

  it("covers the measured cold tail plus first match", () => {
    // MatchingLib: tail ~353,000; first match 187,229 under isolate.
    expect(ORDER_TAIL_GAS).toBeGreaterThanOrEqual(BigInt(353_000));
    expect(FIRST_MATCH_GAS).toBeGreaterThanOrEqual(BigInt(187_229));
  });
});

describe("orderGasLimit — the bound, not a guess", () => {
  it("covers every level the order could still cross", () => {
    // The engine cannot match more than `n`, so an estimate taken against an
    // empty book plus `n` matches cannot be beaten by depth arriving later.
    const estimatedOnEmptyBook = BigInt(240_000);
    const worstCaseActual = estimatedOnEmptyBook + BigInt(20) * GAS_PER_MATCH;
    expect(orderGasLimit(estimatedOnEmptyBook, 20)).toBeGreaterThanOrEqual(worstCaseActual);
  });

  it("beats the flat multiplier on a sweep, which is the case that failed", () => {
    expect(orderGasLimit(BigInt(240_000), 20)).toBeGreaterThan(bufferGas(BigInt(240_000)));
  });

  it("scales with n, so a small order is not charged for a sweep", () => {
    expect(orderGasLimit(BigInt(240_000), 2)).toBeLessThan(orderGasLimit(BigInt(240_000), 20));
  });

  it("never drops below the multiplier", () => {
    expect(orderGasLimit(BigInt(240_000), 1)).toBe(bufferGas(BigInt(240_000)) + MATCH_GAS_RESERVE);
  });

  it("falls back to the multiplier when n is unknown or nonsense", () => {
    const doubled = bufferGas(BigInt(150_000)) + MATCH_GAS_RESERVE;
    expect(orderGasLimit(BigInt(150_000))).toBe(doubled);
    expect(orderGasLimit(BigInt(150_000), 0)).toBe(doubled);
    expect(orderGasLimit(BigInt(150_000), Number.NaN)).toBe(doubled);
  });

  it("returns zero for a zero estimate", () => {
    expect(orderGasLimit(BigInt(0), 20)).toBe(BigInt(0));
  });
});

describe("the pool leg a taker's remainder may take", () => {
  it("is not budgeted for by default, because limit orders are makers", () => {
    expect(orderGasLimit(BigInt(240_000), 4)).toBe(
      BigInt(240_000) + BigInt(4) * GAS_PER_MATCH + MATCH_GAS_RESERVE,
    );
  });

  it("adds the swap's cost when the order really can reach the pool", () => {
    expect(orderGasLimit(BigInt(240_000), 4, true)).toBe(
      BigInt(240_000) + BigInt(4) * GAS_PER_MATCH + POOL_FALLBACK_GAS + MATCH_GAS_RESERVE,
    );
  });

  it("still adds it when n is unknown and the multiplier is used", () => {
    expect(orderGasLimit(BigInt(150_000), undefined, true)).toBe(
      bufferGas(BigInt(150_000)) + POOL_FALLBACK_GAS + MATCH_GAS_RESERVE,
    );
  });

  it("keeps returning zero for a zero estimate rather than budgeting a pool leg", () => {
    expect(orderGasLimit(BigInt(0), 4, true)).toBe(BigInt(0));
  });
});

describe("the match gas reserve — the halt that is not a revert", () => {
  it("reproduces the exact limit the observed halts were sent with, and clears it", () => {
    // Measured on RISE: 20 sweeps, all `matched=0`, every one sent with
    // gasLimit 328,808 — which is exactly 2 x 164,404, the doubled estimate for
    // an order the book did not currently cross. The engine breaks out of the
    // matching loop while `gasleft() < 300,000`, so that limit could never
    // match a single level however much depth arrived.
    const estimate = BigInt(164_404);
    const whatShipped = bufferGas(estimate);
    expect(whatShipped).toBe(BigInt(328_808));
    expect(whatShipped).toBeLessThan(MATCH_GAS_RESERVE + GAS_PER_MATCH);

    // The fix has to clear the reserve AND leave room for a level on top of it,
    // or it buys a transaction that still matches nothing.
    expect(orderGasLimit(estimate, 0)).toBeGreaterThan(MATCH_GAS_RESERVE + GAS_PER_MATCH);
  });

  it("is budgeted even when the book shows nothing to cross", () => {
    // `gasLevelsFor` returns 0 for a book this order does not cross today, and
    // this is the path every observed halt took. Depth arriving before inclusion
    // is exactly the case the module exists for, so 0 levels must not mean 0
    // reserve.
    expect(orderGasLimit(BigInt(240_000), 0)).toBeGreaterThanOrEqual(
      MATCH_GAS_RESERVE + GAS_PER_MATCH,
    );
  });

  it("leaves the reserve unspent on top of every level it budgets", () => {
    // The reserve is headroom the engine requires to REMAIN, not gas the match
    // consumes, so it has to sit above the per-level cost rather than absorb it.
    for (const n of [1, 4, 20]) {
      expect(orderGasLimit(BigInt(240_000), n)).toBeGreaterThanOrEqual(
        BigInt(240_000) + BigInt(n) * GAS_PER_MATCH + MATCH_GAS_RESERVE,
      );
    }
  });

  it("still refuses to budget anything for a zero estimate", () => {
    expect(orderGasLimit(BigInt(0), 20)).toBe(BigInt(0));
    expect(orderGasLimit(BigInt(0), 0, true)).toBe(BigInt(0));
  });
})

describe("GAS_PER_MATCH is the COLD cost of a matched level", () => {
  /*
   * It was 77,000 until 2026-09-29, from a table measured with Foundry's old
   * `isolate = false` default -- warm, where the calls that build a book leave every
   * slot warm for the call under test. A real transaction has a fresh EIP-2929 access
   * list. Re-measured under `isolate`: a marginal matched level is 104,234.
   *
   * Pinned as a FLOOR rather than an equality: rounding up is free (unused gas is
   * refunded) and rounding down is a silently smaller fill, because the engine's own
   * reserve stops the order before it runs out. So the test guards the direction that
   * costs something.
   */
  const MEASURED_COLD_MARGINAL = BigInt(104_234);

  it("covers the measured cold cost of one more level", () => {
    expect(
      GAS_PER_MATCH,
      `GAS_PER_MATCH is ${GAS_PER_MATCH} but a matched level costs ${MEASURED_COLD_MARGINAL} cold. `
        + "Under-sizing does not revert -- it makes the order come back a smaller partial fill.",
    ).toBeGreaterThanOrEqual(MEASURED_COLD_MARGINAL);
  });

  it("is not so large that the wallet's displayed max fee runs away", () => {
    // The headroom a wallet shows at the engine's own `maxMatches` ceiling of 20.
    const headroomAtMaxMatches = BigInt(20) * GAS_PER_MATCH;
    expect(headroomAtMaxMatches).toBeLessThan(BigInt(3_000_000));
  });
});
