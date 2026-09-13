import MenuDropdown from '../Atoms/MenuDropdown';
import { Checkbox } from '../ui/checkbox';
import { Field } from './Field';
import FieldTab from './FieldTab';
import { InfoRow } from './InfoRow';

type DepositModalContentProps = {
  depositStatus?: 'start' | 'processing' | 'success' | 'fail';
  amountAvailable: number;
};

const DepositModalStartContent = () => {
  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex w-full flex-col gap-4">
        <span className="text-neutral-light-default w-full text-2xl font-medium">
          Establish Connection
        </span>
        <p className="text-neutral-dark-100 w-full text-xs text-wrap">
          This signature enables gas-free transactions, unlocking a
          decentralized channel for instant and seamless trading.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox />
        <span className="text-neutral-dark-100 text-xs">Stay Connected</span>
      </div>
    </div>
  );
};

export function DepositModalContent({
  depositStatus = 'start',
  amountAvailable,
}: DepositModalContentProps) {
  switch (depositStatus) {
    case 'start':
      return <DepositModalStartContent />;
    case 'processing':
      return (
        <div className="flex w-full flex-col gap-4">
          <span className="text-neutral-light-default text-sm font-medium">
            Source chain
          </span>
          <MenuDropdown
            values={['Ethereum']}
            placeholder="Ethereum"
            defaultValue="Ethereum"
          />
          <MenuDropdown
            values={['USDT']}
            placeholder="USDT"
            defaultValue="USDT"
          />
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
          <div className="flex w-full justify-between">
            <span className="text-neutral-dark-100 text-xs">
              Available to deposit
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
    case 'success':
      return (
        <div className="flex w-full flex-col gap-4">
          <span className="text-neutral-light-default text-2xl font-medium">
            Deposit Success
          </span>
          <span className="text-neutral-dark-100 text-xs">
            You have successfully deposited{' '}
            <span className="text-primary-default">
              $
              {amountAvailable.toLocaleString(undefined, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </span>
          </span>

          <div className="flex w-full justify-between">
            <span className="text-neutral-dark-100 text-xs">
              Total Balance
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
    case 'fail':
      return (

        <div className="flex w-full flex-col gap-4">
          <span className="text-error-300 text-2xl font-medium">
            Deposit Failed
          </span>
          <span className="text-error-300 text-xs">
            Transaction Failed.
          </span>

          <div className="flex w-full justify-between">
            <span className="text-neutral-dark-100 text-xs">
              Total Balance
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
      )
    default:
      return <DepositModalStartContent />;
  }
}
