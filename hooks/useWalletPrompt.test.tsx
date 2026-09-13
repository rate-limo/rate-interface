// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletPrompt } from "./useWalletPrompt";

/**
 * The escalation, pinned — because every property here is one you cannot see by
 * using the feature once, and the failure mode is silence.
 */
describe("useWalletPrompt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle and goes to waiting only when asked", () => {
    const { result } = renderHook(() => useWalletPrompt());
    expect(result.current.stage).toBe("idle");
    act(() => result.current.begin());
    expect(result.current.stage).toBe("waiting");
  });

  it("escalates to a hint, then to alternatives, and stops there", () => {
    const { result } = renderHook(() => useWalletPrompt());
    act(() => result.current.begin());

    act(() => void vi.advanceTimersByTime(3_999));
    expect(result.current.stage).toBe("waiting");

    act(() => void vi.advanceTimersByTime(2));
    expect(result.current.stage).toBe("hint");

    act(() => void vi.advanceTimersByTime(11_000));
    expect(result.current.stage).toBe("alternatives");

    // NEVER a failure state, however long it waits. A timeout that reset the
    // button would leave an approvable request in the wallet: approved two
    // minutes later, the funds move and the app is no longer watching.
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(result.current.stage).toBe("alternatives");
  });

  it("does NOT restart the clock when the next dialog opens", () => {
    // A deposit is three prompts. Restarting per step means a user stuck on the
    // third never sees the hint, because the first two kept moving the goalposts.
    const { result } = renderHook(() => useWalletPrompt());
    act(() => result.current.begin());

    act(() => void vi.advanceTimersByTime(3_000));
    act(() => result.current.report("switch"));
    act(() => void vi.advanceTimersByTime(1_500));

    expect(result.current.stage).toBe("hint");
    expect(result.current.step).toBe("switch");
  });

  it("names the wallet it is waiting on", () => {
    const { result } = renderHook(() => useWalletPrompt());
    const wallet = { rdns: "io.metamask", name: "MetaMask", icon: "", provider: {} as never };
    act(() => result.current.begin(wallet));
    expect(result.current.wallet?.name).toBe("MetaMask");
  });

  it("end() clears the stage and cancels pending escalation", () => {
    const { result } = renderHook(() => useWalletPrompt());
    act(() => result.current.begin());
    act(() => result.current.end());
    expect(result.current.stage).toBe("idle");

    // The timers from the finished request must not fire onto the next one.
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.stage).toBe("idle");
  });

  it("a second begin() restarts the escalation from waiting", () => {
    const { result } = renderHook(() => useWalletPrompt());
    act(() => result.current.begin());
    act(() => void vi.advanceTimersByTime(20_000));
    expect(result.current.stage).toBe("alternatives");

    act(() => result.current.begin());
    expect(result.current.stage).toBe("waiting");
    expect(result.current.step).toBeNull();
  });
});
