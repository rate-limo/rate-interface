// @vitest-environment jsdom
/**
 * The deposit panel, rendered.
 *
 * This screen has the highest cost of being wrong in the app: a user reads the network off
 * it and sends real funds. A passkey address exists on every EVM chain, so a send on the
 * wrong one is accepted by that network and unrecoverable — the key lives in a mera
 * session and this app only serves `wagmiChains`. Everything asserted below is a fact
 * someone acts on, not a styling detail.
 *
 * `qrcode` is stubbed rather than run: it is a well-tested library, its output is a PNG
 * data URI jsdom cannot decode anyway, and what matters here is the URI handed TO it —
 * which `lib/wallet/gasDeposit.test.ts` pins separately. The stub lets this file assert
 * that the encoder is called with the EIP-681 string and that the result reaches an
 * `<img>`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { closeWalletConnect, readConnectRequest } from "@/lib/wallet/connectGate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositPanel } from "./DepositPanel";
import { closeGasDeposit, openGasDeposit, useGasDeposit } from "@/lib/wallet/gasDeposit";

/**
 * What `/deposit` mounts: the store drives the panel's `request` prop.
 *
 * The panel takes the request rather than reading the store itself, so the page
 * and the (now deleted) dialog could share one body. Driving it through the
 * store here keeps these tests exercising the same path the app does, and keeps
 * `openGasDeposit` as the way a test says "the user asked to deposit".
 */
function Harness() {
  return <DepositPanel open={useGasDeposit()} onDone={closeGasDeposit} />;
}

const ADDRESS = "0x1ABE6d936A198B7B24842d53e480e06002180784";

const account = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account.current }),
  // The panel watches a submitted deposit to its receipt. Nothing here submits
  // one, so the client is never used — it only has to exist.
  usePublicClient: () => null,
}));

const toDataURL = vi.hoisted(() =>
  vi.fn(async (_uri: string, _opts?: unknown) => "data:image/png;base64,STUB"),
);
vi.mock("qrcode", () => ({ default: { toDataURL } }));

/**
 * Only the HOOK is stubbed, so no `/chain-brand` request happens in jsdom. The pure
 * helpers stay real — a blanket module mock dropped `nativeIconFrom`, which
 * `TokenImageIcon` calls internally, and every render then threw. With no brand data the
 * icon falls back to initials, which is exactly what a chain with no operator upload
 * renders in the app.
 */
vi.mock("@/lib/chains/useChainBrand", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chains/useChainBrand")>()),
  useChainBrand: () => ({ data: undefined }),
}));

/**
 * Same treatment, same reason: `useVisibleChains` is a `useQuery`, and this suite
 * renders the sheet without a QueryClientProvider. Stubbing the hook rather than
 * the module keeps the operator-filter logic itself under its own tests.
 *
 * Both chains are returned so the sheet behaves as it does in production, where
 * the picker appears whenever the caller named no chain.
 */
/**
 * Stubbed for the same reason as the hooks below, plus one of its own: it reaches
 * `wagmiConfig`, which calls the real `createConfig` — and this suite mocks
 * `wagmi` down to `useAccount`. The curation rules themselves have their own
 * tests in `lib/wallet/depositAssets.test.ts`; what THIS suite is for is the
 * network warning and the address.
 *
 * It used to be EMPTY, because a test could name the chain directly with
 * `openGasDeposit({ chainId })` and skip the list. That parameter is gone —
 * choosing an asset is the only way to settle a network now — so the fixtures
 * are real and every test below goes through the list, which is also the path
 * every user takes.
 *
 * `verified: true` is what puts a token in the curated default; an unverified
 * one is reachable only by search. Both are `native`, so they are the gas asset
 * of their chain — Arc charges in USDC and RISE in ETH, which is the whole
 * point of the first two assertions.
 */
const assets = vi.hoisted(() => {
  const make = (
    symbol: string,
    id: string,
    decimals: number,
    chainId: number,
    chainName: string,
  ) => ({
    token: {
      id,
      symbol,
      name: symbol,
      decimals,
      logoURI: null,
      balance: "0",
      verified: true,
      creator: "",
    },
    chainId,
    chainName,
    native: true,
  });
  return [
    make("USDC", "0x3600000000000000000000000000000000000000", 6, 5042002, "Arc Testnet"),
    make("ETH", "0x0000000000000000000000000000000000000001", 18, 11155931, "RISE Testnet"),
  ];
});

