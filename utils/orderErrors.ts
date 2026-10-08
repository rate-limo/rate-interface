/**
 * Friendly messages for known MatchingEngine custom errors, decoded from a
 * wagmi/viem simulate-or-write error. viem decodes a reverted custom error
 * onto a `ContractFunctionRevertedError` in the error's `cause` chain as
 * `{ errorName, args }` on its `.data` property. We walk that chain by
 * duck-typing rather than importing viem's error classes, so this works
 * against both real wagmi errors and plain mocked shapes in tests.
 *
 * `OrderSizeTooSmall` is the important one this exists for: it can revert
 * for a NONZERO amount (whenever converted <= the pair's minimum size —
 * e.g. ~$0.003 for an ETH/USDC-shaped pair, see
 * docs/contract/decimal-precision-risks.md), so it is not caught by the
 * client-side "rounds to zero" dust checks in TradePageProvider. Without
 * this, the user's only signal was a raw error.message toast after a failed
 * simulate/submit.
 *
 * A name only reaches this table if the reverting error's fragment was in the
 * ABI the call was made with -- viem matches a 4-byte selector, it does not
 * guess. Every exchange call therefore goes through `components/abis/exchange`,
 * which appends the `Orderbook` / `ExchangeLinkedList` error fragments (and the
 * engine's own that the shipped ABI predates) to `MatchingEngine.json`. Adding
 * an entry here without its fragment there decodes nothing.
 */

/**
 * What the user could DO about it.
 *
 * An intent, not a handler: this module is pure and has no idea whether the surface
 * showing the error owns a price field, a market/limit switch, or a refetch. It names the
 * next step; `lib/errors/toastContractError` resolves the ones a given surface can
 * actually perform and renders nothing for the rest. A button that cannot help is worse
 * than no button, so an unresolved intent silently disappears.
 */
export type ErrorFixIntent =
  /** The book has no price to cross — a limit order is what sets the first one. */
  | "switch-to-limit"
  /** The limit price is zero, or too far from the book for it to be accepted. */
  | "use-market-price"
  /** There is no market here to trade in; the fix is finding one. */
  | "browse-markets"
  /** The state the client is acting on is stale — re-read it. */
  | "refresh";

export interface DecodedOrderError {
  title: string;
  description: string;
  fix?: ErrorFixIntent;
}

interface DecodedContractError {
  errorName: string;
  /** Decoded revert arguments, when viem could recover them. */
  args: readonly unknown[];
}

