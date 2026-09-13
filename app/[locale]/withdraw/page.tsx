import { AppShell } from "@/components/Shell/AppShell";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { WithdrawView } from "@/components/Transfer/WithdrawView";
import { readDisplaySlug } from "@/lib/routing/chainParams";

/** Money out, as a page. See the note in the deposit page about the URL shape. */
interface PageProps {
  searchParams: Promise<{ chain?: string }>;
}

export default async function WithdrawPage({ searchParams }: PageProps) {
  const network = readDisplaySlug("withdraw", await searchParams);

  return (
    <MarketPageProvider networkSlugInput={network}>
      <AppShell>
        <WithdrawView />
      </AppShell>
    </MarketPageProvider>
  );
}