vi.mock("@/hooks/useDepositAssets", () => ({
  useDepositAssets: () => ({ assets, isLoading: false }),
}));

// The cross-chain section reads the route registry through react-query, and
// this file mounts the panel without a QueryClientProvider — the same reason
// `useDepositAssets` is mocked above. An empty list is also the SHIPPED state,
// so this mock is what the panel actually renders until a route is proved.
vi.mock("@/hooks/useTransferRoutes", () => ({
  useTransferRoutes: () => ({ routes: [], isLoading: false }),
}));

// Same reason: it reads two dozen public RPCs through react-query, and this file
// mounts the panel without a QueryClientProvider. useQuery needs the provider
// even when `enabled` is false.
vi.mock("@/hooks/useSourceBalances", () => ({
  useSourceBalances: () => ({ balances: new Map(), isLoading: false }),
}));

vi.mock("@/lib/chains/useVisibleChains", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chains/useVisibleChains")>()),
  useVisibleChains: () => ["Arc Testnet", "RISE Testnet"],
}));

beforeEach(() => {
  account.current = ADDRESS;
  toDataURL.mockClear();
});

afterEach(() => {
  closeGasDeposit();
  cleanup();
});

/**
 * Pick an asset from the list, which is how every deposit now starts.
 *
 * The row carries the symbol and its chain, so the regex has to match both — a
 * venue where anyone can mint a coin called USDC is exactly one where "the USDC
 * row" is not a unique thing to click.
 */
async function chooseAsset(label: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
}

describe("DepositPanel", () => {
  it("renders nothing until something opens it", () => {
    // The page mounts this before it is open, so an un-opened panel has to be
    // empty rather than a heading over a blank form.
    render(<Harness />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("names the chain, its id, and the asset chosen", async () => {
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);

    // Arc charges its fee in USDC, not ETH. Getting this wrong asks the user for an
    // asset that does not exist on the chain they are on.
    expect(await screen.findByText("Deposit USDC")).toBeTruthy();
    expect(screen.getByText("USDC on Arc Testnet")).toBeTruthy();
    // The id travels with the name because wallets label the same network differently
    // while the number is exact — it is what a user checks their wallet against.
    expect(screen.getByText("Chain ID 5042002")).toBeTruthy();
  });

  it("says ETH on RISE, so the asset is never assumed", async () => {
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/ETH.*RISE Testnet/);

    expect(await screen.findByText("Deposit ETH")).toBeTruthy();
    expect(screen.getByText("Chain ID 11155931")).toBeTruthy();
  });

  it("encodes the chain into the QR, so a wallet does not have to guess the network", async () => {
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    // EIP-681. A bare address scans on any network, and a passkey address
    // exists on all of them.
    expect(toDataURL.mock.calls[0][0]).toBe(`ethereum:${ADDRESS}@5042002`);
    const qr = await screen.findByRole("img", { name: /QR code/i });
    expect(qr.getAttribute("src")).toBe("data:image/png;base64,STUB");
  });

  it("shows the address in full, never truncated", async () => {
    // The middle is exactly where a lookalike address differs, so an ellipsis
    // defeats the check the user is making against their wallet screen.
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);
    expect(await screen.findByText(ADDRESS)).toBeTruthy();
  });

  it("states the consequence of sending on another network", async () => {
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);
    expect(await screen.findByText(/Arc Testnet only\./)).toBeTruthy();
  });

  it("names the ITER ACCOUNT, not a wallet, when there is no address to deposit to", async () => {
    /*
     * Two different things are called a wallet on this screen: the passkey
     * account funds arrive IN, and the browser extension they are sent FROM.
     * "No wallet is connected" read as the second, so a user looking at the
     * external-wallet step below it was told to connect what they had just
     * connected. The destination is the one that is missing, and it is an
     * account, unlocked by a passkey.
     */
    account.current = undefined;
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);

    expect(await screen.findByText(/Iter account/)).toBeTruthy();
    expect(screen.getByText(/passkey/i)).toBeTruthy();
    // No QR either: a code with no address in it would scan to nowhere.
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("OFFERS the sign-in rather than describing where to find it", async () => {
    /*
     * The copy used to say "Use Connect Wallet at the top of the page", and on a
     * narrow viewport — or any page whose shell chrome is hidden — there is no
     * such control on screen. An instruction pointing at a button the reader
     * cannot see is worse than no instruction: it reads as the app being broken.
     *
     * WithdrawPanel's own sign-in state already made this call, in the same
     * directory, with the reason written beside it: the session ending is not a
     * mistake the user made, and the fix is one tap, so it is offered rather
     * than described. This is that fix applied to its sibling.
     */
    account.current = undefined;
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);

    const cta = await screen.findByRole("button", { name: /sign in/i });
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(readConnectRequest().open).toBe(true);

    // And the stale directions are gone, not merely supplemented.
    expect(screen.queryByText(/at the top of the page/i)).toBeNull();
  });

  it("draws NO address or code until an asset settles the network", async () => {
    // The guard that matters. Opened, a chain still resolves when only one is
    // visible — but an inferred chain is not a choice, and a scannable code
    // naming no network is what EIP-681 exists to prevent.
    render(<Harness />);
    openGasDeposit();

    expect(await screen.findByPlaceholderText(/Search any token/)).toBeTruthy();
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("asks for an asset first, rather than guessing a network", async () => {
    // The account menu used to open this with a chain named in the URL, and the
    // panel answered by skipping the list entirely. On a venue where a send on
    // the wrong chain is unrecoverable, the asset is asked for first — and the
    // asset carries the chain, so there is nothing left to guess.
    render(<Harness />);
    openGasDeposit();

    expect(await screen.findByPlaceholderText(/Search any token/)).toBeTruthy();
    // Nothing that would need a network it does not have.
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.queryByText(/Chain ID/)).toBeNull();
    expect(screen.queryByText(/only\./)).toBeNull();
  });
});

