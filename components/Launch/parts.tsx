"use client";

/**
 * Shared primitives for the launch flow, matching the geometry
 * components/Liquidity/* already uses (rounded-[15px] panels on --m-surface,
 * rounded-xl fields on --m-surface-2). Kept in one file so the four step
 * components stay about their own logic.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  aside,
  className,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[15px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-sm",
        className,
      )}
    >
      {title && (
        <h3 className="mb-4 flex items-center justify-between gap-3 text-[17px] font-semibold">
          {title}
          {aside}
        </h3>
      )}
      {children}
    </div>
  );
}

export function Lbl({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-[7px] mt-3.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-[var(--m-text-secondary-2)] first:mt-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A bordered input row. `suffix` is the unit/role hint on the right. */
export function Field({
  value,
  onChange,
  placeholder,
  suffix,
  big,
  mono,
  disabled,
  invalid,
  inputMode,
  maxLength,
  ariaLabel,
  leading,
  dataTestId,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  suffix?: ReactNode;
  big?: boolean;
  mono?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  maxLength?: number;
  ariaLabel: string;
  leading?: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-[var(--m-surface-2)] px-3.5 py-2.5",
        invalid ? "border-[var(--m-error)]" : "border-[var(--m-border)]",
        disabled && "opacity-50",
      )}
    >
      {leading}
      <input
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        data-testid={dataTestId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[var(--m-text-primary)] outline-none placeholder:text-[var(--m-text-secondary-2)]",
          big ? "text-[19px] font-semibold tabular-nums" : "text-[15px] font-medium",
          (big || mono) && "font-mono",
        )}
      />
      {suffix && (
        <span className="whitespace-nowrap font-mono text-xs text-[var(--m-text-secondary-2)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-[11.5px] text-[var(--m-error)]">{children}</p>;
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "gold";
  children: ReactNode;
}) {
  const mark = tone === "warn" ? "▲" : "◆";
  return (
    <div
      className={cn(
        "mt-3.5 flex items-start gap-2.5 rounded-[11px] border px-3.5 py-2.5 text-[12.5px] leading-snug",
        tone === "warn" &&
          "border-[color-mix(in_srgb,var(--m-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--m-error)_9%,transparent)]",
        tone === "gold" &&
          "border-[color-mix(in_srgb,var(--m-accent)_34%,transparent)] bg-[color-mix(in_srgb,var(--m-accent)_10%,transparent)]",
        tone === "info" &&
          "border-[color-mix(in_srgb,var(--m-logo)_30%,transparent)] bg-[color-mix(in_srgb,var(--m-logo)_9%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0",
          tone === "warn"
            ? "text-[var(--m-error)]"
            : tone === "gold"
              ? "text-[var(--m-accent)]"
              : "text-[var(--m-logo)]",
        )}
      >
        {mark}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Key/value review list — the same rows ConfirmFlow uses. */
export function Kv({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function KvRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--m-border)] py-2 text-[12.5px] text-[var(--m-text-secondary)] first:border-t-0">
      <span>{k}</span>
      {children}
    </div>
  );
}

export function KvVal({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "blue" | "gold" | "good";
}) {
  return (
    <b
      className={cn(
        "text-right font-mono font-semibold tabular-nums",
        tone === "blue"
          ? "text-[var(--m-primary-fg)]"
          : tone === "gold"
            ? "text-[var(--m-logo)]"
            : tone === "good"
              ? "text-[var(--m-success)]"
              : "text-[var(--m-text-primary)]",
      )}
    >
      {children}
    </b>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  dataTestId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  dataTestId?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className="mt-3 w-full rounded-[13px] bg-[var(--m-primary)] py-3.5 text-[15px] font-semibold text-[var(--m-on-primary)] hover:bg-[var(--m-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--m-primary)]"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full rounded-[13px] border border-[var(--m-border)] py-3.5 text-[15px] font-semibold text-[var(--m-text-primary)] hover:bg-[var(--m-surface-2)]"
    >
      {children}
    </button>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "hot" | "warn";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-['']",
        tone === "good" &&
          "bg-[color-mix(in_srgb,var(--m-success)_15%,transparent)] text-[var(--m-success)]",
        tone === "hot" &&
          "bg-[color-mix(in_srgb,var(--m-logo)_14%,transparent)] text-[var(--m-logo)]",
        tone === "warn" &&
          "bg-[color-mix(in_srgb,var(--m-accent)_15%,transparent)] text-[var(--m-accent)]",
      )}
    >
      {children}
    </span>
  );
}

/** Waiting state — identical in spirit to ConfirmFlow's, so the flows feel one. */
export function Waiting({ title, body, tx }: { title: string; body: string; tx?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
      <span className="h-[42px] w-[42px] animate-spin rounded-full border-[3px] border-[var(--m-border)] border-t-[var(--m-primary)] motion-reduce:animate-none" />
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="max-w-[32ch] text-[12.5px] text-[var(--m-text-secondary)]">{body}</p>
      {tx && (
        <span className="rounded-[9px] border border-[var(--m-border)] bg-[var(--m-surface-2)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--m-primary-fg)]">
          {tx}
        </span>
      )}
    </div>
  );
}
