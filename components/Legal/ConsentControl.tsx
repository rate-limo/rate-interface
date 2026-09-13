"use client";

import { useConsent } from "@/lib/consent/store";

/**
 * The "change your mind" control on /cookies.
 *
 * A consent banner that can only be answered once isn't consent — withdrawal has
 * to be as easy as granting. This reads the live decision and lets it be flipped
 * either way, taking effect immediately: AnalyticsGate is subscribed to the same
 * store, so rejecting here unmounts the scripts without a reload.
 */
export function ConsentControl() {
  const { record, ready, accept, reject } = useConsent();

  // Same hydration rule as the banner: nothing until the client has read storage.
  if (!ready) {
    return (
      <div
        aria-hidden
        className="h-[104px] rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]"
      />
    );
  }

  const status = record?.status ?? null;
  const label =
    status === "accepted"
      ? "Analytics are on."
      : status === "rejected"
        ? "Analytics are off."
        : "You haven't chosen yet — analytics are off.";

  return (
    <div className="rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden
          className={
            status === "accepted"
              ? "h-2 w-2 rounded-full bg-[color:var(--m-success)]"
              : "h-2 w-2 rounded-full bg-[color:var(--m-text-secondary-2)]"
          }
        />
        <p className="text-[14.5px] font-semibold">{label}</p>
      </div>

      {record?.at && (
        <p className="mt-1 font-dm-mono text-[11.5px] text-[color:var(--m-text-secondary-2)]">
          Choice recorded {new Date(record.at).toLocaleDateString()}
        </p>
      )}

      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reject}
          disabled={status === "rejected"}
          className="flex-1 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--m-text-primary)] hover:border-[color:var(--m-primary)] disabled:cursor-default disabled:opacity-45"
        >
          Turn analytics off
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={status === "accepted"}
          className="flex-1 rounded-xl bg-[color:var(--m-primary)] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[color:var(--m-primary-hover)] disabled:cursor-default disabled:opacity-45"
        >
          Turn analytics on
        </button>
      </div>
    </div>
  );
}
