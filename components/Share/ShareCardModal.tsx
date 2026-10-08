"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Copy, Download, Link2, X as CloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { xIntentUrl } from "@/lib/profile/share";

/**
 * A share sheet for anything with a link and a 1200×630 card — a profile, a
 * referral link. Extracted from the profile's sheet so the second one did not
 * become a second copy of the clipboard, Safari and Firefox handling below.
 *
 * `build` receives the page origin, which is only known after mount, and
 * returns the canonical link and the card that link's OG tags point at.
 *
 * ## Why a modal and not `navigator.share`
 *
 * The token page shares through the native sheet, which is right there: the thing
 * being shared is a link, and the OS knows the user's apps better than we do. A
 * profile card is different — the interesting artifact is the IMAGE, and the
 * native sheet cannot preview it, cannot post it to X with the text we want, and
 * on desktop Chrome frequently is not implemented at all. So this is explicit:
 * see the card, then choose what to do with it.
 *
 * ## The preview is the real card
 *
 * `profileShareCardUrl` is the same `/api/og/profile` route `generateMetadata`
 * hands to crawlers, so what is on screen is what an unfurl will show. A mock-up
 * would be able to look right while the real card was broken — which is exactly
 * the failure that shipped once already, when the avatar rendered as a
 * root-relative path Satori had no origin to resolve.
 *
 * ## Three actions, because they do different things
 *
 *   * **Post on X** opens the intent. X renders the card by unfurling the LINK's
 *     OG tags — an intent url cannot carry an image — so this needs the deploy to
 *     be reachable and shows the card only for a public origin.
 *   * **Copy image** is the only way to put the picture itself anywhere: a reply,
 *     a Discord message, a deck. It is not a duplicate of the above.
 *   * **Copy link** is the fallback that always works, including when the
 *     clipboard refuses images (Firefox writes no `image/png`).
 */
export function ShareCardModal({
  open,
  onOpenChange,
  title,
  label,
  text,
  build,
  downloadName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's heading, e.g. "Share profile". */
  title: string;
  /** The line under the heading naming what is shared. */
  label: string;
  /** The post text for the X intent. */
  text: string;
  build: (origin: string) => { shareUrl: string; cardUrl: string };
  /** File name for "Download image". */
  downloadName: string;
}) {
  // `window` is read in an effect, never during render: this component is inside
  // a server-rendered tree, and reading the origin while rendering would produce
  // a hydration mismatch. Same rule the consent banner and the OG Pass countdown
  // follow. Empty until mounted, which is why the actions are disabled below.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const [copied, setCopied] = useState<"image" | "link" | null>(null);
  const [imageState, setImageState] = useState<"loading" | "ready" | "failed">("loading");
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const { shareUrl, cardUrl } = origin ? build(origin) : { shareUrl: "", cardUrl: "" };

  // A reopened sheet must not still be showing the previous visit's "Copied".
  useEffect(() => {
    if (!open) return;
    setCopied(null);
    setNote(null);
    setImageState("loading");
  }, [open]);

  const flash = (which: "image" | "link") => {
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1800);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("link");
    } catch {
      setNote("Clipboard blocked — select the link above to copy it.");
    }
  };

  const copyImage = async () => {
    if (busy.current || !cardUrl) return;
    busy.current = true;
    setNote(null);
    try {
      // Safari only honours a clipboard write inside the click that triggered it,
      // and awaiting the fetch first spends that gesture. Passing the Promise to
      // ClipboardItem is the documented way round it and is what Chrome supports
      // too, so the promise form is the primary path rather than a special case.
      const blob = fetch(cardUrl).then((r) => {
        if (!r.ok) throw new Error(`card ${r.status}`);
        return r.blob();
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("image");
    } catch {
      // Firefox implements navigator.clipboard.write without image support, and
      // a page served over plain http has no clipboard at all. Neither is worth
      // an error dialog when the link still copies and the card still downloads.
      setNote("This browser will not copy images — use Download instead.");
    } finally {
      busy.current = false;
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Close className="absolute -top-14 right-0 flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-deep)] text-[color:var(--m-text-primary)] transition-colors hover:bg-[color:var(--m-surface)]">
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <div className="overflow-hidden rounded-[16px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] shadow-xl">
            <div className="border-b border-[color:var(--m-border)] px-5 py-4">
              <DialogPrimitive.Title className="text-[15px] font-bold text-[color:var(--m-text-primary)]">
                {title}
              </DialogPrimitive.Title>
              <p className="mt-0.5 truncate text-[12.5px] text-[color:var(--m-text-secondary)]">{label}</p>
            </div>

            <div className="px-5 pt-5">
              {/* 1200×630 is the card's real aspect; reserving it up front means the
                  dialog does not jump when the image lands. */}
              <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-[12px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]">
                {cardUrl && imageState !== "failed" && (
                  // eslint-disable-next-line @next/next/no-img-element -- generated per request, never optimizable
                  <img
                    src={cardUrl}
                    alt={`${title} card preview`}
                    className={cn(
                      "h-full w-full object-cover transition-opacity",
                      imageState === "ready" ? "opacity-100" : "opacity-0",
                    )}
                    onLoad={() => setImageState("ready")}
                    onError={() => setImageState("failed")}
                  />
                )}
                {imageState === "loading" && (
                  <div className="absolute inset-0 animate-pulse bg-[color:var(--m-surface-2)]" />
                )}
                {imageState === "failed" && (
                  // Named, not blank: the card generates per request and a failure
                  // here is the same failure a crawler would hit, which is worth
                  // seeing rather than hiding behind an empty frame.
                  <div className="absolute inset-0 grid place-items-center px-6 text-center text-[12.5px] text-[color:var(--m-text-secondary)]">
                    The preview card could not be generated. The link below still works.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 px-5 py-5">
              <a
                href={origin ? xIntentUrl(text, shareUrl) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!origin}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[11px] border border-[color:var(--m-primary)] bg-[color:var(--m-primary)] px-4 py-2.5 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90",
                  !origin && "pointer-events-none opacity-55",
                )}
              >
                <XMark className="h-3.5 w-3.5" />
                Post on X
              </a>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copyImage}
                  disabled={!origin || imageState === "failed"}
                  className={actionClass}
                >
                  {copied === "image" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === "image" ? "Copied" : "Copy image"}
                </button>

                <button type="button" onClick={copyLink} disabled={!origin} className={actionClass}>
                  {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
              </div>

              {/* Always offered, not only after a clipboard failure: saving the card
                  is a legitimate first choice, and a control that appears only once
                  something has gone wrong is one nobody discovers. */}
              <a
                href={cardUrl || undefined}
                download={downloadName}
                aria-disabled={!cardUrl}
                className={cn(actionClass, !cardUrl && "pointer-events-none opacity-55")}
              >
                <Download className="h-3.5 w-3.5" />
                Download image
              </a>

              {note && (
                <p className="pt-0.5 text-center text-[12px] text-[color:var(--m-text-secondary)]">{note}</p>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-[11px] border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-2.5 text-[13px] font-bold text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-primary)] hover:text-[color:var(--m-primary)] disabled:cursor-not-allowed disabled:opacity-55";

/** lucide has no current X mark, so the glyph is inline rather than a stale bird. */
function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
