// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TransferRoute } from "@iter/types";
import type { SourceFunds } from "@/lib/transfer/sourceBalances";
import { CrossChainSources } from "./CrossChainSources";

const arc: TransferRoute = {
  chainId: 5042002,
  asset: "USDC",
  tokenAddress: "0x3600000000000000000000000000000000000000",
  provider: "cctp",
  providerChainKey: "Arc_Testnet",
  depositEnabled: true,
  withdrawEnabled: true,
  minAmount: 1,
  maxAmount: null,
  settlement: "forwarder",
  provenance: "transfer",
};

const baseSepolia: TransferRoute = {
  ...arc,
  chainId: 84532,
  tokenAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  providerChainKey: "Base_Sepolia",
};

let routes: TransferRoute[] = [];
vi.mock("@/hooks/useTransferRoutes", () => ({
  useTransferRoutes: () => ({ routes, isLoading: false }),
}));

// Reads two dozen public RPCs through react-query, and this file mounts the
// component without a QueryClientProvider. The ORDERING it drives is tested
// directly in lib/transfer/sourceBalances.test.ts, where it needs no DOM.
let balances = new Map<number, SourceFunds>();
vi.mock("@/hooks/useSourceBalances", () => ({
  useSourceBalances: () => ({ balances, isLoading: false }),
}));

// The bridge itself is Circle's SDK over a real wallet; what this file pins is
// what the component does with the OUTCOME.
let bridgeOutcome: { ok: true; mintTxHash: string | null } | { ok: false; reason: string } = {
  ok: true,
  mintTxHash: `0x${"ab".repeat(32)}`,
};
vi.mock("@/lib/transfer/cctp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transfer/cctp")>()),
  bridgeIn: vi.fn(async () => bridgeOutcome),
}));

const reported = vi.fn();
vi.mock("@/lib/transfer/report", () => ({
  reportTransfer: (t: unknown) => reported(t),
}));

const props = {
  asset: "USDC",
  tokenSymbol: "USDC",
  chainId: 5042002,
  destinationName: "Arc Testnet",
  amount: "10",
  externalAddress: "0x7a3f000000000000000000000000000000009c21",
  provider: null,
  recipient: "0x9fd3000000000000000000000000000000000a41",
};

beforeEach(() => {
  routes = [];
  balances = new Map<number, SourceFunds>();
  reported.mockClear();
  bridgeOutcome = { ok: true, mintTxHash: `0x${"ab".repeat(32)}` };
});

// Explicit, because vitest `globals` is off in this project so Testing
// Library's auto-cleanup never registers — without it each render stacks on the
// last and `getByText` finds two of everything.
afterEach(() => {
  cleanup();
});

