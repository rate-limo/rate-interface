import { defineChain } from "viem";

/*
 * `evmNetworks` and its `EvmNetwork` type were deleted on 2026-09-03.
 *
 * The array was AppKit's chain list. AppKit left when the wallet layer became
 * mera + injected (see lib/wallet), and the only reader that outlived it was
 * `getChainIconUrl`, pulling `iconUrls[0]`. Both entries that had one pointed at
 * `pbs.twimg.com` profile images that 404, so that lookup could only ever return
 * a broken URL — and once those were removed it could only return `undefined`.
 *
 * A fallback nothing can fill is not a fallback. Chain marks come from the
 * operator store now (`chainMeta.logoURI`, uploaded through the panel,
 * content-addressed, served from our own origin — see lib/chains/useChainBrand),
 * and a chain with no upload renders its initials.
 *
 * The `defineChain` exports below are unaffected: those are viem chains and are
 * what wagmi actually uses.
 */

export const riseSepolia = /*#__PURE__*/ defineChain({
  id: 11155931,
  name: "RISE Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet.riselabs.xyz/"],
    },
  },
  blockExplorers: {
    etherscan: {
      name: "RiseSepolia Scan",
      url: "https://testnet-explorer.riselabs.xyz",
    },
    default: {
      name: "RiseSepolia Scan",
      url: "https://testnet-explorer.riselabs.xyz",
    },
  },
  testnet: true,
  contracts: {
    multicall3: {
      address: "0x33f6552F37772e42A31d03233812d2dC6afd2f97",
      blockCreated: 457931,
    },
  },
});

export const RiseSepolia = defineChain({
  caipNetworkId: "eip155:11155931",
  chainNamespace: "eip155",
  id: 11155931,
  name: "RISE Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    public: { http: ["https://testnet.riselabs.xyz/"] },
    default: {
      http: ["https://testnet.riselabs.xyz/"],
    },
  },

  blockExplorers: {
    etherscan: {
      name: "RiseSepolia Scan",
      url: "https://testnet-explorer.riselabs.xyz",
    },
    default: {
      name: "RiseSepolia Scan",
      url: "https://testnet-explorer.riselabs.xyz",
    },
  },
  testnet: true,
  contracts: {
    multicall3: {
      address: "0x33f6552F37772e42A31d03233812d2dC6afd2f97",
      blockCreated: 457931,
    },
  },
});

export const Story = defineChain({
  caipNetworkId: "eip155:1514",
  chainNamespace: "eip155",
  id: 1514,
  name: "Story",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: {
    public: { http: ["https://mainnet.storyrpc.io/"] },
    default: {
      http: ["https://mainnet.storyrpc.io/"],
    },
  },
  blockExplorers: {
    etherscan: {
      name: "Oklink Story Scan",
      url: "https://oklink.com/story",
    },
    default: {
      name: "Oklink Story Scan",
      url: "https://oklink.com/story",
    },
  },
  testnet: false,
  contracts: {
    multicall3: {
      address: "0x959245ea66ac26caf38b8eb9d48418c6b7aa621d",
      blockCreated: 877456,
    },
  },
});

/* ────────────────────────── Privy / wagmi chains ──────────────────────────
 * Plain viem chains for the Privy wagmi connector.
 *
 * These replaced a parallel set of CAIP-shaped `appKit*` definitions when Privy
 * replaced Reown AppKit (2026-08-03). Chain data is identical; only the type
 * shape differed, and wagmi's `createConfig({ chains })` takes this one.
 *
 * ORDER MATTERS: chains[0] is the default a new session connects to, so
 * reordering these silently moves every new user onto a different network.
 * customChains.test.ts pins the order against a fixture for that reason.
 */
