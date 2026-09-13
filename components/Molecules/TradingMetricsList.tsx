import { cn } from '@/lib/utils';
import { TradingMetricRow } from '@/components/Molecules/TradingMetricRow';

export interface TradingMetric {
  label: string;
  value: string | number;
  isPercentage?: boolean;
  isCurrency?: boolean;
  isHighlighted?: boolean;
}

interface TradingMetricsListProps {
  metrics: TradingMetric[];
  className?: string;
}

export function TradingMetricsList({
  metrics,
  className,
}: TradingMetricsListProps) {
  return (
    <div className={cn('flex flex-col space-y-1', className)}>
      {metrics.map((metric, index) => (
        <TradingMetricRow
          key={index}
          label={metric.label}
          value={metric.value}
          isPercentage={metric.isPercentage}
          isCurrency={metric.isCurrency}
          isHighlighted={metric.isHighlighted}
        />
      ))}
    </div>
  );
}
