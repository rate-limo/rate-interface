"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  Download,
  LogOut,
  Send,
  User,
  Wallet,
} from "lucide-react";
import { useAccount } from "wagmi";
import { useProfile } from "@/hooks/useProfile";
import { ProfileAvatar, ProfileBanner } from "@/components/Profile/ProfileAvatar";
import { profileImageUrl, shortAddress } from "@/lib/portfolio/profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWalletConnect } from "@/lib/wallet";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { wagmiChains } from "@/lib/customChains";
import { WalletTransferModal, type WalletTransferMode } from "./WalletTransferModal";
import { useWalletName } from "@/hooks/useWalletName";
import { FeeTokenPicker } from "@/components/Wallet/FeeTokenPicker";

/**
 * What a CONNECTED wallet opens. The trigger is passed in, so the desktop pill
 * and the mobile icon open the same menu.
 *
 * ## Why this exists
 *
 * The connected control used to be a bare button whose entire `onClick` was
 * `disconnect`. It rendered nothing but a truncated address, so the only signal
 * that it would log you out was the `aria-label` — a click meant to inspect the
 * account silently ended the session instead. Mobile was worse: `MobileHeader`
 * read only `open` from the seam and hard-coded "Connect wallet", so a connected
 * user saw no address and had **no way to disconnect at all**.
 *
 * One component with an injected trigger rather than a menu per shell: two
 * implementations of one control is how the phone and the desktop end up
 * offering different actions, which is the failure this codebase keeps deleting.
 *
 * ## No confirmation on Disconnect
 *
 * Deliberate. A wallet connection is not a password session — reconnecting is
 * one click — so a confirm step is friction on a reversible action. What made
 * the old behaviour wrong was that disconnect was the *whole button*, not that
 * it was immediate; behind an explicit menu item the mis-click is gone.
 */
