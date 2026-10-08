"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";

/* ─── One wheel, five seats ───────────────────────────────────────────────────
   Five side-by-side wheels would say "five loops, five engines", which is the
   opposite of the argument: every seat is paid out of the same fill. Swapping
   the labels on ONE ring makes the shared axle the thing you actually see — and
   it costs a fifth as much on a page that already carries the market tape.

   Colour is semantic, not per-seat: success for the two seats inside the engine
   loop, accent for the pass, primary for the treasury side. Three meanings, not
   five arbitrary hues.

   ── Why the tone is a RAMP STEP per theme, not one value ────────────────────

   These used to be `var(--m-success)` / `--m-accent` / `--m-primary` applied
   directly, to both the drawing and the text. Those values are picked to read
   on a DARK ground, and against the light theme's #F3F4F6 they collapsed:

     as text (chip label, hub label)   success 2.64  accent 1.53  primary 2.11
     as graphics (ring, arrows, dot)   same values — floor is 3:1

   Accent at 1.53:1 is a pale yellow on near-white. Every one failed, and the
   comment that used to sit here claimed the opposite — that all three "flip
   with the theme, so this section needs no dark: variants". They do not flip;
   only the neutrals do.

   So each tone is now a pair of Tailwind classes off the ramps, which DO carry
   a dark: variant. Text takes the -700 step in light, graphics take -600 (a
   lower floor, and holding the hue matters more on the drawing). Dark mode
   keeps the base tone, which was already fine there — 6.26 to 8.44.

   Measured after: text 5.70–7.38 on the tinted chip, graphics 3.93–5.54.

   `text-white` still needs no variant — --color-white maps to
   --m-text-primary, which is one of the neutrals that does flip. */

/** Text floor is 4.5:1, graphics 3:1 — hence two steps per tone. */
const TONES = {
  success: {
    ink: "text-green-700 dark:text-green-400",
    graphic: "text-green-600 dark:text-green-400",
    chip: "border-green-600 bg-green-400/15 text-green-700 dark:border-green-400 dark:text-green-400",
  },
  accent: {
    ink: "text-orange-700 dark:text-orange-400",
    graphic: "text-orange-600 dark:text-orange-400",
    chip: "border-orange-600 bg-orange-400/15 text-orange-700 dark:border-orange-400 dark:text-orange-400",
  },
  primary: {
    ink: "text-purple-700 dark:text-purple-400",
    graphic: "text-purple-600 dark:text-purple-400",
    chip: "border-purple-600 bg-purple-400/15 text-purple-700 dark:border-purple-400 dark:text-purple-400",
  },
} as const;

type Seat = {
  key: string;
  chip: string;
  hub: string;
  tone: keyof typeof TONES;
  /** Four steps, clockwise from the top. Each is 1–3 short lines. */
  steps: readonly (readonly string[])[];
  give: string;
  get: string;
  note: string;
};

const SEATS: readonly Seat[] = [
  {
    key: "trader",
    chip: "Trader",
    hub: "TRADER",
    tone: "success",
    steps: [["You trade"], ["You get", "$RATE"], ["You trade", "more"], ["The book", "deepens"]],
    give: "One taker fee per fill — the same rate on the order book and in the pool, so there is no cheaper door.",
    get: "$RATE rewards on what you trade, and tighter spreads as the fee you paid funds the depth sitting in front of you.",
    note: "The fee is charged once, on the quote side, and it is the only thing you pay.",
  },
  {
    key: "lp",
    chip: "LP",
    hub: "LP",
    tone: "success",
    steps: [["You provide", "liquidity"], ["Flow", "arrives"], ["You earn", "your share"], ["You quote", "tighter"]],
    give: "Inventory, and the risk of holding it while the market moves against you.",
    get: "A fixed share of every fill you make — no discount or tier can reach it — plus priority that grows the longer you stay.",
    note: "Your basis points are an absolute number, not a slice of whatever is left after discounts.",
  },
  {
    key: "pass",
    chip: "Pass holder",
    hub: "PASS",
    tone: "accent",
    steps: [["You buy", "$RATE"], ["You mint", "the pass"], ["$RATE is", "locked"], ["Your fee drops,", "rewards rise"]],
    give: "$RATE bought on the open market and locked for the term of the pass. There is no other route to the lower rate.",
    get: "A reduced fee and a higher reward multiplier, held in a capped and transferable pass.",
    note: "Supply is capped, so the pass has a market price rather than being handed out.",
  },
  {
    key: "holder",
    chip: "$RATE holder",
    hub: "$RATE",
    tone: "primary",
    steps: [
      ["Fees collected", "with $RATE reward"],
      ["The router buys", "back $RATE", "and burns it"],
      ["$RATE supply", "decreases"],
      ["The exchange", "grows"],
    ],
    give: "Nothing locked, nothing to vote on.",
    get: "The protocol's share is routed into buybacks that burn $RATE, so every fee the exchange earns takes supply out of circulation.",
    note: "How much goes to buybacks versus buying depth is set by a published ratio, not by discretion.",
  },
  {
    key: "listing",
    /*
     * "Asset creator", not "Listing projects" — the same rename
     * Onboarding/WelcomeFlow made, with the same reasoning: /launch deploys a
     * coin that did not exist and opens a market for it. A project is the thing
     * around an asset (a team, a treasury, a roadmap), and "listing" one
     * implies applying to a venue that reviews you. Neither is what this seat
     * does. The two lists have to agree — someone meets this seat here and then
     * picks it again during onboarding.
     *
     * The second step said "You seed the depth with $RATE", which is the
     * fiction the launch spec deleted an entire step for: `launch()` places no
     * orders and opens no position. Listing creates a market, not liquidity.
     * `give` said the same thing and is corrected with it.
     */
    chip: "Asset creator",
    hub: "CREATOR",
    tone: "primary",
    steps: [["You deploy", "the coin"], ["Its market", "opens"], ["Volume", "arrives"], ["A bounty", "is paid"]],
    give: "A coin that did not exist, and the market nobody was making for it.",
    get: "A bounty from the growth allocation, settled on the volume your market actually did — not on what it was projected to do.",
    note: "This is the one entry point that doesn't need the volume to already exist.",
  },
] as const;

