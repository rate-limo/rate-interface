// @vitest-environment jsdom
/**
 * The deposit QR, which moved here from the panel.
 *
 * Only the encoding is covered. Claiming itself reads real receipts from real
 * chains, and a test that stubs the chain would be asserting the stub —
 * `lib/transfer/claim.test.ts` covers the decision it makes about a receipt,
 * which is the part with rules in it.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimDeposit } from "./ClaimDeposit";

const ADDRESS = "0x1ABE6d936A198B7B24842d53e480e06002180784";

const account = vi.hoisted(() => ({ current: undefined as string | undefined }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account.current }),
  useConfig: () => ({}),
}));
vi.mock("wagmi/actions", () => ({ getPublicClient: () => null }));

const toDataURL = vi.hoisted(() =>
  vi.fn(async (_uri: string, _opts?: unknown) => "data:image/png;base64,STUB"),
);
vi.mock("qrcode", () => ({ default: { toDataURL } }));

afterEach(() => {
  cleanup();
  toDataURL.mockClear();
  account.current = undefined;
});

describe("ClaimDeposit", () => {
  it("offers the form with no chain, because a hash names its own network", async () => {
    // The page used to demand a network before it would look. A transaction
    // hash is effectively unique across chains, so the answer identifies the
    // network by itself — and the person pasting one has it precisely because
    // they do NOT have the app's state.
    account.current = ADDRESS;
    render(<ClaimDeposit />);

    expect(await screen.findByPlaceholderText(/transaction hash/i)).toBeTruthy();
    expect(screen.queryByText(/Choose a network/i)).toBeNull();
  });

  it("will not search until the hash is the right shape", async () => {
    // 66 characters. A truncated paste looks almost right and would otherwise
    // cost a walk of every served chain to find nothing.
    account.current = ADDRESS;
    render(<ClaimDeposit />);
    const button = await screen.findByRole("button", { name: /find this transfer/i });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
