import type { Metadata } from "next";
import { Nav } from "@components/Landing/Nav";
import { AppToaster } from "@/components/Shell/AppToaster";
import { ChainApplyView } from "@/components/Chains/ChainApplyView";

const DESCRIPTION = "Give your chain a real market: an onchain order book, liquidity paid to stay, and a launch venue for your ecosystem. Apply to integrate Rate.";

export const metadata: Metadata = {
  title: "Bring Rate to your chain | Rate",
  description: DESCRIPTION,
  openGraph: { siteName: "Rate", title: "Bring Rate to your chain", description: DESCRIPTION, images: [{ url: "/api/og", width: 1200, height: 630, alt: "Rate" }] },
  twitter: { card: "summary_large_image", images: ["/api/og"] },
};

/**
 * `/integrate` — the chain integration form (lib/chainApply). A form page, not
 * an app page: the landing's header and nothing else — no sidebar, search or
 * status bar, since a chain team arriving here is not using the app.
 *
 * Not under /chains/*: that prefix is rewritten to identity-service and
 * excluded from i18n in proxy.ts, so a page there 404s.
 */
export default function IntegratePage() {
  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[color:var(--m-background)]">
        <ChainApplyView />
      </main>
      <AppToaster />
    </>
  );
}
