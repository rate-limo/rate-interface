// @vitest-environment jsdom
/**
 * The LP positions table, rendered -- ONE ROW PER TOKEN (v2).
 *
 * `live.test.ts` pins the mapping and `lpFees.test.ts` the arithmetic; this asserts
 * the CELLS. The fixture is the deposit that opened the LP redesign: three bands of
 * VFVHFK/USDC on Arc. Under v1 that was three tokens and three rows; under v2 it is
 * ONE token holding three bands, so it must render as ONE row whose bands are drawn
 * inside it (apps/web/CLAUDE.md, LP section).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityContent } from "./ActivityTabs";
import { toLpPositions } from "@/lib/portfolio/live";
import type { LpToken } from "@/lib/liquidity/positions";
import type { IndexerData } from "@/lib/portfolio/types";

vi.mock("wagmi", () => ({
  // The table's only wallet use is the Cancel action on OPEN orders, which this
  // view never renders. They have to exist, not to work.
  useAccount: () => ({ address: undefined, chainId: 5042002 }),
  usePublicClient: () => null,
  useReadContract: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: vi.fn() }),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/chains/useChainBrand", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chains/useChainBrand")>()),
  useChainBrand: () => ({ data: undefined }),
}));

const NET = "Arc Testnet";

function band(index: number, sharePct: number, width: number) {
  return {
    band: index,
    spreadFrac: [0.2, 0.6, 1][index] ?? 1,
    toleranceBuy: width,
    toleranceSell: width,
    feeMultiplier: index + 1,
    open: true,
    shares: BigInt(1),
    sharePct,
    valueUSD: sharePct / 100,
    baseOwned: BigInt(0),
    quoteOwned: BigInt(0),
    vestedPct: 100,
  };
}

/** One token, three bands -- the v2 shape of the deposit v1 split into tokens 23/24/25. */
const TOKEN: LpToken = {
  tokenId: "23",
  networkName: NET,
  pool: "0xce74124E5510c3421b2B38C665AC3d83f3f45981",
  base: "0x71b883bBA21d5D55abd3f7e29b65713861581cb1",
  quote: "0x3600000000000000000000000000000000000000",
  baseSymbol: "VFVHFK",
  quoteSymbol: "USDC",
  baseDecimals: 18,
  quoteDecimals: 6,
  active: true,
  bands: [band(0, 50, 0.0002), band(1, 33.3, 0.0006), band(2, 16.7, 0.001)],
  valueUSD: 1,
  costUSD: 1,
  unrealizedPnlUSD: 0,
  realizedPnlUSD: 0,
  feesUSD: 0,
  forfeitedUSD: 0,
  claimableBase: BigInt("10018113029"),
  claimableQuote: BigInt(0),
  vestingBase: BigInt(0),
  vestingQuote: BigInt(0),
  vestedPct: 100,
  live: true,
  mintedAt: 1,
  snapshotAt: 1,
};

function lpData(apr: Map<string, number | null>, fees: Map<string, number | null>): IndexerData {
  return {
    orders: [],
    stopOrders: [],
    stopOrderHistory: [],
    lps: toLpPositions([], NET, apr, [TOKEN], fees),
    trades: [],
    history: [],
    rewards: { summary: {} as never, rows: [] },
    referrals: { summary: {} as never, rows: [] },
    creator: [],
  } as unknown as IndexerData;
}

function renderLps(data: IndexerData) {
  render(<ActivityContent view="lps" data={data} networkSlug="arc-testnet" />);
  // The desktop table and the mobile cards both mount at every width and CSS
  // picks one, so scope every assertion to the table or each row matches twice.
  return within(screen.getByRole("table"));
}

afterEach(cleanup);

describe("LP positions table", () => {
  it("renders a three-band token as ONE row with its bands inside", () => {
    const table = renderLps(lpData(new Map([["VFVHFK/USDC", 0.26]]), new Map([["23", 0.004]])));
    const rows = table.getAllByRole("row").slice(1); // drop the header
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("#23 · 3 bands")).toBeTruthy();
    expect(within(rows[0]!).getByTestId("lp-band-split").textContent).toContain("1× 50% · 2× 33% · 3× 17%");
  });

  it("names a band by its index when its multiplier is unknown, never a guessed one", () => {
    const unknown = { ...TOKEN, bands: TOKEN.bands.map((b, i) => (i === 1 ? { ...b, feeMultiplier: null } : b)) };
    const data = lpData(new Map(), new Map());
    (data as unknown as { lps: unknown }).lps = toLpPositions([], NET, new Map(), [unknown as LpToken], new Map());
    const rows = renderLps(data).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByTestId("lp-band-split").textContent).toContain("1× 50% · B1 33% · 3× 17%");
  });

  it("prints the pool's APR and the token's fees", () => {
    const table = renderLps(lpData(new Map([["VFVHFK/USDC", 0.26]]), new Map([["23", 0.004]])));
    const [row] = table.getAllByRole("row").slice(1);
    expect(within(row!).getByText("~0.26%")).toBeTruthy();
    // A real, sub-cent amount, said as one.
    expect(within(row!).getByText("<$0.01")).toBeTruthy();
  });

  it("states a measured zero, and still says — when nothing could be measured", () => {
    let table = renderLps(lpData(new Map(), new Map([["23", 0]])));
    expect(within(table.getAllByRole("row")[1]!).getByText("$0.00")).toBeTruthy();
    cleanup();
    table = renderLps(lpData(new Map(), new Map()));
    const cells = within(table.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(cells[2]!.textContent).toBe("—"); // APR
    expect(cells[3]!.textContent).toBe("—"); // Fees earned
  });

  it("draws no range pill for a band token, whose status never varies", () => {
    const table = renderLps(lpData(new Map([["VFVHFK/USDC", 0.26]]), new Map()));
    expect(table.queryByText("In-range")).toBeNull();
    expect(table.queryByText("Out of range")).toBeNull();
  });
});

describe("LP row actions", () => {
  const data = () => lpData(new Map([["VFVHFK/USDC", 0.26]]), new Map([["23", 0.004]]));

  it("offers both directions on the position", () => {
    const [row] = renderLps(data()).getAllByRole("row").slice(1);
    expect(within(row!).getByTestId("lp-add"), "no way to add to this position").toBeTruthy();
    expect(within(row!).getByTestId("lp-withdraw"), "no way out of this position").toBeTruthy();
  });

  it("Withdraw opens the withdraw flow for THAT token", () => {
    push.mockClear();
    const table = renderLps(data());
    within(table.getAllByRole("row")[1]!).getByTestId("lp-withdraw").click();
    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0]![0]);
    expect(url).toContain("withdraw=1");
    expect(url).toContain("position=23");
  });

  it("Add tops up the same token rather than opening a new position", () => {
    push.mockClear();
    const table = renderLps(data());
    within(table.getAllByRole("row")[1]!).getByTestId("lp-add").click();
    const url = String(push.mock.calls[0]![0]);
    expect(url).not.toContain("withdraw=1");
    expect(url).toContain("/pool/deposit");
    expect(url).toContain("position=23");
  });
});
