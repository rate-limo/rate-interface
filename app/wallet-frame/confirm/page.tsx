"use client";

/**
 * The visible confirm frame: a button the wallet origin draws.
 *
 * Embedded by `components/Wallet/WalletConfirmFrame` in place of an ordinary
 * confirm button. The app tells it what to sign (`present`); it decodes the
 * request ITSELF, prints what it is about to do, and signs only when a person
 * clicks here. The app's own description of the request is not consulted —
 * the app is the origin this control exists to distrust.
 *
 * ## Same-origin storage with the hidden frame
 *
 * Both frames live on the wallet origin, so the session the hidden frame
 * resumes is the one this button signs with. No key crosses between them.
 *
 * ## Token facts are looked up, not taken from the app
 *
 * An ERC-20 amount needs decimals and a symbol to read as a number. Those are
 * read from the token contract over the chain's public RPC; until they arrive
 * the line says base units, which is honest if ugly. A token can lie about
 * its own symbol, but that is the token's claim and is what every explorer
 * shows too.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { wagmiChains } from "@/lib/customChains";
import { appOrigins, isAllowedAppOrigin } from "@/lib/wallet/frame/origins";
import { describe, describeLines, type TokenMeta } from "@/lib/wallet/frame/policy";
import {
  ERR,
  event,
  isPresentParams,
  isRequestEnvelope,
  respond,
  toFrameError,
  type PresentParams,
} from "@/lib/wallet/frame/protocol";
import { executeSigned } from "@/lib/wallet/frame/signer";

const BUTTON: Record<PresentParams["variant"], string> = {
  sheet:
    "w-full rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
  modal:
    "h-12 w-full rounded-2xl bg-[color:var(--m-primary)] text-sm font-medium text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
};

function tokensIn(rpc: PresentParams["rpc"]): Address[] {
  if (!rpc) return [];
  const d = describe(rpc);
  const calls = d.kind === "transaction" ? [d.call] : d.kind === "batch" ? d.calls : [];
  const out = new Set<Address>();
  for (const c of calls) {
    if (c.kind === "erc20-transfer" || c.kind === "erc20-approve") out.add(c.token);
  }
  return [...out];
}

export default function WalletConfirmPage() {
  const [present, setPresent] = useState<PresentParams | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenMeta>>({});
  const root = useRef<HTMLDivElement>(null);

  /*
   * Embedded only. Opened directly there is no parent to talk to.
   *
   * Decided AFTER mount, never during render: the server has no window, so a
   * render-time check said "not embedded" in the HTML and "embedded" on the
   * client, and every confirm frame hydrated into a mismatch. Null until then
   * renders nothing, which no one sees: the app keeps this iframe transparent
   * behind its own disabled button until `ready`, posted from an effect below.
   */
  const [embedded, setEmbedded] = useState<boolean | null>(null);
  useEffect(() => setEmbedded(window.parent !== window), []);

  // Theme from the query, applied the way next-themes does it: a class on <html>.
  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get("theme");
    document.documentElement.classList.toggle("dark", theme !== "light");
  }, []);

  // The protocol: answer `present` from the one allowed origin, announce ready.
  // The origin that embedded us, learned from its first valid message and
  // replied to from then on. Several origins may be allowed; only one asked.
  const asker = useRef<string | null>(null);

  useEffect(() => {
    if (!embedded) return;
    const parent = window.parent;
    const onMessage = (e: MessageEvent) => {
      if (!isAllowedAppOrigin(e.origin) || e.source !== parent) return;
      if (!isRequestEnvelope(e.data) || e.data.method !== "present") return;
      asker.current = e.origin;
      if (!isPresentParams(e.data.params)) {
        parent.postMessage(
          { ...respond(e.data.id, undefined), error: { code: ERR.INVALID_PARAMS, message: "present needs chainId, rpc, label, disabled, variant" } },
          e.origin,
        );
        return;
      }
      setPresent(e.data.params);
      setProblem(null);
      parent.postMessage(respond(e.data.id, { ok: true }), e.origin);
    };
    window.addEventListener("message", onMessage);
    for (const origin of appOrigins()) parent.postMessage(event({ event: "ready" }), origin);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded]);

  // Report our height so the app's placeholder never clips the summary line.
  useEffect(() => {
    if (!embedded || !root.current) return;
    const report = () => {
      const height = root.current?.getBoundingClientRect().height ?? 0;
      for (const origin of asker.current ? [asker.current] : appOrigins()) {
        window.parent.postMessage(event({ event: "size", height }), origin);
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [embedded, present]);

  // Best-effort token facts for the summary line.
  useEffect(() => {
    if (!present?.rpc) return;
    const chain = wagmiChains.find((c) => c.id === present.chainId);
    if (!chain) return;
    const wanted = tokensIn(present.rpc).filter((t) => !tokens[t.toLowerCase()]);
    if (wanted.length === 0) return;
    const client = createPublicClient({ chain, transport: http() });
    let cancelled = false;
    void Promise.all(
      wanted.map(async (token) => {
        try {
          const [symbol, decimals] = await Promise.all([
            client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
            client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
          ]);
          return [token.toLowerCase(), { symbol, decimals }] as const;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setTokens((prev) => {
        const next = { ...prev };
        for (const row of rows) if (row) next[row[0]] = row[1];
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // `tokens` is deliberately not a dependency: it is what this effect fills.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  const confirm = useCallback(async () => {
    if (!present?.rpc || busy) return;
    setBusy(true);
    setProblem(null);
    const allowed = asker.current ?? appOrigins()[0] ?? window.location.origin;
    try {
      const hash = await executeSigned(present.chainId, present.rpc);
      window.parent.postMessage(event({ event: "submitted", hash }), allowed);
    } catch (err) {
      const error = toFrameError(err);
      setProblem(
        error.code === ERR.LOCKED
          ? "Your passkey session has expired. Sign in again to continue."
          : error.code === ERR.USER_REJECTED
            ? null
            : error.message,
      );
      window.parent.postMessage(event({ event: "failed", error }), allowed);
    } finally {
      setBusy(false);
    }
  }, [present, busy]);

  if (embedded === null) return null;
  if (!embedded) {
    return (
      <p className="p-4 text-sm text-[color:var(--m-text-secondary)]">
        This page is part of the Rate wallet. It runs inside the app and has nothing to show on its own.
      </p>
    );
  }

  const variant = present?.variant ?? "sheet";
  const lines = present?.rpc ? describeLines(present.chainId, describe(present.rpc), tokens) : [];

  return (
    <div ref={root} className="flex flex-col gap-1.5">
      {lines.length > 0 && (
        <ul className="flex flex-col gap-0.5 px-0.5">
          {lines.map((line) => (
            <li key={line} className="font-dm-mono text-[11px] leading-4 text-[color:var(--m-text-secondary)]">
              {line}
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="px-0.5 text-[11.5px] leading-4 text-[color:var(--m-error-fg)]">{problem}</p>}
      <button
        type="button"
        disabled={!present || present.disabled || !present.rpc || busy}
        onClick={() => void confirm()}
        className={BUTTON[variant]}
      >
        {busy ? `${present?.label ?? "Confirm"}…` : (present?.label ?? "Confirm")}
      </button>
    </div>
  );
}
