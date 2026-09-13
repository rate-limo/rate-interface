"use client";

/**
 * Publishing a "callout" (thesis) about a token — the compose control that
 * feeds `admin.theses` (09ee1c8) and, from there, the chart's avatar marks
 * (e71804b). Desktop only: `MobileProfilePage`/`TabletProfilePage` are not
 * mounted anywhere (`page.tsx` renders `DesktopOnly` below `lg`), so this
 * lives solely in `ProfileDesktopPage`.
 *
 * Styling deliberately matches the LEGACY classes this page already uses
 * around the chart (`bg-neutral-dark-600`, `border-neutral-light-white-12`,
 * `text-white`, `text-gray-500`, `bg-primary-300`/`text-primary-default`)
 * rather than introducing Monet `--m-*` tokens here — this section of the
 * page hasn't migrated, and a lone Monet card floating in an otherwise
 * legacy-styled page is a worse inconsistency than not migrating yet.
 *
 * ## The control is disabled, never hidden
 *
 * Same convention as `Edit profile` and the graduation button
 * (components/Portfolio/Creator.tsx): a trader with no qualifying trade sees
 * WHY, not a missing feature. A qualifying trade needs a $500+ fill in
 * THIS token — but that number is enforced by the server alone
 * (`checkThesisEligibility`, apps/admin-service/src/theses.ts), reading its
 * own `spotTrades` row. This control only explains the rule; it never grants
 * access on its own reading of a trade, and if the server refuses a trade
 * this control DID offer, that refusal is shown verbatim rather than
 * silently swallowed.
 *
 * ## The mark won't appear until the chart refetches
 *
 * `TokenProfileChart`/`TradingViewChart` don't expose a way to force the
 * TradingView widget to re-pull `getMarks` from here, and reaching into the
 * vendored widget for one is out of scope for this control. So a successful
 * post says plainly that the mark will show up once the chart's own marks
 * request runs again, rather than implying it appears immediately.
 */

import { useMemo, useState } from "react";
import { useSignMessage } from "wagmi";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { useTokenTrades } from "@/hooks/useTokenTrades";
import {
  qualifies,
  selectThesisCandidates,
  THESIS_DISPLAY_MIN_USD,
  type ThesisTradeCandidate,
} from "@/lib/thesis/candidates";
import { postThesis } from "@/lib/thesis/postThesis";
import { networkNameToSlug } from "@/consts";
import { cn } from "@/lib/utils";

// Mirrors THESIS_BODY_MIN_LENGTH / THESIS_BODY_MAX_LENGTH in
// apps/admin-service/src/theses.ts. The server re-validates independently —
// this only bounds the textarea and drives the remaining-character count.
const BODY_MIN_LENGTH = 1;
const BODY_MAX_LENGTH = 500;

type State =
  | { k: "idle" }
  | { k: "posting" }
  | { k: "done" }
  | { k: "error"; message: string };

function candidateKey(c: Pick<ThesisTradeCandidate, "pair" | "tradeId">): string {
  return `${c.pair}:${c.tradeId}`;
}

