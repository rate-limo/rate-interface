import { cn } from '@/lib/utils';

type TokenPriceProps = {
  price: number;
  showUSD?: boolean;
  decimals?: number;
  fontWeight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  className?: string;
};

export function TokenPrice({
  price,
  showUSD = true,
  decimals = 4,
  fontWeight = 'normal',
  className,
}: TokenPriceProps) {
  const formattedPrice = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);

  const fontWeightClass = {
    light: 'font-light',
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  }[fontWeight];

  return (
    <span className={cn('text-sm text-white', fontWeightClass, className)}>
      {showUSD ? "$" : ""}{formattedPrice}
    </span>
  );
}
