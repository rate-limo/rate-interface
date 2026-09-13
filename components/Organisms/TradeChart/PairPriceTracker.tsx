"use client"

import { useState } from "react"
import { SearchPopover } from "../SearchPopover"
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import Decimal from "decimal.js";
import { TokenPercentageChange } from "@/components/Atoms/TokenPercentageChange";
import { PriceChange } from "@/components/Atoms/PriceChange";
import { addCommasInDecimalString, adjustDecimalLength } from "@/utils/number";
import { useTradePageContext } from "@/contexts/TradePageProvider";

export default function PairPriceTracker() {
  const { pair } = useTradePageContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex w-full min-w-[700px] items-center gap-7 font-sans">
      <SearchPopover className="w-[180px] cursor-pointer" onOpenChange={setIsOpen}>
        <div className="flex h-10 w-[180px] items-center gap-2 border-r border-[color:var(--m-border)] pr-5 text-[color:var(--m-text-primary)]">
          <TokenImageIcon symbol={pair.base.symbol} color={""} logoURI={pair.base.logoURI} size="md" />
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
      <div className="flex min-w-[105px] flex-col">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">Last price</span>
        <PriceChange price={pair.price} className="text-[14px] font-medium" />
      </div>

      <div className="flex min-w-[460px] items-center gap-7 overflow-x-auto">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h change</span>
          <TokenPercentageChange change={pair.dayPriceDifferencePercentage} className="text-[12px]" />
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h high</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayHigh > 0 ? addCommasInDecimalString(Decimal(pair.dayHigh).toFixed(2)) : '--'}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h low</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayLow > 0 ? addCommasInDecimalString(Decimal(pair.dayLow).toFixed(2)) : '--'}</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--m-text-secondary)]">24h volume ({pair.quote.symbol})</span>
          <span className="text-[12px] text-[color:var(--m-text-primary)]">{pair.dayQuoteVolumeUSD > 0 ? addCommasInDecimalString(Decimal(pair.dayQuoteVolumeUSD * 2).toFixed(2)) : '--'}</span>
        </div>
      </div>
    </div>
  )
}