/* Geometry is arithmetic on one radius — ring, the four label points and the
   dot's track are all derived, so nothing needs measuring and there is no
   ResizeObserver (same approach as ProtocolFlywheel). */
const VIEW_W = 420;
const VIEW_H = 356;
const CX = 210;
const CY = 174;
const R = 112;
const HUB = 54;
const ANGLES = [-90, 0, 90, 180] as const;
/* Angular half-width of the longest step line (~18 chars at r=112) is close to
   29°, so a smaller gap tucks an arrow head under the text. */
const GAP = 33;
const DOT_PERIOD_S = 13;
const AUTO_ADVANCE_MS = 6000;

const rad = (deg: number) => (deg * Math.PI) / 180;
const px = (deg: number) => CX + R * Math.cos(rad(deg));
const py = (deg: number) => CY + R * Math.sin(rad(deg));

/* Two semicircles, never one self-closing arc. An `A r r 0 1 1` that ends a
   hair from where it began leaves the centre underdetermined, and the point
   sampled by getPointAtLength drifts visibly off the ring that is drawn. */
const TRACK = [
  `M ${CX} ${CY - R}`,
  `A ${R} ${R} 0 0 1 ${CX} ${CY + R}`,
  `A ${R} ${R} 0 0 1 ${CX} ${CY - R}`,
].join(" ");

