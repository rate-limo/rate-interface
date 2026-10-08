import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Write a websocket frame into a query WITHOUT letting a fetch that was already
 * in flight overwrite it afterwards.
 *
 * The race: a REST read starts, a frame arrives and is applied, then the read
 * resolves with data from BEFORE the frame and replaces it. Nothing about
 * caching prevents this: the read was simply started first. So when the query
 * has a fetch in flight, that fetch is cancelled (its result discarded), the
 * frame is applied, and the query is fetched again — a fetch that starts after
 * the frame reads data that already includes it, because the broker commits
 * before it publishes. With no fetch in flight this is exactly `setQueryData`.
 *
 * Frames for one key are applied in arrival order even though a cancel is
 * awaited: each key's applications are chained.
 */
const chains = new Map<string, Promise<void>>();

// Accepts exactly what `setQueryData` accepts (a value or an updater), so a
// handler switches over without restating its types.
type Updater = Parameters<QueryClient["setQueryData"]>[1];

export function applyFrame<T = unknown>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: Updater | ((previous: T | undefined) => T | undefined),
): Promise<void> {
  const id = JSON.stringify(queryKey);
  const run = async () => {
    const inFlight = queryClient.getQueryState(queryKey)?.fetchStatus === "fetching";
    if (inFlight) await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData(queryKey, updater as Updater);
    if (inFlight) await queryClient.refetchQueries({ queryKey, exact: true, type: "active" });
  };
  const next = (chains.get(id) ?? Promise.resolve()).then(run, run);
  chains.set(id, next);
  void next.finally(() => {
    if (chains.get(id) === next) chains.delete(id);
  });
  return next;
}
