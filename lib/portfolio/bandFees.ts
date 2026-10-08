import { getTokenByAddress } from "@/queries/server/tokens";
import type { LpToken } from "@/lib/liquidity/positions";
import { lifetimeFeesUsd, vestedFeesUsd } from "./lpFees";

/**
 * Lifetime fees per LP TOKEN, in USD: collected (the broker's ledger, from `Collect`
 * events) plus claimable now (owed + every band's vested part, from the chain).
 *
 * The two are disjoint -- collecting moves fees from the second to the first -- so the
 * sum does not fall when an LP collects. Fees still VESTING are not counted: they are
 * not the LP's until they vest, and a withdrawal forfeits its share of them.
 *
 * Every leg degrades to null rather than zero. A token the chain did not answer for
 * (`live: false`) is null, whatever the ledger says -- a real $0 collected plus an
 * unknown claimable would print `$0.00` on a position that has earned fees.
 */
export async function lpFeesUsdByToken(
  networkName: string,
  tokens: LpToken[],
  poolPriceByPair: Map<string, number | null>,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const open = tokens.filter((t) => t.active);
  if (open.length === 0) return out;
  const quotePrice = await quotePrices(networkName, open.map((t) => t.quote));
  for (const t of open) {
    if (!t.live) {
      out.set(t.tokenId, null);
      continue;
    }
    const claimableUsd = vestedFeesUsd(
      { vestedBase: t.claimableBase, vestedQuote: t.claimableQuote },
      t.baseDecimals,
      t.quoteDecimals,
      poolPriceByPair.get(`${t.baseSymbol}/${t.quoteSymbol}`) ?? null,
      quotePrice.get(t.quote.toLowerCase()) ?? null,
    );
    out.set(t.tokenId, lifetimeFeesUsd(t.feesUSD, claimableUsd));
  }
  return out;
}

/** USD per quote token, one request per distinct quote -- usually exactly one. */
async function quotePrices(networkName: string, quotes: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  await Promise.all(
    [...new Set(quotes.filter(Boolean))].map(async (address) => {
      try {
        const token = (await getTokenByAddress(networkName, address)) as Record<string, unknown>;
        const price = token?.priceUSD;
        // A non-positive price is the indexer saying it has none, not a worthless token.
        if (typeof price === "number" && Number.isFinite(price) && price > 0) {
          prices.set(address.toLowerCase(), price);
        }
      } catch (error) {
        console.warn(`lpFeesUsdByToken: no price for quote ${address}`, error);
      }
    }),
  );
  return prices;
}
