import { cn } from '@/lib/utils';

type PriceUSDChangeProps = {
  change: number;
  className?: string;
};

export function TokenPriceUSDChange({
  change,
  className,
}: PriceUSDChangeProps) {
  let status = 'positive';
  if( change === null || change === undefined || change === 0) {
    status = 'neutral';
  }
  if( change < 0) {
    status = 'negative';
  }
  if( change > 0) {
    status = 'positive';
  }

  const getColor = () => {
    if( status === 'positive') {
      return 'text-primary-default';
    }
    if( status === 'negative') {
      return 'text-red-600 dark:text-red-300';
    }
    if( status === 'neutral') {
      return 'text-white';
    }
  }

  const getSign = () => {
    if( status === 'positive') {
      return '+';
    }
    if( status === 'negative') {
      return '-';
    }
    if( status === 'neutral') {
      return '';
    }
  }

  return (
    <span
      className={cn(
        `text-sm ${getColor()}`,
        className,
      )}
    >
      {getSign()}
      {"$" + (change ? Math.abs(change).toFixed(2) : "0.00")} 
    </span>
  );
}
