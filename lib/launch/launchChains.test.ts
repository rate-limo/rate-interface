import { describe, expect, it } from "vitest";
import { defaultLaunchChain, launchChains, type LaunchChain } from "./launchChains";

describe("launchChains", () => {
  it("offers only chains that carry an AssetGenerator", () => {
    const chains = launchChains();
    expect(chains.length).toBeGreaterThan(0);
    // Somnia and Ink are served by the registry but have no generator, so a
    // creator must never be able to select them.
    const names = chains.map((c) => c.name);
    expect(names).not.toContain("Somnia Testnet");
    expect(names).not.toContain("Ink Sepolia");
  });

  it("gives every offered chain a slug and a chain id", () => {
    for (const c of launchChains()) {
      expect(c.slug).toBeTruthy();
      expect(Number.isInteger(c.chainId)).toBe(true);
      expect(c.chainId).toBeGreaterThan(0);
    }
  });

  it("includes the chains the venue actually launches on today", () => {
    const names = launchChains().map((c) => c.name);
    expect(names).toContain("RISE Testnet");
    expect(names).toContain("Arc Testnet");
  });
});

describe("defaultLaunchChain", () => {
  const chains: LaunchChain[] = [
    { slug: "rise-testnet", name: "RISE Testnet", chainId: 11155931 },
    { slug: "arc-testnet", name: "Arc Testnet", chainId: 5042002 },
  ];

  it("keeps the page's chain when that chain can launch", () => {
    expect(defaultLaunchChain("arc-testnet", chains)).toBe("arc-testnet");
  });

  it("falls back to the first launchable chain when the page's cannot", () => {
    // /create is reachable from the shell on any chain, including one with no
    // generator; opening the picker there must not preselect a dead target.
    expect(defaultLaunchChain("somnia-testnet", chains)).toBe("rise-testnet");
  });

  it("falls back when the page names no chain at all", () => {
    expect(defaultLaunchChain(undefined, chains)).toBe("rise-testnet");
  });

  it("does not invent a chain when none can launch", () => {
    expect(defaultLaunchChain("somnia-testnet", [])).toBe("somnia-testnet");
  });
});