const KNOWN_ERROR_MESSAGES: Record<string, DecodedOrderError> = {
  OrderSizeTooSmall: {
    title: "Order is too small",
    description:
      "This order is below the exchange's minimum tradable size for this pair. Increase the amount and try again.",
  },
  AmountIsZero: {
    title: "Order amount cannot be zero",
    description: "Enter a nonzero amount to submit this order.",
  },
  PairNotListedYet: {
    title: "Pair not yet listed",
    description: "This trading pair is not open for trading yet.",
    fix: "browse-markets",
  },
  InvalidPair: {
    title: "Invalid trading pair",
    description: "This trading pair does not exist on the exchange.",
    fix: "browse-markets",
  },
  PairDoesNotExist: {
    title: "Market not found",
    description: "There is no order book for this pair on this network yet.",
    fix: "browse-markets",
  },
  TooManyMatches: {
    title: "Order crosses too many levels",
    description:
      "This order would match against more price levels than a single transaction allows. Split it into smaller orders, or set a limit price closer to the current one.",
    fix: "use-market-price",
  },
  // Reverted by MatchingLib when gas runs below the per-order reserve before the
  // FIRST match while the book still crosses (contracts/CLAUDE.md,
  // "InsufficientGasToMatch"). Nothing traded and nothing rested, and a retry is the
  // fix: the wallet's estimate now has to pay for at least one match.
  InsufficientGasToMatch: {
    title: "Not enough gas to fill",
    description:
      "This order ran out of gas before it could match anything, so nothing was traded and your funds were not moved. Try again; your wallet will estimate a higher gas limit.",
  },

  // --- Orderbook / ExchangeLinkedList ---------------------------------------
  // These are thrown BELOW the engine, so none of them could be decoded until
  // their fragments were merged into the call's ABI (components/abis/exchange).
  PriceIsZero: {
    title: "Price is too small",
    description:
      "This price rounds to zero at the pair's on-chain precision. Increase the price and try again.",
    fix: "use-market-price",
  },
  ZeroPrice: {
    title: "Price is too small",
    description:
      "This price rounds to zero at the pair's on-chain precision. Increase the price and try again.",
    fix: "use-market-price",
  },
  /**
   * The market-order counterpart to `NoMatchPrice`, and the likelier of the two on a
   * coin nobody has made a market in: there IS a price, but nothing reachable to trade
   * against — no resting order within the pair's spread, and no pool liquidity behind
   * it. `OrderPlacementLib` reverts rather than refunding, because a market order that
   * succeeds having spent nothing reads as a fill at a price that never happened.
   *
   * The fix is a limit order, which does not revert in this state: it rests and becomes
   * the liquidity the next person trades against. That is worth saying, because the
   * instinct on "insufficient liquidity" is to try a smaller size, and size is not the
   * problem here — no amount would have filled.
   */
  InsufficientLiquidity: {
    title: "Nothing to trade against",
    description:
      "There are no orders within range on this side of the book, and the pool has no liquidity to fill from, so a market order has nothing to match. A limit order will rest here instead of failing.",
    fix: "switch-to-limit",
  },
  NoMatchPrice: {
    title: "No price to match at",
    description:
      "This book has no resting orders and no last matched price, so a market order has nothing to trade against. Place a limit order to set the first price.",
    fix: "switch-to-limit",
  },
  PriceOutOfRange: {
    title: "Price too far from the market",
    description:
      "This limit price is outside the range the book accepts around the current price. Move it closer and try again.",
    fix: "use-market-price",
  },
  PriceNoneInRange: {
    title: "Price too far from the market",
    description:
      "This limit price is outside the range the book accepts around the current price. Move it closer and try again.",
    fix: "use-market-price",
  },
  NoHeadBelow: {
    title: "No liquidity at this price",
    description:
      "There are no resting orders on this side of the book at or beyond this price.",
    fix: "use-market-price",
  },
  InvalidAccess: {
    title: "Not allowed",
    description:
      "This order book only accepts calls from the exchange. If you reached this from the app, please report it.",
  },

  // Reverts on the CANCEL path, not on submit -- `cancelOrders` reports which
  // order it could not remove. It is listed here so the one decoder covers the
  // whole exchange surface; the cancel UI currently swallows its errors, so
  // this entry is dormant until that path reports them.
  OrderCancelFailed: {
    title: "Order could not be cancelled",
    description:
      "The exchange rejected the cancellation — the order may have already been filled or removed. Refresh your open orders and try again.",
    fix: "refresh",
  },

  // --- NFT exchange (contracts/src/exchange/nft) -----------------------------
  // These live in the SAME table rather than a second one next to it. The
  // fragments ship in @iter/abis's nftTokenMatchingEngine / nftBarterMatchingEngine,
  // and the rule above applies unchanged: a name here decodes nothing unless the
  // call was made with an ABI carrying its fragment.
  ZeroToken: {
    title: "That collection address is empty",
    description: "Nothing is deployed at that address on this network.",
  },
  ERC721AmountNotOne: {
    title: "An ERC-721 trades one at a time",
    description: "This order asks for a quantity other than 1. Set it to 1 and try again.",
  },
  // Shared by NFT orders and LadderBuyer: the decoder keys on the name.
  ZeroAmount: {
    title: "Pick an amount above zero",
    description: "There is nothing to trade at zero. Enter an amount and try again.",
  },
  ZeroQuoteToken: {
    title: "Choose a token to price this in",
    description: "The order needs a payment token before it can be created.",
  },
  ZeroQuoteAmount: {
    title: "Set a price above zero",
    description: "An order priced at zero would give the item away.",
  },
  ExpiryNotInFuture: {
    title: "That expiry has already passed",
    description: "Pick a time later than now and try again.",
  },
  OfferedIsWanted: {
    title: "That offer swaps an item for itself",
    description: "Choose a different item on one side of the barter.",
  },
  WrongSide: {
    title: "That order is on the other side of the book",
    description: "Use Accept bid for a bid, and Buy for an ask.",
  },
  NotMaker: {
    title: "Only the wallet that created this order can change it",
    description: "Connect the wallet that placed it, then try again.",
  },
  Inactive: {
    title: "This order is already filled or cancelled",
    description: "Refresh the list — it is no longer open.",
  },
  Expired: {
    title: "This order has expired",
    description: "Its expiry has passed, so it can no longer be filled.",
  },
  NotExpired: {
    title: "This order has not expired yet",
    description: "It can only be swept once its expiry is in the past.",
  },

  // --- AssetGenerator: launching a coin, listing a pair ------------------------
  // Decodable because the launch and the pool-launch both call the generator
  // with `AssetGeneratorABI`, which declares every one of these.
  DevBuyTooSmall: {
    title: "Your dev buy is below the minimum",
    description: "Every launch starts with a dev buy of at least the minimum shown. Raise it and try again.",
  },
  DevBuyTooLarge: {
    title: "Your dev buy is over 10% of the supply",
    description: "A creator can buy at most 10% of the supply at the starting price. Lower it and try again.",
  },
  ListingPriceTooLow: {
    title: "That starting price is too small",
    description:
      "It is below the smallest price the market can list. For a coin launch, use a smaller supply; for a pool, raise the price or swap the pair's order.",
  },
  NoBandPool: {
    title: "This market can't hold a pool",
    description: "The launch needs a pool to lock the supply in, and none was created for this pair. Nothing was deployed.",
  },
  InsufficientFee: {
    title: "The launch fee wasn't attached",
    description: "The launch fee changed or was not sent with the transaction. Refresh and try again.",
  },
  QuoteNotEnabled: {
    title: "That quote token isn't accepted",
    description: "An operator has turned this quote off since the page loaded. Refresh and pick another.",
    fix: "refresh",
  },
  PairAlreadyListed: {
    title: "This market already exists",
    description: "Someone listed this pair first. Add liquidity to it instead of launching it.",
    fix: "refresh",
  },
  InvalidVolatility: {
    title: "That volatility isn't allowed",
    description: "It is outside the range Rate allows. Refresh and pick again.",
    fix: "refresh",
  },
  FeeOutsidePairRange: {
    title: "That fee isn't allowed",
    description: "It is outside the range Rate allows for a market. Refresh and pick again.",
    fix: "refresh",
  },
  FeeAboveCreatorCap: {
    title: "That fee is above the ceiling",
    description: "It is above the most a lister or creator may set. Pick a lower fee.",
  },
  LadderNotFilled: {
    title: "Not every step has sold yet",
    description: "Graduation can be armed once all five sell steps have sold. Nothing was changed.",
  },
  GraduationNotReady: {
    title: "Graduation isn't ready yet",
    description: "It is armed and finishes 5 minutes after arming. Try again when the countdown ends.",
  },
  AlreadyGraduated: {
    title: "This coin has already graduated",
    description: "Nothing was changed.",
    fix: "refresh",
  },
  NotGraduated: {
    title: "This coin hasn't graduated yet",
    description: "There is no pool position until it does.",
  },
  NothingToRelease: {
    title: "Nothing new has vested",
    description: "Liquidity vests over 12 months from graduation. Try again later.",
  },
  NotVesting: {
    title: "This liquidity never unlocks",
    description: "The coin was launched to keep earning fees forever. You can collect fees, not withdraw.",
  },
  NotTheCreator: {
    title: "Only the coin's creator can do that",
    description: "Connect the wallet that launched this coin.",
  },
  NotTheLister: {
    title: "Only the pool's lister can do that",
    description: "Connect the wallet that listed this pair.",
  },
  BandCallNotAllowed: {
    title: "That pool change isn't allowed",
    description: "A lister can only configure the pool's bands, fees per band and which bands are open.",
  },
  // --- LadderBuyer: Buy and Sell on a launch coin before it graduates --------
  InsufficientOutput: {
    title: "The price moved while you were confirming",
    description: "This trade would now deliver less than its minimum, so nothing was traded. Try again, or allow more slippage.",
    fix: "refresh",
  },
  NativeLegUnsupported: {
    title: "This market can't be traded this way",
    description: "One side is the chain's wrapped native coin, which this trade can't handle. Use the order book instead.",
  },
  NoMarket: {
    title: "Market not found",
    description: "There is no market for this coin on this network yet, so nothing was traded.",
    fix: "browse-markets",
  },
  NoWrappedNative: {
    title: "Can't pay with the native coin here",
    description: "This network has no wrapped native coin for this trade, so nothing was traded. Pay with the market's quote token instead.",
  },
  NotCanonicalWrapper: {
    title: "This market can't be traded this way",
    description: "The trade named a wrapped native coin this venue doesn't use, so nothing was traded. Pay with the market's quote token instead.",
  },
  UnexpectedNative: {
    title: "Native coin sent to the wrong place",
    description: "The trade contract only accepts the native coin from its own wrapper, so nothing was traded and the coin was not taken.",
  },
  EmptyMetadata: {
    title: "The coin needs a name and a symbol",
    description: "Fill both in and try again. Nothing was deployed.",
  },
  SupplyIsZero: {
    title: "The supply can't be zero",
    description: "Enter a supply and try again. Nothing was deployed.",
  },
  CoinNotLaunched: {
    title: "That isn't a coin launched on Rate",
    description: "Only coins launched here have a launch to manage.",
  },
  RefundFailed: {
    title: "The leftover fee couldn't be refunded",
    description: "Your wallet refused the refund of the unused launch fee, so nothing was deployed. Send exactly the fee shown.",
  },
  InvalidRecipient: {
    title: "No wallet to send to",
    description: "Connect a wallet and try again.",
  },
  CreatorFeeControlLocked: {
    title: "Fee and volatility are locked",
    description: "They unlock at graduation, unless an operator has locked them.",
  },

  // --- Band pool deposits (contracts/src/swap) -------------------------------
  // Thrown BELOW the position manager, by `BandPool` or `BandSwapRouter`, so none
  // of them could be decoded until their fragments were merged into the call's ABI
  // (components/abis/bandDeposit). Wording is aimed at someone adding liquidity,
  // not at someone reading the contract.
  ZeroLiquidity: {
    title: "That amount is too small for this band",
    description:
      "One of the bands you picked would receive so little that it rounds to nothing on chain, so the deposit was refused. Deposit more, or put your money into fewer bands.",
  },
  NoLiquidity: {
    title: "This band has nothing to trade against",
    description:
      "Bringing one token means swapping half of it inside the band, and this band is empty, so there is nothing to swap with. Deposit both tokens, or pick a band that already holds liquidity.",
  },
  NothingFilled: {
    title: "The swap inside the band did not go through",
    description:
      "Half your deposit has to be swapped in the band before it can be added, and that swap filled nothing. Try a larger amount, or deposit both tokens instead.",
  },
  SharesBelowMinimum: {
    title: "The price moved while you were confirming",
    description:
      "This deposit would now buy less of the pool than it was quoted, so it was refused rather than filled at the worse price. Try again.",
  },
  SlippageExceeded: {
    title: "The price moved while you were confirming",
    description: "The pool moved past the limit set for this deposit. Try again.",
  },
  AmountBelowMinimum: {
    title: "You would get back less than you asked for",
    description:
      "The amounts this withdrawal returns fell below the minimum set for it, so nothing was moved. Try again.",
  },
  BandClosed: {
    title: "That band is closed",
    description: "The pool's creator has closed this band, so it cannot take deposits. Pick another one.",
  },
  BadBand: {
    title: "That band does not exist",
    description: "This pool has fewer bands than the deposit named. Reload the page and pick again.",
  },
  BandsNotAscending: {
    title: "The bands came through out of order",
    description: "The deposit listed its bands in the wrong order. Reload the page and try again.",
    fix: "refresh",
  },
  BandHoldsLiquidity: {
    title: "This band still holds money",
    description: "A band cannot be closed or reshaped while there is liquidity in it.",
  },
  NoAnchorPrice: {
    title: "This market has no price yet",
    description:
      "The pool prices deposits against the pair's recent trades, and this pair has none. It needs a trade before liquidity can be added.",
  },
  // Shared by the band deposit and LadderBuyer: the decoder keys on the name.
  DeadlinePassed: {
    title: "This took too long to confirm",
    description: "It sat unconfirmed past its time limit, so nothing was sent. Try again.",
    fix: "refresh",
  },
  NotOwnerOrApproved: {
    title: "This position belongs to another wallet",
    description: "Connect the wallet that holds it, then try again.",
  },
  UnknownPool: {
    title: "That pool is not recognised",
    description: "This address is not a pool the factory created. If you reached this from the app, please report it.",
  },
  PositionNotEmpty: {
    title: "This position still holds money",
    description: "Withdraw everything from it first, then close it.",
  },
  BadBps: {
    title: "That percentage is out of range",
    description: "Pick an amount between 0% and 100%.",
  },
  LengthMismatch: {
    title: "The deposit was built wrong",
    description: "Its bands and amounts did not line up. Reload the page and try again.",
    fix: "refresh",
  },
  OnlyPositionManager: {
    title: "Not allowed",
    description:
      "This pool only accepts deposits through the position manager. If you reached this from the app, please report it.",
  },

  // --- Shared / OpenZeppelin -------------------------------------------------
  ReentrancyGuardReentrantCall: {
    title: "That call re-entered the contract",
    description: "The contract rejected a nested call into itself. If you reached this from the app, please report it.",
  },
  SafeERC20FailedOperation: {
    title: "The token transfer failed",
    description: "Check your balance and that the exchange is approved to move this token.",
  },

  // --- TransferHelper --------------------------------------------------------
  // These replaced the bare `require(success, "TFF")` strings. A `require`
  // string is invisible to this table -- it decodes to no `errorName` at all --
  // which is how a failed transfer used to reach the user as the literal text
  // "TFF". Worse, that one string covered four unrelated causes (allowance,
  // balance, the token's own revert, and the low-level call running out of gas),
  // so nothing downstream could tell a trader which had happened.
  //
  // The library now re-throws the TOKEN's own error when it has one, so the
  // ERC-20 entries below are usually what a modern token produces and these are
  // the fallback for tokens that revert silently.
  TransferFromFailed: {
    title: "The exchange could not take that token",
    description:
      "The transfer was rejected without a reason. Check that you hold the amount and have approved the exchange to move it — and if the market just gained liquidity, try again.",
  },
  TransferFailed: {
    title: "The exchange could not send that token",
    description: "The transfer was rejected without a reason. Please try again.",
  },
  TransferRejected: {
    title: "The token refused the transfer",
    description:
      "This token returned a failure rather than moving the funds. It may be paused or restricted for this account.",
  },
  NativeTransferFailed: {
    title: "The refund could not be sent",
    description:
      "The exchange could not return the native amount to your wallet. If your wallet is a contract, it must accept plain transfers.",
  },

  // --- ERC-20, bubbled up through TransferHelper -----------------------------
  // Not thrown by the exchange at all -- these come from the TOKEN, and reach
  // here only because `TransferHelper` now re-throws the child's revert data
  // instead of swallowing it. They carry the exact numbers, which is why
  // bubbling was worth doing: this is the difference between "approve the
  // exchange" and a three-letter string.
  ERC20InsufficientAllowance: {
    title: "Approve the exchange first",
    description:
      "You have not approved the exchange to move enough of this token. Approve it and place the order again.",
  },
  ERC20InsufficientBalance: {
    title: "Not enough balance",
    description: "Your wallet does not hold enough of this token to cover the order.",
  },
};

