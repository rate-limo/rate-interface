// @vitest-environment jsdom
/**
 * The chain card's ONE action, and what it does.
 *
 * The card's whole design is "the next step, never a menu of them", so the
 * single button carries all of the weight — and a button whose label names one
 * step while its behaviour performs another is worse than no button at all.
 * That is exactly what shipped: with no wallet connected the card read
 * "Trade on Arc" and navigated to /explore, a page that renders perfectly well
 * without a wallet, so nothing failed and nothing happened either.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChainOnboardingCard } from "./ChainOnboardingCard";
import type { ChainOnboardingProfile } from "@/lib/onboarding/chainProfile";

const requestWalletConnect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wallet/connectGate", () => ({ requestWalletConnect }));

/** Arc's shape: gas and quote are one asset, so there is no wrap step. */
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

afterEach(() => {
  requestWalletConnect.mockClear();
  cleanup();
});

describe("ChainOnboardingCard's single action", () => {
  it("OPENS THE CONNECT DIALOG on the wallet step, rather than navigating", () => {
    render(<ChainOnboardingCard profile={ARC} done={new Set()} activeStep="wallet" />);

    const cta = screen.getByRole("button", { name: "Connect wallet" });
    // A link would be the bug: connecting is not a destination.
    expect(cta.tagName).toBe("BUTTON");
    fireEvent.click(cta);
    expect(requestWalletConnect).toHaveBeenCalledTimes(1);

    // And it must not still be offering the step AFTER this one.
    expect(screen.queryByText(/Trade on/)).toBeNull();
  });

  it("does not name the chain in the reason, because a wallet is not per chain", () => {
    // The section's own subtitle says "Your wallet works on all of them"; a
    // per-card sentence saying otherwise would contradict it on the same screen.
    render(<ChainOnboardingCard profile={ARC} done={new Set()} activeStep="wallet" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(String(requestWalletConnect.mock.calls[0][0])).not.toMatch(/Arc/);
  });

  it("still LINKS for the steps that are genuinely somewhere else", () => {
    // The fix is scoped to connecting. Funding and trading are destinations and
    // stay links, so this cannot quietly turn the whole card into buttons.
    const { rerender } = render(
      <ChainOnboardingCard profile={ARC} done={new Set(["wallet"])} activeStep="fund" />,
    );
    expect(screen.getByRole("link", { name: /Add USDC/ }).getAttribute("href")).toBe("/deposit");

    rerender(
      <ChainOnboardingCard profile={ARC} done={new Set(["wallet", "fund"])} activeStep="trade" />,
    );
    expect(screen.getByRole("link", { name: /Trade on Arc/ })).toBeTruthy();
    expect(requestWalletConnect).not.toHaveBeenCalled();
  });
});
