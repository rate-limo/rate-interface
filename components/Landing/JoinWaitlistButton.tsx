import { clsx } from "clsx";

/**
 * The landing page's CTA. It is a LINK to the waitlist, and nothing else.
 *
 * It used to run the whole join flow inline — connect a wallet, POST
 * `/api/waitlist/wallet`, then fetch and display the wallet's referral code as
 * a copyable invite link. That was a test of the mechanism, and it is gone.
 * The waitlist owns the flow now, in the order it actually happens (X sign-in,
 * then wallet), with the standing, the referrals and the board around it. Two
 * implementations of one flow is how one of them quietly stops matching the
 * rules the other enforces.
 *
 * ## Why the href is absolute
 *
 * Since 2026-08-06 the waitlist is a separate app on `waitlist.iter.cx`, so
 * this is a cross-origin destination and `next/link` cannot route to it —
 * it renders a plain anchor and the browser does a full navigation, which is
 * what we want.
 *
 * `next.config.ts` does redirect `/waitlist` to the same place, so a relative
 * href would still work. It is spelled out anyway because this is the site's
 * primary CTA and sending it through an extra round trip to reach a host we
 * already know is a cost paid by every visitor who clicks it.
 *
 * ## No `dynamic`, no `ssr: false`
 *
 * The previous version lazy-loaded a client chunk so the wallet SDK stayed out
 * of the landing bundle. A link needs no wallet, so both the chunk and the
 * loading placeholder are unnecessary — and `ssr: false` would leave the
 * primary landing CTA out of the server-rendered HTML for no gain.
 */

type JoinWaitlistButtonProps = {
  className?: string;
  variant?: "solid" | "outline";
};

export function JoinWaitlistButton({ className, variant = "solid" }: JoinWaitlistButtonProps) {
  return (
    <a
      href="https://waitlist.iter.cx/"
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-6 py-3 font-mono-brand text-xs font-medium tracking-[0.14em] uppercase transition-colors duration-200",
        variant === "solid" && "bg-purple-400 text-on-primary hover:bg-purple-500",
        variant === "outline" &&
          "border border-dark-grey-2 text-white hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300",
        className,
      )}
    >
      Join the waitlist
    </a>
  );
}
