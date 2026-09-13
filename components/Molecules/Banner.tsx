import { cn } from "@/lib/utils";

type BannerProps = {
  text: string;
}

export default function Banner({text}: BannerProps) {
  return (
    <div className={ cn("w-full flex items-center justify-center bg-primary-default py-3") }>
      <span className="font-medium text-sm">{text}</span>
    </div>
  )
}
