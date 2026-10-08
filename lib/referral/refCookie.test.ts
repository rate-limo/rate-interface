import { describe, expect, it } from "vitest";
import {
  REF_COOKIE,
  buildRefCookie,
  cookieDomainFor,
  readRefCookie,
  stashFromCookie,
} from "./refCookie";

describe("cookieDomainFor — where the cookie is allowed to be shared", () => {
  it("shares across rate.limo and its subdomains", () => {
    expect(cookieDomainFor("rate.limo")).toBe(".rate.limo");
    expect(cookieDomainFor("waitlist.rate.limo")).toBe(".rate.limo");
    expect(cookieDomainFor("app.rate.limo")).toBe(".rate.limo");
  });

  it("is case-insensitive, because a Host header need not be lowercase", () => {
    expect(cookieDomainFor("Waitlist.Rate.LIMO")).toBe(".rate.limo");
  });

  /**
   * The important half. A browser silently REJECTS a Domain the current host is
   * not under, so returning ".rate.limo" here would write no cookie at all rather
   * than a host-only one — and nothing would report it.
   */
  it("omits the domain anywhere the browser would reject it", () => {
    expect(cookieDomainFor("localhost")).toBeNull();
    expect(cookieDomainFor("127.0.0.1")).toBeNull();
    expect(cookieDomainFor("iter-web-git-main.vercel.app")).toBeNull();
  });

  /** `notrate.limo` ends with the string but is a different registrable domain. */
  it("does not match a domain that merely ends with the same letters", () => {
    expect(cookieDomainFor("notrate.limo")).toBeNull();
    expect(cookieDomainFor("evilrate.limo")).toBeNull();
  });
});

describe("buildRefCookie", () => {
  it("carries the domain and secure on production hosts", () => {
    const c = buildRefCookie("51B331", "waitlist.rate.limo");
    expect(c).toContain(`${REF_COOKIE}=51B331`);
    expect(c).toContain("domain=.rate.limo");
    expect(c).toContain("secure");
    expect(c).toContain("path=/");
    expect(c).toContain("samesite=lax");
  });

  it("omits domain AND secure in dev, so the cookie actually lands", () => {
    const c = buildRefCookie("51B331", "localhost");
    expect(c).toContain(`${REF_COOKIE}=51B331`);
    expect(c).not.toContain("domain=");
    // `secure` on http://localhost drops the cookie — the same silent failure.
    expect(c).not.toContain("secure");
  });

  it("uppercases, because codes are compared uppercase everywhere", () => {
    expect(buildRefCookie("51b331", "rate.limo")).toContain(`${REF_COOKIE}=51B331`);
  });

  it("refuses a malformed code rather than storing it", () => {
    expect(buildRefCookie("no", "rate.limo")).toBeNull();
    expect(buildRefCookie("has spaces", "rate.limo")).toBeNull();
    expect(buildRefCookie("../../etc/passwd", "rate.limo")).toBeNull();
    expect(buildRefCookie("", "rate.limo")).toBeNull();
  });
});

describe("readRefCookie", () => {
  it("finds the code among other cookies", () => {
    expect(readRefCookie("theme=dark; iter.ref=51B331; other=1")).toBe("51B331");
  });

  it("returns null when absent", () => {
    expect(readRefCookie("theme=dark")).toBe(null);
    expect(readRefCookie("")).toBe(null);
  });

  it("does not match a cookie whose name merely ends with the same letters", () => {
    expect(readRefCookie("not.iter.ref=51B331")).toBe(null);
  });

  it("validates on the way OUT — a cookie is user-editable", () => {
    expect(readRefCookie("iter.ref=; x=1")).toBe(null);
    expect(readRefCookie("iter.ref=../../etc")).toBe(null);
    expect(readRefCookie("iter.ref=waytoolongtobeacode")).toBe(null);
  });

  it("survives a malformed percent-encoding without throwing", () => {
    expect(readRefCookie("iter.ref=%E0%A4%A")).toBe(null);
  });

  it("round-trips what buildRefCookie writes", () => {
    const built = buildRefCookie("51B331", "rate.limo")!;
    // Browsers hand back only `name=value` pairs, not the attributes.
    expect(readRefCookie(built.split(";")[0])).toBe("51B331");
  });
});

describe("stashFromCookie — the mirror decision", () => {
  it("fills an empty stash from the cookie", () => {
    expect(stashFromCookie(null, "51B331")).toBe("51B331");
  });

  /**
   * The rule that matters. The cookie outlives the stash and survives a
   * localStorage clear, so a stale one must never replace a code the visitor
   * just arrived with — crediting the wrong referrer is worse than crediting
   * none.
   */
  it("never overwrites a stash that already holds a code", () => {
    expect(stashFromCookie("ABC123", "51B331")).toBe(null);
    expect(stashFromCookie("ABC123", null)).toBe(null);
  });

  it("does nothing when neither side has a code", () => {
    expect(stashFromCookie(null, null)).toBe(null);
  });
});
