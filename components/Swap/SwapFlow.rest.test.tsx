// @vitest-environment jsdom
/**
 * When the whole order rests, every screen has to describe a POSITION.
 *
 * The bug these pin is not a wrong number, it is a screen contradicting itself:
 * "0 ITRA · You receive · est · $0" printed directly above a row promising
 * "$1 → ITRA", on the surface where someone decides whether to sign. It
 * happened twice — once for a limit order, once for an LP deposit — because the
 * review and the result both read `delivered`, the part that fills THIS SECOND,
 * which with a disposition set and a thin book is routinely zero.
 *
 * `positionAfter` is unit-tested in lib/swap; a rule nothing renders is still a
 * bug, so this mounts the real flow through its `useExecution` seam and reads
 * what is on screen.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SwapExecution, SwapExecutionState } from "./execution";
import type { Disposition, SwapQuote, SwapToken } from "@/lib/swap/types";
import Providers from "@/lib/providers";
import { SwapFlow } from "./SwapFlow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/token/ITRA",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const token = (symbol: string, priceUsd: number, decimals = 18): SwapToken =>
  ({
    symbol,
    priceUsd,
    decimals,
    address: `0x${symbol}`,
    chainId: 5042002,
    logoURI: "",
  }) as SwapToken;

const USDC = token("USDC", 1, 6);
const ITRA = token("ITRA", 1.02);

/** A quote whose book took NONE of the order — the case every one of these is about. */
const restingQuote = (): SwapQuote =>
  ({
    amountIn: 1,
    payUsd: 1,
    route: [USDC, ITRA],
    hops: [],
    delivered: 0,
    deliveredUsd: 0,
    placedUsd: 1,
    placements: [
      {
        from: USDC,
        to: ITRA,
        inAmount: 1,
        outAmount: 0.9802,
        settlesToTarget: true,
      },
    ],
    impactPct: 0,
    minReceived: 0,
    feeUsd: 0,
  }) as unknown as SwapQuote;

const state = (over: Partial<SwapExecutionState> = {}): SwapExecutionState => ({
  step: "review",
  needsApproval: false,
  approved: true,
  method: "permit",
  unlimited: false,
  outcome: null,
  reason: null,
  approvalTxHash: null,
  txHash: null,
  remainderTxHash: null,
  remainderFailed: false,
  failure: null,
  ...over,
});

const execAt =
  (over: Partial<SwapExecutionState> = {}) =>
  (): SwapExecution =>
    ({
      state: state(over),
      spender: "0xrouter",
      setUnlimited: vi.fn(),
      toApprove: vi.fn(),
      approve: vi.fn(),
      confirm: vi.fn(),
      placeRemainder: vi.fn(),
      skipRemainder: vi.fn(),
      back: vi.fn(),
      reset: vi.fn(),
    }) as unknown as SwapExecution;

/* `Providers` for wagmi: the flow reads a gas price for its network-fee row. */
const mount = (disposition: Disposition, over?: Partial<SwapExecutionState>) =>
  render(
    <Providers>
      <SwapFlow
        pay={USDC}
        get={ITRA}
        quote={restingQuote()}
        disposition={disposition}
        networkName="Arc Testnet"
        onClose={vi.fn()}
        useExecution={execAt(over)}
      />
    </Providers>,
  );

