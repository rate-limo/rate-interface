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
 * Privacy policy.
 *
 * Every claim here is checked against what the code actually does — see the
 * file references in the comments. If you change data handling, change this
 * page in the same commit: a privacy policy that drifts from the code is a
 * false statement, not stale documentation.
 */
export const metadata: Metadata = {
  title: "Privacy policy | Rate",
  description:
    "What Rate collects, what it doesn't, and what you can do about it. Self-custodial: no KYC, no data sales.",
  // Kept out of search results while this is a draft — an unreviewed policy
  // with visible [placeholders] should not be the thing a search engine
  // surfaces as our privacy statement. Remove once it is signed off.
  robots: { index: false, follow: true },
};

export default function Privacy() {
  return (
    <LegalPage
      eyebrow="privacy policy"
      title="What we keep, and what we never see"
      updated="2 October 2026"
      lede={
        <>
          Rate is a self-custodial interface: you hold your own keys, there is no identity check,
          and there is no account to create. You connect a wallet — that is the whole sign-in. The
          one exception is support: if you write to us, we keep the email address you give us so we
          can reply. This page lists everything the app receives.
        </>
      }
    >
      <DraftNotice />

      <Section title="Who this is about">
        <p>
          This policy covers the Rate web application and the services behind it, operated by{" "}
          Digital Native Standard LTD, a company incorporated in the British Virgin Islands,{" "}
          <TBD>registered address</TBD>. Questions or requests go to{" "}
          <TBD>contact email</TBD>.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <Emphasis>Nothing at all, until you do one of the following.</Emphasis> Browsing the app
          and connecting a wallet do not send us personal data.
        </p>
        <Points
          items={[
            <>
              <Emphasis>Your wallet address, once you connect.</Emphasis> Connecting tells us the
              address, which is what we use to show your positions and attribute referrals.
              Connecting alone tells us no name — but opening a portfolio creates a profile, which
              is the next item.
            </>,
            <>
              <Emphasis>A profile, created the first time a portfolio is opened.</Emphasis> It
              holds a display name and a handle that <Emphasis>we generate from the address</Emphasis>
              {" "}— nobody types them and we never ask for a real name — together with the date the
              profile was created, which is what the &ldquo;Joined&rdquo; line shows. You can change
              the name and handle, and doing so requires a signature from that wallet, so only its
              holder can edit it. Treat the profile as public: it is shown to anyone who can see the
              address.
            </>,
            <>
              <Emphasis>Your X username and profile picture — only if you connect X.</Emphasis>{" "}
              Connecting is optional and happens from your portfolio. We keep X&apos;s numeric
              account id, the username and the picture, and we{" "}
              <Emphasis>store our own copy</Emphasis> rather than asking X for it again each time.
              We do not receive your X password, your posts, your followers or your direct messages.
              <br />
              <Emphasis>
                Understand what connecting does: it publicly ties this wallet to that X account.
              </Emphasis>{" "}
              Anyone who sees either one can then find the other, and because the wallet&apos;s
              activity is on a public blockchain, that link cannot be taken back from anyone who has
              already noticed it — disconnecting stops us showing it, not them from remembering it.
            </>,
            <>
              <Emphasis>Your wallet address — also if you join the waitlist.</Emphasis> Joining at
              waitlist.rate.limo stores your address and the time you joined. Nothing else: no
              balance, no activity.
            </>,
            <>
              <Emphasis>Your email address and messages, if you contact support.</Emphasis> The
              support panel asks for an email so we can reply, and stores that address along with
              everything written in the conversation, by you and by us. We never check that the
              address is yours and never link it to a wallet. Your browser keeps a key to the
              conversation so it can show it to you again — clearing site data loses the thread,
              and there is no way to recover it. Affiliate and chain-integration applications are
              filed the same way, as support messages, so they also hold what you typed into that
              form: for example a name, a role or a social handle.
            </>,
            <>
              <Emphasis>Usage analytics — only if you allow them.</Emphasis> Off unless you accept
              in the cookie banner, and the scripts are never requested until you do. See the{" "}
              <Link
                href="/cookies"
                className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
              >
                cookie policy
              </Link>
              .
            </>,
            <>
              <Emphasis>Images you upload.</Emphasis> If you create a token, the logo you upload is
              stored and served publicly. It is resized and re-encoded on upload, which strips any
              embedded metadata such as EXIF location tags.
            </>,
            <>
              <Emphasis>Standard server logs.</Emphasis> Our hosting provider records ordinary
              request data, including IP addresses, to run and secure the service. Our upload
              endpoint also uses your IP address to rate-limit abuse — held in memory only and
              never written to a database.
            </>,
          ]}
        />
      </Section>

      <Section title="What we never collect">
        <Points
          items={[
            <>
              <Emphasis>Your private keys or seed phrase.</Emphasis> They never reach our servers,
              and nobody from Rate will ever ask for them. If you use the Rate wallet, its key is
              derived on your device from your passkey and kept, encrypted, in your browser on
              wallet.rate.limo for up to 24 hours so that reloading the page does not sign you out.
            </>,
            <>
              <Emphasis>Identity documents.</Emphasis> There is no KYC on this interface.
            </>,
            <>
              <Emphasis>A password.</Emphasis> There is no account and no sign-in to steal. We hold
              an email address only if you gave us one in a support message, and never as a login.
            </>,
            <>
              <Emphasis>Advertising or cross-site tracking data.</Emphasis> No ad networks and no
              third-party tracking pixels. We build no behavioural profile of you — the profile
              described above is a name attached to an address, not a record of what you do with it.
            </>,
          ]}
        />
        <p>
          <Emphasis>We do not sell personal data, and we do not share it for advertising.</Emphasis>
        </p>
      </Section>

      <Section title="Blockchain activity is public, and permanent">
        <p>
          Transactions you sign are recorded on a public blockchain by design. That data is not
          collected by us, is visible to anyone, and{" "}
          <Emphasis>cannot be edited or deleted by us or by you</Emphasis> — not by Rate, and not
          by any request under any law. A wallet address can often be linked to a person by
          combining public sources, so treat every onchain action as public.
        </p>
      </Section>

      <Section title="Who else is involved">
        <p>These providers process data on our behalf or as part of connecting you to a chain:</p>
        <Points
          items={[
            <>
              <Emphasis>Vercel</Emphasis> — hosting, plus analytics and performance measurement if
              you have allowed them.
            </>,
            <>
              <Emphasis>Railway</Emphasis> — hosts the services behind the app (the market data
              API, live updates and sign-in), and so sees IP addresses and request data.
            </>,
            <>
              <Emphasis>Cloudflare</Emphasis> — DNS for rate.limo. It resolves our domain names
              and does not see the content of your requests.
            </>,
            <>
              <Emphasis>Your passkey provider</Emphasis> — Apple, Google, a password manager or a
              security key creates and stores the passkey behind the Rate wallet, and runs the
              fingerprint or face check. That check never reaches us.
            </>,
            <>
              <Emphasis>An external wallet, if you use one</Emphasis> — MetaMask or another browser
              wallet you connect to fund a deposit has its own privacy policy, and we do not control
              it.
            </>,
            <>
              <Emphasis>RPC and indexing providers</Emphasis> — reading chain state necessarily
              reveals your IP address and the addresses being queried to whoever serves that data.
            </>,
          ]}
        />
        <p>
          Any transfer of data outside your country is handled under <TBD>transfer mechanism</TBD>.
        </p>
      </Section>

      <Section title="How long we keep things">
        <Points
          items={[
            <>
              <Emphasis>Your referral link</Emphasis> — while the programme runs. It records which
              wallet referred which, and nothing else about you.
            </>,
            <>
              <Emphasis>Waitlist addresses</Emphasis> — until launch, or until you ask us to remove
              yours.
            </>,
            <>
              <Emphasis>Your profile</Emphasis> —{" "}
              <Emphasis>until you delete it</Emphasis>, at{" "}
              <Link
                href="/delete-account"
                className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
              >
                delete your profile
              </Link>
              . There is no automatic deletion otherwise. It holds the name, the handle and the date
              it was created, and nothing about your activity. Deleting erases the name and handle
              and <Emphasis>stops one being generated for you again</Emphasis> — we keep only your
              address and the fact that you asked, which is what makes the deletion stick. You can
              start a new profile deliberately at any time.
            </>,
            <>
              <Emphasis>Support conversations</Emphasis> — the email address and the messages are
              kept after a ticket is closed, so we can pick the thread up if you write again.{" "}
              <Emphasis>There is no automatic deletion.</Emphasis> Ask us and we will delete a
              conversation and the address with it.
            </>,
            <>
              <Emphasis>Your cookie choice, and the key to a support conversation</Emphasis> — both
              in your own browser, until you clear it. Neither is sent to our servers on ordinary
              requests, and clearing them loses the support thread for good.
            </>,
            <>
              <Emphasis>Uploaded images</Emphasis> —{" "}
              <Emphasis>kept indefinitely; there is no automatic deletion.</Emphasis> Images are
              stored by their content, so the same picture uploaded twice is stored once, and
              replacing a token&apos;s logo leaves the old one stored rather than removing it. An
              upload that is never attached to a token is also kept. Ask us and we will delete a
              specific image.
            </>,
            <>
              <Emphasis>Server logs</Emphasis> — <TBD>retention period</TBD>.
            </>,
          ]}
        />
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have the right to ask what we hold about you, to
          correct it, to have it deleted, or to object to how it is used. Write to{" "}
          <TBD>contact email</TBD> and we will respond within <TBD>response window</TBD>. You can
          also complain to your local data protection authority.
        </p>
        <p>
          <Emphasis>You can delete your profile yourself</Emphasis>, without writing to us, at{" "}
          <Link
            href="/delete-account"
            className="text-[color:var(--m-primary-fg)] underline underline-offset-2"
          >
            /delete-account
          </Link>
          . It asks your wallet for a signature, because that signature is the only proof we accept
          that the address is yours.
        </p>
        <p>
          <Emphasis>The honest limit:</Emphasis> we can delete a profile, a waitlist entry or an
          uploaded image. We cannot delete your trading history, because it is not ours to delete —
          it is reconstructed from the blockchain every time our indexer runs, so removing our copy
          changes nothing and it returns by itself. And we cannot delete anything from the
          blockchain, because nobody can.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Rate is not directed at children and is not intended for anyone under the age of majority
          where they live — 18 in most places. We do not knowingly collect their data.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy materially we update the date above and ask for your cookie
          choice again rather than carrying an old answer forward to terms you never saw.
        </p>
      </Section>
    </LegalPage>
  );
}
