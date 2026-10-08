import { useTradePageContext } from "@/contexts/TradePageProvider";
import type { GroupedOrder } from "@/types/tables";
import { roundToDecimal } from "@/utils/number";

/**
 * What a tap on a book level does, shared by the desktop ladder and the phone's
 * side-by-side one so the two cannot drift: it sets the limit price, and when the
 * tapped side is the one you would trade INTO (an ask while buying, a bid while
 * selling) it also fills the size needed to take every level up to it.
 */
export function useLadderPick() {
  const { setLimitPrice, isBid, setAmount, setQuoteAmount, setBaseAmount } = useTradePageContext();

  const pickAsk = (order: GroupedOrder) => {
    setLimitPrice(Number(order.price));
    if (isBid) {
      setAmount(roundToDecimal(Number(order.accumulatedQuoteLiquidity), 6).toString());
      setQuoteAmount(roundToDecimal(Number(order.accumulatedQuoteLiquidity), 6));
      setBaseAmount(roundToDecimal(Number(order.accumulatedQuoteLiquidity) / Number(order.price), 6));
    }
  };

  const pickBid = (order: GroupedOrder) => {
    setLimitPrice(Number(order.price));
    if (!isBid) {
      setAmount(roundToDecimal(Number(order.accumulatedBaseLiquidity), 6).toString());
      setBaseAmount(roundToDecimal(Number(order.accumulatedBaseLiquidity), 6));
      setQuoteAmount(roundToDecimal(Number(order.accumulatedBaseLiquidity) * Number(order.price), 6));
    }
  };

  return { pickAsk, pickBid };
}
