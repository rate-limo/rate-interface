import { z } from "zod";

/**
 * A coin was launched, announced to the WHOLE venue.
 *
 * ## Why this exists beside `spotAccountActivity`
 *
 * The broker already emits a launch frame — on `spotAccount:<creator>`, which
 * exactly one session hears. That is right for the creator's own activity feed
 * and useless for a directory: `/launch` shows every coin on the venue, and
 * until now learned about a new one only when its query happened to refetch
 * (mount, window focus). A visitor watching the page saw nothing happen.
 *
 * So this is a second frame for the same chain event, on a public room, and the
 * two are not redundant: one answers "what did I do", the other "what happened
 * here". They carry different fields for that reason — the account frame is a
 * reference to look up, this one is enough to draw a card.
 *
 * ## Enough to render, not enough to price
 *
 * Symbol, name and creator, so a grid can show the coin the moment it exists.
 * Deliberately NO market cap, price or supply: those are broker aggregates that
 * move continuously, and a number frozen into a launch frame would be stale
 * before it arrived and would then disagree with the row beside it. The client
 * inserts what it is told and lets the next read fill in the figures.
 */
export type SpotLaunchEvent = {
  eventId: "spotLaunch";
  /** The coin's contract address. The identity everything else keys on. */
  coin: string;
  symbol: string;
  name: string;
  creator: string;
  /** The quote the coin was listed against, so a filtered view can ignore it. */
  quote: string;
  txHash: string;
  /** Block timestamp, seconds — the chain's clock, never the broker's. */
  timestamp: number;
  updatedAt: number;
};

export const spotLaunchStreamSchema = z.tuple([
  z.string(), // eventId
  z.string(), // coin
  z.string(), // symbol
  z.string(), // name
  z.string(), // creator
  z.string(), // quote
  z.string(), // txHash
  z.number(), // timestamp
  z.number(), // updatedAt
]);
export type SpotLaunchStream = z.infer<typeof spotLaunchStreamSchema>;

export function eventToSpotLaunchStream(obj: SpotLaunchEvent): SpotLaunchStream {
  return [
    obj.eventId,
    obj.coin,
    obj.symbol,
    obj.name,
    obj.creator,
    obj.quote,
    obj.txHash,
    obj.timestamp,
    obj.updatedAt,
  ];
}

export function streamToSpotLaunchEvent(data: SpotLaunchStream): SpotLaunchEvent {
  return {
    eventId: "spotLaunch",
    coin: data[1],
    symbol: data[2],
    name: data[3],
    creator: data[4],
    quote: data[5],
    txHash: data[6],
    timestamp: data[7],
    updatedAt: data[8],
  };
}
