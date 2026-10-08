import { describe, expect, it, vi } from "vitest";
import { getIdentities } from "./profile";

const ADDRESS_A = "0x5214c80446eed8546e21434700959bb883f99560";
const ADDRESS_B = "0xf8fb4672170607c95663f4cc674ddb1386b7cfe0";

/**
 * The URL is the whole point of these, exactly as it is for `fetchProfile` —
 * and the two want OPPOSITE answers, which is how this broke.
 *
 * `queries/server/profile.ts` is `"use server"`, so `getIdentities` is a Server
 * Action: a client component calling it does not make the request itself, it
 * POSTs to the action and the fetch runs on the SERVER. A relative URL has no
 * origin to resolve against there, so `fetch` throws `Failed to parse URL`,
 * `getJson` swallows it to null, `useIdentities` degrades to an empty map by
 * design, and every wallet in the app renders as a truncated address with
 * nothing on screen or in the network tab to say why.
 *
 * That shipped in c3fe4b9b and ran for a day. Nothing caught it because every
 * layer below the URL is built to survive a failed read — which is correct, and
 * is exactly why the URL itself has to be pinned here.
 */
describe("getIdentities", () => {
  const answer = (body: unknown, ok = true) =>
    vi.fn(async (_url: string) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 502 }),
    );

  it("asks the gateway directly — an ABSOLUTE url, because this runs on the server", async () => {
    const fetcher = answer({ identities: [] });
    vi.stubGlobal("fetch", fetcher);
    await getIdentities("Arc Testnet", [ADDRESS_A]);
    const url = String(fetcher.mock.calls[0]?.[0]);
    // The assertion that matters: a relative path throws in Node, and the throw
    // is invisible at runtime.
    expect(url.startsWith("http")).toBe(true);
    expect(url).toBe(
      `https://gateway-api-arc.up.railway.app/api/identities?addresses=${ADDRESS_A}`,
    );
    vi.unstubAllGlobals();
  });

  it("never routes through this app's proxy — that path has no origin here", async () => {
    const fetcher = answer({ identities: [] });
    vi.stubGlobal("fetch", fetcher);
    await getIdentities("RISE Testnet", [ADDRESS_A]);
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("/api/gateway/");
    vi.unstubAllGlobals();
  });

  it("sends the addresses as one comma-separated list, so a tape costs one request", async () => {
    const fetcher = answer({ identities: [] });
    vi.stubGlobal("fetch", fetcher);
    await getIdentities("Arc Testnet", [ADDRESS_A, ADDRESS_B]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      encodeURIComponent(`${ADDRESS_A},${ADDRESS_B}`),
    );
    vi.unstubAllGlobals();
  });

  it("returns the identities a reachable gateway answers with", async () => {
    vi.stubGlobal(
      "fetch",
      answer({ identities: [{ address: ADDRESS_A, name: "JaggedRustyYak", avatarUrl: null }] }),
    );
    const result = await getIdentities("Arc Testnet", [ADDRESS_A]);
    expect(result?.identities).toEqual([
      { address: ADDRESS_A, name: "JaggedRustyYak", avatarUrl: null },
    ]);
    vi.unstubAllGlobals();
  });

  it("asks nothing for an unknown network or an empty list", async () => {
    const fetcher = answer({ identities: [] });
    vi.stubGlobal("fetch", fetcher);
    expect(await getIdentities("Nowhere Testnet", [ADDRESS_A])).toBeNull();
    expect(await getIdentities("Arc Testnet", [])).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("degrades to null on a refusal, so useIdentities can fall back to the address", async () => {
    vi.stubGlobal("fetch", answer({}, false));
    expect(await getIdentities("Arc Testnet", [ADDRESS_A])).toBeNull();
    vi.unstubAllGlobals();
  });
});
