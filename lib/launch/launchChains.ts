import { findChain, SUPPORTED_CHAINS, tryGetContract } from "@iter/deployments";
import { networkNameToSlug } from "@/consts";

/**
 * The chains a token can actually be launched on, for the Network field in
 * step 1 of both flows.
 *
 * A served chain is not automatically a launchable one: `AssetGenerator` is
 * what `execution.submit` calls, and four of the six chains in the registry
 * carry it. A chain without one is not offered — picking it would reach
 * `getDeployedAddress(chainId, "assetGenerator")` and throw on an address that
 * does not exist, after the creator had filled in the whole form.
 *
 * Read through `tryGetContract` rather than by rescanning deployments.json:
 * addresses, ABIs and start blocks come from the shared package, and a second
 * reader of that file is how the two come to disagree.
 *
 * `SUPPORTED_CHAINS` is the order the venue serves them in, and it is kept —
 * a launch picker that sorts differently from every other chain list on the
 * site is a difference the creator has to reconcile for no reason.
 */
export interface LaunchChain {
  /** The URL slug, which is what the flows pass to `execution.*`. */
  slug: string;
  /** The registry's display name, e.g. "RISE Testnet". */
  name: string;
  chainId: number;
}

export function launchChains(): LaunchChain[] {
  const chains: LaunchChain[] = [];
  for (const name of SUPPORTED_CHAINS) {
    // `tryGetContract` answers whether the generator exists; the chain id lives
    // on the chain, not on the contract entry.
    if (!tryGetContract(name, "assetGenerator")) continue;
    const chainId = findChain(name)?.chainId;
    const slug = networkNameToSlug[name];
    // A name with no slug cannot be put in a URL or handed to the execution
    // layer, so it is not offerable even though the contract is there.
    if (!slug || typeof chainId !== "number") continue;
    chains.push({ slug, name, chainId });
  }
  return chains;
}

/**
 * The slug to open the picker on: the one the page is already showing when it
 * can launch, else the first that can.
 *
 * Falling back matters because `/create` is reachable on a chain with no
 * generator — the chooser opens from the shell on every page — and a picker
 * defaulting to an unlaunchable chain would present a form that cannot submit.
 */
export function defaultLaunchChain(pageSlug: string | undefined, chains = launchChains()): string {
  if (pageSlug && chains.some((c) => c.slug === pageSlug)) return pageSlug;
  return chains[0]?.slug ?? pageSlug ?? "";
}
