"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useTokens } from "@/hooks/useTokens";
import { buildPageUrl } from "@/lib/routing/chainParams";
import {
  VERB,
  compactAmount,
  mergeEvents,
  shortActor,
  tickerKey,
  type TickerEvent,
  type TickerKind,
} from "@/lib/explore/ticker";
import { eventBus } from "@/utils/events";
import { cn } from "@/lib/utils";
import type { SpotToken } from "@/types";
import type { SpotTradeEvent } from "@/types";

/**
 * Live activity ticker — creations and trades, scrolling.
 *
 * Reuses the landing tape's CSS marquee (`.market-tape` / `.market-tape-track` in
 * globals.css): the list is rendered twice and translated -50% for a seamless loop, pauses
 * on hover, and degrades to a plain horizontal scroll under prefers-reduced-motion. Colour
 * here is Monet rather than the landing page's hardcoded dark, because this sits inside
 * the app where both themes are live.
 *
 * Two sources, two natures — see lib/explore/ticker for why creations poll while trades
 * stream.
 *
 * Renders NOTHING until it has an event. A ticker is a claim that things are happening; an
 * empty one that still occupies a strip of the page makes the venue look dead, and a
 * placeholder row would be a fabricated event.
 */

const KIND_STYLE: Record<TickerKind, { border: string; verb: string }> = {
  // Matches the reference: sells read hot, creations read as the notable thing they are.
  sold: { border: "var(--m-error)", verb: "var(--m-error-fg)" },
  bought: { border: "var(--m-success)", verb: "var(--m-success-fg)" },
  created: { border: "var(--m-primary)", verb: "var(--m-primary-fg)" },
};

/** A stable colour per symbol for the letter tile a logo-less token falls back to. */
function symbolColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) % 360;
  return `hsl(${hash} 52% 45%)`;
}

export function ActivityTicker({ className }: { className?: string }) {
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();
  const [events, setEvents] = useState<TickerEvent[]>([]);

  /**
   * Creations. Polled rather than streamed: nothing publishes PairAdded or Launched to a
   * room, and a launch is minutes apart at best, so a 45s refetch cannot meaningfully lag
   * one. `source: all` because an unlisted launch is exactly the creation worth announcing.
   */
  const { data: newest } = useTokens(displayNetworkName, 8, 1, "new", "all");

  useEffect(() => {
    const tokens = (newest?.tokens ?? []) as SpotToken[];
    if (tokens.length === 0) return;
    setEvents((current) =>
      mergeEvents(
        current,
        tokens.map((t) => ({
          id: tickerKey({ kind: "created", address: t.id }),
          kind: "created" as const,
          actor: t.creator ?? "",
          symbol: t.symbol,
          logoURI: t.logoURI,
          timestamp: t.listingDate ?? 0,
        })),
      ),
    );
  }, [newest]);

  /** Trades. Genuinely live, over the socket the market page already holds open. */
  useEffect(() => {
    const onTrade = (event: SpotTradeEvent) => {
      setEvents((current) =>
        mergeEvents(current, [
          {
            id: tickerKey({
              kind: event.isBid ? "bought" : "sold",
              txHash: event.txHash,
              orderId: event.orderId,
            }),
            // isBid is the taker buying the base asset.
            kind: event.isBid ? "bought" : "sold",
            actor: event.taker || event.account || "",
            amount: event.baseAmount ?? event.amount,
            symbol: event.baseSymbol,
            logoURI: event.baseLogoURI,
            timestamp: event.timestamp,
          },
        ]),
      );
    };
    eventBus.on("spot-recent-overall-trades-update", onTrade);
    // Braces, not an arrow body: eventBus.off returns the emitter, and a cleanup that
    // returns a value is not a valid EffectCallback.
    return () => {
      eventBus.off("spot-recent-overall-trades-update", onTrade);
    };
  }, []);

  // Rendered twice so the -50% translate loops seamlessly. The duplicate is hidden from
  // assistive tech and taken out of the tab order — it is the same content twice.
  const loop = useMemo(() => [...events, ...events], [events]);

  if (events.length === 0) return null;

  return (
    <div
      className={cn(
        "market-tape relative flex h-9 items-stretch overflow-hidden rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]",
        className,
      )}
      aria-label="Live activity"
    >
      <div className="relative z-20 flex shrink-0 items-center gap-2 border-r border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 font-dm-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
        <span className="relative inline-flex h-[7px] w-[7px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--m-logo)] opacity-60" />
          <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[color:var(--m-logo)]" />
        </span>
        <span className="font-semibold text-[color:var(--m-text-primary)]">Live</span>
      </div>

      <div className="market-tape-track flex h-full w-max items-center gap-2 px-2">
        {loop.map((event, i) => {
          const style = KIND_STYLE[event.kind];
          const duplicate = i >= events.length;
          return (
            <Link
              key={`${event.id}-${i}`}
              href={buildPageUrl("token", { token: event.symbol, slug: displayNetworkSlug })}
              aria-hidden={duplicate ? true : undefined}
              tabIndex={duplicate ? -1 : undefined}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-dm-mono text-[11px] transition-opacity hover:opacity-80"
              style={{ borderColor: style.border }}
            >
              <span className="text-[color:var(--m-text-secondary)]">
                {shortActor(event.actor)}
              </span>
              <b style={{ color: style.verb }}>{VERB[event.kind]}</b>
              {event.amount !== undefined && (
                <span className="tabular-nums text-[color:var(--m-text-primary)]">
                  {compactAmount(event.amount)}
                </span>
              )}
              {event.amount !== undefined && (
                <span className="text-[color:var(--m-text-secondary-2)]">of</span>
              )}
              <TokenImageIcon
                symbol={event.symbol}
                logoURI={event.logoURI}
                color={symbolColor(event.symbol)}
                className="h-4 w-4 text-[8px]"
              />
              <b className="text-[color:var(--m-text-primary)]">{event.symbol}</b>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
