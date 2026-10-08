import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fetchReferralCode, inviteLink, inviteUrl, referralLink, referralUrl, waitlistInviteLink, waitlistInviteUrl } from "./link";

describe("referralLink", () => {
  it("builds the display form without a scheme", () => {
    expect(referralLink("7C2A9E")).toBe("rate.limo/r/7C2A9E");
  });

  it("uppercases, because codes are case-insensitive but shown uppercase", () => {
    expect(referralLink("hyungsu")).toBe("rate.limo/r/HYUNGSU");
  });

  it("trims, so a code pasted with whitespace still yields a valid link", () => {
    expect(referralLink("  7C2A9E \n")).toBe("rate.limo/r/7C2A9E");
  });

  it("does not read the current host — a link copied from a preview deploy must still point at production", () => {
    expect(referralUrl("7C2A9E")).toBe("https://rate.limo/r/7C2A9E");
    expect(referralUrl("7C2A9E")).not.toContain("localhost");
  });
});

describe("fetchReferralCode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (url: string) => Promise<Response> | Response) {
    const spy = vi.fn((input: RequestInfo | URL) => impl(String(input)));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

  it("lowercases the address in the path", async () => {
    // The service validates /^0x[0-9a-f]{40}$/ and 400s on a checksummed
    // address — wagmi hands us checksummed ones, so this is load-bearing.
    const spy = stubFetch(() => ok({ code: "7C2A9E", derived: true }));
    await fetchReferralCode("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01");
    expect(spy.mock.calls[0][0]).toBe(
      "/referral/code/0xabcdef0123456789abcdef0123456789abcdef01",
    );
  });

  it("returns the code and its kind", async () => {
    stubFetch(() => ok({ code: "HYUNGSU", derived: false }));
    expect(await fetchReferralCode("0x01")).toEqual({ code: "HYUNGSU", derived: false });
  });

  it("treats a missing `derived` flag as derived", async () => {
    // Only an operator-assigned vanity code is not derived, and that always
    // arrives with the flag. Absent means the ordinary case.
    stubFetch(() => ok({ code: "7C2A9E" }));
    expect((await fetchReferralCode("0x01")).derived).toBe(true);
  });

  it("throws on a non-ok response rather than inventing a code", async () => {
    stubFetch(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    await expect(fetchReferralCode("0x01")).rejects.toThrow(/500/);
  });

  it("throws when the body carries no code", async () => {
    // A 200 with an empty body would otherwise render `rate.limo/r/undefined`,
    // a link that looks real and resolves to nothing.
    stubFetch(() => ok({}));
    await expect(fetchReferralCode("0x01")).rejects.toThrow(/no code/);
  });
});

describe("waitlistInviteLink", () => {
  it("lands on the waitlist, not the app", () => {
    // The whole reason this function exists. `/r/CODE` renders InviteView inside
    // the app shell and asks for a wallet first, which is the wrong first ask for
    // someone invited to a list.
    expect(waitlistInviteLink("51b331")).toBe("waitlist.rate.limo/r/51B331");
    expect(waitlistInviteUrl("51b331")).toBe("https://waitlist.rate.limo/r/51B331");
  });

  it("upper-cases and trims, exactly like the app link", () => {
    expect(waitlistInviteLink("  abc123  ")).toBe("waitlist.rate.limo/r/ABC123");
  });

  it("does not disturb the app referral link", () => {
    // Both destinations are live and serve different invitations; changing one
    // must not silently repoint the other.
    expect(referralLink("51B331")).toBe("rate.limo/r/51B331");
  });

  it("hardcodes the production host", () => {
    // These strings are pasted into someone else's chat window, so a link minted
    // on a preview deployment or localhost must still point at production.
    expect(waitlistInviteUrl("ABC123").startsWith("https://waitlist.rate.limo/")).toBe(true);
  });
});

describe("inviteLink — the one place the share destination is decided", () => {
  it("points at the waitlist while Rate is pre-launch", () => {
    // The phase decision, pinned. Flipping these two bodies to referralLink/
    // referralUrl at launch is the whole migration -- and this test is what
    // makes that flip deliberate rather than accidental.
    expect(inviteLink("51B331")).toBe("waitlist.rate.limo/r/51B331");
    expect(inviteUrl("51B331")).toBe("https://waitlist.rate.limo/r/51B331");
  });

  it("keeps the app referral link reachable and unchanged", () => {
    // /r/CODE is still a live route and still right for an app referral; it is
    // just not what a sharing surface reaches for today.
    expect(referralLink("51B331")).toBe("rate.limo/r/51B331");
  });
});

describe("no sharing surface names a destination itself", () => {
  /**
   * The guard against a FIFTH copy.
   *
   * `Rewards/ReferralPanel` rendered `rate.limo/r/HYUNGSU` from a hand-typed string
   * in `lib/rewards/mock.ts`, so it kept advertising the app door after this
   * module had moved on — exactly the drift the file's own docstring warns about.
   * Typechecking cannot catch it: a hardcoded URL is a valid string.
   *
   * So: components go through `inviteLink`/`inviteUrl`, and nothing outside this
   * module writes a share URL by hand.
   */
  const ROOT = join(__dirname, "..", "..");
  const SCAN = ["app", "components"];

  function sources(dir: string): string[] {
    let out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out = out.concat(sources(p));
      // `.test.tsx` as well as `.test.ts`. The exclusion exists because a test
      // FIXTURE may legitimately hold a literal invite URL — that is the value
      // under test — and it shipped covering only the first extension, back
      // when no component test needed one. `components/Portfolio/Rewards.test.tsx`
      // is the first that does, and it was flagged as a component writing an
      // invite URL by hand. A test file ships nothing to a reader, so this
      // widens the exclusion to what it always meant, not past it.
      else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  }

  // Block comments are stripped first: a docstring explaining what `/r/CODE` is
  // for is exactly what a docstring should do, and flagging it would train
  // people to delete the explanation instead of the hardcoded URL. Only line
  // comments are left in, because stripping `//` would also eat the `https://`
  // inside a real offending string and turn a hit into a miss.
  const files = SCAN.flatMap((d) => sources(join(ROOT, d))).map((p) => ({
    p: p.slice(ROOT.length + 1),
    src: readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
  }));

  it("finds files to scan at all", () => {
    // A broken path would make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(50);
  });

  it("no component calls referralLink/referralUrl directly", () => {
    const offenders = files
      .filter((f) => /\breferral(Link|Url)\s*\(/.test(f.src))
      .map((f) => f.p);
    expect(offenders).toEqual([]);
  });

  it("no component writes an invite URL by hand", () => {
    const offenders = files
      .filter((f) => /iter\.cx\/(waitlist\/)?r\//.test(f.src))
      .map((f) => f.p);
    expect(offenders).toEqual([]);
  });
});
