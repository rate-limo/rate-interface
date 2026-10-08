"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Copyright } from "@/components/Molecules/Copyright";
import { SupportButton } from "@/components/Support/SupportWidget";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SoundToggle } from "@/components/Sound/SoundToggle";
import { findChain } from "@iter/deployments";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { useNetworkGas } from "@/hooks/useNetworkGas";
import { useAccount } from "wagmi";
import { useFeeToken } from "@/lib/wallet/feeToken";
import { useRpcStatus } from "@/hooks/useRpcStatus";
import { epochEndsAt, epochOf } from "@/lib/rewards/epoch";
import { tradeGearFromPathname } from "@/lib/routing/chainParams";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The app status bar (approved proposal, 2026-07-29): a 40px live-data strip at
 * the foot of the shell — the ETH price, network gas, and the epoch countdown —
 * with the static links and the theme toggle pushed to the right.
 *
 * This bar IS the bottom of the app shell. There is no separate footer element
 * on app pages any more — Organisms/FooterGroup and Sections/Footer/Desktop are
 * deleted, and the copyright, the legal links and support that lived in them sit
 * in the right-hand cluster here. A second bar under this one is what that was,
 * and one bottom bar is the point. components/Landing/Footer.tsx is unrelated —
 * it is the marketing page's own and stays.
 *
 * Design decisions carried over from the proposal:
 *  - No palette/accent picker. Monet is one palette with two modes, so there's
 *    no second thing to pick — the mode toggle is the whole control.
 *  - The theme toggle lives HERE and was removed from AppSidebar rather than
 *    duplicated in both places.
 *  - Gas never renders a bare 0 (see useNetworkGas).
 *  - Sticky by default so it stays visible while still occupying layout (so it
 *    never covers page content), but static on /trade, where 40px of permanent
 *    vertical space is real estate the terminal needs.
 *
 * Every chip degrades to an em-dash rather than a zero: the hosted indexer is
 * currently unreachable, and "$0.00" is indistinguishable from a real price.
 */

/** Same destinations as components/Landing/Footer.tsx, plus the cookie policy —
 * withdrawing consent has to be reachable from inside the app, not only from the
 * banner a user has already dismissed. */
/**
 * `i18nKey` is optional on purpose. X, GitHub and Whitepaper are proper nouns —
 * a product name is not translated, and a transliterated "GitHub" would be worse
 * in every locale than the name itself. Only the common noun gets a key.
 */
const LINKS: { label: string; href: string; i18nKey?: "cookies" }[] = [
  // Privacy and Legal moved here when the separate footer bar was deleted —
  // this strip is the bottom of the app shell, so it carries them now.
  { label: "Privacy", href: "/privacy" },
  { label: "Legal", href: "/terms" },
  { label: "X", href: "https://x.com/off____grid" },
  { label: "GitHub", href: "https://github.com/rate-limo/rate-monorepo" },
  {
    label: "Whitepaper",
    href: "https://github.com/rate-limo/rate-research/blob/main/iter-whitepaper.md",
  },
  // Exactly ONE legal link here, not three. This is a 40px strip already
  // carrying four live-data chips and the theme toggle; three more items is how
  // it starts wrapping. /cookies is the right one to surface because it is the
  // time-sensitive one — withdrawing consent has to be reachable from inside the
  // app — and it cross-links to terms and privacy. The landing footer carries
  // all three.
  { label: "Cookies", href: "/cookies", i18nKey: "cookies" },
];

const DASH = "—";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Time left in the current rewards epoch.
 *
 * Returns null until mounted so the server and the first client render agree —
 * a countdown computed during render is the exact hydration mismatch the OG
 * Pass countdown rule in apps/web/CLAUDE.md warns about.
 */
