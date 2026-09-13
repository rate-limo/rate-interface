"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { wagmiChains } from "@/lib/customChains";
import { buildPageUrl } from "@/lib/routing/chainParams";
import { cn } from "@/lib/utils";

/**
 * The frame both transfer pages share: a title rail, the Deposit/Withdraw
 * switch, and the network guard.
 *
 * One component because the two pages are two directions of one thing. A user
 * who lands on Deposit and meant Withdraw should not have to go back to a menu
 * to say so — which is exactly what the dialogs forced, since each was opened
 * from its own item and neither knew the other existed.
 */
export function TransferShell({
  children,
  aside,
  /** Full width, under both columns. The transfer list lives here. */
  below,
  /** The chain the page is currently working on, once one is chosen. */
  chainId,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  below?: React.ReactNode;
  chainId?: number;
}) {
  const pathname = usePathname();
  const active: "deposit" | "withdraw" = pathname.includes("/withdraw") ? "withdraw" : "deposit";

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-wrap items-center gap-2">
        {(["deposit", "withdraw"] as const).map((kind) => (
          <Link
            key={kind}
            href={buildPageUrl(kind, {})}
            aria-current={active === kind ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors",
              active === kind
                ? "bg-[color:var(--m-primary)] text-[color:var(--m-on-primary)]"
                : "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            {kind}
          </Link>
        ))}
      </div>

      <NetworkGuard chainId={chainId} />

      {/* Two columns only when there IS a second one. The grid template was
          unconditional, so with no aside the form kept a 420px column and a
          column of empty space beside it — a desktop page rendering at phone
          width for no reason. */}
      <div
        className={cn(
          "grid gap-6 lg:items-start",
          aside && "lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]",
        )}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5 sm:p-6">
          {children}
        </div>
        {aside && <div className="flex flex-col gap-4">{aside}</div>}
      </div>

      {/* Under both columns rather than beside the form. A transfer list is a
          record, not an input: it is what you check afterwards, so it reads
          across the full width and stops competing with the thing you came to
          do. */}
      {below}
    </div>
  );
}

/**
 * Says when the wallet is standing on a different chain than the page is
 * working on, and offers to move it.
 *
 * ## Why this is a warning and not a block
 *
 * For a DEPOSIT it is genuinely advisory: the address is the same on every EVM
 * chain and the funds arrive from somewhere else entirely, so the connected
 * chain does not decide where they land — the sender's does. Blocking would be
 * theatre. What it does decide is the "send from a browser wallet" path, which
 * is why the mismatch is worth naming rather than hiding.
 *
 * For a WITHDRAWAL it matters more, because that transaction is signed here.
 * It is still not a block: the passkey connector names the chain per
 * transaction and its `switchChain` is a local assignment that cannot fail, so
 * a mismatch is recoverable at signing time. An injected wallet is the one that
 * must actually move, and that is the case this offers a button for.
 */
function NetworkGuard({ chainId }: { chainId?: number }) {
  const { chainId: connected, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || !chainId || !connected || connected === chainId) return null;
  const target = wagmiChains.find((c) => c.id === chainId);
  const current = wagmiChains.find((c) => c.id === connected);
  if (!target) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--m-warning-300)] bg-[color:color-mix(in_srgb,var(--m-warning)_10%,transparent)] px-4 py-3">
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-[color:var(--m-warning-600)]" />
      <p className="min-w-0 flex-1 text-[13px] text-[color:var(--m-text-primary)]">
        Your wallet is on{" "}
        <strong className="font-semibold">{current?.name ?? `chain ${connected}`}</strong>, and
        this page is set to <strong className="font-semibold">{target.name}</strong>.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => switchChain({ chainId })}
        className="shrink-0 rounded-lg bg-[color:var(--m-text-primary)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--m-background)] disabled:opacity-50"
      >
        {isPending ? "Switching…" : `Switch to ${target.name}`}
      </button>
    </div>
  );
}
