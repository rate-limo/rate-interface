import type { OpenOrder } from "./types";

/**
 * On-chain order IDs are scoped to a chain, pair, and side. Bid and ask books
 * both start at order 1, so the numeric ID alone is not a row identity.
 */
export function openOrderKey(order: OpenOrder): string | undefined {
  if (
    order.orderId === undefined ||
    !order.baseAddress ||
    !order.quoteAddress
  ) {
    return undefined;
  }

  return [
    order.market.network.toLowerCase(),
    order.baseAddress.toLowerCase(),
    order.quoteAddress.toLowerCase(),
    order.side,
    order.orderId,
  ].join(":");
}
