import { InfoRow } from './InfoRow';

type WithdrawDetailsModalContentProps = {
  amount: number;
  date: Date;
  address: string;
  estimatedTime?: number;
  withdrawalStatus?: 'Processing' | 'Success' | 'Failed';
};

export function WithdrawDetailsModalContent({
  amount,
  date,
  address,
  estimatedTime,
  withdrawalStatus = 'Processing',
}: WithdrawDetailsModalContentProps) {
  if (withdrawalStatus === 'Failed') {
    return (
      <div className="bg-neutral-dark-700 flex w-full flex-col rounded-xl">
        <p className="text-neutral-dark-100 text-xs">
          There was an error withdrawing your tokens. Please try again later. If
          any tokens were deducted, they will be returned to your wallet within
          48 hours.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-neutral-dark-700 flex w-full flex-col gap-4 rounded-xl p-4">
      <InfoRow label="Amount" value={`$${amount}`} />
      <InfoRow
        label="Date"
        value={date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      />
      <InfoRow label="Withdrawn to" value={address} />
      {withdrawalStatus === 'Processing' && estimatedTime && (
        <InfoRow
          label="Estimated Time"
          value={`${estimatedTime}mins`}
          highlight
        />
      )}
    </div>
  );
}