describe("a limit order that rests in full", () => {
  it("reviews as an order, never as a receipt for zero tokens", () => {
    mount("limit");
    expect(screen.getByText("Buy ITRA")).toBeTruthy();
    expect(screen.getByText(/Amount of ITRA/)).toBeTruthy();
    expect(screen.getByText("Limit price")).toBeTruthy();
    expect(screen.getByText("Estimated cost")).toBeTruthy();
    // The contradiction itself: a receive leg reading zero.
    expect(screen.queryByText(/You receive/)).toBeNull();
  });

  it("drops the rows that describe crossing a book, because none is crossed", () => {
    mount("limit");
    for (const gone of ["Price impact", "Route", /Min received/]) {
      expect(screen.queryByText(gone as string)).toBeNull();
    }
  });

  it("asks to place an order rather than confirm a trade", () => {
    mount("limit");
    expect(screen.getByText("Place order")).toBeTruthy();
    expect(screen.queryByText("Confirm trade")).toBeNull();
  });

  it("reports the placed order, with how much of it has filled", () => {
    mount("limit", {
      step: "result",
      outcome: "success",
      remainderTxHash: "0xabc",
    });
    expect(screen.getByText("ITRA order placed")).toBeTruthy();
    expect(screen.getByText(/0 of 0.9802 ITRA/)).toBeTruthy();
    expect(screen.getByText("View order")).toBeTruthy();
    // "Trade complete" would be false three times over: nothing completed,
    // nothing was received, and the wallet holds what it did before.
    expect(screen.queryByText("Trade complete")).toBeNull();
  });
});

describe("an LP deposit that rests in full", () => {
  it("reviews as a range and a yield, not as an amount of the token", () => {
    mount("lp");
    expect(screen.getByText(/Provide to the ITRA pool/)).toBeTruthy();
    expect(screen.getByText("Range")).toBeTruthy();
    expect(screen.getByText("Converts to")).toBeTruthy();
    expect(screen.getByText("Est. earnings")).toBeTruthy();
    expect(screen.getByText("Provide liquidity")).toBeTruthy();
  });

  /*
   * Shares are minted at the pool's own scale, so a client-side figure is right
   * for the first deposit into an empty band and silently wrong once it holds
   * fees — the trap apps/web/CLAUDE.md records against the portfolio's LP tab.
   */
  it("does not invent a share count", () => {
    mount("lp");
    expect(screen.queryByText(/shares/i)).toBeNull();
  });

  it("reports an opened position, not a placed order", () => {
    mount("lp", {
      step: "result",
      outcome: "success",
      remainderTxHash: "0xabc",
    });
    expect(screen.getByText("ITRA position opened")).toBeTruthy();
    expect(screen.getByText("View position")).toBeTruthy();
    expect(screen.queryByText("ITRA order placed")).toBeNull();
  });
});

describe("a trade that actually fills", () => {
  /* The swap screens are untouched, and that is the point of the branch. */
  it("keeps the swap review when the book takes the order", () => {
    render(
      <Providers>
        <SwapFlow
          pay={USDC}
          get={ITRA}
          quote={{
            ...restingQuote(),
            delivered: 0.98,
            deliveredUsd: 1,
            placedUsd: 0,
            placements: [],
          }}
          disposition="none"
          networkName="Arc Testnet"
          onClose={vi.fn()}
          useExecution={execAt()}
        />
      </Providers>,
    );
    expect(screen.getByText("Review trade")).toBeTruthy();
    expect(screen.getByText("Confirm trade")).toBeTruthy();
    expect(screen.getByText(/You receive/)).toBeTruthy();
  });
});

/**
 * The settled card is a RECEIPT, and the suite never said so.
 *
 * It shipped announcing "Trade complete" over a primary button reading
 * "Confirm" — a control asking for a decision that no longer exists, under a
 * transaction hash proving it had already been made.
 */
describe("a trade that has settled", () => {
  const settled = { step: "result" as const, outcome: "success" as const, txHash: "0xfeed" };

  it("offers Done, because there is nothing left to confirm", () => {
    mount("none", settled);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.queryByText("Confirm")).toBeNull();
  });

  it("reports what happened rather than announcing an outcome", () => {
    mount("none", settled);
    expect(screen.getByText("Swapped")).toBeTruthy();
    expect(screen.queryByText("Trade complete")).toBeNull();
  });

  it("offers the next trade without closing the card", () => {
    mount("none", settled);
    expect(screen.getByText("Trade again")).toBeTruthy();
  });
});
