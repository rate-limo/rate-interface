"use client";

/**
 * Rate token launch — three steps with a stepper:
 *   1 · Token   — metadata + the fields `Coin`'s constructor takes
 *   2 · Market  — the quote token and the dev buy
 *   3 · Confirm — typed gate → approve + launch
 *
 * Modelled on contracts/src/asset/AssetGenerator.sol's dev-buy launch. There
 * are no volatility, fee or liquidity steps: a coin starts at Meme volatility
 * and the quote's starting taker fee, its price comes from the admin-set
 * starting market cap, and the contract itself puts the supply in the pool.
 * The creator's only market decision is the dev buy.
 *
 * Distinct from `/pool/new`, whose "Launch a pool" mode opens a pool for tokens
 * that already exist. Execution is mock behind lib/launch/* (LaunchExecution).
 */

import { marketParam } from "@/lib/routing/proMarket";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { buildPageUrl, DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { validateToken } from "@/lib/launch/mock";
import { ladderLaunchReady, launchExecution } from "@/lib/launch/execution";
import { defaultLaunchChain, launchChains } from "@/lib/launch/launchChains";
import type {
  LaunchDraft,
  LaunchExecution,
  LaunchStep,
  LockMode,
  LaunchTerms,
  QuoteOption,
  TokenDraft,
} from "@/lib/launch/types";
import { LAUNCH_SUPPLY_TEXT } from "@/lib/launch/types";
import { clearsListingFloor, devBuyView } from "@/lib/launch/devBuy";
import { Stepper } from "@components/Atoms/Stepper";
import { TokenStep } from "./TokenStep";
import { MarketStep } from "./MarketStep";
import { LaunchConfirm } from "./LaunchConfirm";
import { LaunchPreviewCard } from "./LaunchPreviewCard";

const STEPS: { key: LaunchStep; label: string }[] = [
  { key: "token", label: "Token" },
  { key: "market", label: "Market" },
  { key: "confirm", label: "Confirm" },
];

const EMPTY_TOKEN: TokenDraft = {
  name: "",
  symbol: "",
  description: "",
  website: "",
  x: "",
  logoPreview: null,
  logoName: null,
};

type PersistedLaunchState = {
  step: LaunchStep;
  token: TokenDraft;
  quote: string;
  devBuy: string;
  lockMode: LockMode | null;
};

export function LaunchFlow({
  networkSlug,
  execution = launchExecution,
}: {
  networkSlug?: string;
  /** Injectable so tests (and a fully-mocked run) stay one argument away. */
  execution?: LaunchExecution;
}) {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { open } = useWalletConnect();

  const storageKey = `iter:launch-draft:${networkSlug ?? "default"}`;
  const [step, setStep] = useState<LaunchStep>("token");
  const [token, setToken] = useState<TokenDraft>(EMPTY_TOKEN);
  const [quote, setQuote] = useState("");
  const [devBuy, setDevBuy] = useState("");
  // No default: what happens to the pool after graduation is the creator's
  // decision, and the Confirm step will not deploy until it is made.
  const [lockMode, setLockMode] = useState<LockMode | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  // Quote options and terms are ADMIN-SET on the generator, so they are read,
  // never entered. Fetched once: they change only when an operator retunes them.
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [terms, setTerms] = useState<LaunchTerms | null>(null);

  // Restore the in-progress wizard after a refresh. Logo bytes are deliberately
  // not persisted because a File/object URL is scoped to the previous document.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedLaunchState>;
        if (saved.token) setToken({ ...EMPTY_TOKEN, ...saved.token, logoPreview: null, logoName: null });
        if (typeof saved.step === "string" && STEPS.some(({ key }) => key === saved.step)) setStep(saved.step as LaunchStep);
        if (typeof saved.quote === "string") setQuote(saved.quote);
        if (typeof saved.devBuy === "string") setDevBuy(saved.devBuy);
        if (saved.lockMode === "feesOnly" || saved.lockMode === "vest12Months") setLockMode(saved.lockMode);
      }
    } catch {
      // Ignore malformed or unavailable storage and start a fresh draft.
    } finally {
      setDraftHydrated(true);
    }
  }, [storageKey]);

  // Set once the coin exists on chain: from then on this wizard is a receipt, not a
  // draft, and must not be written back for /create to reopen.
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!draftHydrated || launchedRef.current) return;
    const saved: PersistedLaunchState = {
      step,
      token: { ...token, logoPreview: null, logoName: null },
      quote,
      devBuy,
      lockMode,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // Draft state remains usable in memory when storage is unavailable.
    }
  }, [draftHydrated, devBuy, lockMode, quote, step, storageKey, token]);

  /**
   * WHICH CHAIN THIS LAUNCH DEPLOYS TO — chosen in step 1, not inherited.
   *
   * This was `networkSlug ?? DEFAULT_CHAIN_SLUG`: the page's chain, shown
   * nowhere in the flow and changeable only by leaving it. `+ Create` opens
   * over whatever market the creator was looking at, so the target was a
   * side effect of where they happened to be.
   *
   * The page's chain is still the default, so every existing `/create?chain=`
   * link and the launch e2e specs open exactly where they did. `launchChains`
   * is the list the picker offers, and `defaultLaunchChain` falls back when the
   * page is on a chain with no generator — otherwise the flow would open on a
   * target that cannot submit.
   *
   * Everything per-chain downstream already keys off this: the effect below
   * re-reads `quoteOptions`/`terms` and re-selects the quote, and
   * `execution.submit` resolves the chain id from it and switches the wallet.
   */
  const chains = useMemo(() => launchChains(), []);
  const [launchChain, setLaunchChain] = useState(() =>
    defaultLaunchChain(networkSlug ?? DEFAULT_CHAIN_SLUG, chains),
  );
  const chainName = launchChain;

  useEffect(() => {
    let live = true;
    void Promise.all([execution.quoteOptions(chainName), execution.terms(chainName)]).then(([opts, t]) => {
      if (!live) return;
      setOptions(opts);
      // Only quotes that can price a fixed 1B launch are offered (see MarketStep).
      const usable = opts.filter((o) => clearsListingFloor(o));
      setTerms(t);
      // Preselect the first enabled quote so step 2 opens on a valid choice.
      setQuote((current) =>
        usable.some((o) => o.address === current) ? current : (usable[0]?.address ?? ""),
      );
    });
    return () => {
      live = false;
    };
  }, [execution, chainName]);

  // Object URLs are per-document and leak if not revoked.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const draft: LaunchDraft = useMemo(
    () => ({ token, market: { quote, devBuy, lockMode } }),
    [token, quote, devBuy, lockMode],
  );
  const chosen = options.find((o) => o.address === quote) ?? null;
  // The starting price the preview card shows: the contract's, from the
  // starting market cap and THIS supply — never a number the creator typed.
  const startPrice = chosen ? devBuyView(chosen, LAUNCH_SUPPLY_TEXT, devBuy).price : 0;

  const patchToken = useCallback((patch: Partial<TokenDraft>) => {
    setToken((t) => ({ ...t, ...patch }));
  }, []);

  const pickLogo = useCallback((file: File | null) => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    if (!file) {
      setLogoFile(null);
      setToken((t) => ({ ...t, logoPreview: null, logoName: null }));
      return;
    }
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setLogoFile(file);
    setToken((t) => ({ ...t, logoPreview: url, logoName: file.name }));
  }, []);

  const restart = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setToken(EMPTY_TOKEN);
    setLogoFile(null);
    setTouched(false);
    setDevBuy("");
    setLockMode(null);
    setStep("token");
    launchedRef.current = false;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage.
    }
  };

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const symbol = token.symbol.trim().toUpperCase() || "TOKEN";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-[22px] pb-24 pt-12 text-[var(--m-text-primary)]">
      {/* Form left, the thing being made right. Every field on this wizard is
          permanent — `Coin` has no owner — so the artefact is rendered
          alongside rather than revealed on the success screen, by which point
          knowing costs a deploy. */}
      <div className="grid items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {/* Under the rail's breakpoint the preview leads the column instead
              of being dropped: most launches happen on a phone, which is the
              worst place to lose the only view of what is being signed for. */}
          <LaunchPreviewCard
            compact
            token={token}
            quote={chosen}
            startPrice={startPrice}
            networkSlug={networkSlug}
            className="mb-4 min-[1100px]:hidden"
          />

          <Stepper
            className="mb-5 flex"
            label="Launch a coin"
            steps={STEPS}
            activeIndex={stepIdx}
          />

          <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          layout
          initial={{ opacity: 0, y: 16, scale: 0.992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.996 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.32 } }}
          className="will-change-transform motion-reduce:transform-none"
        >
          {step === "token" && (
            <TokenStep
              draft={token}
              onChange={patchToken}
              onLogoPick={pickLogo}
              showErrors={touched}
              chains={chains}
              chain={launchChain}
              onChainChange={setLaunchChain}
              onContinue={() => {
                setTouched(true);
                if (Object.keys(validateToken(token)).length === 0) setStep("market");
              }}
            />
          )}

          {step === "market" && (
            <MarketStep
              token={token}
              quote={quote}
              options={options}
              devBuy={devBuy}
              onDevBuyChange={setDevBuy}
              onChange={setQuote}
              onBack={() => setStep("token")}
              onContinue={() => chosen && setStep("confirm")}
              launchReady={ladderLaunchReady(chainName)}
            />
          )}

          {step === "confirm" && chosen && (
            <LaunchConfirm
              draft={draft}
              onLockMode={setLockMode}
              quoteOption={chosen}
              terms={terms}
              logoFile={logoFile}
              execution={execution}
              networkName={chainName}
              isConnected={isConnected}
              onConnect={() => open()}
              onBack={() => setStep("market")}
              onRestart={restart}
              onLaunched={() => {
                launchedRef.current = true;
                try {
                  window.localStorage.removeItem(storageKey);
                } catch {
                  // Unavailable storage holds no draft to clear.
                }
              }}
              onExplore={(receipt) =>
                router.push(
                  buildPageUrl("trade", {
                    slug: networkSlug,
                    pro: true,
                    // The coin just deployed and its quote, by address: another
                    // launch may already hold this ticker.
                    base: marketParam({ id: receipt.coinAddress, symbol }),
                    quote: marketParam({ id: chosen.address, symbol: chosen.symbol }),
                  }),
                )
              }
            />
          )}
          </motion.div>
          </AnimatePresence>
        </div>

        <aside className="sticky top-6 hidden min-[1100px]:block">
          <LaunchPreviewCard token={token} quote={chosen} startPrice={startPrice} networkSlug={networkSlug} />
        </aside>
      </div>
    </div>
  );
}
