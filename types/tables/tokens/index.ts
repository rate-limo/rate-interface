import { z } from "zod";
export * from "./buckets";
export * from "./groupTokens";
export * from "./likes";

export const spotToken = z.object({
  /// token address
  id: z.string(),
  /// token name
  name: z.string(),
  /// token symbol
  symbol: z.string(),
  /// is favorite
  isFavorite: z.boolean(),
  /// token ticker
  ticker: z.string(),
  /// total supply
  totalSupply: z.number(),
  /// Logo URL, or EMPTY for a token absent from the static token list — the broker
  /// no longer substitutes an image for one, so "" is a fact about the token rather
  /// than a loading state. Rows written before 2026-09-04 still carry the predecessor
  /// list's `placeholder_token.png`, which lib/tokens/logo.ts also reads as absent.
  /// A creator binds real artwork through `/token-logo/claim`, which the gateway
  /// merges over this value.
  logoURI: z.string(),
  /// Operator- or creator-authored blurb from adminTokenMeta, merged into every token
  /// response by the gateway's mergeTokenMeta. Null when nobody has written one.
  description: z.string().nullable().optional(),
  /// token decimals
  decimals: z.number(),
  /// price in DEX in USD
  priceUSD: z.number(),
  /// market cap in USD — priceUSD * totalSupply, a STORED generated column on
  /// broker.spotTokens (migration 0021), so clients read it and never recompute.
  /// null for an unpriced token; absent from an indexer that predates the
  /// migration, which is why it is optional. Both render as a dash.
  marketCap: z.number().nullable().optional(),
  /// price in DEX in USD 1 hour before
  priceUSD1HourBF: z.number(),
  /// price in DEX in USD 1 day before
  priceUSD1DayBF: z.number(),
  /// price in DEX in USD 1 week before
  priceUSD1WeekBF: z.number(),
  /// price in DEX in USD 1 month before
  priceUSD1MonthBF: z.number(),
  /// sparkline in 7 days
  sparkline7D: z.array(z.number()),
  /// price in USD based on coin portals such as CMC or CG
  cpPrice: z.number(),
  /// Coingecko id
  cgId: z.string(),
  /// Coinmarketcap id
  cmcId: z.string(),
  /// All Time High
  ath: z.number(),
  /// All Time Low
  atl: z.number(),
  /// listing date timestamp in seconds
  listingDate: z.number(),
  /// 24h difference in usd
  dayPriceDifference: z.number(),
  /// 24h difference percentage in usd
  dayPriceDifferencePercentage: z.number(),
  /// 24h trades count
  dayTradesCount: z.number(),
  /**
   * Trades over all time, and the contract's own graduation latch.
   *
   * Both are sent by the gateway on every `/api/token*` route and neither was
   * declared, so a consumer had to cast to read them — the same gap `verified`
   * sat in until it was added, and for the same reason: the schema predates the
   * columns and is only ever used for type inference, so this is a pure type
   * change with no parse to break.
   *
   * `graduatedAt` is NULL for every launch that has not crossed the contract's
   * threshold, which is most of them; optional because an indexer older than
   * the column omits it rather than sending null.
   */
  tradesCount: z.number().nullable().optional(),
  graduatedAt: z.number().nullable().optional(),
  /// When an armed ladder graduation may finish, unix seconds (AssetGenerator.
  /// GraduationArmed). Null until armed; absent from a gateway that predates
  /// broker migration 0027, which is why it is optional.
  graduationReadyAt: z.number().nullable().optional(),
  /// A ladder launch's progress (gateway `ladder`, 2026-10-03): null for coins
  /// from the previous generator and for listed tokens; absent from an older
  /// gateway. Only ever used for type inference, never parsed.
  ladder: z
    .object({
      /// `placing` is the two-transaction launch (Tempo): the coin exists and its
      /// ladder does not, because the ladder is its own call. `steps` is empty and
      /// the prices are null in that state -- anything reading them must branch
      /// first. It cannot occur where `LADDER_DEFERRED` is off, which is everywhere
      /// else.
      state: z.enum(["placing", "selling", "soldOut", "armed", "graduated"]),
      stepsSold: z.number(),
      stepsTotal: z.number(),
      steps: z.array(z.object({ step: z.number(), marketCapQuote: z.number(), marketCapUsd: z.number().nullable(), sold: z.boolean() })),
      marketCapQuote: z.number().nullable(),
      marketCapUsd: z.number().nullable(),
      graduationMarketCap: z.object({ quote: z.number(), usd: z.number().nullable() }),
      toGraduateQuote: z.number().nullable(),
      toGraduateUsd: z.number().nullable(),
      progress: z.number(),
      readyAt: z.number().nullable(),
      graduatedAt: z.number().nullable(),
      poolValueQuote: z.number().nullable(),
      poolValueUsd: z.number().nullable(),
      quote: z.object({ address: z.string(), symbol: z.string().nullable(), decimals: z.number().nullable(), priceUsd: z.number().nullable() }),
    })
    .nullable()
    .optional(),
  /// day open price
  dayOpen: z.number(),
  /// day highest price
  dayHigh: z.number(),
  /// day lowest price
  dayLow: z.number(),
  /// day tvl
  dayTvl: z.number(),
  /// day volume
  dayVolume: z.number(),
  /// day tvl in USD
  dayTvlUSD: z.number(),
  /// day volume in USD
  dayVolumeUSD: z.number(),
  /// creator — the wallet that launched this coin through CoinGenerator, from the
  /// Launched event. The EMPTY STRING for every token the broker learned about through
  /// PairAdded alone, which is how "launched" is distinguished from "listed".
  creator: z.string(),
  /// admin-curated listing flag. False until the market meets the quote-liquidity
  /// threshold, so `!verified` is what the unlisted badge reads.
  verified: z.boolean().optional(),
  /// unix seconds, stamped when a price event last landed. The closest real signal for
  /// "last priced" — deliberately not called last TRADED, since a token repriced by a
  /// quote-token move updates it too.
  priceUpdatedAt: z.number().nullable().optional(),
  /// total Minute Buckets
  totalMinBuckets: z.number(),
  /// total Hour Buckets
  totalHourBuckets: z.number(),
  /// total Day Buckets
  totalDayBuckets: z.number(),
  /// total Week Buckets
  totalWeekBuckets: z.number(),
  /// total Month Buckets
  totalMonthBuckets: z.number(),
});

export type SpotToken = z.infer<typeof spotToken>;


export type SpotTokenWithBalance = SpotToken & {
  balance: number;
  valueUSD: number;
};