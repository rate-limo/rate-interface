"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-neutral-light-white-12 dark:bg-neutral-dark-default data-[state=checked]:bg-primary-default data-[state=checked]:text-neutral-dark-default dark:data-[state=checked]:bg-primary-default data-[state=checked]:border-neutral-light-white-12 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-6.5 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-neutral-dark-700 disabled:border-neutral-dark-600 hover:bg-neutral-dark-700 hover:border-neutral-light-white-12 disabled:text-neutral-dark-500",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none p-0.5"
      >
        <CheckIcon size={6} className="size-5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
