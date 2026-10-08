import type { QueryClient } from "@tanstack/react-query";

/**
 * Re-read an account's tables after a stretch in which frames may have been missed.
 *
 * Open orders, order history and trade history are `staleTime: Infinity`: after
 * the first read, only frames change them. That is right while the socket is up
 * and wrong the moment it is not. A closure frame sent during a gateway redeploy,
 * a laptop sleep or a dropped connection is never replayed, so the row it would
 * have removed stays on screen until a reload. Reported as "the open order never
 * disappears, even at 100% filled". A reload fixed it every time, because the
 * broker had already deleted the row.
 *
 * Invalidating marks every page stale and refetches only the ones mounted.
 */
export const ACCOUNT_QUERY_ROOTS = ["orders", "orderhistories", "tradehistory"] as const;

export function resyncAccountQueries(queryClient: QueryClient, networkName: string, address: string): void {
  for (const root of ACCOUNT_QUERY_ROOTS) {
    void queryClient.invalidateQueries({ queryKey: [root, networkName, address] });
  }
}

/**
 * Call `onReturn` when the page comes back from a period in which it may have
 * missed frames: the tab becomes visible again, or the browser comes back
 * online. Returns the unsubscribe.
 */
export function onReturnFromAway(onReturn: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let hidden = document.visibilityState === "hidden";
  const visibility = () => {
    if (document.visibilityState === "hidden") {
      hidden = true;
      return;
    }
    if (hidden) {
      hidden = false;
      onReturn();
    }
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("online", onReturn);
  return () => {
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("online", onReturn);
  };
}
