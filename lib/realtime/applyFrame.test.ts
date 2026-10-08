import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { applyFrame } from "./applyFrame";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("applyFrame", () => {
  it("an in-flight fetch that resolves after a frame does not overwrite it", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["orders", "Arc Testnet", "0xabc"];
    qc.setQueryData(key, ["before"]);
    const slow = deferred<string[]>();
    let calls = 0;
    // An active observer, as a mounted hook would have.
    const observer = new QueryObserver(qc, {
      queryKey: key,
      queryFn: () => {
        calls += 1;
        return calls === 1 ? slow.promise : Promise.resolve(["before", "frame"]);
      },
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    const inflight = qc.refetchQueries({ queryKey: key, exact: true });
    expect(qc.getQueryState(key)?.fetchStatus).toBe("fetching");

    const applied = applyFrame<string[]>(qc, key, (prev: string[] | undefined) => [...(prev ?? []), "frame"]);
    slow.resolve(["before"]); // the old answer arrives AFTER the frame
    await applied;
    await inflight.catch(() => {});

    expect(qc.getQueryData(key)).toEqual(["before", "frame"]);
    expect(calls).toBe(2); // refetched after the frame
    unsubscribe();
  });

  it("with nothing in flight it is setQueryData, no refetch", async () => {
    const qc = new QueryClient();
    const key = ["token", "RISE Testnet", "ETH"];
    qc.setQueryData(key, { price: 1 });
    let calls = 0;
    const observer = new QueryObserver(qc, { queryKey: key, queryFn: async () => ((calls += 1), { price: 9 }), staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    await applyFrame<{ price: number }>(qc, key, () => ({ price: 2 }));
    expect(qc.getQueryData(key)).toEqual({ price: 2 });
    expect(calls).toBe(0);
    unsubscribe();
  });

  it("frames for one key apply in arrival order", async () => {
    const qc = new QueryClient();
    const key = ["trades"];
    qc.setQueryData(key, [] as number[]);
    await Promise.all([1, 2, 3].map((n) => applyFrame<number[]>(qc, key, (prev: number[] | undefined) => [...(prev ?? []), n])));
    expect(qc.getQueryData(key)).toEqual([1, 2, 3]);
  });
});
