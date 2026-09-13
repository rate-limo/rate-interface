import { cn } from '@/lib/utils';
import { type TransactionStatus as TxStatus } from '@/data/samples';

type TransactionStatusProps = {
  status: TxStatus;
  className?: string;
};

export function TransactionStatus({
  status,
  className,
}: TransactionStatusProps) {
  return (
    <span
      className={cn(
        'text-base',
        status === 'Success' && 'text-success-300',
        status === 'Failed' && 'text-error-300',
        status === 'Processing' && 'text-warning-300',
        className,
      )}
    >
      {status}
    </span>
  );
}
