import { z } from "zod";

/**
 * "Something of yours changed, and it was not an order."
 *
 * Every socket frame on `spotAccount:{address}` used to be an order event —
 * placed, matched, canceled, dusted, history. A launch, a band deposit or
 * withdrawal, and a presale commitment wrote their rows and published nothing,
 * so a user on the portfolio learned of their own transaction only by the next
 * refetch. `verify:backend`'s socket instrument (2026-09-19) is what made that
 * visible: three of seven steps received no frame at all.
 *
 * This is deliberately a NOTIFICATION, not a row. The portfolio's live hook
 * already knows how to fetch every surface those events feed; carrying the
 * rows here would be a second copy of each shape kept in step by hand, which
 * is the drift this codebase keeps deleting. The frame says what kind of thing
 * happened and to which reference, and the consumer refetches.
 */
export type SpotAccountActivityKind =
  | "launch"
  | "bandLiquidityAdded"
  | "bandLiquidityRemoved"
  | "presaleCreated"
  | "presaleCommit"
  // The ladder launch (2026-10-02): the creator's dev buy, graduation armed and
  // finished, a vesting release, and a lister's listPair.
  | "devBuy"
  | "graduationArmed"
  | "graduated"
  | "liquidityReleased"
  | "pairListed";

export type SpotAccountActivityEvent = {
  eventId: "spotAccountActivity";
  kind: SpotAccountActivityKind;
  account: string;
  /** The coin for a launch, the pool for a band position, the campaign id for a presale. */
  ref: string;
  txHash: string;
  timestamp: number;
  updatedAt: number;
};

export const spotAccountActivityStreamSchema = z.tuple([
  z.string(), // eventId
  z.string(), // kind
  z.string(), // account
  z.string(), // ref
  z.string(), // txHash
  z.number(), // timestamp
  z.number(), // updatedAt
]);
export type SpotAccountActivityStream = z.infer<typeof spotAccountActivityStreamSchema>;

export function eventToSpotAccountActivityStream(obj: SpotAccountActivityEvent): SpotAccountActivityStream {
  return [obj.eventId, obj.kind, obj.account, obj.ref, obj.txHash, obj.timestamp, obj.updatedAt];
}

export function streamToSpotAccountActivityEvent(data: SpotAccountActivityStream): SpotAccountActivityEvent {
  return {
    eventId: "spotAccountActivity",
    kind: data[1] as SpotAccountActivityKind,
    account: data[2],
    ref: data[3],
    txHash: data[4],
    timestamp: data[5],
    updatedAt: data[6],
  };
}
