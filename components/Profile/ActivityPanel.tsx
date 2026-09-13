"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { tokenColor } from "@/lib/swap/tokens";
import { viewerRole, viewerSide } from "@/lib/trades/perspective";
import { formatAge } from "@/lib/profile/coins";
import { money } from "@/components/Portfolio/parts";
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import { useAccountTrades } from "@/hooks/useAccountTrades";

/**
 * A wallet's trades.
 *
 * ## The side is the SUBJECT's, not the reader's
 *
 * `isBid` belongs to the taker — the direction of the order that crossed the
 * book — so a maker whose resting sell was hit comes back with `isBid: true`
 * having sold. `/api/tradehistory/:address` matches on `maker` as well as
 * `taker`, so both branches are reachable here and reading `isBid` raw is wrong
 * about half of them.
 *
 * `lib/trades/perspective` exists for this, and its "viewer" argument is the
 * wallet whose history is being read — which on a profile is the page's SUBJECT,
 * never the connected user. Passing the connected wallet would label a stranger's
 * trades from your own side, and a wrong side renders as a perfectly plausible
 * trade.
 */
export function ActivityPanel({
  address,
  networkName,
  networkSlug,
}: {
  address: string;
  networkName: string;
  networkSlug: string;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, failed } = useAccountTrades(networkName, address, 15, page);
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr>
              <Th>Market</Th>
              <Th right>Side</Th>
              <Th right>Value</Th>
              <Th right>When</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <Td colSpan={4} muted>
                  Loading…
                </Td>
              </tr>
            ) : failed ? (
              // "The read failed" is not "this wallet has never traded" — one
              // is about the request, the other is a claim about the wallet.
              <tr>
                <Td colSpan={4} muted>
                  Couldn&apos;t load trades.
                </Td>
              </tr>
            ) : data.trades.length === 0 ? (
              <tr>
                <Td colSpan={4} muted>
                  No trades yet.
                </Td>
              </tr>
            ) : (
              data.trades.map((trade) => {
                const side = viewerSide(trade.isBid, trade.taker, address);
                const role = viewerRole(trade.taker, address);
                return (
                  <tr
                    key={`${trade.txHash}:${trade.pair}:${trade.orderId}`}
                    className="hover:bg-[color:var(--m-surface-2)]"
                  >
                    <Td>
                      <Link
                        href={`/token/${trade.base.id}?chain=${encodeURIComponent(networkSlug)}`}
                        className="flex items-center gap-2.5"
                      >
                        {/* The pair's real mark, not a coloured disc of initials.
                            This row is a MARKET — two tokens on a chain — and it
                            drew none of that: no logos, no quote token, no network
                            chip, just "BU" in purple. `PairImageIcon` is what every
                            other market row on the site uses, badge included. */}
                        <PairImageIcon
                          base={trade.baseSymbol}
                          quote={trade.quoteSymbol}
                          baseLogoURI={trade.base.logoURI ?? undefined}
                          quoteLogoURI={trade.quote.logoURI ?? undefined}
                          baseColor={tokenColor(trade.baseSymbol)}
                          quoteColor={tokenColor(trade.quoteSymbol)}
                          chainName={networkName}
                          className="h-7 w-7"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-bold">
                            {trade.baseSymbol}/{trade.quoteSymbol}
                          </span>
                          <span className="block font-mono text-[10.5px] text-[color:var(--m-text-secondary-2)]">
                            {role}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td
                      right
                      className={
                        side === "Buy"
                          ? "text-[color:var(--m-success-fg)]"
                          : "text-[color:var(--m-error-fg)]"
                      }
                    >
                      {side}
                    </Td>
                    <Td right>{money(trade.valueUSD)}</Td>
                    <Td right muted>
                      {formatAge(trade.timestamp, now)}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 border-t border-[color:var(--m-border)] px-3 py-3.5">
          <PagerButton onClick={() => setPage(page - 1)} disabled={page <= 1}>
            ‹ Previous
          </PagerButton>
          <span className="min-w-[38px] rounded-[9px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-1.5 text-center font-mono text-[13px]">
            {page}
          </span>
          <PagerButton onClick={() => setPage(page + 1)} disabled={page >= data.totalPages}>
            Next ›
          </PagerButton>
        </div>
      )}
    </div>
  );
}

function PagerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[9px] px-3 py-1.5 text-[13.5px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[color:var(--m-border)] px-4 py-2.5 font-mono text-[9.5px] font-normal uppercase tracking-[0.06em] text-[color:var(--m-text-secondary-2)]",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  muted,
  colSpan,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  muted?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-[color:var(--m-border)] px-4 py-3 text-[13px] last:border-b-0",
        right ? "text-right" : "text-left",
        muted && "text-[color:var(--m-text-secondary)]",
        colSpan && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
