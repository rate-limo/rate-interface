import { describe, expect, it } from "vitest";
import type { RowContent } from "./content";
import type { MarketTapeData } from "./tape";
import {
  DEFAULT_PASS_HREF,
  NOTICE_FALLBACK,
  TRADING_FALLBACK_LABEL,
  noticeHiddenReason,
  resolveNoticeRow,
  resolveTradingRow,
  tradingHiddenReason,
} from "./status";

const content: RowContent = {
  noticeEnabled: true,
  noticeText: "OG Pass — 3 tiers left",
  noticeDetail: "limited supply",
  noticeCtaLabel: "Buy now",
  noticeHref: "/pass",
  marketTapeEnabled: true,
  marketTapeLabel: "{markets} markets · {chains} chains",
};

const waiting = { mounted: true, isLive: false, days: 4, hours: 12 };
const live = { mounted: true, isLive: true, days: 0, hours: 0 };
const pending = { mounted: false, isLive: false, days: 0, hours: 0 };

function tapeData(overrides: Partial<MarketTapeData> = {}): MarketTapeData {
  return {
    pairs: [
      { base: "ETH", quote: "USDC", network: "RISE Testnet", slug: "rise", price: 1635, href: "/x" },
      { base: "WBTC", quote: "USDC", network: "Monad Testnet", slug: "monad", price: 0, href: "/y" },
    ],
    byChain: [
      { network: "RISE Testnet", slug: "rise", markets: 1 },
      { network: "Monad Testnet", slug: "monad", markets: 1 },
    ],
    counts: { chains: 2, markets: 2, tokens: 3 },
    ...overrides,
  };
}

describe("row 1 — notice", () => {
  it("uses admin copy verbatim when a content row exists", () => {
    const row = resolveNoticeRow(content, waiting);
    expect(row).toMatchObject({
      source: "admin",
      text: "OG Pass — 3 tiers left",
      detail: "limited supply",
      ctaLabel: "Buy now",
      href: "/pass",
    });
  });

  it("reports that admin copy suppresses the countdown text", () => {
    // The whole point of surfacing this: the row still tracks the sale (the
    // dot changes colour) but the words never mention it again.
    expect(resolveNoticeRow(content, waiting)?.countdownVisible).toBe(false);
    expect(resolveNoticeRow(content, live)?.text).toBe("OG Pass — 3 tiers left");
    expect(resolveNoticeRow(null, waiting)?.countdownVisible).toBe(true);
  });

  it("falls back to the countdown copy when no row is readable", () => {
    expect(resolveNoticeRow(null, pending)?.text).toBe(NOTICE_FALLBACK.pendingText);
    expect(resolveNoticeRow(null, waiting)?.text).toBe("OG Pass sale — starts in 4d 12h");
    expect(resolveNoticeRow(null, live)?.text).toBe(NOTICE_FALLBACK.liveText);
    expect(resolveNoticeRow(null, live)?.ctaLabel).toBe(NOTICE_FALLBACK.liveCtaLabel);
    expect(resolveNoticeRow(null, waiting)?.ctaLabel).toBe(NOTICE_FALLBACK.waitingCtaLabel);
    expect(resolveNoticeRow(null, waiting)?.href).toBe(DEFAULT_PASS_HREF);
    expect(resolveNoticeRow(undefined, waiting)?.source).toBe("built-in");
  });

  it("keeps a cleared detail cleared rather than restoring the fallback", () => {
    // `?? ` is nullish, not falsy — an operator who empties the field means it.
    const row = resolveNoticeRow({ ...content, noticeDetail: "" }, waiting);
    expect(row?.detail).toBe("");
  });

  it("renders nothing when disabled, and says why", () => {
    expect(resolveNoticeRow({ ...content, noticeEnabled: false }, waiting)).toBeNull();
    expect(noticeHiddenReason({ ...content, noticeEnabled: false })).toBe("disabled");
    expect(noticeHiddenReason(content)).toBeNull();
    // No row at all still shows the banner — `noticeEnabled` defaults true.
    expect(noticeHiddenReason(null)).toBeNull();
    expect(resolveNoticeRow(null, waiting)).not.toBeNull();
  });
});

describe("row 2 — trading information", () => {
  it("substitutes the live counts into the admin template", () => {
    const row = resolveTradingRow(content, tapeData());
    expect(row?.leadText).toBe("2 markets · 2 chains");
    expect(row?.labelTemplate).toBe("{markets} markets · {chains} chains");
    expect(row?.source).toBe("admin");
  });

  it("substitutes every occurrence, not just the first", () => {
    const row = resolveTradingRow({ ...content, marketTapeLabel: "{markets}/{markets} on {chains}" }, tapeData());
    expect(row?.leadText).toBe("2/2 on 2");
  });

  it("leaves a template with no placeholders alone", () => {
    const row = resolveTradingRow({ ...content, marketTapeLabel: "Live markets" }, tapeData());
    expect(row?.leadText).toBe("Live markets");
  });

  it("falls back to the built-in template with no content row", () => {
    const row = resolveTradingRow(null, tapeData());
    expect(row?.labelTemplate).toBe(TRADING_FALLBACK_LABEL);
    expect(row?.leadText).toBe("2 markets · 2 chains");
    expect(row?.source).toBe("built-in");
  });

  it("distinguishes switched-off from nothing-to-show", () => {
    const empty = tapeData({ pairs: [], byChain: [], counts: { chains: 0, markets: 0, tokens: 0 } });

    expect(resolveTradingRow({ ...content, marketTapeEnabled: false }, tapeData())).toBeNull();
    expect(tradingHiddenReason({ ...content, marketTapeEnabled: false }, tapeData())).toBe("disabled");

    // Enabled but empty renders identically to a deleted component. That is
    // the state the monitoring view exists to name.
    expect(resolveTradingRow(content, empty)).toBeNull();
    expect(tradingHiddenReason(content, empty)).toBe("no-markets");

    expect(tradingHiddenReason(content, tapeData())).toBeNull();
  });
});
