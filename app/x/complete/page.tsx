"use client";

/**
 * Where the X callback drops the popup.
 *
 * The identity service finishes the handshake and redirects here with
 * `?x=linked` or `?x=failed&reason=…` (see `apps/identity-service/src/xLink.ts`
 * — `returnUrl` builds exactly those two shapes). This page's whole job is to
 * hand that outcome to the window that opened it and get out of the way.
 *
 * ## Why a page of its own, rather than returning to the profile
 *
 * `returnTo` used to be the caller's own path, from the days when the handshake
 * navigated the whole tab. Sending a POPUP there would load the entire app a
 * second time — providers, wallet connectors, a second WebSocket — inside a
 * 600px window the user never looks at, purely to read one query parameter.
 *
 * It also has to survive the fallback. When the browser blocks the popup the
 * caller navigates the tab instead, and then this page IS the user's window:
 * `?to=` carries where they came from so they land back there rather than
 * stranded on a blank confirmation.
 *
 * Deliberately outside `[locale]`: it renders no copy a user reads long enough
 * to translate, and the return URL is built by a service that knows nothing
 * about this app's locale segment.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeReturnPath, X_LINK_MESSAGE } from "@/lib/profile/xLink";

/**
 * `useSearchParams` opts a route into client-side rendering, and Next fails the
 * PRODUCTION build — not dev — on any component that calls it outside a Suspense
 * boundary. Splitting the boundary out here is what keeps that a build-time
 * concern rather than a deploy-time one.
 */
export default function XCompletePage() {
  return (
    <Suspense fallback={<Finishing />}>
      <Complete />
    </Suspense>
  );
}

function Finishing() {
  return (
    <main className="grid min-h-screen place-items-center bg-[color:var(--m-surface)] p-6 text-center">
      <p className="text-sm text-[color:var(--m-text-secondary)]">
        Finishing up — you can close this window.
      </p>
    </main>
  );
}

function Complete() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const ok = params.get("x") === "linked";
    const reason = params.get("reason");

    // `window.opener` is null in the fallback path — the tab navigated, so there
    // is no one to tell. Carry the outcome back to the page the user started on
    // and let the modal read it there.
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) {
      // `safeReturnPath` is the open-redirect boundary — see its note on why a
      // `startsWith("/")` test is not one. This value rides back through a
      // redirect chain that passes through X.
      const safe = safeReturnPath(params.get("to"));
      const joiner = safe.includes("?") ? "&" : "?";
      const back = ok
        ? `${safe}${joiner}x=linked`
        : `${safe}${joiner}x=failed${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`;
      router.replace(back);
      return;
    }

    // Targeted at this exact origin, not "*": the message says whether an
    // account link succeeded, and a wildcard target posts that to whatever
    // happens to be hosting the opener.
    opener.postMessage(
      { type: X_LINK_MESSAGE, ok, reason },
      window.location.origin,
    );
    window.close();
  }, [params, router]);

  return <Finishing />;
}
