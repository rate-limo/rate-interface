// @vitest-environment jsdom
/**
 * The Recent tab.
 *
 * It offers destinations for money, so what it lists — and what it refuses to
 * list — is the whole of it. The derivation is pinned separately in
 * `lib/transfer/history.test.ts`; this file is about what reaches the screen.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The transfer store caches its snapshot at module scope — deliberately, so
 * `useSyncExternalStore` gets a stable reference and React does not loop. That
 * cache survives `localStorage.clear()`, so seeding storage between tests is not
 * enough: without resetting the module registry, every test after the first
 * renders the FIRST test's data and the failures look like component bugs.
 *
 * So the component is imported per test, after the seed.
 */
const TRANSFER_LOG_KEY = "iter.transfers";

async function picker() {
  return (await import("./RecipientPicker")).RecipientPicker;
}

const SELF = "0x1ABE6d936A198B7B24842d53e480e06002180784";
const ALICE = "0xF8FB4672170607C95663f4Cc674dDb1386b7CfE0";
const BOB = "0x9E7A01E4514bb56ae642587E0485b606DB46850E";

const account = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: account.current }) }));
vi.mock("@/hooks/useFollowing", () => ({ useFollowing: () => ({ data: [], isLoading: false }) }));

function log(rows: { peer: string; kind?: "withdraw" | "deposit"; at?: number }[]) {
  window.localStorage.setItem(
    TRANSFER_LOG_KEY,
    JSON.stringify(
      rows.map((r, i) => ({
        hash: `0x${String(i + 1).padStart(64, "0")}`,
        kind: r.kind ?? "withdraw",
        chainId: 5042002,
        symbol: "USDC",
        amount: "1",
        peer: r.peer,
        at: r.at ?? rows.length - i,
      })),
    ),
  );
}

async function open() {
  const RecipientPicker = await picker();
  render(<RecipientPicker networkName="Arc Testnet" onPick={picked.fn} />);
  fireEvent.click(screen.getByText("Recent"));
}

const picked = vi.hoisted(() => ({ fn: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  picked.fn.mockClear();
  account.current = SELF;
});
afterEach(cleanup);

describe("what it offers", () => {
  it("lists addresses already withdrawn to, newest first", async () => {
    log([{ peer: ALICE }, { peer: BOB }]);
    await open();
    const rows = screen.getAllByRole("button").filter((b) => /0x/.test(b.textContent ?? ""));
    expect(rows[0]!.textContent).toContain("0xF8FB");
    expect(rows[1]!.textContent).toContain("0x9E7A");
  });

  it("hands the FULL address to the caller, not the shortened one on screen", async () => {
    // The row renders 0xF8FB…CfE0; sending to that string would burn the funds.
    log([{ peer: ALICE }]);
    await open();
    fireEvent.click(screen.getByText(/0xF8FB/).closest("button")!);
    expect(picked.fn).toHaveBeenCalledWith(ALICE);
  });

  it("never offers your own address", async () => {
    // The panel refuses a self-send a screen later; offering it here wastes a
    // slot and invites a transfer that costs a fee and changes nothing.
    log([{ peer: SELF }, { peer: ALICE }]);
    await open();
    expect(screen.queryByText(/0x1ABE/)).toBeNull();
    expect(screen.getByText(/0xF8FB/)).toBeTruthy();
  });

  it("does not offer someone who merely sent TO you", async () => {
    log([{ peer: BOB, kind: "deposit" }]);
    await open();
    expect(screen.queryByText(/0x9E7A/)).toBeNull();
  });
});

describe("empty and filtered states", () => {
  it("explains itself before any withdrawal has been made", async () => {
    await open();
    expect(screen.getByText(/No withdrawals from this browser yet/i)).toBeTruthy();
  });

  it("says when a search matches nothing, rather than looking empty", async () => {
    log([{ peer: ALICE }]);
    await open();
    fireEvent.change(screen.getByLabelText("Search recent addresses"), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/No recent address matches that/i)).toBeTruthy();
  });

  it("filters on the address text", async () => {
    log([{ peer: ALICE }, { peer: BOB }]);
    await open();
    fireEvent.change(screen.getByLabelText("Search recent addresses"), {
      target: { value: "9e7a" },
    });
    expect(screen.getByText(/0x9E7A/)).toBeTruthy();
    expect(screen.queryByText(/0xF8FB/)).toBeNull();
  });
});

describe("the tabs stay distinct", () => {
  it("does not merge Recent into Saved", async () => {
    // A name you wrote must never be confused with one you did not; the picker
    // states that rule for Saved vs Following and it holds here too.
    log([{ peer: ALICE }]);
    const RecipientPicker = await picker();
    render(<RecipientPicker networkName="Arc Testnet" onPick={picked.fn} />);
    expect(screen.getByText(/Nothing saved yet/i)).toBeTruthy();
  });
});
