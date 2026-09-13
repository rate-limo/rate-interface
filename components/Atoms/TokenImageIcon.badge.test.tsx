// @vitest-environment jsdom
/**
 * `chainName` does two jobs, and `badge` is what separates them.
 *
 * Naming the chain is how `nativeIconFrom` recognises a chain's own gas token
 * and prefers the operator's mark for it. Drawing a network chip is a display
 * choice. Those were one prop until the status bar's gas chip needed the first
 * without the second — it already says "Gas", sits at 11px, and a badge on a
 * 16px mark there is noise.
 *
 * Pinned because the default is the risky direction: `badge` defaults to true so
 * all fifteen existing call sites are unchanged, which means a regression here
 * is a badge quietly disappearing from every row rather than an error anywhere.
 *
 * Rendered bare, with no QueryClientProvider — that is deliberate and is itself
 * the assertion in the last case. `useChainBrand` is a module store precisely so
 * an atom on every row cannot take down whatever mounts it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TokenImageIcon } from "./TokenImageIcon";

afterEach(cleanup);

/** The badge renders its chain name as a `title`, which is how it is found. */
const badgeFor = (chainName: string) => screen.queryByTitle(chainName);

describe("TokenImageIcon badge", () => {
  it("draws the badge by default when a chain is named", () => {
    render(<TokenImageIcon symbol="ETH" color="#fff" chainName="RISE Testnet" />);
    expect(badgeFor("RISE Testnet")).not.toBeNull();
  });

  it("draws nothing when no chain is named", () => {
    // Cross-chain surfaces (the portfolio) render rows whose network the atom
    // genuinely does not know. No name, no badge, and no guess.
    render(<TokenImageIcon symbol="ETH" color="#fff" />);
    expect(badgeFor("RISE Testnet")).toBeNull();
  });

  it("suppresses the badge on request while still accepting the chain", () => {
    // The gas chip's case: the chain is passed for RESOLUTION, not display.
    render(
      <TokenImageIcon symbol="ETH" color="#fff" chainName="RISE Testnet" badge={false} />,
    );
    expect(badgeFor("RISE Testnet")).toBeNull();
  });

  it("still renders the token itself with the badge suppressed", () => {
    // Suppressing the badge must not suppress the mark it sits on — the gas chip
    // would then be an empty box beside a number.
    render(
      <TokenImageIcon symbol="ETH" color="#fff" chainName="RISE Testnet" badge={false} />,
    );
    // ETH resolves through KNOWN_TOKEN_LOGOS, so the artwork is an <img> —
    // the alt is the symbol.
    expect(screen.getByAltText("ETH")).not.toBeNull();
  });

  it("mounts with no QueryClientProvider", () => {
    // Every case above already proves this, but it is the property worth naming:
    // this atom renders on every token, pair, pool and transaction row, and it
    // held a provider requirement for exactly one commit — which broke twelve
    // unrelated component tests. A bare mount must never throw.
    expect(() =>
      render(<TokenImageIcon symbol="USDC" color="#fff" chainName="Arc Testnet" />),
    ).not.toThrow();
  });
});
