import { cn } from '@/lib/utils';

type PercentageChangeProps = {
  change: number;
  className?: string;
};

export function TokenPercentageChange({
  change,
  className,
}: PercentageChangeProps) {
  const isPositive = change >= 0;

  return (
    <span
      className={cn(
        `text-sm ${isPositive ? 'text-primary-default' : 'text-red-600 dark:text-red-300'}`,
        className,
      )}
    >
      {isPositive ? '+' : ''}
      {change.toFixed(2)} %
    </span>
  );
}
