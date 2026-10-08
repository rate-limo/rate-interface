// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();
vi.mock("@/lib/realtime/ws-url", () => ({
  getWsUrl: (network: string) => (network ? `wss://example.test/${network}` : ""),
}));
vi.mock("@/lib/realtime/socket-manager", () => ({
  getSocketManager: () => ({ subscribe }),
}));

import { useLaunchAnnouncements } from "./useLaunchAnnouncements";
import { eventToSpotLaunchStream, type SpotLaunchEvent } from "@/types";

const COIN = "0x5214C80446eED8546e21434700959bB883f99560";

function launchFrame(coin = COIN) {
  return eventToSpotLaunchStream({
    eventId: "spotLaunch",
    coin,
    symbol: "VFCBER",
    name: "Verifiable Cabernet",
    creator: "0x1111111111111111111111111111111111111111",
    quote: "USDC",
    txHash: "0xdead",
    timestamp: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  } as SpotLaunchEvent);
}

/** The handlers the hook registered, so a test can drive the socket. */
function handlers() {
  return subscribe.mock.calls[0]![2] as {
    onBatch: (b: { d: unknown[][] }) => void;
    onResync: () => void;
  };
}

describe("useLaunchAnnouncements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribe.mockReset();
    subscribe.mockReturnValue(() => {});
  });
  afterEach(() => vi.useRealTimers());

  /*
   * The method strings are the seam: the gateway derives its room from them by
   * splitting on dots, and an unrecognised method is answered with `null` —
   * silently, with no error anywhere. `apps/gateway/src/launchTopic.test.ts`
   * pins the same three literals from the other side.
   */
  it("subscribes to the venue-wide room with the methods the gateway parses", () => {
    renderHook(() => useLaunchAnnouncements("arc-testnet", vi.fn()));

    expect(subscribe).toHaveBeenCalledTimes(1);
    const [topic, request] = subscribe.mock.calls[0]!;
    expect(topic).toBe("spotLaunch:all");
    expect(request).toMatchObject({
      method: "spot.launches.subscribe.all",
      unsubscribeMethod: "spot.launches.unsubscribe.all",
    });
  });

  it("asks for a refetch once a launch is announced", () => {
    const onAnnounced = vi.fn();
    renderHook(() => useLaunchAnnouncements("arc-testnet", onAnnounced));

    act(() => handlers().onBatch({ d: [launchFrame() as unknown as unknown[]] }));
    // Settles first: the refetch is deliberately not synchronous with the frame.
    expect(onAnnounced).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(400));
    expect(onAnnounced).toHaveBeenCalledTimes(1);
  });

  it("folds a burst of launches into ONE refetch", () => {
    // Scripted mints and replays arrive together. One fetch answers all of
    // them, because the fetch returns the whole page either way.
    const onAnnounced = vi.fn();
    renderHook(() => useLaunchAnnouncements("arc-testnet", onAnnounced));

    act(() => {
      handlers().onBatch({
        d: [
          launchFrame("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
          launchFrame("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
          launchFrame("0xcccccccccccccccccccccccccccccccccccccccc"),
        ] as unknown as unknown[][],
      });
    });
    act(() => void vi.advanceTimersByTime(400));

    expect(onAnnounced).toHaveBeenCalledTimes(1);
  });

  it("refetches on resync, because a launch missed in a gap never comes again", () => {
    // A trade feed self-corrects — the next trade carries the current state. A
    // launch does not: miss the frame and that coin is never announced twice.
    const onAnnounced = vi.fn();
    renderHook(() => useLaunchAnnouncements("arc-testnet", onAnnounced));

    act(() => handlers().onResync());
    act(() => void vi.advanceTimersByTime(400));

    expect(onAnnounced).toHaveBeenCalledTimes(1);
  });

  it("ignores a frame it cannot decode instead of throwing", () => {
    // `streamToEvent` warns and returns null rather than throwing, so one bad
    // frame must not reach the refetch — nor take down the batch it arrived in.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onAnnounced = vi.fn();
    renderHook(() => useLaunchAnnouncements("arc-testnet", onAnnounced));

    act(() => handlers().onBatch({ d: [["spotLaunch", "not-a-launch"]] }));
    act(() => void vi.advanceTimersByTime(400));

    expect(onAnnounced).not.toHaveBeenCalled();
    // Dropped LOUDLY: a frame the venue sent and this app could not read is a
    // schema drift between broker and client, and the silent version of that
    // bug is what the shared codec exists to prevent.
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("unsubscribes on unmount and cannot fire afterwards", () => {
    // The point of the cleanup: a pending settle timer must not survive the
    // component and call a refetch on a query that is gone.
    const unsubscribe = vi.fn();
    subscribe.mockReturnValue(unsubscribe);
    const onAnnounced = vi.fn();
    const { unmount } = renderHook(() =>
      useLaunchAnnouncements("arc-testnet", onAnnounced),
    );

    act(() => handlers().onBatch({ d: [launchFrame() as unknown as unknown[]] }));
    unmount();
    act(() => void vi.advanceTimersByTime(5_000));

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(onAnnounced).not.toHaveBeenCalled();
  });

  it("does not subscribe at all when the network has no socket", () => {
    renderHook(() => useLaunchAnnouncements("", vi.fn()));
    expect(subscribe).not.toHaveBeenCalled();
  });
});
