import { cn } from '@/lib/utils';

type TokenMiniChartProps = {
  data: number[];
  isPositive?: boolean;
  className?: string;
  width?: number;
  height?: number;
};

export function TokenMiniChart({
  data = [],
  isPositive = true,
  className,
  width = 100,
  height = 30,
}: TokenMiniChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Normalize data between 0 and 1
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const normalizedData =
    range === 0
      ? data.map(() => 0.5)
      : data.map(value => (value - min) / range);

  // Create path
  const points = normalizedData.map((value, index) => {
    // Handle single data point case
    const x = normalizedData.length === 1 ? width / 2 : (index / (normalizedData.length - 1)) * width;
    const y = height - value * height;
    return `${x},${y}`;
  });

  const path = `M${points.join(' L')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(
        'stroke-current',
        isPositive ? 'text-success-300' : 'text-error-300',
        className,
      )}
    >
      <path
        d={path}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
