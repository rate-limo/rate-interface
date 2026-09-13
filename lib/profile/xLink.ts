"use client";

/**
 * Starting the X link handshake.
 *
 * Goes to admin-service through the same-origin rewrite in `next.config.ts`,
 * like `/usd-balance` and `/graduate` — NOT to the gateway. The consumer secret
 * lives there and must never reach this app, and admin-service is where the
 * nonce-then-sign machinery already is.
 *
 * ## Three steps, and why the wallet signs before X is ever opened
 *
 * The OAuth callback arrives from X with an `oauth_token` and nothing about a
 * wallet. So the wallet is proved FIRST and parked against the request token
 * server-side; without that, anyone could complete an X consent and have it
 * attach to somebody else's address.
 *
 *   1. `POST /x/nonce` — the server returns the exact message to sign.
 *   2. the wallet signs it.
 *   3. `POST /x/start` — the signature is verified and X issues a request
 *      token; we get back the URL to send the browser to.
 *
 * ## A popup, and why this stopped being a full navigation
 *
 * This flow used to navigate the whole page to X. That was written when the
 * only wallets were extensions, which survive a page load; the embedded passkey
 * account does not. Its key lives ONLY in memory (`lib/wallet/meraConnector.ts`
 * documents why), so unloading the page ends the session — a user linking X
 * came back to `?x=linked` signed out, with the modal closed and no sign the
 * link had worked at all.
 *
 * The old comment justified the navigation by saying a popup would be blocked,
 * because the wallet signature puts an `await` between the click and the
 * `window.open`. That is true of opening the popup LATE. It is not a constraint
 * on popups as such: the blocker cares about the user gesture, so a window
 * opened synchronously inside the click handler is allowed, and may be pointed
 * at its real URL afterwards. Hence `openXLinkWindow` — called first, navigated
 * once `startXLink` resolves.
 *
 * The opener never unloads, so the wallet stays connected and the modal is
 * still mounted to report the result.
 */

export interface StartXLinkResult {
  authorizeUrl: string;
}

/** Where the popup lands, and what it posts back. Shared with the page that
 * does the posting so the two halves cannot drift apart. */
export const X_LINK_RETURN_PATH = "/x/complete";
export const X_LINK_MESSAGE = "iter:x-link";

export type XLinkOutcome = { ok: true } | { ok: false; reason: string | null };

/**
 * A window opened for the X handshake.
 *
 * `blocked` when the browser refused it — the caller falls back to the old full
 * navigation rather than leaving a button that does nothing. Losing the wallet
 * session is bad; a dead button is worse.
 */
export interface XLinkWindow {
  readonly blocked: boolean;
  navigate: (url: string) => void;
  close: () => void;
  /**
   * Has the user closed it?
   *
   * The caller needs this because the handshake's ONLY success signal is a
   * `message` from the popup, and there are several ordinary ways to never get
   * one: the user closes the window, dismisses X's consent screen, or the popup
   * ends up on an origin the opener does not share so `postMessage` is refused.
   * Without a way to notice, the button sits disabled on "Opening X…" for the
   * life of the modal and the only escape is closing it.
   *
   * True for a blocked popup as well, which never opened and so is trivially
   * not open — though that path navigates the tab and never polls.
   */
  readonly closed: boolean;
}

/**
 * MUST be called synchronously from the click handler — that is the entire
 * point. Opening it after `await` is what the blocker stops.
 */
export function openXLinkWindow(): XLinkWindow {
  const width = 600;
  const height = 720;
  // Centred on the CURRENT screen rather than at 0,0, which on a multi-monitor
  // setup opens the consent dialog on a different display from the app.
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  const popup = window.open(
    "",
    "iter-x-link",
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  );

  if (!popup) return { blocked: true, navigate: () => {}, close: () => {}, closed: true };

  // Something to look at while the wallet prompts for a signature. Without it
  // the popup sits blank-white for as long as the user takes to approve, which
  // reads as a broken window and invites them to close it.
  //
  // Built as nodes rather than `document.write`: nothing here is dynamic, so
  // either is safe, but a literal-HTML write in a file that also handles OAuth
  // is the kind of thing a reader has to stop and check.
  const doc = popup.document;
  doc.title = "Connecting to X…";
  doc.body.setAttribute(
    "style",
    "margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui;background:#111;color:#eee",
  );
  const splash = doc.createElement("p");
  splash.textContent = "Connecting to X…";
  doc.body.appendChild(splash);

  return {
    blocked: false,
    navigate: (url: string) => {
      popup.location.href = url;
    },
    close: () => popup.close(),
    // A getter, not a snapshot: the caller polls this, and a boolean captured
    // at construction would be false forever.
    get closed() {
      return popup.closed;
    },
  };
}

