import { describe, expect, it } from "vitest";
import { resolveGasStatus } from "./gasStatus";

const base = { isConnected: true, isLoading: false, isError: false, value: BigInt(1) };

describe("resolveGasStatus", () => {
  it("a positive balance is ok", () => {
    expect(resolveGasStatus(base)).toBe("ok");
  });

  it("exactly zero is empty — the only threshold that means the same on every chain", () => {
    expect(resolveGasStatus({ ...base, value: BigInt(0) })).toBe("empty");
  });

  it("one wei is ok, not empty", () => {
    // Deliberately no "low" threshold: low needs a per-transaction gas estimate,
    // and a fixed floor blocks affordable sends on a cheap L2 while passing
    // unaffordable ones on a busy chain.
    expect(resolveGasStatus({ ...base, value: BigInt(1) })).toBe("ok");
  });

  it("a LOADING balance is unknown, never empty", () => {
    // This is the rule that makes the gate safe to put in front of a send: an
    // unread balance must not block a transaction, or a slow RPC becomes a
    // deposit prompt over a wallet that is perfectly funded.
    expect(resolveGasStatus({ ...base, isLoading: true, value: undefined })).toBe("unknown");
  });

  it("a FAILED read is unknown, never empty", () => {
    expect(resolveGasStatus({ ...base, isError: true, value: undefined })).toBe("unknown");
  });

  it("a failed read is unknown even when a stale value is still cached", () => {
    expect(resolveGasStatus({ ...base, isError: true, value: BigInt(0) })).toBe("unknown");
  });

  it("no connected wallet is unknown — the connect gate owns that case", () => {
    expect(resolveGasStatus({ ...base, isConnected: false, value: BigInt(0) })).toBe("unknown");
  });

  it("undefined with no error and no loading is still unknown", () => {
    expect(resolveGasStatus({ ...base, value: undefined })).toBe("unknown");
  });
});
