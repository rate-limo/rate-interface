"use client";

/**
 * Step 1 — the token itself.
 *
 * name/symbol/decimals/supply are the ERC-20 constructor and are permanent once
 * deployed. Logo, description and links are NOT onchain: they're written to
 * adminTokenMeta (packages/db/src/schema/adminTokenMeta), which the gateway
 * merges over the broker's row — see mergeTokenMeta in apps/gateway/src/api/
 * tokens.ts. That table is documented as writable before the token has a
 * spotTokens row, which is exactly the launch case, so these fields are
 * editable after launch while the constructor fields are not.
 */

import { useRef, useState } from "react";
import { TokenImageIcon } from "@/components/Atoms/TokenImageIcon";
import { COIN_DECIMALS, fmtCompact, isSymbolTaken, parseAmount, validateToken } from "@/lib/launch/mock";
import type { TokenDraft } from "@/lib/launch/types";
import {
  Callout,
  Field,
  FieldError,
  Lbl,
  Panel,
  PrimaryButton,
} from "./parts";
import { LogoCropper } from "./LogoCropper";

/** Matches MAX_UPLOAD_BYTES in apps/admin-service/src/logos.ts. The server
 * enforces it again — this is only so the user finds out before the upload. */
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_CROP_SOURCE_BYTES = 20 * 1024 * 1024;

/** Facts read straight off `Coin` in contracts/src/asset/AssetGenerator.sol,
 * whose own docstring notes the UI states them. Change the contract, change these. */
const CONTRACT_FACTS = [
  { t: "Supply", v: "Fixed at deploy" },
  { t: "Mint", v: "No function" },
  { t: "Owner", v: "None" },
];

