"use client";

import { useEffect, useState } from "react";
import { PonderLinks } from "@/consts";
import type { SwapToken } from "@/lib/swap/types";

/**
 * The gateway's verdict on a conditional order, before a wallet prompt is spent.
 *
 * ## Why ask a server about an order the client could half-check itself
 *
 * The card can already tell a nonzero amount from a zero one. What it cannot know
 * is whether the pair has an order book at all, whether that book is open for
 * trading yet (`listingDate` is compared against block time, so a market can
 * exist and still refuse), or what the current price is well enough to say
 * whether the order rests or crosses. Those are the refusals a user cannot infer
 * from anything on screen, and the expensive way to discover one is a signature
 * that reverts.
 *
 * ## A refusal is a 200
 *
 * `ok:false` is a successful response carrying a verdict, not an HTTP error —
 * the same shape `/swap/route` uses for `available:false`, and for the reason
 * recorded there: the card used to flatten every non-2xx into "Quote
 * unavailable", which named nothing. Only a malformed REQUEST is a 4xx here, and
 * that is a bug in this hook rather than a state the UI should render.
 *
 * ## The calldata is checked, not trusted
 *
 * `execution.data` arrives without a `to`, deliberately — the client owns the
 * engine address, so the most damaging thing a wrong server could do (redirect a
 * signed transaction) is not on the table. Callers that use `data` should still
 * verify it decodes to `execution.args`; the safest use is to encode from `args`
 * locally and treat `data` as a cross-check.
 */

export type OrderPreviewCode =
  | "ok"
  | "no-market"
  | "not-listed"
  | "zero-amount"
  | "zero-price"
  | "unfillable-band"
  | "multi-hop";

export interface OrderPreview {
  ok: boolean;
  code: OrderPreviewCode;
  reason?: string;
  outcome?: "rests" | "crosses";
  market?: { symbol: string | null; price: number | null; verified: boolean };
  execution?: {
    functionName: string;
    args: unknown;
    data: string | null;
    value: string;
  };
}

export interface OrderPreviewState {
  preview: OrderPreview | null;
  /** True while a request is in flight — the CTA should wait rather than lie. */
  checking: boolean;
  /** The gateway could not be reached. Distinct from a refusal, and treated as such. */
  unreachable: boolean;
}

const IDLE: OrderPreviewState = { preview: null, checking: false, unreachable: false };

export function useOrderPreview(input: {
  networkName: string;
  pay: SwapToken;
  get: SwapToken | null;
  kind: "limit" | "stop";
  side: "buy" | "sell";
  /** Limit price, or the TRIGGER when kind is "stop". */
  price: number;
  /** Post-trigger bound. Only read when kind is "stop". */
  limitPrice?: number;
  amount: number;
  recipient?: string;
  /** Skip entirely — a multi-hop route has no single book to place on. */
  disabled?: boolean;
}): OrderPreviewState {
  const { networkName, pay, get, kind, side, price, limitPrice, amount, recipient, disabled } = input;
  const [state, setState] = useState<OrderPreviewState>(IDLE);

  const base = pay.address;
  const quote = get?.address ?? "";

  useEffect(() => {
    // Same-origin proxy, not the gateway host: a browser call straight to the
    // gateway is refused by CORS, and this hook reports a failed fetch as
    // `unreachable` — which would tell every local developer the exchange is
    // down. See the note in `useSwapDepth`.
    const host = PonderLinks[networkName] ? `/api/gateway` : "";
    if (disabled || !host || !base || !quote) {
      setState(IDLE);
      return;
    }

    let disposed = false;
    // Debounced: this fires on every keystroke in a price field, and a verdict
    // that lands after the user has typed three more characters is worse than
    // no verdict — it describes an order they are no longer placing.
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, checking: true }));
      const qs = new URLSearchParams({
        base,
        quote,
        side,
        kind,
        price: String(price),
        amount: String(amount),
      });
      if (kind === "stop" && limitPrice != null) qs.set("limitPrice", String(limitPrice));
      if (recipient) qs.set("recipient", recipient);

      qs.set("network", networkName);
      void fetch(`${host}/order/preview?${qs.toString()}`)
        .then(async (r) => {
          // A 4xx here means THIS HOOK sent something malformed. It is not a
          // verdict and must not be rendered as one — an order the exchange
          // would decline and a request we built wrong are different problems.
          if (!r.ok) throw new Error(`preview request rejected: ${r.status}`);
          return (await r.json()) as OrderPreview;
        })
        .then((preview) => {
          if (!disposed) setState({ preview, checking: false, unreachable: false });
        })
        .catch(() => {
          // Unreachable is NOT a refusal. Rendering it as one would tell a user
          // their order is invalid because our gateway is down, which is both
          // false and the kind of message that stops someone trading.
          if (!disposed) setState({ preview: null, checking: false, unreachable: true });
        });
    }, 250);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [networkName, base, quote, kind, side, price, limitPrice, amount, recipient, disabled]);

  return state;
}
