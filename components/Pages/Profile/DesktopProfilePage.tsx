"use client";
// NOT MOUNTED. /price/[token] folded into /token/[token] on 2026-08-31, which
// renders LaunchTokenProfile instead. Kept as the reference for the parts that
// did NOT come across in that merge — the Tabs shell, the holders PieChart,
// ChartBar, StarButton and ThesisComposer. The CMS prose and the breadcrumb did
// come across. Port from here rather than rebuilding if any of those are wanted
// on the token page.

import { marketParam } from "@/lib/routing/proMarket";
import { useState } from "react";
import {
  ChartMetricCaveat,
  ChartMetricToggle,
  useChartMetric,
} from "@/components/Organisms/TradingView/ChartMetricToggle";
import Link from "next/link";
import { ExternalLink, Twitter, Trophy, ChartBar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BreadcrumbNav } from "@/components/Atoms/BreadCrumbNav";
import { Label, Pie, PieChart } from "recharts";
import Decimal from "decimal.js";
import { formatMarketCap } from "@/utils/number";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { AddressDisplay } from "@/components/Atoms/AddressDisplay";
import { TokenPercentageChange } from "@/components/Atoms/TokenPercentageChange";
import Markdown from "react-markdown";
import { StarButton } from "@/components/Organisms/StarButton";
import { SpotToken } from "@/types";
import { TokenPriceUSDChange } from "@/components/Atoms/TokenPriceUSDChange";
import { TokenProfileChart } from "@/components/Organisms/TradingView/TokenProfileChart";
import { ThesisComposer } from "@/components/Pages/Profile/ThesisComposer";
import { timeframeToInterval, type ChartTimeframeLabel } from "@/lib/profile/chartInterval";


