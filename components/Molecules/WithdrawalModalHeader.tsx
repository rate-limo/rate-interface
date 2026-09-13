"use client"

import { X } from "lucide-react"
import { Icon } from "../Atoms/Icon"
import { cn } from "@/lib/utils"

interface WithdrawModalHeaderProps {
  withdrawalStatus?: "start" | "processing" | "success"
  onClose?: () => void
}

export function WithdrawModalHeader({ withdrawalStatus = "start", onClose }: WithdrawModalHeaderProps) {
  const getTitle =  (withdrawalStatus: "start" | "processing" | "success") => {
    switch (withdrawalStatus) {
      case "start":
        return "Withdraw to Ethereum"
      case "processing":
        return "Processing Withdrawal"
      case "success":
        return "Withdrawal Successful"
      default:
        return "Withdraw to Ethereum"
    }
  }
  return (
    <div className="w-full h-full flex justify-between items-center">
      <div
        className={ cn(
          "flex items-center gap-2 py-2",
        ) }
      >
        <span
          className={ cn(
            "font-medium text-xl text-neutral-light-default leading-none",
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