const ARCS = ANGLES.map((angle, i) => {
  const from = angle + GAP;
  const to = ANGLES[(i + 1) % ANGLES.length] - GAP + (i === ANGLES.length - 1 ? 360 : 0);
  return `M ${px(from).toFixed(1)} ${py(from).toFixed(1)} A ${R} ${R} 0 0 1 ${px(to).toFixed(1)} ${py(to).toFixed(1)}`;
});

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function ParticipantFlywheel() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  const sectionRef = useRef<HTMLElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const trackRef = useRef<SVGPathElement | null>(null);

  const seat = SEATS[active];

  const select = useCallback((index: number) => {
    setTouched(true);
    setActive(index);
  }, []);

  /* Only run the loop while the section is on screen — the page carries a live
     market tape and charts, and this is decoration by comparison. */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Motion is driven by rAF rather than <animateMotion>: SMIL is awkward to
     drive from React state, and the dot only needs two attributes per frame. */
  useEffect(() => {
    if (reduced || !visible) return;
    const dot = dotRef.current;
    const track = trackRef.current;
    if (!dot || !track) return;

    const length = track.getTotalLength();
    let start: number | null = null;
    let frame = 0;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = (((timestamp - start) / 1000 / DOT_PERIOD_S) % 1) * length;
      const point = track.getPointAtLength(progress);
      dot.setAttribute("cx", point.x.toFixed(2));
      dot.setAttribute("cy", point.y.toFixed(2));
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, visible]);

  /* Auto-advance is a demonstration, not a carousel: it stops for good the
     moment someone picks a seat themselves. */
  useEffect(() => {
    if (reduced || touched || !visible) return;
    const id = window.setInterval(
      () => setActive((index) => (index + 1) % SEATS.length),
      AUTO_ADVANCE_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, touched, visible]);

  return (
    <section
      ref={sectionRef}
      className="border-t border-white/5 py-24 md:py-32"
      aria-labelledby="participant-flywheel-heading"
    >
      <Container>
        <Reveal>
          <h2
            id="participant-flywheel-heading"
            className="font-display max-w-2xl text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            Whichever seat you take, it&rsquo;s the same wheel to earn.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            Every payout on Rate traces back to one event: someone got filled.
            Nothing here is funded by issuing tokens against a promise. Pick a
            seat and follow it round.
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-10 flex flex-wrap gap-3" role="tablist" aria-label="Protocol participants">
            {SEATS.map((option, index) => {
              const selected = index === active;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => select(index)}
                  /* Tinted rather than filled: a solid fill needs an ink that
                     contrasts with the tone in BOTH modes, and the base tones
                     are display tints with no legible partner. The tint stays
                     at the base step (it is a background, so its own contrast
                     does not matter) while the label takes the -700 step in
                     light — that pairing measures 5.70–7.38:1, against 1.53–2.64
                     when the label was the base tone. */
                  className={clsx(
                    "font-mono-brand rounded-full border px-5 py-2.5 text-xs tracking-[0.12em] uppercase transition-colors",
                    selected
                      ? clsx("font-semibold", TONES[option.tone].chip)
                      : "border-dark-grey-2 text-dark-grey-1 hover:border-purple-400 hover:text-white",
                  )}
                >
                  {option.chip}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-14">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block h-auto w-full"
              role="img"
              aria-label={`${seat.chip} loop: ${seat.steps
                .map((lines) => lines.join(" "))
                .join(", then ")}, and back to the start.`}
            >
              <defs>
                <marker
                  id="participant-flywheel-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
                </marker>
                <path ref={trackRef} id="participant-flywheel-track" d={TRACK} />
              </defs>

              <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--m-border)" strokeWidth={1.4} />

              {/* Graphics, so the floor is 3:1 and the -600 step holds the hue
                  better than the -700 the labels need. currentColor is what
                  lets a Tailwind class reach an SVG stroke. */}
              <g className={TONES[seat.tone].graphic}>
                {ARCS.map((d) => (
                  <path
                    key={d}
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    markerEnd="url(#participant-flywheel-arrow)"
                  />
                ))}
              </g>

              <circle cx={CX} cy={CY} r={HUB} fill="var(--m-background)" stroke="var(--m-border)" strokeWidth={1.4} />
              <text
                x={CX}
                y={CY + 2}
                textAnchor="middle"
                className={clsx("font-mono-brand", TONES[seat.tone].ink)}
                fill="currentColor"
                style={{ fontSize: 11, letterSpacing: "0.16em" }}
              >
                {seat.hub}
              </text>
              <text
                x={CX}
                y={CY + 20}
                textAnchor="middle"
                className="font-mono-brand"
                style={{ fill: "var(--m-text-secondary)", fontSize: 8.5, letterSpacing: "0.12em" }}
              >
                YOUR SEAT
              </text>

              {ANGLES.map((angle, i) => {
                const lines = seat.steps[i];
                const x = px(angle);
                const top = py(angle) - (lines.length - 1) * 7 + 4;
                return (
                  <text
                    key={`${seat.key}-${angle}`}
                    x={x.toFixed(1)}
                    y={top.toFixed(1)}
                    textAnchor="middle"
                    style={{ fill: "var(--m-text-primary)", fontSize: 12.5, fontWeight: 600 }}
                  >
                    {lines.map((line, li) => (
                      <tspan key={line} x={x.toFixed(1)} dy={li === 0 ? 0 : 14}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              })}

              {!reduced && (
                <circle
                  ref={dotRef}
                  cx={CX}
                  cy={CY - R}
                  r={5}
                  className={TONES[seat.tone].graphic}
                  fill="currentColor"
                />
              )}
            </svg>

            <dl className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <dt className="font-mono-brand text-xs tracking-[0.14em] text-dark-grey-1 uppercase">
                  You give
                </dt>
                <dd className="max-w-md text-base leading-relaxed text-white">{seat.give}</dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="font-mono-brand text-xs tracking-[0.14em] text-dark-grey-1 uppercase">
                  You get
                </dt>
                <dd className="max-w-md text-base leading-relaxed text-white">{seat.get}</dd>
              </div>
              <p className="border-t border-dark-grey-3 pt-5 text-sm leading-relaxed text-dark-grey-1">
                {seat.note}
              </p>
            </dl>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
