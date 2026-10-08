"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The frame shared by the desktop account tables: a toolbar line, a table that
 * scrolls sideways inside its own box when the panel is narrow, and a pager.
 */
export function AccountTableShell({
  toolbar,
  head,
  children,
  footer,
}: {
  toolbar?: ReactNode;
  head: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col text-[12px]">
      {toolbar ? <div className="flex min-h-[40px] items-center justify-between gap-3 px-3">{toolbar}</div> : null}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]">{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Th({ children, align = "left" }: { children?: ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 px-3 font-normal",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  title,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "h-10 px-3 text-[color:var(--m-text-primary)]",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Loading while the first read is in flight; the real empty sentence after. */
export function EmptyRow({ colSpan, loading, text }: { colSpan: number; loading: boolean; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 text-center text-[color:var(--m-text-secondary)]">
        {loading ? "Loading…" : text}
      </td>
    </tr>
  );
}

/** Shown only when there is more than one page — "Page 1 of 0" said nothing. */
export function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-[color:var(--m-text-secondary)]">
      <button
        type="button"
        className="min-h-[32px] rounded-md border border-[color:var(--m-border)] px-3 disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="min-h-[32px] rounded-md border border-[color:var(--m-border)] px-3 disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

/** The status chip shared by the History table and the phone cards. */
export function StatusChip({ kind, label }: { kind: string; label: string }) {
  const tone =
    kind === "filled"
      ? "bg-[color:var(--m-success)]/15 text-[color:var(--m-success)]"
      : kind === "partial"
        ? "bg-[color:var(--m-primary)]/15 text-[color:var(--m-primary)]"
        : kind === "open"
          ? "bg-[color:var(--m-warning)]/15 text-[color:var(--m-warning)]"
          : "bg-[color:var(--m-surface-2)] text-[color:var(--m-text-secondary)]";
  return (
    <span
      data-testid="order-status"
      className={cn("inline-flex rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide", tone)}
    >
      {label}
    </span>
  );
}

/**
 * Who was on the other side: the pool, or another trader. Neutral tones on
 * purpose — neither is good or bad news, and the side colours already mean
 * buy and sell.
 */
export function CounterpartyChip({ label }: { label: string }) {
  const tone =
    label === "Pool"
      ? "border-[color:var(--m-primary)]/40 text-[color:var(--m-primary)]"
      : "border-[color:var(--m-border)] text-[color:var(--m-text-secondary)]";
  return (
    <span
      data-testid="counterparty"
      className={cn("inline-flex rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide", tone)}
    >
      {label}
    </span>
  );
}