/**
 * Sanitise the `?to=` the completion page sends the user back to.
 *
 * Same boundary as `safeReturnUrl` in apps/identity-service, and the same
 * reasoning — deliberately NOT `startsWith("/") && !startsWith("//")`, which
 * that service's own comment records as insufficient: the URL spec folds `\` to
 * `/`, and control characters are stripped during parsing rather than rejected,
 * so `/\evil.example` and `/\tevil.example` both pass that test and then resolve
 * to another host.
 *
 * Parsing and comparing the resolved origin uses the same rule the browser will,
 * so a trick that changes where the value resolves also changes what is
 * compared. This one is on the RETURN leg of a redirect chain that passes
 * through X, which is exactly where a link is worth forging.
 */
export function safeReturnPath(raw: string | null, fallback = "/portfolio"): string {
  if (!raw) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, window.location.origin);
  } catch {
    return fallback;
  }
  if (url.origin !== window.location.origin) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Read a message from the popup, or null if it isn't ours.
 *
 * Checks `origin` against this app's own before trusting anything: `message`
 * events arrive from ANY window that has a handle on this one, so an unchecked
 * listener lets a third-party frame claim the link succeeded and drive the UI
 * into a signed-in-looking state. The payload is only ever an outcome, never
 * profile data — the profile is re-fetched from the server, which is the only
 * party that knows what was actually written.
 */
export function parseXLinkMessage(event: MessageEvent): XLinkOutcome | null {
  if (event.origin !== window.location.origin) return null;
  const data = event.data as { type?: unknown; ok?: unknown; reason?: unknown } | null;
  if (!data || data.type !== X_LINK_MESSAGE) return null;
  if (data.ok === true) return { ok: true };
  return { ok: false, reason: typeof data.reason === "string" ? data.reason : null };
}

/** A rejected signature is a decision, not an error. Same helper shape as
 * `lib/profile/follow.ts` and `lib/portfolio/profile.ts`. */
export function isSignatureRejection(err: unknown): boolean {
  return err instanceof Error && /reject|denied|cancel/i.test(err.message);
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body?.error as string | undefined) ?? `Request failed (${res.status})`;
}

export async function startXLink({
  address,
  returnTo,
  signMessageAsync,
}: {
  address: string;
  /** Where the callback should send the browser. Must be a relative path — the
   * server refuses anything else, since the value reaches a `Location:`
   * header. */
  returnTo: string;
  signMessageAsync: (args: { message: string }) => Promise<string>;
}): Promise<StartXLinkResult> {
  const nonceRes = await fetch("/x/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
    cache: "no-store",
  });
  if (!nonceRes.ok) throw new Error(await readError(nonceRes));
  const { nonce, message } = (await nonceRes.json()) as { nonce: string; message: string };

  const signature = await signMessageAsync({ message });

  // The address is NOT resent: the server rebuilds the signed message from the
  // nonce record, which is what binds the signature to the wallet being linked.
  const startRes = await fetch("/x/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, signature, returnTo }),
    cache: "no-store",
  });
  if (!startRes.ok) throw new Error(await readError(startRes));
  return (await startRes.json()) as StartXLinkResult;
}

/** Human text for the `?reason=` the callback sends back. Kept beside the
 * starter so the two halves of one flow stay together. */
export function xFailureMessage(reason: string | null): string {
  switch (reason) {
    case "denied":
      return "X sign-in was cancelled.";
    case "expired":
      return "That link attempt expired. Try again.";
    case "not-configured":
      return "X linking isn't configured on this deployment.";
    case "exchange-failed":
      return "X didn't complete the sign-in. Try again.";
    case "save-failed":
      return "Couldn't save the link. Try again.";
    default:
      return "Couldn't link your X account.";
  }
}
