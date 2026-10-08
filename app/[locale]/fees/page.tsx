import type { Metadata } from "next";
import { Emphasis, LegalPage, Points, Section } from "@/components/Legal/LegalPage";

/**
 * Fees, disclosed the way pump.fun does it: one table, who pays, how much, who
 * receives it.
 *
 * Every number here is what the deployed contracts charge, read from Arc and
 * RISE testnet on 2026-10-02 — not what a contract could be configured to do:
 *
 * - `MatchingEngine.feeOf` returns 100_000 / 1e8 (0.10%) for takers and 0 for
 *   makers on every pair. `incentive` is unset, so AssetGenerator's per-coin and
 *   creator fee settings are NOT consulted. Do not describe them here until an
 *   admin wires `setIncentive` — at that point this page is wrong.
 * - `Orderbook._sendFunds` sends the whole book fee to `MatchingEngine.feeTo`.
 * - `BandPool._fillBand` charges the engine rate × the band's multiplier
 *   (`BandPoolFactory.defaultFeeMultipliers` = 1×/2×/3×, capped at
 *   `PoolBands.MAX_FEE_RATE` 3%), and `poolFeeShare` (5e7 = 50%) of it accrues
 *   to the band's LPs; the rest to the protocol.
 * - `AssetGenerator.launchFee` is 2 USDC on Arc (2e18 — the native view is 18
 *   decimals) and 0.001 ETH on RISE, set 2026-10-02 (~$2), paid to `feeTo`.
 *   `addPair` itself is protocol-fee-free, so an AUCTION launch (PresaleLaunch
 *   lists through the engine, not the generator) pays no launch fee and takes
 *   no cut. Withdrawals are a plain transfer (bb824eac).
 *
 * If any of those reads change, change this page in the same commit.
 */
export const metadata: Metadata = {
  title: "Fees | Rate",
  description:
    "Every fee Rate charges: who pays, how much, and who receives it. Takers pay 0.10% and a launch costs $2. Makers, auctions and withdrawals pay nothing.",
};

const ROWS: { action: string; pays: string; rate: string; to: string }[] = [
  { action: "Order filled on the book, as taker", pays: "Taker", rate: "0.10%", to: "Protocol 100%" },
  { action: "Order filled on the book, as maker", pays: "—", rate: "0%", to: "—" },
  { action: "Swap filled by pool band 1 (default)", pays: "Taker", rate: "0.10%", to: "LPs in that band 50% · Protocol 50%" },
  { action: "Swap filled by pool band 2 (default)", pays: "Taker", rate: "0.20%", to: "LPs in that band 50% · Protocol 50%" },
  { action: "Swap filled by pool band 3 (default)", pays: "Taker", rate: "0.30%", to: "LPs in that band 50% · Protocol 50%" },
  { action: "Provide or remove liquidity", pays: "—", rate: "0%", to: "—" },
  { action: "Launch a token", pays: "Creator", rate: "$2", to: "Protocol 100%" },
  { action: "Run or join an auction", pays: "—", rate: "0%", to: "—" },
  { action: "Deposit or withdraw", pays: "—", rate: "0%", to: "—" },
];

