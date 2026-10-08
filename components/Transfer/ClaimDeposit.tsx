"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { toast } from "sonner";
import { erc20Abi } from "viem";
import { createPublicClient, http } from "viem";
import { wagmiChains } from "@/lib/customChains";
import { sdkChains } from "@/lib/transfer/sourceBalances";
import { CLAIM_FAILURE_COPY, depositCredits, verifyDeposit } from "@iter/types";
import { reportTransfer } from "@/lib/transfer/report";
import { findByHash, readLog } from "@/lib/transfer/history";

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
/**
 * Every chain a pasted hash could plausibly be on, served chains first.
 *
 * ## Why this is not just `wagmiChains`
 *
 * It was, and that made the bridge's own deposits unfindable. `wagmiChains` is
 * the two networks Rate SETTLES on; a CCTP deposit starts on one of two dozen
 * others. Someone who bridged from Arbitrum Sepolia and pasted the hash their
 * wallet gave them was told "no transaction with that hash on any network Rate
 * serves" — true, and useless, because the transaction was on a network Rate
 * bridges FROM and had never looked at.
 *
 * ## Served chains first, and the order is load-bearing
 *
 * A deposit that has fully landed has a mint on a served chain, and that is the
 * row worth writing — it credits the account, so `verifyDeposit` passes and the
 * transfer list gains a real entry. Reaching the source chain first would find
 * the burn instead and stop there, reporting the send when the arrival was
 * available. The loop stops at the first definite answer, so the order decides
 * which answer that is.
 *
 * ## Source chains get their own client
 *
 * wagmi has no client for a chain outside its config, so these are built ad hoc
 * from the SDK's own published endpoints — the same ones `useSourceBalances`
 * reads balances over.
 */
interface ClaimCandidate {
  id: number;
  name: string;
  nativeCurrency: { symbol: string; decimals: number };
  client: ReturnType<typeof getPublicClient> | ReturnType<typeof createPublicClient>;
  /** True for a network Rate settles on; false for one it only bridges from. */
  served: boolean;
}

function searchOrder(config: ReturnType<typeof useConfig>): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];
  for (const chain of wagmiChains) {
    out.push({
      id: chain.id,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      client: getPublicClient(config, { chainId: chain.id }),
      served: true,
    });
  }
  for (const chain of sdkChains().values()) {
    // A served chain that is also a CCTP chain is already above, with the
    // configured client. Adding it twice would search it twice.
    if (out.some((c) => c.id === chain.chainId)) continue;
    out.push({
      id: chain.chainId,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      client: createPublicClient({ transport: http(chain.rpcEndpoints[0]) }),
      served: false,
    });
  }
  return out;
}

export function ClaimDeposit() {
  const { address } = useAccount();
  const config = useConfig();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const wellFormed = /^0x[0-9a-fA-F]{64}$/.test(hash.trim());


  const claim = async () => {
    if (!address) return;
    const trimmed = hash.trim() as `0x${string}`;

    /*
     * ALREADY CLAIMED — answered before any chain is read.
     *
     * `record()` keys on the hash, so claiming the same one twice replaces the
     * row instead of duplicating it. That is right for the log and silent for
     * the person: the search ran over every network again and raised the same
     * "Added 0.05 USDC" as the first time, so a second paste of a hash already
     * in the list was indistinguishable from a first.
     *
     * Before `setBusy`, because localStorage answers instantly and "Checking
     * every network…" for something already known is a delay invented to fill
     * a state that has an immediate answer.
     *
     * The log is per BROWSER: this means "already in this browser's list", not
     * "already known to the service". A row reported from another device is not
     * visible here and re-claiming it is harmless — the chain is re-read and
     * the same row rewritten — so absence is never proof it was not reported.
     */
    const already = findByHash(readLog(), trimmed);
    if (already) {
      setHash("");
      setProblem(null);
      toast.info(`Already in your list`, {
        description: `${already.amount} ${already.symbol} from this transaction was added earlier. Nothing to do.`,
      });
      return;
    }

    setBusy(true);
    setProblem(null);
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
      for (const candidate of searchOrder(config)) {
        const client = candidate.client;
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
          /*
           * FOUND, and it is not a deposit to this wallet. A definite answer, so
           * stop rather than reporting "not found" after checking every other
           * chain for a hash we have already located.
           *
           * On a BRIDGE SOURCE chain that answer needs different words. A CCTP
           * deposit is two transactions: a burn on the source and a mint on the
           * destination. The hash a user has to hand is usually the burn — it is
           * the one their wallet showed them — and a burn credits nobody, so the
           * generic "this did not move funds to your wallet" reads as though
           * their money went nowhere. It went exactly where it should; the row
           * they are looking for is keyed on the other half.
           */
          setProblem(
            candidate.served
              ? CLAIM_FAILURE_COPY[result.reason]
              : `That is the send on ${candidate.name}, not the arrival. A bridged deposit lands in a second transaction on the network you are depositing to — paste that hash instead, or let the bridge record it for you.`,
          );
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
        /*
         * WHICH credit — a receipt can carry several for one movement.
         *
         * Measured on Arc, `0x66b081…`: a 0.05 USDC deposit emits two Transfer
         * logs, the canonical USDC at `0x3600…0000` (6 decimals) and the system
         * predeploy at `0xff…fe`, the 18-decimal gas view of the same funds.
         * Taking the receipt's first log took the predeploy, which does not
         * answer `symbol()` — so the row was written with an empty symbol and
         * the list rendered "Received 0.05 —".
         *
         * The contract that answers `symbol()` and `decimals()` is the token,
         * so that is the test. A credit that identifies itself as nothing falls
         * back to the CHAIN's own asset rather than to an empty string: on Arc
         * that unidentified emitter IS native USDC, so the chain describes it
         * exactly.
         */
        const credits = depositCredits(
          { to: tx.to, from: tx.from, value: tx.value },
          { status: receipt.status, logs: receipt.logs },
          address,
        );
        let symbol: string = candidate.nativeCurrency.symbol;
        let decimals: number = candidate.nativeCurrency.decimals;
        let amount = result.amount;
        let tokenAddress: string | null = result.kind === "erc20" ? result.token : null;
        for (const credit of credits) {
          if (credit.kind !== "erc20") continue;
          const [s, d] = await Promise.all([
            client
              .readContract({ abi: erc20Abi, address: credit.token as `0x${string}`, functionName: "symbol" })
              .catch(() => null),
            client
              .readContract({ abi: erc20Abi, address: credit.token as `0x${string}`, functionName: "decimals" })
              .catch(() => null),
          ]);
          if (d === null || typeof s !== "string" || !s.trim()) {
            // Remembered only in case NOTHING here identifies itself, so the
            // failure can name what it found instead of "not on any network".
            unidentified = credit.token;
            continue;
          }
          symbol = s;
          decimals = Number(d);
          amount = credit.amount;
          tokenAddress = credit.token;
          unidentified = null;
          break;
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
          amount: formatUnits(amount, decimals),
          peer: tokenAddress,
        });
        setHash("");
        toast.success(`Added ${formatUnits(amount, decimals)} ${symbol}`, {
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
          : "No transaction with that hash on any network Rate serves, or any network it bridges from.",
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
        A transfer you sent by scanning the QR happens outside Rate, so nothing here sees it
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