describe("CrossChainSources", () => {
  it("renders nothing when the registry is empty", () => {
    // The SHIPPED state: no migration seeds a route, so this is what every user
    // sees until an operator proves one. It must be absence, not an empty state.
    const { container } = render(<CrossChainSources {...props} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when no external wallet is connected", () => {
    routes = [arc, baseSepolia];
    const { container } = render(<CrossChainSources {...props} externalAddress={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the destination itself has no leg", () => {
    // A provider that cannot mint here is not a route into here, however many
    // chains can burn.
    routes = [baseSepolia];
    const { container } = render(<CrossChainSources {...props} />);
    expect(container.innerHTML).toBe("");
  });

  function open() {
    fireEvent.click(screen.getByRole("button", { name: /already have/i }));
  }

  it("is COLLAPSED by default, so it cannot bury the ordinary path", () => {
    /*
     * The first version rendered two dozen networks above the address and QR,
     * alphabetically. That inverted the screen: the ordinary way to deposit USDC
     * on Arc is to send USDC on Arc. A wall of bridges in front of the common
     * path makes the common path look unsupported.
     */
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    expect(screen.queryByText("Base Sepolia")).toBeNull();
    expect(screen.getByRole("button", { name: /already have/i })).toBeTruthy();
  });

  it("puts the asset's OWN network first once opened", () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByText(/already here/i)).toBeTruthy();
    expect(screen.getByText("Arc Testnet")).toBeTruthy();
  });

  it("lists the other chains this asset can arrive from", () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByText("Base Sepolia")).toBeTruthy();
  });

  it("never offers the destination chain as something to BRIDGE from", () => {
    // It appears as the direct row, which is not a bridge — so the Bridge
    // buttons must number one fewer than the rows.
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    // The rows CHOOSE now; confirming is the next step.
    expect(screen.getAllByText("Choose")).toHaveLength(1);
  });

  it("says the receiving wallet needs no gas, which is the surprising part", () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByText(/no gas needed on arrival/i)).toBeTruthy();
  });

  it("does not promise gasless arrival when the route settles self", () => {
    routes = [{ ...arc, settlement: "self" }, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.queryByText(/no gas needed on arrival/i)).toBeNull();
  });

  it("offers a search field once the list stops being scannable", () => {
    // Two dozen names in a column is a list nobody reads to the end. Below the
    // threshold a search box is just another thing to look at.
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.queryByLabelText(/search networks/i)).toBeNull();
    cleanup();

    routes = [arc, ...Array.from({ length: 9 }, (_, i) => ({
      ...baseSepolia,
      chainId: 900000 + i,
      providerChainKey: `Chain_${i}`,
    }))];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByLabelText(/search networks/i)).toBeTruthy();
  });

  it("filters to what was typed, and says so when nothing matches", () => {
    routes = [arc, ...Array.from({ length: 9 }, (_, i) => ({
      ...baseSepolia,
      chainId: 900000 + i,
      providerChainKey: i === 0 ? "Optimism_Sepolia" : `Chain_${i}`,
    }))];
    render(<CrossChainSources {...props} />);
    open();

    fireEvent.change(screen.getByLabelText(/search networks/i), { target: { value: "optim" } });
    expect(screen.getByText("Optimism Sepolia")).toBeTruthy();
    expect(screen.queryByText("Chain 1")).toBeNull();

    fireEvent.change(screen.getByLabelText(/search networks/i), { target: { value: "zzzz" } });
    expect(screen.getByText(/no network matches/i)).toBeTruthy();
  });

  function manyRoutes(n: number) {
    return [
      arc,
      ...Array.from({ length: n }, (_, i) => ({
        ...baseSepolia,
        chainId: 900000 + i,
        providerChainKey: `Chain_${String(i).padStart(2, "0")}`,
      })),
    ];
  }

  it("pages the list instead of growing the panel by two dozen rows", () => {
    /*
     * Opened inline, 24 rows pushed the address and QR — the things this page
     * exists to show — off the bottom of the screen. Paged rather than scrolled:
     * an inner scroll area inside a page that also scrolls does one or the other
     * depending on where the pointer sits.
     */
    routes = manyRoutes(24);
    render(<CrossChainSources {...props} />);
    open();

    expect(screen.getAllByText("Choose")).toHaveLength(3);
    expect(screen.getByText(/1–3 of 24/)).toBeTruthy();
  });

  it("moves through the pages and stops at both ends", () => {
    routes = manyRoutes(24);
    render(<CrossChainSources {...props} />);
    open();

    // `.disabled`, not `toBeDisabled` — jest-dom is not set up in this project.
    const prev = () => screen.getByLabelText(/previous page/i) as HTMLButtonElement;
    const next = () => screen.getByLabelText(/next page/i) as HTMLButtonElement;

    expect(prev().disabled).toBe(true);
    fireEvent.click(next());
    expect(screen.getByText(/4–6 of 24/)).toBeTruthy();
    expect(prev().disabled).toBe(false);

    for (let i = 0; i < 10; i += 1) fireEvent.click(next());
    expect(screen.getByText(/22–24 of 24/)).toBeTruthy();
    expect(next().disabled).toBe(true);
  });

  it("returns to the first page when the search changes", () => {
    // Results someone just filtered for must not be on a page they are not
    // looking at.
    routes = manyRoutes(24);
    render(<CrossChainSources {...props} />);
    open();

    fireEvent.click(screen.getByLabelText(/next page/i));
    expect(screen.getByText(/4–6 of 24/)).toBeTruthy();

    // "Chain 1" keeps ten matches, so the result still spans two pages and the
    // range is observable. A filter that collapsed to one page would hide the
    // pager entirely and prove nothing about the reset.
    fireEvent.change(screen.getByLabelText(/search networks/i), { target: { value: "Chain 1" } });
    expect(screen.getByText(/1–3 of 10/)).toBeTruthy();
  });

  it("shows no pager when everything fits on one page", () => {
    routes = manyRoutes(2);
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.queryByLabelText(/next page/i)).toBeNull();
  });

  it("never shows a bare number where a balance goes", () => {
    /*
     * It rendered "10" alone, right-aligned above "Bridge" — which reads as a
     * count, a fee or a rank before it reads as money. A figure on a transfer
     * screen without its unit is the same mistake as a price with no currency.
     */
    routes = [arc, baseSepolia];
    balances = new Map([[baseSepolia.chainId, { token: "10", gas: "1", gasSymbol: "ETH" }]]);
    render(<CrossChainSources {...props} />);
    open();

    expect(screen.getByText("10 USDC")).toBeTruthy();
    expect(screen.queryByText("10")).toBeNull();
  });

  it("says what the figure is for anyone not reading the layout", () => {
    routes = [arc, baseSepolia];
    balances = new Map([[baseSepolia.chainId, { token: "10", gas: "1", gasSymbol: "ETH" }]]);
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByLabelText(/where you hold 10 USDC/i)).toBeTruthy();
  });

  it("shows no figure at all for a chain that did not answer", () => {
    // Absent is not zero. A chain whose RPC failed must not claim an empty
    // balance, and must still be offerable.
    routes = [arc, baseSepolia];
    balances = new Map();
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.queryByText(/USDC$/)).toBeNull();
    expect(screen.getByLabelText(/^Deposit from Base Sepolia$/)).toBeTruthy();
  });

  it("renders a mark for every network, falling back to initials", () => {
    // Circle ships no icon — its chain objects carry no image field at all — and
    // none of these chains has a chainMeta upload, so initials are what a real
    // deployment shows today.
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    expect(screen.getByText("BS")).toBeTruthy();
    expect(screen.getByText("AT")).toBeTruthy();
  });
});

