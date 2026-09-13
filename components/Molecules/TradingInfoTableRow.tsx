import { cn } from '@/lib/utils';
import { Icon } from '@/components/Atoms/Icon';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { TransactionStatus } from '@/components/Atoms/TransactionStatus';
import { Button } from '@/components/ui/button';
import {
  type TransactionType,
  type TransactionStatus as TxStatus,
} from '@/data/samples';

type TradingInfoTableRowProps = {
  type: TransactionType;
  amount: string;
  status: TxStatus;
  date: string;
  onViewDetails: () => void;
  className?: string;
};

export function TradingInfoTableRow({
  type,
  amount,
  status,
  date,
  onViewDetails,
  className,
}: TradingInfoTableRowProps) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-5 items-center px-4 py-7',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            type === 'Withdrawn' ? 'bg-error-300/20' : 'bg-success-300/20',
          )}
        >
          {type === 'Withdrawn' ? (
            <Icon icon={ArrowUp} className="text-error-300" size={16} />
          ) : (
            <Icon icon={ArrowDown} className="text-success-300" size={16} />
          )}
        </div>
        <span className="text-neutral-dark-100 text-base">{type}</span>
      </div>

      <div>
        <span className="text-neutral-dark-100 text-base">{amount}</span>
      </div>

      <div>
        <TransactionStatus status={status} />
      </div>

      <div className="text-neutral-dark-100 text-base">{date}</div>

      <Button
        variant="primary"
        size="md"
        onClick={onViewDetails}
        className="bg-primary-default text-neutral-dark-default rounded-full"
      >
        Details
      </Button>
    </div>
  );
}
