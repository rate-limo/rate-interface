import { cn } from "@/lib/utils";
import { SOURCE_COLOR } from "@/lib/rewards/mock";

/** Explanatory notes — how points map to $OG, liquidity balance, honesty. */
export function RewardsNotes({ rate }: { rate: number }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Note wide dot="var(--m-logo)" title="Points → $OG — three streams">
        <p>
          Each <b>epoch is one week</b> and you earn <b>points</b> from three programs:{" "}
          <b>Trading</b> (your volume ÷ total volume), <b>Liquidity</b> (your{" "}
          <b>time-weighted liquidity balance</b> ÷ total liquidity — providing more, and keeping it
          in range longer, earns more), and <b>Referrals</b> (a cut of referees&rsquo; points). Your
          referral <b>tier boosts</b> both the trading and liquidity streams. Points accrue
          automatically; <b>Claim converts your points to $OG</b> at the season rate (here{" "}
          <code className="rounded border border-[color:var(--m-border)] bg-[color:var(--m-surface-2)] px-1.5 py-px font-mono text-[0.84em] text-[color:var(--m-text-primary)]">
            {rate} pts = 1 $OG
          </code>
          ).
        </p>
      </Note>

      <Note dot={SOURCE_COLOR.liquidity} title="Liquidity balance">
        <ul className="mt-1.5 list-disc pl-[17px] text-[13px] text-[color:var(--m-text-secondary)]">
          <li className="my-1.5">
            Tracked as your <b>time-weighted LP value</b> that stays <b>in range</b> during the
            epoch — out-of-range liquidity earns less.
          </li>
          <li className="my-1.5">
            Sourced from your <b>LP positions</b> (Portfolio → LP), including single-sided ranges
            opened from a swap.
          </li>
          <li className="my-1.5">
            The sparkline shows your balance rising as you added liquidity over the season.
          </li>
        </ul>
      </Note>

      <Note dot="var(--m-warning)" title="Honest, pre-launch">
        <ul className="mt-1.5 list-disc pl-[17px] text-[13px] text-[color:var(--m-text-secondary)]">
          <li className="my-1.5">
            Today these are <b>testnet points</b>; the <b>points → $OG rate</b> is set for the season
            and finalizes at <b>TGE / mainnet</b>.
          </li>
          <li className="my-1.5">
            <b>Claim</b> = the distributor contract with your epoch Merkle proof, redeeming points
            for $OG — one tx, self-custody.
          </li>
          <li className="my-1.5">
            The rate, emissions, boost tiers, and in-range weighting are <b>parameters</b> shown here
            as an example.
          </li>
        </ul>
      </Note>
    </div>
  );
}

function Note({
  title,
  dot,
  wide,
  children,
}: {
  title: string;
  dot: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] p-[20px_22px] shadow-sm [&_b]:font-semibold [&_b]:text-[color:var(--m-text-primary)] [&_p]:m-0 [&_p]:text-[13.5px] [&_p]:leading-relaxed [&_p]:text-[color:var(--m-text-secondary)]",
        wide && "sm:col-span-2",
      )}
    >
      <h4 className="mb-2.5 flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--m-text-secondary)]">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {title}
      </h4>
      {children}
    </div>
  );
}
