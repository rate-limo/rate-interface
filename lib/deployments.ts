import {
  findChain,
  findMissingChain,
  type ChainConfig,
  type ContractName,
} from "@iter/deployments";

/**
 * Contract addresses for the connected chain, from `@iter/deployments` only.
 *
 * The token list is NOT consulted for addresses. Its RISE entry names a pre-swap-support
 * MatchingEngine whose `swapRouter()` reverts, and its Monad and MegaETH entries point at
 * addresses with no code at all (eth_getCode `0x`, nonce 0, balance 0). Monad is in
 * `supportedChains`, so reading the list here would put a live trading route on a contract
 * that does not exist.
 *
 * Returning `undefined` for an unregistered chain is intentional: the UI already handles a
 * missing engine by disabling actions, which is the correct outcome for a chain we cannot
 * address. Use `chainIsUnavailable` to explain it rather than showing a bare disabled state.
 *
 * Accepts a network name (`"RISE Testnet"`, as the providers carry it) or a numeric chain
 * id, and tolerates loose formatting on the name.
 */
export function contractAddress(
  network: string | number | undefined,
  contract: ContractName,
): `0x${string}` | undefined {
  if (network === undefined) return undefined;
  return findChain(network)?.contracts?.[contract]?.address;
}

export function matchingEngineAddress(network: string | number | undefined) {
  return contractAddress(network, "matchingEngine");
}

/** Legacy engines use the original seven-argument order entrypoints. */
export function matchingEngineSupportsDeadlines(network: string | number | undefined): boolean {
  if (network === undefined) return false;
  return findChain(network)?.contracts?.matchingEngine?.abiVersion === "deadline-v1";
}

export function swapRouterAddress(network: string | number | undefined) {
  return contractAddress(network, "swapRouter");
}

/**
 * The WETH the engine wraps native value into. `createOrder`'s ETH path has no
 * separate `*ETH` entry point — paying/receiving native ETH means passing this
 * address as `base` or `quote` and sending the matching amount as `value`, per
 * `packages/deployments/deployments.json`'s own `weth` entry (verified to have
 * code before being recorded — see that file's README). Same registry, same
 * per-chain resolution as `matchingEngineAddress`.
 */
export function wethAddress(network: string | number | undefined) {
  return contractAddress(network, "weth");
}

export function positionManagerAddress(network: string | number | undefined) {
  return contractAddress(network, "positionManager");
}

export function poolFactoryAddress(network: string | number | undefined) {
  return contractAddress(network, "poolFactory");
}

/** True when this chain has a pool/swap deployment, i.e. the swap card can route at all. */
export function hasSwapSystem(network: string | number | undefined): boolean {
  if (network === undefined) return false;
  const c = findChain(network)?.contracts;
  return Boolean(c?.poolFactory?.address && c?.swapRouter?.address);
}

/**
 * Why a chain cannot be traded on, when that is knowable. `"missing-deployment"` means the
 * contracts were never deployed there despite the token list claiming otherwise —
 * distinguishable from simply not being configured, so the UI can say which.
 */
export function chainIsUnavailable(
  network: string | number | undefined,
): "missing-deployment" | "unregistered" | undefined {
  if (network === undefined) return undefined;
  if (findChain(network)) return undefined;
  return findMissingChain(network) ? "missing-deployment" : "unregistered";
}

/**
 * On-chain economic config for the connected chain, when known.
 *
 * `matchedPriceReporting` is the one worth reading before building UI on top of a "last
 * traded price": when it is false the pair's recorded price is the spread rail rather than
 * a price anyone traded at, so labelling it "last trade" would be wrong.
 */
export function deploymentConfig(
  network: string | number | undefined,
): ChainConfig | undefined {
  if (network === undefined) return undefined;
  return findChain(network)?.config;
}
