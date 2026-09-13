import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { LaunchLanding } from "@/components/Launch/LaunchLanding";
import { Metadata } from "next";
import { Toaster } from "sonner";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import * as motion from "motion/react-client";

/**
 * Create · make a token — reached from the shell's + Create button.
 *
 * Deliberately not a mode on `/pool/new`: that flow's "Launch a pool" opens a
 * pool for tokens that already exist, and this one creates the token. Two things
 * called "launch" doing different jobs is how they get confused, so they are two
 * routes with two vocabularies (LiqMode vs. LaunchStep).
 */

interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const network = readDisplaySlug("create", await searchParams);
  const networkName = supportedNetworkName(network);
  return {
    title: `Create a token | Iter ${networkName}`,
    description: `Create a token on ${networkName}, open its market and seed the book — deploy, listing and first position in one transaction.`,
  };
}

export default async function Launch({ searchParams }: PageProps) {
  const sp = await searchParams;
  const network = readDisplaySlug("create", sp);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="launch-page"
            className="w-full"
          >
            <LaunchLanding networkSlug={network} />
          </motion.div>
        </div>
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: "var(--m-surface)",
              border: "1px solid var(--m-border)",
              color: "var(--m-text-primary)",
            },
          }}
        />
      </AppShell>
    </MarketPageProvider>
  );
}