export function ProfileDesktopPage({
  token,
  tokenCMS,
  basePairs,
  tokenSparklines,
}: {
  token: SpotToken & {
    hourPriceDifferencePercentage: number;
    weekPriceDifferencePercentage: number;
    monthPriceDifferencePercentage: number;
    rank: number;
    dayLow: number;
  };
  tokenCMS: any;
  basePairs: any;
  tokenSparklines: any;
}) {
  const [timeframe, setTimeframe] = useState<ChartTimeframeLabel>("24h");
  // null while the availability check is in flight; the timeframe row is kept
  // visible until it's known false so a fast "no market data" answer doesn't
  // flash the buttons on then immediately off.
  const [chartAvailable, setChartAvailable] = useState<boolean | null>(null);

  // Validate required data
  if (!token || !token.symbol || !token.name) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Invalid token data</p>
      </div>
    );
  }

  const {
    newTokenData,
    topVolumeTokenData,
    displayNetworkSlug,
    displayNetworkName,
  } = useMarketPageContext();

  // Ensure newTokenData and topVolumeTokenData are valid
  const validNewTokenData = newTokenData?.tokens || [];
  const validTopVolumeTokenData = topVolumeTokenData?.tokens || [];

  const calcInvestmentBarometer = (
    hourPriceDifferencePercentage?: number,
    dayPriceDifferencePercentage?: number,
    weekPriceDifferencePercentage?: number,
    monthPriceDifferencePercentage?: number
  ) => {
    const hourWeight = 0.4;
    const dayWeight = 0.3;
    const weekWeight = 0.2;
    const monthWeight = 0.1;
  
    const pairs: [number | undefined, number][] = [
      [hourPriceDifferencePercentage, hourWeight],
      [dayPriceDifferencePercentage, dayWeight],
      [weekPriceDifferencePercentage, weekWeight],
      [monthPriceDifferencePercentage, monthWeight],
    ];
  
    // Split into valid and invalid
    const validPairs = pairs.filter(([percentage]) => percentage != null && percentage !== 0);
    const invalidPairs = pairs.filter(([percentage]) => percentage == null || percentage === 0);
  
    if (validPairs.length === 0) {
      return NaN;
    }
  
    // Total weight of valid ones
    const validTotalOriginalWeight = validPairs.reduce((sum, [, weight]) => sum + weight, 0);
  
    // Total weight of missing ones
    const missingTotalWeight = invalidPairs.reduce((sum, [, weight]) => sum + weight, 0);
  
    // Now redistribute missing weight to valid ones proportionally
    const investmentBarometer = validPairs.reduce((sum, [percentage, weight]) => {
      // redistributed weight = original weight + proportional share of missing weight
      const newWeight = weight + (missingTotalWeight / validPairs.length);
  
      return sum + (percentage! * newWeight);
    }, 0);
  
    return investmentBarometer * 300;
  };
  

  const investmentBarometer = calcInvestmentBarometer(
    token.hourPriceDifferencePercentage,
    token.dayPriceDifferencePercentage,
    token.weekPriceDifferencePercentage,
    token.monthPriceDifferencePercentage
  );

  // Convert to percentage width (0-100%)
  const barometerWidth = Math.min(Math.max(investmentBarometer, 0), 100);
  console.log(barometerWidth, "barometerWidth");

  const getBarometerAction = (barometerWidth: number) => {
    if (isNaN(barometerWidth)) {
      return "Pre TGE";
    }
    if (barometerWidth < 20) {
      return "Strong Sell";
    } else if (barometerWidth < 40) {
      return "Sell";
    } else if (barometerWidth < 60) {
      return "Neutral";
    } else if (barometerWidth < 80) {
      return "Buy";
    } else {
      return "Strong Buy";
    }
  };

  const chartTimeframes: ChartTimeframeLabel[] = ["1h", "24h", "1W", "1M"];

  // Market cap = price * totalSupply (spotTokens.marketCap, read elsewhere on
  // Price / market cap. The rules — second symbol not a mode, disabled without a
  // known supply, exact only for a launched coin — live in the hook, because the
  // coin profile charts the same thing and two copies would drift.
  const {
    metric: chartMetric,
    setMetric: setChartMetric,
    hasKnownSupply,
    hasFixedSupply,
    active: chartMetricActive,
    chartSymbol,
    metricLabel: chartMetricLabel,
  } = useChartMetric(token);

  return (
    <div className="bg-neutral-dark-default w-full">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <BreadcrumbNav
          label={token.symbol}
          networkName={displayNetworkName}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Header Section */}
            <section className="mb-8">
              <div className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-white">
                <div className="mb-6 flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div className="flex items-center gap-3">
                    <StarButton
                      id={token.id}
                      symbol={token.symbol}
                      option="token"
                      className="mt-1 cursor-grab"
                    />
                    <img
                      src={token.logoURI}
                      alt="Token logo"
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                    <div className="flex flex-row space-x-2 items-start">
                      <div>
                        <h1 className="text-2xl font-bold text-white">
                          {token.name} Price
                        </h1>
                        <h2 className="text-gray-500">({token.symbol})</h2>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="">
                  <h2 className="mb-2 text-3xl font-bold text-white">
                    ${token.priceUSD}
                  </h2>
                  <div className="flex items-center gap-2">
                    <TokenPercentageChange
                      change={token.dayPriceDifferencePercentage}
                      className="text-md"
                    />
                    <span className="text-sm text-gray-500">(1 day)</span>
                  </div>
                </div>
              </div>

              {chartAvailable !== false && (
                <div className="mt-6 mb-4 flex items-center justify-between">
                  <div className="flex gap-2">
                    {chartTimeframes.map((period) => (
                      <button
                        key={period}
                        className={`rounded-md px-3 py-1 text-sm ${
                          timeframe === period
                            ? "bg-primary-300 text-black"
                            : "text-primary-default"
                        }`}
                        onClick={() => {
                          setTimeframe(period);
                        }}
                      >
                        {period}
                      </button>
                    ))}
                  </div>

                  {/* Shared with the coin profile — see ChartMetricToggle. */}
                  <ChartMetricToggle
                    metric={chartMetric}
                    setMetric={setChartMetric}
                    hasKnownSupply={hasKnownSupply}
                    hasFixedSupply={hasFixedSupply}
                    symbol={token.symbol}
                  />
                </div>
              )}

              {chartMetricActive && !hasFixedSupply && (
                <ChartMetricCaveat symbol={token.symbol} className="mb-2" />
              )}

              <div
                /* 320px (h-80) left the widget shorter than its own toolbars, so the
                   plot area was a sliver. A price chart is the point of this page —
                   give it the room a chart needs. */
                className={`bg-neutral-dark-600 border-neutral-light-white-12 h-[560px] w-full overflow-hidden rounded-[16px] border p-4 text-white ${
                  chartAvailable === false ? "mt-6" : ""
                }`}
              >
                <TokenProfileChart
                  networkName={displayNetworkName}
                  symbol={chartSymbol}
                  interval={timeframeToInterval(timeframe)}
                  metricLabel={chartMetricLabel}
                  onAvailabilityChange={(a) =>
                    setChartAvailable(a === "checking" ? null : a === "available")
                  }
                />
              </div>

              {/* The compose control for a "callout" (thesis) on this token — see
                  ThesisComposer for the full reasoning. Desktop only: Mobile/Tablet
                  profile pages are not mounted anywhere in this app. */}
              <ThesisComposer
                tokenAddress={token.id}
                tokenSymbol={token.symbol}
                networkName={displayNetworkName}
              />
            </section>

            {/* Tabs Section */}
            <Tabs defaultValue="overview" className="mb-8">
              {/* `bg-black` is a FIXED literal (globals.css: bare black/white are anchor
                  colors for chips and badges, deliberately not theme-reactive), so a
                  full-width strip painted with it stayed black in light mode — the band
                  between these pills. Each trigger already carries its own surface and
                  border, so the list itself needs no fill at all. `text-white` next to it
                  was fine and is kept: --color-white maps to --m-text-primary. */}
              <TabsList className="w-full justify-start space-x-2 bg-transparent text-white">
                <TabsTrigger
                  value="overview"
                  className="bg-neutral-dark-600 data-[state=active]:bg-neutral-dark-600 data-[state=active]:border-primary-300 border-neutral-light-white-12 rounded-[16px] border p-4 text-base data-[state=active]:border-b-2"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="about"
                  className="bg-neutral-dark-600 data-[state=active]:bg-neutral-dark-600 data-[state=active]:border-primary-300 bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-base data-[state=active]:border-b-2"
                >
                  About
                </TabsTrigger>
                <TabsTrigger
                  value="analysis"
                  className="bg-neutral-dark-600 data-[state=active]:bg-neutral-dark-600 data-[state=active]:border-primary-300 bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-base data-[state=active]:border-b-2"
                >
                  Analysis
                </TabsTrigger>
                <TabsTrigger
                  value="faq"
                  className="bg-neutral-dark-600 data-[state=active]:bg-neutral-dark-600 data-[state=active]:border-primary-300 bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-base data-[state=active]:border-b-2"
                >
                  FAQ
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="overview"
                className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 pt-6 text-white"
              >
                <section>
                  <h2 className="mb-4 text-xl font-bold text-white">
                    {token.name} Price Data
                  </h2>
                  <p className="mb-8 text-gray-500">
                    The live price of {token.name} is ${token.priceUSD}, with a
                    total trading volume of ${token.dayVolumeUSD} in the last 24
                    hours. The price of {token.name} changed by $
                    {token.dayPriceDifferencePercentage}% in the past day, and
                    its USD value has increased by $
                    {token.weekPriceDifferencePercentage} over the last week.
                    With a circulating supply of {token.totalSupply}{" "}
                    {token.symbol}, the market cap of {token.name} is currently
                    $
                    {formatMarketCap(token.marketCap).replace("$", "")}
                    , marking a ${token.dayPriceDifferencePercentage}% increase
                    today. {token.name} currently ranks #{token.rank ?? "--"} in
                    volume.
                  </p>

                  <h2 className="mb-4 text-xl font-bold text-white">
                    {token.name}({token.symbol}) Profile
                  </h2>

                  <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-lg bg-orange-100 p-4 text-black">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-6 w-6" />
                        <span>Rank</span>
                        <span className="ml-auto">{token.rank ?? "--"}</span>
                      </div>
                    </div>
                    <div className="bg-primary-100 rounded-lg p-4 text-black">
                      <div className="flex items-center gap-2">
                        <ChartBar className="h-6 w-6" />
                        <span>Trades</span>
                        <span className="ml-auto">
                          {token.dayTradesCount ?? "--"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 rounded-lg p-4 text-white">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-medium">Website</h4>
                        <a
                          href={tokenCMS?.website ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-default flex items-center gap-1"
                        >
                          {tokenCMS?.website ?? "--"}
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Documentation</h4>
                        <a
                          href={tokenCMS?.documentation ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-default flex items-center gap-1"
                        >
                          Docs
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Explorer</h4>
                        <div className="flex flex-col gap-1">
                          <a
                            href={tokenCMS?.onchain_token_info?.scanner ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-default flex items-center gap-1"
                          >
                            {tokenCMS?.onchain_token_info?.scanner
                              ? tokenCMS?.network?.name
                              : "--"}
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Contract</h4>
                        <div className="flex items-center gap-1 text-gray-500">
                          <span className="text-primary-default">
                            {tokenCMS?.network?.name ?? "--"}
                          </span>
                          <AddressDisplay
                            address={tokenCMS?.onchain_token_info?.contract}
                          />
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Code & Community</h4>
                        <div className="flex gap-2">
                          <a
                            href={tokenCMS?.twitter ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary-default text-gray-500"
                          >
                            <Twitter className="h-5 w-5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="mb-2 font-medium">Price Range (24h)</h3>

                    {/* Price range data */}
                    {(() => {
                      // Mock data for price range
                      const lowPrice = token.dayLow ?? token.priceUSD;
                      const highPrice = token.dayHigh ?? token.priceUSD;
                      const currentPrice = token.priceUSD;

                      // Calculate position percentage for current price
                      const range = highPrice - lowPrice;
                      const position =
                        currentPrice == lowPrice
                          ? 50
                          : ((currentPrice - lowPrice) / range) * 100;

                      return (
                        <>
                          <div className="relative mb-2">
                            <div className="h-3 w-full rounded-full bg-gray-100">
                              <div
                                className="h-3 rounded-full bg-gradient-to-r from-red-400 to-green-400"
                                style={{ width: "100%" }}
                              ></div>

                              {/* Current price marker */}
                              <div
                                className="bg-primary-default absolute top-0 h-6 w-1 -translate-x-1/2 transform rounded-full"
                                style={{ left: `${position}%` }}
                              >
                                <div className="bg-primary-default absolute -top-8 left-1/2 -translate-x-1/2 transform rounded px-2 py-1 text-xs whitespace-nowrap text-on-primary">
                                  ${token.priceUSD}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <div>
                              <label className="text-sm text-gray-500">
                                24h Low
                              </label>
                              <p className="font-medium">${lowPrice}</p>
                            </div>
                            <div className="text-right">
                              <label className="text-sm text-gray-500">
                                24h High
                              </label>
                              <p className="font-medium">${highPrice}</p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <hr className="border-neutral-light-white-12 my-6" />

                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <dt className="mb-1 text-gray-500">ATH</dt>
                      <dd className="font-medium">
                        {token.ath
                          ? `$${new Decimal(token.ath).toString()}`
                          : "--"}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Price Change (1h)</dt>
                      <TokenPercentageChange
                        change={token.hourPriceDifferencePercentage}
                        className="text-md"
                      />
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Price Change (24h)</dt>
                      <TokenPercentageChange
                        change={token.dayPriceDifferencePercentage}
                        className="text-md"
                      />
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Price Change (7d)</dt>
                      <TokenPercentageChange
                        change={token.weekPriceDifferencePercentage}
                        className="text-md"
                      />
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Market Cap</dt>
                      <dd className="font-medium">
                        {/* Reads spotTokens.marketCap (a stored generated column),
                            like every other market-cap figure in the app. The old
                            inline product could disagree with the indexer and printed
                            full float precision. */}
                        {formatMarketCap(token.marketCap)}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">24h Volume</dt>
                      <dd className="font-medium">
                        {token.dayVolumeUSD
                          ? `$${new Decimal(token.dayVolumeUSD).toString()}`
                          : "--"}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Circulating Supply</dt>
                      <dd className="font-medium">
                        {tokenCMS?.onchain_token_info?.circulating_supply ??
                          token.totalSupply}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-gray-500">Max Supply</dt>
                      <dd className="font-medium">
                        {token.totalSupply ?? "--"}
                      </dd>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent
                value="about"
                className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 pt-6 text-white"
              >
                <section>
                  <h2 className="mb-6 text-xl font-bold">
                    About {token.symbol}
                  </h2>

                  <div className="border-neutral-light-white-12 space-y-4">
                    <details
                      open
                      className="border-neutral-light-white-12 rounded-lg border"
                    >
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          What Is {token.name}?
                        </span>
                      </summary>
                      <div className="border-neutral-light-white-12 border-t p-4">
                        <p className="text-gray-500">
                          {tokenCMS?.what_is_it ?? "--"}
                        </p>
                      </div>
                    </details>

                    <details
                      open
                      className="border-neutral-light-white-12 rounded-lg border"
                    >
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          How Does {token.symbol} Work?
                        </span>
                      </summary>
                      <div className="border-neutral-light-white-12 border-t p-4">
                        <p className="text-gray-500">
                          {tokenCMS?.how_it_works ?? "--"}
                        </p>
                      </div>
                    </details>

                    <details
                      open
                      className="border-neutral-light-white-12 rounded-lg border"
                    >
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          What is {token.name} ({token.symbol}) Tokenomics?
                        </span>
                      </summary>
                      <div className="border-neutral-light-white-12 border-t p-4">
                        <p className="text-gray-500">{"--"}</p>
                      </div>
                      <div className="flex flex-row gap-2">
                        <PieChart className="h-10 w-10" />
                      </div>
                    </details>
                  </div>
                </section>
              </TabsContent>

              <TabsContent
                value="analysis"
                className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 pt-6 text-white"
              >
                <section>
                  <h2 className="mb-6 text-xl font-bold">
                    {token.name} ({token.symbol}) Price Movements ($)
                  </h2>

                  <div className="mb-8 overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-neutral-light-white-12 border-b">
                          <th className="p-3 text-left">Period</th>
                          <th className="p-3 text-center">Price</th>
                          <th className="p-3 text-right">Change (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-neutral-light-white-12 border-b">
                          <td className="p-3">Today</td>
                          <td className="text-primary-default p-3 text-center">
                            {token.priceUSD !== null
                              ? `$${token.priceUSD.toFixed(2)}`
                              : "--"}
                          </td>
                          <td className="text-right">
                            <TokenPercentageChange
                              change={token.dayPriceDifferencePercentage}
                              className="text-md p-3 text-right"
                            />
                          </td>
                        </tr>
                        <tr className="border-neutral-light-white-12 border-b">
                          <td className="p-3">1 Hour</td>
                          <td className="text-primary-default p-3 text-center">
                            {token.priceUSD1HourBF !== null ? (
                              `$${token.priceUSD1HourBF.toFixed(2)}`
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="text-right">
                            <TokenPercentageChange
                              change={token.hourPriceDifferencePercentage}
                              className="text-md p-3 text-right"
                            />
                          </td>
                        </tr>
                        <tr className="border-neutral-light-white-12 border-b">
                          <td className="p-3">7 Days</td>
                          <td className="text-primary-default p-3 text-center">
                            {token.priceUSD1WeekBF !== null ? (
                              `$${token.priceUSD1WeekBF.toFixed(2)}`
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="text-right">
                            <TokenPercentageChange
                              change={token.weekPriceDifferencePercentage}
                              className="text-md p-3 text-right"
                            />
                          </td>
                        </tr>
                        <tr className="border-neutral-light-white-12 border-b">
                          <td className="p-3">30 Days</td>
                          <td className="text-primary-default p-3 text-center">
                            {token.priceUSD1MonthBF !== null ? (
                              `$${token.priceUSD1MonthBF.toFixed(2)}`
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="text-right">
                            <TokenPercentageChange
                              change={token.monthPriceDifferencePercentage}
                              className="text-md p-3 text-right"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="mb-8">
                    <h2 className="mb-4 text-xl font-bold">Buy Barometer</h2>
                    <div className="border-neutral-light-white-12 rounded-lg border p-6">
                      <div className="mb-6 flex flex-row items-center justify-between">
                        <div className="text-primary-default flex items-center gap-2 font-medium">
                          <div className="bg-primary-default h-3 w-3 rounded-full"></div>
                          <span>{getBarometerAction(barometerWidth)}</span>
                        </div>
                        <div className="flex w-[600px] flex-col gap-2">
                          <div className="text-sm text-gray-500">
                            The Buy Barometer represents the current sentiment
                            of the majority of users.
                          </div>
                          <div className="text-xs text-gray-500">
                            Risk warning：Please note that the Buy Barometer is
                            provided for informational purposes only and is not
                            an investment advice. Investing carries risk. Please
                            make investment decisions cautiously and based on
                            your own judgement.
                          </div>
                        </div>
                      </div>
                      <div className="relative mb-4 h-8 rounded-full bg-gray-100">
                        <div
                          className="bg-primary-default absolute top-0 left-0 h-full rounded-full"
                          style={{ width: `${barometerWidth}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Strong Sell</span>
                        <span>Sell</span>
                        <span>Neutral</span>
                        <span>Buy</span>
                        <span>Strong Buy</span>
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent
                value="faq"
                className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 pt-6 text-white"
              >
                <section>
                  <h2 className="mb-6 text-xl font-bold">FAQ</h2>

                  <div className="space-y-4">
                    <details className="border-neutral-light-white-12 rounded-lg border">
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          How much is 1 {token.name} ({token.symbol}) worth?
                        </span>
                      </summary>
                      <div className="border-t p-4">
                        <p className="text-gray-500">
                          Rate provides real-time USD price updates for{" "}
                          {token.name} ({token.symbol}). {token.name} price is
                          affected by supply and demand, as well as market
                          sentiment.
                        </p>
                      </div>
                    </details>

                    <details className="border-neutral-light-white-12 rounded-lg border">
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          Is {token.symbol} a Good asset to HODL?
                        </span>
                      </summary>
                      <div className="border-t p-4 text-gray-500">
                        <Markdown>
                          {tokenCMS?.hodl_report ??
                            "There is no report available for HODLing this asset yet."}
                        </Markdown>
                      </div>
                    </details>

                    <details className="border-neutral-light-white-12 rounded-lg border">
                      <summary className="flex cursor-pointer items-center justify-between p-4">
                        <span className="font-medium">
                          What is {token.name} ({token.symbol}) Price
                          Prediction?
                        </span>
                      </summary>
                      <div className="border-t p-4 text-gray-500">
                        <Markdown>
                          {tokenCMS?.price_prediction ??
                            "There is no report available for price prediction of this asset yet."}
                        </Markdown>
                      </div>
                    </details>
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-6">
              {/* Base Pairs */}
              {basePairs?.pairs?.length > 0 && (
                <Card className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-white">
                  <CardContent className="p-4">
                    <Tabs defaultValue="trade">
                      <TabsList className="w-full border-b border-neutral-light-white-12">
                        <TabsTrigger value="trade" className="h-full">
                          Trade
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="trade">
                        {(basePairs.pairs ?? []).map((pair: any) => (
                          <div
                            className="border-neutral-light-white-12 pt-4"
                            key={pair.id}
                          >
                            <Link
                              href={`/trade/pro?chain=${displayNetworkSlug}&base=${encodeURIComponent(marketParam({ id: pair.base, symbol: pair.baseSymbol }))}&quote=${encodeURIComponent(marketParam({ id: pair.quote, symbol: pair.quoteSymbol }))}`}
                            >
                              <div className="border-neutral-light-white-12 hover:bg-neutral-dark-500 flex items-center justify-between rounded-[16px] border p-3">
                                <div>
                                  <div className="font-medium">
                                    {pair.baseSymbol}/{pair.quoteSymbol}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Spot
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-medium">
                                    {pair.price}
                                  </div>
                                  <TokenPercentageChange
                                    change={pair.dayPriceDifferencePercentage}
                                    className="text-right text-sm"
                                  />
                                </div>
                              </div>
                            </Link>
                          </div>
                        ))}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}

              {/* Top Volume */}
              <Card className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-white">
                <CardContent className="p-4">
                  <h2 className="mb-4 text-lg font-bold">TOP Volume</h2>
                  <p className="mb-4 text-sm text-gray-500">
                    The cryptocurrencies with the highest trading volume
                  </p>
                  <ul className="space-y-3">
                    {validTopVolumeTokenData.map((coin: any, index: number) => (
                      <li key={index}>
                        <Link
                          href={`/token/${coin.symbol}?chain=${displayNetworkSlug}`}
                          className="hover:bg-neutral-dark-500 flex items-center gap-3 rounded-lg p-2"
                        >
                          <img
                            src={coin.logoURI}
                            alt={coin.symbol}
                            width={32}
                            height={32}
                            className="rounded-full"
                          />
                          <div className="flex-grow">
                            <div className="flex justify-between">
                              <span className="font-medium">{coin.symbol}</span>
                              <span className="font-medium">
                                {coin.priceUSD}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">{coin.name}</span>
                              <TokenPercentageChange
                                change={coin.dayPriceDifferencePercentage}
                                className="text-right text-sm"
                              />
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Newly Added */}
              <Card className="bg-neutral-dark-600 border-neutral-light-white-12 rounded-[16px] border p-4 text-white">
                <CardContent className="p-4">
                  <h2 className="mb-4 text-lg font-bold">Newly Added</h2>
                  <p className="mb-4 text-sm text-gray-500">
                    Recently listed cryptocurrencies that are available for
                    trading
                  </p>
                  <ul className="space-y-3">
                    {validNewTokenData.map((coin: any, index: number) => (
                      <li key={index}>
                        <Link
                          href={`/token/${coin.symbol}?chain=${displayNetworkSlug}`}
                          className="hover:bg-neutral-dark-500 flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
                        >
                          <img
                            src={coin.logoURI}
                            alt={coin.symbol}
                            width={32}
                            height={32}
                            className="rounded-full"
                          />
                          <div className="flex-grow">
                            <div className="flex justify-between">
                              <span className="font-medium">{coin.symbol}</span>
                              <span className="font-medium">
                                {coin.priceUSD}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">{coin.name}</span>
                              <TokenPercentageChange
                                change={coin.dayPriceDifferencePercentage}
                                className="text-right text-sm"
                              />
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
