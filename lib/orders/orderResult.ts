/**
 * What an order transaction actually DID, read from its receipt.
 *
 * ## Why `receipt.status` is not the answer
 *
 * A mined, successful order transaction can mean four different things: it
 * filled; it filled part and rested or refunded the rest; it filled nothing and
 * rested at a price; or it filled nothing and handed everything back. The ticket
 * used to say "Market order confirmed — fills will appear as the exchange matches
 * it" for all four. Measured on RISE: a market buy sent under the engine's gas
 * reserve skipped matching (`MatchingHaltedForGas`, matched=0), RESTED as a bid,
 * and was announced as a confirmed market order. Nothing ever "appeared".
 *
 * So the receipt's logs are decoded — only those emitted by the MatchingEngine
 * (or LadderBuyer, for a ladder route) and only those concerning the account the
 * order was sent for — and the toast says which of those outcomes happened.
 *
 * ## The events, and whose they are
 *
 * - `OrderMatched` — one per resting order consumed. `orderMatch.sender` is the
 *   TAKER (the order's recipient), `isBid` is the taker's side, `price` the level
 *   (1e8 scale), and `baseAmount`/`quoteAmount` the two legs (Orderbook.execute).
 * - `OrderPlaced` — the remainder RESTED; `owner` is the recipient, `placed` is
 *   the amount left on the book in the token given, at `price`.
 * - `MatchingHaltedForGas` — the loop stopped because `gasleft()` fell under the
 *   reserve. Indexed by pair only; within one transaction it is this order's.
 * - `RemainderRoutedToPool(pair, recipient, spent, received)` — a taker's
 *   remainder that the pool took.
 * - ERC-20 `Transfer(engine|ladderBuyer -> recipient)` of the SPENT token — the
 *   part handed back.
 *
 * ## No evidence is not "not filled"
 *
 * A receipt with nothing from the engine (a stale address, a contract this
 * decoder does not know) decodes as `unknown`, and the toast says the result
 * could not be read. A false "Not filled" is worse than a vague confirmation.
 */
import { decodeEventLog, erc20Abi, type Abi } from "viem";
import { MatchingEngineABI } from "@iter/abis";
import { formatPrice } from "@/lib/format/price";

export type Address = `0x${string}`;

export interface ReceiptLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

export interface OrderResultInput {
  logs: readonly ReceiptLog[];
  /** The MatchingEngine that emits the order events. */
  engine: Address;
  /** LadderBuyer when the order was routed through it: it is then the engine's taker. */
  via?: Address;
  /** The `recipient` the order was SENT with — the owner of every leg below. */
  account: Address;
  /** The ERC-20 the order spends (WETH, not the native sentinel, on a native leg). */
  spendToken: Address;
  isBid: boolean;
}

export interface OrderResult {
  /** No log from the engine (or via) at all — the outcome cannot be read. */
  readable: boolean;
  fills: number;
  /** Base bought or sold on the BOOK (gross of the taker fee). */
  bookBase: bigint;
  /** Quote paid or received on the BOOK. */
  bookQuote: bigint;
  /** The taker fee on the leg the account RECEIVED (base on a buy, quote on a sell). */
  bookFee: bigint;
  /** Size-weighted mean of the matched levels, 1e8 scale; 0 with no fills. */
  avgPrice1e8: bigint;
  pool?: { spent: bigint; received: bigint };
  rested?: { placed: bigint; price1e8: bigint };
  /** Spent token handed back to the account. */
  refunded: bigint;
  haltedForGas: boolean;
}

const ENGINE_ABI = MatchingEngineABI as unknown as Abi;

const lc = (a: string | undefined) => (a ?? "").toLowerCase();