export const riseTestnet = /*#__PURE__*/ defineChain({
  id: 11155931,
  name: "RISE Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.riselabs.xyz"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.riselabs.xyz/" },
  },
  testnet: true,
  /**
   * Without this, viem refuses EVERY batched read on RISE with
   * `ChainDoesNotSupportContract: Chain "RISE Testnet" does not support contract
   * "multicall3"` — and since this is the definition `createConfig({ chains })`
   * takes, that applied app-wide, not just to one caller.
   *
   * It read as absence rather than as an error: a `multicall` rejects, whatever
   * called it falls into its catch, and the feature renders empty. The quote
   * picker showed no quotes at all this way while the contract was answering
   * fine, which is how it was found.
   *
   * The two sibling RISE definitions above already carried this address. This
   * one — the one that actually reaches wagmi — never did. Verified deployed:
   * `cast code` returns 6.5KB of bytecode, and a multicall against it resolves
   * `enabledQuoteTokens` + symbol + decimals in one round trip.
   */
  contracts: {
    multicall3: {
      address: "0x33f6552F37772e42A31d03233812d2dC6afd2f97",
      blockCreated: 457931,
    },
  },
});

export const somniaTestnet = /*#__PURE__*/ defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.infra.testnet.somnia.network"] } },
  blockExplorers: {
    default: {
      name: "Somnia Testnet Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

export const monadTestnet = /*#__PURE__*/ defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Testnet MON Token", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: {
      name: "Monad Testnet explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

export const megaethTestnet = /*#__PURE__*/ defineChain({
  id: 6343,
  name: "MegaETH Testnet",
  nativeCurrency: { name: "MegaETH Testnet Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://carrot.megaeth.com/rpc"] } },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://testnet-mega.etherscan.io" },
  },
  testnet: true,
});

/**
 * Arc Testnet. Two things here are NOT copy-paste from the chains above.
 *
 * **`nativeCurrency` is USDC at 18 decimals.** Arc's gas asset IS USDC, and the native
 * view is 18 decimals while the USDC ERC-20 at
 * 0x3600000000000000000000000000000000000000 is 6 — the SAME pool of funds through two
 * interfaces, not two assets. Both numbers are correct and neither is a typo for the
 * other. Anything that reads a native balance and an ERC-20 USDC balance and shows both
 * is double-counting one balance; anything that formats the 18-decimal native value with
 * the token list's 6 decimals is off by 10^12.
 *
 * **multicall3 is a GENESIS PREDEPLOY here.** Verified on chain: 3808 bytes of code at
 * block 0, against an archive-capable node (our own engine correctly returns `0x` at
 * block 0 and code at head, so the historical reads are real). Pinned from the first
 * commit deliberately — RISE shipped without this and viem then refused EVERY batched
 * read app-wide with `ChainDoesNotSupportContract`, which reads as empty UI rather than
 * as an error. See the comment on riseTestnet's own contracts block.
 */
export const arcTestnet = /*#__PURE__*/ defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
});

/**
 * Chains exposed by the current web runtime. Keep dormant chain definitions
 * above for historical data decoding, but do not register them with the wallet
 * until they are supported.
 *
 * There is ONE list now. AppKit needed a second, CAIP-2 shaped copy
 * (`appKitNetworks`) that a test had to pin against this one, because a drifted
 * RPC between the two does not crash — the app reads one endpoint while the
 * wallet writes to another. Privy takes plain viem chains, so the copy and the
 * drift it invited are both gone.
 *
 * Arc is at index 0: chains[0] is the network a new session connects to, and
 * AppKit additionally asks the wallet to switch to it on EVERY connection
 * handshake — not merely a first-ever one. While that was RISE, a visitor who
 * opened a page for another chain was silently moved onto RISE at connect, and
 * anything chain-pinned then failed against the wrong network: a launch from
 * /create?chain=arc-testnet reverted, because Arc's USDC quote does not exist
 * on RISE. Arc leads while it is the chain under test.
 */
export const wagmiChains = [arcTestnet, riseTestnet] as const;



/**
 * Multicall3's address on a chain, or null when that chain has none.
 *
 * `lib/portfolio/useBalances.ts` reads NATIVE balance through Multicall3's
 * `getEthBalance` rather than wagmi's `useBalance`, because `useBalance` is not
 * array-driven and a per-chain loop would break the rules of hooks. Turning the
 * native read into an ordinary contract call lets it join the same batched
 * `useReadContracts` as every ERC-20.
 *
 * Returns null rather than throwing: a chain without Multicall3 simply
 * contributes no native row, and the token balances beside it still answer.
 */
export function multicall3For(chainId: number): `0x${string}` | null {
  const chain = wagmiChains.find((c) => c.id === chainId);
  const address = chain?.contracts?.multicall3?.address;
  return address ? (address as `0x${string}`) : null;
}