/**
 * Failures that carry NO decodable error, and must still never reach a user raw.
 *
 * An out-of-gas revert returns empty revert data — there is no `errorName` to
 * look up, so `KNOWN_ERROR_MESSAGES` cannot help and the caller used to fall
 * back to `error.message`, which is how chain noise reached the toast.
 *
 * This is not hypothetical. Measured on RISE: an identical `limitBuy`, same
 * account and same allowance, succeeds at a 400,000 gas limit and reverts with
 * empty data at 250,000 — because a matching order costs ~373,000 while a
 * non-matching one costs ~240,000. An order estimated against an empty book and
 * mined against one with depth is therefore gas-starved by roughly a third, and
 * fails *because* there was finally something to trade against.
 */
function describeUndecodableFailure(error: unknown): DecodedOrderError | null {
  const text = collectMessages(error);
  if (!text) return null;

  // `TransferHelper`'s short `require` strings. They are NOT custom errors, so
  // they decode to a `reason` and no `errorName` -- invisible to the table above,
  // which is exactly how the literal text "TFF" once reached a trader.
  //
  // They stayed as strings because naming them made MatchingEngine exceed
  // EIP-170; see the note in contracts/src/exchange/libraries/TransferHelper.sol.
  // The library now re-throws the token's own error when it has one, so reaching
  // here means the token gave no reason at all.
  if (/reverted with the following reason:\s*TFF\b/.test(text) || /\bTFF\b/.test(text)) {
    return {
      title: "The exchange could not take that token",
      description:
        "The transfer was refused without a reason. Check that you hold the amount and have approved the exchange to move it — and if the market just gained liquidity, try again.",
    };
  }
  if (/reverted with the following reason:\s*TF\b/.test(text)) {
    return {
      title: "The exchange could not send that token",
      description: "A payout was refused without a reason. Please try again.",
    };
  }
  if (/reverted with the following reason:\s*AF\b/.test(text)) {
    return {
      title: "The approval failed",
      description: "This token refused the approval. It may be paused or restricted.",
    };
  }
  if (/reverted with the following reason:\s*ETF\b/.test(text)) {
    return {
      title: "The refund could not be sent",
      description:
        "The exchange could not return the native amount to your wallet. If your wallet is a contract, it must accept plain transfers.",
    };
  }

  if (/out of gas|gas required exceeds|intrinsic gas too low|exceeds block gas limit/i.test(text)) {
    return {
      title: "The order ran out of gas",
      description:
        "It was sent with too little gas to finish matching. This usually means liquidity arrived after the fee was worked out — try placing it again.",
    };
  }

  // viem's wording for a revert with empty data. Deliberately not asserted AS
  // out-of-gas: an unrecognised custom error looks identical from here, and
  // claiming a cause we have not established would be worse than describing
  // what the user can do.
  if (/reverted for an unknown reason|unknown error occurred while executing/i.test(text)) {
    return {
      title: "The exchange rejected the order",
      description:
        "It was turned down without a reason we can read — often too little gas to finish matching. Try again, and if it keeps happening please report it.",
    };
  }
  return null;
}

