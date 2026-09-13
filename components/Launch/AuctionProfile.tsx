"use client";
import { readAuctionDraft } from "@/lib/launch/auctionDraft";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ProfileData = {
  id: string;
  token: { name: string; symbol: string; supply: string; logo: string };
  sale: { price: string; target: string; minimum: string; cap: string; duration: string };
  allocation: { presale: string; liquidity: string; creator: string; treasury: string; lpBps: string };
  graduation: { lock: string; vesting: string; listingPrice: string };
  raised: number;
};

const fallback = (id: string): ProfileData => ({
  id,
  token: { name: "Auction", symbol: "AUCTION", supply: "100,000,000", logo: "" },
  sale: { price: "0.01", target: "100,000", minimum: "50,000", cap: "5,000", duration: "3" },
  allocation: { presale: "10,000,000", liquidity: "2,000,000", creator: "20,000,000", treasury: "68,000,000", lpBps: "20" },
  graduation: { lock: "12 months", vesting: "12 months", listingPrice: "0.01" },
  raised: 0,
});

function money(value: string | number) { return `$${Number(String(value).replaceAll(",", "")).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-text-secondary)]">{label}</p><p className="mt-2 text-lg font-medium tracking-[-.03em]">{value}</p>{detail && <p className="mt-1 text-xs text-[var(--m-text-secondary)]">{detail}</p>}</div>; }

export function AuctionProfile({ networkSlug, id }: { networkSlug: string; id: string }) {
  const [profile, setProfile] = useState<ProfileData>(() => fallback(id));
  useEffect(() => {
    try {
      const draft = readAuctionDraft(networkSlug, id);
      if (draft) setProfile({ ...fallback(id), ...(draft as Partial<ProfileData>) });
    } catch { /* show the stable profile shell */ }
  }, [id, networkSlug]);
  const target = Number(profile.sale.target.replaceAll(",", "")) || 1;
  const raised = profile.raised || 0;
  const progress = Math.min(100, (raised / target) * 100);
  const lpRaise = raised * (Number(profile.allocation.lpBps) / 100);
  const status = raised >= Number(profile.sale.minimum.replaceAll(",", "")) ? "Live · minimum reached" : "Live · building conviction";
  const shortId = useMemo(() => `${id.slice(0, 8)}…${id.slice(-6)}`, [id]);
  return <main className="mx-auto w-full max-w-[1160px] px-5 pb-24 pt-10 text-[var(--m-text-primary)] sm:px-8">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><Link href={`/launch?chain=${encodeURIComponent(networkSlug)}`} className="font-mono text-[11px] uppercase tracking-[.14em] text-[var(--m-text-secondary)] hover:text-[var(--m-text-primary)]">← Launches</Link><span className="rounded-full border border-[color-mix(in_srgb,var(--m-primary)_32%,var(--m-border))] bg-[color-mix(in_srgb,var(--m-primary)_9%,transparent)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.12em] text-[var(--m-primary-fg)]">{status}</span></div>
    <section className="relative overflow-hidden rounded-[28px] border border-[var(--m-border)] bg-[var(--m-surface)] p-6 sm:p-10"><div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[color-mix(in_srgb,var(--m-primary)_14%,transparent)] blur-3xl" /><div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div className="flex items-center gap-5"><div className="grid size-20 place-items-center rounded-[22px] border border-[var(--m-border)] bg-[var(--m-surface-2)] text-2xl font-medium tracking-[-.06em]">{profile.token.symbol.slice(0, 2) || "W"}</div><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--m-primary-fg)]">Auction launch</p><h1 className="mt-2 text-[clamp(36px,5vw,64px)] font-medium leading-[.92] tracking-[-.065em]">{profile.token.name}</h1><p className="mt-3 font-mono text-xs text-[var(--m-text-secondary)]">{profile.token.symbol} · {shortId}</p></div></div><div className="w-full max-w-[440px]"><div className="flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--m-text-secondary)]">Raised</p><p className="mt-1 text-3xl font-medium tracking-[-.05em]">{money(raised)} <span className="text-base text-[var(--m-text-secondary)]">/ {money(profile.sale.target)}</span></p></div><p className="font-mono text-xs text-[var(--m-primary-fg)]">{Math.round(progress)}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--m-surface-2)]"><div className="h-full rounded-full bg-[var(--m-primary)] transition-[width] duration-700" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[var(--m-text-secondary)]">{money(profile.sale.minimum)} minimum · {profile.sale.duration} day window</p></div></div></section>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Presale price" value={`${money(profile.sale.price)} / token`} detail="Same price for every buyer" /><Stat label="Wallet cap" value={money(profile.sale.cap)} detail="Per wallet" /><Stat label="Liquidity commitment" value={`${profile.allocation.lpBps}%`} detail={`${money(lpRaise)} at graduation`} /><Stat label="LP lock" value={profile.graduation.lock} detail="CLOB liquidity" /></section>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-6 sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-text-secondary)]">How this sale settles</p><div className="mt-6 space-y-0"><div className="flex gap-4 border-l-2 border-[var(--m-primary)] pb-7 pl-5"><span className="font-mono text-xs text-[var(--m-primary-fg)]">01</span><div><h2 className="text-sm font-medium">Commit at one price</h2><p className="mt-1 text-sm leading-6 text-[var(--m-text-secondary)]">Everyone commits at {money(profile.sale.price)}. No private round and no gas race.</p></div></div><div className="flex gap-4 border-l-2 border-[var(--m-primary)] pb-7 pl-5"><span className="font-mono text-xs text-[var(--m-primary-fg)]">02</span><div><h2 className="text-sm font-medium">Pro-rata if oversubscribed</h2><p className="mt-1 text-sm leading-6 text-[var(--m-text-secondary)]">If demand exceeds the target, every commitment is scaled down by the same factor to fit it.</p></div></div><div className="flex gap-4 pl-5"><span className="font-mono text-xs text-[var(--m-primary-fg)]">03</span><div><h2 className="text-sm font-medium">Graduate into the orderbook</h2><p className="mt-1 text-sm leading-6 text-[var(--m-text-secondary)]">{profile.allocation.lpBps}% of the accepted raise and {profile.allocation.liquidity} tokens seed two-sided CLOB liquidity.</p></div></div></div></section><aside className="space-y-5"><section className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-text-secondary)]">Supply map</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span>Presale</span><b>{profile.allocation.presale}</b></div><div className="flex justify-between"><span>Graduation LP</span><b>{profile.allocation.liquidity}</b></div><div className="flex justify-between"><span>Creator</span><b>{profile.allocation.creator}</b></div><div className="flex justify-between border-t border-[var(--m-border)] pt-3"><span>Treasury</span><b>{profile.allocation.treasury}</b></div></div></section><section className="rounded-2xl border border-[color-mix(in_srgb,var(--m-primary)_26%,var(--m-border))] bg-[color-mix(in_srgb,var(--m-primary)_7%,var(--m-surface))] p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-primary-fg)]">Creator terms</p><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Token vesting</span><b>{profile.graduation.vesting}</b></div><div className="flex justify-between"><span>Opening price</span><b>{money(profile.graduation.listingPrice)}</b></div></div></section></aside></div>
  </main>;
}
