import { Metadata } from "next";
import { Nav } from "@components/Landing/Nav";
import { Hero } from "@components/Landing/Hero";
import { CoreIdeas } from "@components/Landing/CoreIdeas";
import { Receipts } from "@components/Landing/Receipts";
import { Primitives } from "@components/Landing/Primitives";
import { AgentDeskSection } from "@components/Landing/AgentDeskSection";
import { ParticipantFlywheel } from "@components/Landing/ParticipantFlywheel";
import { Transparency } from "@components/Landing/Transparency";
import { FinalCta } from "@components/Landing/FinalCta";
import { Footer } from "@components/Landing/Footer";
// `LoginRouter` was mounted here as well as in AppShell, and pushed any
// connected wallet to /welcome. Removed from THIS page on 2026-08-08 and
// deliberately not restored: a returning visitor's wallet reconnects on load, so
// it threw people reading the pitch into a signup flow they had not asked for.
// Onboarding now triggers from the app shell only — see components/Onboarding/
// LoginRouter. Nothing on this page reads wallet state as a result, though wagmi
// still arrives via `Providers` in the layout, so that is one import saved
// rather than a wallet-free page.

// The notice and trading rows used to be rendered here. They moved into the
// root layout on 2026-08-04 so every page carries them, which is also where
// their operator copy is now read — see components/Rows/SiteRows. Rendering
// either one here as well would stack a second copy under the first.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Iter — the way to trade on-chain";
  const description =
    "One open on-chain order book. Every fill at a price you chose — self-custody the whole way.";

  return {
    title,
    description,
    openGraph: {
      siteName: "Iter",
      title,
      description,
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
      images: ["/api/og"],
    },
  };
}

export default function Home() {
  return (
    <>
      <Nav />
      {/*
        `TwoProblems` and `History` were removed from this page on 2026-08-06.
        The hero now carries a still of the swap card, and the partial fill it
        shows — with the three things the remainder can do — is the argument
        those two sections took a screen each to build up to.

        Both components are still in the tree, unimported, the same way
        `Sections/Navbar/Desktop` and `Organisms/NavMenu` were kept. Cutting
        two sections of written argument should stay reversible.

        Note what left with them: `History` was the only place that argued an
        order book beats a curve. The card demonstrates what the remainder
        does; it does not make that case. If it is wanted, `CoreIdeas` is
        where it goes.
      */}
      <main>
        <Hero />
        <CoreIdeas />
        <Receipts />
        <Primitives />
        <AgentDeskSection />
        <ParticipantFlywheel />
        <Transparency />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
