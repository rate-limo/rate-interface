"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { toast } from "sonner";
import { erc20Abi } from "viem";
import { wagmiChains } from "@/lib/customChains";
import { CLAIM_FAILURE_COPY, verifyDeposit } from "@iter/types";
import { reportTransfer } from "@/lib/transfer/report";

/**
 * "I already sent it" — the way a QR deposit reaches the transfer list.
 *
 * A deposit made by scanning the QR happens entirely outside this app, so
 * nothing records it. Rather than leave the list quietly wrong, this takes the
 * transaction hash and reads the receipt from the chain: did it succeed, and
 * did it move value to this wallet? See `lib/transfer/claim` for why that is
 * stronger than having the app report a deposit to a service.
 *
 * Claiming changes no balances and moves nothing. It only writes the row that
 * the app could not observe — which is why a failed check is worded as "we
 * could not find it", never as a rejected deposit.
 */
export function ClaimDeposit() {
  const { address } = useAccount();
  const config = useConfig();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const wellFormed = /^0x[0-9a-fA-F]{64}$/.test(hash.trim());


  const claim = async () => {
    if (!address) return;
    setBusy(true);
    setProblem(null);
    const trimmed = hash.trim() as `0x${string}`;
    // Remembered so the failure can name what it found, rather than reporting
    // the generic "not on any network" after having located the transaction.
    let unidentified: string | null = null;
    try {
      /*
       * SEARCH every served chain rather than asking which one.
       *
       * The page used to require a network first, which is backwards twice
       * over: a transaction hash is effectively unique across chains, so the
       * answer identifies the network by itself — and the person pasting one
       * has it precisely because they do NOT have the app's state. Asking them
       * to name a chain to find a transfer they already made turned a lookup
       * into a quiz.
       *
       * Sequential, not parallel: it stops at the first hit, which for the
       * common case is one request, and a miss on a chain costs nothing but a
       * 404 from an RPC that was going to be idle anyway.
       */
      for (const candidate of wagmiChains) {
        const client = getPublicClient(config, { chainId: candidate.id });
        if (!client) continue;
        // Belt AND braces around one chain's turn. Every read below is already
        // guarded individually, but this walks chains a user has no control
        // over, and one RPC behaving oddly must never be able to take the page
        // down with a runtime overlay — it should cost that chain's turn and
        // nothing more.
        try {
        let tx;
        let receipt;
        try {
          tx = await client.getTransaction({ hash: trimmed });
          receipt = await client.getTransactionReceipt({ hash: trimmed });
        } catch {
          // Not on this chain, or its RPC would not answer. Either way, keep
          // looking — a chain that cannot be reached must not decide the result.
          continue;
        }

        const result = verifyDeposit(
          { to: tx.to, value: tx.value },
          { status: receipt.status, logs: receipt.logs },
          address,
        );
        if (!result.ok) {
          // FOUND, and it is not a deposit to this wallet. That is a definite
          // answer, so stop rather than reporting "not found" after checking
          // every other chain for a hash we have already located.
          setProblem(CLAIM_FAILURE_COPY[result.reason]);
          return;
        }

        /*
         * Decimals and symbol come from the TOKEN for an ERC-20 — formatting a
         * six-decimal amount with the chain's eighteen is the 10^12 error this
         * app has been bitten by before.
         *
         * But the address in a Transfer-shaped log is not necessarily a token.
         * A real receipt on Arc carried one from `0x…fffe`, a system predeploy,
         * whose `symbol()` returns `0x` — and the unguarded read threw, taking
         * the whole page down with a runtime overlay rather than reporting
         * anything about the transfer.
         *
         * A contract that will not identify itself is therefore not treated as
         * an error: it is treated as NOT A TOKEN, and the search moves on. That
         * is the honest reading — without decimals there is no way to render an
         * amount, and inventing eighteen would state a number that is wrong by
         * whatever the real figure is.
         */
        let symbol: string = candidate.nativeCurrency.symbol;
        let decimals: number = candidate.nativeCurrency.decimals;
        if (result.kind === "erc20") {
          const identified = await Promise.all([
            client
              .readContract({ abi: erc20Abi, address: result.token as `0x${string}`, functionName: "symbol" })
              .catch(() => null),
            client
              .readContract({ abi: erc20Abi, address: result.token as `0x${string}`, functionName: "decimals" })
              .catch(() => null),
          ]);
          const [s, d] = identified;
          if (d === null) {
            // Keep looking on the next chain rather than recording an amount
            // whose scale is unknown.
            unidentified = result.token;
            continue;
          }
          symbol = typeof s === "string" && s.trim() ? s : "";
          decimals = Number(d);
        }

        // Reported as well as recorded: a claim is exactly the case the local
        // log cannot serve, since the whole point is that this browser was not
        // present for the transfer.
        reportTransfer({
          hash: trimmed,
          kind: "deposit",
          chainId: candidate.id,
          account: address,
          symbol,
          amount: formatUnits(result.amount, decimals),
          peer: result.kind === "native" ? null : result.token,
        });
        setHash("");
        toast.success(`Added ${formatUnits(result.amount, decimals)} ${symbol}`, {
          description: `Found on ${candidate.name}. It is in your transfer list now.`,
        });
        return;
        } catch {
          // Whatever went wrong on this chain, try the next one.
          continue;
        }
      }

      setProblem(
        unidentified
          ? `That transfer came from ${unidentified.slice(0, 8)}…, which does not identify itself as a token, so its amount cannot be read.`
          : "No transaction with that hash on any network Iter serves.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
      <h2 className="text-sm font-semibold text-[color:var(--m-text-primary)]">
        Already sent it?
      </h2>
      <p className="mt-1 text-[12px] leading-5 text-[color:var(--m-text-secondary)]">
        A transfer you sent by scanning the QR happens outside Iter, so nothing here sees it
        arrive. Paste its transaction hash — the network is worked out from it — and it will
        be checked on chain and added to your list. This moves no funds; the transfer already
        happened.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={hash}
          onChange={(event) => {
            setHash(event.target.value);
            setProblem(null);
          }}
          spellCheck={false}
          placeholder="0x… transaction hash"
          aria-label="Transaction hash"
          className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-3 py-2 font-dm-mono text-[12px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] focus:border-[color:var(--m-primary)]"
        />
        <button
          type="button"
          disabled={!wellFormed || busy || !address}
          onClick={() => void claim()}
          className="rounded-xl bg-[color:var(--m-primary)] px-4 py-2 text-[13px] font-bold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking every network…" : "Find this transfer"}
        </button>
        {/* Said as soon as it is knowable. A hash is 66 characters and a
            truncated paste looks almost right — the same mistake the withdraw
            address field warns about. */}
        {hash.trim().length > 0 && !wellFormed && (
          <p className="text-[11.5px] text-[color:var(--m-text-secondary)]">
            A transaction hash is 66 characters, starting with 0x.
          </p>
        )}
        {problem && <p className="text-[11.5px] text-[color:var(--m-error-fg)]">{problem}</p>}
      </div>
    </section>
  );
}
