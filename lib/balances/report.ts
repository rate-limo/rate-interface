/**
 * Reporting and reading a wallet's total USD balance.
 *
 * ## It talks to admin-service now, not to Strapi
 *
 * The write lived in `mutations/server/balance.ts` as a `"use server"` action
 * that called the CMS with a hardcoded API token, and carried its own
 * bookkeeping to make that work: resolve a `networks` row, find-or-create a
 * `traders` row, page the last `usd-balances` entry, refuse if under an hour
 * old, delete rows past twenty-four, then compute and store PnL. Six round
 * trips to a third party, with a credential in the source.
 *
 * `broker.accountBalanceDayBuckets` has `(account, index)` as its primary key,
 * so one upsert replaces all of it — the day bucket IS the throttle and IS the
 * prune. The rules live in `apps/admin-service/src/balances.ts`, beside the
 * table, and are unit-tested there rather than here.
 *
 * **The read is here for the same reason the write is.** Moving only the write
 * would leave the portfolio panel reading a Strapi table that had stopped
 * receiving rows — it would keep rendering the last figure written before the
 * cutover, getting quietly staler, with nothing broken enough to notice.
 *
 * ## Same-origin, like the graduate POST and the logo upload
 *
 * Both paths go to `/usd-balance`, which `next.config.ts` rewrites to
 * ADMIN_SERVICE_URL. That keeps the browser off a cross-origin request and the
 * service host out of the client bundle. `proxy.ts`'s matcher must exclude it
 * too, or i18n prefixes the path and it 404s while everything looks correct —
 * the documented failure mode for `/logo` and `/token-logo`.
 *
 * Plain client fetches rather than server actions because that is what every
 * other admin-service call in this app is: nothing here reads ADMIN_SERVICE_URL
 * at runtime, the rewrite is the seam.
 *
 * ## The server cannot check the write
 *
 * The figure comes from a multicall the browser makes itself, so the address
 * and the balance are both assertions — unlike `/graduate`, admin-service has
 * nothing to re-derive them from. What comes back is therefore what that wallet
 * claimed, which is fine for showing someone their own number and is not a
 * basis for anything that pays out. See the route's own note.
 */

export type RecordBalanceResult =
  | { ok: true; index: number }
  | { ok: false; error: string }
  /** The wallet declined. A decision, not a failure — see `rejected` below. */
  | { ok: false; rejected: true };

/** A rejected signature is a decision, not an error — callers must not report it
 * as one. Mirrors `lib/portfolio/profile.ts`'s `isSignatureRejection` and
 * `lib/referral/apply.ts`'s. */
function isRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

/**
 * Records the wallet's portfolio value for today. **Signed, and therefore no
 * longer fire-and-forget.**
 *
 * ## Why this asks for a signature now
 *
 * The route used to accept an address and a number from anyone, which was fine
 * while nothing read the table. `apps/gateway`'s
 * `/account/:address/balance-history` now reads it and a public profile renders
 * it, so unsigned, the portfolio value shown on any wallet's profile was
 * whatever the last caller posted about them. The handshake makes the figure
 * attributable: still self-reported, but self-reported BY that wallet.
 *
 * ## The consequence for callers
 *
 * A signature means a wallet prompt, so this can no longer hang off every
 * balance refresh — `useTokenlistBalances` used to call it on each one, which
 * under this change would throw a modal at the user several times a minute.
 * It is now an explicit action a caller takes deliberately, at most once per
 * day (the bucket is daily; a second write the same day only replaces it).
 *
 * A declined signature returns `{ ok: false, rejected: true }` rather than an
 * error string, so a caller can stay silent instead of reporting the user's own
 * choice as a failure.
 */
export async function reportUsdBalance({
  address,
  balanceUsd,
  totalTokens,
  signMessageAsync,
}: {
  address: string;
  /** Total portfolio value in USD, as the browser's multicall computed it. */
  balanceUsd: number;
  /** How many token balances went into that figure. */
  totalTokens?: number;
  /** Straight from wagmi's `useSignMessage`, like every other signing path in
   * this app — `lib/wallet` is the CONNECT seam, not the signing one. */
  signMessageAsync: (args: { message: string }) => Promise<string>;
}): Promise<RecordBalanceResult> {
  try {
    // Step 1: the server validates the figures and returns the exact message to
    // sign. Validating here first would duplicate rules that live in
    // `balances.ts`, and the message must be the server's own string anyway or
    // verification fails for reasons nobody can see.
    const nonceRes = await fetch("/usd-balance/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, balanceUsd, totalTokens }),
      cache: "no-store",
    });
    if (!nonceRes.ok) {
      const detail = await nonceRes.text().catch(() => "");
      return { ok: false, error: `${nonceRes.status} ${detail}`.trim() };
    }
    const { nonce, message } = (await nonceRes.json()) as { nonce: string; message: string };

    const signature = await signMessageAsync({ message });

    // Step 2: the figures are NOT resent. The server rebuilds them from the
    // nonce record, which is what stops a different number being written than
    // the one that was signed.
    const res = await fetch("/usd-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce, signature }),
      // A write, and one whose whole point is freshness.
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${detail}`.trim() };
    }

    const body = (await res.json()) as { index?: number };
    return { ok: true, index: body.index ?? -1 };
  } catch (error) {
    if (isRejection(error)) return { ok: false, rejected: true };
    // Never throws: a balance panel must not break because a snapshot did not
    // record.
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

export interface BalanceSnapshot {
  /** Latest recorded value. **Null means never recorded** — render a dash, not a zero. */
  balanceUsd: number | null;
  totalTokens: number;
  /** UTC day ordinal the value was recorded on. */
  index: number | null;
  /** Change against the previous RECORDED day, not against yesterday. */
  pnl: { usd: number; percentage: number } | null;
  /** Which day the change is measured from, so the UI can say so honestly. */
  sinceIndex: number | null;
}

export const EMPTY_SNAPSHOT: BalanceSnapshot = {
  balanceUsd: null,
  totalTokens: 0,
  index: null,
  pnl: null,
  sinceIndex: null,
};

export async function fetchUsdBalance(address: string): Promise<BalanceSnapshot> {
  const res = await fetch(`/usd-balance/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!res.ok) {
    // A wallet with no history and an unreachable service must not render as
    // "$0.00" — both are "we do not know", and the null says so.
    return EMPTY_SNAPSHOT;
  }
  return (await res.json()) as BalanceSnapshot;
}
