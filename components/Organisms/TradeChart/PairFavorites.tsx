"use client";

import { TokenPercentageChange } from "@/components/Atoms/TokenPercentageChange";
import { StarButton } from "../StarButton";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { SearchPopover } from "../SearchPopover";
import Link from "next/link";

export default function PairFavorites() {
  const { watchlistPairs, displayNetworkSlug } = useMarketPageContext();
  return (
    <div className="flex w-full items-center justify-between p-1 rounded-full bg-black text-white border-[1px] border-neutral-light-white-12">
      <div className="flex items-center space-x-2 min-w-[400px] w-full overflow-x-scroll hide-scrollbar">
        {watchlistPairs?.map((pair) => {
          const [favBase, favQuote] = pair.symbol.split("/");
          // Quick-switch between markets stays inside the Pro gear.
          const favHref = favQuote
            ? `/trade/pro?chain=${displayNetworkSlug}&base=${favBase}&quote=${favQuote}`
            : `/trade/pro?chain=${displayNetworkSlug}&base=${favBase}`;
          return (
          <Link key={pair.symbol} href={favHref} className="flex flex-row items-center space-x-1 hover:bg-neutral-dark-500 min-w-[124px]">
            <StarButton id={pair.id} symbol={pair.symbol} option="spot" className="w-3 h-3 cursor-grab" size={12} />
            <span className="font-bold text-[14px]">{pair.symbol}</span>
            <TokenPercentageChange change={pair.dayPriceDifferencePercentage} className="text-sm"/>
          </Link>
          );
        })}
      </div>
      <SearchPopover className="flex flex-row items-center justify-center px-4 py-2 rounded-full bg-black-300 text-dark-grey-1 w-[100px] cursor-pointer hover:bg-neutral-dark-500 text-[12px]">
        Manage
      </SearchPopover>
    </div>
  );
}
