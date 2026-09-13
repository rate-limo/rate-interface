import Providers from "@/lib/providers";
import type { Metadata } from "next";
import Script from "next/script";
import { satoshi, dmMono } from "@/lib/fonts";
import "../globals.css";
import { ViewTransitions } from "next-view-transitions";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/ThemeProvider";
import PreconnectGateways from "@/components/PreconnectGateways";
// Analytics and Speed Insights are NOT imported here any more: they mount
// inside AnalyticsGate, which renders them only after an explicit accept. A
// banner shown while the tracking script has already loaded is not consent.
import { AnalyticsGate } from "@/components/Legal/AnalyticsGate";
import { CookieConsent } from "@/components/Legal/CookieConsent";
// The two site rows — notice, then trading information — above every page.
// Mounted here and nowhere else; see components/Rows/SiteRows.
import { SiteRows } from "@/components/Rows/SiteRows";

// og:image has to be an absolute URL -- crawlers have no page to resolve a
// relative one against. Without this Next falls back to localhost, so link
// previews break everywhere except a local dev machine. Set
// NEXT_PUBLIC_SITE_URL to the canonical domain; on Vercel the production
// domain is picked up automatically. Note that
// VERCEL_PROJECT_PRODUCTION_URL is the production domain even on preview
// deployments, so a preview's card is served from production -- same
// image, so this is fine. Swap in VERCEL_URL if a preview ever needs to
// unfurl its own build.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Iter - All in one app for Bitcoin, Ethereum & Altcoins",
  description:
    "Iter - We bring all cryptos to operate on your hands, working for you",
  openGraph: {
    title: "Iter - All in one app for Bitcoin, Ethereum & Altcoins",
    description: "Iter - We bring all cryptos to operate on your hands, working for you",
    images: [
      {
        url: "/api/og", // app/api/og/route.ts -- serves the light or dark card by time of day
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "Iter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@iter_cx",
    creator: "@iter_cx",
    images: ["/api/og"],
  },
};

/** One entry per locale, so every localized tree is statically known at build
 * time rather than rendered on demand. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Forwarded to Providers for wagmi's cookie hydration. Without it a connected
  // user's first paint is "disconnected", which reads as a logged-out flash on
  // every navigation — the reason WagmiAdapter is configured with ssr: true.
  const cookie = (await headers()).get("cookie");
  // An unrecognised locale segment is a 404, not a quiet fallback to English:
  // /xx/trade rendering the English page would give every typo its own
  // indexable duplicate of the entire site.
  if (!hasLocale(routing.locales, locale)) notFound();
  // Required for static rendering — without it every page under [locale] opts
  // into dynamic rendering the moment it reads a translation.
  setRequestLocale(locale);
  return (
    <ViewTransitions>
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Time-of-day default theme. Runs before paint and before next-themes
            so there's no flash: if the visitor hasn't explicitly picked a theme
            (no 'theme-manual' flag), choose light for daytime (07:00-19:00
            local) and dark at night, and write it to next-themes' own
            localStorage key so it agrees. An explicit toggle sets the manual
            flag (see ThemeToggle) and sticks. Matches the day/night hero art. */}
        <Script
          id="theme-before-paint"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var K='theme',M='theme-manual',t;try{var man=localStorage.getItem(M)==='1';var s=localStorage.getItem(K);if(man&&(s==='light'||s==='dark'))t=s;}catch(e){}if(!t){var h=new Date().getHours();t=(h>=7&&h<19)?'light':'dark';try{localStorage.setItem(K,t);}catch(e){}}var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t;}catch(e){}})();",
          }}
        />
        <PreconnectGateways />
        {/* TradingView's Charting Library scripts load here upstream. The
            bundle is licensed and not redistributable, so it is not in this
            repository and neither are its script tags — left in place they
            would 404 on every page load. See the stub in
            components/Organisms/TradingView/TradingViewChart.tsx. */}
      </head>
      <body
        /* Satoshi IS the app font (apps/web/CLAUDE.md conventions): the body
           previously defaulted to Inter with Satoshi opt-in per component,
           quietly violating that. font-satoshi resolves var(--font-satoshi). */
        className={`font-satoshi ${satoshi.variable} ${dmMono.variable} bg-neutral-dark-700 flex min-h-screen flex-col`}
      >
        <NextIntlClientProvider>
          <ThemeProvider>
            <Providers cookies={cookie}>
              <SiteRows />
              {children}
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
        <CookieConsent />
        <AnalyticsGate />
      </body>
    </html>
    </ViewTransitions>
  );
}
