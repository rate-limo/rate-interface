"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"


interface LinearAreaChartProps {
  data: any[];
}

export default function LinearAreaChart({data}: LinearAreaChartProps) {
  return (
        <ChartContainer
          config={{
            value: {
              label: "Test",
              color: "hsl(142, 76%, 36%)", // Green color similar to the image
            },
          }}
          className=" min-h-[248px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              width={492}
              height={248}
              margin={{
                top: 0,
                right: 0,
                left: 0,
                bottom: 0,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={true}
                strokeWidth={2}
                stroke="var(--m-text-primary)"
                tickLine={false}
                tick={false}
              />
              <YAxis
                axisLine={true}
                tickLine={false}
                stroke="var(--m-border)"
                strokeWidth={2}
                tick={{style: {
                  fill: "var(--m-text-primary)",
                  fontSize: "12px",
                }
                }}
                tickFormatter={(value) => value.toFixed(0)}
              />
              {/*<ChartTooltip content={<ChartTooltipContent />} cursor={false} />*/}
              <Area
                type="linear"
                dataKey="value"
                stroke="rgba(9, 133, 81, 1)"
                strokeWidth={1}
                fill="rgba(9, 133, 81, 1)" // Light green fill with transparency
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
  )
}


