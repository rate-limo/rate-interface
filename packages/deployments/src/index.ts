import registry from "../deployments.json";

/**
 * Single source of truth for deployed contract addresses across the monorepo.
 *
 * Before this, addresses arrived three different ways: the indexer resolved the matching
 * engine through `@iter/token-list` but took the swap-side addresses from
 * loose env vars, web read the token list directly, and nothing recorded a start block for
 * the swap contracts at all. That meant a chain could be half-described — engine known,
 * router unknown — with nothing to detect it.
 *
 * Addresses are checksummed and `startBlock` is stored PER CONTRACT rather than per chain.
 * That is not over-engineering: the swap system can be deployed long after the exchange on
 * the same chain (which is what happened on RISE), and an indexer that starts every
 * contract from the earliest block re-scans history the later ones did not exist for.
 */

/**
 * Every contract a chain may record, as DATA rather than only as a type.
 *
 * `ContractName` is derived from it below, so the two cannot drift — which
 * matters because callers now validate operator input against this list
 * (`POST /api/chains/:chainId/contracts`). A hand-maintained second copy would
 * eventually accept a name the type rejects, or reject one it allows.
 */
export const CONTRACT_NAMES = [
  "matchingEngine",
  "stopOrderEngine",
  "orderbookFactory",
  "poolFactory",
  "positionManager",
  "swapRouter",
  "poolImplementation",
  "assetGenerator",
  "presaleLaunch",
  "bandPoolFactory",
  "weth",
  /**
   * EIP-7702 delegate. An account authorizes it so several transfers land in
   * ONE transaction — see contracts/src/wallet/BatchExecutor.sol.
   *
   * Unlike every other name here it is neither indexed nor called by another
   * contract: nothing holds its address on chain, and the engine has never
   * heard of it. It is in the registry so apps/web can resolve it per chain
   * the way it resolves everything else, rather than growing a second
   * address-configuration mechanism.
   *
   * It has no zero-argument view, so a chain audit reports it `unprobeable`
   * — the same as `swapRouter`, and for the same reason.
   */
  "batchExecutor",
  /**
   * Batch ERC-20 payout: `disperseToken(token, recipients[], amounts[])`,
   * pulling from the caller with transferFrom. Used by apps/admin to pay a
   * closed season's ITER. Protocol infrastructure, so it lives here; the ITER
   * token itself is a multichain ASSET and resolves through identity-service's
   * catalog instead (admin-service `resolveRewardToken`).
   *
   * Like `batchExecutor`, nothing indexes it or holds its address on chain.
   */
  "disperse",
  /**
   * Role-less helper behind the app's Buy/Sell on a launch ladder: one call sends
   * up to five taker orders, one per ladder step, and returns whatever cannot fill.
   * Holds nothing; nothing indexes it (fills are the engine's own events).
   */
  "ladderBuyer",
  /**
   * The gas coin as a plain 1:1 ERC-20 (WrappedNative), for launches quoted in the
   * gas coin. NOT the engine's WETH: on an unwrapping chain that one gets no band
   * pool and settles as native coin. Absent on chains whose gas coin is already an
   * ERC-20 (Arc).
   */
  "wrappedNative",
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export interface ContractDeployment {
  address: `0x${string}`;
  startBlock: number;
  /** Selects the callable surface for deployments whose external API changed. */
  abiVersion?: "legacy" | "deadline-v1";
  comment?: string;
}

export interface ChainConfig {
  /** DENOM-scaled at 1e8. Taker-side bound on how far one swap may move the price. */
  marketSpread: number;
  /** DENOM-scaled at 1e8. Bound applied to orders that can rest. */
  limitSpread: number;
  /**
   * Whether `lmp` actually holds the price a pool swap traded at. False when
   * `marketSpread` is narrower than the LP slippage tiers in use, because the rail then
   * clamps every fill and records itself instead. Consumers that display "last traded
   * price" should read this before claiming the number means that.
   */
  matchedPriceReporting: boolean;
  matchedPriceReportingNote?: string;
  /**
   * Measured seconds per block. Relevant because the swap spread rail is anchored per
   * BLOCK, so the same spread bounds price movement differently depending on how fast the
   * chain produces blocks.
   */
  blockTimeSeconds?: number;
  blockTimeNote?: string;
  makerFee?: number;
  takerFee?: number;
  poolFeeShare?: number;
  /**
   * Launch quote tokens that exist only for testing — the mock quote
   * `verify:backend` graduates coins against. Written by the verify run when it
   * deploys the mock; the app's launch picker hides every address listed here,
   * and the admin Launch quotes page labels them "test". Lower-case or checksum,
   * compared case-insensitively.
   */
  testQuoteTokens?: `0x${string}`[];
  testQuoteTokensNote?: string;
}

export interface ChainGeneration {
  /** Why this generation was retired, for the benefit of whoever reads it next. */
  reason: string;
  /** Only the contracts that existed in that generation. */
  contracts: Partial<Record<ContractName, ContractDeployment & { endBlock?: number }>>;
}

/**
 * A chain the legacy token list claims a matching engine for, where the address has no
 * code on the live chain. Kept so the discrepancy stays visible rather than being
 * rediscovered, and so `getChain` can fail with a specific reason instead of "unknown".
 */
export interface MissingChain {
  name: string;
  chainId: number;
  tokenListClaims: { matchingEngine: string; startBlock: number };
  finding: string;
  severity: "high" | "low";
  severityReason: string;
}

export interface ChainDeployment {
  name: string;
  chainId: number;
  testnet: boolean;
  rpcUrls: string[];
  blockExplorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  contracts: Record<ContractName, ContractDeployment>;
  /** Superseded deployments still live on chain, newest-retired first. */
  previous?: ChainGeneration[];
  config: ChainConfig;
  deployment: {
    script: string;
    deployedAtBlock: number;
    deployedAt: string;
    feeTo: `0x${string}`;
    verifiedOnChain: boolean;
  };
}

type RawChains = Record<string, unknown>;

const chains = (registry as { chains: RawChains }).chains;
const missing = (registry as { missing?: RawChains }).missing ?? {};

/** Chains recorded as claimed-but-absent. See MissingChain. */
export function listMissingChains(): MissingChain[] {
  return Object.entries(missing)
    .filter(([k]) => !k.startsWith("$"))
    .map(([, v]) => v as MissingChain)
    .sort((a, b) => a.chainId - b.chainId);
}

export function findMissingChain(idOrName: number | string): MissingChain | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const target = norm(String(idOrName));
  return listMissingChains().find(
    (m) => String(m.chainId) === String(idOrName) || norm(m.name) === target,
  );
}

