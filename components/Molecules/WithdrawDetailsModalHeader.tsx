"use client"

import { Check, Clock, X } from "lucide-react"
import { Icon } from "../Atoms/Icon"
import { cn } from "@/lib/utils"
import { TransactionType } from "@/data/samples"

interface WithdrawDetailsModalHeaderProps {
  withdrawalStatus?: "Processing" | "Success" | "Failed"
  onClose?: () => void
  type: TransactionType;
}

export function WithdrawDetailsModalHeader({ withdrawalStatus = "Processing", onClose, type }: WithdrawDetailsModalHeaderProps) {
  const getIcon = (withdrawalStatus: "Processing" | "Success" | "Failed") => {
    if (withdrawalStatus === "Processing") return Clock
    if (withdrawalStatus === "Failed") return X
    return Check;
  }

  const getTextColor = (withdrawalStatus: "Processing" | "Success" | "Failed") => {
    if (withdrawalStatus === "Processing") return "text-warning-default"
    if (withdrawalStatus === "Failed") return "text-error-300"
    return "text-success-300";
  }

  const getTitle =  (withdrawalStatus: "Processing" | "Success" | "Failed") => {
    if (withdrawalStatus === "Processing") return `Processing ${type === "Withdrawn" ? "Withdrawal" : "Deposit"}`
    if (withdrawalStatus === "Failed") return `${type === "Withdrawn" ? "Withdrawal" : "Deposit"} Failed!`
    return `${type === "Withdrawn" ? "Withdrawal" : "Deposit"} Successful`;
  }
  return (
    <div className="w-full flex justify-between items-center px-4">
      <div
        className={ cn(
          "flex items-center gap-2 py-2",
          getTextColor(withdrawalStatus)
        ) }
      >
        <Icon icon={getIcon(withdrawalStatus)} className="" />
        <span
          className={ cn(
            "font-medium text-xl",
          ) }
        >{getTitle(withdrawalStatus)}</span>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-neutral-dark-100">
          <Icon icon={X} className="size-6" />
        </button>
      )}
    </div>
  )
}


