import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchEngine } from "./useSearch";
import { searchChain } from "@/queries/server/search";
import { PonderLinks } from "@/consts";

/**
 * Note on file extension: this is `.test.ts`, not `.test.tsx`. The repo's
 * vitest config only globs `**\/*.test.ts` and has no jsdom/testing-library
 * installed, so there's no way to render `useSearch` itself. What's tested
 * here is `searchChain` (the fetch primitive) and `createSearchEngine` (the
 * debounce engine useSearch wraps in useState/useEffect) — together they
 * cover every behavior the hook is responsible for, without a React
 * renderer.
 */

describe("searchChain", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("hits getApiUrl(networkName)/api/search with URL-encoded q and limit", async () => {
        const mockJson = {
            tokens: [{ type: "token", id: "1", symbol: "WETH", name: "Wrapped Ether", ticker: "WETH", logoURI: "", chain: "RISE Testnet" }],
            pairs: [],
        };
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockJson }) as unknown as typeof fetch;

        const result = await searchChain("RISE Testnet", "eth pair", 10);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe(`${PonderLinks["RISE Testnet"]}/api/search?q=eth%20pair&limit=10`);
        expect(result).toEqual(mockJson);
    });

    it("defaults limit to 15 when not passed", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tokens: [], pairs: [] }) }) as unknown as typeof fetch;

        await searchChain("RISE Testnet", "usdc");

        const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe(`${PonderLinks["RISE Testnet"]}/api/search?q=usdc&limit=15`);
    });

    it("returns an empty result and skips the fetch entirely for an empty/whitespace query", async () => {
        global.fetch = vi.fn();

        const result = await searchChain("Monad Testnet", "   ");

        expect(global.fetch).not.toHaveBeenCalled();
        expect(result).toEqual({ tokens: [], pairs: [] });
    });

    it("returns an empty result (not a throw) on a non-ok response", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;

        const result = await searchChain("Monad Testnet", "eth");

        expect(result).toEqual({ tokens: [], pairs: [] });
    });
});

describe("createSearchEngine (the debounce/fetch primitive behind useSearch)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("collapses rapid keystrokes within the debounce window into a single fetch", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ tokens: [], pairs: [] });
        const onLoading = vi.fn();
        const onData = vi.fn();
        const engine = createSearchEngine(fetchFn, onLoading, onData, 200);

        engine.trigger("Monad Testnet", "e");
        vi.advanceTimersByTime(50);
        engine.trigger("Monad Testnet", "et");
        vi.advanceTimersByTime(50);
        engine.trigger("Monad Testnet", "eth");

        expect(fetchFn).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(200);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn).toHaveBeenCalledWith("Monad Testnet", "eth", undefined);
    });

    it("does not fetch for an empty or whitespace-only query, and reports not-loading with empty results", () => {
        const fetchFn = vi.fn();
        const onLoading = vi.fn();
        const onData = vi.fn();
        const engine = createSearchEngine(fetchFn, onLoading, onData, 200);

        engine.trigger("Monad Testnet", "   ");
        vi.advanceTimersByTime(500);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(onData).toHaveBeenCalledWith({ tokens: [], pairs: [] });
        expect(onLoading).toHaveBeenCalledWith(false);
    });

    it("targets whichever network the settled trigger named, even if an earlier keystroke named a different one", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ tokens: [], pairs: [] });
        const engine = createSearchEngine(fetchFn, vi.fn(), vi.fn(), 200);

        engine.trigger("Monad Testnet", "eth");
        vi.advanceTimersByTime(50);
        // Simulates a chain switch mid-keystroke: displayNetworkName changes,
        // so the next trigger from useSearch's effect carries the new network.
        engine.trigger("RISE Testnet", "eth");

        await vi.advanceTimersByTimeAsync(200);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn).toHaveBeenCalledWith("RISE Testnet", "eth", undefined);
    });

    it("discards a stale in-flight response once a newer trigger has settled", async () => {
        let resolveFirst!: (v: unknown) => void;
        const firstResponse = new Promise((res) => {
            resolveFirst = res;
        });
        const fetchFn = vi
            .fn()
            .mockImplementationOnce(() => firstResponse)
            .mockResolvedValueOnce({ tokens: [{ type: "token", id: "second" }], pairs: [] });
        const onData = vi.fn();
        const engine = createSearchEngine(fetchFn, vi.fn(), onData, 200);

        engine.trigger("Monad Testnet", "eth");
        await vi.advanceTimersByTimeAsync(200); // first fetch fires, stays pending

        engine.trigger("Monad Testnet", "eth2");
        await vi.advanceTimersByTimeAsync(200); // second fetch fires and resolves

        // The stale first response finally resolves after the second already landed.
        resolveFirst({ tokens: [{ type: "token", id: "first-stale" }], pairs: [] });
        await Promise.resolve();
        await Promise.resolve();

        expect(onData).toHaveBeenCalledTimes(1);
        expect(onData).toHaveBeenCalledWith({ tokens: [{ type: "token", id: "second" }], pairs: [] });
    });

    it("cancel() prevents a pending debounced fetch from firing", async () => {
        const fetchFn = vi.fn().mockResolvedValue({ tokens: [], pairs: [] });
        const engine = createSearchEngine(fetchFn, vi.fn(), vi.fn(), 200);

        engine.trigger("Monad Testnet", "eth");
        engine.cancel();

        await vi.advanceTimersByTimeAsync(500);

        expect(fetchFn).not.toHaveBeenCalled();
    });
});
