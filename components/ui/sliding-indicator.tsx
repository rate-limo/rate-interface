"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { motionTokens } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

/**
 * Scopes a sliding highlight to ONE button group, so it glides between that
 * group's buttons and never flies in from another group on the page.
 *
 * For controls that must stay plain buttons (tests and callers address them by
 * role "button" or test id), where a full Radix Tabs would change their role.
 */
export function SlideGroup({ children }: { children: ReactNode }) {
  return <LayoutGroup id={useId()}>{children}</LayoutGroup>;
}

/**
 * Rendered inside the ACTIVE button only; motion animates it from wherever the
 * previous active button drew it. The button needs `relative`, and its label
 * `relative` (or a z-index) so it sits above the highlight.
 */
export function SlidingIndicator({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      layoutId="slide-indicator"
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      transition={reduced ? { duration: 0 } : motionTokens.spring.morph}
    />
  );
}
