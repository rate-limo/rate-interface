import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { PonderLinks } from "@/consts";
import { getPairBySymbol } from "@/queries/server/pairs";
import { getTokenByAddress, getTokenBySymbol } from "@/queries/server/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  if (number >= 1_000_000_000_000) return `$${(number / 1_000_000_000_000).toFixed(1)}T`;
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(1)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
  return `$${number.toFixed(2)}`;
};

function Shell({ eyebrow, title, subtitle, stats, logo }: { eyebrow: string; title: string; subtitle: string; stats: Array<[string, string]>; logo?: string | null }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 76px", background: "#111", color: "#f5f5f5", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {logo ? (
          <img
            src={logo}
            width={132}
            height={132}
            style={{ width: 132, height: 132, borderRadius: 66, border: "1px solid #333", objectFit: "cover" }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#a3e635", fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{eyebrow}</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>{title}</div>
          <div style={{ display: "flex", marginTop: 12, color: "#a1a1aa", fontSize: 28 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", minWidth: 210, padding: "20px 24px", border: "1px solid #333", borderRadius: 18, background: "#1b1b1b" }}>
            <div style={{ display: "flex", color: "#8b8b8b", fontSize: 19 }}>{label}</div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 30, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", color: "#71717a", fontSize: 20, letterSpacing: 1 }}>RATE · rate.limo</div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") ?? "section";
  const network = params.get("network") ?? "RISE Testnet";
  const section = params.get("section") ?? "explore";

  if (kind === "section") {
    return new ImageResponse(<Shell eyebrow="Rate Explore" title={`${section[0]?.toUpperCase() ?? "E"}${section.slice(1)}`} subtitle={`Discover ${section} on ${network}`} stats={[["Network", network], ["Live directory", "Onchain"], ["Shareable", "Yes"]]} />, { width: 1200, height: 630 });
  }

  try {
    if (kind === "token") {
      const key = params.get("token") ?? "";
      const token = key.startsWith("0x") ? await getTokenByAddress(network, key) : await getTokenBySymbol(network, key);
      // Only an absolute http(s) logo: ImageResponse fetches this at render
      // time, and a relative or data: source throws — which would fail the
      // whole card rather than merely lose the mark.
      const logo = typeof token.logoURI === "string" && /^https?:\/\//.test(token.logoURI) ? token.logoURI : null;
      // Address is truncated: the full 42 characters crowded the line and is
      // not what anyone reads a share card for.
      const addr = token.id ? `${token.id.slice(0, 6)}…${token.id.slice(-4)}` : "";
      const card = (withLogo: string | null) => (
        <Shell
          eyebrow="Rate Token"
          title={`${token.name || token.symbol} (${token.symbol})`}
          subtitle={`${network}${addr ? ` · ${addr}` : ""}`}
          stats={[["Price", money(token.priceUSD)], ["Market cap", money(token.marketCap)], ["24H volume", money(token.dayVolumeUSD)]]}
          logo={withLogo}
        />
      );
      try {
        return new ImageResponse(card(logo), { width: 1200, height: 630 });
      } catch {
        // A logo host that 404s or times out must not cost the whole preview.
        return new ImageResponse(card(null), { width: 1200, height: 630 });
      }
    }
    if (kind === "pool") {
      const [base, quote] = (params.get("pair") ?? "").split("_");
      const pair = await getPairBySymbol(network, base ?? "", quote ?? "");
      const tvl = Number(pair?.dayBaseTvlUSD ?? 0) + Number(pair?.dayQuoteTvlUSD ?? 0);
      const volume = Number(pair?.dayBaseVolumeUSD ?? 0) + Number(pair?.dayQuoteVolumeUSD ?? 0);
      return new ImageResponse(<Shell eyebrow="Rate Pool" title={pair?.symbol || `${base}/${quote}`} subtitle={`${network} · CLOB liquidity`} stats={[["TVL", money(tvl)], ["24H volume", money(volume)], ["Taker fee", "from 0.10%"]]} />, { width: 1200, height: 630 });
    }
    if (kind === "auction") {
      const response = await fetch(`${PonderLinks[network]}/api/auctions`, { cache: "no-store" });
      const payload = await response.json() as { auctions?: Array<Record<string, unknown>> };
      const auction = payload.auctions?.find((row) => String(row.presaleId) === params.get("id"));
      const title = String(auction?.name ?? auction?.symbol ?? `Auction ${params.get("id") ?? ""}`);
      const target = Number(auction?.targetRaise ?? 0) / 10 ** Number(auction?.quoteDecimals ?? 18);
      const committed = Number(auction?.totalCommitted ?? 0) / 10 ** Number(auction?.quoteDecimals ?? 18);
      return new ImageResponse(<Shell eyebrow="Rate Auction" title={title} subtitle={`${network} · Auction launch`} stats={[["Target raise", money(target)], ["Committed", money(committed)], ["Status", String(auction?.status ?? "Live")]]} />, { width: 1200, height: 630 });
    }
  } catch {
    // Fall through to a useful generic card when an indexer is temporarily unavailable.
  }

  return new ImageResponse(<Shell eyebrow="Rate Explore" title="Explore on Rate" subtitle={network} stats={[["Network", network], ["Data", "Refreshing"], ["Markets", "Onchain"]]} />, { width: 1200, height: 630 });
}
