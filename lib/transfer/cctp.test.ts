import { describe, expect, it } from "vitest";
import {
  BRIDGE_STEP_LABEL,
  bridgeIn,
  describeBridgeFailure,
  ensureSourceChain,
  firstLine,
  humaniseChainError,
} from "./cctp";

describe("describeBridgeFailure", () => {
  it("reports an EIP-1193 rejection as a decision, not a failure", () => {
    // Calling a rejection a failure hides the retry and reads as a broken app.
    expect(describeBridgeFailure({ code: 4001 })).toBe("You declined the transaction.");
  });

  it("recognises a rejection reported only in the message", () => {
    expect(describeBridgeFailure(new Error("User rejected the request"))).toBe(
      "You declined the transaction.",
    );
  });

  it("names insufficient gas rather than saying 'bridge failed'", () => {
    expect(describeBridgeFailure(new Error("insufficient funds for gas * price + value"))).toMatch(
      /gas on the source network/i,
    );
  });

  it("distinguishes a missing asset balance from missing gas", () => {
    expect(describeBridgeFailure(new Error("insufficient balance"))).toMatch(
      /Not enough of that asset/i,
    );
  });

  it("falls back to the message rather than swallowing an unknown error", () => {
    // "nonce too low" used to land here and now has a sentence of its own, which
    // is the improvement — so the fallback is tested with something genuinely
    // unrecognised. Swallowing an unknown cause would be the worse failure.
    expect(describeBridgeFailure(new Error("flux capacitor desynchronised"))).toContain(
      "flux capacitor desynchronised",
    );
  });

  it("handles a non-Error throw without crashing the panel", () => {
    expect(describeBridgeFailure("something odd")).toContain("something odd");
  });
});

describe("BRIDGE_STEP_LABEL", () => {
  it("names every step a user can be waiting on", () => {
    // A spinner with no words is what makes a multi-prompt flow read as stuck.
    // `switch` is first in the real sequence: an injected wallet signs only for
    // the chain it is on, and omitting that step is what made every bridge fail
    // with nothing on screen to read.
    expect(Object.keys(BRIDGE_STEP_LABEL).sort()).toEqual([
      "approve",
      "attest",
      "burn",
      "mint",
      "switch",
    ]);
    for (const label of Object.values(BRIDGE_STEP_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("bridgeIn", () => {
  const provider = {} as never;

  it("refuses a network pair it has no SDK chain for", async () => {
    // RISE, not Ethereum: Ethereum HAS a CCTP domain, and once SDK_CHAINS was
    // built from the SDK instead of two hand-named entries this assertion
    // started passing the pair check and failing later. A chain Circle does not
    // bridge at all is what this case is about.
    const outcome = await bridgeIn(
      { sourceChainId: 11155931, destinationChainId: 5042002, amount: "1", recipient: "0x0", useForwarder: true },
      provider,
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "That network pair is not configured for bridging.",
    });
  });

  it("refuses a self-settled deposit rather than bridging to the sender", async () => {
    // The SDK's adapter-less destination declares `useForwarder: true` as a
    // literal, so a self-settled deposit has no shape at all. The nearest
    // approximation — passing the sender's adapter as the destination — would
    // send the money to the sender's own address on the far chain.
    const outcome = await bridgeIn(
      {
        sourceChainId: 84532,
        destinationChainId: 5042002,
        amount: "1",
        recipient: "0x9fd3000000000000000000000000000000000a41",
        useForwarder: false,
      },
      provider,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/deposits do not support yet/i);
  });
});

describe("SDK_CHAINS coverage", () => {
  it("accepts a chain beyond the two that were hardcoded", async () => {
    /*
     * The bug this pins: SDK_CHAINS held exactly Arc and Base Sepolia, so a
     * route an operator had registered for any other chain reached bridgeIn and
     * was refused as "not configured for bridging" — a chain offered in the
     * panel that could never be used. admin-service had the same two-entry bug
     * and refused 23 of the 25 chains its own picker offered.
     *
     * Arbitrum Sepolia stands in for "any chain we did not name by hand". The
     * call still fails (no provider), but it must get PAST the pair check.
     */
    const outcome = await bridgeIn(
      {
        sourceChainId: 421614,
        destinationChainId: 5042002,
        amount: "1",
        recipient: "0x9fd3000000000000000000000000000000000a41",
        useForwarder: true,
      },
      {} as never,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).not.toMatch(/not configured for bridging/i);
  });

  it("still refuses a chain Circle does not bridge at all", async () => {
    const outcome = await bridgeIn(
      {
        sourceChainId: 11155931, // RISE — no CCTP
        destinationChainId: 5042002,
        amount: "1",
        recipient: "0x9fd3000000000000000000000000000000000a41",
        useForwarder: true,
      },
      {} as never,
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "That network pair is not configured for bridging.",
    });
  });
});

describe("ensureSourceChain", () => {
  function wallet(current: string, onSwitch?: () => void) {
    const calls: string[] = [];
    const provider = {
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        if (method === "eth_chainId") return current;
        if (method === "wallet_switchEthereumChain") {
          onSwitch?.();
          return null;
        }
        return null;
      },
    } as never;
    return { provider, calls };
  }

  it("does not prompt when the wallet is already on the source chain", async () => {
    // wallet_switchEthereumChain is a PROMPT. Firing it blind interrupts anyone
    // depositing a second time from the same network.
    const { provider, calls } = wallet("0x14a34"); // 84532
    await ensureSourceChain(provider, 84532);
    expect(calls).toEqual(["eth_chainId"]);
  });

  it("switches when the wallet is somewhere else", async () => {
    const { provider, calls } = wallet("0x4cef52"); // Arc
    await ensureSourceChain(provider, 84532);
    expect(calls).toContain("wallet_switchEthereumChain");
  });

  it("adds the chain when the wallet does not know it (4902)", async () => {
    /*
     * The normal case for a bridge source: these are testnets Iter does not
     * serve, so most wallets have never been configured for them. 4902 is a
     * request to add, not a failure — and the details come from the SDK, since
     * externalFunding's version reads wagmiChains and would refuse every one.
     */
    const calls: string[] = [];
    const provider = {
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        if (method === "eth_chainId") return "0x4cef52";
        if (method === "wallet_switchEthereumChain") {
          throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
        }
        return null;
      },
    } as never;

    await ensureSourceChain(provider, 421614); // Arbitrum Sepolia
    expect(calls).toContain("wallet_addEthereumChain");
  });

  it("does not swallow a refusal that is not 4902", async () => {
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0x4cef52";
        throw Object.assign(new Error("User rejected"), { code: 4001 });
      },
    } as never;
    await expect(ensureSourceChain(provider, 84532)).rejects.toThrow(/rejected/i);
  });
});

