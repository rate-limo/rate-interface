import { cn } from '@/lib/utils';
import { addCommasInDecimalString, adjustDecimalLength } from '@/utils/number';

type PercentageChangeProps = {
  price: number;
  className?: string;
};

export function PriceChange({
  price,
  className,
}: PercentageChangeProps) {
  let status = 'positive';
  if( price === null || price === undefined) {
    status = 'neutral';
  }
  if( price < 0) {
    status = 'negative';
  }
  if( price > 0) {
    status = 'positive';
  }

  const getColor = () => {
    if( status === 'positive') {
      return 'text-green-600 dark:text-green-300';
    }
    if( status === 'negative') {
      return 'text-red-600 dark:text-red-300';
    }
    if( status === 'neutral') {
      return 'text-white';
    }
  }

  return (
    <span
      className={cn(
        `text-xl ${getColor()}`,
        className,
      )}
    >
      {adjustDecimalLength(Number(price), 8)}
    </span>
  );
}