/** Pure: decode an order receipt's logs into what happened to this account's order. */
export function decodeOrderResult(input: OrderResultInput): OrderResult {
  const engine = lc(input.engine);
  const via = input.via ? lc(input.via) : undefined;
  const actors = new Set([lc(input.account), ...(via ? [via] : [])]);
  const sources = new Set([engine, ...(via ? [via] : [])]);
  const account = lc(input.account);
  const spend = lc(input.spendToken);

  const out: OrderResult = {
    readable: false,
    fills: 0,
    bookBase: BigInt(0),
    bookQuote: BigInt(0),
    bookFee: BigInt(0),
    avgPrice1e8: BigInt(0),
    refunded: BigInt(0),
    haltedForGas: false,
  };
  let weighted = BigInt(0);

  for (const log of input.logs) {
    const from = lc(log.address);
    if (sources.has(from)) out.readable = true;

    if (from === engine) {
      let ev: { eventName?: string; args?: unknown };
      try {
        ev = decodeEventLog({
          abi: ENGINE_ABI,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          data: log.data as `0x${string}`,
        }) as { eventName?: string; args?: unknown };
      } catch {
        continue;
      }
      const a = ev.args as Record<string, unknown>;
      switch (ev.eventName) {
        case "OrderMatched": {
          const m = a.orderMatch as {
            sender: string; baseAmount: bigint; quoteAmount: bigint; baseFee: bigint; quoteFee: bigint;
          };
          if (!actors.has(lc(m.sender))) break;
          out.fills += 1;
          out.bookBase += m.baseAmount;
          out.bookQuote += m.quoteAmount;
          // Orderbook.execute charges the taker on the leg it receives.
          out.bookFee += input.isBid ? m.baseFee : m.quoteFee;
          weighted += (a.price as bigint) * m.baseAmount;
          break;
        }
        case "OrderPlaced":
          if (!actors.has(lc(a.owner as string))) break;
          // One order rests at most once; keep the last if the engine ever emits more.
          out.rested = { placed: a.placed as bigint, price1e8: a.price as bigint };
          break;
        case "MatchingHaltedForGas":
          out.haltedForGas = true;
          break;
        case "RemainderRoutedToPool":
          if (!actors.has(lc(a.recipient as string))) break;
          out.pool = {
            spent: (out.pool?.spent ?? BigInt(0)) + (a.spent as bigint),
            received: (out.pool?.received ?? BigInt(0)) + (a.received as bigint),
          };
          break;
      }
      continue;
    }

    // A refund: the spent token, from the engine or the router, to the account.
    if (from === spend && log.topics.length === 3) {
      try {
        const ev = decodeEventLog({
          abi: erc20Abi,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          data: log.data as `0x${string}`,
        });
        if (ev.eventName !== "Transfer") continue;
        const { from: f, to, value } = ev.args as { from: string; to: string; value: bigint };
        if (sources.has(lc(f)) && lc(to) === account) {
          out.refunded += value;
          // A taker order that met nothing in range and a pool that declined
          // emits NO engine event at all — the refund Transfer is the only
          // evidence, and it is conclusive.
          out.readable = true;
        }
      } catch {
        // not a Transfer
      }
    }
  }

  if (out.bookBase > BigInt(0)) out.avgPrice1e8 = weighted / out.bookBase;
  return out;
}

export type ResultTone = "success" | "info" | "warning";

export interface OrderResultCopy {
  tone: ResultTone;
  title: string;
  description: string;
}

function amount(v: bigint, decimals: number): string {
  // Through Number for the significant-figure formatter; display only.
  const n = Number(v) / 10 ** decimals;
  return formatPrice(n);
}

function price(p1e8: bigint): string {
  return formatPrice(Number(p1e8) / 1e8);
}

/**
 * The toast for a decoded result.
 *
 * A MARKET order that rests, refunds everything, or halts for gas is a WARNING,
 * never success: the trader asked to trade now and did not. A LIMIT order resting
 * is the ordinary case and reads as information.
 */
