// @vitest-environment jsdom
/**
 * `spot-balance-refetch` reaching wagmi's own balance reads.
 *
 * What this file exists for: the event was emitted at the swap receipt, two
 * hooks subscribed, and the SWAP CARD used neither of them — it reads both legs
 * through wagmi's `useBalance`, whose query nothing invalidated. A confirmed
 * swap left the balance rows directly above the amount field showing pre-trade
 * figures until something happened to remount them.
 *
 * The assertions are on the WIRING, not on a balance. A test that mocked wagmi
 * in order to prove wagmi refetches would prove nothing; what can go wrong here
 * is the subscription never being made, or being made against a key that is not
 * wagmi's.
 */
import { getBalanceQueryKey } from "@wagmi/core/query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Providers, { queryClient } from "./providers";
import { eventBus } from "@/utils/events";

afterEach(cleanup);

/**
 * The bridge is not exported — it is an implementation detail of `Providers`,
 * and mounting the real thing is what proves it is actually wired in rather
 * than merely written. The spy goes on the module's OWN client, because that is
 * the one `useQueryClient()` resolves to inside these providers; a client a
 * test wraps around `<Providers>` is shadowed and never touched.
 */
function watchProviders() {
  const spy = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(<Providers>{null}</Providers>);
  spy.mockClear();
  return { spy, view };
}

function invalidatedKeys(spy: ReturnType<typeof watchProviders>["spy"]): string[] {
  return spy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
}

describe("the balance refetch bridge", () => {
  it("invalidates wagmi's own balance key when a swap reports it landed", () => {
    const { spy } = watchProviders();

    eventBus.emit("spot-balance-refetch");

    // `["balance"]` is what `getBalanceQueryKey` prefixes every `useBalance`
    // read with — the swap card's two legs included. Pinned against wagmi's own
    // helper rather than a bare literal, so a version that renames it fails
    // here instead of silently never matching, which is indistinguishable from
    // the bug being fixed.
    expect(String(getBalanceQueryKey({})[0])).toBe("balance");
    expect(invalidatedKeys(spy)).toContain(JSON.stringify(["balance"]));
  });

  it("also invalidates the multicall the portfolio reads balances through", () => {
    const { spy } = watchProviders();

    eventBus.emit("spot-balance-refetch");

    expect(invalidatedKeys(spy)).toContain(JSON.stringify(["readContracts"]));
  });

  it("leaves tokenlistBalances alone, which subscribes to this event itself", () => {
    const { spy } = watchProviders();

    eventBus.emit("spot-balance-refetch");

    // Invalidating it here as well would issue the same read twice.
    const touched = spy.mock.calls.some((call) =>
      JSON.stringify(call[0]?.queryKey ?? "").includes("tokenlistBalances"),
    );
    expect(touched).toBe(false);
  });

  it("does nothing until the event fires", () => {
    const { spy } = watchProviders();
    expect(spy).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount, so a remount cannot double-invalidate", () => {
    const { spy, view } = watchProviders();
    view.unmount();
    spy.mockClear();

    eventBus.emit("spot-balance-refetch");

    expect(spy).not.toHaveBeenCalled();
  });
});
