import type React from "react"
import { Label } from "../Atoms/Label"
import { Value } from "../Atoms/Value"

interface InfoRowProps {
  label: string
  value: string | React.ReactNode
  highlight?: boolean
}

export function InfoRow({ label, value, highlight = false }: InfoRowProps) {
  return (
    <div className="w-full flex justify-between items-center">
      <Label>{label}</Label>
      <Value highlight={highlight}>{value}</Value>
    </div>
  )
}


