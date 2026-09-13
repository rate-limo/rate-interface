"use client";

import { toast } from "sonner";
import { contractErrorCopy, type ContractErrorCopy } from "./contractError";
import { goToDeposit } from "@/lib/transfer/routes";
import type { ErrorFixIntent } from "@/utils/orderErrors";

/**
 * Raise a failed write as a toast — the single place that decides how one looks, and the
 * only place that turns "here is what went wrong" into "here is the button that fixes it".
 *
 * ## Why a helper and not two lines at each call site
 *
 * It WAS two lines at each call site, repeated verbatim in the swap card, the liquidity
 * confirm flow and the portfolio's stop-order row:
 *
 *   const copy = contractErrorCopy(error, "…");
 *   toast.error(copy.title, copy.description ? { description: copy.description } : undefined);
 *
 * That shape has no slot for an action, so adding one meant editing every copy and hoping
 * none was missed — and the two order-submit toasts, which never used the presenter at all
 * and printed `error.message` raw, are exactly the ones that would have been. Presentation
 * belongs in one function so a change to it lands everywhere.
 *
 * ## A button only appears when it can actually do something
 *
 * `utils/orderErrors.ts` names the next step as an INTENT, because the table cannot know
 * which surface is showing it: the trade panel owns a price field and a market/limit
 * switch, the portfolio row owns a refetch, and the swap card owns neither. So each caller
 * passes the fixes it can honestly perform, and an intent nobody handles renders no button
 * at all. Offering "Use market price" on a surface with no price field would be a control
 * that reports an action and changes nothing — the failure this codebase keeps deleting.
 */

/** What a surface can do about a failure, wired by the surface itself. */
export type ErrorFixHandlers = Partial<Record<ErrorFixIntent, () => void>>;

/**
 * Button wording, in one place so two surfaces cannot label the same action differently.
 * Written as the thing that is about to happen, not as a description of the problem.
 */
export const FIX_LABELS: Record<ErrorFixIntent, string> = {
  "switch-to-limit": "Switch to limit",
  "use-market-price": "Use market price",
  "browse-markets": "Browse markets",
  refresh: "Refresh",
};

/**
 * Show the user where to send the gas.
 *
 * ## Why this opens a sheet rather than copying
 *
 * Copying served exactly one kind of user: someone on a desktop with a second wallet in
 * the same browser. The person most likely to hit this holds their funds in a PHONE
 * wallet, and nothing on this screen can paste into that — they need to scan. So the
 * action opens `/deposit`, which carries a QR code, the address in full, and a copy
 * button; the desktop path is one tap deeper and the mobile path exists at all.
 *
 * ## It takes only the chain
 *
 * The sheet resolves the address itself with `useAccount`. Reading it here meant importing
 * `@/lib/providers`, which runs `createConfig` on import — and that broke
 * `ActivityTabs.stops.test.tsx`, because a module whose job is wording must not drag the
 * wallet stack into whatever mounts it. `goToDeposit` is a plain navigation with no
 * dependencies of its own.
 */
export function toastContractError(
  error: unknown,
  fallback: string,
  options: {
    /** Lets a gas shortfall name the chain's own asset — ETH on RISE, USDC on Arc. */
    chainId?: number;
    /** The subset of `ErrorFixIntent` this surface can perform. */
    fixes?: ErrorFixHandlers;
    duration?: number;
  } = {},
): ContractErrorCopy {
  const copy = contractErrorCopy(error, fallback, { chainId: options.chainId });

  // A gas shortfall carries its own action and always has one; every other failure
  // offers a fix only if this surface can perform it. The two never co-occur — no local
  // state change resolves an empty account.
  const topUp = copy.action;
  const handler = copy.fix ? options.fixes?.[copy.fix] : undefined;

  const action = topUp
    ? topUp.kind === "faucet"
      ? {
          label: topUp.label,
          // `noopener` is not optional on a target=_blank to a third-party origin: without
          // it the opened page gets a handle on this one through `window.opener`.
          onClick: () => window.open(topUp.href, "_blank", "noopener,noreferrer"),
        }
      : { label: topUp.label, onClick: () => goToDeposit() }
    : handler && copy.fix
      ? { label: FIX_LABELS[copy.fix], onClick: handler }
      : undefined;

  toast.error(copy.title, {
    ...(copy.description ? { description: copy.description } : {}),
    ...(action ? { action } : {}),
    // A toast carrying a button has to outlive the user reading it and deciding — the
    // default lifetime is tuned for "that did not work". Funding takes longest of all,
    // because it means leaving for an exchange or another wallet.
    duration: options.duration ?? (topUp ? 12_000 : action ? 8_000 : undefined),
  });

  return copy;
}
