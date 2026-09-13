import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Icon } from '../Atoms/Icon';

interface ChartControlsProps {
  timeRange?: string;
  accountType?: string;
  onTimeRangeChange?: (timeRange: string) => void;
  onAccountTypeChange?: (accountType: string) => void;
  className?: string;
}

export function ChartControls({
  timeRange = '30D',
  accountType = 'Perps',
  onTimeRangeChange,
  onAccountTypeChange,
  className,
}: ChartControlsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        className="bg-neutral-dark-700 hover:bg-neutral-dark-600 rounded-md px-2 py-2 text-sm text-white inline-flex items-center justify-center gap-0"
        onClick={() => onAccountTypeChange?.(accountType)}
      >
        {accountType}
        <Icon icon={ChevronDown} size={9} className='text-neutral-light-white-12'/>
      </button>

      <button
        className="bg-neutral-dark-700 hover:bg-neutral-dark-600 rounded-md px-[10px] py-2 text-sm text-white inline-flex items-center justify-center gap-0"
        onClick={() => onTimeRangeChange?.(timeRange)}
      >
        {timeRange}
        <Icon icon={ChevronDown} size={9} className='text-neutral-light-white-12'/>
      </button>
    </div>
  );
}
