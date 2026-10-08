"use client";
import { writeAuctionDraft } from "@/lib/launch/auctionDraft";
import { toast } from "sonner";
import { Stepper } from "@/components/Atoms/Stepper";
import { toastContractError } from "@/lib/errors/toastContractError";

import { useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { LogoCropper } from "./LogoCropper";
import { ReviewSummary } from "./ReviewSummary";
import { LaunchPreviewCard } from "./LaunchPreviewCard";
import { defaultLaunchChain, launchChains } from "@/lib/launch/launchChains";
import { allocate, fmtShare } from "@/lib/launch/allocation";

/** Both mirror TokenStep's limits so the two launch flows reject the same files. */
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_CROP_SOURCE_BYTES = 20 * 1024 * 1024;

type Step = "token" | "sale" | "allocation" | "graduation" | "review";
const steps: { key: Step; label: string; eyebrow: string }[] = [
  { key: "token", label: "Token", eyebrow: "01" },
  { key: "sale", label: "Presale", eyebrow: "02" },
  { key: "allocation", label: "Allocation", eyebrow: "03" },
  { key: "graduation", label: "Graduation", eyebrow: "04" },
  { key: "review", label: "Review", eyebrow: "05" },
];

const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 text-sm text-[var(--m-text-primary)] outline-none transition focus:border-[var(--m-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--m-primary)_18%,transparent)]";

/**
 * Same upload-and-crop control as the fair-launch flow's first step, but it keeps the
 * result as a data URL rather than an object URL: this flow persists the whole
 * draft to localStorage, and a `blob:` handle dies with the page that made it.
 *
 * Deliberately not wrapped in `Field` -- that renders a <label>, and a label
 * containing both a button and the hidden file input opens the picker twice.
 */
function LogoPicker({
  symbol,
  logo,
  fileName,
  onPick,
}: {
  symbol: string;
  logo: string;
  fileName: string | null;
  onPick: (dataUrl: string, name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);

  return (
    <>
      <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5">
        <TokenImageIcon symbol={symbol || "?"} color="var(--m-logo)" logoURI={logo || undefined} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--m-text-secondary)]">
          {fileName ?? "PNG, JPEG or WebP"}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 font-mono text-xs font-medium text-[var(--m-primary-fg)] hover:underline"
        >
          {logo ? "Replace" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          aria-label="Token logo"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!file) return;
            if (file.size > MAX_CROP_SOURCE_BYTES) {
              setError(`That source image is ${Math.ceil(file.size / 1024 / 1024)} MB. Choose one under 20 MB.`);
              return;
            }
            setError(null);
            setCropSource(file);
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      {cropSource && (
        <LogoCropper
          file={cropSource}
          onCancel={() => setCropSource(null)}
          onApply={(cropped) => {
            if (cropped.size > MAX_LOGO_BYTES) {
              setError(`The cropped image is still over ${MAX_LOGO_BYTES / 1024} KB.`);
              return;
            }
            const name = cropSource.name;
            const reader = new FileReader();
            reader.onload = () => {
              setError(null);
              setCropSource(null);
              onPick(String(reader.result), name);
            };
            reader.onerror = () => setError("Could not read that image.");
            reader.readAsDataURL(cropped);
          }}
        />
      )}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="flex items-center justify-between gap-3 text-[var(--m-text-primary)]">
        <span>{label}</span>{hint && <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--m-text-secondary)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--m-text-secondary)]">{label}</p><p className="mt-1 text-sm font-medium text-[var(--m-text-primary)]">{value}</p></div>;
}

