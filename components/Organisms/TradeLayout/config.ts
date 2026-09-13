import { panel, split, type LayoutNode, type PanelId } from "@/lib/layout/tree";

/**
 * The workspace panels, shared between the desktop tree and the mobile
 * shell so both refer to the same ids. The actual React content for each id
 * is assembled in the page (it needs context), keyed by these strings.
 */
/*
 * An "actions" panel used to sit here, holding Deposit / Withdraw buttons and
 * an Account Equity readout, in the bottom band beside account. Removed on
 * 2026-08-07: the terminal is for trading a market, and neither control is part
 * of that job.
 *
 * Nothing is stranded by its going. Deposit still has two homes — the wallet
 * menu in the shell, and the funding prompt PlaceOrderButton raises when the
 * balance is short, which is the moment it is actually wanted. Account equity
 * is what the `account` panel is for.
 *
 * Layouts ARE persisted — usePersistentLayout mirrors the tree to localStorage,
 * so anyone who has opened the terminal has a saved tree naming five panels.
 * Dropping an id is nonetheless safe, because `deserialize` requires the stored
 * tree to cover EXACTLY the panels the code knows about and returns null
 * otherwise. A saved five-panel tree is therefore discarded on the next load
 * and the four-panel default takes over.
 *
 * Worth stating because the safety is easy to mistake for luck: it is not that
 * nothing is stored, it is that a stale tree is rejected wholesale rather than
 * partially applied. Whoever removes the next panel gets the same free pass —
 * and whoever ADDS one should know it silently resets every arranged layout,
 * which is the same mechanism seen from the other side.
 *
 * components/Organisms/AccountAction is now unimported and left in the tree,
 * the same way Sections/Navbar/Desktop was kept.
 */
export const PANEL_IDS = ["chart", "orderbook", "trade", "account"] as const;
export type TradePanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<TradePanelId, string> = {
  chart: "Chart",
  orderbook: "Order Book",
  trade: "Trade",
  account: "Account",
};

/**
 * A top band of chart · orderbook · trade over a full-width account panel.
 *
 * The bottom band used to be a 0.8 split of account · actions; with actions
 * gone it is the account panel alone, which is why there is no second split
 * here rather than a split with one child.
 */
export const DEFAULT_DESKTOP_TREE: LayoutNode = split(
  "col",
  0.7,
  split(
    "row",
    0.64,
    panel("chart"),
    split("row", 0.5, panel("orderbook"), panel("trade")),
  ),
  panel("account"),
);

export const DESKTOP_PANEL_IDS: readonly PanelId[] = PANEL_IDS;
