import { describe, expect, it } from "vitest";
import { hasNoTokenLogo, isLegacyPlaceholderLogo, tokenLogoURI } from "./logo";

/**
 * The rule that stops the predecessor token list's grey disc from rendering as
 * artwork.
 *
 * This is worth pinning rather than trusting to a one-line `includes`, because
 * the failure mode is invisible: the URL below is LIVE and serves a real image,
 * so every layer downstream treated it as success. `<img>` loaded it, `onError`
 * never fired, no test went red, and the only symptom was that every launched
 * coin wore someone else's placeholder on Explore while its own token page — a
 * row that happened to carry an operator override — looked fine.
 */

const LEGACY =
  "https://raw.githubusercontent.com/standardweb3/default-token-list/refs/heads/main/assets/placeholder_token.png";

describe("tokenLogoURI", () => {
  it("passes a real logo through untouched", () => {
    expect(tokenLogoURI("/logo/abc123.webp")).toBe("/logo/abc123.webp");
    expect(tokenLogoURI("https://example.com/token.png")).toBe("https://example.com/token.png");
  });

  it("treats the legacy standardweb3 placeholder as NO logo", () => {
    expect(tokenLogoURI(LEGACY)).toBeUndefined();
    expect(hasNoTokenLogo(LEGACY)).toBe(true);
    expect(isLegacyPlaceholderLogo(LEGACY)).toBe(true);
  });

  it("recognises the same asset however it is served", () => {
    // Matched on the filename, so a CDN or the github.com/raw form does not
    // reintroduce it. The bytes are the problem, not the host.
    expect(hasNoTokenLogo("https://cdn.example.com/assets/placeholder_token.png")).toBe(true);
    expect(hasNoTokenLogo("https://github.com/x/y/raw/main/assets/placeholder_token.webp")).toBe(true);
  });

  it("treats empty and whitespace as no logo, which is what the broker now writes", () => {
    expect(tokenLogoURI("")).toBeUndefined();
    expect(tokenLogoURI("   ")).toBeUndefined();
    expect(hasNoTokenLogo("")).toBe(true);
  });

  it("survives the shapes an indexer row actually arrives in", () => {
    // `logoURI` is typed `string` on spotToken but reaches this from JSON that
    // has had columns added and removed; a null here must not throw on `.trim`.
    expect(tokenLogoURI(null)).toBeUndefined();
    expect(tokenLogoURI(undefined)).toBeUndefined();
    expect(tokenLogoURI(42)).toBeUndefined();
    expect(hasNoTokenLogo(null)).toBe(true);
  });

  it("returns undefined, never an empty string, for the absent case", () => {
    // `<img src="">` resolves against the current document and refetches the
    // PAGE, which then fails to decode — a broken-image glyph rather than the
    // fallback mark. The callers pass this value straight to `src`.
    expect(tokenLogoURI(LEGACY)).not.toBe("");
    expect(tokenLogoURI("")).not.toBe("");
  });

  it("does not mistake a legitimate logo for the placeholder", () => {
    // Guards the substring match against being too eager: these are real names.
    expect(hasNoTokenLogo("/logo/placeholder-dao.webp")).toBe(false);
    expect(hasNoTokenLogo("https://example.com/PLACEHOLDER_TOKEN.png")).toBe(false);
  });
});
