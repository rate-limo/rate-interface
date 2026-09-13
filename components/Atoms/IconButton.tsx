"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "./Icon"

interface IconButtonProps {
  icon: LucideIcon
  onClick?: () => void
  className?: string
  size?: number
  label?: string
}

export function IconButton({ icon, onClick, className, size = 20, label }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full focus:outline-none", className)}
      aria-label={label}
    >
      <Icon icon={icon} size={size} />
    </button>
  )
}