/** Every message in the cause chain, joined — viem nests the useful wording. */
function collectMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 10; depth++) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string") parts.push(message);
    const short = (current as { shortMessage?: unknown }).shortMessage;
    if (typeof short === "string") parts.push(short);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join("\n");
}

/** Walks the cause chain for viem's decoded `{ errorName, args }`. Exported because
 * `lib/errors/contractError` presents errors this table has no entry for, and it must
 * read the same decode rather than walking the chain a second, slightly different way. */
export function findDecodedContractError(error: unknown): DecodedContractError | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 10; depth++) {
    const data = (current as { data?: unknown }).data;
    const errorName = (data as { errorName?: unknown } | undefined)?.errorName;
    if (typeof errorName === "string") {
      const args = (data as { args?: unknown } | undefined)?.args;
      return { errorName, args: Array.isArray(args) ? args : [] };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Returns a friendly title/description for a known MatchingEngine revert
 * found anywhere in `error`'s cause chain, or null if none is recognized. */
export function decodeOrderSubmitError(error: unknown): DecodedOrderError | null {
  const decoded = findDecodedContractError(error);
  const known = decoded ? KNOWN_ERROR_MESSAGES[decoded.errorName] : undefined;
  if (known) return known;
  // Falls through to the undecodable cases rather than returning null, because
  // null is what makes a caller print `error.message` at the user.
  return describeUndecodableFailure(error);
}
