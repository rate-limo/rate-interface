"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import { Copy, Check, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  displayHandle,
  displayName as accountDisplayName,
  formatJoined,
  profileImageUrl,
} from "@/lib/portfolio/profile";
import { ProfileAvatar, ProfileBanner } from "./ProfileAvatar";
import { RankStrip } from "./RankStrip";
import { EditProfileModal } from "@/components/Portfolio/EditProfileModal";
import { ShareProfileModal } from "./ShareProfileModal";
import type { ProfileData } from "@/lib/portfolio/profile";
import type { AccountProfile } from "@/lib/portfolio/types";
import { useFollow } from "@/hooks/useFollow";
import { FollowListModal } from "./FollowListModal";
import type { FollowDirection } from "@/hooks/useFollowList";
import { compactNumber } from "@/lib/format/compact";

/**
 * The public profile's identity card — banner, avatar, name, follow.
 *
 * Deliberately NOT `Portfolio/ProfileHeader`. That one is the OWNER's header: it
 * carries Edit profile, a refresh control and a rewards drawer, and it takes net
 * worth as a prop because the portfolio page computes it. This one is a read
 * surface for any wallet and owns none of that; the two would fight if merged,
 * and the merge would put owner-only controls one boolean away from rendering on
 * a stranger's page.
 *
 * What IS shared is the derivation: `addressGradient`, `displayName`,
 * `displayHandle`, `formatJoined` and `profileImageUrl` all come from
 * `lib/portfolio/profile`, so a wallet with no avatar renders the same colours
 * here as it does there rather than getting a second identity.
 *
 * ## Two profile stores, overlaid — same as the portfolio header
 *
 * `/api/account/:address` (`broker.accountProfiles`) has the created date and
 * the counts; `/api/profile/:address` (`admin.profiles`) has username and bio.
 * Neither is a superset, so both are read and the editable fields are overlaid
 * from the store the edit modal actually writes. See `useProfile` for the full
 * note; merging the tables is the real fix and would delete the overlay.
 */
