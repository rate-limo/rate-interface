import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { DepositView } from "@/components/Transfer/DepositView";
import { readDisplaySlug } from "@/lib/routing/chainParams";

/**
 * Money in, as a page.
 *
 * ## It takes no parameters, and that is the design
 *
 * `SCHEME.deposit` is "none" because this page belongs to a WALLET, which is
 * one address on every chain. The network is not something a link can settle:
 * the ASSET decides it, and choosing the asset is the first thing this page
 * asks. So there is nothing for a URL to say that the page does not ask better.
 *
 * `?chainId=` used to be read here and is gone. It did not preselect — it made
 * the page consider itself settled and suppressed the asset list, so the
 * account menu's Deposit item and a bare `/deposit` were two different screens
 * reached by the same intent, one of them with no way back to a list. `?asset=`
 * was read into a prop that nothing ever used, which is worse than absent: a
 * parameter that looks supported and changes nothing.
 *
 * `?chain=` still resolves through `readDisplaySlug`, because that names the
 * chain the SHELL is displaying, not the one being deposited on.
 */
interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export default async function DepositPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("deposit", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <DepositView />
      </AppShell>
    </MarketPageProvider>
  );
}
