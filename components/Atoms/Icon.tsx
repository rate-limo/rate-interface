import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface IconProps {
  icon: LucideIcon
  className?: string
  size?: number
}

export function Icon({ icon: IconComponent, className, size = 24 }: IconProps) {
  return <IconComponent className={cn("", className)} size={size} />
}


