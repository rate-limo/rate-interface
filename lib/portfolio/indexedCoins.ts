import type { TokenBalance } from "./types";

/**
 * A launched coin's balance as the gateway folded it from the Transfer log.
 *
 * `GET /api/wallet/:address/coin-balances`. Exact rather than sampled — see
 * that route's docstring, and `processCoinTransfer` in the broker for why
 * replaying the log reconstructs the balance precisely.
 */
export interface IndexedCoinBalance {
  token: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  logoURI: string | null;
  balance: number;
  valueUSD: number;
  /** True only for a coin from the generator, whose Transfer log is complete. */
  launched: boolean;
}

/**
 * Fold indexed coin balances into a chain's RPC-read rows.
 *
 * ## The hazard this exists to prevent is double-counting
 *
 * Both sources can describe the same coin: the RPC read covers everything in
 * the token list, and the indexer covers everything launched here — and a
 * launched coin that also got listed is in both. Concatenating would show it
 * twice and count it twice in the total, which is worse than either source
 * alone. Identity is the contract ADDRESS, lowercased on both sides because
 * broker columns are checksummed and nothing guarantees the token list is.
 *
 * ## Both existing is now the EXCEPTION, and this is the guard for it
 *
 * `useBalances` drops a token from the RPC plan once the indexer covers it, so
 * in the settled state a covered launched coin has no RPC row at all — reading
 * it twice bought nothing and cost a multicall slot on a rate-limited endpoint.
 *
 * The dedupe still matters, because that state is not instantaneous. Coverage
 * arrives from a query, so for the render between "coin balances answered" and
 * "plan rebuilt without them" both rows exist. Without this the panel would
 * show the coin twice and count it twice for exactly that window — a flicker
 * that doubles someone's balance is worse than a slow one.
 *
 * When both do exist the RPC row wins, and not because it is more accurate:
 * both read the same truth. It wins because dropping the row the plan just
 * produced would make the list churn as coverage settles. The route merges
 * `adminTokenMeta` for the same reason — the two sources must agree about what
 * a token looks like, or which read served it becomes visible to the user.
 *
 * ## Only `launched` rows are added
 *
 * `tokenBalances` is only complete for coins whose factory source is
 * registered. A row without a creator reached that table some other way and its
 * log may be partial, and a partial balance is worse than an absent one: absent
 * shows nothing, partial shows a number that is wrong.
 */
export function foldIndexedCoins(
  rpcTokens: TokenBalance[],
  indexed: IndexedCoinBalance[],
  /** Addresses of the RPC rows, index-aligned with `rpcTokens`. */
  rpcAddresses: string[],
): TokenBalance[] {
  const seen = new Set(rpcAddresses.map((a) => a.toLowerCase()));

  const extra = indexed
    .filter((coin) => coin.launched)
    .filter((coin) => !seen.has(coin.token.toLowerCase()))
    // A wallet that sent everything away keeps a row at 0; that is history,
    // not a holding. The gateway already excludes them, and this is the
    // client-side half of the same rule.
    .filter((coin) => coin.balance > 0)
    .map<TokenBalance>((coin) => ({
      symbol: coin.symbol ?? "—",
      name: coin.name ?? coin.symbol ?? "Unknown coin",
      amount: formatAmount(coin.balance),
      usdValue: Number.isFinite(coin.valueUSD) ? coin.valueUSD : 0,
      logoURI: coin.logoURI ?? undefined,
    }));

  return [...rpcTokens, ...extra];
}

/**
 * The balance as text, matching what the RPC rows render.
 *
 * `balance` arrives decimal-scaled and double precision, so it is already in
 * whole units — no `formatUnits` here, and applying one would divide by
 * decimals a second time.
 */
function formatAmount(balance: number): string {
  if (!Number.isFinite(balance)) return "—";
  if (balance !== 0 && Math.abs(balance) < 0.000001) return "<0.000001";
  return balance.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
