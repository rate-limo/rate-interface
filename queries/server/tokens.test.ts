import { afterEach, describe, expect, it, vi } from "vitest";
import { getTokens } from "./tokens";

/**
 * The listing gate is correct for rankings and wrong for anything asking what a
 * wallet HOLDS or can deposit. A freshly redeployed chain has nothing verified,
 * so the gated list answers zero and every caller that forgot the flag renders
 * an empty wallet while the chain holds the money.
 */
describe("getTokens listing gate", () => {
  const urls: string[] = [];
  afterEach(() => {
    urls.length = 0;
    vi.unstubAllGlobals();
  });

  const capture = () => {
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(String(url));
      return Promise.resolve({
        ok: true,
        json: async () => ({ tokens: [], totalCount: 0, totalPages: 0, pageSize: 10 }),
      } as Response);
    });
  };

  it("stays gated by default, because rankings are the majority of callers", async () => {
    capture();
    await getTokens("Arc Testnet", 10, 1, "");
    expect(urls[0]).not.toContain("source=all");
  });

  it("drops the gate when a caller asks for every token", async () => {
    capture();
    await getTokens("Arc Testnet", 10, 1, "", "all");
    expect(urls[0]).toContain("source=all");
  });

  it("returns an empty page rather than an error body parsed as tokens", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 502, json: async () => ({ error: "bad" }) }) as unknown as Response);
    const page = await getTokens("Arc Testnet", 10, 1, "", "all");
    expect(page.tokens).toEqual([]);
    expect(page.totalCount).toBe(0);
  });
});
