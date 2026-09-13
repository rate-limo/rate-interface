"use client";

/**
 * The delete control on /delete-account.
 *
 * Split from the page for the same reason ConsentControl is: the page around it is
 * static legal text that should stay a server component, and only this part needs a
 * wallet.
 *
 * ## The signature IS the confirmation
 *
 * No "type DELETE to confirm" box. The wallet prompt is already an explicit,
 * unmistakable, cancellable confirmation step that the user cannot click through by
 * accident — and it is the only one that also proves they own the address. Stacking
 * a typed confirmation on top of it teaches people to bulldoze both.
 */

import { useCallback, useState } from "react";
import { useSignMessage } from "wagmi";
import { deleteProfile } from "@/lib/profile/deleteProfile";
import { useWalletAccount, useWalletConnect } from "@/lib/wallet";
import { cn } from "@/lib/utils";

type State =
  | { k: "idle" }
  | { k: "working" }
  | { k: "done"; existed: boolean }
  | { k: "error"; message: string };

export function DeleteProfileControl() {
  const { address, isConnected } = useWalletAccount();
  // `open`, not `fund` — fund() jumps straight to the deposit panel, which is the
  // wrong destination for someone who came here to remove their data.
  const { open } = useWalletConnect();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<State>({ k: "idle" });

  const run = useCallback(async () => {
    if (!address) return;
    setState({ k: "working" });
    const out = await deleteProfile(address, signMessageAsync);
    if (out.ok) {
      setState({ k: "done", existed: out.existed });
      return;
    }
    // A declined signature returns to idle rather than to an error state: nothing
    // was attempted, so presenting it as a failure would be a lie the user then has
    // to interpret.
    setState(out.declined ? { k: "idle" } : { k: "error", message: out.message });
  }, [address, signMessageAsync]);

  if (state.k === "done") {
    return (
      <div
        role="status"
        className="rounded-xl border px-4 py-3.5"
        style={{
          borderColor: "color-mix(in srgb, var(--m-success) 45%, transparent)",
          background: "color-mix(in srgb, var(--m-success) 10%, var(--m-surface))",
        }}
      >
        <p className="m-0 text-sm text-[color:var(--m-text-primary)]">
          {state.existed ? (
            <>
              <b>Deleted.</b> Your name and handle are gone, and we will not generate new ones for
              this address.
            </>
          ) : (
            <>
              <b>Nothing to delete.</b> This address had no profile — we have recorded that it
              should not be given one.
            </>
          )}
        </p>
        <p className="m-0 mt-1.5 text-[13px] text-[color:var(--m-text-secondary)]">
          Your trading history is unaffected: it is rebuilt from the blockchain and was never ours
          to remove.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-3.5">
        <p className="m-0 mb-3 text-sm text-[color:var(--m-text-secondary)]">
          Connect the wallet whose profile you want deleted. We ask for a signature, not a
          transaction — it costs no gas and moves nothing.
        </p>
        <button
          type="button"
          onClick={open}
          className="rounded-[10px] border border-[color:var(--m-border)] px-4 py-2 text-sm font-medium text-[color:var(--m-text-primary)] transition-colors hover:border-[color:var(--m-primary)]"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-3.5">
      <p className="m-0 text-[13px] text-[color:var(--m-text-secondary)]">Deleting the profile for</p>
      <p className="m-0 mt-0.5 break-all font-mono text-[13px] font-semibold text-[color:var(--m-text-primary)]">
        {address}
      </p>

      {state.k === "error" && (
        <p
          role="alert"
          className="m-0 mt-3 text-[13px]"
          style={{ color: "var(--m-error)" }}
        >
          {state.message}
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={state.k === "working"}
        className={cn(
          "mt-3.5 rounded-[10px] px-4 py-2 text-sm font-medium text-white transition-opacity",
          state.k === "working" && "opacity-60",
        )}
        style={{ background: "var(--m-error)" }}
      >
        {state.k === "working" ? "Waiting for your signature…" : "Delete my profile"}
      </button>
    </div>
  );
}