describe("choosing a network is not confirming a transfer", () => {
  function open() {
    fireEvent.click(screen.getByRole("button", { name: /already have/i }));
  }

  it("does not reject the pick with a minimum nobody entered", () => {
    /*
     * The bug this exists for. A network row ran the whole bridge with the
     * panel's own amount field, which defaults to 0.05 for a gas top-up — so
     * clicking "Base Sepolia" answered "Minimum is 1" and selected nothing. The
     * one control for picking a source rejected the pick on the strength of a
     * number the user had neither entered nor seen.
     */
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} amount="0.05" />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Base Sepolia")).toBeTruthy();
    expect(screen.getByLabelText(/amount of USDC to bridge/i)).toBeTruthy();
  });

  it("states the minimum as guidance before anyone has typed", () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    // Guidance, not an alert: nothing has been attempted yet.
    expect(screen.getByText(/Minimum 1 USDC/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("prefills the amount from what the wallet holds, and offers Max", () => {
    routes = [arc, baseSepolia];
    balances = new Map([[baseSepolia.chainId, { token: "10", gas: "1", gasSymbol: "ETH" }]]);
    render(<CrossChainSources {...props} />);
    open();
    // Not anchored: with a balance the row's label carries it too.
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia,/));

    expect((screen.getByLabelText(/amount of USDC to bridge/i) as HTMLInputElement).value).toBe("10");
    expect(screen.getByRole("button", { name: "Max" })).toBeTruthy();
  });

  it("tells the panel when a bridge is being confirmed, and when it is not", () => {
    /*
     * Both blocks rendered at once: the bridge confirm and the panel's own
     * same-chain send, so the screen showed two Deposit buttons with different
     * amounts stacked on top of each other. Whichever one was pressed, the other
     * was wrong.
     */
    routes = [arc, baseSepolia];
    const seen: boolean[] = [];
    render(<CrossChainSources {...props} onBridgingChange={(v) => seen.push(v)} />);
    open();
    expect(seen.at(-1)).toBe(false);

    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    expect(seen.at(-1)).toBe(true);

    // Still true while browsing, deliberately: the panel's own same-chain send
    // reappearing mid-reconsideration would be the two-buttons problem again,
    // just intermittently. Only closing the section, or choosing this chain,
    // ends the flow.
    fireEvent.click(screen.getByRole("button", { name: /change network/i }));
    expect(seen.at(-1)).toBe(true);
  });

  it("releases the panel when it unmounts", () => {
    // The section disappears when the asset changes; a panel still hiding its
    // own send would be left with no control at all.
    routes = [arc, baseSepolia];
    const seen: boolean[] = [];
    const view = render(<CrossChainSources {...props} onBridgingChange={(v) => seen.push(v)} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    expect(seen.at(-1)).toBe(true);

    view.unmount();
    expect(seen.at(-1)).toBe(false);
  });

  it("can go back to the list without transferring anything", () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    fireEvent.click(screen.getByRole("button", { name: /change network/i }));
    expect(screen.getByLabelText(/^Deposit from Base Sepolia$/)).toBeTruthy();
  });

  it("still shows which network is chosen after Change network", () => {
    /*
     * "Change network" used to clear the selection, so the list came back with
     * every row identical and nothing saying which one you were already on —
     * the single fact you opened it to reconsider.
     */
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    fireEvent.click(screen.getByRole("button", { name: /change network/i }));

    expect(screen.getByText("Chosen")).toBeTruthy();
  });

  it("lifts the chosen network to the top so a pager cannot hide it", () => {
    routes = [
      arc,
      ...Array.from({ length: 12 }, (_, i) => ({
        ...baseSepolia,
        chainId: 900000 + i,
        providerChainKey: `Chain_${String(i).padStart(2, "0")}`,
      })),
    ];
    render(<CrossChainSources {...props} />);
    open();

    // Something on the last page.
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByLabelText(/next page/i));
    const row = screen.getAllByRole("button", { name: /^Deposit from Chain/ })[0]!;
    // The NAME only: the row's text also carries its action word, which changes
    // from "Choose" to "Chosen" once picked.
    const name = row.getAttribute("aria-label") ?? "";
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /change network/i }));

    // Back on page one, and it is the first row.
    expect(screen.getByText(/^1–3 of 12/)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^Deposit from Chain/ })[0]!.getAttribute("aria-label"),
    ).toBe(name);
    expect(screen.getByText("Chosen")).toBeTruthy();
  });

  it("can go back to depositing directly on the asset's own network", () => {
    /*
     * The asset's own network was a static caption, so once a bridge source was
     * chosen there was no way back to it — the one option the list could not
     * return you to was the ordinary one.
     */
    routes = [arc, baseSepolia];
    const seen: boolean[] = [];
    render(<CrossChainSources {...props} onBridgingChange={(v) => seen.push(v)} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    expect(seen.at(-1)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /change network/i }));
    fireEvent.click(screen.getByLabelText(/deposit directly on Arc Testnet/i));

    // The bridge is off, so the panel's own send comes back.
    expect(seen.at(-1)).toBe(false);
    expect(screen.queryByLabelText(/amount of USDC to bridge/i)).toBeNull();
  });

  it("will not let you bridge from a chain with no gas", () => {
    /*
     * A bridge BURNS on the source chain — an approve and a transaction the user
     * signs and pays for in that chain's own gas asset. Ten USDC on Arbitrum
     * Sepolia with no Sepolia ETH is not a deposit anyone can make, and the row
     * looked identical to a usable one: it failed at the wallet, AFTER the
     * network switch, which is the most expensive place to find out.
     */
    routes = [arc, baseSepolia];
    balances = new Map([[baseSepolia.chainId, { token: "10", gas: "0", gasSymbol: "ETH" }]]);
    render(<CrossChainSources {...props} />);
    open();

    expect(screen.getByText(/needs ETH on this network to send/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia,/));
    const cta = screen.getByRole("button", { name: /No ETH to send with/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(screen.getByText(/this wallet has none there/i)).toBeTruthy();
  });

  it("does NOT block when the gas balance could not be read", () => {
    // "We could not ask" and "you have none" are different facts. Blocking a
    // deposit because an RPC was rate-limited is worse than letting the wallet
    // decline.
    routes = [arc, baseSepolia];
    balances = new Map([[baseSepolia.chainId, { token: "10", gasSymbol: "ETH" }]]);
    render(<CrossChainSources {...props} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia,/));

    expect(screen.queryByText(/this wallet has none there/i)).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Deposit 10 USDC/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("closing the section ends the bridge flow", () => {
    // Or the panel would keep hiding its own send for a bridge nobody is in.
    routes = [arc, baseSepolia];
    const seen: boolean[] = [];
    render(<CrossChainSources {...props} onBridgingChange={(v) => seen.push(v)} />);
    open();
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    expect(seen.at(-1)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /change network/i }));
    fireEvent.click(screen.getByRole("button", { name: /^hide$/i }));
    expect(seen.at(-1)).toBe(false);
  });
});


