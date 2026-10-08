// @vitest-environment jsdom
/**
 * The payment-asset selector's ONE rule: it is only a control when there is a
 * choice to make.
 *
 * Tested rather than clicked because the rule cannot be exercised by hand right
 * now — neither chain has a token with two quotes (RISE has zero pairs, Arc has
 * one), so a manual check would have proved only that the single-quote branch
 * renders. This pins both branches regardless of what the seed data happens to
 * hold.
 *
 * `PaymentAsset` is exported purely for this: it takes no data hooks, so it can
 * be rendered without standing up MarketPageProvider, useLiveSwapTokens and
 * useRouteQuote just to assert on a dropdown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentAsset, isShort } from "./ActionDock";
import type { SpotPair } from "@/types";

const pair = (quoteSymbol: string, quoteId: string, tvl: number) =>
  ({
    id: `0xpair-${quoteSymbol}`,
    symbol: `TKN/${quoteSymbol}`,
    baseSymbol: "TKN",
    quoteSymbol,
    base: { id: "0xbase", symbol: "TKN", logoURI: "" },
    quote: { id: quoteId, symbol: quoteSymbol, logoURI: "" },
    dayQuoteTvlUSD: tvl,
  }) as unknown as SpotPair;

const USDC = pair("USDC", "0xusdc", 120_000);
const WETH = pair("WETH", "0xweth", 4_000);

// Vitest has no globals here, so testing-library's auto-cleanup never registers:
// without this the second render's trigger is still in document.body when the
// third test queries, and that test passes or fails on leftovers rather than on
// what it rendered. It failed exactly that way before this was added.
afterEach(cleanup);

describe("PaymentAsset", () => {
  it("is a plain label when there is only one market", () => {
    // A menu with a single item implies an option that is not there — the same
    // rule the "Quoted in" card it replaced already applied.
    render(
      <PaymentAsset symbol="USDC" balance={12.5} balanceUsd={12.5} options={[USDC]} onSelect={() => {}} />,
    );
    expect(screen.queryByLabelText("Choose payment asset")).toBeNull();
    expect(screen.getByText(/12\.5 USDC/)).toBeTruthy();
  });

  it("becomes a control once a second quote exists", () => {
    render(
      <PaymentAsset
        symbol="USDC"
        balance={12.5}
        balanceUsd={12.5}
        options={[USDC, WETH]}
        activePairId="0xpair-USDC"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText("Choose payment asset")).toBeTruthy();
  });

  it("stays a plain label with no onSelect, so a read-only mount cannot offer a dead menu", () => {
    render(<PaymentAsset symbol="USDC" balance={0} balanceUsd={0} options={[USDC, WETH]} />);
    expect(screen.queryByLabelText("Choose payment asset")).toBeNull();
  });

  it("renders the balance, and omits the USD tail when there is none", () => {
    // `≈ $0.00` next to a zero balance reads as a price feed failure rather than
    // an empty wallet.
    render(<PaymentAsset symbol="WETH" balance={0} balanceUsd={0} options={[USDC]} />);
    const label = screen.getByText(/0 WETH/);
    expect(label.textContent).not.toContain("≈");
  });

  it("selects by PAIR, so two markets sharing a quote are both reachable", () => {
    /*
     * The bug this exists for: selection was keyed on the quote token's id, and
     * the page resolved it with `find(p => p.quote.id === id)` — which returns
     * the FIRST match. Two markets quoted in tokens that share an address made
     * the second row permanently unselectable: it highlighted, and the card
     * behind it never changed. Reported as "I cannot choose token".
     */
    const onSelect = vi.fn();
    const twin = pair("USDC", "0xusdc", 0);
    render(
      <PaymentAsset
        symbol="USDC"
        balance={1}
        balanceUsd={1}
        options={[USDC, { ...twin, id: "0xpair-twin" }]}
        activePairId="0xpair-USDC"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByLabelText("Choose payment asset"));
    const rows = screen.getAllByRole("button", { name: /USDC/ });
    // The trigger is a button too; the last row is the second market.
    fireEvent.click(rows[rows.length - 1]);
    expect(onSelect).toHaveBeenCalledWith("0xpair-twin");
  });

  it("shows the ADDRESS when two options share a symbol, and not when they do not", () => {
    // A symbol is not an identity on a venue where anyone can mint a coin called
    // USDC, so two rows reading "USDC" say nothing about which market they are.
    // A full-length address, because the row renders it SHORTENED — a stubby
    // fixture would pass against a slice that is not what a user ever sees.
    const twin = {
      ...pair("USDC", "0x2222222222222222222222222222222222222222", 0),
      id: "0xpair-twin",
    };
    render(
      <PaymentAsset
        symbol="USDC"
        balance={1}
        balanceUsd={1}
        options={[USDC, twin]}
        activePairId="0xpair-USDC"
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Choose payment asset"));
    expect(screen.getByText("0x2222…2222")).toBeTruthy();

    cleanup();
    render(
      <PaymentAsset
        symbol="USDC"
        balance={1}
        balanceUsd={1}
        options={[USDC, WETH]}
        activePairId="0xpair-USDC"
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Choose payment asset"));
    // Distinct symbols need no disambiguation, and adding one would be noise.
    expect(screen.queryByText(/0xusdc…/)).toBeNull();
  });
});

/*
 * The dock used to arm a trade against a balance it never read: 0 USDC in the
 * wallet, and a live "Buy VF15CK" button whose first objection would have come
 * from the wallet itself, after a signature prompt.
 */
describe("isShort", () => {
  it("is false while disconnected, whatever the numbers say", () => {
    // `balance` defaults to 0 before a wallet is attached, so without this the
    // dock would tell every visitor their funds were short.
    expect(isShort(100, 0, false)).toBe(false);
  });

  it("is true when the spend exceeds the holding", () => {
    expect(isShort(1, 0, true)).toBe(true);
    expect(isShort(10.5, 10.4999, true)).toBe(true);
  });

  it("allows spending the balance exactly — this is what Max sets", () => {
    expect(isShort(12.5, 12.5, true)).toBe(false);
  });

  it("allows anything under it", () => {
    expect(isShort(0, 0, true)).toBe(false);
    expect(isShort(3, 12.5, true)).toBe(false);
  });
});
