import { ArrowDown, ArrowLeftRight, ArrowUp } from "lucide-react";
import { Icon } from "../Atoms/Icon";
import { ButtonGroup } from "../Molecules/ButtonGroup";
import PortfolioDashboardContent from "../Molecules/PortfolioDashboardContent";
import { useState } from "react";
import { WithdrawalModal } from "./WithdrawalModal";
import { DepositModal } from "./DepositModal";

export default function PortfolioDashboard() {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const portfolioButtons:({ label: React.ReactNode, variant: "primary" | "secondary", size: "lg" | "md" | "sm", onClick: () => void, className: string })[] = [
    {
      label: (
        <div className="flex gap-2">
        <Icon icon={ArrowDown}/>
          Deposit
        </div>
      ),
      variant: "primary",
      size: "lg",
      onClick: () => setIsDepositModalOpen(true),
      className: "w-full"
    },
    {
      label: (
        <div className="flex gap-2">
        <Icon icon={ArrowUp}/>
          Withdraw
        </div>
      ),
      variant: "primary",
      size: "lg",
      onClick: () => setIsWithdrawModalOpen(true),
      className: "w-full"
    },
    {
      label: (
        <div className="flex gap-2">
        <Icon icon={ArrowLeftRight}/>
          Transfer
        </div>
      ),
      variant: "primary",
      size: "lg",
      onClick: () => console.log('deposit'),
      className: "w-full"
    },
  ];

  return (
    <div className="w-full flex flex-col items-start gap-[3.75rem]">
      <PortfolioDashboardContent value={12317} change={-20} />

      <ButtonGroup
        buttons={portfolioButtons}
        className="p-0 gap-3 w-full border-transparent bg-transparent"
      />
      <WithdrawalModal open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}/>
      <DepositModal open={isDepositModalOpen} onOpenChange={setIsDepositModalOpen}/>
    </div>
  )
}
