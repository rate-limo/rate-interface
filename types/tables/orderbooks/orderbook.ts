export type GroupedOrder = {
	price: string;
	baseLiquidity: number;
	quoteLiquidity: number;
	percentage: number;
	accumulatedBaseLiquidity: number;
	accumulatedQuoteLiquidity: number;
	accumulatedPercentage: number;
};

export type GroupedDepthResult = {
	side: "bid" | "ask";
	totalBaseLiquidity: number;
	totalQuoteLiquidity: number;
	buckets: GroupedOrder[];
};

export type GroupedOrderbookResult = {
	bids: GroupedDepthResult;
	asks: GroupedDepthResult;
	buyPercent: number;
	sellPercent: number;
	totalLiquidityInQuote: number;
	spread: number;
	spreadPercentage: number;
	symbol: string;
	step: string;
};