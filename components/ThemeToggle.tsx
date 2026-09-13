"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the real theme after mount (it reads localStorage
  // client-side); render a stable placeholder until then to avoid a
  // hydration mismatch / icon flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={`inline-block h-8 w-8 ${className}`} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        // Mark this as an explicit choice so the time-of-day default (see the
        // head script in layout.tsx) stops overriding it on future visits.
        try {
          localStorage.setItem("theme-manual", "1");
        } catch {}
        setTheme(isDark ? "light" : "dark");
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-dark-grey-1 transition-colors hover:text-purple-400 ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
