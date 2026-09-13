import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress, getAddress } from "viem";
import { AppShell } from "@/components/Shell/AppShell";
import { SocialColumns } from "@/components/Shell/SocialColumns";
import { MarketPageProvider } from "@/contexts/MarketPageProvider";
import { ProfileView } from "@/components/Profile/ProfileView";
import { sectionFromParam } from "@/components/Profile/section";
import { readDisplaySlug, supportedNetworkName } from "@/lib/routing/chainParams";
import { getAccountProfileForViewer } from "@/queries/server/profile";
import * as motion from "motion/react-client";

/**
 * `/[locale]/profile/[address]` — any wallet's public profile.
 *
 * The sibling of `/portfolio`, which stays the OWNER's view. This one is a read
 * of an address in the URL, so it renders for a logged-out visitor and never
 * shows a connect gate.
 *
 * Shaped exactly like `portfolio/page.tsx`: the same `MarketPageProvider` +
 * `AppShell` wrapper, and `?tab=` read from `searchParams` on the server rather
 * than through `useSearchParams`, which would opt the page out of static
 * rendering unless it were Suspense-wrapped. The provider is here for the same
 * reason it is there — the shared chrome (AppShell / FooterDesktop and their
 * children) calls `useMarketPageContext()` and throws without it.
 *
 * ## The address is validated here, not in the component
 *
 * `getAddress` both validates and checksums, and everything downstream assumes a
 * real address: `broker.*` lookups need the checksummed form and `admin.*` the
 * lowercase one, and a garbage param would otherwise reach a WHERE clause and
 * quietly return an empty profile that looks like a real wallet with no
 * activity. A 404 is the honest answer for a URL that never named a wallet.
 */
/**
 * Profile links had NO metadata at all — no title, no card — so every share of a
 * wallet rendered as a bare URL in every chat client.
 *
 * The image is `/api/og/profile`, generated per request. The title carries the
 * handle rather than the address when there is one: a share is recognised before
 * it is read, and `0x9E7A…850E` is not recognisable.
 *
 * `getAddress` is called again here because `generateMetadata` runs
 * independently of the page body — Next does not share the validation below —
 * and a malformed param must produce a title, not a thrown route.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { address: raw } = await params;
  const sp = await searchParams;
  const chain = typeof sp.chain === "string" ? sp.chain : undefined;

  if (!isAddress(raw)) return { title: "Profile | Iter" };
  const address = getAddress(raw);

  const profile = (await getAccountProfileForViewer(
    supportedNetworkName(chain ?? ""),
    address,
    undefined,
  ).catch(() => null)) as Record<string, any> | null;

  const handle: string =
    profile?.profile?.displayName ??
    profile?.profile?.handle ??
    `${address.slice(0, 6)}…${address.slice(-4)}`;

  const title = `${handle} on Iter`;
  const description = "Portfolio, trades and launched coins on Iter.";
  const image = `/api/og/profile?address=${address}${chain ? `&chain=${encodeURIComponent(chain)}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: title }],
    },
  };
}

export default async function Main({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);

  const search = await searchParams;
  /**
   * `?chain=` is HONOURED, not ignored.
   *
   * This page is a mix, and that is why the param matters. Identity, follows,
   * posts and the balance series come from the shared identity database and
   * read the same from any chain's gateway; positions and PnL fan out across
   * every chain. But Coins created, Activity, Rewards and Volume are read from
   * ONE gateway, so the chain decides what they show.
   *
   * It used to hardcode the default while `FollowListModal` and `CoinList`
   * emitted `?chain=` on the links they generated — so following a chain-scoped
   * link from this very page landed on the default chain and rendered "no
   * trades", "hasn't created any coins" and "$0 volume" for a busy wallet.
   * A URL must not promise a scope the page discards.
   *
   * `readDisplaySlug` is the same helper every other chain-scoped page uses, so
   * an unknown or unsupported slug resolves to the default here exactly as it
   * does on /launch or /trade rather than by a rule invented for this page.
   */
  const network = readDisplaySlug("profile", search);
  const initialSection = sectionFromParam(search.tab);

  return (
    <MarketPageProvider networkSlugInput={network}>
      {/* AppShell owns the top bar and the StatusBar at the foot; `headerContent`
          is this page's half of the top one. The address rather than a generic
          "Profile": the bar is the one piece of chrome that persists across
          navigations, so it should say WHICH wallet is open. */}
      <AppShell
        headerContent={
          <div className="font-mono text-sm font-semibold text-[color:var(--m-text-primary)]">
            {`${address.slice(0, 6)}…${address.slice(-4)}`}
          </div>
        }
      >
        <div className="relative isolate min-h-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            id="profile-page"
            className="w-full"
          >
            {/* The leaderboard and Top trades rails come from SocialColumns and
                are shared with /home — see that component. ProfileView is the
                centre slot: it already owns no page chrome and sits in a fixed
                column, which is exactly the shape this layout expects. */}
            <SocialColumns
              networkSlug={network}
              subjectAddress={address}
              topTradesTitle="Top trades"
            >
              <ProfileView
                address={address}
                networkSlug={network}
                initialSection={initialSection}
              />
            </SocialColumns>
          </motion.div>
        </div>
      </AppShell>
    </MarketPageProvider>
  );
}
