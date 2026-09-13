import { cn } from '@/lib/utils';
import {
  TradingMetricsList,
  type TradingMetric,
} from '@/components/Molecules/TradingMetricsList';
import { AccountValueSelector } from '@/components/Molecules/AccountValueSelector';
import { ChartControls } from '@/components/Molecules/ChartControls';
import { useState } from 'react';
import LinearAreaChart from '../Molecules/LinearAreaChart';

interface TradingDetailsProps {
  metrics?: TradingMetric[];
  chartData?: any[];
  className?: string;
}

export function TradingDetails({
  metrics = [],
  chartData = [],
  className,
}: TradingDetailsProps) {
  const [timeRange, setTimeRange] = useState('30D');
  const [accountType, setAccountType] = useState('Perps');

  // Default metrics if none provided
  const defaultMetrics: TradingMetric[] = [
    { label: 'PNL', value: 0.0, isCurrency: true },
    { label: 'Volume', value: 0.0, isCurrency: true },
    { label: 'Max Drawdown', value: 0.0, isPercentage: true },
    { label: 'Total Equity', value: 0.0, isCurrency: true },
    { label: 'Perps Account Equity', value: 0.0, isCurrency: true },
    { label: 'Spot Account Equity', value: 0.0, isCurrency: true },
    { label: 'Vault Equity', value: 0.0, isCurrency: true },
    { label: 'Staking Account', value: '0 HYPE' },
  ];

  const displayMetrics = metrics.length > 0 ? metrics : defaultMetrics;
  const chartDataToUse =
    chartData.length > 0 ? chartData : generateSampleChartData();

  const handleTimeRangeChange = (newTimeRange: string) => {
    setTimeRange(newTimeRange);
  };

  const handleAccountTypeChange = (newAccountType: string) => {
    setAccountType(newAccountType);
  };

  return (
    <div
      className={cn(
        'bg-neutral-dark-600 border-neutral-light-white-12 rounded-xl border p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Left column - Metrics */}
        <div className="w-[60%]">
          <TradingMetricsList metrics={displayMetrics} />
        </div>

        {/* Right column - Chart */}
        <div className="w-[40%]">
          <div className="flex h-full flex-col gap-4">
            {/* Controls row */}
            <div className="flex items-center justify-between">
              <AccountValueSelector />
              <ChartControls
                timeRange={timeRange}
                accountType={accountType}
                onTimeRangeChange={handleTimeRangeChange}
                onAccountTypeChange={handleAccountTypeChange}
              />
            </div>

            {/* Chart */}
            <LinearAreaChart
              data={chartData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to generate sample chart data if none provided
function generateSampleChartData(): number[] {
  return [
    0, 0.5, 1, 1.5, 2, 1.8, 2.2, 2.3, 2.1, 1.9, 2.0, 2.2, 2.4, 2.3, 2.5, 2.6,
    2.8, 2.9, 3.0, 2.9, 2.8, 2.7, 2.9, 3.0, 2.9, 3.0, 2.9, 2.8, 2.7, 2.9,
  ];
}
