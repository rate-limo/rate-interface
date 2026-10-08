import { gatewayFetch } from "@/lib/realtime/watermark";
import { PonderLinks } from "@/consts";
import { useQuery } from "@tanstack/react-query";

/**
 * 1D price series per token, for the chart column on Explore's token table.
 *
 * The token row itself declares `sparkline7D`, but the gateway does not send it
 * — the field is in the zod schema and absent from every live payload — so the
 * series has to come from `/api/token/sparklines/:address`, which returns
 * `{ sparkline1H, sparkline1D, ... }` as `{ time, price }[]`.
 *
 * That is one request per token, so it is deliberately a SEPARATE query from
 * the table's own: the table paints immediately with prices and changes, and
 * the charts fill in when they arrive. A row whose series fails or is empty
 * renders nothing rather than a flat line, which would claim a price that held
 * steady all day.
 *
 * ## Each token is fetched from ITS OWN chain
 *
 * This took one `networkName` for the whole page and resolved every address
 * against that single gateway. Explore has been cross-chain since the aggregator
 * took over its lists, so the argument was the DISPLAYED chain — and every token
 * from any other chain was requested from a gateway that has never heard of it.
 * Those answered 404, the catch below turned each into `[]`, and the column
 * rendered a dash for the whole page. Nothing errored; the chart column was
 * simply always empty.
 *
 * So the caller passes each token's own chain, and identity here is
 * `(chain, address)` — the same key the aggregator merges on, and for the reason
 * its docstring gives: the same symbol, and potentially the same address, on two
 * chains is two different markets. Keying the map on the address alone would let
 * one chain's series render under another chain's row.
 */
export function sparklineKey(chain: string, address: string): string {
  return `${chain}|${address.toLowerCase()}`;
}

export function useTokenSparklines(tokens: readonly { id: string; chain: string }[]) {
  // Sorted, so a re-render that reorders the table does not mint a new key and
  // refetch every series.
  const key = tokens
    .map((token) => sparklineKey(token.chain, token.id))
    .sort()
    .join(",");

  const { data } = useQuery({
    queryKey: ["token-sparklines", key],
    // A token whose chain has no gateway is dropped rather than blocking the
    // query: on a cross-chain page one unknown chain must not cost every other
    // chain its charts.
    enabled: tokens.some((token) => Boolean(PonderLinks[token.chain])),
    staleTime: 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        tokens.map(async (token): Promise<[string, number[]]> => {
          const mapKey = sparklineKey(token.chain, token.id);
          const base = PonderLinks[token.chain];
          if (!base) return [mapKey, []];
          try {
            const response = await gatewayFetch(`${base}/api/token/sparklines/${token.id}`);
            if (!response.ok) return [mapKey, []];
            const body = await response.json();
            const series = Array.isArray(body?.sparkline1D) ? body.sparkline1D : [];
            const prices = series
              .map((point: { price?: number }) => Number(point?.price))
              .filter((price: number) => Number.isFinite(price));
            return [mapKey, prices];
          } catch {
            // One token's series failing must not blank the whole column.
            return [mapKey, []];
          }
        }),
      );
      return new Map<string, number[]>(entries);
    },
  });

  return data ?? new Map<string, number[]>();
}
