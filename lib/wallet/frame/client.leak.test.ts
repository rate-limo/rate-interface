/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The readiness path retries, so anything it attaches has to be attached once.
 *
 * `ensure()` memoises through `ready`, which hides this on the happy path: the
 * leak only shows when readiness FAILS and the next call builds a second frame.
 * A wallet origin that is down, misconfigured, or blocked by an extension is
 * exactly the case that repeats.
 */
describe("wallet frame client does not accumulate listeners", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("attaches one message listener across repeated readiness timeouts", async () => {
    vi.useFakeTimers();
    const add = vi.spyOn(window, "addEventListener");

    const { walletFrame } = await import("./client");

    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      const failed = walletFrame.status().catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const err = await failed;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/did not answer/);
    }

    const messageListeners = add.mock.calls.filter(([type]) => type === "message");
    expect(messageListeners.length).toBe(1);
  });

  it("rejects in-flight requests when the frame is torn down, rather than stranding them", async () => {
    vi.useFakeTimers();
    const { walletFrame } = await import("./client");

    // A request cannot outlive the frame it was sent to: requests carry no
    // timeout of their own, so without this it waits forever and its closures
    // stay in the pending map.
    const inflight = walletFrame.status().catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await inflight).toBeInstanceOf(Error);
  });
});
