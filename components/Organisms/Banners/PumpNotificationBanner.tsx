import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SpotTradeEvent } from "@/types";
import { eventBus } from "@/utils/events";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { getSpotRecentOverallTrades } from "@/queries/server/trades";
import { toTradeEvent } from "@/lib/banners/recentTrade";
import { LogoMarkV2 } from "@/components/Atoms/LogoMarkV2";


export default function PumpNotificationBanner() {

  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext();

  const [transactionData, setTransactionData] = useState<SpotTradeEvent | null>(null)

  /**
   * Fetch the newest trade for the strip. EVERY failure here is swallowed, and
   * that is the whole point.
   *
   * This component rides `AppShell`, so it renders on every page that has a
   * sidebar. The await below is a `"use server"` action that THROWS on any
   * non-ok response, and it used to run bare: no `.catch()`, and no check that
   * `trades[0]` existed. Two routine conditions therefore became an unhandled
   * rejection that replaced the entire tree with Next's "This page couldn't
   * load" — gateway rate-limiting (`/api/trades/all` answers 429 under load,
   * by design), and a chain with no trades yet.
   *
   * The reported symptom was "the links in the left panel don't work". They
   * worked fine; there was no left panel, because a decorative banner had taken
   * the page down. A strip that self-hides when it has nothing to show must
   * also self-hide when it cannot find out.
   *
   * Logged rather than silent: an outage that leaves no trace is the thing that
   * made this take a whole debugging session to find.
   */
  useEffect(() => {
    let cancelled = false;

    const fetchOverallTrade = async () => {
      try {
        const overallTrade = await getSpotRecentOverallTrades(displayNetworkName, 1, 1);
        if (cancelled) return;
        const tradeEvent = toTradeEvent(overallTrade?.trades?.[0]);
        // null => nothing renderable; the render path already returns null for it.
        if (tradeEvent) setTransactionData(tradeEvent);
      } catch (error) {
        if (!cancelled) {
          console.warn(
            `PumpNotificationBanner: recent-trade fetch failed for ${displayNetworkName}; hiding the strip.`,
            error,
          );
        }
      }
    };

    fetchOverallTrade();
    // Guards a chain switch resolving out of order, so a slow response for the
    // previous network cannot overwrite the current one's.
    return () => {
      cancelled = true;
    };
  }, [displayNetworkName]);

  const [isShaking, setIsShaking] = useState(false)
  const animationKey = useRef(0)

  // Detect changes and trigger shake animation
  useEffect(() => {
    // Increment key to force animation restart
    animationKey.current += 1

    // Start animation
    setIsShaking(true)

    // Remove shake class after animation completes
    const timer = setTimeout(() => {
      setIsShaking(false)
    }, 700) // Match the animation duration

    return () => clearTimeout(timer)
  }, [transactionData]) // Only depend on transactionData

  // Set up event listener
  useEffect(() => {
    const handleTradeUpdate = (event: SpotTradeEvent) => {
      setTransactionData(event)
    }

    eventBus.on("spot-recent-overall-trades-update", handleTradeUpdate)

    return () => {
      eventBus.off("spot-recent-overall-trades-update", handleTradeUpdate)
    }
  }, [])

  // No trade data yet (or the fetch failed): render nothing rather than an empty brand-colored strip
  if (!transactionData) return null;

  return (
    <div className={cn("w-full flex items-center justify-center bg-primary-default", transactionData ? "py-1" : "py-4.5")}>
      {transactionData && (
      <div
        key={animationKey.current}
        className={`w-full lg:w-auto ${transactionData.isBid ? "bg-green-300" : "bg-red-300"} text-black ${isShaking ? "animate-shake" : ""} rounded-[8px]`}
      >
        <a
          className="group flex items-center gap-1 px-2 py-1.5 text-sm transition-colors sm:rounded"
          href={`/trade/pro?chain=${displayNetworkSlug}&base=${transactionData.baseSymbol}&quote=${transactionData.quoteSymbol}`}
        >
          <div className="inline-flex gap-1">
            <span className="inline-flex items-center gap-1 truncate">
              <LogoMarkV2 size={16} />
              <span>{`${transactionData.account.slice(0, 6)}...`}</span>
            </span>
            <span className="truncate">
              {transactionData.isBid ? "Bought" : "Sold"} {transactionData.quoteAmount.toFixed(4)} {transactionData.quoteSymbol} of{" "}
              <span className="inline-flex gap-1 group-hover:undegrline">
                {transactionData.baseSymbol}
                <img
                  alt=""
                  loading="lazy"
                  width="20"
                  height="20"
                  decoding="async"
                  data-nimg="1"
                  className="h-5 w-5 rounded-full"
                  src={transactionData.baseLogoURI}
                  style={{ color: "transparent" }}
                />
              </span>
            </span>
          </div>
          <div className="inline-flex gap-2">
            <div className="hidden gap-1 xl:inline-flex">
              <span>|</span>
              <span>price: {transactionData.price.toFixed(4)}</span>
            </div>
          </div>
        </a>
      </div>
      )}
    </div>
  )
}