export function AuctionFlow({ networkSlug }: { networkSlug: string }) {
  /**
   * WHICH CHAIN THIS AUCTION DEPLOYS TO — chosen in step 1, like the fair flow.
   *
   * The page's chain was the only answer and it appeared nowhere, so an auction
   * opened from `+ Create` over a market was created on that market's chain
   * silently. It is the default here, so existing `/create?chain=` links are
   * unchanged; `defaultLaunchChain` falls back when that chain has no generator.
   *
   * The draft and the route it pushes both move with it — writing the draft
   * under the PAGE's chain while deploying to another is how the review screen
   * comes to describe a different network than the one that will be used.
   */
  const launchChainOptions = useMemo(() => launchChains(), []);
  const [launchChain, setLaunchChain] = useState(() =>
    defaultLaunchChain(networkSlug, launchChainOptions),
  );
  const router = useRouter();
  const { isConnected } = useAccount();
  const { open } = useWalletConnect();
  const [step, setStep] = useState<Step>("token");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState({ name: "", symbol: "", supply: "100,000,000", logo: "" });
  const [logoName, setLogoName] = useState<string | null>(null);

  /**
   * The auction's token state is a SUBSET of `TokenDraft` — no description,
   * website or x, and it calls the data URL `logo` where the draft splits
   * `logoPreview` from `logoName`. Adapted here rather than widening the state,
   * because those fields are collected on the fair-launch flow and genuinely
   * are not asked for here; inventing empty ones in the state would read as
   * "we forgot to wire these".
   */
  const previewToken = useMemo(
    () => ({
      name: token.name,
      symbol: token.symbol,
      description: "",
      website: "",
      x: "",
      logoPreview: token.logo || null,
      logoName,
    }),
    [token.name, token.symbol, token.logo, logoName],
  );
  const [sale, setSale] = useState({ price: "0.01", target: "100,000", minimum: "50,000", cap: "5,000", duration: "3" });
  /** `sale.price` is quote-per-token, typed with separators. NaN leaves the row "—". */
  const previewPrice = useMemo(() => {
    const parsed = Number(String(sale.price).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [sale.price]);
  const [allocation, setAllocation] = useState({ presale: "10,000,000", liquidity: "2,000,000", creator: "20,000,000", treasury: "68,000,000", lpBps: "20" });
  // No taker fee here. The presale only has to open the market; the creator sets
  // up the pair they actually want after graduation, and that is where the fee
  // is chosen. Asking for it now would be collecting a number nothing acts on.
  const [graduation, setGraduation] = useState({ lock: "12 months", vesting: "12 months", listingPrice: "0.01" });
  const idx = steps.findIndex((item) => item.key === step);
  const canContinue = step === "token" ? Boolean(token.name.trim() && token.symbol.trim()) : true;
  const total = useMemo(() => Number(allocation.presale.replaceAll(",", "")) + Number(allocation.liquidity.replaceAll(",", "")) + Number(allocation.creator.replaceAll(",", "")) + Number(allocation.treasury.replaceAll(",", "")), [allocation]);
  const supply = Number(token.supply.replaceAll(",", "")) || 0;
  const validAllocation = total <= supply;

  // The same four fields the allocation step collects, as something drawable.
  // `allocate` divides by the SUPPLY rather than by their sum, so a draft that
  // has only spoken for part of it renders a gap instead of a full ring — and
  // an over-allocation, which `validAllocation` above already blocks, is
  // stated on the review rather than only felt as a disabled button.
  const num = (value: string) => Number(value.replaceAll(",", "")) || 0;
  const supplySplit = useMemo(
    () =>
      allocate(
        [
          { label: "Presale", value: num(allocation.presale) },
          { label: "Liquidity", value: num(allocation.liquidity) },
          { label: "Creator", value: num(allocation.creator) },
          { label: "Treasury", value: num(allocation.treasury) },
        ],
        supply,
      ),
    [allocation, supply],
  );
  const forSale = supply > 0 ? fmtShare(num(allocation.presale) / supply) : "\u2014";

  const update = <T extends object>(setter: Dispatch<SetStateAction<T>>, key: keyof T, value: string) => setter((current) => ({ ...current, [key]: value }));
  const next = () => {
    if (!canContinue) return;
    if (step === "allocation" && !validAllocation) return;
    setStep(steps[Math.min(idx + 1, steps.length - 1)]!.key);
  };
  const back = () => setStep(steps[Math.max(idx - 1, 0)]!.key);
  /**
   * Creating the presale.
   *
   * ## This does NOT submit a transaction yet, and now says so
   *
   * `PresaleLaunch.createPresale` is deployed on both chains and its ABI is in
   * `@iter/abis`, but its `CreateParams` needs four values this form never collects — a
   * quote token, a treasury address, a start time and per-field decimals. Guessing any of
   * them writes permanent terms to a contract with someone else's money, so the draft
   * path stays until the form asks for them.
   *
   * What changed is the claim. The panel said "Onchain action" over a button reading
   * "Create presale", and the whole thing wrote to localStorage and navigated: no wallet,
   * no transaction, no failure path. It is labelled as the preview it is.
   */
  const create = () => {
    if (!isConnected) { open(); return; }
    if (creating) return; // nothing guarded a second click
    setCreating(true);
    try {
      const id = `${token.symbol.toLowerCase() || "auction"}-${Date.now()}`;
      // Not fatal if storage refuses: the profile route reads by id and renders a
      // stable shell either way, so the launch stays navigable.
      const stored = writeAuctionDraft(launchChain, id, { token, sale, allocation, graduation, id, createdAt: Date.now(), raised: 0 });
      if (!stored) {
        // It was already non-fatal; what was missing is telling anyone. A draft that
        // silently failed to save looks identical to one that saved.
        toast.warning("Couldn't save this draft in your browser", {
          description: "The preview still opens, but reloading may lose these settings.",
        });
      }
      router.push(`/create/auction/${id}?chain=${encodeURIComponent(launchChain)}`);
    } catch (error) {
      setCreating(false);
      toastContractError(error, "Couldn't open the presale preview");
    }
  };

  return <div className="mx-auto w-full max-w-[1120px] px-[22px] pb-24 pt-10 text-[var(--m-text-primary)]">
    <div className="mb-8 flex items-end justify-between gap-6"><div><p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--m-primary-fg)]">Auction launch</p><h1 className="mt-3 text-[clamp(34px,5vw,58px)] font-medium leading-[.96] tracking-[-.06em]">Open with a fair price.</h1><p className="mt-4 max-w-[55ch] text-sm leading-6 text-[var(--m-text-secondary)]">One price for everyone, automatic pro-rata settlement, and graduation liquidity committed before the market opens.</p></div><div className="hidden rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface-2)] p-4 text-right sm:block"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--m-text-secondary)]">Flow</p><p className="mt-1 text-sm font-medium">{String(idx + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</p></div></div>
    {/* The same progress bar the trade and launch flows use. The five-dot strip hid its
        own labels below `sm:` — on a phone it was five numbered circles and no words,
        which says how many steps exist and nothing about which one you are on. The bar
        names the step at every width. */}
    <div className="mb-8 border-y border-[var(--m-border)] py-4">
      <Stepper
        shape="bar"
        label="Auction setup progress"
        steps={steps.map((item) => ({ key: item.key, label: item.label }))}
        activeIndex={idx}
      />
    </div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .24 }}>
      {step === "token" && <section className="grid gap-6 lg:grid-cols-[1fr_340px]"><div className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7"><p className="font-mono text-[11px] uppercase tracking-[.16em] text-[var(--m-text-secondary)]">Token identity</p><h2 className="mt-2 text-2xl font-medium tracking-[-.04em]">Make the asset legible.</h2><div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="Token name"><input className={inputClass} value={token.name} onChange={(e) => update(setToken, "name", e.target.value)} placeholder="e.g. Atlas" /></Field><Field label="Ticker"><input className={inputClass} value={token.symbol} onChange={(e) => update(setToken, "symbol", e.target.value.toUpperCase())} placeholder="ATLAS" maxLength={12} /></Field><Field label="Total supply" hint="18 decimals"><input className={inputClass} value={token.supply} onChange={(e) => update(setToken, "supply", e.target.value)} /></Field><Field label="Network" hint="where it deploys"><select aria-label="Launch network" data-testid="auction-network" className={inputClass} value={launchChain} onChange={(e) => setLaunchChain(e.target.value)}>{launchChainOptions.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}</select></Field><div className="text-sm"><span className="flex items-center justify-between gap-3 text-[var(--m-text-primary)]"><span>Logo</span><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--m-text-secondary)]">optional</span></span><LogoPicker symbol={token.symbol} logo={token.logo} fileName={logoName} onPick={(dataUrl, name) => { update(setToken, "logo", dataUrl); setLogoName(name); }} /></div></div></div><div className="flex min-w-0 flex-col gap-4"><LaunchPreviewCard compact token={previewToken} quote={null} startPrice={previewPrice} networkSlug={launchChain} /><aside className="rounded-2xl border border-[color-mix(in_srgb,var(--m-primary)_22%,var(--m-border))] bg-[color-mix(in_srgb,var(--m-primary)_7%,var(--m-surface))] p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-primary-fg)]">What stays fixed</p><p className="mt-3 text-sm leading-6 text-[var(--m-text-secondary)]">Every buyer enters at the same price. The token supply and presale allocation are deposited before the sale opens.</p><div className="mt-6 space-y-3 text-sm"><div className="flex justify-between border-b border-[var(--m-border)] pb-3"><span>Decimals</span><b>18</b></div><div className="flex justify-between border-b border-[var(--m-border)] pb-3"><span>Allocation</span><b>{allocation.presale}</b></div><div className="flex justify-between"><span>Sale type</span><b>Pro-rata</b></div></div></aside></div></section>}
      {step === "sale" && <section className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7"><p className="font-mono text-[11px] uppercase tracking-[.16em] text-[var(--m-text-secondary)]">Presale terms</p><h2 className="mt-2 text-2xl font-medium tracking-[-.04em]">Set one clear price.</h2><div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="Presale price" hint="USDC / token"><input className={inputClass} value={sale.price} onChange={(e) => update(setSale, "price", e.target.value)} /></Field><Field label="Target raise" hint="USDC"><input className={inputClass} value={sale.target} onChange={(e) => update(setSale, "target", e.target.value)} /></Field><Field label="Minimum raise" hint="USDC"><input className={inputClass} value={sale.minimum} onChange={(e) => update(setSale, "minimum", e.target.value)} /></Field><Field label="Max per wallet" hint="USDC"><input className={inputClass} value={sale.cap} onChange={(e) => update(setSale, "cap", e.target.value)} /></Field><Field label="Duration" hint="days"><select className={inputClass} value={sale.duration} onChange={(e) => update(setSale, "duration", e.target.value)}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option></select></Field></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><Stat label="Buyer price" value={`$${sale.price}`} /><Stat label="Oversubscription" value="Pro-rata allocation" /><Stat label="Failure" value={`Refund below $${sale.minimum}`} /></div></section>}
      {step === "allocation" && <section className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7"><p className="font-mono text-[11px] uppercase tracking-[.16em] text-[var(--m-text-secondary)]">Supply map</p><h2 className="mt-2 text-2xl font-medium tracking-[-.04em]">Decide where the supply goes.</h2><div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="Presale allocation"><input className={inputClass} value={allocation.presale} onChange={(e) => update(setAllocation, "presale", e.target.value)} /></Field><Field label="Graduation liquidity"><input className={inputClass} value={allocation.liquidity} onChange={(e) => update(setAllocation, "liquidity", e.target.value)} /></Field><Field label="Creator allocation"><input className={inputClass} value={allocation.creator} onChange={(e) => update(setAllocation, "creator", e.target.value)} /></Field><Field label="Treasury allocation"><input className={inputClass} value={allocation.treasury} onChange={(e) => update(setAllocation, "treasury", e.target.value)} /></Field></div><div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-4 py-3 text-sm"><span>Total committed supply</span><b className={validAllocation ? "text-[var(--m-text-primary)]" : "text-red-500"}>{total.toLocaleString()} / {supply.toLocaleString()}</b></div>{!validAllocation && <p className="mt-2 text-xs text-red-500">Allocations exceed total supply.</p>}<div className="mt-6"><Field label="Raise committed to liquidity" hint={<b className="text-[13px] font-medium tabular-nums text-[var(--m-primary-fg)]">{allocation.lpBps}%</b>}><input className={inputClass} type="range" min="20" max="100" step="10" value={allocation.lpBps} onChange={(e) => update(setAllocation, "lpBps", e.target.value)} />{/* Endpoints only. The live value belongs beside the label -- centred under the track it reads as a 50% tick mark rather than the current setting. */}<div className="mt-2 flex justify-between font-mono text-xs text-[var(--m-text-secondary)]"><span>20% minimum</span><span>100%</span></div></Field></div></section>}
      {step === "graduation" && <section className="grid gap-6 lg:grid-cols-[1fr_340px]"><div className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7"><p className="font-mono text-[11px] uppercase tracking-[.16em] text-[var(--m-text-secondary)]">After the raise</p><h2 className="mt-2 text-2xl font-medium tracking-[-.04em]">Make the market durable.</h2><div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="Opening listing price" hint="USDC / token"><input className={inputClass} value={graduation.listingPrice} onChange={(e) => update(setGraduation, "listingPrice", e.target.value)} /></Field><Field label="LP lock"><select className={inputClass} value={graduation.lock} onChange={(e) => update(setGraduation, "lock", e.target.value)}><option>6 months</option><option>12 months</option><option>24 months</option><option>Permanent</option></select></Field><Field label="Creator vesting"><select className={inputClass} value={graduation.vesting} onChange={(e) => update(setGraduation, "vesting", e.target.value)}><option>3 months</option><option>12 months</option><option>24 months</option></select></Field></div></div><aside className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface-2)] p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-text-secondary)]">Graduation promise</p><div className="mt-5 space-y-4 text-sm"><div><b>{allocation.lpBps}%</b><p className="mt-1 text-[var(--m-text-secondary)]">of accepted raise enters CLOB liquidity</p></div><div><b>{graduation.lock}</b><p className="mt-1 text-[var(--m-text-secondary)]">liquidity lock</p></div><div><b>{graduation.vesting}</b><p className="mt-1 text-[var(--m-text-secondary)]">creator vesting schedule</p></div></div></aside></section>}
      {step === "review" && (
        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-[var(--m-border)] bg-[var(--m-surface)] p-5 sm:p-7">
            <ReviewSummary
              title="Review & confirm"
              lede="Check every figure before opening the presale."
              symbol={token.symbol.trim().toUpperCase() || "TOKEN"}
              name={token.name.trim() || "Untitled"}
              logoURI={token.logo || undefined}
              chip="Presale"
              tiles={[
                {
                  label: "Total supply",
                  value: supply > 0 ? supply.toLocaleString("en-US") : "\u2014",
                },
                { label: "For sale", value: forSale, hint: "of total supply" },
                { label: "Target raise", value: `$${sale.target}`, hint: `minimum $${sale.minimum}` },
                { label: "Duration", value: `${sale.duration}d`, hint: `$${sale.cap} per wallet` },
              ]}
              allocation={supplySplit}
              allocationNote="Presale, liquidity and treasury are the slices the contract moves at settlement. Anything unallocated stays with the deployer."
            >
              <div className="rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] p-4 text-sm leading-6 text-[var(--m-text-secondary)]">
                All buyers receive the same price. If commitments exceed the target, allocation is
                pro-rata and the remainder is refunded automatically. If the minimum is not reached,
                the sale fails and buyers are refunded.
              </div>
            </ReviewSummary>
          </div>
          <aside className="rounded-2xl border border-[color-mix(in_srgb,var(--m-primary)_25%,var(--m-border))] bg-[color-mix(in_srgb,var(--m-primary)_8%,var(--m-surface))] p-6"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[var(--m-primary-fg)]">Preview</p><p className="mt-3 text-sm leading-6 text-[var(--m-text-secondary)]">These terms open as a preview you can review and share. <b className="font-medium text-[var(--m-text-primary)]">Nothing is deployed and no wallet is asked</b> — presale creation goes on chain once the quote token, treasury and start time are part of this form.</p><button type="button" onClick={create} disabled={creating} className="mt-6 min-h-12 w-full rounded-xl bg-[var(--m-primary)] px-5 text-sm font-medium text-[var(--m-on-primary)] transition hover:brightness-105 disabled:opacity-60">{!isConnected ? "Connect wallet" : creating ? "Opening…" : "Open presale preview"}</button></aside>
        </section>
      )}
    </motion.div></AnimatePresence>
    {step !== "review" && <div className="mt-7 flex items-center justify-between"><button type="button" onClick={back} disabled={idx === 0} className="rounded-xl px-4 py-3 text-sm text-[var(--m-text-secondary)] transition hover:bg-[var(--m-surface-2)] disabled:invisible">Back</button><button type="button" onClick={next} disabled={!canContinue || (step === "allocation" && !validAllocation)} className="rounded-xl bg-[var(--m-primary)] px-6 py-3 text-sm font-medium text-[var(--m-on-primary)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">Continue</button></div>}
    {step === "review" && <div className="mt-7 flex justify-start"><button type="button" onClick={back} className="rounded-xl px-4 py-3 text-sm text-[var(--m-text-secondary)] transition hover:bg-[var(--m-surface-2)]">Back to graduation</button></div>}
  </div>;
}
