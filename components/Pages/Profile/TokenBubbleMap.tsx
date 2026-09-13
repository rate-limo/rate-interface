"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "@/components/Profile/ProfileAvatar";
import { formatSubscriptDecimal } from "@/utils/number";
import { networkNameToSlug } from "@/consts";
import {
  getTokenBubbles,
  type BubbleEdge,
  type BubbleNode,
  type TokenBubblesResponse,
} from "@/queries/server/tokenBubbles";

/**
 * Holder bubbles and the transfer graph between them.
 *
 * ## Why the edges matter more than the circles
 *
 * A bubble sized by balance only restates the holder list in a rounder form. The
 * reason this view exists is the LINES: eight "independent" wallets that were all
 * funded from one address read as a single actor the moment you can see the
 * links, and no ranked table shows that. So edges are drawn first and given the
 * contrast budget; the circles are the substrate.
 *
 * ## The layout is hand-rolled, deliberately
 *
 * A force simulation is ~40 lines and this repo has no graph library. Adding
 * d3-force (or worse, a full graph toolkit) to draw at most 200 nodes would cost
 * more bundle than the whole feature. Canvas rather than SVG for the same
 * reason: 200 nodes plus their edges is a few hundred DOM elements re-laid-out
 * every frame, versus one element.
 *
 * The simulation is deterministic — node index seeds the initial ring — so the
 * same token lays out the same way on every visit. A layout that reshuffles per
 * render makes people think the data changed.
 */
export function TokenBubbleMap({
  networkName,
  address,
  symbol,
  launchedHere,
  className,
}: {
  networkName: string;
  address: string | undefined;
  symbol: string;
  /**
   * Whether this coin came from Iter's AssetGenerator — `creator` on the token
   * row. It separates the two reasons `covered` can be false, which otherwise
   * collapse into one message that is wrong for half of them.
   */
  launchedHere: boolean;
  className?: string;
}) {
  /**
   * Which view is showing. Declared before every early return below — this
   * component has four of them, and a `useState` placed after any one would be
   * a conditional hook.
   */
  const [view, setView] = useState<"list" | "map">("list");

  const { data, isLoading } = useQuery<TokenBubblesResponse | null>({
    queryKey: ["token-bubbles", networkName, address?.toLowerCase()],
    enabled: !!address && !!networkName,
    refetchInterval: 120_000,
    queryFn: async () => (address ? getTokenBubbles(networkName, address, 60) : null),
  });

  if (isLoading) {
    return (
      <Frame className={className}>
        <div className="h-[360px] animate-pulse rounded-[14px] bg-[color:var(--m-surface-2)]" />
      </Frame>
    );
  }

  // Three different answers that must never share a message:
  //
  //   data === null        the request failed — usually the endpoint is not
  //                        deployed yet. TEMPORARY, and saying "not launched
  //                        here" would be a flat lie about a coin that was.
  //   covered === false    not a launched coin, so no graph can ever exist.
  //                        PERMANENT.
  //   nodes.length === 0   a launched coin nobody holds yet. Resolves itself.
  //
  // These were collapsed into one branch and it produced exactly the lie above:
  // a launched coin whose fetch 404'd rendered "ETH was not launched here" on a
  // page that says, six inches higher, that it was.
  if (!data) {
    return (
      <Frame className={className}>
        <Empty
          title="Holder map unavailable"
          body="The holder graph could not be loaded right now. This is a temporary problem with the data service, not a statement about this token."
        />
      </Frame>
    );
  }

  if (!data.covered) {
    // Two different reasons, and saying the wrong one is worse than saying
    // nothing: the gateway reports `covered: false` both for a coin that was
    // never launched here AND for one that was, whose Transfer log has not been
    // folded (INDEX_COIN_TRANSFERS gates that source and defaults off). Telling
    // a creator their own launch "was not launched here" is simply false, and it
    // sends them looking for a problem with the coin rather than the indexer.
    return (
      <Frame className={className}>
        {launchedHere ? (
          <Empty
            title="Holder graph not available yet"
            body={`${symbol} was launched on Iter, but its transfer log has not been indexed on ${networkName} yet. This is a data-coverage gap, not a statement about who holds it.`}
          />
        ) : (
          <Empty
            title="No holder graph for this token"
            body={`Balances are reconstructed from each coin's transfer log since launch, which covers coins launched on Iter. ${symbol} was not launched here, so there is nothing to map.`}
          />
        )}
      </Frame>
    );
  }

  if (data.nodes.length === 0) {
    return (
      <Frame className={className}>
        <Empty title="Nobody holds this yet" body="The first transfer will put a bubble here." />
      </Frame>
    );
  }

  /** The same filter the canvas applies: the mint/burn sink is not a holder and
   *  a zeroed row is the ledger saying the wallet is out. */
  const holders = data.nodes.filter((n) => !n.isZeroAddress && n.balance > 0);

  return (
    <Frame className={className} tabs={<ViewTabs view={view} onView={setView} />}>
      {view === "list" ? (
        <HolderList
          nodes={holders}
          symbol={symbol}
          networkSlug={networkNameToSlug[networkName] ?? ""}
        />
      ) : (
        <Canvas data={data} symbol={symbol} />
      )}
      <p className="mt-3 border-t border-[color:var(--m-border)] pt-3 text-[10px] leading-4 text-[color:var(--m-text-secondary-2)]">
        {view === "list"
          ? "Balances are reconstructed from every transfer since launch, so they are exact rather than sampled — including wallets that never traded."
          : "Balances are reconstructed from every transfer since launch, so they are exact rather than sampled. Arrows run from sender to receiver and cover transfers between two wallets shown here; a wallet that only received from someone off this list has no line."}
      </p>
    </Frame>
  );
}

