import { describe, expect, it, vi } from "vitest";
import {
  addressAvatarGradient,
  addressGradient,
  avatarInitial,
  displayHandle,
  displayName,
  emptyAccountProfile,
  formatJoined,
  fetchProfile,
  toAccountProfile,
} from "./profile";

const ADDRESS_A = "0x1234567890abcdef1234567890abcdef12345678";
const ADDRESS_B = "0xfedcba0987654321fedcba0987654321fedcba09";

describe("toAccountProfile", () => {
  it("falls back to an empty profile when the read failed", () => {
    const p = toAccountProfile(null, ADDRESS_A);
    expect(p).toEqual(emptyAccountProfile(ADDRESS_A));
  });

  it("carries every field of a full payload through", () => {
    const p = toAccountProfile(
      {
        address: ADDRESS_A,
        profile: {
          displayName: "OtherExactOwl",
          handle: "OtherExactOwl",
          avatarUrl: null,
          bannerUrl: null,
          joinedAt: 1_754_006_400, // 2025-08-01T00:00:00Z
        },
        social: { followers: 3, following: 1 },
        stats: { trades: 12, volumeUsd: 4200.5, createdTokens: 2 },
      },
      ADDRESS_A,
    );
    expect(p.profile.displayName).toBe("OtherExactOwl");
    expect(p.profile.handle).toBe("OtherExactOwl");
    // viewerFollows is null when the payload carried none — the read was not
    // scoped to a viewer, which is not the same as "they do not follow".
    expect(p.social).toEqual({ followers: 3, following: 1, viewerFollows: null });
    expect(p.stats).toEqual({ trades: 12, volumeUsd: 4200.5, createdTokens: 2 });
  });

  it("carries viewerFollows through, and only when it is a boolean", () => {
    // The defect this pins: the mapper used to rebuild `social` as
    // {followers, following} and silently DROP viewerFollows, so a Follow
    // button read a field that had been deleted, always saw null, and showed
    // "Follow" to someone who already followed — making unfollow unreachable.
    const followed = toAccountProfile(
      { social: { followers: 1, following: 0, viewerFollows: true } },
      ADDRESS_A,
    );
    expect(followed.social.viewerFollows).toBe(true);

    const notFollowed = toAccountProfile(
      { social: { followers: 1, following: 0, viewerFollows: false } },
      ADDRESS_A,
    );
    expect(notFollowed.social.viewerFollows).toBe(false);

    // Anything that is not a boolean means "not asked", which is null. false
    // would be a claim the server never made.
    for (const value of [undefined, null, "true", 1]) {
      expect(
        toAccountProfile({ social: { viewerFollows: value } }, ADDRESS_A).social.viewerFollows,
      ).toBeNull();
    }
  });

  it("degrades a partial payload field by field rather than discarding it whole", () => {
    const p = toAccountProfile({ social: { followers: 5 } }, ADDRESS_A);
    expect(p.social.followers).toBe(5);
    expect(p.social.following).toBe(0);
    expect(p.profile.displayName).toBeNull();
    expect(p.stats).toEqual({ trades: 0, volumeUsd: 0, createdTokens: 0 });
  });

  it("never invents a numeric stat from a non-numeric value", () => {
    const p = toAccountProfile({ stats: { trades: "not-a-number" } }, ADDRESS_A);
    expect(p.stats.trades).toBe(0);
  });
});

describe("displayName / displayHandle", () => {
  it("falls back to the short address when the wallet hasn't set one", () => {
    const p = emptyAccountProfile(ADDRESS_A);
    expect(displayName(p)).toBe(`${ADDRESS_A.slice(0, 6)}…${ADDRESS_A.slice(-4)}`);
    expect(displayHandle(p)).toBe(`${ADDRESS_A.slice(0, 6)}…${ADDRESS_A.slice(-4)}`);
  });

  it("prefers the set displayName/handle over the address", () => {
    const p = toAccountProfile(
      { profile: { displayName: "Nova", handle: "novawallet" } },
      ADDRESS_A,
    );
    expect(displayName(p)).toBe("Nova");
    expect(displayHandle(p)).toBe("novawallet");
  });
});

describe("formatJoined", () => {
  it("renders a real joinedAt as 'Joined <Mon> <YYYY>'", () => {
    expect(formatJoined(1_754_006_400)).toBe("Joined Aug 2025");
  });

  it("never fabricates a date when there is none", () => {
    expect(formatJoined(null)).toBe("Joined —");
  });
});

describe("addressGradient", () => {
  it("is deterministic for the same address", () => {
    expect(addressGradient(ADDRESS_A)).toEqual(addressGradient(ADDRESS_A));
  });

  it("differs between two wallets", () => {
    const a = addressGradient(ADDRESS_A);
    const b = addressGradient(ADDRESS_B);
    expect(a).not.toEqual(b);
  });

  it("never picks the same colour for both stops", () => {
    const { from, to } = addressGradient(ADDRESS_A);
    expect(from).not.toBe(to);
  });

  it("is case-insensitive, since checksummed and lowercase forms name the same wallet", () => {
    expect(addressGradient(ADDRESS_B)).toEqual(addressGradient(ADDRESS_B.toUpperCase()));
  });
});

/**
 * The avatar's default must not be the banner's.
 *
 * `IdentityCard` painted one gradient on both, so the disc read as a circular crop of the
 * banner directly above it — a user with no picture looked the same as a user with no
 * banner, and neither empty state said which was which.
 */
