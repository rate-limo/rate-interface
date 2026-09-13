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
	/// token ticker
	ticker: z.string(),
	/// total supply
	totalSupply: z.number(),
	/// Logo URL
	logoURI: z.string(),
	/// token decimals
	decimals: z.number(),
	/// price in DEX in USD
	priceUSD: z.number(),
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
	/// trades count
	tradesCount: z.number(),
	/// day high price
	dayHigh: z.number(),
	/// day low price
	dayLow: z.number(),
	/// 24h difference in usd
	dayPriceDifference: z.number(),
	/// 24h difference percentage in usd
	dayPriceDifferencePercentage: z.number(),
	/// day tvl
	dayTvl: z.number(),
	/// day volume
	dayVolume: z.number(),
	/// day tvl in USD
	dayTvlUSD: z.number(),
	/// day volume in USD
	dayVolumeUSD: z.number(),
	/// hour different in usd
	hourPriceDifference: z.number(),
	/// hour different percentage in usd
	hourPriceDifferencePercentage: z.number(),
	/// 7D difference in usd
	weekPriceDifference: z.number(),
	/// 7D difference percentage in usd
	weekPriceDifferencePercentage: z.number(),
	/// Month difference in usd
	monthPriceDifference: z.number(),
	/// Month difference percentage in usd
	monthPriceDifferencePercentage: z.number(),
	/// creator address
	creator: z.string(),
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
