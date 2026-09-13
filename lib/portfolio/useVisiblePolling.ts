"use client";

import { useEffect, useState } from "react";

/**
 * A refetch interval that pauses when the tab is not visible.
 *
 * ## Why a balance read needs one at all
 *
 * `useWalletBalances` is pull-only: no `refetchInterval`, no `watch`, no block
 * subscription. So a deposit that arrives while the user is looking at the
 * portfolio never appears — the balance is correct on the chain and stale on
 * screen until something forces a refetch. In practice the only thing that did
 * was react-query's `refetchOnWindowFocus`, which works by coincidence (tab away
 * to a wallet, tab back, focus fires) and does nothing at all for a send from a
 * phone, a hardware wallet or an exchange while the tab stays focused.
 *
 * ## Why it must stop when hidden
 *
 * These are per-chain RPC reads against endpoints the portfolio spec already
 * calls rate-limited, and the panel's whole design is "degrade, don't
 * disappear". A background tab left open overnight polling every chain is the
 * cheapest way to get throttled for a user who is not even looking — and the
 * answer would be discarded on arrival. `visibilitychange` is what stops that;
 * react-query then refetches on the way back anyway, so nothing is lost by
 * pausing.
 *
 * Returns `false` rather than 0 because that is react-query's own "do not
 * poll" value; 0 is not it, and passing 0 polls as fast as the event loop
 * allows.
 */
export function useVisibleRefetchInterval(ms: number): number | false {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Read in an effect, never during render: `document` does not exist on the
    // server, and a first client pass that disagreed with the server's would
    // mismatch. Same rule the consent banner and the OG Pass countdown follow.
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return visible ? ms : false;
}