export default function Fees() {
  return (
    <LegalPage
      eyebrow="fees"
      title="Takers pay 0.10%. Launches cost $2. That's all."
      updated="2 October 2026"
      lede={
        <>
          Every fee the Rate contracts charge, who pays it and who receives it. Fees are taken from
          what the taker receives, at the moment of the fill. Network gas is separate: it goes to
          the chain, not to us.
        </>
      }
    >
      {/* Phone: one stacked row per fee, so "who receives it" never scrolls off. */}
      <ul className="divide-y divide-[color:var(--m-border)] rounded-2xl border border-[color:var(--m-border)] sm:hidden">
        {ROWS.map((r) => (
          <li key={r.action} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-4 text-[14px]">
              <span className="text-[color:var(--m-text-primary)]">{r.action}</span>
              <span className="font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">{r.rate}</span>
            </div>
            {r.to !== "—" && (
              <p className="mt-1 text-[12.5px] text-[color:var(--m-text-secondary)]">
                {r.pays} pays · {r.to}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-[color:var(--m-border)] sm:block">
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-[color:var(--m-border)] font-dm-mono text-[11px] tracking-[0.12em] uppercase text-[color:var(--m-text-secondary-2)]">
              <th className="px-4 py-3 font-medium">What happens</th>
              <th className="px-4 py-3 font-medium">Who pays</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Who receives it</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.action} className="border-b border-[color:var(--m-border)] last:border-0">
                <td className="px-4 py-3 text-[color:var(--m-text-primary)]">{r.action}</td>
                <td className="px-4 py-3 text-[color:var(--m-text-secondary)]">{r.pays}</td>
                <td className="px-4 py-3 font-dm-mono tabular-nums text-[color:var(--m-text-primary)]">
                  {r.rate}
                </td>
                <td className="px-4 py-3 text-[color:var(--m-text-secondary)]">{r.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="How it works">
        <Points
          items={[
            <>
              <Emphasis>Makers pay nothing.</Emphasis> Placing and cancelling an order already costs
              gas. Only the side that takes liquidity pays.
            </>,
            <>
              <Emphasis>Pool bands charge more the wider they sit.</Emphasis> By default band 1
              sits closest to the price and charges the base 0.10%; bands 2 and 3 charge 2× and 3×
              because they only fill once the tighter bands are used up. A pool&apos;s creator can
              retune its bands, but no band charges less than the base rate or more than 3%. The
              swap screen shows the fee before you sign.
            </>,
            <>
              <Emphasis>LPs are paid in what traders pay.</Emphasis> Half of a band&apos;s fee goes
              to the LPs in that band, in proportion to their share. It vests over 10 minutes. If
              you withdraw before it vests, the unvested part goes to the other LPs in the band, or
              to the protocol if you were the last one.
            </>,
            <>
              <Emphasis>Launching costs a flat $2.</Emphasis> It is paid in the chain&apos;s gas
              token (2 USDC on Arc, 0.001 ETH on RISE), and nothing is taken from the supply.
              Creators get no share of trading fees. Launching through an auction has no launch
              fee: the raise goes to the pool and the creator&apos;s treasury, with no cut to us.
            </>,
          ]}
        />
      </Section>

      <Section title="Where it goes">
        <p>
          The protocol share goes to one address set in the contracts (
          <code className="font-dm-mono text-[13px]">MatchingEngine.feeTo</code>), operated by
          Digital Native Standard LTD. It is the same on every chain Rate runs on.
        </p>
      </Section>

      <Section title="Risks" id="risks">
        <p>
          <Emphasis>Pool prices can be pushed.</Emphasis> Rate is an order-book DEX. Its pools trade
          at the order book&apos;s recent price, averaged over five minutes. Orders placed on the book
          move that price a few percent each, even if they are cancelled later. Each order is capped;
          the total is not.
        </p>
        <Points
          items={[
            <>
              A pool holding only coins, with no USDC buyers behind it, can have its price pushed
              down and its coins bought cheap.
            </>,
            <>A pool holding USDC can have its price pushed up and its USDC taken.</>,
            <>
              On our contracts this took a few minutes and about $2 of gas. It applies to every pool,
              including a launched coin&apos;s pool after graduation. A launch&apos;s sale steps
              before graduation are not affected.
            </>,
          ]}
        />
        <p>
          Before you add liquidity, look at what each side of the pool holds.
        </p>
      </Section>

      <Section title="Can it change?">
        <p>
          Yes. The contracts let us change the taker fee, the LP share and the launch fee, with no waiting period.
          A change applies from the next fill, never to one already settled. When it changes, this
          page changes with it. Every figure above can be read from the contracts at any time:{" "}
          <code className="font-dm-mono text-[13px]">MatchingEngine.feeOf</code>,{" "}
          <code className="font-dm-mono text-[13px]">poolFeeShare</code>,{" "}
          <code className="font-dm-mono text-[13px]">AssetGenerator.launchFee</code> and{" "}
          <code className="font-dm-mono text-[13px]">BandPoolFactory.defaultFeeMultipliers</code>.
        </p>
      </Section>
    </LegalPage>
  );
}