/**
 * A wallet extension as this page actually meets one: it announces itself over
 * EIP-6963 and otherwise waits to be spoken to. Its `request` THROWS, so any
 * call at all fails loudly rather than being answered into a passing test.
 */
function announceWallet(rdns: string, name: string, icon = "") {
  const request = vi.fn(async () => {
    throw new Error(`${name} was asked something before the user chose it`);
  });
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { rdns, name, icon }, provider: { request } },
      }),
    );
  window.addEventListener("eip6963:requestProvider", announce);
  return {
    request,
    cleanup: () => window.removeEventListener("eip6963:requestProvider", announce),
  };
}

describe("the wallet picker", () => {
  const PIXEL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

  it("renders the wallet's OWN mark, which the announcement already carries", async () => {
    /*
     * `DiscoveredWallet.icon` was populated from the day discovery was written
     * and nothing rendered it. It arrives as a data: URI on the announcement —
     * no network request, no third-party host — so this is not the hotlinked
     * icon mistake `getChainIconUrl` was deleted for.
     */
    const mm = announceWallet("io.metamask", "MetaMask", PIXEL);
    // `hasInjectedProvider()` gates the whole block on `window.ethereum`; without
    // it the section is hidden entirely and there is no row to find.
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      const row = await screen.findByRole("button", { name: /MetaMask/ });
      expect(row.querySelector("img")?.getAttribute("src")).toBe(PIXEL);
    } finally {
      mm.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });

  it("falls back to an initial when a wallet announces no icon", async () => {
    // An extension may announce an empty icon, and a broken image in a row about
    // which account signs is worse than a plain letter.
    const mm = announceWallet("io.metamask", "MetaMask");
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      const row = await screen.findByRole("button", { name: /MetaMask/ });
      expect(row.querySelector("img")).toBeNull();
      expect(row.textContent).toContain("M");
    } finally {
      mm.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });

  it("shows the single installed wallet by name, not a generic button", async () => {
    /*
     * The blind spot this closes: the name chips only rendered above ONE wallet,
     * so with exactly one installed the control said "Connect your wallet" and
     * the user could not tell which extension they were about to authorise.
     */
    const mm = announceWallet("io.metamask", "MetaMask", PIXEL);
    // `hasInjectedProvider()` gates the whole block on `window.ethereum`; without
    // it the section is hidden entirely and there is no row to find.
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      expect(await screen.findByRole("button", { name: /MetaMask/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Connect your wallet/i })).toBeNull();
    } finally {
      mm.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });

  it("says so when no browser wallet is installed, instead of omitting the step", async () => {
    /*
     * The block was hidden outright without a provider. Sound for a phone —
     * there is no extension to install, so a dead Connect button would tell that
     * user to do something they cannot — but it also hid the step from a desktop
     * user with no wallet, who then saw a deposit screen that skips the part
     * everyone else gets. Absent reads as broken.
     *
     * The copy has to be true in both places, which is why it names the QR
     * already on the page and asks nobody to install anything: no phone/desktop
     * sniffing needed.
     */
    render(<Harness />);
    openGasDeposit();
    await chooseAsset(/USDC.*Arc Testnet/);

    expect(await screen.findByText(/no browser wallet found/i)).toBeTruthy();
    expect(screen.getByText(/send USDC to the address below/i)).toBeTruthy();
  });

  it("does NOT say that when a wallet is installed", async () => {
    const mm = announceWallet("io.metamask", "MetaMask", PIXEL);
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      expect(await screen.findByRole("button", { name: /MetaMask/ })).toBeTruthy();
      expect(screen.queryByText(/no browser wallet found/i)).toBeNull();
    } finally {
      mm.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });

  it("connects on the row itself — no separate, disabled button", async () => {
    // Choosing and connecting were two clicks for one decision, and the button
    // sat disabled until a chip was picked.
    const mm = announceWallet("io.metamask", "MetaMask", PIXEL);
    // `hasInjectedProvider()` gates the whole block on `window.ethereum`; without
    // it the section is hidden entirely and there is no row to find.
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      expect(screen.queryByRole("button", { name: /Choose a wallet above/i })).toBeNull();

      const row = await screen.findByRole("button", { name: /MetaMask/ });
      fireEvent.click(row);
      // The click reaches the wallet: the fixture throws when asked anything,
      // which is exactly the proof that it was asked.
      await waitFor(() => expect(mm.request).toHaveBeenCalled());
    } finally {
      mm.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });
});

