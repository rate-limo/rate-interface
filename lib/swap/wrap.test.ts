import { describe, expect, it } from "vitest";
import {
  NATIVE_SENTINEL,
  classifySwap,
  payChangeClearsAmount,
  wrapQuote,
  correctWrappedSymbol,
  isNativeAddress,
  nativeTokenFor,
} from "./wrap";
import type { SwapToken } from "./types";

const RISE = 11155931;
const ARC = 5042002;
const WETH = "0x008fCD6315c68EbAa31244aea174993f63Ef14D5";
const ARC_USDC = "0x3600000000000000000000000000000000000000";

const token = (address: string, chainId: number, symbol = "TKN"): SwapToken => ({
  symbol,
  name: symbol,
  address,
  decimals: 18,
  chainId,
  priceUsd: 1,
});

const native = (chainId: number) => token(NATIVE_SENTINEL, chainId, "ETH");

describe("isNativeAddress", () => {
  it("matches the sentinel regardless of case", () => {
    expect(isNativeAddress(NATIVE_SENTINEL)).toBe(true);
    expect(isNativeAddress(NATIVE_SENTINEL.toLowerCase())).toBe(true);
    expect(isNativeAddress(WETH)).toBe(false);
  });
});

describe("classifySwap on RISE, where native and wrapped are different assets", () => {
  it("native → WETH is a wrap", () => {
    expect(classifySwap(native(RISE), token(WETH, RISE), RISE)).toBe("wrap");
  });

  it("WETH → native is an unwrap", () => {
    expect(classifySwap(token(WETH, RISE), native(RISE), RISE)).toBe("unwrap");
  });

  it("is case-insensitive about the wrapped address", () => {
    expect(classifySwap(native(RISE), token(WETH.toLowerCase(), RISE), RISE)).toBe("wrap");
  });

  it("native against some other token is a trade, not a wrap", () => {
    // The engine cannot serve a native leg, so claiming a route here would
    // promise an execution path that does not exist.
    expect(classifySwap(native(RISE), token("0xabc", RISE), RISE)).toBe("trade");
  });

  it("two ordinary tokens are a trade", () => {
    expect(classifySwap(token("0xabc", RISE), token("0xdef", RISE), RISE)).toBe("trade");
  });
});

describe("classifySwap on Arc, where the native asset IS the ERC-20", () => {
  it("native → USDC is the same asset, never a wrap", () => {
    // The bug this guards: one balance behind two interfaces. Routing it as a
    // trade is what asked the gateway for USDC/USDC.
    expect(classifySwap(native(ARC), token(ARC_USDC, ARC), ARC)).toBe("same-asset");
  });

  it("USDC → native is the same asset in the other direction", () => {
    expect(classifySwap(token(ARC_USDC, ARC), native(ARC), ARC)).toBe("same-asset");
  });

  it("USDC against a real token is still an ordinary trade", () => {
    expect(classifySwap(token(ARC_USDC, ARC), token("0xabc", ARC), ARC)).toBe("trade");
  });

  it("offers no wrap entry, because there is nothing to wrap", () => {
    expect(nativeTokenFor(ARC, 1)).toBeNull();
  });
});

describe("classifySwap: a token against itself", () => {
  it("is same-asset on any chain", () => {
    expect(classifySwap(token(WETH, RISE), token(WETH, RISE), RISE)).toBe("same-asset");
    expect(classifySwap(token("0xAbC", ARC), token("0xaBc", ARC), ARC)).toBe("same-asset");
  });
});

describe("classifySwap on a chain with no native leg configured", () => {
  it("treats everything as a trade rather than guessing", () => {
    expect(classifySwap(native(999), token(WETH, 999), 999)).toBe("trade");
  });
});

describe("nativeTokenFor", () => {
  it("prices the native entry from its wrapped twin", () => {
    // 1:1 by definition. A native entry with no price renders as $0, which reads
    // as a worthless asset rather than a missing lookup.
    const t = nativeTokenFor(RISE, 4321)!;
    expect(t.symbol).toBe("ETH");
    expect(t.address).toBe(NATIVE_SENTINEL);
    expect(t.priceUsd).toBe(4321);
    expect(t.decimals).toBe(18);
  });
});

describe("correctWrappedSymbol", () => {
  it("renames the mislabelled wrapped token back to WETH", () => {
    // adminTokenMeta had it displaying as ETH, which is the whole reason a
    // native holder expected their balance to appear.
    expect(correctWrappedSymbol(token(WETH, RISE, "ETH")).symbol).toBe("WETH");
  });

  it("leaves every other token alone", () => {
    expect(correctWrappedSymbol(token("0xabc", RISE, "ETH")).symbol).toBe("ETH");
    expect(correctWrappedSymbol(token(ARC_USDC, ARC, "USDC")).symbol).toBe("USDC");
  });

  it("returns the same object when nothing needs changing", () => {
    const t = token(WETH, RISE, "WETH");
    expect(correctWrappedSymbol(t)).toBe(t);
  });
});

