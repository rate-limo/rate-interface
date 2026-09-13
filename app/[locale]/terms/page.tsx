import type { Metadata } from "next";
import Link from "next/link";
import {
  DraftNotice,
  Emphasis,
  LegalPage,
  Points,
  Section,
  TBD,
} from "@/components/Legal/LegalPage";

/**
 * Terms of use.
 *
 * The "Launching a token" section describes powers the software actually has —
 * metadata can be overridden by an operator, and a listing is not an
 * endorsement. Keep it in step with apps/admin-service: claiming a takedown
 * ability that does not exist, or exercising one this page never disclosed, are
 * both problems.
 */
export const metadata: Metadata = {
  title: "Terms of use | Iter",
  description:
    "The terms for using the Iter interface: self-custodial, no advice, and the risks you accept when you sign a transaction.",
  // Draft — see the note in app/privacy/page.tsx. Remove once signed off.
  robots: { index: false, follow: true },
};

export default function Terms() {
  return (
    <LegalPage
      eyebrow="terms of use"
      title="An interface to smart contracts, not a broker"
      updated="1 August 2026"
      lede={
        <>
          Iter is software that helps you talk to public smart contracts. It never takes custody of
          your assets, never trades on your behalf, and cannot reverse anything you sign. Using it
          means accepting the terms below.
        </>
      }
    >
      <DraftNotice />

      <Section title="1. Who you are agreeing with">
        <p>
          These terms are between you and <TBD>legal entity name</TBD> (&ldquo;we&rdquo;). By using
          the interface you accept them. If you do not, do not use it.
        </p>
      </Section>

      <Section title="2. What the interface is — and is not">
        <Points
          items={[
            <>
              <Emphasis>Self-custodial.</Emphasis> You hold your own keys. We never take custody of
              your assets and cannot move, freeze or recover them.
            </>,
            <>
              <Emphasis>Non-custodial routing only.</Emphasis> The interface helps you construct
              transactions. The smart contracts execute them. We are not a broker, exchange,
              custodian, or money transmitter, and we do not match trades ourselves.
            </>,
            <>
              <Emphasis>No reversals.</Emphasis> Once you sign, the transaction is out of our
              hands. There is no cancel, no chargeback, and no support channel that can undo it.
            </>,
            <>
              <Emphasis>Availability is not promised.</Emphasis> The interface, indexers and price
              data can go down. The underlying contracts may remain usable without us.
            </>,
          ]}
        />
      </Section>

      {/*
        Modelled on Uniswap Labs' terms (user direction, 2026-08-14: "follow
        uniswap legal terms"), and note WHAT was copied: the structure, not a
        list. Uniswap names no fixed set of countries — eligibility is tied to
        the comprehensive US sanctions programmes themselves, so the rule
        follows Treasury rather than needing an edit here every time a programme
        changes. A hardcoded list is wrong the day it changes and nobody
        notices; this cannot go stale. The countries below are stated as
        illustrative *as at the date above* for exactly that reason.

        Age is the same pattern: "age of majority where you live" rather than a
        flat 18, because majority is 19 or 21 in some places and a flat number
        would under-state the requirement there.
      */}
      <Section title="3. Eligibility">
        <p>
          You must be at least the age of majority where you live — 18 in most places — and legally
          able to enter this agreement.
        </p>
        <p>
          You may not use the interface if you are a citizen or resident of, or located in, any
          country or territory subject to comprehensive United States sanctions, or if you appear on
          any applicable sanctions list. That set is defined by the sanctions programmes themselves
          rather than fixed by us, so it changes when they do; as at the date above it covers Cuba,
          Iran, North Korea, Syria, and the Crimea, Donetsk and Luhansk regions of Ukraine. You are
          responsible for knowing whether your own laws permit what you are doing.
        </p>
      </Section>

      <Section title="4. Nothing here is advice">
        <p>
          <Emphasis>
            Nothing in the interface is financial, investment, legal or tax advice.
          </Emphasis>{" "}
          Prices, charts, APRs, points, projected earnings and market data are for information
          only, may be wrong or stale, and are not a recommendation to do anything. Decide for
          yourself, and take your own professional advice.
        </p>
      </Section>

      <Section title="5. Risks you are accepting">
        <Points
          items={[
            <>
              <Emphasis>Total loss.</Emphasis> Digital assets are volatile and can go to zero.
              Never commit more than you can afford to lose entirely.
            </>,
            <>
              <Emphasis>Smart contract risk.</Emphasis> Contracts may contain bugs or be exploited.
              An audit reduces risk; it does not remove it.
            </>,
            <>
              <Emphasis>Execution risk.</Emphasis> Slippage, price impact, failed transactions, gas
              costs, and value extracted by transaction ordering (MEV) can all leave you worse off
              than the quote suggested.
            </>,
            <>
              <Emphasis>Liquidity risk.</Emphasis> Providing liquidity can return less than you
              deposited. A concentrated range earns nothing while the price sits outside it.
            </>,
            <>
              <Emphasis>Data risk.</Emphasis> Oracles and indexers can be delayed, wrong, or
              offline, and the interface may display stale information as a result.
            </>,
            <>
              <Emphasis>Testnet assets have no value.</Emphasis> Testnet tokens, points and rewards
              are not money and carry no promise of future value or conversion.
            </>,
          ]}
        />
      </Section>

      <Section title="6. Launching a token">
        <p>
          If you deploy a token through the interface, you are its author and you are responsible
          for it. Specifically:
        </p>
        <Points
          items={[
            <>
              <Emphasis>Deployment is permanent.</Emphasis> The name, symbol, decimals and supply
              are fixed at deploy. There is no owner and no mint function, so nobody — including
              us — can change them afterwards.
            </>,
            <>
              <Emphasis>Listing is not liquidity.</Emphasis> Launching deploys your coin and opens
              a market for it. It does not place orders or provide liquidity, and the supply is sent
              to you. A market with nothing resting in it cannot be traded until someone posts an
              order.
            </>,
            <>
              <Emphasis>The listing price and fees are not yours to set.</Emphasis> Every coin lists
              against an approved quote token at a rate we configure. Trading fees are set by the
              contract, not by you: takers pay a higher rate until the coin&apos;s total value
              reaches a set figure, and a lower rate after. That is a{" "}
              <Emphasis>separate threshold</Emphasis> from the liquidity one described below, which
              governs where a coin appears in this interface. Meeting one does not mean meeting the
              other, and both figures are set by us and can change.
            </>,
            <>
              <Emphasis>You warrant your content.</Emphasis> The name, logo, description and links
              you supply must be yours to use and must not infringe anyone&apos;s rights, impersonate
              another project, or be unlawful or deceptive.
            </>,
            <>
              <Emphasis>We can remove metadata.</Emphasis> We may hide, correct or remove the name,
              logo and description shown in this interface — for example where it impersonates
              another project. This changes what the interface displays. It does not and cannot
              alter the deployed contract.
            </>,
            <>
              <Emphasis>A listing is not an endorsement.</Emphasis> Appearing in the interface, and
              any badge shown next to a token, does not mean we have reviewed, audited or approved
              the project, its team or its contracts, and is not a statement that it is safe or a
              good idea. A badge signifies exactly two things and nothing more: that the market
              crossed the automatic liquidity threshold described below, or that an operator set the
              flag by hand. Neither involves examining the project.
            </>,
            <>
              <Emphasis>Listing is automatic, and it is a threshold, not a judgement.</Emphasis> A
              new coin starts unlisted: it is reachable by address, by search and in the launches
              views, but it is left out of rankings, default tables and totals. It is listed
              automatically once its market holds a set amount of liquidity in the quote asset. No
              person reviews it at that point, and crossing the threshold says nothing about the
              project beyond the fact that money is on the other side of its book. The amount is
              set by us and can change. Once listed, a coin stays listed until an operator hides
              it — a later fall in liquidity does not remove it on its own.
            </>,
            <>
              <Emphasis>You are responsible for your own compliance.</Emphasis> Issuing a token may
              be a regulated activity where you are. That is your problem to solve, not ours.
            </>,
          ]}
        />
      </Section>

      <Section title="7. Withdrawal fee">
        <p>
          When you withdraw from an embedded (passkey) wallet, the interface takes{" "}
          <Emphasis>0.01% of the amount</Emphasis> — one basis point, one ten-thousandth —
          and sends it to a wallet we control. The rest goes to the address you gave.
          Both transfers are sent as a single transaction, so they succeed or fail
          together; you are never charged for a withdrawal that did not arrive.
        </p>
        <Points
          items={[
            <>
              <Emphasis>You see it before you sign.</Emphasis> The review step shows what
              the destination receives and what the fee is, in the asset being sent.
            </>,
            <>
              <Emphasis>Small withdrawals pay nothing.</Emphasis> The fee is computed in
              the asset&apos;s smallest unit and rounds down, so below ten thousand of
              those units it is zero and the review step says so. We do not round it up.
            </>,
            <>
              <Emphasis>It does not apply to every wallet.</Emphasis> Withdrawing from an
              external wallet such as MetaMask sends the full amount with no fee, because
              that path cannot combine the two transfers into one transaction and we will
              not charge a fee that can land without the withdrawal it belongs to.
            </>,
            <>
              <Emphasis>It is not a network fee.</Emphasis> Gas is separate, paid by you to
              the network, and we receive none of it.
            </>,
          ]}
        />
      </Section>

      <Section title="8. Things you must not do">
        <Points
          items={[
            "Use the interface for money laundering, sanctions evasion, fraud, or any other unlawful purpose.",
            "Manipulate markets, including wash trading and spoofing.",
            "Attack the interface or its infrastructure — scraping at abusive rates, probing for vulnerabilities without permission, or interfering with anyone else's use of it.",
            "Misrepresent yourself as Iter or as connected to us.",
          ]}
        />
      </Section>

      <Section title="9. Intellectual property">
        <p>
          The Iter name and branding are ours. Source code is licensed under the terms published in
          the repository, and those terms govern the code. Nothing here grants you a licence to use
          our branding.
        </p>
      </Section>

      <Section title="10. No warranty">
        <p>
          <Emphasis>
            The interface is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
            warranty of any kind
          </Emphasis>{" "}
          — express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that it will be uninterrupted, timely, secure or free
          of error, or that any data shown is accurate.
        </p>
      </Section>

      {/*
        The no-liability position rests on the STRUCTURE of the product, not on
        a disclaimer (user direction, 2026-08-14: "defi is basically using your
        own personal wallet to interact. so we have no liability at all"). Said
        that way it is a description of §2 rather than an assertion, which is
        both true and considerably harder to argue with.

        The "cannot lawfully be excluded" sentence is deliberately KEPT rather
        than replaced with a flat "no liability at all". It is not a concession
        that costs anything: no jurisdiction we could plausibly be sued in
        enforces an exclusion covering fraud, wilful misconduct, or death and
        personal injury, so that residue exists whether or not this page admits
        it. Clauses drafted as absolute are the ones courts strike down whole,
        taking the enforceable part with them — so the carve-out is what
        protects the rest of the section, not a hole in it.
      */}
      <Section title="11. Limitation of liability">
        <p>
          <Emphasis>
            You transact from your own wallet, with contracts we do not control, and we are never a
            party to it.
          </Emphasis>{" "}
          We take no custody, hold no balance, execute nothing on your behalf and can reverse
          nothing. There is no point at which your assets pass through us, and so no point at which
          we could have caused you a loss or could restore one.
        </p>
        <p>
          Accordingly, and to the fullest extent the law allows, we accept no liability for any loss
          arising from your use of the interface — including lost profits, lost assets and lost
          opportunity, and including losses caused by smart contract failure, network congestion,
          MEV, oracle error, or your own transaction choices. Where liability cannot lawfully be
          excluded, it is capped at zero: we charge you nothing for the interface and hold nothing
          of yours, so there is no fee to refund and no balance to make you whole from.
        </p>
      </Section>

      <Section title="12. Indemnity">
        <p>
          You agree to cover us against claims arising from your use of the interface, your breach
          of these terms, and any token or content you publish through it.
        </p>
      </Section>

      <Section title="13. Access, changes and disputes">
        <p>
          We may change these terms, and may restrict or withdraw access to the interface at any
          time, including where required by law. Material changes will be reflected in the date
          above. These terms are governed by the laws of the Cayman Islands, and disputes will be
          resolved by confidential binding arbitration seated in the Cayman Islands, conducted
          under <TBD>arbitral rules and institution</TBD>.
        </p>
        <p>
          See also the{" "}
          <Link
            href="/privacy"
            className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
          >
            privacy policy
          </Link>{" "}
          and{" "}
          <Link
            href="/cookies"
            className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
          >
            cookie policy
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
