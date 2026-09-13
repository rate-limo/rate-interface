import type { SpotToken } from "@/types";

/**
 * Whether Iter launched this token, which decides what the token profile can
 * honestly show.
 *
 * ## Why one helper instead of `token.creator !== ""` at each call site
 *
 * Three surfaces branch on this — the trader board, the holder map, and the
 * routing that sends a row to `/coin` rather than `/price`. Written out
 * separately they drift, and the drift is invisible: a page that decides one way
 * about which panels to render and another way about which endpoint to call
 * shows an explanation next to populated data, or an empty panel next to a
 * promise that data exists.
 *
 * `spotTokens.creator` is written by the broker from `AssetGenerator.Launched`
 * and is the empty string for every token that arrived any other way. The
 * gateway's `/bubbles` endpoint derives its `covered` flag from the same column,
 * so client and server agree by construction rather than by coincidence.
 */
export function isLaunchedOnIter(token: Pick<SpotToken, "creator">): boolean {
  return (token.creator ?? "").length > 0;
}

/**
 * What a token profile can show, given where the token came from.
 *
 * Named rather than inlined so the reason travels with the decision. The two
 * flags are separate because they are blocked for DIFFERENT reasons, and
 * collapsing them into one "isLaunched" check would hide that:
 *
 *  - `holderGraph` is a hard limit. Balances come from a ponder factory source
 *    over `Launched`, so a token that factory never deployed has no transfer
 *    stream indexed and never will without new indexing. No amount of trading
 *    creates one.
 *
 *  - `traderBoard` is a PRODUCT choice, not a data limit. `spotPositions` is
 *    folded from fills and does have rows for any traded token, including ETH —
 *    they are simply the partial fill-ledger view the panel already labels as
 *    such. It is gated here so an off-factory profile shows one honest thing
 *    (the tape) instead of two half-answers. Flip this to `true` to show the
 *    board everywhere; nothing downstream needs to change.
 */
export interface TokenProfileCoverage {
  launchedOnIter: boolean;
  holderGraph: boolean;
  traderBoard: boolean;
}

export function tokenProfileCoverage(token: Pick<SpotToken, "creator">): TokenProfileCoverage {
  const launchedOnIter = isLaunchedOnIter(token);
  return {
    launchedOnIter,
    holderGraph: launchedOnIter,
    traderBoard: launchedOnIter,
  };
}
