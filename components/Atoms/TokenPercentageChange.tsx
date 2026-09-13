import { cn } from '@/lib/utils';

type PercentageChangeProps = {
  change: number;
  className?: string;
};

export function TokenPercentageChange({
  change,
  className,
}: PercentageChangeProps) {
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
      return '';
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
      {change ? change.toFixed(2) + '%' : '0.0%'} 
    </span>
  );
}
