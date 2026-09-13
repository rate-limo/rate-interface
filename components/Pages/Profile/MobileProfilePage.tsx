"use client"
// NOT MOUNTED. /price/[token] folded into /token/[token] on 2026-08-31, which
// renders LaunchTokenProfile instead. Kept as the reference for the parts that
// did NOT come across in that merge — the Tabs shell, the holders PieChart,
// ChartBar, StarButton and ThesisComposer. The CMS prose and the breadcrumb did
// come across. Port from here rather than rebuilding if any of those are wanted
// on the token page.

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ExternalLink, Twitter, Menu, X } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useMarketPageContext } from "@/contexts/MarketPageProvider"
import { TokenProfileChart } from "@/components/Organisms/TradingView/TokenProfileChart"
import { timeframeToInterval, type ChartTimeframeLabel } from "@/lib/profile/chartInterval"

// `<DesktopOnly />` for every width below `lg`, so this component has no live
// caller today — `symbol` below matches what a real caller would need to pass
// once that gap closes (the token's own symbol, e.g. "NOVA" — the UDF prices a
// token directly against USD, no pair to resolve), not a prop contract
// exercised anywhere yet. Every other value on this page is still the
// Housecoin mock it shipped with.
export function ProfileMobilePage({ symbol = "HOUSE" }: { symbol?: string }) {
  const [timeframe, setTimeframe] = useState<ChartTimeframeLabel>("24h")
  const [activeTab, setActiveTab] = useState("overview")
  const [chartAvailable, setChartAvailable] = useState<boolean | null>(null)
  const { displayNetworkName } = useMarketPageContext()

  return (
    <div className="w-full">
      <div className="px-4 py-4">
        {/* Mobile Header with Menu */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Image src="/house-token-logo.png" alt="Housecoin Logo" width={32} height={32} className="rounded-full" />
            <div>
              <h1 className="text-xl font-bold">HOUSE</h1>
              <h2 className="text-xs text-gray-500">Housecoin</h2>
            </div>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button className="p-2 rounded-full bg-gray-100">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[80vw] sm:w-[385px]">
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold">Menu</h2>
                  <SheetTrigger asChild>
                    <button className="p-1 rounded-full hover:bg-gray-100">
                      <X className="h-5 w-5" />
                    </button>
                  </SheetTrigger>
                </div>
                <nav className="space-y-4">
                  <Link href="#" className="block p-3 hover:bg-gray-100 rounded-lg">
                    Home
                  </Link>
                  <Link href="#" className="block p-3 hover:bg-gray-100 rounded-lg">
                    Prices
                  </Link>
                  <Link href="#" className="block p-3 hover:bg-gray-100 rounded-lg">
                    Markets
                  </Link>
                  <Link href="#" className="block p-3 hover:bg-gray-100 rounded-lg">
                    Trade
                  </Link>
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Price Info */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold">$0.05226</h2>
            <div className="px-2 py-1 bg-green-100 text-green-600 dark:text-green-300 rounded-full text-sm font-medium">+26.15%</div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">1 HOUSE</span>
            <span className="text-gray-500 text-sm">24h Change</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button className="py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm">Buy</button>
          <button className="py-2.5 border border-gray-300 rounded-lg font-medium text-sm">Sell</button>
        </div>

        {/* Chart Period Selector */}
        {chartAvailable !== false && (
          <div className="mb-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 min-w-max">
              {(["1h", "24h", "1W", "1M", "1Y", "3Y"] as ChartTimeframeLabel[]).map((period) => (
                <button
                  key={period}
                  className={`px-3 py-1 text-sm rounded-md ${
                    timeframe === period ? "bg-blue-100 text-blue-600" : "text-gray-600"
                  }`}
                  onClick={() => setTimeframe(period)}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="h-60 w-full bg-white border rounded-lg overflow-hidden mb-6">
          <TokenProfileChart
            networkName={displayNetworkName}
            symbol={symbol}
            interval={timeframeToInterval(timeframe)}
            onAvailabilityChange={(a) =>
              setChartAvailable(a === "checking" ? null : a === "available")
            }
          />
        </div>

        {/* Price Range */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Price Range (24h)</h3>
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
                  <div className="h-2 bg-gray-100 rounded-full w-full">
                    <div
                      className="h-2 bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                      style={{ width: "100%" }}
                    ></div>

                    {/* Current price marker */}
                    <div
                      className="absolute top-0 w-1 h-4 bg-blue-600 rounded-full transform -translate-x-1/2"
                      style={{ left: `${position}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs py-0.5 px-1.5 rounded whitespace-nowrap">
                        ${currentPrice}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <div>
                    <label className="text-gray-500">24h Low</label>
                    <p className="font-medium">${lowPrice}</p>
                  </div>
                  <div className="text-right">
                    <label className="text-gray-500">24h High</label>
                    <p className="font-medium">${highPrice}</p>
                  </div>
                </div>
              </>
            )
          })()}
        </div>

        {/* Mobile Tabs */}
        <div className="mb-4 border-b">
          <div className="flex overflow-x-auto scrollbar-hide">
            {["overview", "about", "analysis", "faq"].map((tab) => (
              <button
                key={tab}
                className={`px-4 py-2 text-sm capitalize whitespace-nowrap ${
                  activeTab === tab ? "text-blue-600 border-b-2 border-blue-600 font-medium" : "text-gray-600"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="mb-6">
          {activeTab === "overview" && (
            <div>
              <h2 className="text-lg font-bold mb-3">Housecoin Live Price Data</h2>
              <p className="text-sm text-gray-700 mb-6">
                The live price of Housecoin is $0.05226, with a total trading volume of $1.2M in the last 24 hours. The
                price of Housecoin changed by +26.15% in the past day, and its USD value has increased by +40.34% over
                the last week.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <dt className="text-xs text-gray-500 mb-1">Market Cap</dt>
                  <dd className="font-medium">$53.13M</dd>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <dt className="text-xs text-gray-500 mb-1">24h Volume</dt>
                  <dd className="font-medium">$1.2M</dd>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <dt className="text-xs text-gray-500 mb-1">Circulating Supply</dt>
                  <dd className="font-medium">998.76M</dd>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <dt className="text-xs text-gray-500 mb-1">Max Supply</dt>
                  <dd className="font-medium">1B</dd>
                </div>
              </div>

              <div className="border rounded-lg p-3 mb-6">
                <h3 className="font-medium mb-3">Links</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <h4 className="text-xs text-gray-500 mb-1">Website</h4>
                    <a
                      href="https://www.webuyhousecoins.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm flex items-center gap-1"
                    >
                      webuyhousecoins.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div>
                    <h4 className="text-xs text-gray-500 mb-1">Explorer</h4>
                    <a
                      href="https://solscan.io/token/DitHyRMQiSDhn5cnKMJV2CDDt6sVct96YrECiM49pump"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm flex items-center gap-1"
                    >
                      solscan.io
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div>
                    <h4 className="text-xs text-gray-500 mb-1">Community</h4>
                    <div className="flex gap-2">
                      <a
                        href="https://twitter.com/HousecoinOnSol"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-blue-500"
                      >
                        <Twitter className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div>
              <h2 className="text-lg font-bold mb-4">About HOUSE</h2>
              <div className="space-y-4">
                <details open className="border rounded-lg">
                  <summary className="flex items-center justify-between p-3 cursor-pointer">
                    <span className="font-medium text-sm">What Is HOUSE Crypto?</span>
                  </summary>
                  <div className="p-3 pt-0 border-t">
                    <p className="text-sm text-gray-700">
                      HOUSE is a community-driven meme token on the Solana blockchain that lampoons the overheated
                      real-estate market. Launched via a "fair-launch" mechanism, all tokens were minted at genesis with
                      no pre-sale or team allocation.
                    </p>
                  </div>
                </details>
                <details className="border rounded-lg">
                  <summary className="flex items-center justify-between p-3 cursor-pointer">
                    <span className="font-medium text-sm">How Does HOUSE Work?</span>
                  </summary>
                  <div className="p-3 pt-0 border-t">
                    <p className="text-sm text-gray-700">
                      As an SPL token on Solana, HOUSE operates like any standard Solana asset: holders store it in
                      wallets such as Phantom or Solflare and route transfers through Solana's validator network.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          )}

          {activeTab === "analysis" && (
            <div>
              <h2 className="text-lg font-bold mb-4">Price Movements</h2>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-sm">Period</th>
                      <th className="text-right p-2 text-sm">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2 text-sm">Today</td>
                      <td className="text-right p-2 text-sm text-green-600 dark:text-green-300">+26.03%</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 text-sm">7 Days</td>
                      <td className="text-right p-2 text-sm text-green-600 dark:text-green-300">+41.88%</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 text-sm">30 Days</td>
                      <td className="text-right p-2 text-sm text-green-600 dark:text-green-300">+41.88%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "faq" && (
            <div>
              <h2 className="text-lg font-bold mb-4">FAQ</h2>
              <div className="space-y-3">
                <details className="border rounded-lg">
                  <summary className="flex items-center justify-between p-3 cursor-pointer">
                    <span className="font-medium text-sm">How much is 1 HOUSE worth?</span>
                  </summary>
                  <div className="p-3 pt-0 border-t">
                    <p className="text-sm text-gray-700">
                      The current price of 1 HOUSE is $0.05226. Prices are affected by supply and demand, as well as
                      market sentiment.
                    </p>
                  </div>
                </details>
                <details className="border rounded-lg">
                  <summary className="flex items-center justify-between p-3 cursor-pointer">
                    <span className="font-medium text-sm">Is HOUSE a Good Investment?</span>
                  </summary>
                  <div className="p-3 pt-0 border-t">
                    <p className="text-sm text-gray-700">
                      HOUSE is a meme token with extreme volatility and no intrinsic value buffer. Investors should only
                      allocate funds they can afford to lose.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>

        {/* Conversion Rates */}
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-3">Conversion Rates</h2>
          <div className="space-y-2">
            {[
              { currency: "USD", rate: "$0.05226954" },
              { currency: "EUR", rate: "€0.04663719" },
              { currency: "JPY", rate: "¥7.62" },
            ].map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm">1 HOUSE to {item.currency}</span>
                <span className="font-medium text-sm">{item.rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
