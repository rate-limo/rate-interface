import { describe, expect, it } from "vitest";
import { profileShareCardUrl, profileShareText, profileShareUrl, xIntentUrl } from "./share";

const ADDRESS = "0x9E7A01E4514bb56ae642587E0485b606DB46850E";

describe("profileShareUrl", () => {
  it("builds the canonical url with the chain", () => {
    expect(profileShareUrl("https://rate.limo", ADDRESS, "arc-testnet")).toBe(
      `https://rate.limo/profile/${ADDRESS}?chain=arc-testnet`,
    );
  });

  it("omits the query entirely when no chain is given", () => {
    expect(profileShareUrl("https://rate.limo", ADDRESS)).toBe(`https://rate.limo/profile/${ADDRESS}`);
    expect(profileShareUrl("https://rate.limo", ADDRESS, null)).toBe(`https://rate.limo/profile/${ADDRESS}`);
  });

  it("does not double the slash when the origin carries a trailing one", () => {
    expect(profileShareUrl("https://rate.limo/", ADDRESS)).toBe(`https://rate.limo/profile/${ADDRESS}`);
  });

  it("carries NO viewer parameter — sharing must not leak who was reading", () => {
    // The regression this guards is subtle: `window.location.href` on this page
    // legitimately holds `?viewer=<the reader's own address>`, so a share built
    // from the location would publish the reader's wallet, not the subject's.
    const out = profileShareUrl("https://rate.limo", ADDRESS, "arc-testnet");
    expect(out).not.toContain("viewer");
    expect(out).not.toContain("ref=");
  });
});

describe("profileShareCardUrl", () => {
  it("points at the same route generateMetadata uses, so the preview IS the unfurl", () => {
    expect(profileShareCardUrl("https://rate.limo", ADDRESS, "arc-testnet")).toBe(
      `https://rate.limo/api/og/profile?address=${ADDRESS}&chain=arc-testnet`,
    );
  });

  it("drops the chain when absent rather than sending an empty one", () => {
    // `?chain=` empty is not the same as absent: the route resolves an unknown
    // slug to the default, but an empty value in the url is noise in a preview
    // the user can see.
    expect(profileShareCardUrl("https://rate.limo", ADDRESS)).toBe(
      `https://rate.limo/api/og/profile?address=${ADDRESS}`,
    );
  });
});

describe("profileShareText", () => {
  it("uses the display name when set", () => {
    expect(profileShareText("hskang", ADDRESS)).toBe("hskang on Rate");
  });

  it("falls back to the abbreviated address, never an empty subject", () => {
    expect(profileShareText(null, ADDRESS)).toBe("0x9E7A…850E on Rate");
    expect(profileShareText("", ADDRESS)).toBe("0x9E7A…850E on Rate");
    expect(profileShareText("   ", ADDRESS)).toBe("0x9E7A…850E on Rate");
  });
});

describe("xIntentUrl", () => {
  it("encodes text and url as query parameters", () => {
    const out = new URL(xIntentUrl("hskang on Rate", "https://rate.limo/profile/0xabc"));
    expect(out.origin + out.pathname).toBe("https://x.com/intent/tweet");
    expect(out.searchParams.get("text")).toBe("hskang on Rate");
    expect(out.searchParams.get("url")).toBe("https://rate.limo/profile/0xabc");
  });

  it("survives characters that would otherwise break the query", () => {
    const out = new URL(xIntentUrl("100% up & #1 — \"nice\"", "https://rate.limo/p?a=1&b=2"));
    expect(out.searchParams.get("text")).toBe('100% up & #1 — "nice"');
    expect(out.searchParams.get("url")).toBe("https://rate.limo/p?a=1&b=2");
  });
});
