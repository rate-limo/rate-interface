"use client";

import type { SearchNavItem } from "@/components/Organisms/SearchBar/searchNav";

/**
 * Recent searches — the top half of the modal's zero-query state.
 *
 * The whole entry is stored, not just an id, so reopening the modal paints
 * instantly with no refetch. That is the point of the feature: the fastest search
 * is the one you already did.
 *
 * ## Validated on the way OUT, not just in
 *
 * localStorage is user-writable. These entries drive a `router.push`, so a
 * hand-edited value would put an attacker-chosen string in a route. `parseRecents`
 * therefore re-checks the shape of every entry on read and drops the ones that
 * fail, rather than trusting what it wrote earlier — the same rule
 * `lib/support/store` and `lib/referral/pending` already apply.
 *
 * ## The storage key is a policy obligation
 *
 * `/cookies` lists every storage key and the file that writes it. Adding one here
 * without adding the row there makes that page a false claim. See
 * `app/[locale]/cookies/page.tsx`.
 */

export const RECENTS_KEY = "iter.search-recents";

/** Enough to be useful, short enough that the zero-query view stays scannable. */
export const MAX_RECENTS = 6;

function isNonEmptyString(v: unknown): v is string {
    return typeof v === "string" && v.length > 0;
}

/**
 * Whether a decoded entry is a usable search item.
 *
 * Deliberately checks the fields the ROUTE is built from — a token needs its
 * symbol, a pair needs both sides, a wallet needs its address — because those are
 * what reach a URL. Anything short of that is dropped, not repaired.
 */
export function isValidRecent(value: unknown): value is SearchNavItem {
    if (typeof value !== "object" || value === null) return false;
    const item = value as { kind?: unknown; result?: unknown };
    if (typeof item.result !== "object" || item.result === null) return false;
    const r = item.result as Record<string, unknown>;

    if (item.kind === "token") return isNonEmptyString(r.symbol) && isNonEmptyString(r.id);
    if (item.kind === "pair") {
        return isNonEmptyString(r.baseSymbol) && isNonEmptyString(r.quoteSymbol) && isNonEmptyString(r.id);
    }
    if (item.kind === "wallet") {
        return isNonEmptyString(r.address) && /^0x[0-9a-fA-F]{40}$/.test(r.address);
    }
    return false;
}

/** Identity of a stored entry, for de-duplication. */
export function recentKey(item: SearchNavItem): string {
    if (item.kind === "wallet") return `wallet:${item.result.address.toLowerCase()}`;
    return `${item.kind}:${item.result.id}`;
}

/**
 * Decodes the stored payload. Never throws: unparseable JSON, a non-array, and a
 * list of malformed entries all read as "no recents", which is a working empty
 * state rather than a broken modal.
 */
export function parseRecents(raw: string | null): SearchNavItem[] {
    if (!raw) return [];
    let decoded: unknown;
    try {
        decoded = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(decoded)) return [];
    return decoded.filter(isValidRecent).slice(0, MAX_RECENTS);
}

/**
 * The list after `item` is used: most recent first, de-duplicated, capped.
 *
 * Pure so the ordering rules are testable without a DOM. Re-selecting an entry
 * moves it to the front rather than adding a second copy — a list that can hold
 * the same market three times is a log, not a shortcut.
 */
export function pushRecent(list: SearchNavItem[], item: SearchNavItem): SearchNavItem[] {
    if (!isValidRecent(item)) return list;
    const key = recentKey(item);
    return [item, ...list.filter((existing) => recentKey(existing) !== key)].slice(0, MAX_RECENTS);
}

/**
 * Reads the stored list. Returns [] in any environment without localStorage —
 * this runs during the modal's first client render and must not assume a browser
 * with storage available (Safari private mode throws on access, not just on
 * write).
 */
export function readRecents(): SearchNavItem[] {
    try {
        return parseRecents(window.localStorage.getItem(RECENTS_KEY));
    } catch {
        return [];
    }
}

/**
 * Persists the list. Returns false when storage refused — the caller keeps the
 * in-memory list either way, so recents still work for the session; they just do
 * not survive the page. Silence here would promise persistence we do not have.
 */
export function writeRecents(list: SearchNavItem[]): boolean {
    try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
        return true;
    } catch {
        return false;
    }
}

/** Empties the list, for the "Clear" control beside the Recent searches heading. */
export function clearRecents(): void {
    try {
        window.localStorage.removeItem(RECENTS_KEY);
    } catch {
        // Nothing to do — the caller has already cleared its own state.
    }
}
