"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MESSAGE_MAX, type SupportThreadView } from "@iter/types";
import { useConsent } from "@/lib/consent/store";
import {
  browserStorage,
  clearSession,
  readSession,
  writeSession,
  type SupportSession,
} from "@/lib/support/store";

/**
 * Support — a launcher in the bottom-right corner and the chat panel it opens.
 *
 * Mounted once, in `components/Shell/AppShell` — so it rides the app pages and
 * not the landing or legal pages, which render no shell. It is `fixed`, so a
 * second mount would not move it; it would draw a second launcher over the
 * first.
 *
 * Two states, and which one you get depends on whether this browser already
 * has a thread:
 *
 *  - **No thread** — a short form: email, then what went wrong. No account, no
 *    wallet, no captcha. Someone whose problem is that they cannot connect a
 *    wallet must not be asked to connect one to say so.
 *  - **A thread** — the conversation, and a box to add to it.
 *
 * ## Sharing the bottom-right corner
 *
 * The cookie banner is already there (`components/Legal/CookieConsent`, moved
 * there in 7769acf) and it is `fixed`, full-width under 1200px, and waits
 * indefinitely for an answer. Two floating elements silently overlapping is
 * the obvious first bug, so the launcher **measures the banner** and sits
 * above it, rather than hard-coding an offset that a copy change would break.
 *
 * Hiding the launcher until consent is answered was the simpler option and is
 * wrong: the banner is explicitly designed so that ignoring it leaves a
 * working site, and support that disappears for anyone who ignores it is not
 * support.
 *
 * ## Nothing is fetched until the panel is opened
 *
 * The thread loads on open and after each send. No polling, no socket — an
 * operator reply arrives when the visitor next looks, which is what the
 * feature promises and all it promises.
 */

/** Gap between the launcher and whatever is under it. */
const STACK_GAP = 12;
/** Bottom offset with nothing below: clears the mobile tab bar / status bar,
 * matching the banner's own two-breakpoint reasoning. */
const BASE_BOTTOM_MOBILE = 76;
const BASE_BOTTOM_DESKTOP = 52;
/** Height of the launcher the panel sits above. */
const LAUNCHER_CLEARANCE = 60;
/** Breathing room between the panel's top edge and the top of the viewport. */
const VIEWPORT_MARGIN = 16;

type Mode = "form" | "thread";

/**
 * The support control, for the app footer.
 *
 * It used to be a `fixed` pill in the bottom-right, floating over every page as
 * a second, separate control. It now sits in the footer — the bottom of the app
 * shell — beside the copyright and the legal links, as icon + label. The panel
 * still opens where a panel belongs; only the trigger moved.
 */