/*
 * A completed bridge has to leave a row behind.
 *
 * It did not: the success branch raised a toast and dropped `mintTxHash`, so a
 * settled deposit was absent from Recent transfers, had no hash and no explorer
 * link, and the only route to one was pasting the hash into the manual claim
 * form meant for QR deposits the app never saw.
 */
describe("a finished bridge", () => {
  const openAndSend = async () => {
    routes = [arc, baseSepolia];
    render(<CrossChainSources {...props} amount="10" provider={{} as never} />);
    fireEvent.click(screen.getByRole("button", { name: /already have/i }));
    fireEvent.click(screen.getByLabelText(/^Deposit from Base Sepolia$/));
    fireEvent.change(screen.getByLabelText(/amount of USDC to bridge/i), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Deposit 10 USDC$/ }));
    // Let the awaited bridge settle and the success branch run.
    await new Promise((r) => setTimeout(r, 0));
  };

  it("records the transfer, against the DESTINATION chain and with the asset named", async () => {
    await openAndSend();
    expect(reported).toHaveBeenCalledTimes(1);
    const row = reported.mock.calls[0]![0] as Record<string, unknown>;
    // The mint is what credits the account, and it is on the destination.
    expect(row.chainId).toBe(5042002);
    expect(row.hash).toBe(`0x${"ab".repeat(32)}`);
    expect(row.kind).toBe("deposit");
    // The em-dash in "Received 0.05 —" is what an unnamed asset renders as.
    expect(row.symbol).toBe("USDC");
    expect(row.amount).toBe("10");
  });

  it("records nothing when the SDK reported no mint hash, rather than a row that cannot be verified", async () => {
    bridgeOutcome = { ok: true, mintTxHash: null };
    await openAndSend();
    expect(reported).not.toHaveBeenCalled();
  });

  it("records nothing when the bridge failed", async () => {
    bridgeOutcome = { ok: false, reason: "The transfer stopped while the send." };
    await openAndSend();
    expect(reported).not.toHaveBeenCalled();
  });
});
