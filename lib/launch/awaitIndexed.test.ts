import { describe, expect, it } from "vitest";
import { awaitIndexed } from "./awaitIndexed";

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe("awaitIndexed", () => {
  it("returns at once when the coin is already indexed", async () => {
    const c = clock();
    let calls = 0;
    const ok = await awaitIndexed(async () => (calls += 1) > 0, { ...c });
    expect(ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("keeps polling through misses and errors until the row appears", async () => {
    const c = clock();
    const answers = [false, "throw", false, true];
    let i = 0;
    const ok = await awaitIndexed(
      async () => {
        const a = answers[i++];
        if (a === "throw") throw new Error("404");
        return a as boolean;
      },
      { ...c, intervalMs: 2_000 },
    );
    expect(ok).toBe(true);
    expect(i).toBe(4);
    expect(c.now()).toBe(6_000);
  });

  it("gives up at the deadline rather than hanging the success screen", async () => {
    const c = clock();
    const ok = await awaitIndexed(async () => false, { ...c, timeoutMs: 10_000, intervalMs: 2_000 });
    expect(ok).toBe(false);
    expect(c.now()).toBeLessThanOrEqual(10_000);
  });
});
