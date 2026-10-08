"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * `nonce` is the request's CSP nonce, read by the layout from the header
 * `proxy.ts` sets. next-themes injects an inline script before paint to apply
 * the stored theme, and under the nonce-based script policy an inline script
 * without the nonce is a violation. Absent in tests and in the shell-less
 * pages, where there is no policy to satisfy.
 */
export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}
