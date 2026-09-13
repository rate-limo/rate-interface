import { describe, expect, it, vi, beforeEach } from "vitest";
import { postThesis, retractThesis } from "./postThesis";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("postThesis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds through the full nonce -> sign -> post handshake", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ nonce: "n-1", message: "sign this" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const signMessageAsync = vi.fn().mockResolvedValue("0xsignature");

    const outcome = await postThesis(
      { chainSlug: "rise-testnet", tokenAddress: "0xtoken",
        pair: "0xpair",
        tradeId: "7",
        body: "This is going up.",
        address: "0xauthor",
      },
      signMessageAsync,
    );

    expect(outcome).toEqual({ ok: true, id: 42 });
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "sign this" });

    // The nonce call carries the payload; the finalize call carries only
    // address/nonce/signature — never the text or the trade a second time.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [nonceCall, postCall] = fetchMock.mock.calls;
    // The chain rides the query string: the handler resolves it to that chain's
    // admin-service, whose broker.spotTrades is what authorizes the write.
    expect(nonceCall![0]).toBe("/thesis/nonce?chain=rise-testnet");
    expect(JSON.parse(nonceCall![1].body)).toEqual({
      action: "post",
      tokenAddress: "0xtoken",
      pair: "0xpair",
      tradeId: "7",
      body: "This is going up.",
    });
    expect(postCall![0]).toBe("/thesis/post?chain=rise-testnet");
    expect(JSON.parse(postCall![1].body)).toEqual({
      address: "0xauthor",
      nonce: "n-1",
      signature: "0xsignature",
    });
  });

  it("treats a declined signature as a decision, not an error", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ nonce: "n-1", message: "sign this" }));
    vi.stubGlobal("fetch", fetchMock);

    const signMessageAsync = vi.fn().mockRejectedValue(new Error("User rejected the request"));

    const outcome = await postThesis(
      { chainSlug: "rise-testnet", tokenAddress: "0xtoken", pair: "0xpair", tradeId: "7", body: "body", address: "0xauthor" },
      signMessageAsync,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ declined: true });
    // Only the nonce call happened — a declined signature never reaches /thesis/post.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the server's refusal message through instead of flattening it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ nonce: "n-1", message: "sign this" }))
      .mockResolvedValueOnce(
        jsonResponse({ error: "That trade is below the $1,000 minimum." }, false, 400),
      );
    vi.stubGlobal("fetch", fetchMock);

    const signMessageAsync = vi.fn().mockResolvedValue("0xsignature");

    const outcome = await postThesis(
      { chainSlug: "rise-testnet", tokenAddress: "0xtoken", pair: "0xpair", tradeId: "7", body: "body", address: "0xauthor" },
      signMessageAsync,
    );

    expect(outcome).toEqual({
      ok: false,
      declined: false,
      message: "That trade is below the $1,000 minimum.",
    });
  });

  it("falls back to a generic message when the server sends no reason", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ nonce: "n-1", message: "sign this" }))
      .mockResolvedValueOnce(jsonResponse(null, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await postThesis(
      { chainSlug: "rise-testnet", tokenAddress: "0xtoken", pair: "0xpair", tradeId: "7", body: "body", address: "0xauthor" },
      vi.fn().mockResolvedValue("0xsignature"),
    );

    expect(outcome).toEqual({ ok: false, declined: false, message: "Couldn't post that. Try again." });
  });

  it("reports a network failure honestly rather than as a decline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const outcome = await postThesis(
      { chainSlug: "rise-testnet", tokenAddress: "0xtoken", pair: "0xpair", tradeId: "7", body: "body", address: "0xauthor" },
      vi.fn(),
    );

    expect(outcome).toEqual({
      ok: false,
      declined: false,
      message: "Couldn't reach the service. Try again.",
    });
  });
});

describe("retractThesis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds and reports whether the thesis existed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ nonce: "n-2", message: "retract this" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, existed: true }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await retractThesis({ id: 9, address: "0xauthor", chainSlug: "rise-testnet" }, vi.fn().mockResolvedValue("0xsig"));

    expect(outcome).toEqual({ ok: true, existed: true });
    const [nonceCall] = fetchMock.mock.calls;
    expect(JSON.parse(nonceCall![1].body)).toEqual({ action: "retract", id: 9 });
  });

  it("passes a server refusal through", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ nonce: "n-2", message: "retract this" }))
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, false, 401));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await retractThesis({ id: 9, address: "0xauthor", chainSlug: "rise-testnet" }, vi.fn().mockResolvedValue("0xsig"));

    expect(outcome).toEqual({ ok: false, declined: false, message: "unauthorized" });
  });

  it("treats a declined signature as a decision", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ nonce: "n-2", message: "retract this" }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await retractThesis(
      { id: 9, address: "0xauthor", chainSlug: "rise-testnet" },
      vi.fn().mockRejectedValue(new Error("user denied signature")),
    );

    expect(outcome).toMatchObject({ ok: false, declined: true });
  });
});