describe("payChangeClearsAmount", () => {
  it("clears when the pay token becomes an unrelated one", () => {
    // The ordinary flip: the typed number was denominated in the old token.
    expect(payChangeClearsAmount(token("0xabc", RISE), token("0xdef", RISE), RISE)).toBe(true);
  });

  it("keeps the amount when the token has not actually changed", () => {
    expect(payChangeClearsAmount(token("0xabc", RISE), token("0xABC", RISE), RISE)).toBe(false);
  });

  it("keeps it across Arc's two views of one balance", () => {
    // Native USDC and the ERC-20 at 0x3600… are one pool of funds behind two
    // interfaces. Clearing here would throw away an amount that still means
    // exactly what it meant a moment ago.
    expect(payChangeClearsAmount(native(ARC), token(ARC_USDC, ARC), ARC)).toBe(false);
    expect(payChangeClearsAmount(token(ARC_USDC, ARC), native(ARC), ARC)).toBe(false);
  });

  it("clears on a RISE wrap, where native and wrapped ARE different assets", () => {
    // 1:1, but two balances — the amount was sized against the one being left.
    expect(payChangeClearsAmount(native(RISE), token(WETH, RISE), RISE)).toBe(true);
    expect(payChangeClearsAmount(token(WETH, RISE), native(RISE), RISE)).toBe(true);
  });

  it("clears when Arc's native is paired with anything that is not its ERC-20", () => {
    expect(payChangeClearsAmount(native(ARC), token("0xabc", ARC), ARC)).toBe(true);
  });
});

describe("payChangeClearsAmount across chains", () => {
  it("clears when the pay token re-homes the card, even at the SAME address", () => {
    // The hole this closes: `classifySwap` takes one chainId and compares
    // addresses, so a token deployed at the same address on two chains — which
    // CREATE2 produces routinely — read as `same-asset` and carried the amount
    // across a chain change. That balance is a different balance entirely.
    expect(payChangeClearsAmount(token("0xabc", RISE), token("0xabc", ARC), RISE)).toBe(true);
  });

  it("still clears for an ordinary cross-chain pick", () => {
    expect(payChangeClearsAmount(token("0xabc", RISE), token("0xdef", ARC), RISE)).toBe(true);
  });

  it("does not let the chain check swallow the same-chain exemption", () => {
    // Arc's two views of one balance are on ONE chain and must still survive.
    expect(payChangeClearsAmount(native(ARC), token(ARC_USDC, ARC), ARC)).toBe(false);
  });
});

describe("wrapQuote", () => {
  const eth = { ...native(RISE), priceUsd: 2_000 };
  const weth = { ...token(WETH, RISE), priceUsd: 2_000 };

  it("delivers exactly what was paid, because the contract mints one for one", () => {
    const q = wrapQuote(eth, weth, 1.5);
    expect(q.delivered).toBe(1.5);
    expect(q.amountIn).toBe(1.5);
  });

  it("applies no slippage, because there is no price to slip against", () => {
    // A `minReceived` below the amount would imply a worse fill is possible
    // when none is.
    expect(wrapQuote(eth, weth, 1.5).minReceived).toBe(1.5);
  });

  it("reports zero impact and zero fee as FACTS, not as unknowns", () => {
    const q = wrapQuote(eth, weth, 1.5);
    expect(q.impactPct).toBe(0);
    expect(q.feeUsd).toBe(0);
  });

  it("can never leave a remainder", () => {
    const q = wrapQuote(eth, weth, 1.5);
    expect(q.placedUsd).toBe(0);
    expect(q.placements).toEqual([]);
    // Both sides equal, so the card's fill split reads 100% delivered.
    expect(q.deliveredUsd).toBe(q.payUsd);
  });

  it("prices both legs off the PAY token, which is the same asset", () => {
    // Reading `get.priceUsd` for the receive side would be a second source for
    // one number; `nativeTokenFor` already seeds the native entry from its twin.
    const stale = { ...weth, priceUsd: 1 };
    expect(wrapQuote(eth, stale, 2).deliveredUsd).toBe(4_000);
  });

  it("has no execution path, because a wrap never reaches the router", () => {
    // Fabricating one would put a route into a structure something later could
    // try to send. Callers gate on the KIND instead.
    expect(wrapQuote(eth, weth, 1.5).execution).toBeUndefined();
  });

  it("names both legs in order, so the route row still reads correctly", () => {
    const q = wrapQuote(eth, weth, 1.5);
    expect(q.route).toEqual([eth, weth]);
    // No hop: a wrap is a contract call, not a market.
    expect(q.hops).toEqual([]);
  });

  it("treats a missing or nonsense amount as zero rather than NaN", () => {
    expect(wrapQuote(eth, weth, Number.NaN).delivered).toBe(0);
    expect(wrapQuote(eth, weth, -1).payUsd).toBe(0);
  });
});
