import { useMemo } from "react";
import { useOptionalOrderPageContext } from "@/contexts/OrderPageProvider";
import { useTradePageContext } from "@/contexts/TradePageProvider";
import { NO_OWN_LEVELS, ownLevels, type OwnLevels } from "@/lib/orderbook/ownLevels";

/**
 * The connected wallet's resting orders on this market, keyed by the book level
 * they show on. Sourced from the same list the Open Orders table reads
 * (`OrderPageProvider` → `useOrders`), so it updates live with it and adds no
 * second fetch or second set of fill toasts.
 *
 * No wallet, or no provider above the book, marks nothing — never throws.
 */
export function useOwnBookLevels(): OwnLevels {
  const { pair, step } = useTradePageContext();
  // No wallet → `useOrders` is keyed on an undefined address and answers [].
  const orders = useOptionalOrderPageContext()?.orders ?? null;
  const base = pair?.base?.id ?? "";
  const quote = pair?.quote?.id ?? "";
  return useMemo(
    () => (orders && base && quote ? ownLevels(orders, step, { base, quote }) : NO_OWN_LEVELS),
    [orders, step, base, quote],
  );
}
