import { describe, expect, it } from "vitest";
import {
  NATIVE_SENTINEL,
  classifySwap,
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
