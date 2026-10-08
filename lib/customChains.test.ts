import { describe, it, expect } from "vitest";
import { wagmiChains } from "./customChains";

/**
 * The chains wagmi is configured with, pinned against a literal fixture.
 *
 * Only actively supported chains belong here. Dormant definitions may remain
 * in customChains.ts for historical decoding, but must not surface in wallets.
 */
const EXPECTED = [
  {
    // symbol USDC and decimals 18: Arc's gas asset is USDC, and the 18 here is the
    // NATIVE view. The USDC ERC-20 is 6 decimals; both are the same funds. The
    // decimals assertion below is what stops the 6 leaking into this definition.
    id: 5042002,
    name: "Arc Testnet",
    symbol: "USDC",
    rpc: "https://rpc.testnet.arc.network",
  },
  {
    id: 11155931,
    name: "RISE Testnet",
    symbol: "ETH",
    rpc: "https://testnet.riselabs.xyz",
  },
  {
    id: 10143,
    name: "Monad Testnet",
    symbol: "MON",
    rpc: "https://testnet-rpc.monad.xyz",
  },
  {
    id: 46630,
    name: "Robinhood Chain Testnet",
    symbol: "ETH",
    rpc: "https://rpc.testnet.chain.robinhood.com",
  },
  {
    // No gas coin: "USD" is viem's placeholder for Tempo's fee-token model.
    id: 42431,
    name: "Tempo Testnet",
    symbol: "USD",
    rpc: "https://rpc.moderato.tempo.xyz",
    // viem's own value for the placeholder; nothing on Tempo is paid in it.
    decimals: 6,
  },
] as const;

describe("wagmi chains", () => {
  it("are exactly the expected chains, in order", () => {
    // Order is load-bearing: chains[0] is the default a new session connects to.
    expect(wagmiChains.map((c) => c.id)).toEqual(EXPECTED.map((c) => c.id));
  });

  it("carry the right name, native symbol and RPC", () => {
    for (const [i, chain] of wagmiChains.entries()) {
      const want = EXPECTED[i]!;
      expect(chain.name, `chain ${chain.id} name`).toBe(want.name);
      expect(chain.nativeCurrency.symbol, `chain ${chain.id} symbol`).toBe(want.symbol);
      expect(chain.nativeCurrency.decimals, `chain ${chain.id} decimals`).toBe(
        "decimals" in want ? want.decimals : 18,
      );
      expect(chain.rpcUrls.default.http[0], `chain ${chain.id} rpc`).toBe(want.rpc);
    }
  });

  it("marks every configured chain as a testnet", () => {
    // Every supported chain today is a testnet. When the first mainnet lands
    // this should fail and be updated deliberately — a mainnet slipping in
    // unnoticed is how real funds reach a testnet-shaped code path.
    for (const c of wagmiChains) expect(c.testnet, `chain ${c.id}`).toBe(true);
  });

  it("has no duplicate chain IDs", () => {
    const ids = wagmiChains.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