export function WalletMenu({
  address,
  children,
}: {
  /** Checksummed address of the connected account. */
  address: `0x${string}`;
  /** The trigger. Rendered via `asChild`, so it must forward a ref and props. */
  children: React.ReactNode;
}) {
  const { disconnect } = useWalletConnect();
  const { chainId } = useAccount();
  const [copied, setCopied] = useState(false);
  const [transferMode, setTransferMode] = useState<WalletTransferMode | null>(null);
  const connectedChain = wagmiChains.find((chain) => chain.id === chainId);
  /**
   * The wallet's own face, at the top of its own menu.
   *
   * This menu opened on a bare "Connected" label and 42 hex characters, which identifies
   * the account without recognising it — and the app already knows the name and picture
   * the rest of the venue shows for this wallet. Reading them here is also what makes the
   * "View profile" item below legible as *yours* rather than a page about someone.
   *
   * `useProfile` swallows its own failure and answers null, so an unreachable gateway
   * costs the name and picture, never the menu: copy, send, receive and disconnect are
   * the reason this is open and none of them need a network.
   */
  const { data: profile } = useProfile(connectedChain?.name ?? "", address);
  const avatarSrc = profileImageUrl(connectedChain?.name ?? "", profile?.avatarUrl ?? null);
  const bannerSrc = profileImageUrl(connectedChain?.name ?? "", profile?.bannerUrl ?? null);
  /**
   * One source for the name, shared with the trigger that opens this menu —
   * see `useWalletName` for why the precedence lives in one place. The button
   * and the menu render an UNNAMED wallet differently, which is why the hook
   * answers null instead of a shortened address.
   */
  const shownName = useWalletName(address);
  const onCopy = async () => {
    try {
      await navigator.clipboard?.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure origin). The full address is
      // rendered above and can be selected by hand, so this needs no error.
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      {/* The surface is set explicitly, and it has to be.
          `DropdownMenuContent` ships `bg-popover`, which maps through
          `@theme inline` to `--popover` — and that is stored as a BARE HSL
          triplet (`214 15% 9%`), a shadcn-on-Tailwind-v3 convention where the
          config wrapped it in `hsl()`. Under v4 nothing wraps it, so the
          utility emits an invalid colour and the menu renders TRANSPARENT:
          caught on a screenshot with the Action Dock legible straight through
          it. `Organisms/Tables/OpenOrders` hard-codes its own background for
          the same reason.
          Monet tokens rather than that file's `neutral-dark-600`, since this is
          shell chrome. Fixing `--popover` globally would repaint every shadcn
          surface in the app and is its own change. */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[264px] border-[color:var(--m-border)] bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
      >
        {/* Banner, avatar and name — the same three defaults the public profile draws,
            through the same components, so a wallet with no picture cannot look like one
            thing here and another there. Deliberately shallow: 56px of banner is enough
            to carry the identity without turning a menu into a profile page. */}
        <div className="-mx-1 -mt-1 mb-1">
          <ProfileBanner address={address} src={bannerSrc} className="h-14 rounded-t-[6px]" />
          <div className="flex items-end gap-2.5 px-2">
            <ProfileAvatar
              address={address}
              name={shownName}
              src={avatarSrc}
              size={44}
              className="-mt-[18px] border-[3px] border-[color:var(--m-surface)]"
            />
            <div className="min-w-0 flex-1 pb-0.5">
              {shownName ? (
                <p className="truncate text-[13px] font-semibold leading-tight text-[color:var(--m-text-primary)]">
                  {shownName}
                </p>
              ) : (
                // No name set, so the address IS the name — abbreviated here because the
                // full one is rendered below and repeating it twice says nothing new.
                <p className="truncate font-dm-mono text-[12px] leading-tight text-[color:var(--m-text-primary)]">
                  {shortAddress(address)}
                </p>
              )}
              <p className="truncate text-[11px] leading-tight text-[color:var(--m-text-secondary-2)]">
                {profile?.username ? `@${profile.username}` : "Connected"}
              </p>
            </div>
          </div>
        </div>
        {/* The address is shown IN FULL, and wraps rather than truncating.
            Truncation is right on a pill, where it is a label; here it is the
            thing being verified, and `break-all` is what keeps 42 unbreakable
            characters from setting this menu's width.

            The button beside it copies the same address the row below does, from
            the SAME handler and the same `copied` state, so the two can never
            disagree about whether a copy just happened. That duplication is
            deliberate rather than redundant: this is the point where someone is
            already looking at the address to verify it, and asking them to move
            to a menu row to act on what is under the cursor is the friction
            worth removing. The row stays because it is what a keyboard user
            reaches by arrowing through the menu. */}
        <div className="flex items-start gap-1.5 px-2 pb-2">
          <p className="min-w-0 flex-1 font-dm-mono text-[11px] leading-relaxed break-all text-[color:var(--m-text-primary)]">
            {address}
          </p>
          {/* Not a DropdownMenuItem: those close the menu on select, and the
              whole point of the `copied` state is that it is visible AFTER the
              click. A plain button inside the content does not dismiss it. */}
          <button
            type="button"
            onClick={() => void onCopy()}
            aria-label={copied ? "Address copied" : "Copy address"}
            title={copied ? "Copied" : "Copy address"}
            className="shrink-0 rounded p-1 text-[color:var(--m-text-secondary-2)] transition-colors hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--m-border)]"
          >
            {copied ? (
              // Success is carried by the icon AND the label above, never by
              // colour alone.
              <Check className="h-3.5 w-3.5 text-[color:var(--m-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {/* NO network row here, deliberately.

            This showed the connected chain and its id, which made sense when a
            wallet meant "an account standing on one network". The passkey
            account is not that: it is ONE address on every chain, the portfolio
            aggregates across all of them, and `SCHEME.deposit` carries no chain
            precisely because a wallet page cannot name one honestly.

            So the row answered a question this menu should not be asking. Worse,
            it answered it with whatever `useAccount()` happened to report, which
            on a cross-chain screen is an implementation detail rather than a
            fact about the user's money — and a chain named next to an address
            invites the reading that the address only exists there.

            The chain the SHELL is displaying still has a control: the
            ChainSwitcher in the sidebar. That one is about what you are looking
            at, which is a different question and has an honest answer. */}
        <DropdownMenuSeparator />

        {/* First, because funding is the one thing a new wallet cannot do without.
            A passkey account is created empty and every other item here — send,
            trade, the portfolio — is unusable until something arrives in it, so the
            menu leads with the answer to "how do I get money in".

            A LINK to /deposit, not a dialog. Deposit and withdraw are
            destinations — they carry an asset, a network, an address, a QR and a
            transfer list — and a dropdown that opens a dialog on top of the page
            you were reading is the wrong shape for that. `asChild` so the item
            renders the anchor itself, which keeps middle-click and "open in new
            tab" working; an onSelect handler calling router.push has neither.

            It targets DEPOSIT rather than "Receive" below, and
            the difference is the QR. `depositUri` encodes EIP-681
            (`ethereum:0x…@chainId`), so the chain travels with the address;
            Receive's QR is the bare address, which scans on any network. On a
            venue whose addresses exist only inside a passkey session, a scan that
            silently resolves to mainnet sends real funds somewhere unrecoverable —
            `lib/wallet/gasDeposit` records that reasoning at length. */}
        <DropdownMenuItem asChild>
          {/* No `?chainId=`, deliberately. It used to carry the CONNECTED
              chain, which is not a statement about what the user wants to
              deposit — the asset decides the network here, and this page is
              cross-chain. The parameter belongs to callers that genuinely know
              the asset (the out-of-gas toast and watcher, the onboarding
              cards), not to a menu item that means "I want to add funds". */}
          <Link href={buildPageUrl("deposit", {})}>
            <ArrowDownToLine className="h-4 w-4" />
            Deposit
          </Link>
        </DropdownMenuItem>

        {/* Money has to be able to LEAVE.
            
            The menu could take funds in and offered no way out, which on a venue
            built around not holding anyone's money reads as exactly the opposite.
            No chain is passed: `chainId` here is whatever the app is displaying,
            and a withdrawal is unrecoverable if it goes to the wrong network — so
            the page asks rather than inheriting a browsing choice. */}
        <DropdownMenuItem asChild>
          <Link href={buildPageUrl("withdraw", {})}>
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw
          </Link>
        </DropdownMenuItem>

        {/* Tempo only: which stablecoin pays gas. Renders nothing elsewhere. */}
        <FeeTokenPicker address={address} />

        <DropdownMenuSeparator />

        {/* Not a link: copying must not close-and-navigate. `preventDefault`
            keeps the menu open so the "Copied" state is actually visible. */}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void onCopy(); }}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy address"}
        </DropdownMenuItem>

        {/* The connected wallet's own public page — the one everyone else sees, with
            the display name, followers and the avatar. This menu is where a user goes
            looking for "me", and it offered every private view (portfolio, send,
            receive) and no way to reach the public one, so the profile was effectively
            unreachable for its own owner: nothing else in the shell links to it. */}
        {address && (
          <DropdownMenuItem asChild>
            <Link href={buildPageUrl("profile", { address })}>
              <User className="h-4 w-4" />
              View profile
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link href={buildPageUrl("portfolio")}>
            <Wallet className="h-4 w-4" />
            View portfolio
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => setTransferMode("send")}>
          <Send className="h-4 w-4" />
          Send
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => setTransferMode("receive")}>
          <Download className="h-4 w-4" />
          Receive
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onSelect={() => disconnect()}>
          <LogOut className="h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <WalletTransferModal
      mode={transferMode ?? "receive"}
      address={address}
      open={transferMode !== null}
      onOpenChange={(open) => { if (!open) setTransferMode(null); }}
    />
    </>
  );
}