function useEpochCountdown(): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const remainingMs = epochEndsAt(now).getTime() - now.getTime();

      if (remainingMs <= 0) {
        setLabel("00:00:00");
        return;
      }

      const totalSec = Math.floor(remainingMs / 1000);
      const days = Math.floor(totalSec / 86_400);
      const hours = Math.floor((totalSec % 86_400) / 3_600);
      const mins = Math.floor((totalSec % 3_600) / 60);
      const secs = totalSec % 60;

      // Drop seconds once it's more than a day out — a ticking seconds digit
      // implies a precision the mock epoch boundary doesn't have.
      setLabel(
        days > 0
          ? `${days}d ${pad(hours)}:${pad(mins)}`
          : `${pad(hours)}:${pad(mins)}:${pad(secs)}`,
      );
    };

    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  return label;
}

function Chip({
  label,
  children,
  title,
}: {
  label: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" title={title}>
      <span className="font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase">
        {label}
      </span>
      <span className="font-dm-mono text-[11px] text-[color:var(--m-text-primary)] tabular-nums">
        {children}
      </span>
    </div>
  );
}

/**
 * ETH/USD, from Coinbase.
 *
 * ## What this replaces
 *
 * Two `PriceChip`s — ITER and ETH — read `defaultTokenData`, which is
 * `useTokens(network, 20, 1, "")`: the first page of twenty tokens from the
 * chain's own indexer, not a price lookup. A chip showed a price only when its
 * token happened to land in that page, so both spent most of their time
 * rendering an em-dash, and on Arc the ETH one could never do anything else —
 * the gas asset there is USDC and the venue has no ETH market for the list to
 * contain.
 *
 * ETH/USD is a fact about the world, not about this venue's book, so it no
 * longer comes from the book. ITER is gone rather than re-sourced: it does not
 * trade anywhere, so there is no price to fetch and a permanent dash is not
 * worth the width.
 *
 * ## Degrading
 *
 * `/api/eth-price` never fails — it answers `{ usd: null }` on any upstream
 * problem — so loading, unreachable and unparseable all arrive here the same
 * way and render the same dash. A missing price is not a $0 price, which is the
 * rule every other chip in this bar already follows.
 */
