// @vitest-environment jsdom
/**
 * The stop-orders tab, rendered. The FIRST component test in this app.
 *
 * Everything else in apps/web is pure logic in the default `node` environment, so
 * until now nothing verified that a component renders at all — the activated-stop
 * hand-off was reviewed by reading it, and reading it missed that `OCard` already
 * had an `action` prop and that the desktop link used the wrong colour token.
 *
 * jsdom applies no media queries, so BOTH layouts mount: the `hidden lg:block`
 * table and the `lg:hidden` cards. That is the useful property here rather than a
 * nuisance — one query proves the affordance exists in each, which is exactly the
 * thing that was wrong before (mobile rendered a muted pill and a hand-rolled link
 * while desktop rendered a green pill and a button).
 *
 * wagmi is stubbed. `ActivityContent` calls `useWriteContract` at its own top level
 * (the bulk-cancel path), so a provider would be needed even though no fixture below
 * is `Open` and `StopCancelButton` therefore never mounts. The stub keeps the wallet
 * stack out of a test about what the stops table renders; it is not pretending to
 * cover the cancel flow, which has no test either way.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityContent } from "./ActivityTabs";
import { indexerData } from "@/lib/portfolio/mock";
import type { IndexerData, StopOrder } from "@/lib/portfolio/types";

// ActivityContent calls useRouter() at the top; outside an app-router tree that
// throws. Nothing in the stops view routes, so a stub is enough.
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

const data = (stopOrderHistory: StopOrder[]): IndexerData => ({
  ...indexerData(),
  stopOrders: [],
  stopOrderHistory,
});

const activated = indexerData().stopOrderHistory.find((o) => o.status === "Activated") as StopOrder;
const canceled = indexerData().stopOrderHistory.find((o) => o.status === "Canceled") as StopOrder;

describe("stop orders tab", () => {
  it("offers the hand-off to the order an activated stop became, in BOTH layouts", () => {
    const onOpenOrders = vi.fn();
    render(
      <ActivityContent view="stopOrders" data={data([activated])} networkSlug="rise" onOpenOrders={onOpenOrders} />,
    );
    // One in the desktop table, one in the mobile card. If either regresses this
    // drops to 1 and says which half.
    const buttons = screen.getAllByRole("button", { name: `View order #${activated.regularOrderId}` });
    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      fireEvent.click(button);
    }
    expect(onOpenOrders).toHaveBeenCalledTimes(2);
  });

  it("says Activated in both layouts, not just the table", () => {
    // The mobile pill used to be two-way — Open ? primary : muted — so an activated
    // stop read the same as a cancelled one on a phone.
    render(<ActivityContent view="stopOrders" data={data([activated])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.getAllByText("Activated")).toHaveLength(2);
  });

  it("shows no hand-off for a stop that never activated", () => {
    render(<ActivityContent view="stopOrders" data={data([canceled])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /View order #/ })).toBeNull();
    expect(screen.getAllByText("Canceled")).toHaveLength(2);
  });

  it("shows no hand-off when the id is missing, rather than linking to order 0", () => {
    // regularOrderId is null until the broker writes it on activation. `finite`
    // would have made that 0, which names a real order — this is the render-side
    // half of that guard.
    const withoutId: StopOrder = { ...activated, regularOrderId: null };
    render(<ActivityContent view="stopOrders" data={data([withoutId])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /View order #/ })).toBeNull();
  });

  // ---- what the contracts actually do, asserted on the UI -------------------
  //
  // These mirror test/exchange/orderbook/{VenueRouting,StopLimitOrder}.t.sol. The
  // chain decides these; the table only has to agree with it.

  it("a stop-MARKET activation offers no hand-off — it never became an order", () => {
    // StopOrderMatchingLib._process emits regularOrderId 0 for the market branch,
    // and _executeMarket matches immediately and refunds the remainder rather than
    // resting anything. Order ids start at 1 on BOTH sides (StopLimitOrderbook:81,
    // ExchangeOrderbook:108), so 0 is never an order — it means "none".
    const stopMarket: StopOrder = { ...activated, kind: "Stop-market", regularOrderId: 0 };
    render(<ActivityContent view="stopOrders" data={data([stopMarket])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /View order #/ })).toBeNull();
  });

  it("a stop-market shows Market, never a limit price", () => {
    // placeStopMarket takes no limitPrice and the contract stores 0.
    const stopMarket: StopOrder = { ...activated, kind: "Stop-market", limitPrice: "0.00", regularOrderId: 0 };
    render(<ActivityContent view="stopOrders" data={data([stopMarket])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.getAllByText("Market").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("only a DORMANT stop offers Cancel, because only a dormant stop can be cancelled as one", () => {
    // StopOrderEngine.cancel reverts once activated — pinned by
    // testActivationEventLinksStopToCancelableRegularOrder, which cancels the same
    // position through MatchingEngine.cancelOrder instead.
    // The view is `[...stopOrders, ...stopOrderHistory.filter(o => o.status !== "Open")]`
    // — an Open row lives in the live list, and history's copy is filtered out so the
    // same stop is not listed twice.
    const dormant = indexerData().stopOrders[0];
    render(
      <ActivityContent
        view="stopOrders"
        data={{ ...indexerData(), stopOrders: [dormant], stopOrderHistory: [dormant] }}
        networkSlug="rise"
        onOpenOrders={vi.fn()}
      />,
    );
    // Once per layout, not twice per layout: history's duplicate is filtered.
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /View order #/ })).toBeNull();
  });

  it("an activated stop offers no Cancel", () => {
    render(<ActivityContent view="stopOrders" data={data([activated])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("renders the empty state when there are no stops at all", () => {
    render(<ActivityContent view="stopOrders" data={data([])} networkSlug="rise" onOpenOrders={vi.fn()} />);
    expect(screen.getByText("No stop orders")).toBeTruthy();
  });
});