interface Placed extends BubbleNode {
  x: number;
  y: number;
  r: number;
}

function Canvas({ data, symbol }: { data: TokenBubblesResponse; symbol: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Placed | null>(null);
  const [size, setSize] = useState({ w: 640, h: 380 });

  // The zero address is a real node in the data — the mint — but its balance is
  // NEGATIVE (supply issued out of it), so it can never be sized like a holder.
  // Dropped from the drawing rather than from the payload, so the endpoint keeps
  // its double entry and the picture stays honest.
  const nodes = useMemo(() => data.nodes.filter((n) => !n.isZeroAddress && n.balance > 0), [data]);

  const placed = useMemo(() => layout(nodes, data.edges, size.w, size.h), [nodes, data.edges, size]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, parent.clientWidth);
      setSize({ w, h: 380 });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--m-primary").trim() || "#3b6cf5";
    const line = styles.getPropertyValue("--m-border").trim() || "#e5e5e5";
    const text = styles.getPropertyValue("--m-text-secondary").trim() || "#666";
    /**
     * Three roles, three colours — because every node used to be one accent, and
     * that is the whole reason this map was hard to read.
     *
     * The two biggest circles on a launched coin are the CREATOR (who still
     * holds most of the supply) and the MARKET (the pair contract escrowing
     * resting asks). Both are structural, neither is a holder in the sense a
     * reader assumes, and the market is additionally the endpoint of nearly
     * every edge — so an unlabelled graph says "one whale distributes to
     * everyone" when what actually happened is "people traded".
     */
    const creatorInk = styles.getPropertyValue("--m-accent").trim() || "#c4a96a";
    const marketInk = styles.getPropertyValue("--m-text-secondary-2").trim() || "#8b8b93";
    const inkFor = (n: { isCreator?: boolean; isMarket?: boolean }) =>
      n.isCreator ? creatorInk : n.isMarket ? marketInk : accent;

    const byId = new Map(placed.map((p) => [p.account, p]));

    /**
     * The largest transfer on the map, and the `1` that used to be in here was a
     * BUG, not a floor.
     *
     * It was `Math.max(1, ...values)` — intended as a divide-by-zero guard, but
     * `1` is a token amount, so it also clamped the DENOMINATOR. Every coin
     * whose biggest transfer is under one whole unit had all of its edges scaled
     * against 1 instead of against each other, which collapses them onto the
     * minimum width. That is most 18-decimal coins, and it never looked like a
     * bug because the lines still drew — just hairline.
     *
     * Measured on BUCKO: values 0.24975 / 0.1998 / 0.00045 all divided by 1, so
     * the thickest edge rendered at 1.12px where it should have been the widest
     * on the map.
     *
     * The guard now covers only what it was for — no edges, or every edge zero.
     */
    const edgeValues = data.edges.map((e) => e.value).filter((v) => Number.isFinite(v) && v > 0);
    const maxEdge = edgeValues.length > 0 ? Math.max(...edgeValues) : 1;

    /**
     * Width and opacity scale on the SQUARE ROOT of the ratio.
     *
     * The range is routinely three orders of magnitude — BUCKO's smallest edge
     * is 1/555th of its largest — and scaling linearly puts everything but the
     * top edge back under a pixel, which is the same invisibility the bug above
     * caused. The precise amount is in the tooltip; what the line has to carry
     * is that a link EXISTS and roughly how big it was, so the scale is
     * compressed and floored rather than proportional.
     */
    const weight = (value: number) => Math.sqrt(Math.min(Math.max(value / maxEdge, 0), 1));

    // Edges first: they are the point, and drawing them under the circles keeps
    // a line from cutting across a label.
    for (const e of data.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      /**
       * An edge through the orderbook is a TRADE; an edge between two wallets is
       * a transfer. Only the second is evidence of the thing this view is for —
       * wallets that look independent and are not — so the first is drawn in the
       * market's own grey and the second keeps the contrast budget.
       *
       * Without this every fill on the book renders as a wallet-to-wallet link
       * and a normally-traded coin looks like a distribution ring.
       */
      const viaMarket = a.isMarket || b.isMarket;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      // DASHED, not faint. Distinguishing the two kinds by opacity alone made
      // trade edges nearly invisible — and on a normally-traded coin every edge
      // goes through the book, so the map lost its lines altogether and looked
      // like a token nothing had ever moved. Dashing separates them by KIND
      // while both stay legible, which is the distinction being drawn.
      const w = weight(e.value);
      const ink = viaMarket ? marketInk : line;
      const alpha = (viaMarket ? 0.4 : 0.45) + (viaMarket ? 0.35 : 0.45) * w;

      /**
       * Every edge is DIRECTED — `from` sent, `to` received — and drawing it as a
       * plain segment threw that away.
       *
       * Direction is most of the information here. "These two wallets are
       * linked" is a much weaker statement than "this one funded that one", and
       * the funding direction is the entire basis for reading a cluster of
       * wallets as a single actor. On BUCKO all three edges run market → holder;
       * undirected, that is indistinguishable from holders feeding the book.
       *
       * The segment is trimmed to each circle's edge rather than run centre to
       * centre, so the head sits against the receiving bubble instead of
       * underneath it — which is also what makes the arrow readable at all when
       * the target is one of the big ones.
       */
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const gap = 2;
      const x1 = a.x + Math.cos(ang) * (a.r + gap);
      const y1 = a.y + Math.sin(ang) * (a.r + gap);
      const x2 = b.x - Math.cos(ang) * (b.r + gap);
      const y2 = b.y - Math.sin(ang) * (b.r + gap);
      // Two nodes closer together than their own radii: the trimmed segment
      // would invert and draw a backwards arrow.
      if (Math.hypot(x2 - x1, y2 - y1) < 4) continue;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.setLineDash(viaMarket ? [5, 4] : []);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = alpha;
      // A floor of 1.25px, because a sub-pixel line is antialiased into a
      // suggestion of a line — which reads as "these wallets might be connected",
      // and the whole point of drawing edges is that they definitely are.
      ctx.lineWidth = 1.25 + 3 * w;
      ctx.stroke();
      ctx.setLineDash([]);

      // The head is FILLED, not stroked — a dashed outline on a triangle this
      // small renders as three detached specks. It is also drawn at a higher
      // opacity than its line: the shaft carries magnitude, the head carries
      // direction, and direction should not fade out on a small transfer.
      const head = 5 + 3.5 * w;
      const spread = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - spread) * head, y2 - Math.sin(ang - spread) * head);
      ctx.lineTo(x2 - Math.cos(ang + spread) * head, y2 - Math.sin(ang + spread) * head);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.globalAlpha = Math.min(alpha + 0.25, 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const n of placed) {
      const ink = inkFor(n);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.globalAlpha = hover && hover.account === n.account ? 0.55 : n.isMarket ? 0.16 : 0.28;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = n.isCreator ? 2 : 1;
      ctx.strokeStyle = ink;
      ctx.stroke();
      // A second ring on the creator, so the mark survives at a radius too small
      // to carry a label — which is most of them on a coin with many holders.
      if (n.isCreator) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2);
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Labels in a SECOND pass, so they sit above every circle rather than being
    // painted over by whichever neighbour is drawn next. Only where the text
    // actually fits inside its own bubble: a label wider than its circle reads as
    // belonging to whatever it overlaps, and drawn per-node these stacked into an
    // unreadable smear on a dense graph.
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    const halo = styles.getPropertyValue("--m-surface-2").trim() || "#eee";
    for (const n of placed) {
      const role = n.isCreator ? "creator" : n.isMarket ? "market" : null;
      // A structural node is named even when it is small or its handle does not
      // fit: "which circle is the creator" is the question the map is worst at
      // answering, and a mark nobody can find is not a mark. Ordinary holders
      // keep the fits-inside-its-own-bubble rule, which is what stops a dense
      // graph turning into a smear.
      if (!role && n.r < 18) continue;
      const label = role ?? n.handle ?? short(n.account);
      if (!role && ctx.measureText(label).width > n.r * 2 - 6) continue;

      // A role label on a SMALL bubble goes underneath it, not through it. The
      // market contract is routinely a fraction of a percent of supply, so its
      // circle is a few pixels and a centred label reads as a word with a dot
      // in the middle of it.
      const outside = Boolean(role) && n.r < 16;
      const y = outside ? n.y + n.r + 11 : n.y + 3;
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(label, n.x, y);
      ctx.fillStyle = role ? inkFor(n) : text;
      ctx.fillText(label, n.x, y);

      // The creator's identity under its role, when there is room for both.
      if (role === "creator" && n.r >= 22) {
        const who = n.handle ?? short(n.account);
        ctx.strokeStyle = halo;
        ctx.strokeText(who, n.x, y + 12);
        ctx.fillStyle = text;
        ctx.fillText(who, n.x, y + 12);
      }
    }
  }, [placed, data.edges, size, hover]);

  return (
    <div className="relative w-full">
      <canvas
        ref={ref}
        className="w-full rounded-[14px] bg-[color:var(--m-surface-2)]"
        onMouseMove={(ev) => {
          const rect = ev.currentTarget.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const y = ev.clientY - rect.top;
          setHover(placed.find((p) => Math.hypot(p.x - x, p.y - y) <= p.r) ?? null);
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-[10px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-3 py-2 text-[11px] shadow-lg">
          <div className="font-dm-mono text-[color:var(--m-text-primary)]">
            {hover.handle ?? short(hover.account)}
          </div>
          {(hover.isCreator || hover.isMarket) && (
            <div
              className="mt-0.5 text-[10px]"
              style={{ color: hover.isCreator ? "var(--m-accent)" : "var(--m-text-secondary-2)" }}
            >
              {hover.isCreator
                ? "Creator — launched this coin"
                : // Named in full, because "market" alone still reads as a
                  // participant. The balance below it is escrow, not a holding.
                  "Market contract — holds tokens backing resting sell orders"}
            </div>
          )}
          <div className="mt-1 tabular-nums text-[color:var(--m-text-secondary)]">
            {compact(hover.balance)} {symbol}
            {hover.pctSupply !== null && ` · ${hover.pctSupply.toFixed(2)}% of supply`}
          </div>
          {hover.valueUSD !== null && (
            <div className="tabular-nums text-[color:var(--m-text-secondary-2)]">
              ${compact(hover.valueUSD)}
            </div>
          )}
          <div className="tabular-nums text-[color:var(--m-text-secondary-2)]">
            {hover.transferCount} transfer{hover.transferCount === 1 ? "" : "s"}
          </div>
        </div>
      )}

      {/* A legend, because three colours that mean three things and say so
          nowhere is worse than one colour that means nothing. Rendered only for
          roles actually on this map — a coin with no market drawn should not
          advertise a swatch for one. */}
      {(nodes.some((n) => n.isCreator) || nodes.some((n) => n.isMarket)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[color:var(--m-text-secondary-2)]">
          {nodes.some((n) => n.isCreator) && (
            <Swatch color="var(--m-accent)" label="Creator" />
          )}
          {nodes.some((n) => n.isMarket) && (
            <Swatch color="var(--m-text-secondary-2)" label="Market contract (escrow, not a holder)" />
          )}
          <Swatch color="var(--m-primary)" label="Holder" />
        </div>
      )}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color, opacity: 0.5, outline: `1px solid ${color}` }}
      />
      {label}
    </span>
  );
}

