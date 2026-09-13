// @vitest-environment jsdom
/**
 * The assembled swap token list, not just the pure helpers.
 *
 * `wrap.test.ts` proves the classification; this proves the wiring actually
 * reaches the list a user picks from. That seam is where the bug lived: every
 * helper could be correct and a native holder would still have nothing to
 * select, because the gateway cannot serve a native asset — it has no contract
 * to index — so the entry has to be synthesised here or it does not exist.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSwapTokens } from "./useLiveSwapTokens";
import { NATIVE_SENTINEL } from "./wrap";

const WETH = "0x008fCD6315c68EbAa31244aea174993f63Ef14D5";

/** The gateway's shape: the wrapped token, mislabelled "ETH" by adminTokenMeta. */
function stubGateway(tokens: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ tokens }) })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("RISE, where native and wrapped are different assets", () => {
  it("adds a native ETH entry and renames the wrapped token to WETH", async () => {
    stubGateway([
      { id: WETH, name: "Wrapped Ether", symbol: "ETH", decimals: 18, priceUSD: 3000 },
      { id: "0xabc", name: "Token", symbol: "TKN", decimals: 18, priceUSD: 5 },
    ]);

    const list = await fetchSwapTokens("RISE Testnet");
    const native = list.find((t) => t.address === NATIVE_SENTINEL);
    const wrapped = list.find((t) => t.address === WETH);

    // Without this the list offered only WETH, and native funds read as zero.
    expect(native).toBeDefined();
    expect(native!.symbol).toBe("ETH");
    // Priced from its 1:1 twin — an unpriced native entry renders as $0.
    expect(native!.priceUsd).toBe(3000);

    // Both cannot be called ETH; the wrapped one is the one that was misnamed.
    expect(wrapped!.symbol).toBe("WETH");

    // Untouched tokens stay untouched.
    expect(list.find((t) => t.address === "0xabc")!.symbol).toBe("TKN");
  });
});

describe("Arc, where the native gas asset IS the listed ERC-20", () => {
  it("adds no native entry, because there is nothing to wrap", async () => {
    stubGateway([
      {
        id: "0x3600000000000000000000000000000000000000",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        priceUSD: 1,
      },
    ]);

    const list = await fetchSwapTokens("Arc Testnet");

    // A second "USDC" here would be the same balance shown twice, and picking
    // one against the other is the swap that cannot exist.
    expect(list.find((t) => t.address === NATIVE_SENTINEL)).toBeUndefined();
    expect(list).toHaveLength(1);
    expect(list[0]!.symbol).toBe("USDC");
  });
});
