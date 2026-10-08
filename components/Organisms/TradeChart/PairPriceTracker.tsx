"use client"

import { useState } from "react"
import { SearchPopover } from "../SearchPopover"
import { PairImageIcon } from "@/components/Atoms/PairImageIcon";
import Decimal from "decimal.js";
import { TokenPercentageChange } from "@/components/Atoms/TokenPercentageChange";
import { addCommasInDecimalString } from "@/utils/number";
import { formatPrice } from "@/lib/format/price";
import { useTradePageContext } from "@/contexts/TradePageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { tokenColor } from "@/lib/swap/tokens";
import { StarButton } from "../StarButton";
import { CopyMarketLink } from "./CopyMarketLink";

export default function PairPriceTracker() {
  const { pair } = useTradePageContext();
  const { displayNetworkName } = useMarketPageContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex w-full min-w-[700px] items-center gap-7 font-sans">
      <SearchPopover className="w-[180px] cursor-pointer" onOpenChange={setIsOpen}>
        <div className="flex h-10 w-[180px] items-center gap-2 border-r border-[color:var(--m-border)] pr-5 text-[color:var(--m-text-primary)]">
          {/*
            The market's own mark — the same one every row of this app draws for a
            pair. This was the BASE token alone, beside a label reading the full
            `BASE/QUOTE`: a mark that names half of what the text beside it names,
            on the one header that is also the market SWITCHER. Two markets sharing
            a base — and a venue where anyone can open one against any quote has
            many — were indistinguishable by their icon at the exact moment a
            reader is choosing between them.

            It also passed `color={""}`, so a token with no artwork fell back to an
            untinted disc rather than to `tokenColor`'s hue, and no `chainName`, so
            the terminal header was the only market mark in the app with no network
            chip.
          */}
          <PairImageIcon
            base={pair.base.symbol}
            quote={pair.quote.symbol}
            baseLogoURI={pair.base.logoURI}
            quoteLogoURI={pair.quote.logoURI}
            baseColor={tokenColor(pair.base.symbol)}
            quoteColor={tokenColor(pair.quote.symbol)}
            chainName={displayNetworkName}
            className="h-8 w-8"
          />
          <span className="text-[14px] font-semibold">{pair.symbol}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`ml-1 transition-transform duration-200 ${isOpen ? 'rotate-[-180deg]' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </SearchPopover>
      {/* The market's own controls, beside its name: favorite it, or copy its
          link. Most markets are reached by link at launchpad scale. */}
      <div className="-ml-4 flex items-center gap-2">
        <span className="relative grid h-8 w-8 place-items-center before:absolute before:-inset-1 before:content-['']">
          <StarButton id={pair.id} symbol={pair.symbol} option="spot" size={16} />
        </span>
        <CopyMarketLink pair={pair} networkName={displayNetworkName} />
      </div>
      <div className="flex min-w-[105px] flex-col">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">Last price</span>
        {/* `formatPrice`, not `PriceChange`'s 8-character budget: a launch coin
            at 0.0000049 has to read as 0.0000049, not 0.000005 or 0. */}
        <span
          data-testid="last-price"
          className={`text-[14px] font-medium tabular-nums ${
            pair.price > 0 ? "text-green-600 dark:text-green-300" : "text-[color:var(--m-text-primary)]"
          }`}
        >
          {pair.price > 0 ? formatPrice(pair.price) : "—"}
        </span>
      </div>

      <div className="flex min-w-[460px] items-center gap-7 overflow-x-auto">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h change</span>
          <TokenPercentageChange change={pair.dayPriceDifferencePercentage} className="text-[12px]" />
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h high</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayHigh > 0 ? formatPrice(pair.dayHigh) : '--'}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h low</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayLow > 0 ? formatPrice(pair.dayLow) : '--'}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h volume ({pair.quote.symbol})</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayQuoteVolumeUSD > 0 ? addCommasInDecimalString(Decimal(pair.dayQuoteVolumeUSD * 2).toFixed(2)) : '--'}</span>
        </div>
      </div>
    </div>
  )
}
