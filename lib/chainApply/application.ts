/**
 * A chain integration application, filed as a support ticket — same channel as
 * affiliate applications (`lib/affiliates/application`), so it lands in the
 * operator's /support queue with no new backend.
 *
 * The first line is a fixed heading so the queue can tell it from a support
 * request at a glance. Everything after it is what the applicant typed,
 * labelled and never interpreted.
 */

export const CHAIN_APPLICATION_HEADING = "Chain integration application";

export const OFFERS = ["Liquidity commitment", "Ecosystem grant", "Co-marketing", "Gas sponsorship"] as const;
export type Offer = (typeof OFFERS)[number];

export const STAGES = ["Mainnet", "Testnet", "Pre-launch"] as const;
export type Stage = (typeof STAGES)[number];

export interface ChainApplication {
  chainName: string;
  chainId: string;
  stage: Stage;
  evm: boolean;
  stablecoin: string;
  assets: string;
  offers: Offer[];
  contactName: string;
  contactRole: string;
  social: string;
  notes: string;
}

/** A chain id is a positive integer; empty is allowed (pre-launch chains may not have one yet). */
export function chainIdProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^[1-9][0-9]{0,15}$/.test(v) ? null : "A chain ID is a whole number, like 8453.";
}

const clip = (s: string, n: number) => s.trim().slice(0, n);

export function chainApplicationMessage(a: ChainApplication): string {
  const lines = [
    CHAIN_APPLICATION_HEADING,
    `Chain: ${clip(a.chainName, 80) || "—"}`,
    `Chain ID: ${clip(a.chainId, 20) || "—"}`,
    `Stage: ${a.stage}`,
    `EVM: ${a.evm ? "yes" : "no"}`,
    `Stablecoin: ${clip(a.stablecoin, 120) || "—"}`,
    `They can bring: ${a.offers.length ? a.offers.join(", ") : "—"}`,
    `Contact: ${clip(a.contactName, 80) || "—"}${a.contactRole.trim() ? ` (${clip(a.contactRole, 60)})` : ""}`,
    `X / Telegram: ${clip(a.social, 120) || "—"}`,
  ];
  const assets = a.assets.trim();
  if (assets) lines.push("", "Assets to list (incl. RWAs):", clip(assets, 1200));
  const notes = a.notes.trim();
  if (notes) lines.push("", "Notes:", clip(notes, 1200));
  return lines.join("\n");
}
