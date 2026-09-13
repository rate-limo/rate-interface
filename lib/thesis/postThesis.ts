"use client";

/**
 * Publishing (and retracting) a thesis — the same nonce → sign → post
 * handshake as `lib/profile/deleteProfile.ts`, applied to `admin.theses`
 * instead of a profile row.
 *
 * ## The nonce carries the payload
 *
 * `POST /thesis/nonce` takes `{action: "post", tokenAddress, pair, tradeId,
 * body}` (or `{action: "retract", id}`) and returns a nonce plus the EXACT
 * message to sign, built server-side (`postMessage`/`retractMessage` in
 * apps/admin-service/src/theses.ts). The finalize call — `POST /thesis/post`
 * or `POST /thesis/retract` — sends only `{address, nonce, signature}`: the
 * text and the trade being posted about are fixed at nonce time, inside the
 * nonce record, and cannot be swapped afterwards by whatever the finalize
 * request claims. Never send `tokenAddress`/`pair`/`tradeId`/`body` a second
 * time at finalize — the server does not read them from that request at all.
 *
 * ## The author is recovered, never asserted
 *
 * Same as every other signed write in this app: the server recovers
 * `address` from the signature over the server-issued message, so the
 * `address` in the request body is only ever a claim the server checks
 * against that recovery, never trusted on its own.
 *
 * ## The server is the sole authority on eligibility
 *
 * `checkThesisEligibility` (apps/admin-service/src/theses.ts) reads the
 * trade's size, participants and token from its OWN `broker.spotTrades` row
 * and refuses with a specific, human-readable reason — below the $1,000
 * minimum, wrong token, not a participant, already posted. This module
 * passes that string through rather than flattening every non-2xx response
 * into a generic "failed", the same call `lib/referral/apply.ts` and
 * `lib/profile/deleteProfile.ts` make about their own servers' refusals.
 *
 * ## Wiring
 *
 * `/thesis/*` is a same-origin ROUTE HANDLER (`app/thesis/[action]/route.ts`)
 * that resolves the chain's own admin-service, and it still needs the
 * exclusion in `proxy.ts`'s matcher. Missing that is silent: the handler is
 * right, the service route is right, and the request still 404s, because
 * next-intl's i18n middleware claims the path first — the exact failure
 * `apps/web/CLAUDE.md` and `proxy.ts` document for `/logo`, `/token-logo` and
 * `/profile`.
 *
 * **It was a build-time rewrite at one `ADMIN_SERVICE_URL` until 2026-09-03,
 * and that was worse than misleading here than anywhere else.** The
 * verification above reads `broker.spotTrades` on ONE chain. Pointed at the
 * wrong one it does not merely answer oddly — it inverts, refusing every
 * genuine thesis because the trade lives in another database. A rewrite could
 * not carry the chain: Next resolves them at build time.
 *
 * So every call takes a `chainSlug` and there is NO default. Defaulting would
 * restore the bug for any caller that forgot, with a 200 at every hop.
 * Endpoint paths stay isolated in the constants below so this file is the one
 * place to reconcile them against `apps/admin-service/src/main.ts`.
 */

const NONCE_PATH = "/thesis/nonce";
const POST_PATH = "/thesis/post";
const RETRACT_PATH = "/thesis/retract";

/** The handler routes on `?chain=`; see the module note on why it is required. */
const on = (path: string, chainSlug: string): string =>
  `${path}?chain=${encodeURIComponent(chainSlug)}`;

export type PostThesisOutcome =
  | { ok: true; id: number }
  /** The user dismissed the wallet prompt. Nothing was attempted, nothing was posted. */
  | { ok: false; declined: true; message: string }
  | { ok: false; declined: false; message: string };

export type RetractThesisOutcome =
  | { ok: true; existed: boolean }
  | { ok: false; declined: true; message: string }
  | { ok: false; declined: false; message: string };

export interface SignMessage {
  (args: { message: string }): Promise<string>;
}

/** A rejected signature is a decision, not a fault. Reporting it as an error hides
 * the retry and blames the user for choosing not to proceed. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

export interface PostThesisArgs {
  /** URL slug of the chain the TRADE is on — routes the call to that chain's
   * admin-service, whose `broker.spotTrades` is what authorizes the write. */
  chainSlug: string;
  tokenAddress: string;
  /** The pair contract address the trade happened on. */
  pair: string;
  /** `spotTrades.tradeId`, as a decimal string. */
  tradeId: string;
  body: string;
  address: string;
}

export async function postThesis(
  args: PostThesisArgs,
  signMessageAsync: SignMessage,
): Promise<PostThesisOutcome> {
  try {
    const nonceRes = await fetch(on(NONCE_PATH, args.chainSlug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "post",
        tokenAddress: args.tokenAddress,
        pair: args.pair,
        tradeId: args.tradeId,
        body: args.body,
      }),
    });
    const issued = (await nonceRes.json().catch(() => null)) as
      | { nonce?: string; message?: string; error?: string }
      | null;
    if (!nonceRes.ok || !issued?.nonce || !issued.message) {
      return { ok: false, declined: false, message: issued?.error ?? "Couldn't start that. Try again." };
    }

    // The server writes the message text, and the wallet prompt shows the
    // trader exactly what they are about to publish — the body and the trade
    // it's anchored to, verbatim.
    const signature = await signMessageAsync({ message: issued.message });

    const res = await fetch(on(POST_PATH, args.chainSlug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: args.address, nonce: issued.nonce, signature }),
    });
    const body = (await res.json().catch(() => null)) as { id?: number; error?: string } | null;
    if (!res.ok || typeof body?.id !== "number") {
      // The server's refusals are written for a human to read (below the
      // threshold, wrong token, not a participant, already posted) — pass
      // them through rather than flattening them into one generic failure.
      return { ok: false, declined: false, message: body?.error ?? "Couldn't post that. Try again." };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    return isRejection(err)
      ? { ok: false, declined: true, message: "You didn't sign, so nothing was posted." }
      : { ok: false, declined: false, message: "Couldn't reach the service. Try again." };
  }
}

export interface RetractThesisArgs {
  id: number;
  address: string;
  /** Same rule as posting: the thesis lives in one chain's database. */
  chainSlug: string;
}

export async function retractThesis(
  args: RetractThesisArgs,
  signMessageAsync: SignMessage,
): Promise<RetractThesisOutcome> {
  try {
    const nonceRes = await fetch(on(NONCE_PATH, args.chainSlug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "retract", id: args.id }),
    });
    const issued = (await nonceRes.json().catch(() => null)) as
      | { nonce?: string; message?: string; error?: string }
      | null;
    if (!nonceRes.ok || !issued?.nonce || !issued.message) {
      return { ok: false, declined: false, message: issued?.error ?? "Couldn't start that. Try again." };
    }

    const signature = await signMessageAsync({ message: issued.message });

    const res = await fetch(on(RETRACT_PATH, args.chainSlug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: args.address, nonce: issued.nonce, signature }),
    });
    const body = (await res.json().catch(() => null)) as { existed?: boolean; error?: string } | null;
    if (!res.ok) {
      return { ok: false, declined: false, message: body?.error ?? "Couldn't retract that. Try again." };
    }
    // `existed` lets the caller tell the truth about what just changed, same
    // as `/profile/delete`'s flag.
    return { ok: true, existed: body?.existed ?? true };
  } catch (err) {
    return isRejection(err)
      ? { ok: false, declined: true, message: "You didn't sign, so nothing was retracted." }
      : { ok: false, declined: false, message: "Couldn't reach the service. Try again." };
  }
}
