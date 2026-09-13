import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccountValueSelectorProps {
  className?: string;
}

export function AccountValueSelector({ className }: AccountValueSelectorProps) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className="text-sm  px-3 py-2 bg-neutral-dark-700 border border-neutral-dark-700 rounded-full text-white">Account Value</span>
      <div className="text-primary-default bg-neutral-dark-default flex items-center justify-between gap-2 rounded-full px-3 py-2 text-sm  border border-primary-default">
        <span>PNL</span>
        <Check size={16} />
      </div>
    </div>
  );
}
