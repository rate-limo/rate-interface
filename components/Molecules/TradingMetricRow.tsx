import { Label } from '@/components/Atoms/Label';
import { Value } from '@/components/Atoms/Value';
import { cn } from '@/lib/utils';

interface TradingMetricRowProps {
  label: string;
  value: string | number;
  isPercentage?: boolean;
  isCurrency?: boolean;
  isHighlighted?: boolean;
  className?: string;
}

export function TradingMetricRow({
  label,
  value,
  isPercentage = false,
  isCurrency = false,
  isHighlighted = false,
  className,
}: TradingMetricRowProps) {
  let formattedValue = value;

  if (typeof value === 'number') {
    if (isPercentage) {
      formattedValue = `${value.toFixed(2)}%`;
    } else if (isCurrency) {
      formattedValue = `$${value.toFixed(2)}`;
    }
  }

  return (
    <div className={cn('flex items-center justify-between py-1.5', className)}>
      <Label>{label}</Label>
      <Value highlight={isHighlighted}>{formattedValue}</Value>
    </div>
  );
}
