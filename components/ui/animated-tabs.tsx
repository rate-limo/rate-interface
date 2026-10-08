"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, animate, motion, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls, Variants } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type RefObject,
} from "react";
import { motionTokens } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

/**
 * Tabs with a highlight that glides between triggers and panels that slide in
 * the direction you moved. Adapted from uiarc.dev/components/tabs onto the
 * Monet tokens; Radix supplies the roles and keyboard model.
 *
 * - `variant="underline"`: a 2px bar under the active label (terminal tab rows).
 * - `variant="pill"`: a filled segment behind it (segmented controls).
 * - `morphHeight`: the incoming panel grows/shrinks from the outgoing one's
 *   height. Off for panels that FILL their container — their height is the
 *   container's, and animating it would fight the flex layout.
 */
type Variant = "underline" | "pill";

const TabsContext = createContext<{
  active: string;
  variant: Variant;
  direction: number;
  morphHeight: boolean;
  panelHeightRef: RefObject<number | null>;
}>({ active: "", variant: "underline", direction: 1, morphHeight: true, panelHeightRef: { current: null } });

type RootProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & { variant?: Variant; morphHeight?: boolean };

export function Tabs({ value, defaultValue, onValueChange, className, variant = "underline", morphHeight = true, ...props }: RootProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [direction, setDirection] = useState(1);
  const active = value ?? internal;
  const root = useRef<HTMLDivElement>(null);
  const panelHeightRef = useRef<number | null>(null);

  function handleChange(next: string) {
    // Order from THIS instance's triggers only, so a nested tab set can't skew it.
    const frame = root.current;
    const order = frame
      ? Array.from(frame.querySelectorAll<HTMLElement>('[role="tab"][data-value]'))
          .filter((tab) => tab.closest("[data-animated-tabs]") === frame)
          .map((tab) => tab.dataset.value)
      : [];
    const from = order.indexOf(active);
    const to = order.indexOf(next);
    if (from >= 0 && to >= 0 && from !== to) setDirection(to > from ? 1 : -1);
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  }

  return (
    <TabsContext.Provider value={{ active, variant, direction, morphHeight, panelHeightRef }}>
      <LayoutGroup id={useId()}>
        <TabsPrimitive.Root
          {...props}
          ref={root}
          data-animated-tabs=""
          className={cn("flex min-h-0 flex-col", className)}
          value={active}
          onValueChange={handleChange}
        />
      </LayoutGroup>
    </TabsContext.Provider>
  );
}