describe("what it asks of the wallets you have installed", () => {
  it("speaks to NO wallet before one is connected", async () => {
    /*
     * The regression this exists for: the panel used to probe every discovered
     * wallet as it opened — `eth_chainId`, then `eth_accounts` — to filter and
     * order the list. Those are silent in MetaMask and Rabby and are not silent
     * everywhere: a wallet that reads the first request from an unknown origin
     * as a request to connect opened its approval popup, so merely visiting
     * /deposit raised a dialog from an extension nobody had picked.
     *
     * `?chainId=` is the hard case and the one that was reported. It settles
     * the asset on the first frame, so a gate of "probe once an asset is
     * chosen" would still fire here. The rule has to be that the FIRST request
     * belongs to the Connect click.
     */
    const metamask = announceWallet("io.metamask", "MetaMask");
    const other = announceWallet("com.example.other", "Other Wallet");
    (window as { ethereum?: unknown }).ethereum = { request: vi.fn() };
    try {
      render(<Harness />);
      openGasDeposit();
      await chooseAsset(/USDC.*Arc Testnet/);

      // Both are offered, which is how we know discovery finished. Matched
      // loosely because each row now carries its own action — the accessible
      // name is "Other Wallet Connect", not the bare name it was when choosing
      // and connecting were two separate controls.
      expect(await screen.findByRole("button", { name: /Other Wallet/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: /MetaMask/ })).toBeTruthy();
      // ...and neither has been asked anything to get there.
      expect(metamask.request).not.toHaveBeenCalled();
      expect(other.request).not.toHaveBeenCalled();
    } finally {
      metamask.cleanup();
      other.cleanup();
      delete (window as { ethereum?: unknown }).ethereum;
    }
  });
});