export function TokenStep({
  draft,
  onChange,
  onLogoPick,
  onContinue,
  showErrors,
}: {
  draft: TokenDraft;
  onChange: (patch: Partial<TokenDraft>) => void;
  onLogoPick: (file: File | null) => void;
  onContinue: () => void;
  showErrors: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const errors = validateToken(draft);
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const symbol = draft.symbol.trim().toUpperCase();
  const supply = parseAmount(draft.totalSupply);
  const taken = symbol.length >= 2 && isSymbolTaken(symbol);

  // A rejected file used to be dropped silently, which reads as a broken control:
  // the user picks a 2 MB image and simply nothing happens. The server returns a
  // good 413 for this, but the client never gets that far — so say it here.
  const pickFile = (file: File | null) => {
    if (!file) {
      setLogoError(null);
      onLogoPick(null);
      return;
    }
    if (file.size > MAX_CROP_SOURCE_BYTES) {
      setLogoError(
        `That source image is ${Math.ceil(file.size / 1024 / 1024)} MB. Choose one under 20 MB.`,
      );
      onLogoPick(null);
      return;
    }
    setLogoError(null);
    setCropSource(file);
  };

  return (
    <Panel
      className="mx-auto max-w-[1120px]"
      title="Create a token"
    >
      <div className="grid gap-x-5 md:grid-cols-2">
        <div className="min-w-0">
      {/* logo */}
      <div className="flex items-center gap-3.5 rounded-xl border border-[var(--m-border)] bg-[var(--m-surface-2)] px-3.5 py-3">
        <TokenImageIcon
          symbol={symbol || "?"}
          color="var(--m-logo)"
          logoURI={draft.logoPreview ?? undefined}
          size="lg"
          className="h-11 w-11 text-[13px]"
        />
        <span className="min-w-0 flex-1 text-[13px] text-[var(--m-text-secondary-2)]">
          {draft.logoName ?? "PNG, JPEG or WebP · crop and resize automatically"}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 font-mono text-xs font-medium text-[var(--m-primary-fg)] hover:underline"
        >
          {draft.logoPreview ? "Replace" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          // Kept in step with ALLOWED_INPUT_FORMATS in apps/admin-service/src/
          // logos.ts. SVG is deliberately absent there — it would mean handing
          // untrusted XML to the renderer inside libvips for no visible gain,
          // since everything is stored as a 256px WebP either way.
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          aria-label="Token logo"
          onChange={(e) => {
            pickFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>
      <FieldError>{logoError ?? undefined}</FieldError>

      {cropSource && (
        <LogoCropper
          file={cropSource}
          onCancel={() => setCropSource(null)}
          onApply={(cropped) => {
            if (cropped.size > MAX_LOGO_BYTES) {
              setLogoError(`The cropped image is still over ${MAX_LOGO_BYTES / 1024} KB.`);
              return;
            }
            setLogoError(null);
            setCropSource(null);
            onLogoPick(cropped);
          }}
        />
      )}

      <Lbl className="mt-3.5">Identity</Lbl>
      <Field
        ariaLabel="Token name"
        dataTestId="launch-name"
        value={draft.name}
        onChange={(v) => onChange({ name: v })}
        placeholder="Moonlight"
        suffix="name"
        maxLength={40}
        invalid={Boolean(err("name"))}
      />
      <FieldError>{err("name")}</FieldError>

      <div className="mt-1.5">
        <Field
          ariaLabel="Token symbol"
          dataTestId="launch-symbol"
          value={draft.symbol}
          onChange={(v) => onChange({ symbol: v.toUpperCase() })}
          placeholder="MOON"
          suffix="symbol"
          mono
          maxLength={11}
          invalid={Boolean(err("symbol"))}
        />
        <FieldError>{err("symbol")}</FieldError>
      </div>
      {/* Decimals used to be an input. `Coin`'s constructor takes none, so every
          launched coin is the OpenZeppelin ERC-20 default — offering a control
          for it would have been a field the contract silently ignores. */}
      <p className="mt-1 font-mono text-[11px] text-[var(--m-text-secondary-2)]">
        {COIN_DECIMALS} decimals · fixed by the contract
      </p>

      <Lbl>Total supply</Lbl>
      <Field
        ariaLabel="Total supply"
        dataTestId="launch-supply"
        value={draft.totalSupply}
        onChange={(v) => onChange({ totalSupply: v })}
        inputMode="decimal"
        suffix={symbol || "tokens"}
        big
        invalid={Boolean(err("totalSupply"))}
      />
      <FieldError>{err("totalSupply")}</FieldError>
      {supply > 0 && !errors.totalSupply && (
        <p className="mt-1 font-mono text-[11px] text-[var(--m-text-secondary-2)]">
          {fmtCompact(supply)} {symbol || "tokens"} · minted once, at deploy
        </p>
      )}

        </div>
        <div className="min-w-0">

      <Lbl>
        Description &amp; links{" "}
        <span className="normal-case tracking-normal">— optional, off-chain, editable later</span>
      </Lbl>
      <Field
        ariaLabel="Description"
        value={draft.description}
        onChange={(v) => onChange({ description: v })}
        placeholder="What is this token for?"
        maxLength={300}
        invalid={Boolean(err("description"))}
      />
      <FieldError>{err("description")}</FieldError>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <Field
          ariaLabel="X profile"
          value={draft.x}
          onChange={(v) => onChange({ x: v })}
          placeholder="x.com/…"
          mono
        />
        <Field
          ariaLabel="Website"
          value={draft.website}
          onChange={(v) => onChange({ website: v })}
          placeholder="website"
          mono
        />
      </div>

      <Lbl>What this contract can and can&apos;t do</Lbl>
      <div className="grid grid-cols-3 gap-2">
        {CONTRACT_FACTS.map((f) => (
          <div
            key={f.t}
            className="rounded-[11px] border border-[color-mix(in_srgb,var(--m-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--m-success)_8%,transparent)] px-2.5 py-2"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--m-success)]">
              {f.t}
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold">{f.v}</div>
          </div>
        ))}
      </div>

      {taken && (
        <Callout tone="gold">
          <b className="font-semibold">{symbol} is already trading here.</b> Addresses are the real
          identity, so this still deploys — but two markets sharing a ticker is a trap for anyone
          reading a list.
        </Callout>
      )}

      <Callout tone="warn">
        <b className="font-semibold">A deployed contract can&apos;t be edited.</b> Symbol, supply and
        decimals are permanent. The logo, description and links are not.
      </Callout>

      <PrimaryButton dataTestId="launch-submit" onClick={onContinue}>Continue to market</PrimaryButton>
        </div>
      </div>
    </Panel>
  );
}

/** Exported for the flow's stepper guard. */
export function tokenStepValid(draft: TokenDraft): boolean {
  return Object.keys(validateToken(draft)).length === 0;
}
