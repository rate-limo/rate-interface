import Link from "next/link";
import { clsx } from "clsx";

type ButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  className?: string;
};

export function Button({ href, children, variant = "solid", className }: ButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-6 py-3 font-mono-brand text-xs font-medium tracking-[0.14em] uppercase transition-colors duration-200",
        variant === "solid" &&
          "bg-purple-400 text-on-primary hover:bg-purple-500",
        variant === "outline" &&
          "border border-dark-grey-2 text-white hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300",
        className,
      )}
    >
      {children}
    </Link>
  );
}
