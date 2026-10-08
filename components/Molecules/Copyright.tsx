interface CopyrightProps {
  companyName?: string
  year?: number
}

export function Copyright({ companyName = "Rate", year = 2026 }: CopyrightProps) {
  return (
    <span className="text-xs font-normal text-neutral-light-default px-4">
      {companyName} © <span className="text-primary-default">{year}</span>
    </span>
  )
}


