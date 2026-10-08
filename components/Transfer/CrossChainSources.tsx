"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EIP1193Provider } from "viem";
import type { TransferRoute } from "@iter/types";
import { chainIconById, useChainBrand } from "@/lib/chains/useChainBrand";
import { useTransferRoutes } from "@/hooks/useTransferRoutes";
import { useSourceBalances } from "@/hooks/useSourceBalances";
import { destinationLeg, sourcesFor, withinLimits } from "@/lib/transfer/registry";
import { bySourceBalance, canPayGas, holdsSomething } from "@/lib/transfer/sourceBalances";
import { BRIDGE_STEP_LABEL, bridgeIn, type BridgeStep } from "@/lib/transfer/cctp";
import { reportTransfer } from "@/lib/transfer/report";

/**
 * "Already have it somewhere else?" — the networks this asset can arrive from.
 *
 * ## The asset's own network is the default, and this section is the exception
 *
 * The first version of this put two dozen bridgeable networks above the address
 * and QR, sorted alphabetically. That inverted the screen: the ordinary way to
 * deposit USDC on Arc is to send USDC on Arc, and the bridge is what you reach
 * for when your money is elsewhere. A wall of networks in front of the common
 * path makes the common path look unsupported.
 *
 * So this is collapsed by default and says what it is for. Opening it puts the
 * asset's OWN network first, marked as the direct route, and the bridges after.
 *
 * ## Chains the wallet can actually use come first
 *
 * Two dozen names in alphabetical order is a list nobody reads to the end.
 * `useSourceBalances` reads the external wallet's USDC over each chain's public
 * RPC, so the network they can actually send from leads — and there is a search
 * field, because past about six rows scanning stops working.
 *
 * ## It renders nothing when there is nothing to offer
 *
 * Not an empty state. Most assets on most chains have no route — the registry
 * ships EMPTY — so a section announcing its own uselessness would be on screen
 * almost always.
 *
 * ## Why the external wallet arrives as props
 *
 * `lib/wallet/externalFunding` keeps the injected wallet deliberately outside
 * wagmi, so `useAccount()` is always the passkey account. A hook here would
 * become a second path to the injected provider — the exact coupling that
 * module's docstring exists to prevent.
 */
