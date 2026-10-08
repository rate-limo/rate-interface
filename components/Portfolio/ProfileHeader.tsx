"use client";

import Link from "next/link";
import { ChartLine, Gift, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { cn } from "@/lib/utils";
import { chainColor, chainShort } from "@/lib/portfolio/mock";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useProfile } from "@/hooks/useProfile";
import {
  addressGradient,
  displayHandle,
  displayName as accountDisplayName,
  formatJoined,
  profileImageUrl,
} from "@/lib/portfolio/profile";
import { money } from "./parts";
import { reportUsdBalance } from "@/lib/balances/report";
import { toast } from "sonner";
import { EditProfileModal } from "./EditProfileModal";
import { chainIconFrom, useChainBrand } from "@/lib/chains/useChainBrand";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";

/**
 * The portfolio page's social profile header — replaces the old thin topbar
 * (gradient dot + short address + chain dots + net worth + Refresh, all
 * inlined in `PortfolioView`). Fetches its own data via `useAccountProfile`
 * so `PortfolioView` stays a layout/composition file rather than growing a
 * second concern; net worth and the refresh control are still the caller's
 * (they're portfolio-wide, not identity), passed in as props.
 *
 * `avatarUrl`/`bannerUrl` are null for every wallet today (no upload flow
 * exists yet) — `addressGradient` derives a deterministic, address-dependent
 * look instead, the same hash-to-palette approach `lib/swap/tokens.ts`'s
 * `tokenColor` already uses, so two wallets render visibly different rather
 * than both falling back to the same fixed `--m-primary`/`--m-logo` pair.
 *
 * ## Two profile stores, overlaid
 *
 * `Edit profile` opens `EditProfileModal`, which saves through
 * `PUT /api/profile` into `admin.profiles`. This header's other data comes from
 * `/api/account/:address` (`broker.accountProfiles`) — a DIFFERENT table since
 * the 2026-08-15 merge repointed that route, and neither is a superset: only
 * `admin.profiles` carries `username`/`bio`, only `accountProfiles` carries the
 * `createdAt` behind "Joined" and the follower/trade counts.
 *
 * So both are read and the editable fields are overlaid from the store the
 * modal actually writes (see `useProfile`). Without that overlay the modal
 * saves successfully, toasts, and changes nothing on screen — which is why the
 * button shipped disabled rather than merely unwired. Merging the two tables is
 * the real fix and would delete this overlay.
 *
 * Editing is gated on the viewer BEING the wallet: the gateway verifies a
 * signature over the address either way, so this only avoids offering a control
 * whose write the server would refuse — which matters once a read-only
 * `/wallet/[address]` page exists.
 *
 * "No hold time" from the target mock has no data source anywhere — not even
 * an approximate one — so it is omitted rather than shown with the `Est`
 * marker; that marker (see `Creator.tsx`) is for values this app can
 * *approximate*, and there is no approximation here to caveat, only an
 * absence. The meta row therefore reads "N chains · N trades · Joined …",
 * all real.
 */