/**
 * Deterministic force layout: edge springs pull, every pair repels, a weak pull
 * to centre keeps the whole thing on screen.
 *
 * Radius scales with the SQUARE ROOT of balance so that AREA is proportional to
 * holding. Scaling the radius linearly is the classic bubble-chart lie — a
 * wallet with 4x the balance would draw 16x the ink.
 */
function layout(nodes: BubbleNode[], edges: BubbleEdge[], w: number, h: number): Placed[] {
  if (nodes.length === 0) return [];
  const max = Math.max(...nodes.map((n) => n.balance));
  const cx = w / 2;
  const cy = h / 2;

  // Seeded on an ELLIPSE matching the canvas aspect, not a fixed-radius circle.
  // The frame is wide and short (roughly 1100x380), so a 40-144px circle drops
  // every node into a blob in the middle and leaves two thirds of the width
  // empty — which also forced the labels on top of each other.
  const rx = w * 0.36;
  const ry = h * 0.34;

  const placed: Placed[] = nodes.map((n, i) => {
    // Seeded by index, not Math.random: the same token must lay out the same way
    // every visit, or a reader reads movement as new data.
    const angle = (i / nodes.length) * Math.PI * 2;
    const t = 0.55 + 0.45 * ((i % 5) / 4);
    return {
      ...n,
      x: cx + Math.cos(angle) * rx * t,
      y: cy + Math.sin(angle) * ry * t,
      r: 6 + 30 * Math.sqrt(n.balance / max),
    };
  });

  const byId = new Map(placed.map((p) => [p.account, p]));

  for (let step = 0; step < 140; step++) {
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const target = a.r + b.r + 26;
      const f = (d - target) * 0.012;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }

    for (let i = 0; i < placed.length; i++) {
      const a = placed[i]!;
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r + 9;
        if (d < min) {
          const push = (min - d) * 0.5;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
      // Per-axis, and much weaker on x: one isotropic pull on a wide frame
      // squeezes the graph back into a central column.
      a.x += (cx - a.x) * 0.0022;
      a.y += (cy - a.y) * 0.006;
      // Clamp inside the frame, accounting for the radius, so a bubble is never
      // half off-canvas.
      a.x = Math.min(w - a.r - 2, Math.max(a.r + 2, a.x));
      a.y = Math.min(h - a.r - 2, Math.max(a.r + 2, a.y));
    }
  }

  return placed;
}