function formatTradeLabel(c: ThesisTradeCandidate): string {
  const side = c.isBid ? "Bought" : "Sold";
  const value = c.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${side} ${c.baseSymbol || "token"} · $${value}`;
}

export function ThesisComposer({
  tokenAddress,
  tokenSymbol,
  networkName,
  className,
}: {
  tokenAddress: string;
  tokenSymbol: string;
  networkName: string;
  /** Spacing from the caller — the two pages that mount this sit it differently. */
  className?: string;
}) {
  const { address, isConnected, isLoading: walletLoading } = useWalletAccount();
  const { open } = useWalletConnect();
  const { signMessageAsync } = useSignMessage();
  const { data: rawTrades, isLoading: tradesLoading } = useTokenTrades(networkName, address);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [state, setState] = useState<State>({ k: "idle" });

  const candidates = useMemo(() => {
    if (!rawTrades) return [];
    return selectThesisCandidates(rawTrades, tokenAddress).filter(qualifies);
  }, [rawTrades, tokenAddress]);

  const selected = candidates.find((c) => candidateKey(c) === selectedKey) ?? candidates[0] ?? null;

  const trimmed = body.trim();
  const bodyTooShort = trimmed.length < BODY_MIN_LENGTH;
  const bodyTooLong = trimmed.length > BODY_MAX_LENGTH;
  const remaining = BODY_MAX_LENGTH - body.length;

  const canSubmit = !!address && !!selected && !bodyTooShort && !bodyTooLong && state.k !== "posting";

  const run = async () => {
    if (!address || !selected) return;
    setState({ k: "posting" });
    const outcome = await postThesis(
      {
        // The trade's own chain, so the call reaches the admin-service whose
        // `broker.spotTrades` actually holds it — that read is the whole
        // authorization, and against another chain it refuses every real thesis.
        chainSlug: networkNameToSlug[networkName] ?? "",
        tokenAddress,
        pair: selected.pair,
        tradeId: selected.tradeId,
        body: trimmed,
        address,
      },
      signMessageAsync,
    );
    if (outcome.ok) {
      setState({ k: "done" });
      setBody("");
      return;
    }
    // A declined signature returns to idle rather than to an error: nothing
    // was attempted, so presenting it as a failure would misreport what
    // happened.
    setState(outcome.declined ? { k: "idle" } : { k: "error", message: outcome.message });
  };

  const shell = (children: React.ReactNode) => (
    // `mt-4` is the default the legacy profile page relies on; a caller that
    // places this itself passes its own spacing.
    <div data-testid="callout-composer" className={cn("bg-neutral-dark-600 border-neutral-light-white-12 mt-4 rounded-[16px] border p-4 text-white", className)}>
      <h3 className="mb-2 text-sm font-bold">Post a callout</h3>
      {children}
    </div>
  );

  if (walletLoading) {
    return shell(<div className="h-16 w-full animate-pulse rounded bg-white/5" />);
  }

  if (!isConnected) {
    return shell(
      <div>
        <p className="mb-3 text-sm text-gray-500">
          Connect your wallet to publish a call on {tokenSymbol || "this token"}. A $
          {THESIS_DISPLAY_MIN_USD.toLocaleString()}+ trade in it is required — signing proves
          which trade, it costs nothing and sends no transaction.
        </p>
        <button
          type="button"
          onClick={open}
          className="rounded-md border border-neutral-light-white-12 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-primary-300"
        >
          Connect wallet
        </button>
      </div>,
    );
  }

  if (tradesLoading) {
    return shell(<div className="h-16 w-full animate-pulse rounded bg-white/5" />);
  }

  if (state.k === "done") {
    return shell(
      <div role="status">
        <p className="m-0 text-sm text-primary-default">
          Posted. It will appear on the chart the next time it refreshes its marks — this control
          doesn't force that itself.
        </p>
        <button
          type="button"
          onClick={() => setState({ k: "idle" })}
          className="mt-3 rounded-md border border-neutral-light-white-12 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-primary-300 hover:text-white"
        >
          Post another
        </button>
      </div>,
    );
  }

  if (candidates.length === 0) {
    // Disabled, never hidden — same call as `Edit profile` and the
    // graduation button. The reason names the rule the server itself
    // enforces (checkThesisEligibility); this text is explanatory, not the
    // gate.
    return shell(
      <div>
        <p className="m-0 text-sm text-gray-500">
          You need a trade of ${THESIS_DISPLAY_MIN_USD.toLocaleString()} or more in{" "}
          {tokenSymbol || "this token"} to post a callout.
        </p>
        <textarea
          disabled
          placeholder="What's your thesis?"
          className="mt-3 w-full cursor-not-allowed rounded-md border border-neutral-light-white-12 bg-transparent p-2 text-sm text-gray-500 opacity-60"
          rows={3}
        />
        <button
          type="button"
          disabled
          title={`You need a trade of $${THESIS_DISPLAY_MIN_USD.toLocaleString()} or more in ${
            tokenSymbol || "this token"
          } to post a callout.`}
          className="mt-3 cursor-not-allowed rounded-md bg-primary-300 px-4 py-2 text-sm font-medium text-black opacity-50"
        >
          Post callout
        </button>
      </div>,
    );
  }

  return shell(
    <div>
      <label className="mb-1 block text-xs text-gray-500" htmlFor="thesis-trade">
        Which trade is this about?
      </label>
      <select
        id="thesis-trade"
        value={selected ? candidateKey(selected) : ""}
        onChange={(e) => setSelectedKey(e.target.value)}
        className="border-neutral-light-white-12 mb-3 w-full rounded-md border bg-neutral-dark-500 p-2 text-sm text-white"
      >
        {candidates.map((c) => (
          <option key={candidateKey(c)} value={candidateKey(c)}>
            {formatTradeLabel(c)}
          </option>
        ))}
      </select>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX_LENGTH))}
        maxLength={BODY_MAX_LENGTH}
        placeholder="What's your thesis?"
        rows={3}
        className="border-neutral-light-white-12 w-full rounded-md border bg-transparent p-2 text-sm text-white placeholder:text-gray-500"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <span>{bodyTooShort ? "Thesis can't be empty." : " "}</span>
        <span className={cn(remaining < 0 && "text-red-500")}>{remaining} left</span>
      </div>

      {state.k === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {state.message}
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={!canSubmit}
        className={cn(
          "mt-3 rounded-md px-4 py-2 text-sm font-medium text-black transition-opacity",
          canSubmit ? "bg-primary-300" : "cursor-not-allowed bg-primary-300 opacity-50",
        )}
      >
        {state.k === "posting" ? "Waiting for your signature…" : "Post callout"}
      </button>
    </div>,
  );
}
