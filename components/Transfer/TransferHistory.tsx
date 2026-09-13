"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { wagmiChains } from "@/lib/customChains";
import {
  forChain,
  subscribeTransfers,
  transfersServerSnapshot,
  transfersSnapshot,
  type TransferRecord,
} from "@/lib/transfer/history";
import { useTransfers } from "@/hooks/useTransfers";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { tokenColor } from "@/lib/swap/tokens";

/**
 * Recent transfers, and an honest account of what "recent" can mean here.
 *
 * Nothing in this monorepo indexes value transfers — the broker handles the
 * exchange's own events and has no ERC-20 `Transfer` handler — so this lists
 * what the APP submitted and knows the hash of. A deposit made by scanning the
 * QR from a phone is invisible to every device, including the one that drew it.
 *
 * The empty state says that outright rather than reading as "you have never
 * deposited", which is the failure this panel would otherwise ship: a confident
 * blank where the truthful answer is "we cannot see those yet".
 */
export function TransferHistory({ chainId }: { chainId?: number }) {
  // Read in an effect, never during render: localStorage is not available on
  // the server and the first client pass must match the server's HTML. Same
  // rule the consent banner and the OG Pass countdown follow.
  const { address } = useAccount();
  const { data: server, refetch } = useTransfers(address);

  // Subscribed, not read once: a deposit confirming while this page is open
  // has to appear in it.
  const local = useSyncExternalStore(
    subscribeTransfers,
    transfersSnapshot,
    transfersServerSnapshot,
  );

  /*
   * The SERVER's record when there is one, this browser's otherwise.
   *
   * Not merged. The service verifies every row against a receipt before writing
   * it, so its list is strictly better — merging would mean showing rows it
   * declined beside rows it accepted, with nothing saying which was which. The
   * local log is what makes the list correct before a report lands, and the
   * fallback for a service that cannot be reached; `useTransfers` answers null
   * rather than an empty array precisely so those two cases stay distinct.
   */
  // A newly recorded transfer notifies the store, which re-renders this and
  // gives `local` a new identity — the cue to re-ask the service, which now has
  // a receipt to verify against. Without it the server list sits on its cached
  // answer and the table omits the row just confirmed.
  useEffect(() => {
    void refetch();
  }, [local, refetch]);

  const log = server ?? local;

  const [tab, setTab] = useState<"all" | "deposit" | "withdraw">("all");
  const onChain = useMemo(() => (log === null ? [] : forChain(log, chainId)), [log, chainId]);
  const rows = useMemo(
    () => (tab === "all" ? onChain : onChain.filter((r) => r.kind === tab)),
    [onChain, tab],
  );
  const counts = useMemo(
    () => ({
      all: onChain.length,
      deposit: onChain.filter((r) => r.kind === "deposit").length,
      withdraw: onChain.filter((r) => r.kind === "withdraw").length,
    }),
    [onChain],
  );

  return (
    <section className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[color:var(--m-text-primary)]">
          Recent transfers
        </h2>
        {/* Tabs rather than a sentence explaining what is in the list. The
            counts are the explanation. */}
        <div className="flex items-center gap-1 rounded-full bg-[color:var(--m-surface-2)] p-1">
          {(
            [
              ["all", "All"],
              ["deposit", "Deposits"],
              ["withdraw", "Withdrawals"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                tab === key
                  ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
                  : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
              )}
            >
              {label}
              {counts[key] > 0 && (
                <span className="ml-1.5 font-dm-mono text-[10.5px] tabular-nums opacity-60">
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {log !== null && rows.length === 0 && (
        <p className="mt-4 rounded-xl bg-[color:var(--m-surface-2)] px-3 py-5 text-center text-[12.5px] text-[color:var(--m-text-secondary)]">
          {/* The limit is said HERE, where the blank is, instead of as a preamble
              nobody reads when the list is full. */}
          Nothing yet. Transfers sent from another wallet are not listed until you add them
          above — nothing on Iter watches for incoming transfers.
        </p>
      )}

      <ul className="mt-3 flex flex-col">
        {rows.map((row) => {
          const chain = wagmiChains.find((c) => c.id === row.chainId);
          const explorer = chain?.blockExplorers?.default.url;
          return (
            <li
              key={row.hash}
              className="flex items-center gap-3 border-b border-[color:var(--m-border)] py-2.5 last:border-b-0"
            >
              {/* The asset, with its network riding the corner — the same mark
                  every market row in the app carries. A transfer is an amount
                  of one asset on one chain, and the row named both in text
                  while showing neither. */}
              <TokenImageIcon
                symbol={row.symbol}
                color={tokenColor(row.symbol)}
                size="md"
                chainName={chain?.name}
                className="h-7 w-7 shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[13px] font-medium text-[color:var(--m-text-primary)]">
                  {row.kind === "withdraw" ? "Sent" : "Received"} {row.amount} {row.symbol}
                </span>
                <span className="truncate font-dm-mono text-[10.5px] text-[color:var(--m-text-secondary)]">
                  {chain?.name ?? `Chain ${row.chainId}`}
                  {row.at > 0 && ` · ${new Date(row.at).toLocaleDateString()}`}
                </span>
              </span>
              {explorer && (
                <a
                  href={`${explorer}/tx/${row.hash}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex shrink-0 items-center gap-1 font-dm-mono text-[11px] text-[color:var(--m-primary-fg)] hover:underline"
                >
                  {row.hash.slice(0, 8)}…
                  <ExternalLink aria-hidden className="h-3 w-3" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
