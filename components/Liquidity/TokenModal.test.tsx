// @vitest-environment jsdom
/**
 * The liquidity pair step's token picker, rendered.
 *
 * This list used to be five hardcoded symbols and five hardcoded balances, one
 * of them on a chain the app does not serve. Every assertion below is a fact the
 * user acts on when they open a pool: which tokens exist here, and how much of
 * each they hold.
 *
 * Both hooks are stubbed because what is under test is the JOIN between them —
 * the list comes from the deployment, the balances from the wallet, and they
 * meet on address. Fetching is covered where each hook lives.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenModal } from "./TokenModal";

const CHAIN = "Arc Testnet";

const listed = vi.hoisted(() => ({
  current: [] as { address: string; symbol: string; name: string; logoURI?: string }[],
  loading: false,
}));
const held = vi.hoisted(() => ({ current: undefined as { id: string; balance: number }[] | undefined }));

vi.mock("@/lib/swap/useLiveSwapTokens", () => ({
  useLiveSwapTokens: () => ({ data: listed.current, isLoading: listed.loading }),
}));

vi.mock("@/contexts/MarketPageProvider", () => ({
  useOptionalMarketPageContext: () => (held.current ? { tokenListWithBalance: held.current } : undefined),
}));

// The mark resolves a chain brand over react-query in the real app; none of that
// is what this file is about.
vi.mock("@/components/Atoms/TokenImageIcon", () => ({
  TokenImageIcon: ({ symbol }: { symbol: string }) => <span data-testid="mark">{symbol}</span>,
}));

function token(symbol: string, address: string, name = symbol) {
  return { address, symbol, name, logoURI: "" };
}

function open() {
  render(
    <TokenModal
      open
      which="base"
      disabledSym=""
      chainName={CHAIN}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
}

/** Symbols in the order the list renders them. */
function rendered(): string[] {
  return screen.getAllByTestId("mark").map((n) => n.textContent ?? "");
}

afterEach(() => {
  cleanup();
  listed.current = [];
  listed.loading = false;
  held.current = undefined;
});

describe("the list comes from the deployment", () => {
  it("renders the chain's own tokens, not a hardcoded universe", () => {
    listed.current = [token("USDC", "0x3600"), token("DONUT", "0xd0")];
    open();
    expect(rendered()).toEqual(["DONUT", "USDC"]);
  });

  it("offers no token the deployment did not list", () => {
    // MON shipped in the old static list and Monad is not a served chain.
    listed.current = [token("USDC", "0x3600")];
    open();
    expect(screen.queryByText("MON")).toBeNull();
  });

  it("says so when the chain has no tokens, rather than showing invented ones", () => {
    open();
    expect(screen.getByText(`No tokens found on ${CHAIN}.`)).toBeTruthy();
  });
});

describe("balances are real, and missing is not zero", () => {
  it("shows a balance the wallet actually holds", () => {
    listed.current = [token("USDC", "0x3600")];
    held.current = [{ id: "0x3600", balance: 540 }];
    open();
    expect(screen.getByText("540")).toBeTruthy();
  });

  it("renders NOTHING for a token nobody has read, never 0", () => {
    /*
     * A disconnected wallet has no balances at all. Printing "0" beside every
     * token is a claim about the user's money that happens to be false — the
     * same call `lib/transfer/sourceBalances.ts` makes about a failed read.
     */
    listed.current = [token("USDC", "0x3600")];
    held.current = undefined;
    open();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("still prints a REAL zero, which is a different claim", () => {
    listed.current = [token("USDT", "0xdead")];
    held.current = [{ id: "0xdead", balance: 0 }];
    open();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("joins on address, never on symbol", () => {
    /*
     * Anyone can mint a coin called USDC here. A symbol join is exactly how a
     * counterfeit inherits the real token's balance.
     */
    listed.current = [token("USDC", "0xfake")];
    held.current = [{ id: "0x3600", balance: 540 }];
    open();
    expect(screen.queryByText("540")).toBeNull();
  });

  it("matches an address whose case differs between the two sources", () => {
    listed.current = [token("USDC", "0xAbC123")];
    held.current = [{ id: "0xabc123", balance: 12 }];
    open();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("does not round a real holding away to zero", () => {
    listed.current = [token("DONUT", "0xd0")];
    held.current = [{ id: "0xd0", balance: 0.00000004 }];
    open();
    expect(screen.getByText("<0.0001")).toBeTruthy();
  });
});

describe("ordering", () => {
  it("puts tokens the wallet holds first, largest first", () => {
    listed.current = [token("AAA", "0xa"), token("USDC", "0xc"), token("WETH", "0xe")];
    held.current = [
      { id: "0xc", balance: 540 },
      { id: "0xe", balance: 2 },
    ];
    open();
    expect(rendered()).toEqual(["USDC", "WETH", "AAA"]);
  });

  it("sorts the rest alphabetically, so the long tail is scannable", () => {
    listed.current = [token("ZED", "0x1"), token("ABE", "0x2"), token("MID", "0x3")];
    open();
    expect(rendered()).toEqual(["ABE", "MID", "ZED"]);
  });
});

describe("search", () => {
  it("matches on name as well as symbol", () => {
    listed.current = [token("USDC", "0x1", "USD Coin"), token("DONUT", "0x2", "Donut")];
    open();
    fireEvent.change(screen.getByLabelText("Search tokens"), { target: { value: "usd coin" } });
    expect(rendered()).toEqual(["USDC"]);
  });

  it("names the chain when nothing matches, so it does not read as 'does not exist'", () => {
    listed.current = [token("USDC", "0x1")];
    open();
    fireEvent.change(screen.getByLabelText("Search tokens"), { target: { value: "zzz" } });
    expect(screen.getByText(`No token on ${CHAIN} matches “zzz”.`)).toBeTruthy();
  });
});

describe("symbol collisions", () => {
  it("collapses duplicates, keeping the one the wallet holds", () => {
    // The flow downstream is symbol-keyed, so two rows called USDC would be
    // indistinguishable on click.
    listed.current = [token("USDC", "0xfake"), token("USDC", "0xreal")];
    held.current = [{ id: "0xreal", balance: 540 }];
    open();
    expect(rendered()).toEqual(["USDC"]);
    expect(screen.getByText("540")).toBeTruthy();
  });
});
