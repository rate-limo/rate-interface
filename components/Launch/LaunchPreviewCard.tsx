"use client";

/**
 * The coin, as it will look once it exists.
 *
 * ## Why the launch flow grew a preview at all
 *
 * Every step of this wizard collects something permanent. `Coin` has no owner
 * and no mint function, so the name, the ticker and the supply are final from
 * the moment the deploy returns — there is nobody who can fix a typo
 * afterwards, which is why step 6 gates on typing the symbol back.
 *
 * A typed gate catches a mistyped symbol. It cannot catch a symbol that is
 * spelled exactly as intended and looks wrong, or a name that overruns the one
 * line Explore gives it. Those are only visible on the artefact, so the
 * artefact is rendered beside the form the whole way through rather than
 * revealed on the success screen, where knowing costs the creator a deploy.
 *
 * ## The artwork is derived, never blank
 *
 * With no upload the card draws a mesh whose base hue is `tokenColor(symbol)`
 * — the same fallback swatch `TokenImageIcon` uses — spun by a second hash so
 * that eight avatar colours do not become eight possible coins. See
 * `lib/launch/preview.ts` for why both hashes are needed.
 *
 * Note this is the one place where colouring by SYMBOL is correct:
 * `useTokenBrand`'s `(chainId, address)` keying exists because this venue lets
 * anyone mint a coin called USDC, and here there is no address yet to key on.
 * Nothing about this preview reaches a deployed token's branding.
 *
 * ## Two compositions, one component
 *
 * `compact` is the sub-1100px strip that rides above the stepper; the default
 * is the sticky rail beside it. Both mount at every width and CSS hides one —
 * the same arrangement `AppShell` uses for its two search triggers, and the
 * reason a desktop change cannot silently delete the narrow rendering.
 */

import { useCallback, useRef, useState } from "react";
import { slugToNetworkName } from "@/consts";
import { tokenColor } from "@/lib/swap/tokens";
import { cn } from "@/lib/utils";
import { prettySupply } from "@/lib/launch/preview";
import { fmtRate } from "@/lib/launch/mock";
import { TokenArt } from "./TokenArt";
import { CardRow, CardTitle } from "./cardParts";
import { COIN_DECIMALS, LAUNCH_SUPPLY_TEXT, type QuoteOption, type TokenDraft } from "@/lib/launch/types";

export function LaunchPreviewCard({
  token,
  quote,
  startPrice,
  networkSlug,
  compact = false,
  className,
}: {
  token: TokenDraft;
  /** Null until step 2 has a selection — the market rows then read "—". */
  quote: QuoteOption | null;
  /** Quote per coin at the start — the contract's, from the starting market cap and this supply. */
  startPrice?: number;
  networkSlug?: string;
  compact?: boolean;
  className?: string;
}) {
  const symbol = token.symbol.trim().toUpperCase();
  const shown = symbol || "TOKEN";
  const name = token.name.trim() || "Unnamed";
  const chainName = slugToNetworkName[(networkSlug ?? "").trim().toLowerCase()];


  const cardRef = useRef<HTMLDivElement | null>(null);
  const [holo, setHolo] = useState<{ x: number; y: number } | null>(null);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    // Tilt is a pointer affordance, so it is skipped entirely for anyone who
    // asked for less motion rather than merely shortened.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(1000px) rotateY(${((px - 0.5) * 10).toFixed(2)}deg) rotateX(${((0.5 - py) * 10).toFixed(2)}deg)`;
    setHolo({ x: px * 100, y: py * 100 });
  }, []);

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    if (el) el.style.transform = "";
    setHolo(null);
  }, []);

  const art = (
    <TokenArt symbol={shown} logoURI={token.logoPreview} chainName={chainName} />
  );

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-[13px] border border-[var(--m-border)] bg-[var(--m-surface-2)] p-2.5",
          className,
        )}
      >
        {/* No symbol plate at 56px: the plate's type is `clamp(18px,7vw,30px)`,
            which is sized against the VIEWPORT, so on a desktop it renders
            30px glyphs inside a 56px square and truncates to a letter and an
            ellipsis. The strip already prints the symbol as text beside it. */}
        <div className="w-14 shrink-0">
          <TokenArt symbol={shown} logoURI={token.logoPreview} chainName={chainName} showSymbol={false} />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <b className="text-[13.5px] font-semibold">${shown}</b>
            <span className="truncate text-[11.5px] text-[var(--m-text-secondary-2)]">{name}</span>
          </div>
          <p className="mt-0.5 font-mono text-[10.5px] text-[var(--m-text-secondary-2)]">
            {prettySupply(LAUNCH_SUPPLY_TEXT)} · {quote ? `${shown}/${quote.symbol}` : "no market yet"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full [perspective:1000px]", className)}>
      <div
        ref={cardRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="relative rounded-[16px] border border-[var(--m-border)] bg-[var(--m-surface)] p-[5px] shadow-[0_20px_44px_-26px_rgba(0,0,0,.85)] transition-transform duration-150 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
      >
        {/* The holographic sweep only exists while a pointer is on the card, so
            it is absent from the first paint and from every touch rendering. */}
        {holo && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 rounded-[16px] opacity-40 mix-blend-overlay"
            style={{
              background:
                `radial-gradient(circle at ${holo.x.toFixed(1)}% ${holo.y.toFixed(1)}%,` +
                "rgba(255,255,255,.75) 0%, rgba(255,0,255,.4) 18%, rgba(0,255,255,.35) 36%," +
                "rgba(255,255,0,.3) 54%, rgba(0,255,0,.25) 72%, transparent 92%)",
            }}
          />
        )}

        {art}

        <div className="px-2 pb-1.5 pt-3">
          <CardTitle symbol={shown} name={name} />

          <dl className="font-mono text-[11.5px]">
            <CardRow k="Supply" v={`${prettySupply(LAUNCH_SUPPLY_TEXT)} · ${COIN_DECIMALS} dec`} />
            <CardRow k="Market" v={quote ? `${shown} / ${quote.symbol}` : "—"} />
            {/* A rate, never a dollar figure: the liquidity and launch specs
                both require quote-per-base and this pair is rarely USD. */}
            <CardRow
              k="Opens at"
              v={quote && startPrice && startPrice > 0 ? `1 ${shown} = ${fmtRate(startPrice)} ${quote.symbol}` : "—"}
            />
          </dl>
        </div>
      </div>

      <p className="mt-2.5 text-center text-[11.5px] leading-snug text-[var(--m-text-secondary-2)]">
        This is the card Explore renders once it deploys.
      </p>
    </div>
  );
}