describe("addressAvatarGradient", () => {
  it("is stable for one address", () => {
    expect(addressAvatarGradient(ADDRESS_A)).toEqual(addressAvatarGradient(ADDRESS_A));
  });

  it("differs from the banner's gradient, for every address", () => {
    // The property that matters, checked across a spread of addresses rather than one:
    // the palette has 8 entries and the rotation is +3, which is coprime with 8 — so a
    // hue can never rotate back onto itself. A palette resized to a multiple of 3 would
    // break that silently, and this is what would catch it.
    for (let i = 0; i < 64; i++) {
      const address = `0x${i.toString(16).padStart(40, "0")}`;
      const banner = addressGradient(address);
      const avatar = addressAvatarGradient(address);
      expect(avatar.from).not.toBe(banner.from);
      expect(avatar.to).not.toBe(banner.to);
    }
  });

  it("is case-insensitive, like the banner's", () => {
    expect(addressAvatarGradient(ADDRESS_B)).toEqual(addressAvatarGradient(ADDRESS_B.toUpperCase()));
  });

  it("still uses two different hues", () => {
    const { from, to } = addressAvatarGradient(ADDRESS_A);
    expect(from).not.toBe(to);
  });
});

describe("avatarInitial", () => {
  it("takes the first letter, uppercased", () => {
    expect(avatarInitial("QuietGoldenLeopard")).toBe("Q");
    expect(avatarInitial("  ada lovelace")).toBe("A");
  });

  it("keeps a leading digit, because a handle may start with one", () => {
    expect(avatarInitial("1inch")).toBe("1");
    expect(avatarInitial("0x9E7A01E4514bb56ae642587E0485b606DB46850E")).toBe("0");
  });

  it("is empty when the name starts with punctuation", () => {
    // A leading "…" or "@" is decoration; drawn at 38px it says nothing about whose
    // profile this is, so the disc stays plain instead.
    expect(avatarInitial("…anon")).toBe("");
    expect(avatarInitial("")).toBe("");
    expect(avatarInitial(null)).toBe("");
    expect(avatarInitial(undefined)).toBe("");
  });
});

/**
 * The join date, which arrives as a STRING.
 *
 * `accountProfiles.createdAt` is a timestamp column and JSON has no date type,
 * so the gateway sends ISO 8601 — its own account tests assert exactly that.
 * The parser here read it with `Number()`, got NaN, and stored null, so every
 * profile on the venue rendered "Account joined —" while a perfectly good date
 * was on the wire.
 *
 * Nothing threw and nothing logged, because null is a LEGITIMATE value for this
 * field: a wallet with no profile row genuinely has no join date. The bug and
 * the feature were indistinguishable on screen, which is why the fix comes with
 * the real payload shape pinned rather than just a passing render.
 */
describe("toAccountProfile — joinedAt", () => {
  const ISO = "2026-09-03T16:42:41.191Z";

  it("parses the ISO string the gateway actually sends", () => {
    const p = toAccountProfile({ profile: { joinedAt: ISO } }, ADDRESS_A);
    expect(p.profile.joinedAt).toBe(Math.floor(Date.parse(ISO) / 1000));
    // The whole point: it has to survive as far as the rendered line.
    expect(formatJoined(p.profile.joinedAt)).toBe("Joined Sep 2026");
  });

  it("still accepts unix seconds, which is what formatJoined takes", () => {
    const p = toAccountProfile({ profile: { joinedAt: 1_754_006_400 } }, ADDRESS_A);
    expect(formatJoined(p.profile.joinedAt)).toBe("Joined Aug 2025");
  });

  it("reads a numeric STRING as seconds, not as a year", () => {
    // `Date.parse("1754006400")` is not NaN in every engine — it can be read as
    // a year — so a valid timestamp would land in the distant past.
    const p = toAccountProfile({ profile: { joinedAt: "1754006400" } }, ADDRESS_A);
    expect(formatJoined(p.profile.joinedAt)).toBe("Joined Aug 2025");
  });

  it("keeps null null, because 'no join date' is a real answer", () => {
    expect(toAccountProfile({ profile: { joinedAt: null } }, ADDRESS_A).profile.joinedAt).toBe(null);
    expect(toAccountProfile({ profile: {} }, ADDRESS_A).profile.joinedAt).toBe(null);
    expect(toAccountProfile({ profile: { joinedAt: "not a date" } }, ADDRESS_A).profile.joinedAt).toBe(null);
  });
});

describe("fetchProfile", () => {
  /*
   * The URL is the whole point of these.
   *
   * It read the gateway's own origin, and the gateway's CORS allowlist holds
   * production and not localhost — so in dev the browser discarded every
   * response and `useProfile` swallowed the rejection by design, leaving a
   * connected wallet showing a truncated address with no error anywhere. Pinned
   * as a string because that failure is invisible at runtime.
   */
  // Typed with the url parameter, so `calls[0][0]` is a string rather than a
  // zero-length tuple — the assertions below are entirely about that argument.
  const answer = (body: unknown, ok = true) =>
    vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status: ok ? 200 : 502 }));

  it("asks this app's proxy, not the gateway origin", async () => {
    const fetcher = answer({ address: ADDRESS_A, username: "lee" });
    vi.stubGlobal("fetch", fetcher);
    await fetchProfile("Arc Testnet", ADDRESS_A);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/gateway/profile/${ADDRESS_A}?network=Arc%20Testnet`,
    );
    vi.unstubAllGlobals();
  });

  it("names the chain, because the proxy picks the gateway from it", async () => {
    const fetcher = answer({ address: ADDRESS_A });
    vi.stubGlobal("fetch", fetcher);
    await fetchProfile("RISE Testnet", ADDRESS_A);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("network=RISE%20Testnet");
    vi.unstubAllGlobals();
  });

  it("throws on a refusal so useProfile can degrade to the address", async () => {
    vi.stubGlobal("fetch", answer({}, false));
    await expect(fetchProfile("Arc Testnet", ADDRESS_A)).rejects.toThrow(/Couldn't load profile/);
    vi.unstubAllGlobals();
  });
});
