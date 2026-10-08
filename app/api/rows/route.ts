import { NextResponse } from "next/server";
import { getRowContent } from "@/lib/rows/content";
import { getMarketTapeData } from "@/lib/rows/tape";
import { getVisibleChains } from "@/lib/chains/visibleServer";
import { ogPassConfig } from "@/lib/ogpass/mock";
import {
  noticeHiddenReason,
  resolveNoticeRow,
  resolveTradingRow,
  tradingHiddenReason,
  type HiddenReason,
  type NoticeRow,
  type TradingRow,
} from "@/lib/rows/status";

/**
 * What the two site rows — notice, then trading information — currently
 * render. They are mounted in the root layout, so this describes every page,
 * not one of them.
 *
 * `apps/admin` monitors these rows and cannot answer the question from the
 * database alone: `getRowContent` swallows read errors and returns null, the
 * market counts come from the token list filtered by THIS app's
 * `supportedChains`, and the notice countdown comes from `lib/ogpass`. A panel
 * reading only the content row reports what was SAVED, which is a different
 * claim from what is SHOWN — and the interesting failures are exactly where
 * the two part company (stale deploy, unreachable database, wrong DB).
 *
 * ## Unauthenticated, deliberately
 *
 * Every field here is already rendered to every visitor of every page. The one
 * piece of operational information is `source: "built-in"`, which says the
 * database row was not readable — and the site announces that just as loudly by
 * showing the built-in copy instead of the operator's. There is no secret to
 * leak, and gating it would mean apps/web holding an operator credential it
 * has no other use for (see admin-service's note on why `/token-logo` is open).
 *
 * Read-only, no parameters, safe to poll.
 */

export const dynamic = "force-dynamic";

interface RowReport<T> {
  /** Null when the row renders nothing. */
  row: T | null;
  hiddenReason: HiddenReason | null;
}

export interface RowsStatus {
  generatedAt: string;
  /** Whether the operator's content row was readable at all. */
  contentSource: "admin" | "built-in";
  notice: RowReport<NoticeRow> & {
    /**
     * Seconds until the sale opens, and where that number comes from. `mock`
     * means `lib/ogpass/mock` — the countdown target is recomputed as
     * `Date.now() + saleStartsInSec` on every mount, so it restarts on each
     * page load and never reaches zero. Reported rather than hidden: an
     * operator watching for the notice to flip to LIVE would otherwise wait
     * forever with nothing on the page saying why.
     */
    saleStartsInSec: number;
    saleSource: "mock" | "chain";
  };
  trading: RowReport<TradingRow> & {
    /** Markets whose listing price is missing or zero — those render an em-dash. */
    pairsMissingPrice: number;
  };
}

export async function GET() {
  const content = await getRowContent();
  /*
   * The same chain list the page itself renders from.
   *
   * This route exists so admin reports what the row SHOWS rather than
   * re-deriving it — the drift that killed `sparkline7D`. Reading the tape
   * without the operator's chain filter would reintroduce exactly that: the
   * panel counting markets on a chain the site has stopped scrolling past.
   */
  const tapeData = getMarketTapeData(await getVisibleChains());
  const { saleStartsInSec } = ogPassConfig();

  // The client's countdown target is `Date.now() + saleStartsInSec`, so this
  // is exactly the answer a freshly loaded page reaches — not an approximation
  // of it. It is a snapshot, though: a visitor who sits on the page ticks past
  // it, and the next load resets to this same value.
  const countdown = {
    mounted: true,
    isLive: saleStartsInSec <= 0,
    days: Math.floor(Math.max(0, saleStartsInSec) / 86400),
    hours: Math.floor((Math.max(0, saleStartsInSec) % 86400) / 3600),
  };

  const status: RowsStatus = {
    generatedAt: new Date().toISOString(),
    contentSource: content ? "admin" : "built-in",
    notice: {
      row: resolveNoticeRow(content, countdown),
      hiddenReason: noticeHiddenReason(content),
      saleStartsInSec,
      saleSource: "mock",
    },
    trading: {
      row: resolveTradingRow(content, tapeData),
      hiddenReason: tradingHiddenReason(content, tapeData),
      pairsMissingPrice: tapeData.pairs.filter((p) => !p.price || p.price <= 0).length,
    },
  };

  return NextResponse.json(status, {
    headers: { "cache-control": "no-store" },
  });
}
