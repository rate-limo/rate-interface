import type { Metadata } from "next";
import { ConsentControl } from "@/components/Legal/ConsentControl";
import { Emphasis, LegalPage, Section } from "@/components/Legal/LegalPage";

/**
 * Cookie policy.
 *
 * The tables below must describe what the app ACTUALLY stores — each row names
 * the file that does the storing. If you add a script, a pixel, or another
 * storage key, it belongs here: a policy that drifts from the code is a false
 * claim, not just stale documentation.
 */
export const metadata: Metadata = {
  title: "Cookie policy | Rate",
  description: "What Rate stores in your browser, why, and how to turn analytics on or off.",
};

/** Keep in step with the code paths named in each row. */
const ESSENTIAL = [
  {
    name: "iter.cookie-consent",
    kind: "Local storage",
    purpose: "Remembers the choice you make in the cookie banner, so we stop asking.",
    life: "Until you clear it",
    where: "lib/consent/store.ts",
  },
  {
    name: "Theme preference",
    kind: "Local storage",
    purpose: "Keeps the app in light or dark mode between visits.",
    life: "Until you clear it",
    where: "components/ThemeProvider.tsx",
  },
  {
    name: "Wallet connection",
    kind: "Local storage",
    purpose:
      "Reown AppKit, our wallet connection provider, remembers which wallet you connected so you aren't reconnecting on every page. We never hold your keys — connecting is the only account there is.",
    life: "Until you disconnect",
    where: "lib/providers.tsx",
  },
  {
    name: "iter.support-ticket",
    kind: "Local storage",
    purpose:
      "The key to your support conversation, so the panel can show it to you again. It is the only way back to that thread — clearing it loses the conversation, and we cannot restore it. Sent to us only when you open the support panel.",
    life: "Until you clear it",
    where: "lib/support/store.ts",
  },
  {
    name: "iter.mera-credential",
    kind: "Local storage",
    purpose:
      "Which passkey to ask for when unlocking your wallet, and the salt it was set up with. It is a pointer, not a key: it cannot sign anything and cannot recover your account on its own — your passkey does that. Clearing it does not lose your wallet; you will just be asked to pick your passkey again. Never sent to us.",
    life: "Until you clear it",
    where: "lib/wallet/mera.ts",
  },
  {
    name: "iter.mera-session",
    kind: "Local storage + IndexedDB, on the wallet's own origin",
    purpose:
      "Keeps your wallet unlocked for a day, so refreshing a page does not sign you out. Your key is stored encrypted, and the thing that decrypts it is held by your browser in a form nothing can copy out — including us. It lives on a separate origin from the app pages (the wallet frame), so a script on this site cannot read it; the app can only ask that origin to sign. It expires on its own after 24 hours and is deleted the moment you disconnect. Never sent to us. On a shared computer, disconnect when you are done.",
    life: "24 hours, or until you disconnect",
    where: "lib/wallet/meraSession.ts, via lib/wallet/frame",
  },
  {
    name: "iter.address-book",
    kind: "Local storage",
    purpose:
      "Addresses you saved to withdraw to, and the names you gave them. It stays in your browser and we never receive it — there is no account on our side to attach it to, which is also why it does not follow you to another device or browser. Clearing it loses the names, never the funds: the addresses themselves live on the blockchain, not here.",
    life: "Until you clear it",
    where: "lib/transfer/addressBook.ts",
  },
  {
    name: "iter.transfers",
    kind: "Local storage",
    purpose:
      "Deposits and withdrawals you made from this browser, so the transfer list can show them. It records only what this app submitted and knows the transaction hash of — a deposit you send by scanning the QR from a phone is not in it, because nothing on our side watches for incoming transfers. It stays in your browser and we never receive it.",
    life: "Until you clear it",
    where: "lib/transfer/history.ts",
  },
  {
    name: "iter.commit-watermark",
    kind: "Session storage",
    purpose:
      "A few counters per network recording how recent the live updates this tab has already shown are, so that reloading data never puts older numbers back on screen. They hold no personal data and no addresses, stay in your browser, and we never receive them.",
    life: "Until the tab is closed",
    where: "lib/realtime/watermark.ts",
  },
  {
    name: "iter.search-recents",
    kind: "Local storage",
    purpose:
      "The last few things you opened from the search box, so they are one click away next time. Tokens, markets and any wallet address you looked up. It stays in your browser — we never receive it — and the Clear button in the search box empties it.",
    life: "Until you clear it",
    where: "lib/search/recents.ts",
  },
  {
    name: "iter.recent-markets",
    kind: "Local storage",
    purpose:
      "The last markets you opened on Trade · Pro, per network, so the market picker can list them under Recent. Only the market's contract address. It stays in your browser and we never receive it.",
    life: "Until you clear it",
    where: "lib/markets/recentMarkets.ts",
  },
  {
    name: "rate.sound",
    kind: "Local storage",
    purpose:
      "Whether the interface plays sounds, and how loud. Set by the speaker icon beside the theme toggle. It stays in your browser and we never receive it.",
    life: "Until you clear it",
    where: "lib/sound/settings.ts",
  },
  {
    name: "iter:auction:*",
    kind: "Local storage",
    purpose:
      "An auction you started — its token details, presale terms, allocation and any logo you cropped, one entry per auction and per network. Nothing about a presale is recorded anywhere else yet, so this browser is the only place it exists: clearing it loses that auction, and we cannot restore it. It stays in your browser and we never receive it. Auctions started before 2026-08-15 were saved under iter:white-launch:* and move to the name above the first time you open them.",
    life: "Until you clear it",
    where: "lib/launch/auctionDraft.ts",
  },
  {
    name: "iter.onboarded",
    kind: "Local storage",
    purpose:
      "Which of your wallets have finished or skipped the welcome screens, so we don't run them again. Just the wallet address — it stays in your browser and we never receive it.",
    life: "Until you clear it",
    where: "lib/onboarding/store.ts",
  },
  {
    name: "iter.onboarding-offered",
    kind: "Local storage",
    purpose:
      "Which of your wallets we have already sent to the welcome screens once. Recorded whether or not you finish them, so connecting your wallet never interrupts you a second time. Stays in your browser; we never receive it.",
    life: "Until you clear it",
    where: "lib/onboarding/store.ts",
  },
  {
    name: "iter.trade.layout.desktop",
    kind: "Local storage",
    purpose:
      "How you arranged the panels on Trade · Pro — which panel sits where, and how wide. Yours only; we never receive it. The Reset layout control clears it.",
    life: "Until you clear it",
    where: "components/Organisms/TradeLayout/usePersistentLayout.ts",
  },
  {
    name: "Chart settings",
    kind: "Local storage",
    purpose:
      "The TradingView charting library on Trade · Pro keeps your interval, layout and drawings so the chart looks the same when you come back. It is loaded from our own servers, not TradingView's.",
    life: "Until you clear it",
    where: "public/tradingview/*",
  },
];

