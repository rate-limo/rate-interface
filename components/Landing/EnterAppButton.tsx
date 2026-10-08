import Link from "next/link";
import { clsx } from "clsx";

/**
 * The landing page's CTA. It opens the app, and nothing else.
 *
 * ## It used to be the waitlist, and that is the whole change
 *
 * This was `JoinWaitlistButton`, an anchor to `waitlist.iter.cx`. Before that
 * it ran the join flow inline — connect a wallet, POST `/api/waitlist/wallet`,
 * then render the wallet's referral code as a copyable invite. Both are gone:
 * the venue is live, so asking a visitor to queue for it is asking them to wait
 * for something they can already use.
 *
 * The waitlist app itself is untouched and `next.config.ts` still redirects
 * `/waitlist` to it, so any link already in the wild keeps working. What
 * changed is that the landing page no longer sends anyone there.
 *
 * ## `next/link`, not an anchor
 *
 * The destination is same-origin now. The waitlist was on its own host, which
 * is why that version was a plain `<a>` — `next/link` cannot route
 * cross-origin. `/home` is this app, so the link prefetches and navigates
 * client-side, and the site's primary CTA stops costing a full page load.
 *
 * ## Why `/home` and not `/trade` or `/explore`
 *
 * `/home` is the app's social surface — the river of callouts with the
 * leaderboard beside it — and its own docstring calls it "the logged-in
 * counterpart" to this page. It is the one destination that reads as arriving
 * rather than as being dropped into a tool: a visitor who has just read the
 * pitch has no market in mind yet, and `/trade` opens a card asking them to
 * pick one. Every other surface is one click from the shell they land in.
 */

type EnterAppButtonProps = {
  className?: string;
  variant?: "solid" | "outline";
};

export function EnterAppButton({ className, variant = "solid" }: EnterAppButtonProps) {
  return (
    <Link
      href="/home"
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-6 py-3 font-mono-brand text-xs font-medium tracking-[0.14em] uppercase transition-colors duration-200",
        variant === "solid" && "bg-purple-400 text-on-primary hover:bg-purple-500",
        variant === "outline" &&
          "border border-dark-grey-2 text-white hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300",
        className,
      )}
    >
      Enter Rate
    </Link>
  );
}
