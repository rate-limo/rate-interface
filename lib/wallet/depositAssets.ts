import defaultTokenList from "@iter/token-list";
import type { SpotTokenWithBalance } from "@/types/tables/tokens";

/**
 * Which assets a deposit screen offers before anyone searches.
 *
 * ## Why this is a safety filter, not a relevance one
 *
 * A CEX curates its asset list for relevance — every coin in it is one they chose
 * to list, so the worst a wrong tap costs is the wrong investment. Here anyone
 * can launch a token, **including one whose symbol is already taken**, so the
 * same list curated the same way is a way to lose money by tapping the wrong
 * `USDC`. A deposit to the wrong address is unrecoverable.
 *
 * So the default list is only assets whose identity somebody has already
 * established, and everything else is reachable by searching for it.
 *
 * ## `verified` already means "graduated"
 *
 * The flag's own definition is the reason it can carry both jobs: it is
 * "admin-curated listing flag. FALSE until the market meets the quote-liquidity
 * threshold" (`types/tables/tokens`). So a launch that graduated — reached a real
 * market — becomes verified without an operator touching it, and an operator can
 * verify a token that never launched here at all.
 *
 * `creator` is what separates the two, and it is only a LABEL: empty means the
 * broker learned about it through `PairAdded` (USDC, WETH), non-empty means it
 * was launched through the generator. Both are trustworthy enough to list; the
 * badge just says which kind it is.
 */
export type AssetTrust = "held" | "verified" | "graduated" | "unverified";

export interface DepositAsset {
  token: SpotTokenWithBalance;
  trust: AssetTrust;
}

/** A launched coin that reached the listing threshold, versus an operator listing. */
function trustOf(token: SpotTokenWithBalance): AssetTrust {
  if (!token.verified) return "unverified";
  return (token.creator ?? "") !== "" ? "graduated" : "verified";
}

function held(token: SpotTokenWithBalance): boolean {
  const balance = Number(token.balance ?? 0);
  return Number.isFinite(balance) && balance > 0;
}

/**
 * The curated default: what this wallet holds, then everything trustworthy.
 *
 * Held assets come first and are included even when unverified — a balance is
 * the strongest possible statement that a token is one the user already deals
 * with, and hiding something they own behind a search would be absurd.
 */
export function defaultDepositAssets(tokens: readonly SpotTokenWithBalance[]): DepositAsset[] {
  const out: DepositAsset[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!held(token)) continue;
    seen.add(token.id.toLowerCase());
    out.push({ token, trust: "held" });
  }

  for (const token of tokens) {
    if (seen.has(token.id.toLowerCase())) continue;
    if (!token.verified) continue;
    seen.add(token.id.toLowerCase());
    out.push({ token, trust: trustOf(token) });
  }

  return out;
}

/**
 * Search across EVERYTHING, including the unverified tail.
 *
 * Matches the address as well as the name and symbol, because on this venue a
 * symbol is not an identity: two tokens can both be called BUCKO and only one is
 * the one the user means. A caller rendering these results must show the address
 * for the same reason — which is exactly what a curated row never needs.
 */
export function searchDepositAssets(
  tokens: readonly SpotTokenWithBalance[],
  query: string,
): DepositAsset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return tokens
    .filter((token) =>
      [token.symbol, token.name, token.id].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    )
    .map((token) => ({ token, trust: held(token) ? "held" : trustOf(token) }))
    // Trustworthy matches first, so a search for "usdc" cannot put an impostor
    // above the real one purely because it sorted earlier.
    .sort((a, b) => rank(a.trust) - rank(b.trust));
}

function rank(trust: AssetTrust): number {
  return trust === "held" ? 0 : trust === "verified" ? 1 : trust === "graduated" ? 2 : 3;
}

/** True when a result must show its address to be identifiable. */
export function needsAddress(trust: AssetTrust): boolean {
  return trust === "unverified";
}

/**
 * Does this chain have a native asset SEPARATE from its listed ERC-20s?
 *
 * ## Why this is asked at all
 *
 * A deposit list wants the chain's gas asset in it — that is the one thing a new
 * wallet cannot do without, and the only asset the app can send on the user's
 * behalf. So the list synthesises a row for it, because a gas asset is not an
 * ERC-20 and appears in no token list.
 *
 * On Arc that reasoning is false. The gas asset IS the USDC ERC-20 at
 * 0x3600…0000 — one pool of funds behind two interfaces, the native view at 18
 * decimals and the ERC-20 at 6 — so the synthesised row duplicates a token the
 * list already contains, and the deposit screen offers USDC twice. Worse than
 * cosmetic: the `native` flag is what tells the panel it may offer a one-click
 * send, so the two rows are not interchangeable and picking the wrong one sends
 * through the 18-decimal view.
 *
 * ## `iter_native`, not the symbol
 *
 * The token list already encodes this: `groupTokens["Arc Testnet"].iter_native`
 * is deliberately EMPTY and every other chain's has an entry. That is the same
 * signal `useTokenlistBalances` and `WalletTransferModal` already read, and
 * reading it here makes three surfaces agree instead of two.
 *
 * Matching `symbol === nativeCurrency.symbol` would reach the same answer on Arc
 * today and is exactly what apps/web/CLAUDE.md warns against: this venue lets
 * anyone mint a coin called USDC, so a symbol comparison hands a counterfeit the
 * native asset's privileges.
 *
 * An unknown chain answers TRUE — the old behaviour. Removing a chain's gas
 * asset because the token list has never heard of it is the worse failure of the
 * two available.
 */
export function hasDistinctNativeAsset(chainName: string): boolean {
  const groups = (defaultTokenList.groupTokens as Record<string, Record<string, unknown[]>>)[
    chainName
  ];
  if (!groups) return true;
  const native = groups["iter_native"];
  return Array.isArray(native) && native.length > 0;
}
