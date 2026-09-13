import { Field } from './Field';
import FieldTab from './FieldTab';
import { InfoRow } from './InfoRow';

type WithdrawModalContentProps = {
  withdrawalStatus?: 'start' | 'processing' | 'success';
  amountAvailable: number;
};

const WithdrawModalStartContent = ({
  amountAvailable,
}: {
  amountAvailable: number;
}) => {
  return (
    <div className="flex w-full flex-col gap-8">
      <p className="text-neutral-dark-100 text-left text-xs text-wrap">
        USDT will be sent over the Ethereum network to the provided address. A
        $1 fee will be deducted from the USDT withdrawn.
        <br />
        <br />
        If you have USDT in your Spot Balances, transfer it to Perps to make it
        available for withdrawal.
        <br />
        <br />
        Withdrawals should arrive within 5 minutes.
      </p>
      <div className="flex w-full">
        <Field
          placeholder="Amount"
          className="h-[37px] w-full"
          postab={
            <FieldTab
              label="Max"
              className="bg-neutral-dark-600 border-neutral-light-white-12 border-l text-sm"
            />
          }
        />
      </div>

      <div className="flex w-full justify-between">
        <span className="text-neutral-dark-100 text-xs">
          Available to withdraw
        </span>
        <span className="text-neutral-light-default text-xs">
          $
          {amountAvailable.toLocaleString(undefined, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
};

export function WithdrawModalContent({
  withdrawalStatus = 'start',
  amountAvailable,
}: WithdrawModalContentProps) {
  const fees = amountAvailable * 0.01;
  const now = new Date();
  const utcTimeString =
    now.getUTCHours().toString().padStart(2, '0') +
    ':' +
    now.getUTCMinutes().toString().padStart(2, '0') +
    ':' +
    now.getUTCSeconds().toString().padStart(2, '0') +
    ' UTC';

  // For UTC date in DD-MM-YY format
  const utcDateString =
    now.getUTCDate().toString().padStart(2, '0') +
    '-' +
    (now.getUTCMonth() + 1).toString().padStart(2, '0') +
    '-' +
    now.getUTCFullYear().toString().slice(-2);
  switch (withdrawalStatus) {
    case 'start':
      return <WithdrawModalStartContent amountAvailable={amountAvailable} />;
    case 'processing':
      return (
        <div className="text-warning-default w-full text-xs">
          Your withdrawal is currently being processed.
        </div>
      );
    case 'success':
      return (
        <div className="flex w-full flex-col gap-6">
          <span className="text-neutral-light-default text-xs">
            Your fund was successfully withdrawn.
          </span>
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full justify-between">
              <span className="text-neutral-dark-100 text-xs">Amount</span>
              <span className="text-neutral-light-default text-xs">
                $
                {amountAvailable.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex w-full justify-between">
              <span className="text-neutral-dark-100 text-xs">Fees</span>
              <span className="text-neutral-light-default text-xs">
                $
                {fees.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="flex w-full justify-between">
              <span className="text-neutral-dark-100 text-xs">Time</span>
              <span className="text-neutral-light-default text-xs">
                {utcTimeString}
              </span>
            </div>
            <div className="flex w-full justify-between">
              <span className="text-neutral-dark-100 text-xs">Date</span>
              <span className="text-neutral-light-default text-xs">
                {utcDateString}
              </span>
            </div>
          </div>
        </div>
      );
    default:
      return <WithdrawModalStartContent amountAvailable={amountAvailable} />;
  }
}
