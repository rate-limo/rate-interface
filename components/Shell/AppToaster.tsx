"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/**
 * The app's toast viewport. One component, thirteen mount points.
 *
 * Every page that raises a toast used to inline its own `<Toaster>` with the
 * same three-token `style` override copied between them, and that override only
 * ever reached the NORMAL variant: `toast.success` and `toast.info` draw their
 * icon, border and close button from sonner's own palette, which sonner selects
 * with `[data-sonner-theme=light|dark]`. Left at the default that attribute is
 * always `light`, so in dark mode a toast rendered a dark Monet surface wearing
 * light-mode furniture — the close button in particular is near-invisible.
 *
 * Two things follow from that, and they are why this is a component rather than
 * a prop added in thirteen places.
 *
 * ## `resolvedTheme`, never `theme`
 *
 * `theme` is the user's CHOICE and is `"system"` for most people; handing that
 * to sonner makes it read `prefers-color-scheme` itself, which is wrong in the
 * one case that matters — an explicit light choice on a dark OS, where the app
 * stamps `data-theme="light"` and sonner would still go dark. `resolvedTheme`
 * is what the page is actually painted in, which is the only thing a toast
 * sitting on that page should match.
 *
 * It is undefined until next-themes has mounted, so this renders `"system"` for
 * the first frame and corrects after — the same hydration rule the consent
 * banner, the OG Pass countdown and `ThemeToggle` follow. Nothing is visible in
 * that frame: a Toaster with no toasts draws nothing.
 *
 * ## The colours are sonner's OWN variables, mapped to Monet
 *
 * Setting `background`/`color` on the toast element leaves sonner's variants
 * untouched. Setting `--normal-*` hands sonner the tokens and lets it style
 * every variant from them. Deliberately NOT the shadcn names an earlier
 * `components/ui/sonner.tsx` used (`--popover`, `--border`): this repo stores
 * those as bare HSL triplets (`214 15% 9%`), so `var(--popover)` is not a
 * colour on its own — the trap `WalletMenu` has a paragraph about.
 *
 * The bottom offset lives in `globals.css` behind `--iter-toast-bottom`,
 * because it has to change at the width the SHELL changes at (1200px, where
 * the status bar appears) and sonner's own `mobileOffset` switches at 600px.
 * Passing the variable through lets a media query own the value.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Toaster
      position="bottom-right"
      closeButton
      theme={mounted && (resolvedTheme === "dark" || resolvedTheme === "light") ? resolvedTheme : "system"}
      offset={{ bottom: "var(--iter-toast-bottom)", right: "24px" }}
      mobileOffset={{ bottom: "var(--iter-toast-bottom)", left: "16px", right: "16px" }}
      style={
        {
          "--normal-bg": "var(--m-surface)",
          "--normal-text": "var(--m-text-primary)",
          "--normal-border": "var(--m-border)",
        } as React.CSSProperties
      }
    />
  );
}
