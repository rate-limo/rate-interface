"use client";

/**
 * Step 3 — review, gate, submit.
 *
 * Rewritten for CoinGenerator. The review now states what `launch()` actually
 * does: deploy the coin, list it against the chosen quote at the admin-set
 * price, and hand back the supply MINUS whatever the listing consumed. It no
 * longer claims a seeded position, because the contract opens none.
 *
 * The typed symbol gate stays: deploying a contract with a typo'd symbol is
 * permanent, and there is no owner who could fix it afterwards.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { cn } from "@/lib/utils";
import {
  COIN_DECIMALS,
  fmtAmount,
  fmtCompact,
  fmtFee,
  fmtRate,
  parseAmount,
  shortHex,
} from "@/lib/launch/mock";
import type {
  LaunchDraft,
  LaunchExecution,
  LaunchPhase,
  LaunchReceipt,
  LaunchTerms,
  QuoteOption,
  UploadedLogo,
} from "@/lib/launch/types";
import {
  Callout,
  Field,
  GhostButton,
  Kv,
  KvRow,
  KvVal,
  Lbl,
  Panel,
  PrimaryButton,
  Waiting,
} from "./parts";

export function LaunchConfirm({
  draft,
  quoteOption,
  terms,
  logoFile,
  execution,
  networkName,
  isConnected,
  onConnect,
  onBack,
  onRestart,
  onExplore,
}: {
  draft: LaunchDraft;
  quoteOption: QuoteOption;
  terms: LaunchTerms | null;
  logoFile: File | null;
  execution: LaunchExecution;
  /** Which chain to submit the launch transaction on — see LaunchExecution's docstring. */
  networkName: string | number;
  isConnected: boolean;
  onConnect: () => void;
  onBack: () => void;
  onRestart: () => void;
  onExplore: (receipt: LaunchReceipt) => void;
}) {
  const [phase, setPhase] = useState<LaunchPhase>("review");
  const [typed, setTyped] = useState("");
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const symbol = draft.token.symbol.trim().toUpperCase();
  const supply = parseAmount(draft.token.totalSupply);
  const gateOpen = typed.trim().toUpperCase() === symbol;

  const run = async () => {
    if (!isConnected) {
      onConnect();
      return;
    }
    setFailure(null);
    try {
      let uploaded: UploadedLogo | null = null;
      if (logoFile) {
        setPhase("uploading");
        uploaded = await execution.uploadLogo(logoFile);
      }
      if (!alive.current) return;
      setPhase("deploying");
      const submitted = await execution.submit(draft, networkName);
      if (!alive.current) return;

      // BIND the artwork to the coin, which can only happen now: the claim is
      // authorized against the coin's address, and the coin did not exist until
      // the line above returned.
      //
      // This step did not exist. The upload ran, its URL was carried in React
      // state to the success screen, and nothing ever wrote it anywhere — so the
      // creator watched their logo render once, and every OTHER surface (Explore,
      // the token page, portfolios) showed the fallback forever, because
      // `spotTokens.logoURI` is written by the broker from the chain event and
      // knows nothing about an upload. `claimLogo` writes `adminTokenMeta`, which
      // the gateway merges over that row.
      //
      // Deliberately NOT fatal. The coin is deployed and the fee is spent by this
      // point; a declined signature is the creator's choice, not a failed launch,
      // and the screen below says which of the two happened.
      let logoBound: boolean | null = null;
      if (uploaded) {
        setPhase("binding");
        logoBound = await execution.claimLogo(submitted.coinAddress, uploaded.sha256, networkName);
      }
      const result = {
        ...submitted,
        logoURI: uploaded?.logoURI ?? submitted.logoURI,
        logoBound,
      };
      if (!alive.current) return;
      setPhase("pending");
      setReceipt(result);
      // The receipt is already in hand — `execution.submit` does not resolve until the
      // launch has landed. This awaited a hard-coded 1500ms first, so the one flow that
      // genuinely transacts spent a second and a half pretending to confirm something
      // that had already confirmed.
      if (!alive.current) return;
      setPhase("done");
      toast.success(`${symbol} is live`);
    } catch (error) {
      if (!alive.current) return;
      setFailure(error instanceof Error ? error.message : "The launch did not go through.");
      setPhase("review");
    }
  };

  if (phase === "uploading") {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col" title="Store the metadata">
        <Waiting
          title="Uploading the logo"
          body="The image and description are stored off-chain, then linked to the coin's address."
        />
      </Panel>
    );
  }

  if (phase === "binding") {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col" title="Link the logo">
        <Waiting
          title="Sign to link your logo"
          body="One signature proves you launched this coin. It costs nothing and sends no transaction — without it the coin lists without artwork."
        />
      </Panel>
    );
  }

  if (phase === "deploying") {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col" title={`Launch ${symbol}`}>
        <Waiting
          title="Confirm in your wallet"
          body={`Deploy ${symbol} and list it against ${quoteOption.symbol} — one transaction.`}
        />
      </Panel>
    );
  }

  if (phase === "pending") {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col" title="Submitted">
        <Waiting
          title="Confirming on-chain"
          body="Your coin is being deployed and the pair listed."
          tx={receipt ? `${shortHex(receipt.txHash)} ↗` : undefined}
        />
      </Panel>
    );
  }

  if (phase === "done" && receipt) {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col">
        <div className="flex flex-1 flex-col items-center text-center">
          <TokenImageIcon
            symbol={symbol}
            color="var(--m-logo)"
            logoURI={receipt.logoURI ?? undefined}
            size="lg"
            className="mb-2.5 h-[52px] w-[52px] text-[15px]"
          />
          <span className="mb-1.5 font-mono text-[11px] text-[var(--m-success)]">✓ launched</span>
          {receipt.logoBound === false && (
            // The launch succeeded and the LOGO did not land. Saying so here is
            // the whole point: the image above is rendered from the file still
            // in this browser, so without this line the creator sees artwork
            // that no one else will ever see and has no idea anything is wrong.
            <p className="mb-1.5 max-w-[300px] text-[11.5px] text-[var(--m-warning)]">
              Your logo was uploaded but not linked — the signature was declined or
              did not go through. The coin is live; add the logo from your portfolio&apos;s
              Creator tab whenever you like.
            </p>
          )}
          <h4 className="mb-1 text-[17px] font-semibold">{symbol} is live</h4>
          <p className="mb-2.5 text-[12.5px] text-[var(--m-text-secondary)]">
            {draft.token.name.trim()} · {symbol}/{quoteOption.symbol}
          </p>
          <Kv className="mt-1.5 w-full self-stretch text-left">
            <KvRow k="Contract">
              <KvVal tone="blue">{shortHex(receipt.coinAddress)} ↗</KvVal>
            </KvRow>
            <KvRow k="Pair">
              <KvVal tone="blue">{shortHex(receipt.pairAddress)} ↗</KvVal>
            </KvRow>
            <KvRow k="In your wallet">
              <KvVal>
                {fmtCompact(receipt.receivedSupply)} {symbol}
              </KvVal>
            </KvRow>
            <KvRow k="Transaction">
              <KvVal tone="blue">{shortHex(receipt.txHash)} ↗</KvVal>
            </KvRow>
          </Kv>
          <Callout>
            <b className="font-semibold">The book is empty until someone trades.</b> Listing creates
            the market; it does not put liquidity in it. Your whole supply is in your wallet — place
            orders to make one.
          </Callout>
          <div className="flex-1" />
          <PrimaryButton onClick={() => onExplore(receipt)}>Trade {symbol}</PrimaryButton>
          <p className="mt-2 text-center text-[11px] text-[var(--m-text-secondary-2)]">
            The market appears once the block is final — usually under a minute.
          </p>
          <GhostButton onClick={onRestart}>Launch another</GhostButton>
        </div>
      </Panel>
    );
  }

  // ---- review ----
  return (
    <Panel className="mx-auto flex min-h-[360px] max-w-[1120px] flex-col">
      <div className="mb-3.5 flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Back to market"
          onClick={onBack}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[var(--m-border)] text-[15px] text-[var(--m-text-secondary)]"
        >
          ←
        </button>
        <h3 className="text-base font-semibold">Launch {symbol}</h3>
        <TokenImageIcon
          symbol={symbol}
          color="var(--m-logo)"
          logoURI={draft.token.logoPreview ?? undefined}
          size="sm"
          className="ml-auto h-[22px] w-[22px] text-[7px]"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <Kv>
        <KvRow k="Token">
          <KvVal>
            {draft.token.name.trim()} · {symbol} · {COIN_DECIMALS}
          </KvVal>
        </KvRow>
        <KvRow k="Supply">
          <KvVal>{fmtCompact(supply)}</KvVal>
        </KvRow>
        <KvRow k="Market">
          <KvVal>
            {symbol}/{quoteOption.symbol}
          </KvVal>
        </KvRow>
        <KvRow k="Lists at">
          <KvVal>
            1 {symbol} = {fmtRate(quoteOption.listingPrice)} {quoteOption.symbol}
          </KvVal>
        </KvRow>
        <KvRow k="You receive">
          <KvVal>supply − listing cost</KvVal>
        </KvRow>
        {terms && (
          <KvRow k="Launch fee">
            <KvVal>
              {terms.launchFeeEth > 0 ? `${terms.launchFeeEth} ETH` : "free"}
            </KvVal>
          </KvRow>
        )}
        <KvRow k="Payment asset">
          <KvVal tone="blue">ETH · native</KvVal>
        </KvRow>
        <KvRow k="Starting taker fee">
          <KvVal tone="gold">{fmtFee(quoteOption.startingTakerFee)}</KvVal>
        </KvRow>
        <KvRow k="Graduation target">
          <KvVal>{fmtAmount(quoteOption.graduationTargetQuote)} {quoteOption.symbol} purchased</KvVal>
        </KvRow>
        <KvRow k="Creator upside">
          <KvVal tone="good">LP fees from your position accrue to you</KvVal>
        </KvRow>
        <KvRow k="Slippage limit">
          <KvVal>{draft.risk.slippagePct.toFixed(2)}% · {draft.risk.volatilityProfile}</KvVal>
        </KvRow>
        <KvRow k="Market fee">
          <KvVal>{draft.risk.feePct.toFixed(2)}% · {draft.risk.feeProfile}</KvVal>
        </KvRow>
        {draft.liquidity && (
          <KvRow k="Initial liquidity">
            <KvVal>{draft.liquidity.baseAmount || "0"} {symbol} · {draft.liquidity.quoteAmount || "0"} {quoteOption.symbol}</KvVal>
          </KvRow>
        )}
      {draft.liquidity && (
          <KvRow k="Liquidity lock">
            <KvVal>{draft.liquidity.locked ? draft.liquidity.lockDuration : "unlocked"}</KvVal>
          </KvRow>
        )}
      </Kv>

      <div>
      <Lbl>Pay with</Lbl>
      <div className="flex items-center gap-3 rounded-[13px] border border-[var(--m-primary)] bg-[var(--m-surface-selected)] px-3.5 py-3">
        <TokenImageIcon symbol="ETH" color="#627eea" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--m-text-primary)]">ETH</p>
          <p className="mt-0.5 text-[11px] text-[var(--m-text-secondary)]">Paid as native ETH with the launch transaction</p>
        </div>
        <span className="font-mono text-[12px] font-semibold text-[var(--m-primary-fg)]">
          {terms && terms.launchFeeEth > 0 ? `${terms.launchFeeEth} ETH` : "No fee"}
        </span>
      </div>

      <Lbl>What this transaction does</Lbl>
      <StepRow n="1" label="Pay with ETH" meta={terms && terms.launchFeeEth > 0 ? `${terms.launchFeeEth} ETH attached` : "no launch fee"} />
      <StepRow n="2" label={`Deploy ${symbol}`} meta={`fixed supply, ${COIN_DECIMALS} decimals`} />
      <StepRow
        n="3"
        label={`List ${symbol}/${quoteOption.symbol}`}
        meta="listing cost taken from the new supply"
      />
      <StepRow n="4" label="Send you the rest" meta="whatever listing didn't consume" />

      <Callout tone="warn">
        <b className="font-semibold">This is permanent.</b> Type{" "}
        <b className="font-mono font-semibold">{symbol}</b> to confirm you&apos;ve checked the name,
        symbol and supply — there is no owner who could change them later.
      </Callout>
      <div className="mt-2">
        <Field
          ariaLabel="Type the symbol to confirm"
          dataTestId="launch-confirm-gate"
          value={typed}
          onChange={(v) => setTyped(v.toUpperCase())}
          placeholder={symbol}
          suffix="type to confirm"
          mono
          maxLength={11}
        />
      </div>

      {failure && (
        <Callout tone="warn">
          <b className="font-semibold">{failure}</b> Nothing was deployed — funds untouched.
        </Callout>
      )}

      <div className="flex-1" />
      <PrimaryButton dataTestId="launch-confirm" onClick={run} disabled={isConnected && !gateOpen}>
        {isConnected ? "Deploy & list" : "Connect wallet"}
      </PrimaryButton>
      <p className="mt-2.5 text-center text-[11px] text-[var(--m-text-secondary-2)]">
        <span className="text-[var(--m-logo)]">◆</span> Self-custody · one transaction
      </p>
      </div>
      </div>
    </Panel>
  );
}

function StepRow({ n, label, meta }: { n: string; label: string; meta: string }) {
  return (
    <div
      className={cn(
        "mb-1.5 flex items-center gap-2.5 rounded-[11px] border border-[var(--m-border)] px-3 py-2.5 text-[13px]",
      )}
    >
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[var(--m-surface-2)] font-mono text-[11px]">
        {n}
      </span>
      {label}
      <span className="ml-auto text-right font-mono text-[11px] text-[var(--m-text-secondary-2)]">
        {meta}
      </span>
    </div>
  );
}