function EthPriceChip() {
  const { data, isError } = useQuery<{ usd: number | null; changePct: number | null }>({
    queryKey: ["eth-price"],
    queryFn: async () => {
      const response = await fetch("/api/eth-price");
      if (!response.ok) throw new Error(`eth price: ${response.status}`);
      return response.json();
    },
    // Matched to the route's own `revalidate`. Polling faster only re-serves a
    // response the server is still caching.
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const usd = data?.usd ?? null;
  if (isError || usd === null) {
    return (
      <Chip label="ETH" title={isError ? "ETH price unavailable — Coinbase unreachable" : undefined}>
        <span className="text-[color:var(--m-text-secondary)]">{DASH}</span>
      </Chip>
    );
  }

  const delta = data?.changePct ?? null;
  return (
    <Chip label="ETH" title="ETH/USD · Coinbase · 24h change">
      <span className="inline-flex items-center gap-1.5">
        <span>
          $
          {usd.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        {/* Only when the 24h open was actually read. A missing open renders
            nothing rather than a green 0.00%, which would claim the price has
            not moved when the truth is that we could not tell. */}
        {delta !== null && (
          <span
            className={
              delta >= 0 ? "text-[color:var(--m-success)]" : "text-[color:var(--m-error)]"
            }
          >
            {delta >= 0 ? "▲" : "▼"}
            {Math.abs(delta).toFixed(2)}%
          </span>
        )}
      </span>
    </Chip>
  );
}

/**
 * Network gas, with the mark of the asset it is actually denominated in.
 *
 * The number alone is ambiguous across chains and this venue serves several:
 * gwei on RISE is ether, gwei on Arc is USDC — Arc's gas asset IS USDC, and its
 * native view is 18 decimals while the ERC-20 is 6 (see lib/customChains.ts).
 * "0.05 gwei" says nothing about which of those you are about to spend, and the
 * mark is the cheapest way to say it.
 *
 * The symbol comes from the REGISTRY's `nativeCurrency`, never a hardcoded list
 * — `utils/order.ts`'s `isNativeSymbol` does not contain USDC and would report
 * that Arc has no gas asset at all.
 *
 * `badge={false}`: the chain is passed so `TokenImageIcon` can recognise the gas
 * token and prefer the operator's uploaded mark, NOT so it draws a network chip.
 * At 11px, on a 16px mark, beside a label that already says Gas, a badge is
 * noise. Every other fallback still applies — an operator's upload, then the
 * token list's image for the symbol, then the logo mark.
 */
function GasChip() {
  const gas = useNetworkGas();
  const { displayNetworkName } = useMarketPageContext();
  const { address } = useAccount();
  const gasChain = findChain(displayNetworkName);
  // Tempo has no gas coin: name the TIP-20 THIS account pays in (its FeeManager
  // choice, else PathUSD), not the registry's "USD" placeholder.
  const feeToken = useFeeToken(gasChain?.chainId, address);
  const nativeSymbol = feeToken?.symbol ?? gasChain?.nativeCurrency.symbol;

  return (
    <Chip
      label="Gas"
      title={
        gas.state === "unavailable"
          ? "Gas price unavailable for this chain"
          : nativeSymbol
            ? `Network gas price (gwei), paid in ${nativeSymbol}`
            : "Network gas price (gwei)"
      }
    >
      <span className="inline-flex items-center gap-1">
        {/* Rendered whatever the price says. An unreachable RPC makes the NUMBER
            unknown; it does not change which asset the chain charges in, and
            dropping the mark with the number would imply otherwise. */}
        {nativeSymbol && (
          <TokenImageIcon
            symbol={nativeSymbol}
            color="var(--m-primary)"
            chainName={displayNetworkName}
            badge={false}
            size="sm"
            className="!h-4 !w-4 shrink-0"
          />
        )}
        {gas.state === "ok" ? (
          <>
            {gas.gwei}
            <span className="ml-0.5 text-[color:var(--m-text-secondary)]">gwei</span>
          </>
        ) : (
          <span className="text-[color:var(--m-text-secondary)]">{DASH}</span>
        )}
      </span>
    </Chip>
  );
}

/**
 * RPC health, as a dot and the height it is reporting.
 *
 * The height IS the status — a number that moves is the only evidence the chain
 * is answering, where a bare "Connected" would keep claiming success against a
 * transport that is up and no longer producing. `stale` exists for exactly that
 * case and says how long it has been, because "it stopped 4 minutes ago" and
 * "it stopped yesterday" are different problems.
 *
 * Down renders the em-dash, same as every other chip here: no number we cannot
 * stand behind.
 */
function RpcChip() {
  const rpc = useRpcStatus();

  const dot =
    rpc.state === "live"
      ? "var(--m-success)"
      : rpc.state === "stale"
        ? "var(--m-warning)"
        : "var(--m-text-secondary-2)";

  const title =
    rpc.state === "live"
      ? "RPC responding · latest block"
      : rpc.state === "stale"
        ? `RPC reachable but no new block for ${rpc.secondsSince}s`
        : rpc.state === "down"
          ? "RPC unreachable for this chain"
          : "Checking RPC";

  return (
    <Chip label="RPC" title={title}>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
        {rpc.state === "live" || rpc.state === "stale" ? (
          rpc.block
        ) : (
          <span className="text-[color:var(--m-text-secondary)]">{DASH}</span>
        )}
      </span>
    </Chip>
  );
}

function WebSocketChip() {
  const { marketWebSocketStatus } = useMarketPageContext();
  const isConnected = marketWebSocketStatus === "connected";
  const isRetrying =
    marketWebSocketStatus === "connecting" ||
    marketWebSocketStatus === "reconnecting";
  const dot = isConnected
    ? "var(--m-success)"
    : isRetrying
      ? "var(--m-warning)"
      : "var(--m-text-secondary-2)";
  const label = isConnected
    ? "Live"
    : marketWebSocketStatus === "reconnecting"
      ? "Retrying"
      : marketWebSocketStatus === "connecting"
        ? "Connecting"
        : "Offline";

  return (
    <Chip label="WS" title={`Market WebSocket · ${label.toLowerCase()}`}>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
        {label}
      </span>
    </Chip>
  );
}

function NextBeatChip() {
  const countdown = useEpochCountdown();
  // Derived from the same genesis the countdown uses, not a mock constant. It
  // read `9` while the real grid was on 30 — a correct countdown labelled with
  // a 21-week-old epoch number.
  const [epoch, setEpoch] = useState<number | null>(null);
  useEffect(() => setEpoch(epochOf(new Date())), []);

  return (
    <Chip
      label="Next beat"
      // Null until the effect runs — same hydration rule as the countdown
      // itself. Naming no epoch beats naming "null".
      title={epoch === null ? "Rewards epoch closes" : `Rewards epoch ${epoch} closes`}
    >
      {countdown ?? (
        <span className="text-[color:var(--m-text-secondary)]">{DASH}</span>
      )}
    </Chip>
  );
}

export function StatusBar({
  className,
  supportOpen,
  onSupportToggle,
}: {
  className?: string;
  supportOpen: boolean;
  onSupportToggle: () => void;
}) {
  const pathname = usePathname();
  // Only the ORDER BOOK needs its 40px back — and since the Swap→Trade merge
  // that is `/trade/pro`, not `/trade`. `/trade` is now the convert card, a
  // narrow centred thing with space to spare, so keying this off the page kind
  // (which reports "trade" for both gears) would strand the bar at the bottom
  // of the document on Basic for no reason.
  const isTerminal = tradeGearFromPathname(pathname ?? "") === "pro";
  const tStatus = useTranslations("shell.status");

  return (
    <div
      className={cn(
        // Desktop-only, like the sidebar and top bar. Below 1200px the app uses
        // the bottom-bar pattern (e.g. IterMobileTabs), which this would
        // collide with — and gating all three chrome pieces the same way is
        // what lets AppShell pass `children` through at every width.
        "z-30 hidden h-10 w-full shrink-0 items-center gap-5 overflow-x-auto border-t border-[color:var(--m-border)] bg-[color:var(--m-surface)]/95 px-4 backdrop-blur-md min-[1200px]:flex",
        isTerminal && "fixed inset-x-0 bottom-0",
        !isTerminal && "sticky bottom-0",
        className,
      )}
    >
      <EthPriceChip />
      <GasChip />
      <RpcChip />
      <WebSocketChip />
      <NextBeatChip />

      {/* Static links, copyright and support sit together on the right, out of
          the live-data zone. There is no separate footer element: this bar IS
          the bottom of the app shell, so what would have been footer content
          lives here. */}
      <div className="ml-auto flex shrink-0 items-center gap-4">
        <Copyright />
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.href.startsWith("/") ? undefined : "_blank"}
            rel={link.href.startsWith("/") ? undefined : "noreferrer"}
            className="font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase transition-colors hover:text-[color:var(--m-text-primary)]"
          >
            {link.i18nKey ? tStatus(link.i18nKey) : link.label}
          </a>
        ))}
        <SupportButton
          open={supportOpen}
          onClick={onSupportToggle}
          className="inline-flex shrink-0 items-center gap-1.5 font-dm-mono text-[10px] tracking-[0.08em] text-[color:var(--m-text-secondary)] uppercase transition-colors hover:text-[color:var(--m-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--m-primary)] [&_svg]:h-3.5 [&_svg]:w-3.5"
        />
        <SoundToggle />
        <ThemeToggle />
      </div>
    </div>
  );
}
