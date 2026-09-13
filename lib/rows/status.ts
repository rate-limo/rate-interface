import { slugToNetworkName } from "@/consts";
import type { RowContent } from "./content";
import { formatTapePrice, type ChainMarkets, type MarketTapeData, type TapePair } from "./tape";

/**
 * The two site rows — the **notice** (row 1) and **trading information**
 * (row 2) — resolved from operator content plus the data each row reads.
 *
 * Both rows are mounted once in the root layout and appear on every page, so
 * nothing here is landing-specific; `components/Rows/SiteRows` is the only
 * mount point.
 *
 * ## Why this module exists
 *
 * `apps/admin` monitors these rows, and the only honest way to report what a
 * row shows is to resolve it with the code the row itself runs. Re-deriving
 * the market counts or the notice copy on the admin side would let the panel
 * report a number the site does not show — the same drift failure that killed
 * `sparkline7D` and made `spotTokens.marketCap` a generated column. So
 * `NoticeRow` and `TradingRow` call these functions, `/api/rows` calls them
 * too, and there is one resolution rather than two.
 *
 * Everything here is pure. The countdown is passed in rather than read,
 * because it is client state in the component and a derived value on the
 * server, and both have to reach the same answer.
 */

/** The pass page reads its network from `?chain=`, which has no default, so
 * the notice points at the first supported network's pass route explicitly. */
export const DEFAULT_PASS_HREF = `/pass?chain=${Object.keys(slugToNetworkName)[0]}`;

/** Copy the notice falls back to when there is no content row. */
export const NOTICE_FALLBACK = {
  pendingText: "OG Pass sale — starts soon",
  liveText: "OG Pass sale is LIVE",
  detail: "limited supply, tiered pricing",
  liveCtaLabel: "Buy now",
  waitingCtaLabel: "Get notified",
} as const;

export const TRADING_FALLBACK_LABEL = "{markets} markets · {chains} chains";

/** Where a row's copy came from. `built-in` means no operator row was readable
 * — either it was never written or `getRowContent` swallowed a database error,
 * which are indistinguishable to the page and both mean the operator's saved
 * copy is not what visitors see. */
export type CopySource = "admin" | "built-in";

/** The parts of the countdown the notice reads. Matches `useCountdown`. */
export interface NoticeCountdown {
  mounted: boolean;
  isLive: boolean;
  days: number;
  hours: number;
}

export interface NoticeRow {
  /** False when the row renders nothing at all. */
  rendered: boolean;
  source: CopySource;
  text: string;
  /** Empty string when the operator cleared it — the row then omits it. */
  detail: string;
  ctaLabel: string;
  href: string;
  /** The sale state the dot and the fallback CTA read. */
  live: boolean;
  /**
   * Whether the countdown reaches the text at all. Operator copy is a fixed
   * string, so saving any notice text permanently replaces "starts in 4d 12h"
   * / "is LIVE" — the dot still tracks the countdown but the words stop.
   * Invisible from the admin form, which is why it is reported.
   */
  countdownVisible: boolean;
}

/** Resolves row 1 exactly as `NoticeRow` renders it. */
export function resolveNoticeRow(
  content: RowContent | null | undefined,
  countdown: NoticeCountdown,
): NoticeRow | null {
  if (content && !content.noticeEnabled) return null;

  const fallbackText = !countdown.mounted
    ? NOTICE_FALLBACK.pendingText
    : countdown.isLive
      ? NOTICE_FALLBACK.liveText
      : `OG Pass sale — starts in ${countdown.days}d ${countdown.hours}h`;

  return {
    rendered: true,
    source: content ? "admin" : "built-in",
    text: content?.noticeText ?? fallbackText,
    detail: content?.noticeDetail ?? NOTICE_FALLBACK.detail,
    ctaLabel:
      content?.noticeCtaLabel ??
      (countdown.isLive ? NOTICE_FALLBACK.liveCtaLabel : NOTICE_FALLBACK.waitingCtaLabel),
    href: content?.noticeHref ?? DEFAULT_PASS_HREF,
    live: countdown.isLive,
    countdownVisible: content?.noticeText == null,
  };
}

/** A market plus the exact string the row prints for its price. The label
 * travels with the market so the admin preview cannot re-implement — and then
 * drift from — the row's own zero-is-an-em-dash rule. */
export interface ResolvedTapePair extends TapePair {
  priceLabel: string;
}

export interface TradingRow {
  rendered: boolean;
  source: CopySource;
  /** The template before `{markets}` / `{chains}` substitution. */
  labelTemplate: string;
  /** What the lead label actually reads. */
  leadText: string;
  pairs: ResolvedTapePair[];
  byChain: ChainMarkets[];
  counts: MarketTapeData["counts"];
}

/** Resolves row 2 exactly as `TradingRow` renders it. `data` is passed in so
 * this stays pure; both callers get it from `getMarketTapeData()`. */
export function resolveTradingRow(
  content: RowContent | null | undefined,
  data: MarketTapeData,
): TradingRow | null {
  if (data.pairs.length === 0 || content?.marketTapeEnabled === false) return null;

  const labelTemplate = content?.marketTapeLabel ?? TRADING_FALLBACK_LABEL;

  return {
    rendered: true,
    source: content ? "admin" : "built-in",
    labelTemplate,
    leadText: labelTemplate
      .replaceAll("{markets}", String(data.counts.markets))
      .replaceAll("{chains}", String(data.counts.chains)),
    pairs: data.pairs.map((p) => ({ ...p, priceLabel: formatTapePrice(p.price) })),
    byChain: data.byChain,
    counts: data.counts,
  };
}

/**
 * Why a row is not on the page. `disabled` is an operator's decision;
 * `no-markets` is row 2 switched on with nothing to scroll, which looks
 * identical to a deleted component from the outside.
 */
export type HiddenReason = "disabled" | "no-markets";

export function noticeHiddenReason(
  content: RowContent | null | undefined,
): HiddenReason | null {
  return content && !content.noticeEnabled ? "disabled" : null;
}

export function tradingHiddenReason(
  content: RowContent | null | undefined,
  data: MarketTapeData,
): HiddenReason | null {
  if (content?.marketTapeEnabled === false) return "disabled";
  if (data.pairs.length === 0) return "no-markets";
  return null;
}
