"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatAge, formatMarketCap, type CreatedCoinRow } from "@/lib/profile/coins";
import { networkNameToSlug } from "@/consts";

/** A row that may know its own chain. Optional so the type still describes a
 *  single-chain list; `useCreatedCoins` fans out and always sets it. */
type CoinRow = CreatedCoinRow & { networkName?: string };
import { tokenColor } from "@/lib/swap/tokens";

/**
 * Coins a wallet created — three columns, paginated.
 *
 * **Coin · MC · Age.** The origin (launch vs auction) is a chip INSIDE the coin
 * cell rather than a fourth column: it is an attribute of the coin's identity,
 * not a measure to scan down, and at 550px a fourth column costs the name the
 * width it needs to stay readable. Long names truncate with an ellipsis; the
 * ticker below never does, because it is the part that identifies the coin when
 * the name is cut.
 *
 * Rows are links, not buttons — a coin has a URL, so middle-click and
 * open-in-new-tab work without anything being wired for them.
 */
export function CoinList({
  coins,
  isLoading,
  page,
  totalPages,
  onPage,
  networkSlug,
  emptyLabel,
  failed,
}: {
  coins: CoinRow[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  networkSlug: string;
  emptyLabel: string;
  /** The read failed — say so instead of asserting the wallet created nothing. */
  failed?: boolean;
}) {
  // One clock read for the whole list, so two rows rendered in the same paint
  // cannot disagree about what "now" is.
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_96px_74px] items-center gap-3.5 border-b border-[color:var(--m-border)] px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]">
        <span>Coin</span>
        <span className="text-right">MC</span>
        <span className="text-right">Age</span>
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : failed ? (
        <p className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          Couldn&apos;t load coins.
        </p>
      ) : coins.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13.5px] text-[color:var(--m-text-secondary)]">
          {emptyLabel}
        </p>
      ) : (
        coins.map((coin) => (
          // The chain belongs in the key. This list is merged across chains now,
          // and deterministic deploys put the SAME address on more than one —
          // two rows keyed alike collide in React and render as one.
          <Row
            key={`${coin.networkName ?? ""}:${coin.origin}:${coin.address}`}
            coin={coin}
            now={now}
            networkSlug={networkSlug}
          />
        ))
      )}

      {/* Rendered whenever there is more than one page — a single-page list gets
          no pager rather than a disabled one, which would imply pages that do
          not exist. */}
      {totalPages > 1 && <Pager page={page} totalPages={totalPages} onPage={onPage} />}
    </div>
  );
}

function Row({
  coin,
  now,
  networkSlug,
}: {
  coin: CoinRow;
  now: number;
  /** The chain being VIEWED — the fallback for a row that carries none. */
  networkSlug: string;
}) {
  /**
   * The coin's OWN chain, not the page's.
   *
   * Every row used to take the viewed chain's slug, which was correct while the
   * list was single-chain and became a broken link the moment it was not: a RISE
   * coin linked as `?chain=arc-testnet` resolves against Arc's gateway, where
   * that address does not exist, and the token page 404s.
   */
  const slug = (coin.networkName && networkNameToSlug[coin.networkName]) || networkSlug;
  return (
    <Link
      href={`/token/${coin.address}?chain=${encodeURIComponent(slug)}`}
      className="grid grid-cols-[minmax(0,1fr)_96px_74px] items-center gap-3.5 border-b border-[color:var(--m-border)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[color:var(--m-surface-2)]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <CoinMark coin={coin} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold tracking-[-0.015em] text-[color:var(--m-text-primary)]">
            {coin.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="font-mono text-[12.5px] text-[color:var(--m-text-secondary)]">
              {coin.symbol}
            </span>
            <OriginChip origin={coin.origin} />
            {/* Which chain, once the list spans several. Silent on a
                single-chain list, where it would restate the page header. */}
            {coin.networkName && (
              <span className="font-mono text-[10px] text-[color:var(--m-text-secondary-2)]">
                {coin.networkName.replace(" Testnet", "")}
              </span>
            )}
          </span>
        </span>
      </span>

      <span
        className={cn(
          "text-right text-[15.5px] font-bold tabular-nums tracking-[-0.015em]",
          // An unpriced coin gets the muted dash `formatMarketCap` returns, not
          // the emphasis a real figure earns.
          coin.marketCapUsd === null
            ? "text-[color:var(--m-text-secondary)]"
            : "text-[color:var(--m-text-primary)]",
        )}
      >
        {formatMarketCap(coin.marketCapUsd)}
      </span>

      <span className="text-right text-[13px] tabular-nums text-[color:var(--m-text-secondary)]">
        {formatAge(coin.createdAt, now)}
      </span>
    </Link>
  );
}

/**
 * The coin's mark. A real logo when there is one; otherwise the deterministic
 * per-token colour `lib/swap/tokens.ts` already derives, with the first two
 * letters of the ticker — so two coins with no art still read as different
 * coins rather than as the same placeholder twice.
 */
function CoinMark({ coin }: { coin: CoinRow }) {
  if (coin.logoURI) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external, unknown host
      <img
        src={coin.logoURI}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold tracking-[-0.02em] text-white"
      style={{ backgroundColor: tokenColor(coin.symbol) }}
      aria-hidden="true"
    >
      {coin.symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

function OriginChip({ origin }: { origin: CreatedCoinRow["origin"] }) {
  const auction = origin === "auction";
  return (
    <span
      className={cn(
        "rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] leading-none",
        auction
          ? "border-[color:var(--m-logo)]/40 bg-[color:var(--m-logo)]/10 text-[color:var(--m-logo)]"
          : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary-2)]",
      )}
    >
      {auction ? "Auction" : "Launch"}
    </span>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-[color:var(--m-border)] px-3 py-3.5">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[color:var(--m-text-secondary)]"
      >
        ‹ Previous
      </button>
      <span
        aria-current="page"
        className="min-w-[38px] rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-1.5 text-center font-mono text-[13px] text-[color:var(--m-text-primary)]"
      >
        {page}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[color:var(--m-text-secondary)]"
      >
        Next ›
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(0,1fr)_96px_74px] items-center gap-3.5 border-b border-[color:var(--m-border)] px-4 py-3 last:border-b-0"
        >
          <span className="flex items-center gap-3">
            <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[color:var(--m-surface-2)]" />
            <span className="flex-1">
              <span className="block h-3.5 w-32 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
              <span className="mt-1.5 block h-3 w-16 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
            </span>
          </span>
          <span className="ml-auto block h-3.5 w-14 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
          <span className="ml-auto block h-3 w-12 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
        </div>
      ))}
    </>
  );
}