/** Every chain in the registry, ascending by chain id. */
export function listChains(): ChainDeployment[] {
  return Object.entries(chains)
    .filter(([k]) => !k.startsWith("$"))
    .map(([, c]) => c as ChainDeployment)
    .sort((a, b) => a.chainId - b.chainId);
}

/**
 * Accepts a chain id (number or numeric string) or a chain name. Name matching is
 * case- and separator-insensitive so `RISE Testnet`, `rise-testnet` and `rise_testnet`
 * all resolve — the indexer's NETWORKNAME env and the web chain list do not agree on
 * formatting, and a lookup that silently misses is worse than one that normalises.
 */
export function findChain(idOrName: number | string): ChainDeployment | undefined {
  const direct = chains[String(idOrName)];
  if (direct) return direct as ChainDeployment;

  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const target = norm(String(idOrName));
  return listChains().find((c) => norm(c.name) === target);
}

/** Throwing form. The error names what is available, because a typo here is otherwise silent. */
export function getChain(idOrName: number | string): ChainDeployment {
  const found = findChain(idOrName);
  if (found) return found;

  // A chain we know is broken should say so, rather than reading as a typo.
  const absent = findMissingChain(idOrName);
  if (absent) {
    throw new Error(
      `${absent.name} (${absent.chainId}) has no usable deployment: ${absent.finding} ` +
        `The legacy token list claims ${absent.tokenListClaims.matchingEngine}, which is why ` +
        `this must not resolve. Deploy the contracts and add the chain to deployments.json.`,
    );
  }

  const known = listChains()
    .map((c) => `${c.chainId} (${c.name})`)
    .join(", ");
  throw new Error(
    `No deployment for "${idOrName}" in @iter/deployments. Known chains: ${known || "none"}`,
  );
}

export function tryGetContract(
  idOrName: number | string,
  contract: ContractName,
): ContractDeployment | undefined {
  return findChain(idOrName)?.contracts?.[contract];
}

export function getContract(
  idOrName: number | string,
  contract: ContractName,
): ContractDeployment {
  const chain = getChain(idOrName);
  const entry = chain.contracts?.[contract];
  if (!entry?.address) {
    const present = Object.keys(chain.contracts ?? {}).join(", ");
    throw new Error(
      `"${contract}" is not deployed on ${chain.name} (${chain.chainId}). Present: ${present || "none"}`,
    );
  }
  return entry;
}

export function getAddress(
  idOrName: number | string,
  contract: ContractName,
): `0x${string}` {
  return getContract(idOrName, contract).address;
}

