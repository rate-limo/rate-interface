import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for /cookies, /privacy and /terms.
 *
 * Deliberately NOT wrapped in AppShell: these are reachable from the landing
 * page and from the consent banner, both of which a user can hit before ever
 * seeing the app shell.
 *
 * `TBD` marks facts an agent cannot supply — legal entity, jurisdiction, contact
 * address. It renders loudly on purpose: a legal page that ships with an
 * invented company name or governing law is worse than no page at all, so these
 * are built to be impossible to miss in review.
 */

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
];

export function LegalPage({
  eyebrow,
  title,
  lede,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  /** Human-readable date this text last changed. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[820px] px-[22px] pt-16 pb-28 text-[color:var(--m-text-primary)]">
      <p className="mb-3.5 flex items-center gap-2 font-dm-mono text-xs tracking-[0.16em] uppercase text-[color:var(--m-primary-fg)]">
        <span className="font-bold text-[color:var(--m-logo)]">Iter</span> · {eyebrow}
      </p>
      <h1 className="mb-4 text-[clamp(28px,3.6vw,40px)] leading-[1.06] font-medium tracking-[-0.02em] text-balance">
        {title}
      </h1>
      <p className="mb-2 max-w-[68ch] text-[16px] text-[color:var(--m-text-secondary)]">{lede}</p>
      <p className="mb-8 font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]">
        Last updated {updated}
      </p>

      {children}

      <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-[color:var(--m-border)] pt-5 text-[13px]">
        <Link href="/" className="text-[color:var(--m-primary-fg)] underline underline-offset-2">
          Back to Iter
        </Link>
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[color:var(--m-text-secondary)] underline underline-offset-2 hover:text-[color:var(--m-text-primary)]"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[21px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="max-w-[68ch] space-y-3 text-[14.5px] leading-relaxed text-[color:var(--m-text-secondary)]">
        {children}
      </div>
    </section>
  );
}

export function Emphasis({ children }: { children: ReactNode }) {
  return <b className="font-semibold text-[color:var(--m-text-primary)]">{children}</b>;
}

/** An unordered list with the page's body styling. */
export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * A fact only a human can fill in. Loud by design — see the note at the top.
 */
export function TBD({ children }: { children: ReactNode }) {
  return (
    <mark
      className="rounded-[5px] border border-[color-mix(in_srgb,var(--m-error)_45%,transparent)] bg-[color-mix(in_srgb,var(--m-error)_12%,transparent)] px-1.5 py-0.5 font-dm-mono text-[12px] font-medium text-[color:var(--m-error)]"
      title="Placeholder — must be completed before publishing"
    >
      [{children}]
    </mark>
  );
}

/** Banner stating the page is a draft. Remove once a lawyer has signed it off. */
export function DraftNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--m-error)_38%,transparent)] bg-[color-mix(in_srgb,var(--m-error)_8%,transparent)] px-4 py-3 text-[13.5px] leading-snug">
      <span aria-hidden className="text-[color:var(--m-error)]">
        ▲
      </span>
      <span className="text-[color:var(--m-text-secondary)]">
        <Emphasis>Draft — not yet reviewed by a lawyer.</Emphasis> Every red bracket below is a fact
        that has to be supplied (legal entity, jurisdiction, contact address). This describes what
        the software actually does; it is not legal advice and should not be published as-is.
      </span>
    </div>
  );
}
