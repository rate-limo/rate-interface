import { buildPageUrl } from "@/lib/routing/chainParams";

/**
 * Where the transfer pages live, for callers that cannot render a `<Link>`.
 *
 * Toasts and store callbacks fire outside React's tree, so they navigate
 * imperatively. Keeping the paths here rather than at each call site means the
 * paths are written once.
 *
 * ## No `?chainId=`, and none is coming back
 *
 * These took one, and the deposit page read it as a chain to deposit on. That
 * is a claim this page does not make: the ASSET decides the network, which is
 * why `SCHEME.deposit` is chain-less in the first place. The parameter also
 * did not merely preselect — it suppressed the asset list outright, so the
 * same intent reached two different screens depending on who linked.
 *
 * A caller that knows the shortfall — the out-of-gas toast, the balance
 * watcher, the onboarding cards — says so in its own words and sends the user
 * to the one deposit page, where they pick the asset that names the chain.
 */
export function depositHref(): string {
  return buildPageUrl("deposit", {});
}

export function withdrawHref(): string {
  return buildPageUrl("withdraw", {});
}

/**
 * Navigate to a transfer page from outside React.
 *
 * A full document load, deliberately. There is no imperative router outside a
 * component in the App Router, and the alternatives — a custom event the shell
 * listens for, or a module-level router handle — are indirection in exchange
 * for a transition the user is about to leave anyway: these callers are a toast
 * action and a balance watcher, both of which mean "go somewhere else now".
 *
 * Guarded for the server, where these modules are imported but never fired.
 */
export function goToDeposit(): void {
  if (typeof window === "undefined") return;
  window.location.assign(depositHref());
}
