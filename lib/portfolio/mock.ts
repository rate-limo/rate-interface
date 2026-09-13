import type { ChainBalances, IndexerData } from "./types";

/**
 * MOCK portfolio data — illustrative until wired to real multicall + indexer.
 * Values mirror the approved portfolio artifact. Cross-chain: RISE + Monad.
 * See apps/web/CLAUDE.md ("Portfolio page").
 */

// Categorical colour per chain / token (dark-surface tuned), for dots & avatars.
const CHAIN_COLOR: Record<string, string> = {
  "RISE Testnet": "#d55181",
  "Monad Testnet": "#3987e5",
};
const TOKEN_COLOR: Record<string, string> = {
  ETH: "#3987e5",
  WBTC: "#c98500",
  USDC: "#2ba563",
  USDT: "#2ba563",
  MON: "#3987e5",
  // Launched tokens carry their own hue so the avatar reads as an identity even
  // while the gateway is still serving the "alts" placeholder logo.
  NOVA: "#7a4fd0",
  GRID: "#3987e5",
  HALO: "#c98500",
};
export function chainColor(network: string): string {
  return CHAIN_COLOR[network] ?? "#5F93D6";
}
export function tokenColor(symbol: string): string {
  return TOKEN_COLOR[symbol] ?? "#5F93D6";
}
export function chainShort(network: string): string {
  return network.replace(/\s*Testnet$/, "");
}

/** The balances snapshot each chain resolves to when its RPC read succeeds. */
export function balanceSnapshot(): ChainBalances[] {
  return [
    {
      network: "RISE Testnet",
      slug: "rise-testnet",
      state: "ok",
      updatedAgo: "12s ago",
      totalUsd: 6127,
      tokens: [
        { symbol: "ETH", name: "Ether", amount: "0.90", usdValue: 1472 },
        { symbol: "WBTC", name: "Wrapped Bitcoin", amount: "0.05", usdValue: 4115 },
        { symbol: "USDC", name: "USD Coin", amount: "540.00", usdValue: 540 },
      ],
    },
    {
      network: "Monad Testnet",
      slug: "monad-testnet",
      state: "ok",
      updatedAgo: "12s ago",
      totalUsd: 2700,
      tokens: [
        { symbol: "MON", name: "Monad", amount: "1,200", usdValue: 2400 },
        { symbol: "USDC", name: "USD Coin", amount: "300.00", usdValue: 300 },
      ],
    },
  ];
}

const RISE = "RISE Testnet";
const MONAD = "Monad Testnet";

