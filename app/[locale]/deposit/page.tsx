import { AppToaster } from "@/components/Shell/AppToaster";
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
 * reached by the same intent, one of them with no way back to a list.
 *
 * `?asset=` is REAL as of 2026-09-18. It used to be read into a prop nothing
 * used — worse than absent, a parameter that looks supported and changes
 * nothing — and is now what the portfolio's per-asset Deposit button carries.
 * It only PRESELECTS: the asset list stays on screen and stays changeable,
 * which is the whole difference from the `?chainId=` that was removed. A symbol
 * nobody serves selects nothing and the page opens as it always did, so a stale
 * link degrades to the default rather than to an error.
 *
 * `?chain=` still resolves through `readDisplaySlug`, because that names the
 * chain the SHELL is displaying, not the one being deposited on.
 */
interface PageProps {
  searchParams: Promise<{ chain?: string; asset?: string }>;
}

export default async function DepositPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const network = readDisplaySlug("deposit", params);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <DepositView initialAsset={params.asset} />
        {/* This page raised toasts and mounted nothing to draw them.
            `ClaimDeposit` has announced a found transfer with `toast.success`
            since it was written, and on /deposit that call rendered NOTHING —
            the same gap /pool/deposit had. Per page rather than in AppShell:
            SwapFlow, PortfolioView, ProfileView and ClaimView each mount their
            own, so a shell-level Toaster would stack a second one on every page
            that renders them. Same props and same corner as /pool/new. */}
        <AppToaster />
      </AppShell>
    </MarketPageProvider>
  );
}
