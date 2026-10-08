import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { supportedNetworkName } from "@/lib/routing/chainParams";
// From `imageUrl`, NOT `profile`: the latter is "use client" and calling into it
// from this Node route throws at request time and 500s the whole card.
import { profileImageUrl } from "@/lib/portfolio/imageUrl";
import {
  getAccountProfileForViewer,
  getBalanceHistory,
  getPnlHistory,
  getPnlRank,
} from "@/queries/server/profile";
import { getAccountPositions } from "@/queries/server/account";
import {
  fallbackAvatarUrl,
  fallbackBannerGradient,
  money,
  pct,
  pickTopMovers,
  rankLabel,
  signedMoney,
  sparklinePath,
  tone,
  type CardPoint,
  type CardPosition,
} from "@/lib/og/profileCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UP = "#22c55e";
const DOWN = "#f24822";
const MUTED = "#8b8b93";
const INK = "#0b0b0f";
const CARD = "#141419";
/** `--m-accent` from globals.css. The frame and the footer are the brand. */
const ACCENT = "#E85D2A";

/** How long a remote image may take before the card gives up on it. */
const IMAGE_TIMEOUT_MS = 2500;
/** Refuse anything that would bloat the card past what an unfurler will fetch. */
const MAX_IMAGE_BYTES = 3_000_000;

/**
 * Fetch a remote image and inline it as a data URI, or null.
 *
 * ## Why the card does its own fetching
 *
 * Satori resolves remote `<img src>` itself, and a source it cannot reach
 * **throws while the response is streaming** — after `new ImageResponse()` has
 * already returned. There is no try/catch position that can recover it, so one
 * unreachable logo took the whole card down with it, and this route's failures
 * are invisible because crawlers are the usual caller.
 *
 * Fetching here inverts that: a logo that times out becomes `null`, the card
 * draws its fallback disc, and everything else on it still renders. Which is the
 * rule the rest of this file already follows — degrade to something true, never
 * to nothing.
 *
 * It also bounds the work. Satori's fetches are unbounded; these carry a timeout
 * and a size cap, and they run in parallel with each other rather than serially
 * during layout.
 */
