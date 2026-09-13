"use client";

/**
 * The embedded signer, on mera.
 *
 * A passkey's WebAuthn PRF output is 32 secret bytes; mera uses them as a
 * secp256k1 private key and `toViemAccount` adapts the signing session into a
 * viem `LocalAccount`. So the account is self-custodial with no smart-account
 * contract and no service holding key material — which is what
 * `apps/web/CLAUDE.md` has described the OG Pass benefit as since before there
 * was an implementation for it.
 *
 * ## What is secret, and what is merely a pointer
 *
 * `prfOutput` IS the private key. It is never written anywhere — not
 * localStorage, not a cookie, not a log line — and only ever lives in the
 * signing session, which zeroes its copy on `end()`.
 *
 * What IS persisted is the credential POINTER: the credential id, its
 * transports, and the salt. None of them can produce a key without the
 * authenticator, and all three are needed to ask for the same PRF output again
 * on the next visit. Losing them does not lose the account — the passkey can be
 * re-selected — but it does mean prompting the user to pick their credential.
 *
 * ## The salt is load-bearing and must never change
 *
 * Same passkey + same salt ⇒ same 32 bytes ⇒ same private key ⇒ same address.
 * Change `PRF_SALT` and every existing user silently gets a NEW address, with
 * their funds stranded at the old one and no error anywhere. It is stored
 * alongside the credential rather than assumed, so a future rotation is a
 * deliberate migration instead of an accident.
 *
 * ## Passkeys are origin-bound, and that is visible in the address
 *
 * WebAuthn scopes a credential to an rpId. `localhost` and `iter.cx` are
 * different origins, so the same human gets DIFFERENT accounts on each — a dev
 * build cannot spend what production holds. Expect this while testing; it is
 * the platform's rule, not a bug here.
 *
 * ## Mera is 0.2.0 / preview
 *
 * This is key derivation: a defect loses funds irreversibly and silently, which
 * is not the failure mode of an ordinary dependency. The version is pinned and
 * the module is kept small and readable for that reason.
 */

import {
  MeraError,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialTransport,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hintedWebAuthnClient, prfKnownUnavailable } from "./webauthnClient";
import type { LocalAccount } from "viem";

/** Storage key. Has a row in /cookies, as every key in this app must. */
const CREDENTIAL_KEY = "iter.mera-credential";

/**
 * The PRF salt. Fixed, versioned in the name, and never edited in place — see
 * the header: changing it re-derives every user onto a new address.
 */
const PRF_SALT = new TextEncoder().encode("iter.mera.v1.secp256k1.account\0\0");

type StoredCredential = {
  v: 1;
  credentialId: string;
  transports?: readonly PasskeyCredentialTransport[];
  /** base64url of the 32-byte salt actually evaluated, so it survives a change to the constant. */
  salt: string;
};

const b64url = {
  encode(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text: string): Uint8Array {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  },
};

function readCredential(): StoredCredential | null {
  try {
    const raw = window.localStorage.getItem(CREDENTIAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCredential;
    // Validated on the way OUT as well as in: a hand-edited value must read as
    // "no credential" rather than be forwarded into WebAuthn. Same rule the
    // support-ticket store follows.
    if (parsed?.v !== 1 || typeof parsed.credentialId !== "string" || typeof parsed.salt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** True when this browser already knows which passkey to ask for. */
export function hasMeraCredential(): boolean {
  return readCredential() !== null;
}

/**
 * Forget the pointer. Does NOT delete the passkey or the account — the same
 * credential re-derives the same address — it only stops this browser
 * pre-selecting it.
 */
export function forgetMeraCredential(): void {
  try {
    window.localStorage.removeItem(CREDENTIAL_KEY);
  } catch {
    // A browser refusing storage is not a reason to fail a sign-out.
  }
}

export type MeraSigner = {
  account: LocalAccount<"mera">;
  /** Zeroes the in-memory key copy. Signing after this throws SESSION_ENDED. */
  end: () => void;
};

function toSigner(session: Secp256k1SigningSession): MeraSigner {
  return { account: toViemAccount(session), end: () => session.end() };
}

/**
 * The relying party this credential is scoped to.
 *
 * Read from the live host rather than configured, so localhost, a preview
 * deployment and production each stay in their own credential space
 * automatically. A hardcoded value would either break previews or, worse,
 * silently mint a credential the browser then refuses to return.
 */
function rpId(): string {
  return window.location.hostname;
}

/**
 * Create the account. Prompts for a new passkey, so it needs a user gesture.
 *
 * `name` is what the authenticator shows when the user picks a passkey later,
 * so it wants to be something they recognise — their email from the Privy
 * session, not an address.
 */
export async function createMeraSigner(user: {
  name: string;
  displayName?: string;
}): Promise<MeraSigner> {
  // Asked BEFORE the ceremony, because mera can only learn PRF is missing after
  // `navigator.credentials.create()` has already stored a credential — one this
  // app can never use, one more on every retry, and none of them removable from
  // script. Only an explicit negative refuses; see prfKnownUnavailable.
  if (await prfKnownUnavailable()) {
    throw new MeraError(
      "PRF_UNAVAILABLE",
      "This browser reports no WebAuthn PRF support, which is what derives the key.",
    );
  }

  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Iter" },
    user: { name: user.name, displayName: user.displayName ?? user.name },
    prfSalt: PRF_SALT,
    // Adds `hints` so the browser ASKS where to save instead of diving into the
    // platform authenticator. Reaching the picker is what lets the user land on
    // an authenticator that implements PRF when the built-in one does not.
    webAuthnClient: hintedWebAuthnClient,
  });

  const stored: StoredCredential = {
    v: 1,
    credentialId: result.credentialId,
    transports: result.transports,
    salt: b64url.encode(result.prfSalt),
  };
  try {
    window.localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(stored));
  } catch {
    // Storage refused (private window, quota). The account still works for this
    // session; the next visit simply has to ask which passkey to use.
  }

  return toSigner(createSecp256k1SigningSession({ privateKey: result.prfOutput }));
}

/**
 * Unlock the existing account. Prompts the authenticator, so it needs a user
 * gesture too. Returns null when this browser has no stored pointer — the
 * caller should offer `createMeraSigner` or a credential picker instead of
 * treating that as an error.
 */
export async function unlockMeraSigner(): Promise<MeraSigner | null> {
  const stored = readCredential();
  if (!stored) return null;

  const result = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: { credentialId: stored.credentialId, transports: stored.transports },
    // The salt that was actually evaluated when the account was made, not the
    // current constant — see the header on why those can differ.
    prfSalt: b64url.decode(stored.salt),
    webAuthnClient: hintedWebAuthnClient,
  });

  return toSigner(createSecp256k1SigningSession({ privateKey: result.prfOutput }));
}
