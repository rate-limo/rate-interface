import { z } from "zod";
export const spotOrderMatchedStreamSchema = z.tuple([
  z.string(), // eventId
  z.boolean(), // isBid
  z.number(), // orderId
  z.string(), // base
  z.string(), // baseSymbol
  z.string(), // baseLogoURI
  z.string(), // quote
  z.string(), // quoteSymbol
  z.string(), // quoteLogoURI
  z.string(), // pairSymbol
  z.string(), // pair
  z.number(), // price
  z.string(), // asset
  z.string(), // assetSymbol
  z.number(), // assetDecimals
  z.number(), // amount
  z.number(), // placed
  z.number(), // matched
  z.number(), // timestamp
  z.string(), // account
  z.string(), // txHash
  z.number(), // updatedAt
])
  // Trailing, and OPTIONAL by construction: `.rest()` accepts a frame that predates
  // these two slots as readily as one that carries them. The broker and the web
  // deploy separately, so a strict tuple would mean every frame emitted by a newer
  // broker failing to parse in an older client -- dropped silently, which is the
  // failure mode this whole area keeps producing.
  //
  // amountBN / placedBN: the same numbers as `amount` / `placed`, as decimal
  // strings, because JSON has no bigint. Null on rows predating migration 0031.
  .rest(z.string().nullable());

export type SpotOrderMatchedStream = z.infer<
  typeof spotOrderMatchedStreamSchema
>;

export type SpotOrderMatchedEvent = {
  eventId: "spotOrderMatched";
  isBid: boolean;
  orderId: number;
  base: string;
  baseSymbol: string;
  baseLogoURI: string;
  quote: string;
  quoteSymbol: string;
  quoteLogoURI: string;
  pairSymbol: string;
  pair: string;
  price: number;
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  amount: number;
  placed: number;
  /** Exact `amount`, as a decimal string. Null for rows predating migration 0031. */
  amountBN: string | null;
  /** Exact `placed`. This is the one that drifts -- it is decremented per fill. */
  placedBN: string | null;
  matched: number;
  timestamp: number;
  account: string;
  txHash: string;
  updatedAt: number;
};

export function eventToSpotOrderMatchedStream(
  obj: SpotOrderMatchedEvent
): SpotOrderMatchedStream {
  return [
    obj.eventId,
    obj.isBid,
    obj.orderId,
    obj.base,
    obj.baseSymbol,
    obj.baseLogoURI,
    obj.quote,
    obj.quoteSymbol,
    obj.quoteLogoURI,
    obj.pairSymbol,
    obj.pair,
    obj.price,
    obj.asset,
    obj.assetSymbol,
    obj.assetDecimals,
    obj.amount,
    obj.placed,
    obj.matched,
    obj.timestamp,
    obj.account,
    obj.txHash,
    obj.updatedAt,
    obj.amountBN,
    obj.placedBN,
  ];
}

export function streamToSpotOrderMatchedEvent(
  data: SpotOrderMatchedStream
): SpotOrderMatchedEvent {
  return {
    eventId: data[0] as "spotOrderMatched",
    isBid: data[1],
    orderId: data[2],
    base: data[3],
    baseSymbol: data[4],
    baseLogoURI: data[5],
    quote: data[6],
    quoteSymbol: data[7],
    quoteLogoURI: data[8],
    pairSymbol: data[9],
    pair: data[10],
    price: data[11],
    asset: data[12],
    assetSymbol: data[13],
    assetDecimals: data[14],
    amount: data[15],
    placed: data[16],
    matched: data[17],
    timestamp: data[18],
    account: data[19],
    txHash: data[20],
    updatedAt: data[21],
    // Absent on a frame from a broker that predates these slots -- see the schema.
    amountBN: (data[22] as string | null | undefined) ?? null,
    placedBN: (data[23] as string | null | undefined) ?? null,
  };
}

export const spotOrderStreamSchema = z.tuple([
  z.string(), // eventId
  z.boolean(), // isBid
  z.number(), // orderId
  z.string(), // base
  z.string(), // baseSymbol
  z.string(), // baseLogoURI
  z.string(), // quote
  z.string(), // quoteSymbol
  z.string(), // quoteLogoURI
  z.string(), // pairSymbol
  z.string(), // pair
  z.number(), // price
  z.string(), // asset
  z.string(), // assetSymbol
  z.number(), // assetDecimals
  z.number(), // amount
  z.number(), // placed
  z.number(), // timestamp
  z.string(), // account
  z.string(), // txHash
  z.number(), // updatedAt
])
  // Trailing, and OPTIONAL by construction: `.rest()` accepts a frame that predates
  // these two slots as readily as one that carries them. The broker and the web
  // deploy separately, so a strict tuple would mean every frame emitted by a newer
  // broker failing to parse in an older client -- dropped silently, which is the
  // failure mode this whole area keeps producing.
  //
  // amountBN / placedBN: the same numbers as `amount` / `placed`, as decimal
  // strings, because JSON has no bigint. Null on rows predating migration 0031.
  .rest(z.string().nullable());