describe("humaniseChainError", () => {
  it("turns viem's fee-cap dump into one actionable sentence", () => {
    /*
     * What the panel actually printed, under a Deposit button:
     *
     *   The bridge stopped at batch: The fee cap (maxFeePerGas 0.292696 gwei)
     *   cannot be lower than the block base fee. Request Arguments: chain:
     *   Arbitrum Sepolia (id: 421614) from: 0xF8FB… Details: RPC 0x66eee Custom
     *   eth_sendRawTransaction: max fee per gas less than block base fee:
     *   address 0xF8FB…, maxFeePerGas: 292696000 baseFee: 294478000 Version:
     *   viem@2.55.0
     *
     * Not a hard error to understand — an error nobody reads. The one word that
     * matters ("retry") is buried in 300 characters of diagnostics.
     */
    const raw =
      "The fee cap (maxFeePerGas 0.292696 gwei) cannot be lower than the block base fee. " +
      "Request Arguments: chain: Arbitrum Sepolia (id: 421614) Details: RPC Custom " +
      "eth_sendRawTransaction: max fee per gas less than block base fee Version: viem@2.55.0";
    expect(humaniseChainError(raw)).toBe(
      "Network fees moved while this was submitting. Try again.",
    );
  });

  it("distinguishes a stale nonce from a fee problem", () => {
    expect(humaniseChainError("nonce too low")).toMatch(/finishing an earlier transaction/i);
    expect(humaniseChainError("replacement transaction underpriced")).toMatch(
      /finishing an earlier transaction/i,
    );
  });

  it("says nothing was sent when the chain refused it", () => {
    // The expensive mistake on a transfer screen is sending twice, so a refusal
    // has to say the money did not move.
    expect(humaniseChainError("execution reverted")).toMatch(/nothing was sent/i);
    expect(humaniseChainError("request timed out")).toMatch(/nothing was sent/i);
  });

  it("returns null for anything it does not recognise, rather than guessing", () => {
    expect(humaniseChainError("something entirely new")).toBeNull();
  });
});

describe("firstLine", () => {
  it("drops viem's Request Arguments, Details and Version blocks", () => {
    const raw = "Something broke. Request Arguments: chain: X Details: RPC Version: viem@2.55.0";
    expect(firstLine(raw)).toBe("Something broke.");
  });
});