export function describeOrderResult(
  r: OrderResult,
  meta: { kind: "limit" | "market"; isBid: boolean; base: TokenMeta; quote: TokenMeta },
): OrderResultCopy {
  const { kind, isBid, base, quote } = meta;
  const label = kind === "limit" ? "Limit order" : "Market order";
  const spendMeta = isBid ? quote : base;

  if (!r.readable) {
    return {
      tone: "info",
      title: `${label} confirmed`,
      description: "The transaction succeeded, but its result could not be read here. Check Open orders and Trade history.",
    };
  }

  const gotPool = r.pool?.received ?? BigInt(0);
  const gotMeta = isBid ? base : quote;
  const verb = isBid ? "Bought" : "Sold";

  const parts: string[] = [];
  if (r.fills > 0) {
    // A buy reports what reached the wallet (net of the taker fee); a sell
    // reports what left it, and the quote received net of the fee.
    parts.push(
      isBid
        ? `${verb} ${amount(r.bookBase - r.bookFee, base.decimals)} ${base.symbol} at avg ${price(r.avgPrice1e8)} ${quote.symbol}`
        : `${verb} ${amount(r.bookBase, base.decimals)} ${base.symbol} at avg ${price(r.avgPrice1e8)} ${quote.symbol} for ${amount(r.bookQuote - r.bookFee, quote.decimals)} ${quote.symbol}`,
    );
  }
  if (gotPool > BigInt(0)) {
    parts.push(`received ${amount(gotPool, gotMeta.decimals)} ${gotMeta.symbol} via the pool`);
  }
  const rest: string[] = [];
  if (r.rested && r.rested.placed > BigInt(0)) {
    rest.push(`${amount(r.rested.placed, spendMeta.decimals)} ${spendMeta.symbol} resting at ${price(r.rested.price1e8)}`);
  }
  if (r.refunded > BigInt(0)) {
    rest.push(`${amount(r.refunded, spendMeta.decimals)} ${spendMeta.symbol} refunded`);
  }
  const gas = r.haltedForGas
    ? "Matching stopped early: the transaction ran short of gas for the next fill."
    : "";
  const join = (...xs: string[]) => xs.filter(Boolean).join(". ") + (xs.some(Boolean) ? "." : "");

  const filled = r.fills > 0 || gotPool > BigInt(0);
  const hasRest = rest.length > 0;

  if (r.haltedForGas) {
    return {
      tone: "warning",
      title: filled ? `${label} stopped early (gas) — partly filled` : `${label} stopped early (gas) — not filled`,
      description: join(parts.join(", "), hasRest ? `Rest: ${rest.join(", ")}` : "", gas),
    };
  }

  if (filled && !hasRest) {
    const viaPoolOnly = r.fills === 0 && gotPool > BigInt(0);
    return {
      tone: "success",
      title: viaPoolOnly ? `${label} filled via the pool` : `${label} filled`,
      description: join(parts.join(", ")),
    };
  }

  if (filled && hasRest) {
    const restingLimit = kind === "limit" && !!r.rested && r.refunded === BigInt(0);
    return {
      tone: restingLimit ? "info" : "warning",
      title: `${label} partly filled`,
      description: join(parts.join(", "), `Rest: ${rest.join(", ")}`),
    };
  }

  // Nothing filled.
  if (r.rested && r.rested.placed > BigInt(0)) {
    return {
      tone: kind === "limit" ? "info" : "warning",
      title: kind === "limit"
        ? `Limit order resting at ${price(r.rested.price1e8)}`
        : `Market order not filled — resting at ${price(r.rested.price1e8)}`,
      description: join(rest.join(", "), kind === "market" ? "Cancel it from Open orders if you no longer want it" : ""),
    };
  }
  if (r.refunded > BigInt(0)) {
    return {
      tone: "warning",
      title: `${label} not filled — refunded`,
      description: join(
        `Nothing could fill within your slippage limit, so ${amount(r.refunded, spendMeta.decimals)} ${spendMeta.symbol} was returned`,
      ),
    };
  }
  return {
    tone: "warning",
    title: `${label} not filled`,
    description: "The transaction succeeded but no fill, resting order or refund was found for your account.",
  };
}

/**
 * What to add back to the optimistic balance the click computed: anything the
 * order did not end up spending. Rested funds ARE spent (they sit in the book).
 */
export function unspent(r: OrderResult): bigint {
  return r.refunded;
}
