"use client"

import { X } from "lucide-react"
import { Icon } from "../Atoms/Icon"
import { cn } from "@/lib/utils"

interface DepositModalHeaderProps {
  depositStatus?: "start" | "processing" | "success" | "fail"
  onClose?: () => void
}

export function DepositModalHeader({ depositStatus = "start", onClose }: DepositModalHeaderProps) {
  const getTitle =  (depositStatus: "start" | "processing" | "success" | "fail") => {
    switch (depositStatus) {
      case "start":
        return "Step 1/3"
      case "processing":
        return "Step 2/3"
      case "success":
        return "Step 3/3"
      case "fail":
        return "Step 3/3"
      default:
        return "Step 1/3"
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
        >{getTitle(depositStatus)}</span>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-neutral-dark-100">
          <Icon icon={X} className="size-6" />
        </button>
      )}
    </div>
  )
}




