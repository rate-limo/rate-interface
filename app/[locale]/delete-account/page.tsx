import type { Metadata } from "next";
import Link from "next/link";
import { DeleteProfileControl } from "@/components/Legal/DeleteProfileControl";
import { Emphasis, LegalPage, Section } from "@/components/Legal/LegalPage";

/**
 * Self-service profile deletion.
 *
 * Sits with the legal pages rather than in the app shell because it is the page
 * `/privacy` sends people to, and because someone who wants their data gone should
 * not have to connect a wallet and find a settings menu to start.
 *
 * ## What this page must never do is overstate itself
 *
 * "Delete account" is the phrase people search for, so it is the route. But there is
 * no account — there is a generated profile, and a pile of trading history that is
 * reconstructed from the blockchain on every indexer run and is therefore not ours
 * to delete. A page that implies otherwise is worse than no page: it lets someone
 * believe they have erased something they have not. Both sections below exist to say
 * that plainly, and the "What this does not touch" list must stay at least as
 * prominent as the button.
 */
export const metadata: Metadata = {
  title: "Delete your profile | Rate",
  description:
    "Delete the profile Rate generated for your wallet, and stop a new one being generated.",
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title="Delete your profile"
      lede={
        <>
          Rate creates a profile — a generated name and handle — the first time a portfolio is
          opened. You can delete it here, with no email and no waiting.
        </>
      }
      updated="14 August 2026"
    >
      <Section title="Delete it">
        <DeleteProfileControl />
        <p>
          We ask your wallet to sign a message because that signature is the only proof we accept
          that the address is yours. It is not a transaction: nothing is sent, nothing is spent, and
          declining it deletes nothing.
        </p>
      </Section>

      <Section title="What this deletes">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <Emphasis>Your display name and handle</Emphasis> — the ones we generated, and any you
            chose yourself.
          </li>
          <li>
            <Emphasis>The date the profile was created</Emphasis>, which is what the
            &ldquo;Joined&rdquo; line showed.
          </li>
          <li>
            <Emphasis>Your X link, if you connected one</Emphasis> — the account id, the username
            and the picture. This is the most revealing thing we hold about you, so it goes with
            the rest rather than surviving as a tombstone. What it cannot do is un-publish the
            connection: anyone who already saw your wallet next to your X account still knows.
          </li>
          <li>
            <Emphasis>Any future profile.</Emphasis> Opening your portfolio again will not generate
            a new one. To get that, we keep your address and the fact that you asked — and nothing
            else. That record is what makes the deletion stick instead of quietly undoing itself.
          </li>
        </ul>
        <p>
          You can start a fresh profile deliberately at any time. It will have a new name and a new
          joined date; the old ones are not recoverable.
        </p>
      </Section>

      <Section title="What this does not touch">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <Emphasis>Your trades, orders and positions.</Emphasis> These are not records we hold
            about you — they are reconstructed from the blockchain every time our indexer runs.
            Deleting our copy would change nothing, because it would come back by itself on the next
            run.
          </li>
          <li>
            <Emphasis>Anything on the blockchain.</Emphasis> Transactions you signed are public and
            permanent. <Emphasis>Nobody can delete them</Emphasis> — not Rate, not you, and not any
            request under any law.
          </li>
          <li>
            <Emphasis>Support conversations.</Emphasis> Those are kept against the email address you
            gave, never against your wallet, so this page cannot find them. Ask us in the support
            panel and we will delete a conversation and the address with it.
          </li>
          <li>
            <Emphasis>Referral attribution.</Emphasis> If someone joined through your link, the
            record that they did is about the pair of you, and removing it would take away their
            referrer as well as your credit.
          </li>
        </ul>
      </Section>

      <Section title="Everything else we hold">
        <p>
          The{" "}
          <Link
            href="/privacy"
            className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
          >
            privacy policy
          </Link>{" "}
          lists what is collected and how long it is kept, and the{" "}
          <Link
            href="/cookies"
            className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
          >
            cookie policy
          </Link>{" "}
          covers what stays in your own browser — clearing site data removes that, and this page has
          no say over it.
        </p>
      </Section>
    </LegalPage>
  );
}
