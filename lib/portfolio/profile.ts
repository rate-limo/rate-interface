"use client";
import { gatewayFetch } from "@/lib/realtime/watermark";

// Defined in its own module because the OG card route calls it from the server;
// see `imageUrl.ts`. Re-exported here so existing client imports are unchanged.
export { profileImageUrl } from "./imageUrl";

/**
 * Everything the portfolio knows about a wallet's profile, in two halves that
 * arrived independently and both shipped.
 *
 * ABOVE the divider: the pure helpers for `/api/account/:address` — the
 * generated `admin.profiles` row (display name, handle, joined date) plus the
 * per-wallet gradient used when no avatar has been uploaded.
 *
 * BELOW it: the read/write client for `/api/profile` — the user-authored
 * `broker.profiles` row (username, bio, uploaded avatar and banner bytes).
 *
 * They describe two different tables and two different records, which is a
 * seam worth knowing about rather than one worth hiding: see
 * `packages/db/src/schema/profiles/schema.ts` for why both exist and what
 * reconciling them would involve.
 */

import type { AccountProfile } from "./types";

export function shortAddress(address: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

/** An account profile with nothing resolved yet — the fallback for a failed or missing read. */
export function emptyAccountProfile(address: string): AccountProfile {
  return {
    address,
    profile: { displayName: null, handle: null, avatarUrl: null, bannerUrl: null, joinedAt: null },
    social: { followers: 0, following: 0, viewerFollows: null },
    stats: { trades: 0, volumeUsd: 0, createdTokens: 0 },
  };
}

function finite(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * A join date, in unix SECONDS, from whatever the gateway sent.
 *
 * `optionalFinite` was doing this job and could never succeed at it.
 * `accountProfiles.createdAt` is a timestamp column, the gateway returns it
 * as-is, and JSON has no date type — so the field arrives as an ISO 8601 STRING
 * (`"2026-09-03T16:42:41.191Z"`, asserted by the gateway's own account tests).
 * `Number()` of that is NaN, which became null, which `formatJoined` rendered as
 * an em dash. Every profile on the venue read "Account joined —" while the
 * gateway was sending a perfectly good date, and nothing anywhere errored:
 * "unknown" is a legitimate state for this field, so the bug looked exactly like
 * the feature.
 *
 * Numbers are still accepted and still mean seconds — that is what
 * `formatJoined` multiplies up, and what its tests pass — so a caller that has
 * already converted is unaffected.
 */
function optionalEpochSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  // A numeric string is seconds, matching the number branch. Checked first
  // because `Date.parse("1754006400")` is not NaN in every engine — it can be
  // read as a year — and that would turn a valid timestamp into a date in the
  // distant past rather than rejecting it.
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

/** Normalizes the raw `/api/account/:address` payload into `AccountProfile`, degrading field by field rather than failing the whole header on one bad value. */
export function toAccountProfile(raw: Record<string, unknown> | null, address: string): AccountProfile {
  if (!raw) return emptyAccountProfile(address);
  const profile = (raw.profile ?? {}) as Record<string, unknown>;
  const social = (raw.social ?? {}) as Record<string, unknown>;
  const stats = (raw.stats ?? {}) as Record<string, unknown>;
  return {
    address: optionalString(raw.address) ?? address,
    profile: {
      displayName: optionalString(profile.displayName),
      handle: optionalString(profile.handle),
      avatarUrl: optionalString(profile.avatarUrl),
      bannerUrl: optionalString(profile.bannerUrl),
      joinedAt: optionalEpochSeconds(profile.joinedAt),
    },
    social: {
      followers: finite(social.followers),
      following: finite(social.following),
      // Carried through rather than rebuilt away. The gateway only sends this
      // when the request was scoped with `?viewer=`; anything that is not a
      // boolean means "not asked", which is null and not false.
      viewerFollows: typeof social.viewerFollows === "boolean" ? social.viewerFollows : null,
    },
    stats: {
      trades: finite(stats.trades),
      volumeUsd: finite(stats.volumeUsd),
      createdTokens: finite(stats.createdTokens),
    },
  };
}

/** Name shown above the handle — the wallet's own name, or the short address when it hasn't set one. */
export function displayName(account: AccountProfile): string {
  return account.profile.displayName ?? shortAddress(account.address);
}

/** The `@handle` row — the wallet's own handle, or the short address again so the header never renders `@` with nothing after it. */
export function displayHandle(account: AccountProfile): string {
  return account.profile.handle ?? shortAddress(account.address);
}

/** "Joined Aug 2026", or a dash while the indexer hasn't resolved a first-seen time — never a fabricated date. */
export function formatJoined(joinedAt: number | null): string {
  if (!joinedAt || !Number.isFinite(joinedAt)) return "Joined —";
  return `Joined ${new Date(joinedAt * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

/**
 * Deterministic two-hue gradient for a wallet with no `avatarUrl`/`bannerUrl` —
 * every wallet today. Same approach as `lib/swap/tokens.ts`'s `tokenColor`
 * (hash the string, index into a fixed palette) rather than a second scheme,
 * applied to the address so two wallets render visibly different rather than
 * both falling back to the same `--m-primary`/`--m-logo` pair.
 */
const AVATAR_HUES = [
  "#3987e5",
  "#c98500",
  "#2ba563",
  "#d55181",
  "#7c5cff",
  "#d95926",
  "#199e70",
  "#5f93d6",
];

/** Same shape as `tokenColor`'s hash — Horner's method over the char codes, folded to 32 bits. */
function hashForward(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A second, differently-shaped hash for the gradient's other stop.
 *
 * Just re-salting the input (e.g. hashing `key + ":2"`) is NOT independent
 * here: 31 ≡ -1 (mod 8), so appending a fixed-length suffix multiplies the
 * original hash's low bits by a fixed ±1 factor before folding in the
 * suffix's own contribution — `hash(key)` and `hash(key + suffix)` end up
 * correlated mod 8, which is exactly the palette's bucket count, so `from`
 * and `to` collapsed onto essentially the same handful of pairs regardless
 * of address. Reading the string back-to-front with a different multiplier
 * changes which character dominates the Horner recurrence, which is enough
 * to decorrelate the two indices in practice.
 */
function hashBackward(value: string): number {
  let h = 0;
  for (let i = value.length - 1; i >= 0; i--) h = (h * 131 + value.charCodeAt(i)) >>> 0;
  return h;
}

export interface AddressGradient {
  from: string;
  to: string;
}

export function addressGradient(address: string): AddressGradient {
  const key = address.toLowerCase();
  const from = AVATAR_HUES[hashForward(key) % AVATAR_HUES.length];
  let toIndex = hashBackward(key) % AVATAR_HUES.length;
  if (AVATAR_HUES[toIndex] === from) toIndex = (toIndex + 1) % AVATAR_HUES.length;
  return { from, to: AVATAR_HUES[toIndex] };
}

/**
 * The AVATAR's default colours — deliberately not the banner's.
 *
 * `IdentityCard` painted `addressGradient` on both surfaces, so the avatar disc read as a
 * circular crop of the banner directly above it: one gradient, two shapes, and no way to
 * tell that a user has no picture from the fact that they have no banner either. They are
 * two different things a user uploads separately, and the empty state should say so.
 *
 * Derived from the same address, so the pair still belongs to one identity and the two
 * surfaces still harmonise. `+3` is coprime with the palette's 8 entries, which is what
 * guarantees the rotation lands on a different hue for every address rather than
 * occasionally folding back onto the banner's own — the property `profile.test.ts` pins.
 */
export function addressAvatarGradient(address: string): AddressGradient {
  const banner = addressGradient(address);
  const rotate = (hue: string) => AVATAR_HUES[(AVATAR_HUES.indexOf(hue) + 3) % AVATAR_HUES.length];
  return { from: rotate(banner.to), to: rotate(banner.from) };
}

/**
 * The letter drawn on a default avatar.
 *
 * A coloured disc alone says "no picture" only to someone who already knows the product;
 * a letter says whose it is.
 *
 * Digits count: a handle may legitimately begin with one ("1inch", "0xdeadbeef"), and
 * blanking those would single out real names. Punctuation does not — a leading "…" or "@"
 * is decoration, and drawing it on a 96px disc says nothing about whose profile this is,
 * so the disc stays plain instead.
 */
export function avatarInitial(name: string | null | undefined): string {
  const first = (name ?? "").trim().charAt(0);
  return /[a-z0-9]/i.test(first) ? first.toUpperCase() : "";
}

/* ────────── /api/profile — the user-authored, editable record ────────── */

/**
 * Wallet-owned profile data (username, display name, bio, avatar, banner, and
 * a self-reported X handle) served by apps/gateway's /api/profile routes.
 *
 * Gateway is CORS-open for browser calls (see the PonderLinks comment in
 * consts/index.ts), unlike admin-service's routes, which go through a
 * next.config.ts same-origin rewrite. So these hit PonderLinks[networkName]
 * directly, matching every other portfolio fetcher in this app.
 *
 * ## The address is proved, never asserted
 *
 * Every write signs a message with the connected wallet; the gateway recovers
 * the address from that signature and rejects a mismatch (see profileAuth.ts
 * on the gateway). The request body's `address` field only lets the server
 * confirm the recovery matches what the caller claims -- it is never trusted
 * on its own, same reasoning as apps/web/lib/referral/apply.ts.
 */

import { PonderLinks } from "@/consts";

export interface ProfileData {
  address: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  xHandle: string | null;
  /**
   * X's numeric user id — present ONLY when the OAuth callback wrote it, so it
   * is the verified flag. A handle can be hand-typed (and rows predating the
   * OAuth flow all are), which is why nothing may treat `xHandle` alone as a
   * confirmed link.
   */
  xUserId: string | null;
  /** Profile image copied from X at link time. Provenance for the picture, not
   * a fallback anyone resolves at read time — see migration 0015. */
  xAvatarUrl: string | null;
  /** Unix seconds the link was made; null for a hand-typed handle. */
  xLinkedAt: number | null;
  updatedAt: number | null;
}

export interface SignMessage {
  (args: { message: string }): Promise<string>;
}

/** Must match apps/gateway/src/profileAuth.ts's canonical message exactly. */
function profileMessage(address: string, timestamp: number): string {
  return `Update Iter profile\naddress: ${address.toLowerCase()}\ntimestamp: ${timestamp}`;
}

function gatewayUrl(networkName: string): string {
  const base = PonderLinks[networkName];
  if (!base) throw new Error(`No gateway configured for ${networkName}`);
  return base;
}

/** A rejected signature is a decision, not an error -- callers should not
 * report it as a failure. Mirrors apps/web/lib/referral/apply.ts's isRejection. */
export function isSignatureRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

/**
 * SAME-ORIGIN, through the app's own gateway proxy.
 *
 * This read the gateway directly, and the gateway's CORS allowlist holds the
 * production origins and not localhost — verified by asking it with each:
 * `Origin: https://www.iter.cx` comes back with `access-control-allow-origin`,
 * `Origin: http://localhost:3217` comes back 200 with no such header, so the
 * browser discards it and the fetch rejects. `useProfile` swallows that by
 * design ("an unreachable gateway costs the NAME and nothing else"), so the
 * whole symptom was a wallet showing a truncated address in dev with no error
 * anywhere.
 *
 * `app/api/gateway/[...path]` exists for exactly this and says so: "The gateway
 * intentionally rejects arbitrary localhost origins; server-to-server requests
 * have no browser Origin and remain within policy." Same path every other
 * browser read takes (`usePairs`, `usePairCandles`, `useUngatedPair`).
 *
 * Note this is an ORIGIN control, not an auth one — the route is public and the
 * write half authenticates by signature — so proxying grants nothing a `curl`
 * could not already do.
 */
export async function fetchProfile(
  networkName: string,
  address: string,
): Promise<ProfileData> {
  const query = encodeURIComponent(networkName);
  const res = await gatewayFetch(`/api/gateway/profile/${address}?network=${query}`);
  if (!res.ok) throw new Error(`Couldn't load profile (${res.status})`);
  return (await res.json()) as ProfileData;
}

/**
 * Absolutizes the RELATIVE image paths the profile response carries.
 *
 * `avatarUrl`/`bannerUrl` come back as `/api/avatar/<sha256>` — a path on the
 * GATEWAY, not on this app. Rendering one straight into an `<img src>` resolves
 * it against the web app's own origin, where it 404s silently and leaves the
 * gradient fallback showing, which is indistinguishable from "this wallet has no
 * avatar". Anything that displays a profile image goes through here.
 *
 * Absolute URLs (a future CDN, or an X avatar on pbs.twimg.com) pass through
 * untouched.
 */

export interface SaveProfileInput {
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  xHandle?: string | null;
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body?.error as string | undefined) ?? `Request failed (${res.status})`;
}

export async function saveProfile(
  networkName: string,
  address: string,
  input: SaveProfileInput,
  signMessageAsync: SignMessage,
): Promise<ProfileData> {
  const timestamp = Date.now();
  const signature = await signMessageAsync({ message: profileMessage(address, timestamp) });
  const res = await fetch(`/profile/save`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, timestamp, signature, ...input }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ProfileData;
}

/** Reads a File as a base64 data URL; the gateway strips the `data:...;base64,`
 * prefix defensively, but we send it as-is since that's what FileReader gives. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

export async function uploadProfileImage(
  networkName: string,
  address: string,
  kind: "avatar" | "banner",
  file: File,
  signMessageAsync: SignMessage,
): Promise<string> {
  const timestamp = Date.now();
  const signature = await signMessageAsync({ message: profileMessage(address, timestamp) });
  const imageBase64 = await fileToBase64(file);
  const res = await fetch(`/profile/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, timestamp, signature, imageBase64 }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { url: string }).url;
}
