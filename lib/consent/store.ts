/**
 * Cookie-consent state.
 *
 * Kept as pure functions over a Storage-like object so the decision logic can be
 * tested without a DOM and without mocking globals. The React binding is the
 * hook at the bottom; everything above it is what actually decides whether
 * tracking is allowed to load.
 *
 * The choice itself lives in localStorage, not in a cookie. That is deliberate:
 * a consent record is strictly-necessary storage under any reading, it never
 * needs to reach the server, and putting it in a cookie would mean shipping it
 * on every request — including the ones the user just declined to be tracked by.
 */

import { useEffect, useState } from "react";

export const CONSENT_KEY = "iter.cookie-consent";

/**
 * Bump when the policy changes materially. A stored record from an older
 * version is treated as no answer, so the banner re-asks rather than silently
 * carrying consent forward to terms the user never saw.
 */
export const CONSENT_VERSION = 1;

export type ConsentStatus = "accepted" | "rejected";

export interface ConsentRecord {
  status: ConsentStatus;
  version: number;
  /** ISO timestamp — the evidence half of "the user agreed". */
  at: string;
}

/** The subset of Storage used here, so tests can pass a plain object. */
export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Read the stored decision. Returns null for "no answer yet" — which includes a
 * malformed record and a stale version, both of which must re-ask rather than
 * default to allowing anything.
 */
export function readConsent(storage: ConsentStorage | null | undefined): ConsentRecord | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(CONSENT_KEY);
  } catch {
    // Safari in private mode, storage disabled by policy, quota errors. No
    // stored answer means no consent, which is the safe reading.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.status !== "accepted" && parsed.status !== "rejected") return null;
    if (parsed.version !== CONSENT_VERSION) return null;
    return { status: parsed.status, version: parsed.version, at: parsed.at ?? "" };
  } catch {
    return null;
  }
}

export function writeConsent(
  storage: ConsentStorage | null | undefined,
  status: ConsentStatus,
  now: () => Date = () => new Date(),
): ConsentRecord {
  const record: ConsentRecord = {
    status,
    version: CONSENT_VERSION,
    at: now().toISOString(),
  };
  try {
    storage?.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Unwritable storage means the banner will ask again next visit. Annoying,
    // but the alternative — assuming consent we couldn't record — is worse.
  }
  return record;
}

export function clearConsent(storage: ConsentStorage | null | undefined): void {
  try {
    storage?.removeItem(CONSENT_KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * The one question the rest of the app asks. Non-essential tracking loads ONLY
 * on an explicit "accepted" — no answer, a stale answer and an unreadable store
 * all mean no.
 */
export function analyticsAllowed(record: ConsentRecord | null): boolean {
  return record?.status === "accepted";
}

/** Fired on write so every mounted consumer re-reads without a page reload. */
const CONSENT_EVENT = "iter:consent-change";

function browserStorage(): ConsentStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface UseConsent {
  /** undefined until mounted — see the hydration note below. */
  record: ConsentRecord | null | undefined;
  ready: boolean;
  accept(): void;
  reject(): void;
  reset(): void;
}

/**
 * Hydration-safe by construction: the server cannot know the stored choice, so
 * the first client render must match the server's. `record` stays `undefined`
 * until an effect has run, and callers render nothing until `ready`. Same rule
 * the OG Pass countdown follows (see apps/web/CLAUDE.md).
 */
export function useConsent(): UseConsent {
  const [record, setRecord] = useState<ConsentRecord | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setRecord(readConsent(browserStorage()));
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    // Another tab answering the banner should settle this one too.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const commit = (status: ConsentStatus) => {
    const next = writeConsent(browserStorage(), status);
    setRecord(next);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  return {
    record,
    ready: record !== undefined,
    accept: () => commit("accepted"),
    reject: () => commit("rejected"),
    reset: () => {
      clearConsent(browserStorage());
      setRecord(null);
      window.dispatchEvent(new Event(CONSENT_EVENT));
    },
  };
}
