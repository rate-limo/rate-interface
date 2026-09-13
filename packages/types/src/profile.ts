/**
 * The generated default identity every wallet gets before it customises
 * anything — "adjective adjective animal" in PascalCase, e.g. `OtherExactOwl`.
 *
 * Pure and dependency-free (no viem, no crypto library) so it can run
 * anywhere `@iter/types` already runs: apps/gateway (generates on first
 * read), apps/admin-service (validates edits against the same shape rules)
 * and, if a future surface needs it, apps/web.
 *
 * ## Deterministic, not random
 *
 * `generateProfile` hashes the ADDRESS, never the clock or a random source,
 * so the same wallet always generates the same name — including before any
 * `admin.profiles` row exists for it. Two independent callers computing a
 * default for the same address (e.g. two concurrent first-time reads racing
 * to insert) must agree byte-for-byte, or the "idempotent insert" the
 * gateway route relies on stops being idempotent.
 *
 * The hash is a plain FNV-1a over the lowercased address, salted per slot so
 * the two adjectives and the animal don't move in lockstep — the same
 * technique `tokenColor` in apps/web/lib/swap/tokens.ts already uses for a
 * deterministic-art-from-a-string seed, just with three independent lanes
 * instead of one.
 */

const ADJECTIVES = [
  "Other", "Exact", "Quiet", "Bold", "Swift", "Bright", "Calm", "Clever",
  "Eager", "Fuzzy", "Gentle", "Happy", "Iron", "Jolly", "Keen", "Lively",
  "Merry", "Nimble", "Odd", "Proud", "Quick", "Rapid", "Sharp", "Tidy",
  "Vivid", "Witty", "Zesty", "Amber", "Brave", "Cosmic", "Dusty", "Ember",
  "Frosty", "Golden", "Hollow", "Ivory", "Jagged", "Kindred", "Lucky",
  "Misty", "Noble", "Opal", "Plucky", "Rusty", "Silent", "Tawny", "Umber",
  "Velvet", "Windy", "Yonder",
] as const;

const ANIMALS = [
  "Owl", "Fox", "Wolf", "Hawk", "Bear", "Lynx", "Otter", "Falcon", "Heron",
  "Panther", "Raven", "Badger", "Crane", "Dolphin", "Egret", "Ferret",
  "Gecko", "Ibis", "Jackal", "Koala", "Lemur", "Marten", "Newt", "Ocelot",
  "Puffin", "Quail", "Rabbit", "Seal", "Toucan", "Urchin", "Viper",
  "Weasel", "Yak", "Zebra", "Bison", "Cobra", "Dingo", "Eagle", "Finch",
  "Gazelle", "Impala", "Ibex", "Jaguar", "Kestrel", "Leopard", "Mantis",
  "Narwhal", "Ox", "Pika",
] as const;

/** 32-bit FNV-1a. Not cryptographic — this only needs to be fast, pure and
 * deterministic across every runtime `@iter/types` ships to (browser, node,
 * edge), which rules out `node:crypto` and Web Crypto's async digest. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function slot<T>(list: readonly T[], seed: string): number {
  return fnv1a(seed) % list.length;
}

export interface GeneratedProfile {
  displayName: string;
  handle: string;
}

/**
 * The default identity for a wallet — deterministic, so calling this twice
 * for the same address (e.g. a retried insert) always agrees.
 *
 * `handle` starts equal to `displayName`; the caller appends
 * {@link handleDiscriminator} only if the plain handle collides with a
 * DIFFERENT address's generated name (two wallets can hash to the same
 * words — see that function's doc).
 */
export function generateProfile(address: string): GeneratedProfile {
  const a = address.trim().toLowerCase();
  const i1 = slot(ADJECTIVES, `${a}:adj1`);
  let i2 = slot(ADJECTIVES, `${a}:adj2`);
  // Avoid "OtherOtherOwl" — deterministic bump, still a pure function of a.
  if (i2 === i1) i2 = (i2 + 1) % ADJECTIVES.length;
  const animal = ANIMALS[slot(ANIMALS, `${a}:animal`)];
  const displayName = `${ADJECTIVES[i1]}${ADJECTIVES[i2]}${animal}`;
  return { displayName, handle: displayName };
}

/**
 * A short, deterministic suffix for a handle that collided with a DIFFERENT
 * address's generated name. 24 bits over a derived-name population in the
 * thousands is the same collision math `derivedCode` in
 * apps/admin-service/src/referral.ts already accepts for the same reason:
 * this is cosmetic disambiguation, not a security boundary, and it must be
 * a pure function of the address so a retried insert for the same wallet
 * produces the exact same discriminated handle rather than a new guess.
 */
export function handleDiscriminator(address: string): string {
  const hex = address.trim().toLowerCase().replace(/^0x/, "");
  return hex.slice(-4);
}

/** `generateProfile(address).handle` with the collision suffix appended. */
export function discriminatedHandle(address: string): string {
  return `${generateProfile(address).handle}${handleDiscriminator(address)}`;
}

/* -------------------------------------------------------------------------- */
/* Shape rules — shared by the gateway's generator and admin-service's editor */
/* -------------------------------------------------------------------------- */

/**
 * 3–20 characters, starts with a letter, otherwise letters/digits/underscore.
 * Conservative on purpose: a handle ends up in a URL. Wide enough to hold
 * both the generated PascalCase form (letters only) and a discriminated one
 * (letters + up to 4 lowercase hex digits appended).
 */
export const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

export function isValidHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value);
}

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 40;

export function isValidDisplayName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= DISPLAY_NAME_MIN_LENGTH && trimmed.length <= DISPLAY_NAME_MAX_LENGTH;
}
