"use client";

import Link from "next/link";

/**
 * Step 3 — review, gate, submit.
 *
 * States what the ladder `launch()` does: deploy the coin, list it at the
 * starting price (starting market cap / supply), sell the creator their dev buy
 * at that price, and rest 80% of supply as five sell steps. The rest, and
 * everything raised, is held until graduation seeds the pool. The creator must
 * choose here what happens to that pool afterwards (`lockMode`). Two wallet
 * prompts: an exact approve of the quote, then the launch.
 *
 * The typed symbol gate stays: deploying a contract with a typo'd symbol is
 * permanent, and there is no owner who could fix it afterwards.
 */

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { LadderNotPlacedError, placeLadder } from "@/lib/launch/ladderRecovery";
import { toast } from "sonner";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { cn } from "@/lib/utils";
import { allocate } from "@/lib/launch/allocation";
import { devBuyView } from "@/lib/launch/devBuy";
import { decodeOrderSubmitError } from "@/utils/orderErrors";
import {
  COIN_DECIMALS,
  fmtAmount,
  fmtCompact,
  fmtFee,
  fmtRate,
  shortHex,
} from "@/lib/launch/mock";
import {
  LAUNCH_SUPPLY,
  LAUNCH_SUPPLY_TEXT,
  LAUNCH_VOLATILITY_BPS,
  type LaunchDraft,
  type LockMode,
  type LaunchExecution,
  type LaunchPhase,
  type LaunchReceipt,
  type LaunchTerms,
  type QuoteOption,
  type UploadedLogo,
} from "@/lib/launch/types";
import { ReviewSummary } from "./ReviewSummary";
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

const LOCK_CHOICES: { mode: LockMode; title: string; body: string }[] = [
  {
    mode: "feesOnly",
    title: "Keep earning fees forever",
    body: "Liquidity is never withdrawable. You collect the pool's fees for as long as it trades.",
  },
  {
    mode: "vest12Months",
    title: "Unlock gradually",
    body: "Liquidity unlocks gradually over 12 months after graduation. You collect fees meanwhile.",
  },
];