export function ProfileHeader({
  address,
  networkName,
  chains,
  netWorthUsd,
  netWorthLoading,
  onRefresh,
  spinning,
  onOpenReferrals,
}: {
  address: string;
  networkName: string;
  chains: { network: string }[];
  netWorthUsd: number;
  netWorthLoading: boolean;
  onRefresh: () => void;
  spinning: boolean;
  /** Opens the Referrals tab, where the wallet's invite link and code live. */
  onOpenReferrals: () => void;
}) {
  const { data: chainBrands } = useChainBrand();
  const { data: account, isLoading } = useAccountProfile(networkName, address);
  const { data: profile, setProfile } = useProfile(networkName, address);
  const { address: connected } = useAccount();
  // Straight from wagmi, like every other signing hook in this app — `lib/wallet`
  // is the CONNECT seam, not the transaction one (see apps/web/CLAUDE.md).
  const { signMessageAsync } = useSignMessage();
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);

  /**
   * Record today's portfolio value.
   *
   * This used to happen by itself, on every balance refresh, unsigned. The
   * write is signed now (the figure is rendered on public profiles, so it has
   * to be attributable to the wallet claiming it) and a wallet prompt cannot
   * hang off a background read that runs on an interval — so recording became
   * a deliberate action, and this button is it. Without one, nothing writes
   * `accountBalanceDayBuckets` at all and the profile's 1D/1W/1M chart stays
   * permanently empty.
   *
   * Once a day is enough: the bucket is keyed `(account, index)` on the UTC
   * day, so a second write the same day replaces the first rather than adding
   * a point.
   */
  const recordValue = async () => {
    if (recording || netWorthLoading) return;
    setRecording(true);
    try {
      const result = await reportUsdBalance({
        address,
        balanceUsd: netWorthUsd,
        signMessageAsync,
      });
      if (result.ok) toast.success("Value recorded");
      // A declined signature is the user's decision, not a failure to report.
      else if (!("rejected" in result)) toast.error(result.error);
    } finally {
      setRecording(false);
    }
  };

  const isSelf = !!connected && connected.toLowerCase() === address.toLowerCase();
  const gradient = addressGradient(address);
  const gradientCss = `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`;

  // The editable store wins where it has a value; the account profile is the
  // fallback, so a wallet that has never opened this modal renders exactly as
  // it did before.
  const shownName = profile?.displayName ?? accountDisplayName(account);
  const shownHandle = profile?.username ?? displayHandle(account);
  const avatarSrc = profileImageUrl(networkName, profile?.avatarUrl ?? null) ?? account.profile.avatarUrl;
  const bannerSrc = profileImageUrl(networkName, profile?.bannerUrl ?? null) ?? account.profile.bannerUrl;

  return (
    <div className="mb-4 overflow-hidden rounded-[15px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      {/* banner */}
      <div className="relative h-[110px] w-full sm:h-[150px]" style={{ backgroundImage: gradientCss }}>
        {bannerSrc && (
          // eslint-disable-next-line @next/next/no-img-element -- external, unknown host
          <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
        )}
        {isSelf && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit banner"
            aria-label="Edit banner"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface)]/80 text-[color:var(--m-text-secondary)] backdrop-blur-sm transition-colors hover:text-[color:var(--m-text-primary)]"
          >
            ✏
          </button>
        )}
      </div>

      <div className="px-5 pb-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* avatar, overlapping the banner's bottom edge */}
          <div
            className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-[color:var(--m-surface)] sm:-mt-12 sm:h-24 sm:w-24"
            style={{ backgroundImage: gradientCss }}
          >
            {avatarSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- external, unknown host
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 pt-2.5">
            <div className="min-w-0">
              {isLoading ? (
                <>
                  <Skel className="h-4 w-32 rounded" />
                  <Skel className="mt-1.5 h-3 w-24 rounded" />
                </>
              ) : (
                <>
                  <div className="truncate text-[17px] font-semibold text-[color:var(--m-text-primary)]">
                    {shownName}
                  </div>
                  <div className="truncate font-mono text-[12.5px] text-[color:var(--m-text-secondary-2)]">
                    @{shownHandle}
                  </div>
                  {/* Only rendered when set — an empty line here would read as a
                      broken field rather than an unfilled one. */}
                  {profile?.bio && (
                    <p className="mt-1 max-w-[46ch] text-[12.5px] text-[color:var(--m-text-secondary)]">
                      {profile.bio}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 border-l border-[color:var(--m-border)] pl-4 text-center">
              <StatPair value={account.social.following} label="Following" loading={isLoading} />
              <StatPair value={account.social.followers} label="Followers" loading={isLoading} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/*
                * DEPOSIT AND WITHDRAW, on the page that shows the money.
                *
                * The portfolio had neither. It reports a net worth, lists every
                * balance and every position, and offered no way to add to any
                * of it or take any of it out — the two routes existed and were
                * reachable only from the shell's own navigation, so the screen
                * a user lands on after a swap was a dead end for the one thing
                * they are most likely to want next.
                *
                * Beside the net worth rather than in the Assets panel: these
                * move the whole account, not one row, and the figure they change
                * is the one being read right here.
                *
                * Self only. A visitor reading somebody else's portfolio cannot
                * deposit to it — the address is not theirs and the wallet
                * signing would be — so offering the control would be offering a
                * capability that does not exist, which is the same call the
                * struck-through "Edit logo" makes in the Creator tab.
                */}
              {isSelf && (
                <>
                  <Link
                    href="/deposit"
                    className="rounded-[10px] px-3.5 py-2 font-mono text-xs font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90"
                    style={{ background: "var(--m-primary)" }}
                  >
                    Deposit
                  </Link>
                  <Link
                    href="/withdraw"
                    className="rounded-[10px] border border-[color:var(--m-border)] px-3.5 py-2 font-mono text-xs text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)]"
                  >
                    Withdraw
                  </Link>
                </>
              )}
              {isSelf && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-[10px] border border-[color:var(--m-border)] px-3 py-2 font-mono text-xs text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)]"
                >
                  Edit profile
                </button>
              )}
              <button
                type="button"
                onClick={onRefresh}
                title="Refresh"
                aria-label="Refresh"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[color:var(--m-border)] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
              >
                <RefreshCw size={15} strokeWidth={1.75} aria-hidden className={cn(spinning && "animate-spin")} />
              </button>
              {isSelf && (
                <button
                  type="button"
                  onClick={() => void recordValue()}
                  disabled={recording || netWorthLoading}
                  title="Record today's value, so your profile can chart it"
                  aria-label="Record today's value"
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[color:var(--m-border)] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)] disabled:opacity-50"
                >
                  {/* A chart, because what this does is add today's point to the
                      profile's value chart; the record dot it replaced said nothing. */}
                  <ChartLine size={15} strokeWidth={1.75} aria-hidden className={cn(recording && "animate-pulse")} />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenReferrals}
                title="Your referral link"
                aria-label="Open your referral link"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[color:var(--m-border)] text-[color:var(--m-primary)] transition-colors hover:border-[color:var(--m-primary)]"
              >
                <Gift size={15} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* meta row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--m-border)] pt-3 text-[12.5px] text-[color:var(--m-text-secondary-2)]">
          {/* The marks, then the names. "2 chains · RISE · Arc" counted a list it
              was about to read out — the count is redundant the moment the names
              are there, and it was the first thing on the row. */}
          {chains.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex items-center">
                {chains.map((c, i) => (
                  <span
                    key={c.network}
                    className="block rounded-[30%] ring-[1.5px] ring-[color:var(--m-surface)]"
                    style={{ marginLeft: i === 0 ? 0 : -3 }}
                  >
                    <TokenImageIcon
                      symbol={c.network}
                      color={chainColor(c.network)}
                      logoURI={chainIconFrom(chainBrands, c.network)}
                      size="sm"
                      badge={false}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                ))}
              </span>
              {chains.map((c) => chainShort(c.network)).join(" · ")}
            </span>
          )}
          <span>⇄ {isLoading ? "…" : account.stats.trades.toLocaleString("en-US")} trades</span>
          <span>📅 {isLoading ? "Joined …" : formatJoined(account.profile.joinedAt)}</span>

          <div className="ml-auto text-right">
            <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--m-text-secondary-2)]">
              Net worth · all chains
            </div>
            <div className="text-lg font-semibold tracking-tight tabular-nums text-[color:var(--m-text-primary)]">
              {netWorthLoading ? "…" : money(netWorthUsd)}
            </div>
          </div>
        </div>
      </div>

      {isSelf && (
        <EditProfileModal
          open={editing}
          onOpenChange={setEditing}
          networkName={networkName}
          address={address}
          profile={profile}
          signMessageAsync={signMessageAsync}
          // The server's own response, not the local draft — a handle it
          // normalized or refused to change must not be echoed back as if it
          // had been accepted.
          onSaved={setProfile}
        />
      )}
    </div>
  );
}

function StatPair({ value, label, loading }: { value: number; label: string; loading: boolean }) {
  return (
    <div className="leading-tight">
      {loading ? (
        <Skel className="mx-auto h-4 w-6 rounded" />
      ) : (
        <div className="text-[14px] font-semibold tabular-nums text-[color:var(--m-text-primary)]">
          {value.toLocaleString("en-US")}
        </div>
      )}
      <div className="text-[10.5px] text-[color:var(--m-text-secondary-2)]">{label}</div>
    </div>
  );
}

function Skel({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block animate-pulse", className)}
      style={{ backgroundColor: "var(--m-surface-2)" }}
    />
  );
}