export function SupportButton({
  open,
  onClick,
  className,
  compact = false,
}: {
  open: boolean;
  onClick: () => void;
  className?: string;
  /** Icon-only visual treatment for compact shell controls; keeps the label accessible. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={open ? "Close support" : "Support"}
      className={className}
    >
      {open ? <CloseIcon /> : <ChatIcon />}
      <span className={compact ? "sr-only" : undefined}>Support</span>
    </button>
  );
}

export function SupportWidget({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [session, setSession] = useState<SupportSession | null>(null);
  const [ready, setReady] = useState(false);
  /** False when storage refused the write — the thread exists on the server but
   * this browser cannot find its way back to it. `writeSession` returns that
   * signal precisely so it can be said out loud rather than discovered on the
   * next reload, when the conversation is simply gone. */
  const [persisted, setPersisted] = useState(true);
  const bottom = useLauncherBottom();

  // The stored session can only be read after mount — the server cannot know
  // it, so rendering from it on the first pass would mismatch. Same rule the
  // consent banner and the OG Pass countdown follow.
  useEffect(() => {
    setSession(readSession(browserStorage()));
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <>
      {open && (
        <SupportPanel
          session={session}
          bottom={bottom}
          persisted={persisted}
          onSession={(s) => {
            setPersisted(writeSession(browserStorage(), s));
            setSession(s);
          }}
          onForget={() => {
            clearSession(browserStorage());
            setSession(null);
            setPersisted(true);
          }}
          onClose={onClose}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Bottom offset for the launcher, raised to clear the consent banner while it
 * is up.
 *
 * Measured rather than assumed: the banner's height depends on its copy and on
 * whether the buttons wrap, so any constant here would be wrong the first time
 * someone edits that text. `useConsent` tells us when it is on screen at all,
 * which is what stops this observing a node that will never exist.
 */
function useLauncherBottom(): number {
  const { record, ready } = useConsent();
  const bannerShown = ready && record === null;
  const [extra, setExtra] = useState(0);
  const [base, setBase] = useState(BASE_BOTTOM_MOBILE);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1200px)");
    const sync = () => setBase(query.matches ? BASE_BOTTOM_DESKTOP : BASE_BOTTOM_MOBILE);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!bannerShown) {
      setExtra(0);
      return;
    }

    let sizeObserver: ResizeObserver | null = null;

    // Both components read the same `useConsent`, so `bannerShown` can flip in
    // a commit where CookieConsent has not yet put its node in the DOM. The
    // first version gave up when the query missed, which left the launcher
    // sitting on top of the banner with no second chance. Watch for it instead:
    // whether it is already there or arrives a tick later, the same code runs.
    const attach = (banner: HTMLElement) => {
      const measure = () => setExtra(banner.offsetHeight + STACK_GAP);
      measure();
      sizeObserver = new ResizeObserver(measure);
      sizeObserver.observe(banner);
    };

    const find = () => document.querySelector<HTMLElement>("[data-consent-banner]");

    const existing = find();
    if (existing) {
      attach(existing);
      return () => sizeObserver?.disconnect();
    }

    const treeObserver = new MutationObserver(() => {
      const banner = find();
      if (!banner) return;
      treeObserver.disconnect();
      attach(banner);
    });
    treeObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      treeObserver.disconnect();
      sizeObserver?.disconnect();
    };
  }, [bannerShown]);

  return base + extra;
}

/* -------------------------------------------------------------------------- */

function SupportPanel({
  session,
  bottom,
  persisted,
  onSession,
  onForget,
  onClose,
}: {
  session: SupportSession | null;
  bottom: number;
  persisted: boolean;
  onSession: (s: SupportSession) => void;
  onForget: () => void;
  onClose: () => void;
}) {
  const mode: Mode = session ? "thread" : "form";
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes. Not a focus trap and not a scroll lock: this is an aside on
  // a working page, the same call the consent banner makes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Support"
      /* The height cap has to know where the panel starts. With the consent
         banner up, `bottom` is already ~210px, and a fixed 70vh cap pushed the
         header — and its close button — off the top of a short viewport. */
      style={{ bottom: bottom + LAUNCHER_CLEARANCE, maxHeight: `calc(100dvh - ${bottom + LAUNCHER_CLEARANCE + VIEWPORT_MARGIN}px)` }}
      className="fixed inset-x-2.5 z-[60] flex max-h-[560px] flex-col overflow-hidden rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-2xl min-[1200px]:inset-x-auto min-[1200px]:right-3 min-[1200px]:w-[380px]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--m-border)] px-4 py-3">
        <div>
          <p className="text-[14px] font-semibold text-[color:var(--m-text-primary)]">Support</p>
          <p className="text-[12px] text-[color:var(--m-text-secondary)]">
            {mode === "form"
              ? "We usually reply within a day."
              : `Ticket ${session?.reference}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support"
          className="rounded-lg p-1.5 text-[color:var(--m-text-secondary)] hover:bg-[color:var(--m-surface-2)] hover:text-[color:var(--m-text-primary)]"
        >
          <CloseIcon />
        </button>
      </header>

      {mode === "form" ? (
        <NewTicketForm onOpened={onSession} />
      ) : (
        <Thread session={session!} persisted={persisted} onForget={onForget} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NewTicketForm({ onOpened }: { onOpened: (s: SupportSession) => void }) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, message, pagePath: pathname }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server writes these to be read by a person; showing its sentence
        // beats replacing it with a generic one that says less.
        setError(body?.error ?? "Something went wrong. Try again in a moment.");
        return;
      }
      onOpened({ token: body.ticket.token, reference: body.ticket.reference });
    } catch {
      setError("Couldn't reach us just now — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 overflow-y-auto p-4">
      <p className="text-[13px] leading-snug text-[color:var(--m-text-secondary)]">
        Tell us what happened and we&apos;ll reply by email and here.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-[color:var(--m-text-secondary)]">
          Your email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[14px] text-[color:var(--m-text-primary)] outline-none focus:border-[color:var(--m-primary)]"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-[color:var(--m-text-secondary)]">
          What&apos;s going on?
        </span>
        <textarea
          required
          rows={4}
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="A swap failed, a balance looks wrong, anything at all."
          className="resize-none rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[14px] text-[color:var(--m-text-primary)] outline-none focus:border-[color:var(--m-primary)]"
        />
      </label>

      {error && <p className="text-[13px] text-[color:var(--m-danger,#e5484d)]">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)] disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send message"}
      </button>

      <p className="text-[11px] leading-snug text-[color:var(--m-text-secondary)]">
        We store your email and this conversation so we can answer it. Nothing else.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Thread({
  session,
  persisted,
  onForget,
}: {
  session: SupportSession;
  persisted: boolean;
  onForget: () => void;
}) {
  const [thread, setThread] = useState<SupportThreadView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the server says the thread is full. The error tells the visitor
   * to open a new ticket, so the button to do it has to be right there —
   * otherwise the only instruction we give them is one the UI refuses. */
  const [exhausted, setExhausted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/support/thread", {
        headers: { "x-support-token": session.token },
      });
      if (res.status === 404) {
        setState("gone");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const body = await res.json();
      setThread(body.thread);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [session.token]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll the list itself. `scrollIntoView` walks up to every scrollable
  // ancestor including the document, so on a long page it can yank the whole
  // page around behind a fixed panel.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [thread?.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/thread", {
        method: "POST",
        headers: { "content-type": "application/json", "x-support-token": session.token },
        body: JSON.stringify({ message: reply }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setExhausted(true);
        setError(body?.error ?? "Couldn't send that. Try again.");
        return;
      }
      setThread(body.thread);
      setReply("");
    } catch {
      setError("Couldn't reach us just now — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (state === "loading") {
    return <p className="p-4 text-[13px] text-[color:var(--m-text-secondary)]">Loading…</p>;
  }

  if (state === "gone") {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-[color:var(--m-text-secondary)]">
          We couldn&apos;t find that conversation any more.
        </p>
        <button
          type="button"
          onClick={onForget}
          className="self-start rounded-xl border border-[color:var(--m-border)] px-3 py-2 text-[13px] font-semibold text-[color:var(--m-text-primary)]"
        >
          Start a new one
        </button>
      </div>
    );
  }

  if (state === "error" || !thread) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-[color:var(--m-text-secondary)]">
          Couldn&apos;t load your messages.
        </p>
        <button
          type="button"
          onClick={load}
          className="self-start rounded-xl border border-[color:var(--m-border)] px-3 py-2 text-[13px] font-semibold text-[color:var(--m-text-primary)]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={
              m.author === "user"
                ? "max-w-[85%] self-end rounded-2xl rounded-br-md bg-[color:var(--m-primary)] px-3 py-2 text-[13.5px] text-white"
                : "max-w-[85%] self-start rounded-2xl rounded-bl-md bg-[color:var(--m-surface-2)] px-3 py-2 text-[13.5px] text-[color:var(--m-text-primary)]"
            }
          >
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ))}

        {thread.status === "open" && (
          <p className="self-center text-[11px] text-[color:var(--m-text-secondary)]">
            We&apos;ve got this — we&apos;ll reply to {thread.email}.
          </p>
        )}

      </div>

      <form
        onSubmit={send}
        className="flex flex-col gap-2 border-t border-[color:var(--m-border)] p-3"
      >
        {!persisted && (
          <p className="text-[12px] text-[color:var(--m-text-secondary)]">
            Your browser wouldn&apos;t save this conversation, so it will be gone when you leave
            the page. Quote ticket {session.reference} if you need to reach us again.
          </p>
        )}
        {error && <p className="text-[12px] text-[color:var(--m-danger,#e5484d)]">{error}</p>}
        {exhausted && (
          <button
            type="button"
            onClick={onForget}
            className="self-start rounded-xl border border-[color:var(--m-border)] px-3 py-2 text-[13px] font-semibold text-[color:var(--m-text-primary)]"
          >
            Start a new ticket
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            maxLength={MESSAGE_MAX}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            className="max-h-24 flex-1 resize-none rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[14px] text-[color:var(--m-text-primary)] outline-none focus:border-[color:var(--m-primary)]"
          />
          <button
            type="submit"
            disabled={sending || exhausted || !reply.trim()}
            className="rounded-xl bg-[color:var(--m-primary)] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)] disabled:opacity-50"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
