"use client"
// NOT MOUNTED. /price/[token] folded into /token/[token] on 2026-08-31, which
// renders LaunchTokenProfile instead. Kept as the reference for the parts that
// did NOT come across in that merge — the Tabs shell, the holders PieChart,
// ChartBar, StarButton and ThesisComposer. The CMS prose and the breadcrumb did
// come across. Port from here rather than rebuilding if any of those are wanted
// on the token page.

import { chartTicker } from "@/lib/chart/ticker";
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ChevronUp, ChevronDown, ExternalLink, Twitter, Copy, BarChart3 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BreadcrumbNav } from "@/components/Atoms/BreadCrumbNav"
import { useMarketPageContext } from "@/contexts/MarketPageProvider"
import { SpotToken } from "@/types/tables/tokens"
import { TokenProfileChart } from "@/components/Organisms/TradingView/TokenProfileChart"
import { timeframeToInterval, type ChartTimeframeLabel } from "@/lib/profile/chartInterval"

// `<DesktopOnly />` for every width below `lg`, so this component has no live
// caller today. The `token` prop it already took is enough for the chart —
// unlike Mobile, it never needed a new prop for this.
export function ProfileTabletPage({ token }: { token: SpotToken }) {
  const [timeframe, setTimeframe] = useState<ChartTimeframeLabel>("24h")
  const [chartAvailable, setChartAvailable] = useState<boolean | null>(null)
  const { displayNetworkName, displayNetworkSlug } = useMarketPageContext()

  return (
    <div className="w-full">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <BreadcrumbNav label={token.symbol} networkName={displayNetworkName} />

        <div className="grid grid-cols-1 gap-6">
          {/* Header Section */}
          <section className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/house-token-logo.png"
                  alt="Housecoin Logo"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div>
                  <h1 className="text-2xl font-bold">Housecoin Price</h1>
                  <h2 className="text-gray-500">(HOUSE)</h2>
                </div>
              </div>
              <div>
                <div className="inline-flex items-center px-3 py-1 border rounded-md text-sm">
                  USD ($)
                  <ChevronDown className="ml-2 h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-3xl font-bold mb-1">$0.05226</h2>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-300 font-medium">+26.15%</span>
                  <span className="text-gray-500 text-sm">(1 day)</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Buy</button>
                <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium">Sell</button>
              </div>
            </div>

            {chartAvailable !== false && (
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  {(["1h", "24h", "1W", "1M", "1Y", "3Y"] as ChartTimeframeLabel[]).map((period) => (
                    <button
                      key={period}
                      className={`px-3 py-1 text-sm rounded-md ${timeframe === period ? "bg-blue-100 text-blue-600" : "text-gray-600"
                        }`}
                      onClick={() => setTimeframe(period)}
                    >
                      {period}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="p-1 bg-gray-100 rounded">
                    <BarChart3 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            <div className="h-72 w-full bg-white border rounded-lg overflow-hidden">
              <TokenProfileChart
                networkName={displayNetworkName}
                symbol={chartTicker(token)}
                interval={timeframeToInterval(timeframe)}
                onAvailabilityChange={(a) =>
                  setChartAvailable(a === "checking" ? null : a === "available")
                }
              />
            </div>
          </section>

          {/* Price Range */}
          <section className="mb-6">
            <h3 className="font-medium mb-2">Price Range (24h)</h3>
            {(() => {
              // Mock data for price range
              const lowPrice = 0.04016
              const highPrice = 0.06514
              const currentPrice = 0.05226

              // Calculate position percentage for current price
              const range = highPrice - lowPrice
              const position = ((currentPrice - lowPrice) / range) * 100

              return (
                <>
                  <div className="relative mb-2">
                    <div className="h-3 bg-gray-100 rounded-full w-full">
                      <div
                        className="h-3 bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                        style={{ width: "100%" }}
                      ></div>

                      {/* Current price marker */}
                      <div
                        className="absolute top-0 w-1 h-6 bg-blue-600 rounded-full transform -translate-x-1/2"
                        style={{ left: `${position}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs py-1 px-2 rounded whitespace-nowrap">
                          ${currentPrice}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <div>
                      <label className="text-sm text-gray-500">24h Low</label>
                      <p className="font-medium">${lowPrice}</p>
                    </div>
                    <div className="text-right">
                      <label className="text-sm text-gray-500">24h High</label>
                      <p className="font-medium">${highPrice}</p>
                    </div>
                  </div>
                </>
              )
            })()}
          </section>

          {/* Tabs Section */}
          <Tabs defaultValue="overview" className="mb-6">
            <TabsList className="w-full justify-start border-b">
              <TabsTrigger value="overview" className="text-base">
                Overview
              </TabsTrigger>
              <TabsTrigger value="about" className="text-base">
                About
              </TabsTrigger>
              <TabsTrigger value="analysis" className="text-base">
                Analysis
              </TabsTrigger>
              <TabsTrigger value="faq" className="text-base">
                FAQ
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="pt-6">
              <section>
                <h2 className="text-xl font-bold mb-4">Housecoin Live Price Data</h2>
                <p className="text-gray-700 mb-6">
                  The live price of Housecoin is $0.05226, with a total trading volume of $1.2M in the last 24 hours.
                  The price of Housecoin changed by +26.15% in the past day, and its USD value has increased by +40.34%
                  over the last week. With a circulating supply of 998,759,417 HOUSE, the market cap of Housecoin is
                  currently 53.13M USD.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div>
                    <dt className="text-gray-500 mb-1">Market Cap</dt>
                    <dd className="font-medium">$53.13M</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">24h Volume</dt>
                    <dd className="font-medium">$1.2M</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Circulating Supply</dt>
                    <dd className="font-medium">998,759,417</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Max Supply</dt>
                    <dd className="font-medium">1B</dd>
                  </div>
                </div>

                <div className="border rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">Website</h4>
                      <a
                        href="https://www.webuyhousecoins.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 flex items-center gap-1"
                      >
                        webuyhousecoins.com
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Explorer</h4>
                      <div className="flex flex-col gap-1">
                        <a
                          href="https://solscan.io/token/DitHyRMQiSDhn5cnKMJV2CDDt6sVct96YrECiM49pump"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 flex items-center gap-1"
                        >
                          solscan.io
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Contract</h4>
                      <div className="flex items-center gap-1 text-gray-700">
                        <span>Solana</span>
                        <span className="text-gray-500">DitHyRMQ...ump</span>
                        <button className="text-gray-400">
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Community</h4>
                      <div className="flex gap-2">
                        <a
                          href="https://twitter.com/HousecoinOnSol"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-blue-500"
                        >
                          <Twitter className="h-5 w-5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">How do you feel about Housecoin today?</h2>
                    <small className="text-gray-500">Note: This data is for reference only.</small>
                  </div>
                  <div className="flex justify-center items-center gap-4 p-6 bg-gray-50 rounded-lg">
                    <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-gray-100">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <ChevronUp className="h-6 w-6 text-green-600 dark:text-green-300" />
                      </div>
                      <span className="font-medium">Bullish</span>
                    </button>
                    <div className="h-32 w-px bg-gray-300"></div>
                    <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-gray-100">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <ChevronDown className="h-6 w-6 text-red-600 dark:text-red-300" />
                      </div>
                      <span className="font-medium">Bearish</span>
                    </button>
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="about" className="pt-6">
              <section>
                <h2 className="text-xl font-bold mb-6">About HOUSE</h2>

                <div className="space-y-4">
                  <details open className="border rounded-lg">
                    <summary className="flex items-center justify-between p-4 cursor-pointer">
                      <span className="font-medium">What Is HOUSE Crypto?</span>
                    </summary>
                    <div className="p-4 pt-0 border-t">
                      <p className="text-gray-700">
                        HOUSE (also styled as Housecoin) is a community-driven meme token on the Solana blockchain that
                        lampoons the overheated real-estate market. Launched via a "fair-launch" mechanism on Pump.fun,
                        all 998.8 million tokens were minted at genesis with no pre-sale or team allocation.
                      </p>
                    </div>
                  </details>

                  <details open className="border rounded-lg">
                    <summary className="flex items-center justify-between p-4 cursor-pointer">
                      <span className="font-medium">How Does HOUSE Work?</span>
                    </summary>
                    <div className="p-4 pt-0 border-t">
                      <p className="text-gray-700">
                        As an SPL token on Solana, HOUSE operates like any standard Solana asset: holders store it in
                        wallets such as Phantom or Solflare and route transfers through Solana's validator network.
                        Liquidity is provided by community-run pools on DEXes like Pump.fun (pumpswap) and Raydium.
                      </p>
                    </div>
                  </details>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="analysis" className="pt-6">
              <section>
                <h2 className="text-xl font-bold mb-6">Housecoin (HOUSE) Price Movements ($)</h2>

                <div className="overflow-x-auto mb-8">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Period</th>
                        <th className="text-center p-3">Change</th>
                        <th className="text-right p-3">Change (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-3">Today</td>
                        <td className="text-center p-3 text-green-600 dark:text-green-300">$0.01079</td>
                        <td className="text-right p-3 text-green-600 dark:text-green-300">26.03%</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">7 Days</td>
                        <td className="text-center p-3 text-green-600 dark:text-green-300">$0.01559</td>
                        <td className="text-right p-3 text-green-600 dark:text-green-300">41.88%</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3">30 Days</td>
                        <td className="text-center p-3 text-green-600 dark:text-green-300">$0.01559</td>
                        <td className="text-right p-3 text-green-600 dark:text-green-300">41.88%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="faq" className="pt-6">
              <section>
                <h2 className="text-xl font-bold mb-6">FAQ</h2>

                <div className="space-y-4">
                  <details className="border rounded-lg">
                    <summary className="flex items-center justify-between p-4 cursor-pointer">
                      <span className="font-medium">How much is 1 Housecoin (HOUSE) worth?</span>
                    </summary>
                    <div className="p-4 pt-0 border-t">
                      <p className="text-gray-700">
                        KuCoin provides real-time USD price updates for Housecoin (HOUSE). Housecoin price is affected
                        by supply and demand, as well as market sentiment. Use the KuCoin Calculator to obtain real-time
                        HOUSE to USD exchange rates.
                      </p>
                    </div>
                  </details>

                  <details className="border rounded-lg">
                    <summary className="flex items-center justify-between p-4 cursor-pointer">
                      <span className="font-medium">Is HOUSE a Good Investment?</span>
                    </summary>
                    <div className="p-4 pt-0 border-t">
                      <p className="text-gray-700">
                        Analysts highlight HOUSE's novel positioning as a cultural "hedge" against real-estate
                        inflation, noting its rapid community growth but cautioning that such memecoins carry extreme
                        volatility and no intrinsic value buffer.
                      </p>
                    </div>
                  </details>
                </div>
              </section>
            </TabsContent>
          </Tabs>

          {/* Conversion Rates */}
          <section className="mb-6">
            <h2 className="text-xl font-bold mb-4">Housecoin Conversion Rate</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { currency: "USD", rate: "$0.05226954" },
                { currency: "EUR", rate: "€0.04663719" },
                { currency: "AUD", rate: "$0.0819116" },
                { currency: "JPY", rate: "¥7.62" },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <span>1 HOUSE to {item.currency}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.rate}</span>
                    <Link href="#" className="text-gray-500">
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