export function indexerData(): IndexerData {
  return {
    // A dormant stop is the only one that is still cancellable AS a stop; once it
    // activates it is an ordinary book order and is managed through
    // MatchingEngine.cancelOrder. Both shapes are here so the table's two states
    // are representable -- they were empty arrays, which made the stop tab the one
    // view no fixture could exercise.
    stopOrders: [
      {
        orderId: 12,
        pairAddress: "0x14357De34Cd0c7Aa81CB888bCB2ebE46333bcA60",
        baseAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        quoteAddress: "0x3600000000000000000000000000000000000000",
        market: { base: "ETH", quote: "USDC", network: RISE },
        side: "Sell",
        kind: "Stop-limit",
        triggerPrice: "1,520.00",
        limitPrice: "1,505.00",
        amount: "2.5 ETH",
        deadline: 0,
        status: "Open",
        regularOrderId: null,
      },
    ],
    stopOrderHistory: [
      {
        orderId: 7,
        pairAddress: "0x14357De34Cd0c7Aa81CB888bCB2ebE46333bcA60",
        baseAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        quoteAddress: "0x3600000000000000000000000000000000000000",
        market: { base: "ETH", quote: "USDC", network: RISE },
        side: "Buy",
        kind: "Stop-limit",
        triggerPrice: "1,700.00",
        // Where it ACTUALLY rests, which the rail may have clamped below the price
        // it was placed with -- the broker overwrites this on activation.
        limitPrice: "1,712.40",
        amount: "3,400 USDC",
        deadline: 0,
        status: "Activated",
        regularOrderId: 42,
      },
      {
        orderId: 9,
        pairAddress: "0x14357De34Cd0c7Aa81CB888bCB2ebE46333bcA60",
        baseAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        quoteAddress: "0x3600000000000000000000000000000000000000",
        market: { base: "MON", quote: "USDC", network: MONAD },
        side: "Sell",
        kind: "Stop-market",
        triggerPrice: "1.80",
        limitPrice: "0.00",
        amount: "900 MON",
        deadline: 0,
        status: "Canceled",
        regularOrderId: null,
      },
    ],
    summary: {
      netWorthUsd: 32206,
      availableUsd: 8827,
      inOrdersUsd: 15379,
      inLpUsd: 8000,
      rewardsClaimablePts: 13900,
    },
    orders: [
      { market: { base: "ETH", quote: "USDC", network: RISE }, side: "Buy", price: "1,635.11", amount: "14,383 USDC", filledPct: 0, status: "Open", fromSwap: true },
      { market: { base: "MON", quote: "USDC", network: MONAD }, side: "Sell", price: "2.05", amount: "480 MON", filledPct: 40, status: "Partial" },
    ],
    lps: [
      { market: { base: "USDC", quote: "ETH", network: RISE }, provided: "8,000 USDC", aprPct: 14, feesEarnedUsd: 3.2, inRange: true, singleSided: true, fromSwap: true },
    ],
    trades: [
      { kind: "order", market: { base: "WBTC", quote: "USDC", network: RISE }, side: "Buy", price: "82,300", amount: "0.05", valueUsd: "4,115", time: "12:04", txHash: "0x9a3f…4b21", fills: 3, origins: { pool: 2, maker: 1 } },
      { kind: "order", market: { base: "MON", quote: "USDC", network: MONAD }, side: "Buy", price: "2.03", amount: "1,200", valueUsd: "2,436", time: "11:58", txHash: "0x77c1…9e02", fills: 1, origins: { pool: 0, maker: 1 } },
      { kind: "order", market: { base: "ETH", quote: "USDC", network: RISE }, side: "Sell", price: "1,637", amount: "0.30", valueUsd: "491", time: "11:50", txHash: "0x51a7…c4e9", fills: 1, origins: { pool: 1, maker: 0 } },
    ],
    history: [
      { market: { base: "ETH", quote: "USDC", network: RISE }, type: "Limit", side: "Buy", price: "1,635", size: "14,383 USDC", status: "Open", time: "now" },
      { market: { base: "WBTC", quote: "USDC", network: RISE }, type: "Market", side: "Buy", price: "82,306", size: "0.05", status: "Filled", time: "12:04" },
      { market: { base: "MON", quote: "USDC", network: MONAD }, type: "Market", side: "Buy", price: "2.03", size: "1,200", status: "Filled", time: "11:58" },
      { market: { base: "ETH", quote: "USDC", network: RISE }, type: "Limit", side: "Sell", price: "1,700", size: "0.10", status: "Canceled", time: "Jul 24" },
    ],
    rewards: {
      summary: { earnedPts: 18340, claimablePts: 13900, epochPts: 6200, epoch: 3 },
      rows: [
        { source: "Trading rewards", network: RISE, earnedPts: 9800, epoch: 3, status: "Claimable" },
        { source: "Maker rebates", network: MONAD, earnedPts: 2600, epoch: 3, status: "Claimable" },
        { source: "Referral bonus", network: null, earnedPts: 1500, epoch: 3, status: "Claimable" },
        { source: "LP incentives", network: RISE, earnedPts: 3200, epoch: 3, status: "Accruing" },
        { source: "Trading rewards", network: RISE, earnedPts: 1240, epoch: 2, status: "Claimed" },
      ],
    },
    referrals: {
      // No `tier` — there never was one. The accrual has a flat cut plus a
      // capped per-attested-referee boost (tEarnConfig), and "Tier 2 · 15%" was
      // a rank the broker has no concept of. These mirror the schema defaults
      // so the mock looks like a plausible live wallet.
      summary: {
        code: "HYUNGSU",
        link: "iter.cx/r/HYUNGSU",
        referred: 8,
        active: 5,
        earnedPts: 2300,
        cutPct: 5,
        boostPct: 3,
        maxBoostPct: 30,
      },
      rows: [
        { friend: "0x9c…12", network: RISE, joined: "Jul 20", theirVolumeUsd: "48,200", earnedPts: 720, status: "Active" },
        { friend: "0x3a…f4", network: MONAD, joined: "Jul 22", theirVolumeUsd: "12,400", earnedPts: 310, status: "Active" },
        { friend: "0x77…9e", network: RISE, joined: "Jul 23", theirVolumeUsd: "4,100", earnedPts: 90, status: "Active" },
        { friend: "0x51…c4", network: null, joined: "Jul 24", theirVolumeUsd: "0", earnedPts: 0, status: "Joined" },
      ],
    },
    /* Tokens this wallet launched. Illustrative in a way the others are not:
       nothing onchain records who deployed what yet (adminTokenMeta has no
       ownerAddress column and there is no token factory), so this array has no
       live counterpart to fall back to — see apps/web/CLAUDE.md. metaClaimed is
       false on every row on purpose; the server only accepts the operator key. */
    creator: [
      {
        symbol: "NOVA", name: "Nova Protocol",
        address: "0x8Fd2A1c5B7e3D40912Ab6F8c11d4E7a09B3c19aC", network: RISE,
        quote: "USDC", rate: "0.0412", change24hPct: 18.4, marketCapUsd: 4_120_000,
        holders: 312, volume24hUsd: 84210,
        totalSupply: "100,000,000", poolAmount: "42,000,000", creatorAmount: "58,000,000", poolPct: 42,
        soldAmount: "7,180,000", soldPct: 17,
        inRange: true, rangeLow: "0.0400", rangeHigh: "0.1200", feeTierPct: 0.3,
        feesEarnedUsd: 126.4, seededUsd: 11400,
        deployedAt: "26 Jul 2026 · 14:02", age: "6d", txHash: "0x4c1e…8a70",
        logoPending: false, metaClaimed: false,
        contractMarketCapUsd: 4_050_000, graduationUsd: 69_420, feeGraduated: true, takerFeeNum: 300_000, maxCreatorTakerFeeNum: 1_000_000, creatorFeeLocked: false,
        pairId: "0x7f3a1c9d0e5b2a48f6c3d19e740b52ac8d61f309", quoteTvlUsd: 104_900,
        thresholdUsd: 100_000, graduatedAt: null, graduatedAtQuoteTvlUsd: null,
      },
      {
        symbol: "GRID", name: "Gridpoint",
        address: "0x2b91E7Ac4D8f05C361aB7e29d0F4b8C6135aE704", network: MONAD,
        quote: "USDC", rate: "0.0085", change24hPct: -4.2, marketCapUsd: 850_000,
        holders: 47, volume24hUsd: 3912,
        totalSupply: "100,000,000", poolAmount: "30,000,000", creatorAmount: "70,000,000", poolPct: 30,
        soldAmount: "1,240,000", soldPct: 4,
        inRange: false, rangeLow: "0.0090", rangeHigh: "0.0400", feeTierPct: 0.3,
        feesEarnedUsd: 4.1, seededUsd: 3050,
        deployedAt: "30 Jul 2026 · 09:41", age: "2d", txHash: "0x77c1…9e02",
        logoPending: true, metaClaimed: false,
        contractMarketCapUsd: 41_000, graduationUsd: 69_420, feeGraduated: false, takerFeeNum: 1_000_000, maxCreatorTakerFeeNum: 1_000_000, creatorFeeLocked: false,
        pairId: "0x22b8f47e10c95a3d8b6e027f4a1c93d5e08b7420", quoteTvlUsd: 41_200,
        thresholdUsd: 100_000, graduatedAt: null, graduatedAtQuoteTvlUsd: null,
      },
      {
        symbol: "HALO", name: "Halo Index",
        address: "0xC0a4F19b3E7d825610Ab4c9F71d3E80526bA1f38", network: RISE,
        quote: "USDC", rate: "0.0500", change24hPct: null, marketCapUsd: 2_500_000,
        holders: 3, volume24hUsd: 180,
        totalSupply: "50,000,000", poolAmount: "7,500,000", creatorAmount: "42,500,000", poolPct: 15,
        soldAmount: "36,000", soldPct: 0,
        inRange: true, rangeLow: "0.0500", rangeHigh: "0.2000", feeTierPct: 1,
        feesEarnedUsd: 0, seededUsd: 150,
        deployedAt: "1 Aug 2026 · 11:12", age: "11m", txHash: "0x51a7…c4e9",
        logoPending: true, metaClaimed: false,
        contractMarketCapUsd: null, graduationUsd: 69_420, feeGraduated: false, takerFeeNum: 250_000, maxCreatorTakerFeeNum: 1_000_000, creatorFeeLocked: true,
        pairId: "0xa4f0e28b671c9d35082fae4b17c60d9538e2b16c", quoteTvlUsd: 83_100,
        thresholdUsd: 100_000, graduatedAt: 1_785_398_400, graduatedAtQuoteTvlUsd: 101_400,
      },
    ],
  };
}
