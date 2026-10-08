// @vitest-environment jsdom
/**
 * Order history, rendered — including the orders that never rested.
 *
 * `MatchingEngine.sol` emits `OrderPlaced` only when an order becomes a maker,
 * so an order that crossed the book entirely was never written down and the tab
 * was empty beside four fills in Trades. The gateway recovers those rows from
 * their fills; this pins what the reader actually gets, and in particular that
 * the pool/maker breakdown reaches the screen. It had been carried to the
 * client on every trade row for a while and rendered nowhere.
 *
 * jsdom applies no media queries, so BOTH layouts mount — the `hidden lg:block`
 * table and the `lg:hidden` cards. One query proves the affordance exists in
 * each, which is the half that regresses unnoticed.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityContent } from "./ActivityTabs";
import { indexerData } from "@/lib/portfolio/mock";
import type { HistoryRow, IndexerData } from "@/lib/portfolio/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ chainId: undefined, address: undefined }),
  usePublicClient: () => undefined,
  useReadContract: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const data = (history: HistoryRow[]): IndexerData => ({ ...indexerData(), history });

/** Arc's ITRA/USDC, as the gateway now recovers it from three pool fills. */
const crossed: HistoryRow = {
  market: { base: "ITRA", quote: "USDC", network: "Arc Testnet" },
  type: "Limit",
  side: "Buy",
  price: "1.0212",
  size: "3",
  status: "Filled",
  time: "22:13:42",
  fills: 3,
  origins: { pool: 3, maker: 0 },
};

/** An ordinary resting order that closed — no counts, nothing to annotate. */
const rested: HistoryRow = {
  market: { base: "ITRA", quote: "USDC", network: "Arc Testnet" },
  type: "Limit",
  side: "Sell",
  price: "1.02",
  size: "1000",
  status: "Canceled",
  time: "21:02:10",
};

describe("order history", () => {
  it("shows an order that filled outright, which used to be absent entirely", () => {
    render(<ActivityContent view="history" data={data([crossed])} networkSlug="arc" />);
    // Two: the desktop table and the mobile card.
    expect(screen.getAllByText("Filled")).toHaveLength(2);
  });

  it("says the fills came from the POOL, in both layouts", () => {
    render(<ActivityContent view="history" data={data([crossed])} networkSlug="arc" />);
    expect(screen.getAllByText("3 fills · all from the pool")).toHaveLength(2);
  });

  it("gives the split when an order took both kinds of liquidity", () => {
    const mixed = { ...crossed, origins: { pool: 2, maker: 1 } };
    render(<ActivityContent view="history" data={data([mixed])} networkSlug="arc" />);
    expect(screen.getAllByText("3 fills · 2 from the pool")).toHaveLength(2);
  });

  it("annotates nothing on a row that carries no counts", () => {
    // A rested order from before the gateway carried origins knows nothing
    // about its counterparty, which is not the same as knowing it was not the
    // pool — so the row says nothing rather than "0 from the pool".
    render(<ActivityContent view="history" data={data([rested])} networkSlug="arc" />);
    expect(screen.queryByText(/from the pool/)).toBeNull();
    expect(screen.getAllByText("Canceled")).toHaveLength(2);
  });

  it("still renders the order's own figures beside the annotation", () => {
    render(<ActivityContent view="history" data={data([crossed])} networkSlug="arc" />);
    // The annotation qualifies the status; it must not displace the row.
    expect(screen.getAllByText("Buy").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.0212/).length).toBeGreaterThan(0);
  });
});