export function IdentityCard({
  address,
  networkName,
  networkSlug,
  account,
  profile,
  isLoading,
  viewerFollows,
  onProfileSaved,
}: {
  address: string;
  networkName: string;
  /** Only used to keep the chain on links out of the follow list. */
  networkSlug: string;
  account: AccountProfile;
  profile: ProfileData | null;
  isLoading: boolean;
  /** From `?viewer=` on the account read. Null when unknown — see `useFollow`. */
  viewerFollows: boolean | null;
  /**
   * Seeds the profile cache with what the save returned, so the card repaints on the
   * tick the modal closes. Owned by `ProfileView` because the same query backs the
   * rest of the page; a local copy here would leave the other cards stale.
   */
  onProfileSaved: (profile: ProfileData) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { signMessageAsync } = useSignMessage();
  // `null` is closed. Storing the DIRECTION rather than a boolean plus a
  // separate tab means the count that was clicked is the tab that opens.
  const [followList, setFollowList] = useState<FollowDirection | null>(null);

  const { following, followers, pending, isSelf, toggle } = useFollow({
    networkName,
    address,
    initialFollowing: viewerFollows,
    initialFollowers: account.social.followers,
  });

  const shownName = profile?.displayName ?? profile?.username ?? accountDisplayName(account);
  const shownHandle = profile?.username ?? displayHandle(account);
  const avatarSrc =
    profileImageUrl(networkName, profile?.avatarUrl ?? null) ?? account.profile.avatarUrl;
  const bannerSrc =
    profileImageUrl(networkName, profile?.bannerUrl ?? null) ?? account.profile.bannerUrl;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="overflow-hidden rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-sm">
      <ProfileBanner address={address} src={bannerSrc} className="h-[150px]" />

      <div className="flex flex-col gap-3 px-[18px] pb-4">
        <div className="flex items-start gap-3.5">
          <ProfileAvatar
            address={address}
            name={shownName}
            src={avatarSrc}
            size={96}
            className="-mt-[42px] border-4 border-[color:var(--m-surface)] shadow-sm"
          />

          <div className="min-w-0 flex-1 pt-2.5">
            {isLoading ? (
              <>
                <span className="block h-5 w-36 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
                <span className="mt-2 block h-3 w-24 animate-pulse rounded bg-[color:var(--m-surface-2)]" />
              </>
            ) : (
              <>
                <h1 className="truncate text-[23px] font-extrabold leading-tight tracking-[-0.028em] text-[color:var(--m-text-primary)]">
                  {shownName}
                </h1>
                <p className="mt-0.5 truncate font-mono text-[12px] text-[color:var(--m-text-secondary-2)]">
                  @{shownHandle}
                </p>
              </>
            )}

            <div className="mt-2 flex items-center gap-4 text-[13.5px] text-[color:var(--m-text-secondary)]">
              <CountButton
                value={followers}
                label="Followers"
                onClick={() => setFollowList("followers")}
              />
              <CountButton
                value={account.social.following}
                label="Following"
                onClick={() => setFollowList("following")}
              />
            </div>

            {/* Standing, directly under the counts it belongs with — see
                `RankStrip` for why it is here and not in the stat card. */}
            <RankStrip address={account.address} />

            <p className="mt-1.5 text-[12.5px] text-[color:var(--m-text-secondary)]">
              {isLoading ? "…" : `Account ${formatJoined(account.profile.joinedAt).toLowerCase()}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSelf ? (
            // Their own profile: edit it HERE. This was a link to /portfolio, on the
            // argument that a read surface should not carry the modal — but the button
            // sits under the very banner and avatar it edits, so being navigated to
            // another page reads as the control being broken, and what the user came
            // to change is not even on the page they land on.
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-2 text-[13px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)]"
            >
              Edit profile
            </button>
          ) : (
            <button
              type="button"
              onClick={toggle}
              // Not disabled when disconnected: the click asks for a wallet.
              disabled={pending}
              className={cn(
                "rounded-[11px] border px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                following
                  ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] text-[color:var(--m-primary)]"
                  : "border-[color:var(--m-primary)] bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]",
              )}
            >
              {pending ? "…" : following ? "Following" : "Follow"}
            </button>
          )}

          <button
            type="button"
            onClick={copyAddress}
            className="inline-flex items-center gap-2 rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 font-mono text-[11.5px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)]"
            aria-label="Copy address"
          >
            {`${address.slice(0, 6)}…${address.slice(-4)}`}
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            // This copied `window.location.href` and then called `setCopied(false)`,
            // which CLEARS the only feedback the card has — so the button silently
            // did nothing, and what it silently did was publish the reader's own
            // `?viewer=` address along with the link. It opens the share sheet now.
            onClick={() => setSharing(true)}
            aria-label="Share profile"
            className="inline-flex items-center justify-center rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-2.5 py-2 text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)]"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Only when set — an empty line here reads as a broken field rather
            than an unfilled one. Same rule the portfolio header follows. */}
        {profile?.bio && (
          <p className="border-t border-[color:var(--m-border)] pt-3 text-[13.5px] text-[color:var(--m-text-secondary-2)]">
            {profile.bio}
          </p>
        )}
      </div>

      <FollowListModal
        open={followList !== null}
        onOpenChange={(next) => !next && setFollowList(null)}
        address={address}
        networkName={networkName}
        networkSlug={networkSlug}
        // Falls back to "followers" only for the closed frame Radix renders
        // during its exit animation — the dialog is unmounted by `open` anyway.
        direction={followList ?? "followers"}
        followers={followers}
        following={account.social.following}
      />

      {/* Gated on `isSelf`, not merely hidden by it: the card's own docstring warns that
          merging the owner's header in here would put owner-only controls one boolean
          away from a stranger's page. An unmounted modal cannot be that boolean. The
          write is signature-authorised server-side regardless — this is the UI half. */}
      <ShareProfileModal
        open={sharing}
        onOpenChange={setSharing}
        address={address}
        chainSlug={networkSlug}
        displayName={shownName}
      />

      {isSelf && (
        <EditProfileModal
          open={editing}
          onOpenChange={setEditing}
          networkName={networkName}
          address={address}
          profile={profile}
          signMessageAsync={signMessageAsync}
          onSaved={onProfileSaved}
        />
      )}
    </section>
  );
}

function CountButton({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-transparent transition-colors hover:border-[color:var(--m-border)]"
    >
      {/* Compacted, not just separated. `toLocaleString` gave a follower count
          every digit it had — "1,284,993 Followers" in a 13.5px row that sits
          beside a second count and wraps the pair onto two lines. The rest of
          the app reads these as "1.3M", and this is the same `compactNumber`
          the tables use, so the two cannot drift. */}
      <b className="font-bold tabular-nums text-[color:var(--m-text-primary)]">
        {compactNumber(value)}
      </b>{" "}
      {label}
    </button>
  );
}
