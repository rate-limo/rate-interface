// @vitest-environment jsdom
// Both guards resolve candidates against `window.location.origin` — the whole
// point is that they use the same rule the browser will, so there is no version
// of this that runs in the default `node` environment.

import { describe, expect, it } from "vitest";
import { parseXLinkMessage, safeReturnPath, X_LINK_MESSAGE } from "./xLink";

/**
 * The two guards on the X-link return leg.
 *
 * Both sit on a path that runs THROUGH X and back, which is the part of the
 * flow an attacker can most easily point a victim at. The happy path is covered
 * by the e2e suite; what is pinned here is the refusals, because those are the
 * cases that fail silently when they regress — a widened guard still links
 * accounts correctly, and nothing looks wrong until it is used.
 */

// jsdom serves https://localhost:3000 by default in this app's vitest config;
// read it rather than hardcoding, so the assertions describe the relationship
// (same origin / different origin) instead of a literal that config could move.
const ORIGIN = window.location.origin;

describe("safeReturnPath", () => {
  it("keeps a same-origin relative path, with its query and hash", () => {
    expect(safeReturnPath("/portfolio?tab=creator#top")).toBe("/portfolio?tab=creator#top");
  });

  it("falls back when there is nothing to return to", () => {
    expect(safeReturnPath(null)).toBe("/portfolio");
    expect(safeReturnPath("")).toBe("/portfolio");
  });

  it("refuses another origin, however it is spelled", () => {
    expect(safeReturnPath("https://evil.example/portfolio")).toBe("/portfolio");
    // Protocol-relative: resolves to evil.example, and reads as a path.
    expect(safeReturnPath("//evil.example/portfolio")).toBe("/portfolio");
  });

  it("refuses the two shapes a startsWith check would have passed", () => {
    // The URL spec folds a backslash to a forward slash, so this is `//evil…`
    // by the time the browser resolves it — but it starts with a single "/".
    expect(safeReturnPath("/\\evil.example/portfolio")).toBe("/portfolio");
    // Control characters are STRIPPED during parsing rather than rejected, so
    // the tab vanishes and this resolves to another host too.
    expect(safeReturnPath("/\t/evil.example/portfolio")).toBe("/portfolio");
  });

  it("takes a caller-supplied fallback", () => {
    expect(safeReturnPath("https://evil.example", "/settings")).toBe("/settings");
  });
});

describe("parseXLinkMessage", () => {
  const event = (data: unknown, origin = ORIGIN) =>
    ({ data, origin }) as MessageEvent;

  it("reads a success posted from this origin", () => {
    expect(parseXLinkMessage(event({ type: X_LINK_MESSAGE, ok: true }))).toEqual({ ok: true });
  });

  it("reads a failure, carrying the reason through", () => {
    expect(parseXLinkMessage(event({ type: X_LINK_MESSAGE, ok: false, reason: "denied" }))).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  it("ignores any other origin", () => {
    // The one that matters: without the origin check, any frame holding a
    // handle on this window could claim the link succeeded.
    expect(
      parseXLinkMessage(event({ type: X_LINK_MESSAGE, ok: true }, "https://evil.example")),
    ).toBeNull();
  });

  it("ignores traffic that is not ours", () => {
    expect(parseXLinkMessage(event({ type: "something-else", ok: true }))).toBeNull();
    expect(parseXLinkMessage(event(null))).toBeNull();
    expect(parseXLinkMessage(event("iter:x-link"))).toBeNull();
  });

  it("treats a non-literal-true `ok` as failure", () => {
    // `ok: "true"` and `ok: 1` are what a forged or malformed payload looks
    // like; only the boolean counts as a link.
    expect(parseXLinkMessage(event({ type: X_LINK_MESSAGE, ok: "true" }))).toEqual({
      ok: false,
      reason: null,
    });
  });
});
