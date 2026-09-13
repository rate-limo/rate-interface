"use client";

/**
 * Iter token launch — three steps with a stepper:
 *   1 · Token   — metadata + the fields `Coin`'s constructor takes
 *   2 · Market  — pick one of the generator's enabled quote tokens
 *   3 · Confirm — typed gate → deploy + list, one transaction
 *
 * Modelled on contracts/src/asset/AssetGenerator.sol. There used to be a
 * fourth "Seed" step that set a single-sided range over the new supply. It has
 * been removed: `launch()` deploys the coin, calls `addPair`, and forwards the
 * remaining supply to the creator. It places no orders and opens no position,
 * so the step described something that never happened.
 *
 * Distinct from `/pool/new`, whose "Launch a pool" mode opens a pool for tokens
 * that already exist. Execution is mock behind lib/launch/* (LaunchExecution).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useWalletConnect } from "@/lib/wallet";
import { buildPageUrl, DEFAULT_CHAIN_SLUG } from "@/lib/routing/chainParams";
import { fmtPriceInput, validateToken } from "@/lib/launch/mock";
import { launchExecution } from "@/lib/launch/execution";
import type {
  LaunchDraft,
  LaunchExecution,
  LaunchLiquidityDraft,
  LaunchProfile,
  LaunchStep,
  LaunchTerms,
  QuoteOption,
  TokenDraft,
} from "@/lib/launch/types";
import { Stepper } from "@components/Atoms/Stepper";
import { TokenStep } from "./TokenStep";
import { MarketStep } from "./MarketStep";
import { LaunchConfirm } from "./LaunchConfirm";
import { RiskPresetStep } from "./RiskPresetStep";
import { LaunchLiquidityStep } from "./LaunchLiquidityStep";

const STEPS: { key: LaunchStep; label: string }[] = [
  { key: "token", label: "Token" },
  { key: "market", label: "Market" },
  { key: "volatility", label: "Volatility" },
  { key: "fee", label: "Fee" },
  { key: "liquidity", label: "Liquidity" },
  { key: "confirm", label: "Confirm" },
];

const EMPTY_TOKEN: TokenDraft = {
  name: "",
  symbol: "",
  totalSupply: "1,000,000,000",
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
  listingPriceText: string;
  slippagePct: number;
  volatilityProfile: LaunchProfile | "custom";
  feePct: number;
  feeProfile: LaunchProfile | "custom";
  liquidity: LaunchLiquidityDraft | null;
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
  const [listingPriceText, setListingPriceText] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [slippagePct, setSlippagePct] = useState(0.1);
  const [volatilityProfile, setVolatilityProfile] = useState<LaunchProfile | "custom">("standard");
  const [feePct, setFeePct] = useState(0.1);
  const [feeProfile, setFeeProfile] = useState<LaunchProfile | "custom">("standard");
  const [liquidity, setLiquidity] = useState<LaunchLiquidityDraft | null>(null);
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
        if (typeof saved.listingPriceText === "string") setListingPriceText(saved.listingPriceText);
        if (typeof saved.slippagePct === "number") setSlippagePct(saved.slippagePct);
        if (saved.volatilityProfile) setVolatilityProfile(saved.volatilityProfile);
        if (typeof saved.feePct === "number") setFeePct(saved.feePct);
        if (saved.feeProfile) setFeeProfile(saved.feeProfile);
        if (saved.liquidity) setLiquidity(saved.liquidity);
      }
    } catch {
      // Ignore malformed or unavailable storage and start a fresh draft.
    } finally {
      setDraftHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!draftHydrated) return;
    const saved: PersistedLaunchState = {
      step,
      token: { ...token, logoPreview: null, logoName: null },
      quote,
      listingPriceText,
      slippagePct,
      volatilityProfile,
      feePct,
      feeProfile,
      liquidity,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // Draft state remains usable in memory when storage is unavailable.
    }
  }, [draftHydrated, feePct, feeProfile, liquidity, listingPriceText, quote, slippagePct, step, storageKey, token, volatilityProfile]);

  const chainName = networkSlug ?? DEFAULT_CHAIN_SLUG;

  useEffect(() => {
    let live = true;
    void Promise.all([execution.quoteOptions(chainName), execution.terms(chainName)]).then(([opts, t]) => {
      if (!live) return;
      setOptions(opts);
      setTerms(t);
      // Preselect the first enabled quote so step 2 opens on a valid choice.
      setQuote((current) => current || (opts[0]?.address ?? ""));
      setListingPriceText((current) => current || fmtPriceInput(opts[0]?.listingPrice ?? 0));
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

  const draft: LaunchDraft = useMemo(() => ({
    token,
    market: { quote, listingPrice: Number(listingPriceText) || 0 },
    risk: { volatilityProfile, slippagePct, feeProfile, feePct },
    liquidity,
    payment: { asset: "ETH" },
  }), [token, quote, listingPriceText, volatilityProfile, slippagePct, feeProfile, feePct, liquidity]);
  const chosenOption = options.find((o) => o.address === quote) ?? null;
  const chosen = chosenOption
    ? { ...chosenOption, listingPrice: Number(listingPriceText) || 0 }
    : null;

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
    setListingPriceText("");
    setSlippagePct(0.1);
    setVolatilityProfile("standard");
    setFeePct(0.1);
    setFeeProfile("standard");
    setLiquidity(null);
    setStep("token");
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage.
    }
  };

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const symbol = token.symbol.trim().toUpperCase() || "TOKEN";

  return (
    <div className="mx-auto w-full max-w-[1120px] px-[22px] pb-24 pt-12 text-[var(--m-text-primary)]">
      <Stepper
        className="mb-5 flex justify-center"
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
              listingPrice={listingPriceText}
              onPriceChange={setListingPriceText}
              onChange={(nextQuote) => {
                setQuote(nextQuote);
                const nextOption = options.find((option) => option.address === nextQuote);
                setListingPriceText(fmtPriceInput(nextOption?.listingPrice ?? 0));
              }}
              onBack={() => setStep("token")}
              onContinue={() => chosen && setStep("volatility")}
            />
          )}

          {step === "volatility" && (
            <RiskPresetStep
              kind="volatility"
              value={slippagePct}
              profile={volatilityProfile}
              onChange={(next, nextProfile) => {
                setSlippagePct(next);
                setVolatilityProfile(nextProfile);
              }}
              onBack={() => setStep("market")}
              onContinue={() => setStep("fee")}
            />
          )}

          {step === "fee" && (
            <RiskPresetStep
              kind="fee"
              value={feePct}
              profile={feeProfile}
              onChange={(next, nextProfile) => {
                setFeePct(next);
                setFeeProfile(nextProfile);
              }}
              onBack={() => setStep("volatility")}
              onContinue={() => setStep("liquidity")}
            />
          )}

          {step === "liquidity" && chosen && (
            <LaunchLiquidityStep
              token={token}
              quote={chosen}
              initial={liquidity}
              onBack={() => setStep("fee")}
              onDraftChange={setLiquidity}
              onContinue={(next) => {
                setLiquidity(next);
                setStep("confirm");
              }}
            />
          )}

          {step === "confirm" && chosen && (
            <LaunchConfirm
              draft={draft}
              quoteOption={chosen}
              terms={terms}
              logoFile={logoFile}
              execution={execution}
              networkName={chainName}
              isConnected={isConnected}
              onConnect={() => open()}
              onBack={() => setStep("liquidity")}
              onRestart={restart}
              onExplore={() =>
                router.push(
                  buildPageUrl("trade", {
                    slug: networkSlug,
                    pro: true,
                    base: symbol,
                    quote: chosen.symbol,
                  }),
                )
              }
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