export function LaunchConfirm({
  draft,
  onLockMode,
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
  onLaunched,
}: {
  draft: LaunchDraft;
  onLockMode: (mode: LockMode) => void;
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
  /**
   * The coin now exists on chain (its ladder may still be pending). The caller drops
   * the saved draft here: a draft that survives this reopens /create on a confirm
   * screen for a coin already deployed, one click from deploying a second copy.
   */
  onLaunched?: () => void;
}) {
  const { address: walletAddress } = useAccount();
  const [phase, setPhase] = useState<LaunchPhase>("review");
  const [typed, setTyped] = useState("");
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The half-launched case: a live coin whose ladder is not on the book. Held
  // apart from `failure` because nothing failed that a retry could repair, and
  // apart from `receipt` because the coin is not yet usable.
  const [stranded, setStranded] = useState<{
    coin: `0x${string}`;
    launch: LaunchReceipt;
    logo: UploadedLogo | null;
  } | null>(null);
  const [placing, setPlacing] = useState(false);
  // `uploaded` is a local inside `run`; the catch needs it to resume the claim.
  const uploadedRef = useRef<UploadedLogo | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const symbol = draft.token.symbol.trim().toUpperCase();
  const supply = LAUNCH_SUPPLY;
  const gateOpen = typed.trim().toUpperCase() === symbol && draft.market.lockMode !== null;

  const run = async () => {
    if (!isConnected) {
      onConnect();
      return;
    }
    setFailure(null);
    try {
      let uploaded: UploadedLogo | null = null;
      setStranded(null);
      if (logoFile) {
        setPhase("uploading");
        uploaded = await execution.uploadLogo(logoFile);
        uploadedRef.current = uploaded;
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
      onLaunched?.();
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
      // Logged whole: the toast keeps one line, and a revert the ABI cannot name
      // otherwise leaves nothing to diagnose it from.
      console.error("launch failed", error);
      // The coin IS deployed here and the fee IS spent, so this must not reach the
      // failure callout below, which says the opposite in as many words.
      if (error instanceof LadderNotPlacedError) {
        onLaunched?.();
        setStranded({
          coin: error.coin,
          launch: error.launch as LaunchReceipt,
          logo: uploadedRef.current,
        });
        setPhase("ladder");
        return;
      }
      // A named revert becomes its sentence; anything else (a declined prompt, an
      // RPC error) keeps its own message rather than raw chain text.
      const decoded = decodeOrderSubmitError(error);
      setFailure(
        decoded
          ? `${decoded.title}. ${decoded.description}`
          : error instanceof Error
            ? error.message.split("\n")[0]!
            : "The launch did not go through.",
      );
      setPhase("review");
    }
  };

  /**
   * Finish a launch whose ladder never landed.
   *
   * Permissionless on the contract and it reverts `LadderAlreadyPlaced` on a
   * second call, so this is safe to press twice and safe to press by someone who
   * is not the creator. On success the flow resumes exactly where it stopped —
   * the logo claim, then the ordinary receipt.
   */
  const finishLadder = async () => {
    if (!stranded || !walletAddress) return;
    setPlacing(true);
    setFailure(null);
    try {
      await placeLadder(stranded.coin, networkName, walletAddress);
      if (!alive.current) return;
      let logoBound: boolean | null = null;
      if (stranded.logo) {
        setPhase("binding");
        logoBound = await execution.claimLogo(stranded.coin, stranded.logo.sha256, networkName);
      }
      if (!alive.current) return;
      setReceipt({
        ...stranded.launch,
        logoURI: stranded.logo?.logoURI ?? stranded.launch.logoURI,
        logoBound,
      });
      setStranded(null);
      setPhase("done");
      toast.success(`${symbol} is live`);
    } catch (error) {
      if (!alive.current) return;
      console.error("placing the ladder failed", error);
      const decoded = decodeOrderSubmitError(error);
      setFailure(
        decoded
          ? `${decoded.title}. ${decoded.description}`
          : error instanceof Error
            ? error.message.split("\n")[0]!
            : "The ladder did not go through.",
      );
      setPhase("ladder");
    } finally {
      if (alive.current) setPlacing(false);
    }
  };

  if (phase === "ladder" && stranded) {
    return (
      <Panel className="mx-auto flex min-h-[360px] max-w-[460px] flex-col" title="One step left">
        <Callout tone="warn">
          <b className="font-semibold">{symbol} is deployed, but its price ladder is not on the book yet</b>{" "}
          — so nothing is for sale. This chain places the ladder in a second transaction, and that one did
          not land. Your launch fee and dev buy are already spent; sending the launch again would create a
          second coin, so it finishes from here instead.
        </Callout>
        <p className="mt-3 font-mono text-[11px] break-all text-[var(--m-text-secondary-2)]">{stranded.coin}</p>
        {failure && (
          <Callout tone="warn">
            <b className="font-semibold">{failure}</b> The ladder is still unplaced and can be placed again.
          </Callout>
        )}
        <div className="flex-1" />
        <PrimaryButton dataTestId="launch-place-ladder" onClick={finishLadder} disabled={placing || !walletAddress}>
          {placing ? "Placing the ladder…" : "Place the price ladder"}
        </PrimaryButton>
        <p className="mt-2.5 text-center text-[11px] text-[var(--m-text-secondary-2)]">
          Anyone can finish this — the ladder is fixed by the launch, so there is nothing left to choose.
        </p>
      </Panel>
    );
  }

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
          body={`Approve your ${quoteOption.symbol} dev buy, then deploy ${symbol}, list it and place its five sell steps. Up to two prompts.`}
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
            <KvRow k="Your dev buy">
              <KvVal>
                {fmtCompact(receipt.receivedSupply)} {symbol} for {fmtAmount(receipt.devBuyQuote)}{" "}
                {quoteOption.symbol}
              </KvVal>
            </KvRow>
            <KvRow k="Transaction">
              <KvVal tone="blue">{shortHex(receipt.txHash)} ↗</KvVal>
            </KvRow>
          </Kv>
          <Callout>
            <b className="font-semibold">The first step is on sale now.</b> Once all five steps sell,
            anyone can graduate {symbol} from your portfolio&apos;s Creator tab. That opens the pool
            and gives you its fee and volatility.
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
  // The split the contract makes: the dev buy to the creator, everything else
  // into the locked pool position. Same `devBuyView` the Market step showed, so
  // the two screens cannot quote different coin counts.
  const view = devBuyView(quoteOption, LAUNCH_SUPPLY_TEXT, draft.market.devBuy);
  const ladderCoins = (supply * view.ladder.reduce((sum, st) => sum + st.supplyPct, 0)) / 100;
  const allocation = allocate(
    [
      { label: "Sold in 5 steps", value: ladderCoins },
      { label: "Held for the pool", value: Math.max(0, supply - ladderCoins - view.coins) },
      { label: "Your dev buy", value: view.coins },
    ],
    supply,
  );

  return (
    <Panel className="mx-auto flex min-h-[360px] max-w-[1120px] flex-col">
      <div className="mb-4 flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Back to market"
          onClick={onBack}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[var(--m-border)] text-[15px] text-[var(--m-text-secondary)]"
        >
          ←
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--m-text-secondary-2)]">
          Launch a coin
        </span>
      </div>

      <ReviewSummary
        title="Review & confirm"
        lede="Check every figure before deploying. The coin has no owner, so none of it can be changed afterwards."
        symbol={symbol}
        name={draft.token.name.trim() || "Unnamed"}
        logoURI={draft.token.logoPreview ?? undefined}
        chip="Fair launch"
        tiles={[
          { label: "Total supply", value: fmtCompact(supply), hint: `${COIN_DECIMALS} decimals` },
          {
            // A rate, never a dollar figure — the launch and liquidity specs
            // both require this form.
            label: "Starts at",
            value: fmtRate(view.price),
            hint: `${quoteOption.symbol} per ${symbol}`,
          },
          {
            label: "Taker fee",
            value: fmtFee(quoteOption.startingTakerFee),
            hint: "yours to set after graduation",
          },
          {
            label: "Graduates at",
            value: fmtAmount(Number(quoteOption.graduationMarketCap) / 10 ** quoteOption.decimals),
            hint: `${quoteOption.symbol} market cap, all 5 steps sold`,
          },
        ]}
        allocation={allocation}
        allocationNote={
          <>
            Your dev buy is the only part of the supply you receive. The rest, and every{" "}
            {quoteOption.symbol} raised, go into the pool at graduation.
          </>
        }
      >

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <Kv>
        <KvRow k="Token">
          <KvVal>
            {draft.token.name.trim()} · {symbol} · {COIN_DECIMALS}
          </KvVal>
        </KvRow>
        <KvRow k="Market">
          <KvVal>
            {symbol}/{quoteOption.symbol}
          </KvVal>
        </KvRow>
        <KvRow k="Dev buy">
          <KvVal>
            {fmtAmount(view.amount)} {quoteOption.symbol} → {fmtCompact(view.coins)} {symbol} (
            {view.sharePct.toFixed(2)}%)
          </KvVal>
        </KvRow>
        <KvRow k="Starting market cap">
          <KvVal>
            {fmtAmount(view.startingMarketCap)} {quoteOption.symbol}
          </KvVal>
        </KvRow>
        {terms && (
          <KvRow k="Launch fee">
            <KvVal>
              {terms.launchFeeEth > 0 ? `${terms.launchFeeEth} ${terms.launchFeeSymbol}` : "free"}
            </KvVal>
          </KvRow>
        )}
        <KvRow k="Volatility">
          <KvVal>{(LAUNCH_VOLATILITY_BPS / 100).toFixed(2)}% · Meme, fixed until graduation</KvVal>
        </KvRow>
        <KvRow k="Sell steps">
          <KvVal>
            {view.ladder.map((st) => fmtAmount(st.marketCap)).join(" → ")} {quoteOption.symbol} cap
          </KvVal>
        </KvRow>
      </Kv>

      <div>
      <Lbl>After graduation, the pool</Lbl>
      <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="What happens to the pool after graduation">
        {LOCK_CHOICES.map((c) => {
          const on = draft.market.lockMode === c.mode;
          return (
            <button
              key={c.mode}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`launch-lock-${c.mode}`}
              onClick={() => onLockMode(c.mode)}
              className={cn(
                "rounded-xl border px-3.5 py-3 text-left",
                on
                  ? "border-[var(--m-primary)] bg-[var(--m-surface-selected)]"
                  : "border-[var(--m-border)] bg-[var(--m-surface-2)] hover:border-[var(--m-primary)]",
              )}
            >
              <b className="block text-[13.5px] font-semibold">{c.title}</b>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--m-text-secondary)]">{c.body}</span>
            </button>
          );
        })}
      </div>
      <p data-testid="launch-pool-risk" className="mt-2 text-[11.5px] leading-snug text-[var(--m-text-secondary)]">
        After graduation, others can push the pool&apos;s price and trade against it; Rate is an order-book DEX.{" "}
        <Link href="/fees#risks" className="underline underline-offset-2">How</Link>
      </p>
      <p className="mb-3 mt-1.5 text-[11px] text-[var(--m-text-secondary-2)]">Required. It can&apos;t be changed after launch.</p>

      <Lbl>What you sign</Lbl>
      {terms?.feeInQuote && terms.launchFeeEth > 0 ? (
        // Tempo: the fee is pulled in the quote token, so it is approved with the dev buy.
        <StepRow
          n="1"
          label={`Approve ${fmtAmount(view.amount + terms.launchFeeEth)} ${quoteOption.symbol}`}
          meta={`exact amount: ${fmtAmount(view.amount)} dev buy + ${terms.launchFeeEth} launch fee`}
        />
      ) : (
        <StepRow n="1" label={`Approve ${fmtAmount(view.amount)} ${quoteOption.symbol}`} meta="exact amount, for the dev buy" />
      )}
      <StepRow
        n="2"
        label={`Launch ${symbol}`}
        meta={
          terms && terms.launchFeeEth > 0
            ? terms.feeInQuote
              ? `${terms.launchFeeEth} ${terms.launchFeeSymbol} fee, from the approval above`
              : `${terms.launchFeeEth} ${terms.launchFeeSymbol} fee attached`
            : "no launch fee"
        }
      />
      {terms?.ladderDeferred && (
        <StepRow n="3" label="Place the sell ladder" meta="second transaction; the app sends it right after" />
      )}
      <p className="mb-3 mt-1 text-[11.5px] leading-5 text-[var(--m-text-secondary)]">
        {terms?.ladderDeferred ? (
          <>
            The launch deploys {symbol}, lists {symbol}/{quoteOption.symbol} at the starting price and sends you
            your dev buy; a second transaction places the five sell steps. This network caps how much one
            transaction can do, so the ladder cannot ride along.
          </>
        ) : (
          <>
            The launch deploys {symbol}, lists {symbol}/{quoteOption.symbol} at the starting price, sends you
            your dev buy, and places the five sell steps, all in one transaction.
          </>
        )}
      </p>

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
          <b className="font-semibold">{failure}</b> Nothing was deployed, and no {quoteOption.symbol} left
          your wallet.
        </Callout>
      )}

      <div className="flex-1" />
      <PrimaryButton dataTestId="launch-confirm" onClick={run} disabled={isConnected && !gateOpen}>
        {isConnected ? "Deploy & list" : "Connect wallet"}
      </PrimaryButton>
      <p className="mt-2.5 text-center text-[11px] text-[var(--m-text-secondary-2)]">
        <span className="text-[var(--m-logo)]">◆</span> Self-custody · approve, then launch
      </p>
      </div>
      </div>
      </ReviewSummary>
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
