import type { SearchPairResult, SearchTokenResult } from "@/queries/server/search";
import { isUnlisted } from "@/lib/search/listing";
import { isSameAddress, truncateAddress } from "@/lib/search/address";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { networkNameToSlug } from "@/consts";

/**
 * A wallet hit. Synthesised locally by the address resolver (lib/search/address),
 * never returned by `/api/search` — there is no account index. `id` exists only so
 * a wallet row keys and de-dupes like the other two kinds.
 */
export type SearchWalletResult = {
    type: "wallet";
    id: string;
    address: `0x${string}`;
};

export type SearchNavItem =
    | { kind: "token"; result: SearchTokenResult }
    | { kind: "pair"; result: SearchPairResult }
    | { kind: "wallet"; result: SearchWalletResult };

/**
 * The modal's four tabs, for three kinds of thing.
 *
 * "all" is the combined default rather than a fourth category: it is the view a
 * user lands in, and the per-kind tabs exist to narrow a noisy result set. Wallets
 * has no plural results by construction — a query either is an address or isn't —
 * so its tab holds at most one row.
 */
export type SearchTab = "all" | "tokens" | "pools" | "wallets";

export const SEARCH_TABS: readonly SearchTab[] = ["all", "tokens", "pools", "wallets"];

/** Tab labels. "Pools" is the user-facing word for what the index calls pairs. */
export const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
    all: "All",
    tokens: "Tokens",
    pools: "Pools",
    wallets: "Wallets",
};

/**
 * Flattens the groups into one ordered list matching the panel's visual order
 * (Wallets, then Tokens, then Pools) so keyboard highlight index and mouse-hover
 * index refer to the same item.
 *
 * A wallet hit sorts FIRST and that is deliberate: it only exists when the query
 * is a well-formed address, which is an unambiguous statement of intent. Nobody
 * pastes 42 hex characters hoping for a token symbol, and burying the one exact
 * answer under fuzzy `ilike` matches on the same string would be perverse.
 */
export function flattenSearchResults(
    tokens: SearchTokenResult[],
    pairs: SearchPairResult[],
    wallet?: SearchWalletResult | null,
): SearchNavItem[] {
    return [
        ...(wallet ? [{ kind: "wallet", result: wallet } as SearchNavItem] : []),
        ...listedFirst(tokens).map((result): SearchNavItem => ({ kind: "token", result })),
        ...listedFirst(pairs).map((result): SearchNavItem => ({ kind: "pair", result })),
    ];
}

/**
 * Listed hits before unlisted ones, order preserved within each half.
 *
 * `/api/search` is ungated by design — it is an identity lookup and must keep
 * resolving regardless of `verified` (pinned in the gateway's
 * routeCoverage.test.ts) — so unlisted markets have always come back from it.
 * They just arrived indistinguishable from reviewed ones, and could be the
 * pre-highlighted first hit that Enter selects.
 *
 * Sorting them last is what stops that: whenever any listed hit matches, it is
 * the one Enter takes. The rows themselves also carry an "Unlisted" chip, since
 * ordering alone is not a label.
 */
export function listedFirst<T extends { verified?: boolean | null }>(hits: T[]): T[] {
    return [...hits.filter((h) => !isUnlisted(h)), ...hits.filter((h) => isUnlisted(h))];
}

/**
 * The subset of items a tab shows, preserving flatten order.
 *
 * The modal renders THIS list and drives the keyboard index off it, so narrowing
 * to a tab cannot leave the highlight pointing at a row that is no longer on
 * screen — the failure the single flattened list was introduced to prevent.
 */
export function filterByTab(items: SearchNavItem[], tab: SearchTab): SearchNavItem[] {
    if (tab === "all") return items;
    if (tab === "tokens") return items.filter((i) => i.kind === "token");
    if (tab === "pools") return items.filter((i) => i.kind === "pair");
    return items.filter((i) => i.kind === "wallet");
}

/** Per-tab result counts, for the numbers beside each tab label. */
export function tabCounts(items: SearchNavItem[]): Record<SearchTab, number> {
    return {
        all: items.length,
        tokens: items.filter((i) => i.kind === "token").length,
        pools: items.filter((i) => i.kind === "pair").length,
        wallets: items.filter((i) => i.kind === "wallet").length,
    };
}

/**
 * Where a selected result goes, and whether that leaves the app.
 *
 * Tokens and pools have real internal destinations. Wallets do not, yet — see
 * `buildWalletTarget` — so the target carries an `external` flag rather than
 * every caller assuming `router.push` is the right verb.
 */
export type SearchTarget = { href: string; external: boolean };

export interface WalletTargetContext {
    /** wagmi's connected address, when there is one. */
    connectedAddress?: string;
    /** The active chain's block explorer origin, e.g. `https://…`. */
    explorerUrl?: string;
}

