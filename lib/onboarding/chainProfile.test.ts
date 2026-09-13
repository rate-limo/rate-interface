import { describe, expect, it } from "vitest";
import { chainOnboardingProfile, chainSteps, stepLabel } from "./chainProfile";

const ARC = 5042002;
const RISE = 11155931;

/**
 * The profile's whole job is to stop a card offering something the chain cannot
 * do. Every case here is one where being wrong is INVISIBLE — a step that reverts
 * when tapped, or a capability silently withheld — rather than a crash.
 */
describe("chainOnboardingProfile", () => {
  it("names the gas asset from the registry, not a guess", () => {
    // The two chains genuinely differ, which is the whole reason the field exists:
    // "add ETH" shown to someone holding Arc USDC asks for something impossible.
    expect(chainOnboardingProfile(ARC)?.gasSymbol).toBe("USDC");
    expect(chainOnboardingProfile(RISE)?.gasSymbol).toBe("ETH");
  });

  it("withholds the LP step where the quote is a wrapped native", () => {
    // `addPair` creates no Pool when either leg is a wrapped native, so RISE has
    // none — verified in the 2026-09-07 seed, where every RISE market logged
    // `band liquidity no pool` while Arc's provided.
    expect(chainOnboardingProfile(RISE)?.canProvideLiquidity).toBe(false);
    expect(chainSteps(chainOnboardingProfile(RISE)!)).not.toContain("lp");
  });

  it("offers the LP step where pools can exist", () => {
    expect(chainOnboardingProfile(ARC)?.canProvideLiquidity).toBe(true);
    expect(chainSteps(chainOnboardingProfile(ARC)!)).toContain("lp");
  });

  it("adds a wrap step only where gas and quote are different assets", () => {
    expect(chainSteps(chainOnboardingProfile(RISE)!)).toContain("wrap");
    // Arc OMITS it rather than pre-completing it: a tick beside something the
    // chain never asked for still tells the reader it was a requirement.
    expect(chainSteps(chainOnboardingProfile(ARC)!)).not.toContain("wrap");
    expect(chainOnboardingProfile(ARC)?.fundingIsOneAsset).toBe(true);
  });

  it("derives launch and auction from the contracts actually deployed", () => {
    // Both chains carry a generator and a presale as of the 2026-09-07 redeploy.
    // If either is ever absent the card must not offer it — that is the failure
    // this assertion guards, not the current true/true.
    const arc = chainOnboardingProfile(ARC)!;
    expect(arc.canLaunch).toBe(true);
    expect(arc.canAuction).toBe(true);
  });

  it("every step has a label naming this chain's own asset", () => {
    const rise = chainOnboardingProfile(RISE)!;
    const labels = chainSteps(rise).map((s) => stepLabel(s, rise));
    expect(labels).toContain("get ETH");
    expect(labels).toContain("wrap ETH");
    // Never the other chain's asset.
    expect(labels.join(" ")).not.toContain("USDC");
  });

  it("returns null for a chain the registry has never heard of", () => {
    expect(chainOnboardingProfile(99999999)).toBeNull();
  });
});
