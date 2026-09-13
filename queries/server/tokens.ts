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
  // get token from indexer
  const res = await fetch(`${ponderLink}/api/token/symbol/${symbol}`);
  const data = await res.json();
  return data;
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
  const response = await fetch(url as string);
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