/**
 * A wallet hit's destination, which is the honest part of this feature.
 *
 * **There is no foreign-wallet page in this app.** `/portfolio` reads the
 * CONNECTED wallet (`PortfolioView` gates on wagmi's `isConnected` and takes no
 * address) and its indexer half is still behind the `lib/portfolio` mock seam. So
 * sending a searched address there would show one of two wrong things: the
 * viewer's own positions under someone else's address, or fabricated ones.
 *
 * Two real destinations exist instead:
 *
 *  - **It's you** → `/portfolio`. The one case with a true internal answer.
 *  - **It's someone else** → the chain's block explorer, in a new tab, labelled
 *    as leaving. Nothing invented, and it is what the user wanted to know.
 *
 * The follow-up is a read-only `/wallet/[address]` built on the per-address
 * gateway routes that already exist and are already wired for real in this app —
 * `/api/orders/:address`, `/api/orderhistory/:address`, `/api/tradehistory/:address`
 * (see queries/server/{orders,orderhistories,tradehistories}.ts). Balances are the
 * one part that cannot follow: those are per-chain RPC reads scoped to a connected
 * wallet. When that route lands, only this function changes.
 */
export function buildWalletTarget(
    address: string,
    ctx: WalletTargetContext = {},
): SearchTarget | null {
    if (isSameAddress(address, ctx.connectedAddress)) {
        return { href: "/portfolio", external: false };
    }
    if (!ctx.explorerUrl) return null;
    return {
        href: `${ctx.explorerUrl.replace(/\/$/, "")}/address/${address}`,
        external: true,
    };
}

/** What the wallet row promises before it is clicked. */
export function walletTargetLabel(address: string, ctx: WalletTargetContext = {}): string {
    if (isSameAddress(address, ctx.connectedAddress)) return "Your portfolio";
    return ctx.explorerUrl ? "View on explorer" : "No explorer for this chain";
}

/** `0xA3f5…9a61` — re-exported so row components have one import for a result row. */
export { truncateAddress };

/**
 * Moves the highlighted index by `delta` (+1/-1 for ArrowDown/ArrowUp),
 * wrapping around both ends. Returns -1 (no highlight) when the list is
 * empty, regardless of the current index or delta.
 */
export function clampHighlightIndex(current: number, delta: number, length: number): number {
    if (length === 0) {
        return -1;
    }
    // With nothing highlighted, ArrowDown should land on the first item and
    // ArrowUp should land on the last — so the "virtual" starting position
    // depends on the direction of travel, not just a fixed -1.
    const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = (base + delta) % length;
    return next < 0 ? next + length : next;
}

/**
 * Builds the destination route for a selected result on the given
 * (active-chain) network slug.
 *
 * **Pair hits open the `/pair` profile.** Searching a market is a reading intent —
 * you are looking it up, not committing to trade it — and the profile's Action Dock
 * is one click from the terminal either way.
 *
 * This briefly shipped pointing at `/trade/pro`, because the profile could not
 * render the markets search finds: `PairProfile` resolved by scanning the
 * listing-GATED pairs list, while `/api/search` is ungated by design, so every
 * pre-graduation hit dead-ended on "No market data". `app/[locale]/pair/page.tsx`
 * now resolves through the ungated detail route instead — the same one `/trade/pro`
 * has always used — so the two agree and this points where it should.
 *
 * **If you find yourself sending pair hits back to `/trade/pro`, check that lookup
 * first.** A profile that reads a gated list is the failure that caused it, and it
 * fails silently: search looks broken, the page looks fine.
 *
 * (Basic is never a target either way: `/trade` is not pair-bound and drops
 * base/quote silently.)
 *
 * Token hits keep `/token/${symbol}` — the same href TokenTableRow builds.
 */
export function buildResultTarget(
    networkSlug: string,
    item: SearchNavItem,
    ctx: WalletTargetContext = {},
): SearchTarget | null {
    /**
     * A hit routes to its OWN chain, not the page's.
     *
     * Search is cross-chain now, so `networkSlug` — the chain the reader happens
     * to be viewing — is the wrong destination for most rows. Sending a RISE
     * token to Arc's page produces a real-looking URL for a market that does not
     * exist there, which reads as "this token is broken" rather than "wrong
     * chain". It stays the fallback for a row with no chain recorded.
     */
    const slugOf = (result: { chain?: string }): string =>
        (result.chain ? networkNameToSlug[result.chain] : undefined) ?? networkSlug;

    if (item.kind === "token") {
        return {
            href: `/token/${item.result.symbol}?chain=${slugOf(item.result)}`,
            external: false,
        };
    }
    if (item.kind === "pair") {
        return {
            href: buildPageUrl("pair", {
                base: item.result.baseSymbol,
                quote: item.result.quoteSymbol,
                slug: slugOf(item.result),
            }),
            external: false,
        };
    }
    return buildWalletTarget(item.result.address, ctx);
}

/**
 * Internal-route convenience over `buildResultTarget`, for the callers that can
 * only navigate (route prefetch). Returns "" for a target that is external or
 * absent, which prefetch treats as nothing to warm.
 */
export function buildResultPath(networkSlug: string, item: SearchNavItem): string {
    const target = buildResultTarget(networkSlug, item);
    if (!target || target.external) return "";
    return target.href;
}