const OPTIONAL = [
  {
    name: "Vercel Analytics",
    kind: "Script + first-party storage",
    purpose:
      "Counts page views and which pages are used. No cross-site tracking, no advertising, no sale of data.",
    life: "Session-scoped",
    where: "components/Legal/AnalyticsGate.tsx",
  },
  {
    name: "Vercel Speed Insights",
    kind: "Script",
    purpose: "Measures real-world page performance so we can find slow pages.",
    life: "Session-scoped",
    where: "components/Legal/AnalyticsGate.tsx",
  },
];

export default function CookiePolicy() {
  return (
    <LegalPage
      eyebrow="cookie policy"
      title="What we store in your browser"
      updated="1 August 2026"
      lede={
        <>
          Rate is a self-custodial application. We don&apos;t hold accounts, we don&apos;t use
          advertising or cross-site tracking, and we don&apos;t sell data. What follows is the
          complete list of what the app puts in your browser.
        </>
      }
    >
      <ConsentControl />

      <Section title="Strictly necessary">
        <p>
          These make the app work and stay on. They&apos;re browser storage rather than cookies:
          nothing here is sent to a server with your requests.
        </p>
        <StorageTable rows={ESSENTIAL} />
      </Section>

      <Section title="Analytics — only if you allow them">
        <p>
          These load <Emphasis>only</Emphasis> after you choose &ldquo;Allow analytics&rdquo;. Until
          then the scripts are never requested — not loaded and ignored. Turn them off above at any
          time and they unload immediately.
        </p>
        <StorageTable rows={OPTIONAL} />
      </Section>

      <Section title="Your wallet address">
        <p>
          Connecting a wallet doesn&apos;t send us anything on its own. If you press{" "}
          <Emphasis>Join the waitlist</Emphasis>, we store that wallet address so we can contact
          holders at launch — that is the one thing you actively hand us, and it happens only on
          that click. Public blockchain activity is public by nature and is not something we collect
          from you.
        </p>
      </Section>

      <Section title="Changing your mind">
        <p>
          Use the control at the top of this page, or clear your browser storage for this site — the
          banner will ask again on your next visit. If we change this policy materially, we ask
          again rather than carrying an old answer forward.
        </p>
      </Section>
    </LegalPage>
  );
}

function StorageTable({
  rows,
}: {
  rows: { name: string; kind: string; purpose: string; life: string; where: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)]">
      <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-[color:var(--m-surface-2)]">
            {["What", "Kind", "Why", "How long"].map((h) => (
              <th
                key={h}
                className="border-b border-[color:var(--m-border)] px-4 py-2.5 text-left font-dm-mono text-[10.5px] font-medium tracking-[0.06em] uppercase text-[color:var(--m-text-secondary-2)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-[color:var(--m-border)] last:border-b-0">
              <td className="px-4 py-3 align-top font-semibold text-[color:var(--m-text-primary)]">
                {row.name}
                <div className="mt-0.5 font-dm-mono text-[10.5px] font-normal text-[color:var(--m-text-secondary-2)]">
                  {row.where}
                </div>
              </td>
              <td className="px-4 py-3 align-top">{row.kind}</td>
              <td className="px-4 py-3 align-top">{row.purpose}</td>
              <td className="px-4 py-3 align-top">{row.life}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