function Frame({
  children,
  className,
  title = "Holders",
  tabs,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /** The Holders/Map switch. Absent on every empty state — there is nothing to
   *  switch between when neither view has data. */
  tabs?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // `sm:p-6`, matching the Price card and the activity panels in this same
        // column. It was `sm:p-5` — a 20px card between 24px neighbours, which
        // reads as the map being slightly misaligned rather than as a choice.
        "rounded-[20px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-4 sm:p-6",
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[color:var(--m-text-primary)]">{title}</h2>
        {tabs}
      </div>
      {children}
    </div>
  );
}

/** The pill group the Holders/Map switch sits in — same shape the activity
 *  panels use, so the two cards in this column read as one system. */
function ViewTabs({
  view,
  onView,
}: {
  view: "list" | "map";
  onView: (v: "list" | "map") => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[14px] bg-[color:var(--m-surface-2)] p-1">
      {(["list", "map"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          className={cn(
            "rounded-[11px] px-3 py-1.5 text-[13px] font-medium transition-colors",
            view === v
              ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
              : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
          )}
        >
          {v === "list" ? "Holders" : "Map"}
        </button>
      ))}
    </div>
  );
}

/**
 * The holder LIST — the same nodes the map draws, read as a table.
 *
 * It is the default view and the map is the second tab, which is the right way
 * round: "who holds this and how much" is the question nearly everyone opens
 * this card with, and a list answers it exactly. The map answers a rarer and
 * more interesting one — which wallets are connected — and it cannot be read at
 * a glance, so it is a place you go rather than the place you land.
 *
 * No new request: both views render from the same `/bubbles` payload, so
 * switching costs nothing and the two can never disagree.
 */