const EDGE = 34;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  const { active, variant } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });

  const update = useCallback(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    if (!frame || !scroll) return;
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const next = {
      overflow: scroll.scrollWidth > frame.clientWidth + 1,
      left: scroll.scrollLeft > 1,
      right: scroll.scrollLeft < max - 1,
    };
    setEdges((prev) => (prev.overflow === next.overflow && prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  // Keep the active tab in view, clear of the scroll arrows.
  const reveal = useCallback(
    (tab: HTMLElement | null) => {
      const scroll = viewport.current;
      if (!scroll || !tab) return;
      const frame = scroll.getBoundingClientRect();
      const item = tab.getBoundingClientRect();
      const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      const left = frame.left + (scroll.scrollLeft > 1 ? EDGE : 0);
      const right = frame.right - (scroll.scrollLeft < max - 1 ? EDGE : 0);
      const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
      if (delta) scroll.scrollBy({ left: delta, behavior: reduced ? "instant" : "smooth" });
    },
    [reduced],
  );

  useLayoutEffect(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    const content = list.current;
    if (!frame || !scroll || !content) return;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(scroll);
    observer.observe(content);
    scroll.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", update);
    };
  }, [update]);

  useLayoutEffect(() => {
    reveal(list.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? null);
  }, [active, reveal]);

  const scrollTabs = (dir: number) =>
    viewport.current?.scrollBy({ left: dir * (viewport.current?.clientWidth ?? 0) * 0.75, behavior: reduced ? "instant" : "smooth" });

  const arrow =
    "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)] disabled:opacity-0 disabled:pointer-events-none";

  return (
    <div ref={shell} className="relative shrink-0">
      {edges.overflow && (
        <button
          type="button"
          aria-label="Scroll tabs left"
          disabled={!edges.left}
          onClick={() => scrollTabs(-1)}
          className={cn(arrow, "left-0 bg-[linear-gradient(to_right,var(--m-background)_60%,transparent)]")}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}
      <motion.div
        ref={viewport}
        layoutScroll
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab") reveal(event.target);
        }}
      >
        <TabsPrimitive.List
          {...props}
          ref={list}
          className={cn(
            "relative flex w-max min-w-full",
            variant === "pill" && "rounded-[6px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-[3px]",
            className,
          )}
        />
      </motion.div>
      {edges.overflow && (
        <button
          type="button"
          aria-label="Scroll tabs right"
          disabled={!edges.right}
          onClick={() => scrollTabs(1)}
          className={cn(arrow, "right-0 bg-[linear-gradient(to_left,var(--m-background)_60%,transparent)]")}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function TabsTrigger({
  className,
  children,
  value,
  indicatorClassName,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { indicatorClassName?: string }) {
  const { active, variant } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const selected = active === value;
  return (
    <TabsPrimitive.Trigger
      {...props}
      value={value}
      data-value={value}
      className={cn(
        "relative whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[color:var(--m-primary)] focus-visible:ring-inset",
        selected ? "text-[color:var(--m-text-primary)]" : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
        variant === "pill" && "flex-1 rounded-[4px]",
        className,
      )}
    >
      {selected && (
        // The LayoutGroup in Tabs scopes this to one instance: it glides
        // between this set's triggers, never in from another tab set.
        <motion.span
          layoutId="tab-selection"
          layoutDependency={active}
          aria-hidden
          transition={reduced ? { duration: 0 } : motionTokens.spring.morph}
          className={cn(
            "pointer-events-none absolute",
            variant === "underline"
              ? "inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--m-primary)]"
              : "inset-0 rounded-[4px] bg-[color:var(--m-surface)] shadow-[0_1px_2px_rgba(0,0,0,.18)]",
            indicatorClassName,
          )}
        />
      )}
      <span className="relative">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

const panelMotion: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 10 }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] },
      x: motionTokens.spring.smooth,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -8,
    transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] },
  }),
};

/** Reduced motion: a short crossfade in place. Same keys, so server and client render the same styles. */
const panelFade: Variants = {
  enter: { opacity: 0, x: 0 },
  center: { opacity: 1, x: 0, transition: { duration: motionTokens.duration.instant } },
  exit: { opacity: 0, x: 0, transition: { duration: 0.1 } },
};

export function TabsContent({ className, value, children, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  const { active, direction, morphHeight, panelHeightRef } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const selected = active === value;

  // The incoming panel starts at the outgoing panel's height and settles at its
  // own, so whatever sits below glides instead of jumping.
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node || !selected || !morphHeight) return;
    const from = panelHeightRef.current;
    const to = node.offsetHeight;
    let controls: AnimationPlaybackControls | undefined;
    const release = () => {
      node.style.height = "";
      node.style.overflow = "";
    };
    if (from !== null && Math.abs(from - to) > 1 && !reduced) {
      if (to > from) node.style.overflow = "clip";
      controls = animate(node, { height: [from, to] }, { ...motionTokens.spring.smooth, onComplete: release });
    }
    panelHeightRef.current = to;
    const observer = new ResizeObserver(() => {
      if (!controls) panelHeightRef.current = node.offsetHeight;
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      controls?.stop();
      release();
    };
  }, [selected, reduced, morphHeight, panelHeightRef]);

  return (
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      {selected && (
        <TabsPrimitive.Content {...props} key={value} value={value} forceMount asChild>
          <motion.div
            ref={panel}
            className={cn("outline-none", className)}
            custom={direction}
            variants={reduced ? panelFade : panelMotion}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {children}
          </motion.div>
        </TabsPrimitive.Content>
      )}
    </AnimatePresence>
  );
}
