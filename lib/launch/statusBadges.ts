/**
 * The status chips beside a coin's name on its profile.
 *
 * It said "launching" for every unlisted coin launched on Rate, so a coin whose
 * ladder had sold out and graduated still read LAUNCHING right above a panel
 * saying "Graduated · pool $3.1K".
 *
 * Two different events, two chips, never merged (see the Launch spec):
 * - the LADDER: launching → graduating (sold out / armed) → graduated;
 * - the LISTING: `verified`, flipped by quote liquidity. A coin can be either,
 *   both or neither, so "listed" sits beside the ladder chip, not instead of it.
 */
export type StatusBadge = { label: "listed" | "graduated" | "graduating" | "launching" | "placing ladder" | "unlisted"; tone: "success" | "accent" | "warning" | "muted" };

type LadderState = "placing" | "selling" | "soldOut" | "armed" | "graduated";

export function statusBadges(token: {
  verified?: boolean | null;
  launchedOnIter: boolean;
  graduatedAt?: number | null;
  ladderState?: LadderState | null;
}): StatusBadge[] {
  const badges: StatusBadge[] = [];
  if (token.launchedOnIter) {
    // Before "launching": a placing coin has nothing for sale, so saying it is
    // launching invites a buyer to a book with no asks on it.
    if (token.ladderState === "placing") badges.push({ label: "placing ladder", tone: "warning" });
    else if (token.ladderState === "graduated" || token.graduatedAt != null) badges.push({ label: "graduated", tone: "success" });
    else if (token.ladderState === "soldOut" || token.ladderState === "armed") badges.push({ label: "graduating", tone: "accent" });
    else badges.push({ label: "launching", tone: "warning" });
  }
  if (token.verified) badges.push({ label: "listed", tone: "success" });
  // A token that arrived any other way and is not listed: say so, never "launching".
  if (badges.length === 0) badges.push({ label: "unlisted", tone: "muted" });
  return badges;
}
