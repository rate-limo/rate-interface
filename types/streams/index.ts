/**
 * Stream types — re-exported from `@iter/types`, never redefined here.
 *
 * These used to be a hand-maintained SECOND copy of the broker's wire format, and the two
 * had already drifted: `trades`, `orders` and `orderhistories` were each missing a field
 * the shared schema had added, so every position after it decoded one slot off. Live
 * trades read a fee where the taker address belonged; orders and order history read
 * `amount` where `assetDecimals` belonged. Nothing caught it — the tuples are positional,
 * the decoders cast rather than parse, and TypeScript was checking the copy against itself.
 *
 * The list below is NAMES only. The field layout — the part that actually broke — now has
 * exactly one definition, in the package the broker encodes with. Add a field there and
 * both sides move together.
 *
 * Deliberately NOT `export * from "@iter/types"`: that would also pull the shared
 * `GroupedOrderbookResult`, which is poorer than the web's own (no spread/spreadPercentage)
 * and would silently win the name.
 */
export {
  eventToFuturesLiquidationStream,
  eventToFuturesMarkStream,
  eventToFuturesPositionStream,
  eventToSpotBarStream,
  eventToSpotDeleteOrderItemStream,
  eventToSpotOrderBlockStream,
  eventToSpotOrderHistoryStream,
  eventToSpotOrderMatchedStream,
  eventToSpotOrderStream,
  eventToSpotTradeStream,
  eventToSpotFillSummaryStream,
  eventToStream,
  spotDeleteOrderItemStreamSchema,
  spotOrderMatchedStreamSchema,
  spotOrderStreamSchema,
  streamToEvent,
  streamToFuturesLiquidationEvent,
  streamToFuturesMarkEvent,
  streamToFuturesPositionEvent,
  streamToSpotBarEvent,
  streamToSpotDeleteOrderItemEvent,
  streamToSpotOrderBlockEvent,
  streamToSpotOrderEvent,
  streamToSpotOrderHistoryEvent,
  streamToSpotOrderMatchedEvent,
  streamToSpotTradeEvent,
  streamToSpotFillSummaryEvent,
  expandFillSummary,
  collapseFillSummary,
} from "@iter/types";

export type {
  FuturesLiquidationEvent,
  FuturesLiquidationStream,
  FuturesMarkEvent,
  FuturesMarkStream,
  FuturesPositionEvent,
  FuturesPositionStream,
  SpotBarEvent,
  SpotBarStream,
  SpotDeleteOrderItemEvent,
  SpotDeleteOrderItemStream,
  SpotOrderBlockEvent,
  SpotOrderBlockStream,
  SpotOrderEvent,
  SpotOrderHistoryEvent,
  SpotOrderHistoryStream,
  SpotOrderMatchedEvent,
  SpotOrderMatchedStream,
  SpotOrderStream,
  SpotTradeEvent,
  SpotTradeStream,
  SpotFillSummaryEvent,
  SpotFillSummaryStream,
  SpotFillRow,
  StreamableObject,
} from "@iter/types";