function HolderList({
  nodes,
  symbol,
  networkSlug,
}: {
  nodes: readonly BubbleNode[];
  symbol: string;
  networkSlug: string;
}) {
  if (nodes.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed border-[color:var(--m-border)] p-4 text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
        Nobody holds {symbol} yet.
      </p>
    );
  }
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[440px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--m-border)] text-left text-[12px] text-[color:var(--m-text-secondary)]">
            <th className="px-4 py-3 font-normal">Holder</th>
            <th className="px-3 py-3 text-right font-normal">Balance</th>
            <th className="px-3 py-3 text-right font-normal">% supply</th>
            <th className="px-4 py-3 text-right font-normal">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--m-border)]">
          {nodes.map((n) => {
            const name = n.handle ?? short(n.account);
            return (
              <tr key={n.account}>
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ProfileAvatar address={n.account} name={n.handle ?? null} size={24} className="shrink-0" />
                    <Link
                      href={`/profile/${n.account}?chain=${encodeURIComponent(networkSlug)}`}
                      className={cn(
                        "truncate hover:underline",
                        n.handle ? "font-medium" : "font-dm-mono",
                        "text-[color:var(--m-text-primary)]",
                      )}
                    >
                      {name}
                    </Link>
                    {/* The same two marks the map draws, for the same reason: a
                        99% bubble and a 99% row are equally misread without
                        them. See the canvas note on why these are not holders in
                        the sense a reader assumes. */}
                    {n.isCreator && (
                      <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--m-accent)_18%,transparent)] px-2 py-0.5 font-dm-mono text-[9px] uppercase text-[color:var(--m-accent)]">
                        creator
                      </span>
                    )}
                    {n.isMarket && (
                      <span className="shrink-0 rounded-full bg-[color:var(--m-surface-2)] px-2 py-0.5 font-dm-mono text-[9px] uppercase text-[color:var(--m-text-secondary-2)]">
                        market
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                  {compact(n.balance)}
                </td>
                <td className="px-3 py-2.5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                  {n.pctSupply === null
                    ? "—"
                    : `${formatSubscriptDecimal(n.pctSupply) ?? n.pctSupply.toFixed(2)}%`}
                </td>
                <td className="px-4 py-2.5 text-right font-dm-mono tabular-nums text-[color:var(--m-text-secondary)]">
                  {n.valueUSD === null ? "—" : `$${compact(n.valueUSD)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid h-[360px] place-items-center rounded-[14px] bg-[color:var(--m-surface-2)] px-8 text-center">
      <div>
        <div className="text-[13px] font-medium text-[color:var(--m-text-primary)]">{title}</div>
        <p className="mx-auto mt-2 max-w-[46ch] text-[11px] leading-5 text-[color:var(--m-text-secondary)]">
          {body}
        </p>
      </div>
    </div>
  );
}

function short(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}
