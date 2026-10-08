"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { shortWallet, type CounterpartyView } from "@/lib/trades/counterparty";
import { CounterpartyChip } from "./AccountTable";
import { addressUrl } from "./orderRows";

/** A wallet's claimed name, or null — `useIdentities().nameOf`. */
export type NameOf = (address: string) => string | null;

type Common = { networkName: string; nameOf: NameOf };

const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide";

/**
 * One wallet: its name when `/api/identities` has one, else a short address in
 * mono. Either way a link to the wallet on the chain's explorer, with the full
 * address in the tooltip: a name is claimed, not verified, so the identifier
 * nobody can choose stays one hover away.
 */
export function WalletLabel({ address, networkName, nameOf }: Common & { address: string }) {
  const name = nameOf(address);
  const href = addressUrl(networkName, address);
  const text = name ?? shortWallet(address);
  // inline-block + max-w-full so `truncate` can clip: on a bare inline <a> it cannot.
  const className = cn("inline-block max-w-full truncate align-bottom", name ? "font-medium" : "font-mono");
  const title = name ? `${name} · ${address}` : address;
  return href ? (
    <a
      data-testid="counterparty-wallet"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(className, "text-[color:var(--m-text-primary)] hover:text-[color:var(--m-primary)] hover:underline")}
    >
      {text}
    </a>
  ) : (
    <span data-testid="counterparty-wallet" title={title} className={className}>
      {text}
    </span>
  );
}

/** "Pool", linked to the pool contract when the row names it. */
export function PoolLabel({ address, networkName }: { address: string | null; networkName: string }) {
  const href = addressUrl(networkName, address);
  if (!href) return <CounterpartyChip label="Pool" />;
  return (
    <a
      data-testid="counterparty"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Pool contract ${address}`}
      className={cn(CHIP, "border-[color:var(--m-primary)]/40 text-[color:var(--m-primary)] hover:underline")}
    >
      Pool
    </a>
  );
}

/**
 * The collapsed counterparty: a name or address, "Pool", or for a row with
 * several, a toggle reading "3 traders" / "Pool + 2 traders". The list it opens
 * is {@link CounterpartyList}, rendered by the caller where it has room: under
 * the cell on desktop, full width under the card header on a phone.
 */
export function CounterpartySummary({
  view,
  open,
  onToggle,
  ...common
}: Common & { view: CounterpartyView; open: boolean; onToggle: () => void }) {
  switch (view.kind) {
    case "none":
      return <span className="text-[color:var(--m-text-secondary)]">—</span>;
    case "legacy":
      return <CounterpartyChip label={view.label} />;
    case "self":
      return (
        <span
          data-testid="counterparty"
          title="Your own resting order filled this (a self-match)"
          className={cn(CHIP, "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]")}
        >
          You
        </span>
      );
    case "pool":
      return <PoolLabel address={view.pool?.address ?? null} networkName={common.networkName} />;
    case "trader":
      return <WalletLabel address={view.traders[0]!} {...common} />;
    case "many":
      return (
        <button
          type="button"
          data-testid="counterparty"
          aria-expanded={open}
          onClick={onToggle}
          title={open ? "Hide who filled this" : "Show who filled this"}
          className={cn(CHIP, "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]")}
        >
          {view.label}
          <span aria-hidden className={cn("transition-transform", open && "rotate-180")}>
            ▾
          </span>
        </button>
      );
  }
}

/** Everyone behind a "N traders" row: the pool first, then each trader. */
export function CounterpartyList({ view, className, ...common }: Common & { view: CounterpartyView; className?: string }) {
  return (
    <ul data-testid="counterparty-list" className={cn("flex flex-col gap-0.5 text-[11.5px]", className)}>
      {view.pool ? (
        <li>
          <PoolLabel address={view.pool.address} networkName={common.networkName} />
        </li>
      ) : null}
      {view.traders.map((a) => (
        <li key={a} className="min-w-0">
          <WalletLabel address={a} {...common} />
        </li>
      ))}
      {view.more > 0 ? (
        <li className="font-mono text-[color:var(--m-text-secondary)]">
          + {view.more} more
        </li>
      ) : null}
    </ul>
  );
}

/** Summary and, when opened, the list under it: the table cell's form. */
export function CounterpartyCell({ view, ...common }: Common & { view: CounterpartyView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <CounterpartySummary view={view} open={open} onToggle={() => setOpen((o) => !o)} {...common} />
      {open && view.kind === "many" ? <CounterpartyList view={view} {...common} /> : null}
    </div>
  );
}
