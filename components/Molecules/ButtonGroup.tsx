import type React from "react"
import { Button } from "@components/ui/button"
import { cn } from "@lib/utils"

export interface ButtonGroupProps {
  buttons: ({ label: React.ReactNode, active?: string })[]
  className?: string
  size?: "large" | "small"
  variant?: "primary" | "neutral" | "transparent" | "tab" | "border";
}

export const ButtonGroup = ({ buttons, className, size = "small", variant = "primary" }: ButtonGroupProps) => {
  return (

    <div className={cn(
      "flex p-2 items-center justify-center border rounded-full border-neutral-light-white-12",
      size === "large" ? "gap-3" : "gap-2",
      className
    )}>
      {buttons.map((button, index) => (
        <Button
          key={index}
          size={size === "large" ? "lg" : "xs"}
          variant={button.active === "active" ? "primary" : "neutral"}
          {...button}
          className="rounded-full cursor-pointer"
        >
          {button.label}
        </Button>
      ))}
    </div>
  )
}