async function inlineImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      next: { revalidate: 0 },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    /**
     * Raster formats AND `image/svg+xml`.
     *
     * SVG is in the list because real token logos are SVGs — SKHY's, on Arc, is
     * a wikimedia `.svg` — and satori resolves an svg data URI natively, so
     * excluding it cost a coin its mark for no benefit. What stays excluded is
     * everything that is NOT an image: an HTML error page served with a 200 is
     * the case this guard exists for, and it is the one that fails inside
     * layout where no caller can recover it.
     */
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)/i.test(type)) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${type.split(";")[0]};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The share card for `/profile/[address]`.
 *
 * Profile links had no card at all — no image, no title — so every share of a
 * wallet rendered as a bare URL.
 *
 * ## What it may claim, and what it must not
 *
 * The balance figures come from `/balance-history`, which the gateway marks
 * `selfReported`: they are a multicall the BROWSER made and posted, and the
 * server cannot re-derive or check them. That route's own comment says the flag
 * exists "so a consumer cannot render the number without having been told what
 * it is" — and a public share card is exactly that consumer, since the number
 * travels far from any page that could caveat it.
 *
 * So the card LABELS it. The write is signed, so the figure is attributable to
 * the wallet: this is the wallet's own statement of its balance, which is a
 * different and weaker claim than a measurement, and the card says which.
 *
 * Everything else on it — rank, trades, volume, realised PnL per position — is
 * derived server-side from fills and needs no such caveat.
 *
 * ## The standing is the headline
 *
 * The top-right slot carries `#rank` off the realised-PnL board, because that is
 * the one number on the card that is COMPARATIVE — a trade count says how busy a
 * wallet is, a rank says how it did against everyone else, and a card is shared
 * to make the second point. Trades fall back into that slot only for a wallet
 * the board does not rank, which is a wallet with no fills at all.
 *
 * ## It degrades to a real card, not a broken one
 *
 * On this venue most wallets have no recorded balance history at all: `points`
 * is empty and `latestUsd` is null. The value block then renders an em-dash, the
 * chart is omitted entirely rather than drawn flat at zero, and the movers list
 * simply does not appear. What survives is the identity — which is still worth
 * a card, and is the half a link is usually shared for.
 *
 * The same rule covers pictures. An unset avatar or banner is not a hole: both
 * fall back to a mark seeded on the address (see `profileCard.ts`), so a wallet
 * that has uploaded nothing still gets a card that looks deliberate. Only a
 * picture that was SET and could not be fetched degrades to a plain disc.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = params.get("address") ?? "";
  // `?chain=` is optional; an absent or unknown slug resolves to the default,
  // which is what `supportedNetworkName` is for.
  const networkName = supportedNetworkName(params.get("chain") ?? "");

  if (!isAddress(raw)) {
    return new Response("invalid address", { status: 400 });
  }
  const address = getAddress(raw);

  // Every leg is independent and each is allowed to fail: a card that 500s
  // because one read timed out is worse than a card missing one figure.
  const [profileRes, historyRes, positionsRes, rankRes, pnlRes] = await Promise.allSettled([
    getAccountProfileForViewer(networkName, address, undefined),
    getBalanceHistory(networkName, address, 30),
    getAccountPositions(networkName, address),
    getPnlRank(networkName, address),
    getPnlHistory(networkName, address, 30),
  ]);
  const leg = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const profile = leg(profileRes) as Record<string, any> | null;
  const history = leg(historyRes) as Record<string, any> | null;
  const positions = leg(positionsRes) as Record<string, any> | null;
  const rankData = leg(rankRes) as Record<string, any> | null;
  const pnl = leg(pnlRes) as Record<string, any> | null;

  const handle: string =
    profile?.profile?.displayName ??
    profile?.profile?.handle ??
    `${address.slice(0, 6)}…${address.slice(-4)}`;
  /**
   * Absolutised, because Satori has no origin to resolve against.
   *
   * The gateway serves `avatarUrl` as `/api/avatar/<sha256>` — a path, built from a
   * validated hash, never a URL a user can choose. Inside an `ImageResponse` that path
   * resolves against nothing, so the avatar silently failed to render on every card;
   * `profileImageUrl` prefixes the chain's gateway and passes an already-absolute URL
   * through unchanged.
   *
   * An automated review read this as SSRF. It is not — there is no attacker-supplied
   * host to steer at a private range, since the value is `/api/avatar/` plus 64 hex
   * characters. The fix is right for the rendering reason, not that one.
   */
  const avatarSrc: string =
    profileImageUrl(networkName, profile?.profile?.avatarUrl ?? null) ??
    fallbackAvatarUrl(address);
  const bannerSrc: string | null = profileImageUrl(
    networkName,
    profile?.profile?.bannerUrl ?? null,
  );

  const trades = Number(profile?.stats?.trades ?? 0);
  const volumeUsd = Number(profile?.stats?.volumeUsd ?? 0);
  const followers = Number(profile?.social?.followers ?? 0);
  const createdTokens = Number(profile?.stats?.createdTokens ?? 0);
  // The join date is the indexer's first sighting, so an unresolved one is an
  // em-dash rather than the epoch — which would read as "joined in 1970".
  const joinedRaw = profile?.profile?.joinedAt;
  const joinedDate = joinedRaw ? new Date(joinedRaw) : null;
  const joined =
    joinedDate && !Number.isNaN(joinedDate.getTime())
      ? joinedDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "—";

  /**
   * The series, and which of the two sources produced it.
   *
   * BALANCE first when it exists, because "what your portfolio is worth" is the
   * headline a reader expects. It almost never exists: recording it costs the
   * wallet a signature, and `accountBalanceDayBuckets` holds one row across the
   * whole venue — so the fallback is the normal path, not the exceptional one.
   *
   * REALISED PNL otherwise, folded from fills server-side. Only when the gateway
   * says its replay agrees with the stored ledger: `matchesLedger` false means
   * the re-derivation and the broker disagree, and a chart is the worst possible
   * place to show a number nobody can vouch for. The card then degrades to the
   * stat strip, which is what it already does for a wallet with no series.
   *
   * Two points minimum either way — `sparklinePath` refuses one, because a
   * single reading is not a line and drawing it flat invents a history.
   */
  const balancePoints = (Array.isArray(history?.points) ? history.points : []) as CardPoint[];
  const pnlUsable = pnl?.matchesLedger === true && Array.isArray(pnl?.points);
  const pnlPoints = (pnlUsable ? pnl.points : []) as CardPoint[];

  const usePnl = balancePoints.length < 2 && pnlPoints.length >= 2;
  const points = usePnl ? pnlPoints : balancePoints;

  const latestUsd = usePnl
    ? (typeof pnl?.total === "number" ? pnl.total : null)
    : (typeof history?.latestUsd === "number" ? history.latestUsd : null);
  const change = usePnl
    ? (typeof pnl?.change === "number" ? pnl.change : null)
    : (typeof history?.change === "number" ? history.change : null);
  const selfReported = !usePnl && history?.selfReported === true && latestUsd !== null;
  const fillCount = typeof pnl?.fills === "number" ? pnl.fills : 0;

  /** What the big number is. The card must never leave this to inference — a
   *  realised-PnL figure read as a portfolio balance is a lie by omission. */
  const valueCaption = usePnl
    ? `Realised PnL · ${fillCount.toLocaleString("en-US")} ${fillCount === 1 ? "fill" : "fills"}`
    : selfReported
      ? "Self-reported balance · past 30d"
      : "No recorded balance";

  const movers = pickTopMovers(
    (Array.isArray(positions?.positions) ? positions.positions : []) as CardPosition[],
    2,
  );

  const rank = rankLabel(
    typeof rankData?.rank === "number" ? rankData.rank : null,
  );
  const rankTotal =
    typeof rankData?.totalCount === "number" && rankData.totalCount > 0
      ? rankData.totalCount
      : null;

  // Every remote picture at once, each allowed to fail on its own. Serially this
  // would be four timeouts deep in the worst case.
  const [avatar, banner, ...moverLogos] = await Promise.all([
    inlineImage(avatarSrc),
    inlineImage(bannerSrc),
    ...movers.map((m) => inlineImage(profileImageUrl(networkName, m.logoURI ?? null))),
  ]);

  const dir = tone(change);
  const accent = dir === "down" ? DOWN : dir === "up" ? UP : MUTED;
  const spark = sparklinePath(points, 1032, 88);
  const bannerFill = fallbackBannerGradient(address);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          // The frame. Everything inside sits on the dark card; the brand colour
          // is the border and the footer, which is what makes the card readable
          // as ours at thumbnail size in a timeline.
          background: ACCENT,
          color: "#f5f5f7",
          fontFamily: "Arial",
          padding: "14px 14px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: CARD,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            overflow: "hidden",
          }}
        >
          {/* the banner band — uploaded, or seeded on the address */}
          <div
            style={{
              display: "flex",
              height: 84,
              width: "100%",
              ...(banner
                ? {}
                : { backgroundImage: bannerFill, backgroundColor: "#1b1b22" }),
            }}
          >
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={banner}
                width={1172}
                height={84}
                alt=""
                style={{ width: 1172, height: 84, objectFit: "cover" }}
              />
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "0 40px 22px",
            }}
          >
            {/* identity.
                The ROW sits below the band and only the AVATAR reaches up into
                it, via its own negative margin. Pulling the whole row up instead
                put the 44px name across the band's lower edge, where a light
                name on a light-ish gradient is the one thing on the card that
                must stay legible at thumbnail size. */}
            <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  width={104}
                  height={104}
                  alt=""
                  style={{
                    width: 104,
                    height: 104,
                    borderRadius: 52,
                    objectFit: "cover",
                    border: `4px solid ${CARD}`,
                    background: "#2b2b34",
                    marginTop: -52,
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    width: 104,
                    height: 104,
                    borderRadius: 52,
                    background: "#2b2b34",
                    border: `4px solid ${CARD}`,
                    marginTop: -52,
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginLeft: 20,
                }}
              >
                <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
                  {handle}
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 8,
                    alignSelf: "flex-start",
                    padding: "3px 14px",
                    borderRadius: 999,
                    background: "#2a2410",
                    color: ACCENT,
                    fontSize: 20,
                    fontWeight: 700,
                  }}
                >
                  Portfolio
                </div>
              </div>

              {/* the standing — the comparative number, and the reason to share */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginLeft: "auto",
                  alignItems: "flex-end",
                }}
              >
                {/* No fragments here: satori walks the element tree itself and
                    every node it lays out has to be a styled box, so a branch
                    returns ONE div rather than a pair of loose siblings. */}
                {rank ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline" }}>
                      <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: ACCENT }}>
                        #
                      </div>
                      <div style={{ display: "flex", fontSize: 52, fontWeight: 700, marginLeft: 4 }}>
                        {rank.slice(1)}
                      </div>
                    </div>
                    <div style={{ display: "flex", fontSize: 19, color: MUTED, marginTop: 2 }}>
                      {rankTotal
                        ? `of ${rankTotal.toLocaleString("en-US")} traders`
                        : "by realised PnL"}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
                  >
                    <div style={{ display: "flex", fontSize: 19, color: MUTED }}>Trades</div>
                    <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
                      {trades.toLocaleString("en-US")}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* the value block */}
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 16 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2 }}>
                  {money(latestUsd)}
                </div>
                <div style={{ display: "flex", marginTop: 4, fontSize: 21, color: MUTED }}>
                  {/* Named, not hidden. The gateway marks this self-reported
                      because the server cannot check it; the card carries that
                      with the number rather than leaving it on a page. */}
                  {valueCaption}
                </div>
              </div>
              {/* The change only when there IS a series to change against. With no
                  history the strip below carries volume, and repeating it here put
                  the same figure on the card twice. */}
              {latestUsd === null ? null : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginLeft: "auto",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: accent }}>
                    {signedMoney(change)}
                  </div>
                  <div style={{ display: "flex", marginTop: 4, fontSize: 21, color: MUTED }}>
                    Past 30d
                  </div>
                </div>
              )}
            </div>

            {/* No series means no chart, and the chart is half the card's
                height — so the space it would have taken is filled with figures
                that ARE server-derived rather than left as a void. Same rule as
                the panels: degrade to something true, never to something empty.

                TWO densities, because the card has a fixed 630px and the movers
                list is not optional. Tiles when the movers list is absent and
                there is room for them; a single chip line when it is present,
                where five tiles overflow the footer and clip the first mover. */}
            {!spark && movers.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: 18,
                  padding: "11px 20px",
                  borderRadius: 16,
                  background: "#1b1b22",
                  border: "1px solid #26262f",
                  gap: 10,
                }}
              >
                {(
                  [
                    ["Volume", volumeUsd > 0 ? money(volumeUsd) : "—"],
                    ["Trades", trades.toLocaleString("en-US")],
                    ["Followers", String(followers)],
                    ["Coins", String(createdTokens)],
                    ["Joined", joined],
                  ] as Array<[string, string]>
                ).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", alignItems: "baseline", flex: 1 }}>
                    <div style={{ display: "flex", fontSize: 18, color: MUTED }}>{label}</div>
                    <div
                      style={{ display: "flex", fontSize: 24, fontWeight: 700, marginLeft: 10 }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!spark && movers.length === 0 ? (
              <div style={{ display: "flex", marginTop: "auto", gap: 14 }}>
                {(
                  [
                    ["Volume", volumeUsd > 0 ? money(volumeUsd) : "—"],
                    ["Trades", trades.toLocaleString("en-US")],
                    ["Followers", String(followers)],
                    ["Coins", String(createdTokens)],
                    ["Joined", joined],
                  ] as Array<[string, string]>
                ).map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      padding: "16px 20px",
                      borderRadius: 16,
                      background: "#1b1b22",
                      border: "1px solid #26262f",
                    }}
                  >
                    <div style={{ display: "flex", fontSize: 18, color: MUTED }}>{label}</div>
                    <div style={{ display: "flex", marginTop: 6, fontSize: 28, fontWeight: 700 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* the series, omitted rather than faked */}
            {spark ? (
              <div style={{ display: "flex", marginTop: 16 }}>
                <svg width={1032} height={88} viewBox="0 0 1032 88">
                  <path d={spark.area} fill={accent} fillOpacity={0.16} />
                  <path
                    d={spark.line}
                    fill="none"
                    stroke={accent}
                    strokeWidth={6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ) : null}

            {movers.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: "auto",
                  paddingTop: 14,
                  // `dashed`, not `dotted`. Satori accepts only solid | dashed and
                  // THROWS on anything else, so this 500'd the whole card — and a share
                  // card's failures are invisible, because the usual caller is a crawler
                  // that simply renders no preview.
                  borderTop: "3px dashed #2b2b34",
                  gap: 10,
                }}
              >
                {movers.map((m, i) => (
                  <div key={m.symbol + i} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ display: "flex", color: MUTED, fontSize: 24, width: 32 }}>
                      {i + 1}.
                    </div>
                    {moverLogos[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={moverLogos[i] as string}
                        width={38}
                        height={38}
                        alt=""
                        style={{ width: 38, height: 38, borderRadius: 19, objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          background: "#2b2b34",
                        }}
                      />
                    )}
                    <div style={{ display: "flex", marginLeft: 16, fontSize: 30, fontWeight: 700 }}>
                      {m.symbol}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        marginLeft: "auto",
                        color: m.pnlUsd < 0 ? DOWN : UP,
                      }}
                    >
                      <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
                        {signedMoney(m.pnlUsd)}
                      </div>
                      {m.pctChange === null ? null : (
                        <div style={{ display: "flex", fontSize: 24, marginLeft: 12 }}>
                          {`(${m.pctChange < 0 ? "▼" : "▲"} ${pct(m.pctChange)})`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* the brand bar — part of the frame, not a line inside the card */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 86,
            paddingLeft: 12,
            paddingRight: 12,
            color: INK,
          }}
        >
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: -2 }}>
            iter
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: "auto",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", fontSize: 20, opacity: 0.72 }}>Start trading at</div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700 }}>rate.limo</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