export type SpotOrderStream = z.infer<typeof spotOrderStreamSchema>;

export type SpotOrderEvent = {
  eventId: "spotOrder";
  isBid: boolean;
  orderId: number;
  base: string;
  baseSymbol: string;
  baseLogoURI: string;
  quote: string;
  quoteSymbol: string;
  quoteLogoURI: string;
  pairSymbol: string;
  pair: string;
  price: number;
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  amount: number;
  placed: number;
  /** Exact `amount`, as a decimal string. Null for rows predating migration 0031. */
  amountBN: string | null;
  /** Exact `placed`. This is the one that drifts -- it is decremented per fill. */
  placedBN: string | null;
  timestamp: number;
  account: string;
  txHash: string;
  updatedAt: number;
};

export function eventToSpotOrderStream(obj: SpotOrderEvent): SpotOrderStream {
  return [
    obj.eventId,
    obj.isBid,
    obj.orderId,
    obj.base,
    obj.baseSymbol,
    obj.baseLogoURI,
    obj.quote,
    obj.quoteSymbol,
    obj.quoteLogoURI,
    obj.pairSymbol,
    obj.pair,
    obj.price,
    obj.asset,
    obj.assetSymbol,
    obj.assetDecimals,
    obj.amount,
    obj.placed,
    obj.timestamp,
    obj.account,
    obj.txHash,
    obj.updatedAt,
    obj.amountBN,
    obj.placedBN,
  ];
}

// make function to convert orderStreamDataSchema to Order
export function streamToSpotOrderEvent(data: SpotOrderStream): SpotOrderEvent {
  return {
    eventId: data[0] as "spotOrder",
    isBid: data[1],
    orderId: data[2],
    base: data[3],
    baseSymbol: data[4],
    baseLogoURI: data[5],
    quote: data[6],
    quoteSymbol: data[7],
    quoteLogoURI: data[8],
    pairSymbol: data[9],
    pair: data[10],
    price: data[11],
    asset: data[12],
    assetSymbol: data[13],
    assetDecimals: data[14],
    amount: data[15],
    placed: data[16],
    timestamp: data[17],
    account: data[18],
    txHash: data[19],
    updatedAt: data[20],
    amountBN: (data[21] as string | null | undefined) ?? null,
    placedBN: (data[22] as string | null | undefined) ?? null,
  };
}

export type SpotDeleteOrderItemEvent = {
  eventId: "deleteSpotOrder" | "deleteSpotOrderHistory";
  isBid: boolean;
  pair: string;
  account: string;
  orderId: number;
  txHash: string;
  timestamp: number;
  status: "open" | "filled" | "canceled";
  updatedAt: number;
};

export const spotDeleteOrderItemStreamSchema = z.tuple([
  z.string(), // eventId
  z.boolean(), // isBid
  z.string(), // pair
  z.string(), // account
  z.number(), // orderId
  z.string(), // txHash
  z.number(), // timestamp
  z.string(), // status
  z.number(), // updatedAt
]);

export type SpotDeleteOrderItemStream = z.infer<
  typeof spotDeleteOrderItemStreamSchema
>;

export function eventToSpotDeleteOrderItemStream(
  obj: SpotDeleteOrderItemEvent
): SpotDeleteOrderItemStream {
  return [
    obj.eventId,
    obj.isBid,
    obj.pair,
    obj.account,
    obj.orderId,
    obj.txHash,
    obj.timestamp,
    obj.status,
    obj.updatedAt,
  ];
}

export function streamToSpotDeleteOrderItemEvent(
  data: SpotDeleteOrderItemStream
): SpotDeleteOrderItemEvent {
  return {
    eventId: data[0] as "deleteSpotOrder" | "deleteSpotOrderHistory",
    isBid: data[1],
    pair: data[2],
    account: data[3],
    orderId: data[4],
    txHash: data[5],
    timestamp: data[6],
    status: data[7] as "open" | "filled" | "canceled",
    updatedAt: data[8],
  };
}
