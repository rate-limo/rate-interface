import { ExternalLink, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface NavMenuItemProps {
  icon: LucideIcon
  title: string
  description: string
  href: string
  isExternal?: boolean
  className?: string
}

export function NavMenuItem({ icon: Icon, title, description, href, isExternal = false, className }: NavMenuItemProps) {
  return (
    <Link
      href={href}
      className={cn("w-60 flex flex-col items-start bg-neutral-dark-700 gap-3 rounded-lg p-3 text-neutral-dark-100 hover:bg-neutral-dark-500 transition-colors", className)}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
        <div className="flex items-center start gap-3">
          <Icon className="mt-1 h-6 w-6 flex-shrink-0" />
          <h3 className="text-sm text-neutral-light-default">{title}</h3>
          {isExternal && <ExternalLink className="h-5 w-5 " />}
        </div>
        <p className="ml-9 text-xs">{description}</p>
    </Link>
  )
}


