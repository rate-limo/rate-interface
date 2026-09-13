"use client"

import { useState } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { TokenChartData } from "@/queries/server/tokens"
import { formatMonthDayOnly } from "@/utils/datetime"

// Mock data for Housecoin price over 24 hours
const generateMockData = () => {
  // Start with a base price around $0.05
  const basePrice = 0.05

  // Generate 24 data points (hourly)
  return Array.from({ length: 24 }, (_, i) => {
    // Create some realistic price movements
    // More volatility in the middle of the day
    const volatility = i > 6 && i < 18 ? 0.008 : 0.003

    // Random price movement with slight upward trend
    const randomChange = (Math.random() - 0.4) * volatility

    // Calculate price for this hour
    const price = basePrice + i * 0.0005 + randomChange

    // Format time label
    const hour = i % 12 || 12
    const ampm = i < 12 ? "AM" : "PM"
    const time = `${hour}${ampm}`

    // Calculate volume (higher during market hours)
    const volume = Math.round((i > 8 && i < 20 ? 50000 : 20000) * (1 + Math.random()))

    return {
      time,
      price: Number.parseFloat(price.toFixed(5)),
      volume,
    }
  })
}

const generateTimeData = (sparkline: TokenChartData[], timeframe: string) => {
  return sparkline?.map((dataPoint) => {
    const hourMinute = new Date(dataPoint.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const day = formatMonthDayOnly(dataPoint.time)
    return {
      time: timeframe === "sparkline1H" || timeframe === "sparkline1D" ? hourMinute : day,
      price: dataPoint.price,
      day,
    }
  })
}

export function PriceChart({ data, timeframe }: { data: TokenChartData[], timeframe: string }) {
  const timeData = generateTimeData(data, timeframe);
  // Find min and max for better axis scaling
  const minPrice = (Math.min(...timeData?.map((d) => d.price)) * 0.995).toFixed(2) ?? 0
  const maxPrice = (Math.max(...timeData?.map((d) => d.price)) * 1.005).toFixed(2) ?? 0

  return (
    <ChartContainer
      config={{
        price: {
          label: "Price",
          color: "hsl(var(--chart-1))",
        },
        volume: {
          label: "Volume",
          color: "hsl(var(--chart-2))",
        },
      }}
      className="h-full w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={timeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12, stroke: "gray" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickMargin={8}
            minTickGap={15}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 12, stroke: "gray" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            tickMargin={8}
            width={80}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--color-price)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, stroke: "var(--color-price)", strokeWidth: 2, fill: "white" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
