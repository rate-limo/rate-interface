"use server";
import { PonderLinks } from '@/consts';

export interface CreatorTokenPage {
  tokens: Record<string, unknown>[];
  totalCount: number;
  totalPages: number;
  pageSize: number;
}

/** Coins attributed to a wallet by the indexed CoinGenerator.Launched event. */
export async function getCreatorTokens(
  networkName: string,
  address: string,
  pageSize: number,
  page: number,
): Promise<CreatorTokenPage> {
  const url = `${PonderLinks[networkName]}/api/tokens/creator/${address}/${pageSize}/${page}`;
  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(`getCreatorTokens: ${response.status} from ${url}`);
      return { tokens: [], totalCount: 0, totalPages: 0, pageSize };
    }
    const data = await response.json() as Partial<CreatorTokenPage>;
    return {
      tokens: Array.isArray(data.tokens) ? data.tokens : [],
      totalCount: typeof data.totalCount === "number" ? Math.max(0, data.totalCount) : 0,
      totalPages: typeof data.totalPages === "number" ? data.totalPages : 0,
      pageSize,
    };
  } catch (error) {
    console.warn(`getCreatorTokens: request failed for ${url}`, error);
    return { tokens: [], totalCount: 0, totalPages: 0, pageSize };
  }
}

export async function getTokenBySymbol(networkName: string, symbol: string) {
  const ponderLink = PonderLinks[networkName];
  const res = await fetch(`${ponderLink}/api/token/symbol/${symbol}`);
  /*
   * THROW on a miss, like `getTokenByAddress` beside it.
   *
   * This returned whatever came back. The gateway answers a miss with
   * `{"error":"Token not found"}` and a 404, so an unknown symbol resolved to
   * that object AS THE TOKEN — no `symbol`, no `id` — and the page rendered a
   * profile of it. The crashes surfaced four frames away and named neither the
   * token nor the lookup: `tokenColor` on `symbol.length`, and the live-stats
   * query key on `address.toLowerCase()`.
   *
   * It matters more after a redeploy than before: every pre-redeploy token URL
   * becomes an unknown symbol at once.
   */
  if (!res.ok) throw new Error(`Token not found: ${symbol}`);
  return res.json();
}

export async function getTokenByAddress(networkName: string, address: string) {
  const ponderLink = PonderLinks[networkName];
  const res = await fetch(`${ponderLink}/api/token/address/${address}`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Token not found: ${address}`);
  return res.json();
}

export async function getTokens(
  networkName: string,
  pageSize: number,
  page: number,
  options: string,
  /**
   * `"all"` drops the LISTING GATE, and only a caller that is not a ranking may
   * pass it.
   *
   * `/api/tokens/*` serves verified markets only, which is right for every
   * ranked table on the venue and wrong for a question about reachability. The
   * deposit page is the second kind: "what can I put into this wallet" is the
   * same shape as `/api/search`, which `routeCoverage.test.ts` pins as ungated
   * for exactly this reason.
   *
   * Measured on a freshly redeployed Arc: nine tokens exist, every one of them
   * `verified: false` because nothing has graduated yet — so the gated list
   * answered zero and the deposit page offered NOTHING, including USDC, the
   * venue's own quote asset. A deposit screen that cannot name the asset it
   * settles in reads as a venue that accepts nothing.
   *
   * It stays opt-in rather than becoming the default: the rankings are the
   * majority of callers and the gate is correct for all of them.
   */
  source?: "all",
) {
  let url;
  if (options === '') {
    url = `${PonderLinks[networkName]}/api/tokens/${pageSize}/${page}`;
  } else if (options === 'top-gainer') {
    url = `${PonderLinks[networkName]}/api/tokens/top-gainer/${pageSize}/${page}`;
  } else if (options === 'top-loser') {
    url = `${PonderLinks[networkName]}/api/tokens/top-loser/${pageSize}/${page}`;
  } else if (options === 'new') {
    url = `${PonderLinks[networkName]}/api/tokens/new/${pageSize}/${page}`;
  }
  const response = await fetch(source ? `${url}?source=${source}` : (url as string));
  // Same reasoning as getPairs: an error body carries no `tokens` key, and
  // parsing it anyway turns a failed request into a plausible-looking object.
  if (!response.ok) {
    console.warn(`getTokens: ${response.status} from ${url}`);
    return { tokens: [], totalCount: 0, totalPages: 0, pageSize };
  }
  return await response.json();
}


export interface TokenChartData {
  time: number;
  price: number;
}

/**
 * The four series `/api/token/sparklines/:address` returns.
 *
 * The last two keys are `7D` and `30D`, NOT `1W` and `1M`. This interface said
 * `sparkline1W`/`sparkline1M` — names the gateway has never emitted (see
 * apps/gateway/src/api/tokens.ts, which returns
 * `sparkline1H`/`1D`/`7D`/`30D`).
 *
 * The mismatch survived because the only other consumer,
 * `Pages/Profile/DesktopProfilePage`, indexes the response through an untyped
 * `{ [key: string]: string }` map, so TypeScript never compared the two. The
 * first component to read the type properly — `LaunchTokenProfile` — stopped
 * compiling, which is the check working rather than that component being wrong.
 */
export interface TokenSparklines {
  sparkline1H: TokenChartData[];
  sparkline1D: TokenChartData[];
  sparkline7D: TokenChartData[];
  sparkline30D: TokenChartData[];
}

export async function getTokenSparklines(networkName: string, address: string): Promise<TokenSparklines> {
  const ponderLink = PonderLinks[networkName];
  const res = await fetch(`${ponderLink}/api/token/sparklines/${address}`);
  const data = await res.json();
  return data;
}