/**
 * Lowest start block across the named contracts, for callers that genuinely need one
 * number (a backfill cursor, say). Defaults to every contract on the chain.
 */
export function earliestStartBlock(
  idOrName: number | string,
  contracts?: ContractName[],
): number {
  const chain = getChain(idOrName);
  const names = (contracts ?? (Object.keys(chain.contracts) as ContractName[])).filter(
    (n) => chain.contracts[n]?.address,
  );
  if (names.length === 0) {
    throw new Error(`No deployed contracts to derive a start block from on ${chain.name}`);
  }
  return Math.min(...names.map((n) => chain.contracts[n].startBlock));
}

/**
 * Superseded deployments for a chain. An indexer that needs history from before a
 * migration has to watch these too — their events are the only record of it.
 */
export function previousGenerations(idOrName: number | string): ChainGeneration[] {
  return findChain(idOrName)?.previous ?? [];
}

/** Test-only launch quote tokens for a chain (see `ChainConfig.testQuoteTokens`). */
export function testQuoteTokens(idOrName: number | string): readonly `0x${string}`[] {
  return findChain(idOrName)?.config?.testQuoteTokens ?? [];
}

/** Whether `address` is a test-only launch quote on that chain. */
export function isTestQuoteToken(idOrName: number | string, address: string): boolean {
  const a = address.toLowerCase();
  return testQuoteTokens(idOrName).some((t) => t.toLowerCase() === a);
}

/** True when the swap system is present and wired enough to index. */
export function hasSwapSystem(idOrName: number | string): boolean {
  const chain = findChain(idOrName);
  if (!chain) return false;
  return Boolean(
    chain.contracts?.poolFactory?.address &&
      chain.contracts?.positionManager?.address &&
      chain.contracts?.swapRouter?.address,
  );
}

/**
 * The chains the app actively serves — the rollout allowlist.
 *
 * This is deliberately NOT derived from the registry. Being in `chains` means "we have
 * verified addresses for it", which is a weaker claim than "we serve trading on it":
 * Somnia Testnet and Ink Sepolia both have a verified matching engine and neither has a
 * gateway, so deriving this would put dead entries in the chain switcher.
 *
 * It lives here rather than in apps/web because it is a property of the deployment, not
 * of one frontend — the switcher, gateway preconnect, search fan-out and the ticker tape
 * all iterate it, and the admin surfaces will need the same answer. A second copy is how
 * a chain ends up served in one place and absent in another.
 *
 * Monad Testnet was once listed with a matching engine that had never been deployed
 * (`0x` from eth_getCode). It was redeployed for real on 2026-10-02 and returned here
 * the same day, together with Robinhood Chain Testnet, in the order below: contracts
 * verified by verify.mjs, gateways answering (200 on gateway-api-monad/-robinhood, a
 * real websocket CONNECTED on gateway-ws-monad/-robinhood), then this line.
 *
 * To add a chain: deploy its stack, record it in deployments.json, give it PonderLinks /
 * PonderWssLinks entries in the frontend, then add its network name here. Arc Testnet
 * was added on 2026-08-27 in exactly that order — the gateways at
 * gateway-api-arc / gateway-ws-arc answered (200, and a real 101 upgrade on /ws) before
 * this line changed, which is the check that distinguishes it from the Monad entry.
 *
 * Tempo Testnet (2026-10-07) followed the same order, with one Tempo-only step: the
 * indexer needs the ponder patch in patches/ (Tempo's 0x76 transactions carry `calls`,
 * not `to`, and stock ponder refuses every block containing one).
 */
export const SUPPORTED_CHAINS: readonly string[] = [
  "RISE Testnet",
  "Arc Testnet",
  "Monad Testnet",
  "Robinhood Chain Testnet",
  "Tempo Testnet",
];

/**
 * Whether the app SHOWS a chain, given an operator's stored override.
 *
 * `null`/`undefined` means "no decision" and falls back to `SUPPORTED_CHAINS` —
 * which is what keeps adding a chain to the rollout a ONE-step act rather than
 * two. Lives here rather than in a service because both identity-service (which
 * owns the flag) and any reader must agree on the fallback, and a second copy
 * is how they would eventually disagree about what a null means.
 */
export function resolveChainDisplay(
  chainId: number,
  flag: boolean | null | undefined,
): boolean {
  if (flag === true || flag === false) return flag;
  return isSupportedChain(chainId);
}

/** True when the app actively serves this chain. Accepts a name or a numeric chain id. */
export function isSupportedChain(idOrName: number | string): boolean {
  const chain = findChain(idOrName);
  if (!chain) return false;
  return SUPPORTED_CHAINS.includes(chain.name);
}

export { registry as deployments };
