"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, Star, Trash2, Users } from "lucide-react";
import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { useFollowing } from "@/hooks/useFollowing";
import {
  labelFor,
  readBook,
  remove,
  shortenAddress,
  upsert,
  writeBook,
  type SavedAddress,
} from "@/lib/transfer/addressBook";

type Tab = "saved" | "following";

/**
 * Where to send, chosen instead of typed.
 *
 * ## It fills the field; it does not replace the confirmation
 *
 * Every route through here lands in the same address input and the same second
 * screen that restates the amount, the destination and the network before a
 * signature. A picked recipient is a convenience against typos and clipboard
 * swaps, never a claim that the address is safe — a saved label and a familiar
 * handle are both things an attacker can arrange.
 *
 * ## Two sources, because they answer different questions
 *
 * SAVED is where you have sent before, named by you, in this browser. FOLLOWING
 * is the social graph — deliberately the accounts you chose, not the ones who
 * chose you; see `useFollowing`. Neither is an allowlist and the tabs never
 * merge, so a name you wrote can never be confused with a name someone else
 * did.
 */
export function RecipientPicker({
  networkName,
  onPick,
  /** The address currently in the field, so the picker can offer to save it. */
  current,
}: {
  networkName: string;
  onPick: (address: string) => void;
  current?: string;
}) {
  const { address: self } = useAccount();
  const [tab, setTab] = useState<Tab>("saved");
  const [book, setBook] = useState<SavedAddress[]>([]);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);

  // Read in an effect, never during render: there is no localStorage on the
  // server, and the first client pass has to match the server's HTML.
  useEffect(() => setBook(readBook()), []);

  const { data: following = [], isLoading } = useFollowing(networkName, self);

  const commit = (next: SavedAddress[]) => {
    setBook(next);
    setStorageFailed(!writeBook(next));
  };

  const needle = query.trim().toLowerCase();
  const savedRows = useMemo(
    () =>
      book.filter(
        (e) =>
          !needle ||
          e.label.toLowerCase().includes(needle) ||
          e.address.toLowerCase().includes(needle),
      ),
    [book, needle],
  );
  const followRows = useMemo(
    () =>
      following.filter((account) => {
        // Never offer to send to yourself: the transfer costs a fee and changes
        // nothing, which the panel already refuses one screen later.
        if (self && account.address.toLowerCase() === self.toLowerCase()) return false;
        if (!needle) return true;
        return [account.displayName, account.handle, account.address].some((value) =>
          value?.toLowerCase().includes(needle),
        );
      }),
    [following, needle, self],
  );

  const canSave =
    !!current &&
    /^0x[0-9a-fA-F]{40}$/.test(current) &&
    (!self || current.toLowerCase() !== self.toLowerCase());
  const alreadySaved = canSave && labelFor(book, current) !== null;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] p-3">
      <div className="flex items-center gap-1">
        {(
          [
            ["saved", "Saved", BookMarked],
            ["following", "Following", Users],
          ] as const
        ).map(([key, text, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors",
              tab === key
                ? "bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)]"
                : "text-[color:var(--m-text-secondary)] hover:text-[color:var(--m-text-primary)]",
            )}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {text}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tab === "saved" ? "Search saved addresses" : "Search people you follow"}
        aria-label={tab === "saved" ? "Search saved addresses" : "Search people you follow"}
        className="rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] focus:border-[color:var(--m-primary)]"
      />

      <div className="flex max-h-[190px] flex-col gap-1 overflow-y-auto">
        {tab === "saved" &&
          savedRows.map((entry) => (
            <div key={entry.address} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPick(entry.address)}
                className="flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--m-surface)]"
              >
                <span className="truncate text-[12.5px] font-medium text-[color:var(--m-text-primary)]">
                  {entry.label}
                </span>
                <span className="truncate font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                  {shortenAddress(entry.address)}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${entry.label}`}
                onClick={() => commit(remove(book, entry.address))}
                className="shrink-0 rounded-lg p-1.5 text-[color:var(--m-text-secondary-2)] transition-colors hover:text-[color:var(--m-error-fg)]"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        {tab === "saved" && savedRows.length === 0 && (
          <p className="py-3 text-center text-[11.5px] text-[color:var(--m-text-secondary)]">
            {book.length === 0
              ? "Nothing saved yet. Send once, then name the address below."
              : "No saved address matches that."}
          </p>
        )}

        {tab === "following" &&
          followRows.map((account) => (
            <button
              key={account.address}
              type="button"
              onClick={() => onPick(account.address)}
              className="flex min-w-0 flex-col rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--m-surface)]"
            >
              <span className="truncate text-[12.5px] font-medium text-[color:var(--m-text-primary)]">
                {account.displayName ?? account.handle ?? shortenAddress(account.address)}
              </span>
              {/* The ADDRESS is always shown, even when a name is. A handle is
                  not an identity here — this is where the money goes. */}
              <span className="truncate font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
                {shortenAddress(account.address)}
              </span>
            </button>
          ))}
        {tab === "following" && followRows.length === 0 && (
          <p className="py-3 text-center text-[11.5px] text-[color:var(--m-text-secondary)]">
            {isLoading
              ? "Loading…"
              : following.length === 0
                ? "You are not following anyone yet."
                : "Nobody you follow matches that."}
          </p>
        )}
      </div>

      {/* Saving is offered only once the field holds a real address, so the
          control cannot promise to store something unusable. */}
      {canSave && (
        <div className="flex items-center gap-1.5 border-t border-[color:var(--m-border)] pt-2.5">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={alreadySaved ? "Rename this address" : "Name this address"}
            aria-label="Name for this address"
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-2.5 py-1.5 text-[12px] text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary-2)] focus:border-[color:var(--m-primary)]"
          />
          <button
            type="button"
            onClick={() => {
              commit(upsert(book, current, label, Date.now()));
              setLabel("");
              setTab("saved");
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[color:var(--m-text-primary)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[color:var(--m-background)]"
          >
            <Star aria-hidden className="h-3 w-3" />
            {alreadySaved ? "Rename" : "Save"}
          </button>
        </div>
      )}

      {/* A failed write is REPORTED, never swallowed: promising storage this
          browser refused is how a saved payee silently disappears. */}
      {storageFailed && (
        <p className="text-[11px] text-[color:var(--m-warning-600)]">
          This browser would not save it — the name will not survive the page.
        </p>
      )}
    </div>
  );
}
