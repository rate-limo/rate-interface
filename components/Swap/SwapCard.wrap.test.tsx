// @vitest-environment jsdom
/**
 * The card, with a wallet connected, deciding what it can submit.
 *
 * `lib/swap/submitGate.test.ts` pins the RULE and `lib/swap/wrap.test.ts` pins
 * the quote. Neither can see whether the card passes the right values in, and
 * that is where the original bug was: `isWrapKind` was computed and read by
 * nothing, so a wrap reached a gate that demanded a router path it would never
 * have. Every clause that matters here is behind `isConnected`, which is why
 * this file mocks the wallet at all.
 *
 * What is mocked is the DATA — which wallet, which balance, which tokens. The
 * card's own arithmetic, its gate and its labels all run for real.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WETH = "0x008fCD6315c68EbAa31244aea174993f63Ef14D5";
const RISE = 11155931;
const WALLET = "0x1111111111111111111111111111111111111111";

let balanceResult = {
  data: { formatted: "5", value: BigInt(0), decimals: 18, symbol: "ETH" },
  isLoading: false,
  isError: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/trade",
  useSearchParams: () => new URLSearchParams(),
}));

// Only the reads. `WagmiProvider`, `createConfig` and the rest of the module
// stay real, because `Providers` mounts them.
vi.mock("wagmi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wagmi")>();
  return {
    ...actual,
    useAccount: () => ({ address: WALLET, isConnected: true, chainId: RISE }),
    useBalance: () => balanceResult,
  };
});

/*
 * The live list, which is a network read the card makes on mount.
 *
 * Frozen at module scope, and that is load-bearing: the card keeps its chosen
 * tokens in sync with this list through an effect, so returning a fresh array
 * from the hook on every render makes that effect re-run forever. The first
 * version of this file did exactly that and hung the runner.
 */
const TOKENS = [
  { symbol: "USDC", name: "USD Coin", address: "0x1234567890123456789012345678901234567890", decimals: 6, chainId: RISE, priceUsd: 1 },
  { symbol: "WETH", name: "Wrapped Ether", address: WETH, decimals: 18, chainId: RISE, priceUsd: 2000 },
  { symbol: "ETH", name: "Ether", address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, chainId: RISE, priceUsd: 2000 },
];
const LIVE_TOKENS = { data: TOKENS, isLoading: false, isError: false };

// `TokenPicker` reads the cross-chain list from the same module, and it is the
// same identity trap — frozen for the same reason.
const ALL_TOKENS = { tokens: TOKENS, isLoading: false, chainsLoaded: 1, chainsTotal: 1 };

vi.mock("@/lib/swap/useLiveSwapTokens", () => ({
  useLiveSwapTokens: () => LIVE_TOKENS,
  useAllSwapTokens: () => ALL_TOKENS,
}));

import Providers from "@/lib/providers";
import { SwapCard } from "./SwapCard";

afterEach(cleanup);
beforeEach(() => {
  balanceResult = {
    data: { formatted: "5", value: BigInt(0), decimals: 18, symbol: "ETH" },
    isLoading: false,
    isError: false,
  };
});

function mountCard() {
  return render(
    <Providers>
      <SwapCard networkName="RISE Testnet" networkSlug="rise" />
    </Providers>,
  );
}

const submit = () => screen.getByTestId("swap-submit") as HTMLButtonElement;
const amountField = () => screen.getByTestId("swap-pay-amount") as HTMLInputElement;

/**
 * Open the receive picker and choose a token by an ADDRESS fragment.
 *
 * Not by symbol: the list renders every row's name and ticker, and on this
 * chain two of them are one letter apart — the wrapped token is listed as
 * "WETH" and the native entry as "ETH", so a symbol match is ambiguous exactly
 * where this file is aiming.
 */
function chooseReceive(addressFragment: string) {
  fireEvent.click(screen.getByText("Select token"));
  const dialog = screen.getByRole("dialog");
  const row = within(dialog)
    .getAllByRole("button")
    .find((button) => button.textContent?.includes(addressFragment));
  if (!row) throw new Error(`no picker row matching ${addressFragment}`);
  fireEvent.click(row);
}

/** The synthetic native entry, and the wrapped ERC-20 it converts 1:1 with. */
const NATIVE_ROW = "0xEeee";
const WRAPPED_ROW = "0x008f";

describe("the card with a wallet connected", () => {
  it("opens with a pay token and no receive leg chosen", () => {
    mountCard();
    expect(screen.getByText("Select token")).toBeTruthy();
    expect(submit().textContent).toContain("Select a token");
  });

  it("opens paying the WRAPPED token, not the native one", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "1" } });

    /*
     * Pinned because the comments around this fix twice said the opposite.
     *
     * `initial` picks the static list's ETH entry, and on RISE that entry IS
     * the WETH contract — the "ETH" label was an `adminTokenMeta` override, and
     * `correctWrappedSymbol` undoes it once the live list lands. So the card
     * opens holding wrapped, and the native entry beside it makes UNWRAP the
     * reachable direction, with wrap one flip further.
     */
    expect(submit().textContent).toContain("Unwrap WETH");
  });

  it("enables the conversion, which has no router path and never needed one", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "1" } });

    // The whole bug: this button was disabled because the gateway could not
    // route native against wrapped — two tokens that share no market and never
    // will, and whose conversion never reaches the router.
    expect(submit().disabled).toBe(false);
    expect(submit().textContent).toMatch(/^(Wrap|Unwrap) /);
  });

  it("quotes it one for one, so the receive field mirrors the amount paid", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "2" } });

    // Anything else here would be an invented rate: the contract mints one
    // for one.
    expect((screen.getByTestId("swap-get-amount") as HTMLInputElement).value).toBe("2");
  });

  it("offers no remainder control, because it cannot partially fill", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "1" } });

    expect(screen.queryByText("Unmatched remainder")).toBeNull();
  });

  it("still refuses more than the balance", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "500" } });

    // The exemption covers the ROUTE, never the funds.
    expect(submit().disabled).toBe(true);
    expect(submit().textContent).toContain("Insufficient");
  });

  it("refuses to submit with no amount", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    expect(submit().disabled).toBe(true);
  });

  it("works in the other direction too, once the legs are flipped", () => {
    mountCard();
    chooseReceive(NATIVE_ROW);
    fireEvent.change(amountField(), { target: { value: "1" } });
    const before = submit().textContent;

    fireEvent.click(screen.getByLabelText("Flip pay and receive"));
    // The flip retires the amount, so retype before judging the gate.
    fireEvent.change(amountField(), { target: { value: "1" } });

    expect(submit().disabled).toBe(false);
    // Wrap one way, unwrap the other — never the same word twice.
    expect(submit().textContent).toMatch(/^(Wrap|Unwrap) /);
    expect(submit().textContent).not.toBe(before);
  });
});