export function CrossChainSources({
  asset,
  tokenSymbol,
  chainId,
  destinationName,
  amount,
  externalAddress,
  provider,
  recipient,
  onBridgingChange,
}: {
  /** Canonical asset name, e.g. "USDC" — how the other legs are found. */
  asset: string;
  tokenSymbol: string;
  /** The DESTINATION chain: where the deposit lands. */
  chainId: number;
  destinationName: string;
  amount: string;
  externalAddress: string | null;
  provider: EIP1193Provider | null;
  recipient: string | null;
  /**
   * Reported upward so the panel can hide its own same-chain send.
   *
   * Bridging from another network and sending directly on this one are the same
   * decision made two ways, and both were on screen at once: two Deposit
   * buttons, with different amounts, one above the other. Whichever the user
   * pressed, the other was wrong.
   */
  onBridgingChange?: (active: boolean) => void;
}) {
  const { routes } = useTransferRoutes("deposit");
  // The operator's uploaded chain marks, by id. None of these 24 chains has one
  // today — `chainMeta` rows only exist for chains a registry knows — so they
  // render initials, which is this app's established answer for a chain with no
  // upload. Wired anyway so an upload appears without touching this file.
  const { data: chainBrands } = useChainBrand();
  // Keyed on the canonical asset, not the address: USDC has a different address
  // on every chain, so an address could never find the other legs.
  const sources = sourcesFor(routes, asset, chainId);
  const destination = destinationLeg(routes, asset, chainId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<TransferRoute | null>(null);
  /**
   * Showing the list even though a network is already chosen.
   *
   * "Change network" used to CLEAR the selection, so the list came back with
   * every row identical and nothing saying which one you were already on — the
   * one fact you opened it to reconsider. The choice survives now; this only
   * says which view is on screen.
   */
  const [browsing, setBrowsing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  /**
   * Stops WAITING on a wallet request, which is not the same as cancelling it.
   *
   * `wallet_switchEthereumChain` is not guaranteed to settle: switch the network
   * by hand in the extension instead of answering its prompt and the promise
   * neither resolves nor rejects, so the button sits on "Switch network in your
   * wallet" until the page is reloaded. The connect step already carries this
   * escape and says why; the bridge had none.
   *
   * Nothing here can withdraw a prompt already queued inside an extension, so
   * this only releases the UI — the wording says so.
   */
  const [abandoned, setAbandoned] = useState(false);
  const [step, setStep] = useState<BridgeStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  // True for the whole cross-chain flow, browsing included: the panel's own
  // same-chain send reappearing while someone re-picks a source would be the
  // two-buttons problem again, just intermittently.
  // True for the whole cross-chain flow, browsing included: the panel's own
  // same-chain send reappearing while someone re-picks a source would be the
  // two-buttons problem again, just intermittently.
  const bridging = selected !== null;

  /*
   * Held in a ref so the effect depends on the VALUE and not on the callback's
   * identity. Callers pass an inline arrow — a new function every render — so
   * depending on it re-ran the effect on every render, firing cleanup(false)
   * then (bridging) each time. Harmless-looking, and it makes the reported state
   * flap between false and true continuously.
   */
  const report = useRef(onBridgingChange);

  // Read inside the async handler, which closes over the state value it started
  // with — a plain `abandoned` there is always false.
  const abandonedRef = useRef(false);
  useLayoutEffect(() => {
    report.current = onBridgingChange;
    abandonedRef.current = abandoned;
  });

  useEffect(() => {
    report.current?.(bridging);
    // Told on unmount too: the section disappears when the asset changes, and a
    // panel still hiding its own send would have no control at all.
    return () => report.current?.(false);
  }, [bridging]);

  // Only once opened. Two dozen RPC reads is not something a closed section
  // should be doing on every deposit page view.
  const { balances } = useSourceBalances(open ? externalAddress : null, sources.map((s) => s.chainId));

  const matched = useMemo(() => {
    const ordered = bySourceBalance(sources, balances);
    // The chosen network leads, so re-opening the list never hides the answer to
    // "which one am I on?" behind a pager.
    const lifted = selected
      ? [
          ...ordered.filter((route) => route.chainId === selected.chainId),
          ...ordered.filter((route) => route.chainId !== selected.chainId),
        ]
      : ordered;
    const needle = query.trim().toLowerCase();
    if (!needle) return lifted;
    return lifted.filter((route) => label(route).toLowerCase().includes(needle));
  }, [sources, balances, query, selected]);

  /*
   * PAGED, not scrolled. Two dozen rows opened inline pushed the address and QR
   * — the things this page exists to show — off the bottom of the screen, and an
   * inner scroll area inside a page that also scrolls is its own problem: the
   * wheel does one or the other depending on where the pointer is.
   *
   * Three keeps the section shorter than the panel above it, so opening it
   * never pushes the address and QR off the screen.
   */
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  // Clamped rather than reset in an effect: a filter that shortens the list can
  // strand the page index past the end, and `slice` would render nothing at all
  // with the controls still claiming a page.
  const current = Math.min(page, pageCount - 1);
  const shown = matched.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (externalAddress === null || destination === null || sources.length === 0) return null;

  async function start(route: TransferRoute, value: string) {
    /*
     * Validated HERE, on the confirm — not when a network is picked.
     *
     * Clicking a network used to run this whole function with the panel's own
     * amount field, which defaults to 0.05 for a gas top-up. So choosing
     * "Arbitrum Sepolia" answered "Minimum is 1" and selected nothing: the one
     * control for picking a source rejected the pick on the strength of a number
     * the user had not entered and could not see.
     *
     * Picking a network is now just picking a network.
     */
    const limit = withinLimits(route, Number(value));
    if (!limit.ok) {
      setError(limit.reason);
      return;
    }
    if (!provider || !recipient) {
      setError("Connect your Rate wallet first.");
      return;
    }

    setError(null);
    setAbandoned(false);
    setBusy(route.chainId);
    const outcome = await bridgeIn(
      {
        // `route` IS the source leg — sourcesFor returned the other chains.
        sourceChainId: route.chainId,
        destinationChainId: chainId,
        amount: value,
        recipient,
        // The DESTINATION's settlement decides who submits the mint, not the
        // source's. Reading it off the source leg is how a forwarder-settled
        // chain would end up asking a gasless wallet to pay.
        useForwarder: destination!.settlement === "forwarder",
      },
      provider,
      setStep,
    );
    setBusy(null);
    setStep(null);

    // Abandoned means the user stopped waiting and has already been told so; a
    // late answer must not overwrite that with an error about a request they
    // walked away from.
    if (abandonedRef.current) return;
    if (!outcome.ok) setError(outcome.reason);
    else {
      /*
       * RECORD IT. A completed bridge used to raise a toast and nothing else.
       *
       * `bridgeIn` returns the MINT hash — the transaction that actually
       * credited the account — and this branch threw it away, so a deposit that
       * had fully settled left no row in Recent transfers, no hash, and no
       * explorer link. The only way to get one was for the user to find the
       * hash themselves and paste it into "Already sent it?", which is the
       * manual fallback for QR deposits the app never saw. This one it saw
       * every step of.
       *
       * Reported against the DESTINATION chain, because that is where the mint
       * is and identity-service verifies a report by reading its receipt. The
       * burn on the source chain is a different transaction on a different
       * chain, and it credits nobody — reporting that hash here would be a 422.
       *
       * The symbol comes from `tokenSymbol`, the asset this panel is already
       * bridging. The local row exists precisely so the list is right before the
       * service answers, and a row recorded with no symbol renders as "Received
       * 0.05 —" — the em-dash `history.ts` substitutes when a record arrives
       * without one.
       *
       * Guarded on the hash because `BridgeOutcome.mintTxHash` is nullable: the
       * SDK reports it from the mint event, and a settlement that completes
       * without one leaves nothing to link to. A row keyed on a missing hash
       * cannot be deduplicated or verified, so no row is better than a broken
       * one — the toast still fires.
       */
      if (outcome.mintTxHash) {
        reportTransfer({
          hash: outcome.mintTxHash,
          kind: "deposit",
          chainId,
          account: recipient,
          symbol: tokenSymbol,
          amount: value,
          peer: null,
        });
      }
      // "On its way" was true when nothing waited for the mint. `bridgeIn`
      // resolves only after the mint event, so by here the money has landed —
      // saying it is still travelling sends people back to check on a transfer
      // that is already done.
      toast.success(`${value} ${tokenSymbol} arrived in your Rate wallet.`, {
        description: outcome.mintTxHash
          ? "It is in your transfer list now."
          : `Delivered on ${destinationName}.`,
      });
      setSelected(null);
      setDraft("");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--m-border)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--m-primary)]"
      >
        <span className="flex flex-col">
          <span className="text-[13px] text-[color:var(--m-text-primary)]">
            Already have {tokenSymbol} on another network?
          </span>
          <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
            Bridge it in from {sources.length} networks
          </span>
        </span>
        <span className="shrink-0 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
          Show
        </span>
      </button>
    );
  }

  /*
   * CHOSEN — amount, then confirm.
   *
   * The step that was missing. A network row used to start a transfer straight
   * away with whatever the panel's gas field happened to hold, so the amount was
   * never asked and its rejection arrived as the answer to a different question.
   */
  if (selected && !browsing) {
    const funds = balances.get(selected.chainId);
    const held = funds?.token;
    const check = withinLimits(selected, Number(draft));
    const running = busy === selected.chainId;
    /*
     * A bridge BURNS on the source chain — an approve and a transaction the user
     * signs and pays for in that chain's own gas asset. Ten USDC on Arbitrum
     * Sepolia with no Sepolia ETH is not a deposit anyone can make.
     *
     * Only ever true on a KNOWN zero: `canPayGas` treats a failed read as
     * "maybe", because blocking a deposit over a rate-limited RPC is worse than
     * letting the wallet decline.
     */
    const noGas = !canPayGas(funds);

    return (
      <section className="flex flex-col gap-2" aria-label={`Deposit from ${label(selected)}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-dm-mono text-[11px] uppercase tracking-wide text-[color:var(--m-text-secondary)]">
            Deposit from
          </p>
          <button
            type="button"
            onClick={() => {
              // Keeps the choice — the list marks it rather than forgetting it.
              setBrowsing(true);
              // Page one, which is where the chosen row is lifted to. Returning
              // to whatever page was open last would hide the mark that makes
              // the selection visible at all.
              setPage(0);
              setQuery("");
              setError(null);
            }}
            className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
          >
            Change network
          </button>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] px-3 py-2">
          <ChainMark src={chainIconById(chainBrands, selected.chainId)} name={label(selected)} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] text-[color:var(--m-text-primary)]">{label(selected)}</span>
            <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
              {selected.provider.toUpperCase()}
              {destination.settlement === "forwarder" ? " · no gas needed on arrival" : ""}
            </span>
          </span>
          {holdsSomething(held) && (
            <span className="ml-auto shrink-0 font-dm-mono text-[12px] tabular-nums text-[color:var(--m-text-secondary)]">
              {held} {tokenSymbol}
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2">
          <input
            inputMode="decimal"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              // Clears as they type. An error about the PREVIOUS value, still on
              // screen beside a field they are fixing, reads as the fix failing.
              setError(null);
            }}
            placeholder="0.00"
            aria-label={`Amount of ${tokenSymbol} to bridge`}
            className="min-w-0 flex-1 bg-transparent font-dm-mono text-[15px] tabular-nums text-[color:var(--m-text-primary)] outline-none"
          />
          <span className="shrink-0 font-dm-mono text-[12px] text-[color:var(--m-text-secondary)]">
            {tokenSymbol}
          </span>
          {holdsSomething(held) && (
            <button
              type="button"
              onClick={() => setDraft(held ?? "")}
              className="shrink-0 rounded-lg border border-[color:var(--m-border)] px-2 py-0.5 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
            >
              Max
            </button>
          )}
        </label>

        <button
          type="button"
          disabled={running || noGas}
          onClick={() => void start(selected, draft)}
          className="w-full rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running
            ? step
              ? BRIDGE_STEP_LABEL[step]
              : "Working…"
            : noGas
              ? `No ${funds?.gasSymbol ?? "gas"} to send with`
              : draft === ""
                ? "Enter an amount"
                : `Deposit ${draft} ${tokenSymbol}`}
        </button>

        {running && (
          <button
            type="button"
            onClick={() => {
              setAbandoned(true);
              setBusy(null);
              setStep(null);
              setError(
                "Stopped waiting. If your wallet still has a prompt open, answer or dismiss it there — nothing has been sent.",
              );
            }}
            className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] underline underline-offset-2 hover:text-[color:var(--m-text-primary)]"
          >
            Stop waiting
          </button>
        )}

        {noGas && (
          <p className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
            Sending from {label(selected)} costs {funds?.gasSymbol ?? "gas"} on that network, and
            this wallet has none there. Fund it, or pick a network you can pay on.
          </p>
        )}

        {/* The limit is stated as GUIDANCE under the field, and only as an error
            once they have tried. A minimum announced as an error before anyone
            has entered anything is what made choosing a network feel refused. */}
        {error === null && !check.ok && draft !== "" && (
          <p className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">{check.reason}</p>
        )}
        {selected.minAmount > 0 && draft === "" && (
          <p className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
            Minimum {selected.minAmount} {tokenSymbol}
          </p>
        )}

        {error !== null && (
          <p role="alert" className="text-[12px] text-[color:var(--m-error)]">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label={`Bring ${tokenSymbol} from another network`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-dm-mono text-[11px] uppercase tracking-wide text-[color:var(--m-text-secondary)]">
          Bring it from
        </p>
        <button
          type="button"
          onClick={() => {
            // Closing ends the flow, or the panel would stay hiding its own send
            // for a bridge nobody is in the middle of any more.
            setOpen(false);
            setSelected(null);
            setBrowsing(false);
          }}
          className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]"
        >
          Hide
        </button>
      </div>

      {/* The asset's OWN network, first and always. It is the ordinary way to
          deposit and does not belong underneath two dozen bridges — the address
          it refers to is already on this page. Not a button: there is nothing to
          start, which is exactly what makes it the cheap option. */}
      {/* SELECTABLE, not a caption.
      
          It was a static row, so once a bridge source had been chosen there was
          no way back to depositing directly on this chain — the asset's own
          network was the one option the list could not return you to. Choosing
          it clears the bridge, which is what brings the panel's own send back. */}
      <button
        type="button"
        onClick={() => {
          setSelected(null);
          setBrowsing(false);
          setError(null);
        }}
        aria-label={`Deposit directly on ${destinationName}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
          selected === null
            ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] shadow-[0_0_0_1px_var(--m-primary)]"
            : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] hover:border-[color:var(--m-primary)]",
        )}
      >
        <ChainMark src={chainIconById(chainBrands, chainId)} name={destinationName} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] text-[color:var(--m-text-primary)]">{destinationName}</span>
          <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
            already here &middot; send to the address below, no bridge
          </span>
        </span>
        <span className="ml-auto shrink-0 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
          {selected === null ? "Chosen" : "Choose"}
        </span>
      </button>

      {/* Past about six rows scanning stops working, and there are two dozen. */}
      {sources.length > 6 && (
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            // Back to the first page: results the user just filtered for must
            // not be on a page they are not looking at.
            setPage(0);
          }}
          placeholder="Search networks"
          aria-label="Search networks to bridge from"
          className="w-full rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 text-[13px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)]"
        />
      )}

      {shown.map((route) => {
        const running = busy === route.chainId;
        const funds = balances.get(route.chainId);
        const held = funds?.token;
        const noGas = !canPayGas(funds);
        return (
          <button
            key={`${route.provider}:${route.providerChainKey}`}
            type="button"
            disabled={busy !== null}
            onClick={() => {
              // SELECT. Confirming is the next screen's job.
              setSelected(route);
              setBrowsing(false);
              setDraft(balances.get(route.chainId)?.token ?? "");
              setError(null);
            }}
            aria-label={
              holdsSomething(held)
                ? `Deposit from ${label(route)}, where you hold ${held} ${tokenSymbol}`
                : `Deposit from ${label(route)}`
            }
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-60",
              selected?.chainId === route.chainId
                ? "border-[color:var(--m-primary)] bg-[color:var(--m-surface-2)] shadow-[0_0_0_1px_var(--m-primary)]"
                : "border-[color:var(--m-border)] bg-[color:var(--m-surface-2)]",
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ChainMark src={chainIconById(chainBrands, route.chainId)} name={label(route)} />
              <span className="flex min-w-0 flex-col">
              <span className="text-[14px] text-[color:var(--m-text-primary)]">{label(route)}</span>
              <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                {running && step
                  ? BRIDGE_STEP_LABEL[step]
                  : /* Named because it is the thing people do not expect: the
                       receiving wallet signs nothing and needs no gas. */
                    noGas
                      ? /* The row would otherwise look identical to a usable one
                           and fail at the wallet, AFTER the network switch —
                           the most expensive place to find out. */
                        `needs ${funds?.gasSymbol ?? "gas"} on this network to send`
                      : route.provider.toUpperCase() +
                        (destination.settlement === "forwarder"
                          ? " · no gas needed on arrival"
                          : "")}
              </span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              {/* The UNIT is not optional. This was a bare "10" stacked above
                  "Bridge", which reads as a count, a fee, a rank — anything but
                  a balance. A number on a money screen with no unit beside it is
                  the same class of mistake as a price with no currency.

                  Shown only when it was actually read: a blank means "no answer
                  from that chain", which is not the claim 0.00 makes. */}
              {holdsSomething(held) && (
                <span
                  className={cn(
                    "block font-dm-mono text-[13px] tabular-nums",
                    noGas
                      ? "text-[color:var(--m-text-secondary)]"
                      : "text-[color:var(--m-text-primary)]",
                  )}
                >
                  {held} {tokenSymbol}
                </span>
              )}
              <span className="font-dm-mono text-[11px] text-[color:var(--m-text-secondary)]">
                {running ? "…" : selected?.chainId === route.chainId ? "Chosen" : "Choose"}
              </span>
            </span>
          </button>
        );
      })}

      {shown.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-[color:var(--m-text-secondary)]">
          No network matches &ldquo;{query}&rdquo;.
        </p>
      )}

      {/* Only when there is more than one page. A pager under six rows is a
          control that exists to say there is nothing to control. */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          <span className="font-dm-mono text-[11px] tabular-nums text-[color:var(--m-text-secondary)]">
            {current * PAGE_SIZE + 1}&ndash;{current * PAGE_SIZE + shown.length} of {matched.length}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page of networks"
              className="rounded-lg border border-[color:var(--m-border)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              aria-label="Next page of networks"
              className="rounded-lg border border-[color:var(--m-border)] px-2 py-1 font-dm-mono text-[11px] text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-text-primary)] disabled:opacity-40"
            >
              Next
            </button>
          </span>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-[12px] text-[color:var(--m-error)]">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * A chain's mark, or its initials.
 *
 * Circle ships no icon: its chain objects carry an explorer URL, RPC endpoints,
 * the USDC address and the CCTP domain, and nothing image-shaped. So the artwork
 * can only come from `chainMeta`, which an operator uploads — and for a chain
 * Rate does not serve there is no row, hence initials.
 *
 * Two letters from the NAME, not the provider key, so "Base Sepolia" gives BS
 * rather than B_. Deterministic and unstyled by brand: inventing a colour for a
 * chain whose brand nobody recorded is how a mark starts claiming something.
 */
function ChainMark({ src, name }: { src: string | undefined; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator upload, already normalised
      <img
        src={src}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full border border-[color:var(--m-border)] object-cover"
        style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-3,var(--m-surface-2))] font-dm-mono text-[9px] text-[color:var(--m-text-secondary)]"
      style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }}
    >
      {initials}
    </span>
  );
}

/** Three rows keeps the section shorter than the asset card above it, so opening
 *  it never pushes the address and QR off the screen. */
const PAGE_SIZE = 3;

/** `Base_Sepolia` is the provider's key, not a name to show a person. */
function label(route: { providerChainKey: string }): string {
  return route.providerChainKey.replace(/_/g, " ");
}
