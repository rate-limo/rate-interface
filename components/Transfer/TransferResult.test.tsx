// @vitest-environment jsdom
/**
 * The withdrawal result screen.
 *
 * Every assertion is something a user acts on after their money has moved: what
 * the screen CLAIMS happened, whether the hash is reachable, and whether a
 * failure is distinguishable from a success at a glance.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransferResult } from "./TransferResult";

const ARC = 5042002;

const transfer = {
  hash: "0x982b2e71cce6a41f0d9b5c73e8a2f4d16b0c9e3a7d5418f6ba2c0e91d7f3a5b8",
  chainId: ARC,
  kind: "withdraw" as const,
  account: "0x1ABE6d936A198B7B24842d53e480e06002180784",
  symbol: "USDC",
  amount: "1",
  peer: "0xF8FB4672170607C95663f4Cc674dDb1386b7CfE0",
};

/** gasUsed x effectiveGasPrice, in the chain's NATIVE decimals (18 on Arc). */
const receipt = { blockNumber: BigInt(61229704), feeWei: BigInt("130000000000000") };

const copied = vi.hoisted(() => ({ ok: true, calls: [] as string[] }));
vi.mock("@/lib/clipboard", () => ({
  copyText: (text: string) => {
    copied.calls.push(text);
    return Promise.resolve(copied.ok);
  },
}));

function show(status: "confirming" | "confirmed" | "reverted", withReceipt = true) {
  render(
    <TransferResult
      status={status}
      transfer={transfer}
      receipt={withReceipt && status !== "confirming" ? receipt : null}
      onDismiss={() => {}}
      onRetry={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  copied.ok = true;
  copied.calls = [];
});

describe("what the screen claims", () => {
  it("says Sent only on a confirmed receipt", () => {
    show("confirmed");
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("says Confirming while there is no verdict, NEVER Sent", () => {
    /*
     * A reverted transaction has a receipt too, so broadcast is not success.
     * Announcing "Sent" here is the failure this whole screen exists to avoid.
     */
    show("confirming");
    expect(screen.getByText("Confirming")).toBeTruthy();
    expect(screen.queryByText("Sent")).toBeNull();
  });

  it("says Not sent on a revert, and that the funds did not move", () => {
    show("reverted");
    expect(screen.getByText("Not sent")).toBeTruthy();
    expect(screen.getByText(/funds did not move/i)).toBeTruthy();
  });

  it("never claims the money left on a failure", () => {
    show("reverted");
    expect(screen.queryByText(/never held this/i)).toBeNull();
  });
});

describe("the transaction hash", () => {
  it("is copyable while still confirming — it exists at broadcast", () => {
    show("confirming");
    fireEvent.click(screen.getByLabelText("Copy transaction hash"));
    expect(copied.calls).toEqual([transfer.hash]);
  });

  it("copies the FULL hash even though the row shows it shortened", () => {
    // Pasting a truncated hash into an explorer finds nothing.
    show("confirmed");
    fireEvent.click(screen.getByLabelText("Copy transaction hash"));
    expect(copied.calls[0]).toBe(transfer.hash);
    expect(copied.calls[0]!.length).toBe(66);
  });

  it("says so when the copy failed, rather than looking identical", async () => {
    copied.ok = false;
    show("confirmed");
    fireEvent.click(screen.getByLabelText("Copy transaction hash"));
    expect(await screen.findByLabelText(/Could not copy/i)).toBeTruthy();
  });

  it("links to the chain's OWN explorer, named", () => {
    // Arc's is Arcscan. A button reading "View on explorer" makes the user
    // press it to find out where it goes.
    show("confirmed");
    const link = screen.getByLabelText(/Open transaction on Arcscan/i);
    expect(link.getAttribute("href")).toBe(`https://testnet.arcscan.app/tx/${transfer.hash}`);
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("the receipt figures", () => {
  it("names the block it landed in", () => {
    show("confirmed");
    expect(screen.getByText(/block 61,229,704/)).toBeTruthy();
  });

  it("formats the fee in the chain's NATIVE decimals, not the token's", () => {
    /*
     * THE ARC TRAP. The fee is 1.3e14 wei. At the native 18 decimals that is
     * 0.00013 USDC; read with the USDC contract's 6 it would print 130,000,000
     * — a 10^12 error, on a screen accounting for the user's money.
     */
    show("confirmed");
    expect(screen.getByText("0.00013 USDC")).toBeTruthy();
  });

  it("shows the fee on a REVERT too, because it was still charged", () => {
    show("reverted");
    expect(screen.getByText("0.00013 USDC")).toBeTruthy();
  });

  it("omits the fee rather than inventing one before the receipt lands", () => {
    show("confirming");
    expect(screen.queryByText(/USDC$/)).not.toBe(screen.queryByText("0.00013 USDC"));
    expect(screen.queryByText("0.00013 USDC")).toBeNull();
  });

  it("on Tempo, prices the fee in the TIP-20 the receipt names, at 1e18", () => {
    /*
     * Tempo has no gas coin; its registry nativeCurrency is a 6-decimal "USD"
     * placeholder. 58,735 gas at 0.6 gwei read at 6 decimals printed
     * "35241000.058735 USD" -- the real charge was $0.000035241 of AlphaUSD.
     */
    render(
      <TransferResult
        status="confirmed"
        transfer={{ ...transfer, chainId: 42431, symbol: "PathUSD" }}
        receipt={{
          blockNumber: BigInt(38600000),
          feeWei: BigInt(58735) * BigInt(600000000),
          feeToken: "0x20c0000000000000000000000000000000000001",
        }}
        onDismiss={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("0.000035241 AlphaUSD")).toBeTruthy();
  });
});

describe("actions", () => {
  it("offers nothing to dismiss while confirming", () => {
    // Dismissing here would hide the only record of an in-flight transfer.
    show("confirming");
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("offers Done on success and Try again on failure", () => {
    show("confirmed");
    expect(screen.getByText("Done")).toBeTruthy();
    cleanup();
    show("reverted");
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});

describe("the recipient", () => {
  it("shows the full address and copies it", () => {
    show("confirmed");
    expect(screen.getByText(transfer.peer)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Copy recipient address"));
    expect(copied.calls).toEqual([transfer.peer]);
  });
});
