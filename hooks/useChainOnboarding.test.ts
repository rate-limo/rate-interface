import { describe, expect, it } from "vitest";
import { chainSteps, type ChainOnboardingProfile } from "@/lib/onboarding/chainProfile";

/**
 * The step list, and the gap that made "first trade" unreachable.
 *
 * `useChainOnboarding` itself needs wagmi, a QueryClientProvider and a gateway,
 * so what is pinned here is the part that was actually wrong: the set of steps a
 * chain declares, against the set the hook can mark done. A step nobody looks
 * for is a chip that never ticks however many trades are made, which is exactly
 * what was reported — and reading the hook is the only way it was ever going to
 * be found, because nothing errors.
 */
const ARC: ChainOnboardingProfile = {
  chainId: 5042002,
  name: "Arc Testnet",
  gasSymbol: "USDC",
  quoteWrapsNative: false,
  canLaunch: true,
  canAuction: true,
  canProvideLiquidity: true,
  fundingIsOneAsset: true,
  pitch: "Trade in USDC with nothing to wrap.",
  headline: "trade",
};

/** What the hook can currently observe. Grow this as detection is added. */
const DETECTED = new Set(["wallet", "fund", "trade"]);

describe("chain onboarding steps", () => {
  it("declares a trade step on a trading chain", () => {
    expect(chainSteps(ARC)).toContain("trade");
  });

  it("has no step it cannot observe EXCEPT the ones knowingly left", () => {
    /*
     * `lp` is declared and not yet detected: it needs the wallet's band
     * positions, a second per-chain read. Naming it here rather than leaving it
     * implicit is the point — the failure mode is silent, so the list of
     * undetectable steps has to be written down and shrink deliberately.
     */
    const undetected = chainSteps(ARC).filter((step) => !DETECTED.has(step));
    expect(undetected).toEqual(["lp"]);
  });

  it("orders the trade step after funding, because it needs the funds", () => {
    const steps = chainSteps(ARC);
    expect(steps.indexOf("trade")).toBeGreaterThan(steps.indexOf("fund"));
  });
});
