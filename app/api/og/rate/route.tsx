import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { parseRateCardKey, rateLine } from "@/lib/rateCard/share";
import { resolveRateCard } from "@/lib/rateCard/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The "my rate" card. Every number on it is read from the gateway for the order
 * the query names (see lib/rateCard) — nothing a sharer types reaches the
 * image. Three faces:
 *
 *   waiting — "My rate", the side, and the price, from the open order
 *   filled  — "Filled at my rate", from order history's status
 *   unknown — "Set your rate.", for a cancelled, unknown or unreachable order
 *
 * Brand: the night ground, the ladder mark, the one orange. No size and no
 * dollar figure, by the brand book's rules.
 */
const NIGHT = "#0D0F12";
const INK = "#EEF1F5";
const MUTED = "#8B95A3";
const ORANGE = "#E85D2A";
const GOOD = "#5FC596";

const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent("<svg width=\"512\" height=\"512\" viewBox=\"0 0 512 512\" xmlns=\"http://www.w3.org/2000/svg\"> <rect width=\"512\" height=\"512\" rx=\"64\" fill=\"#E85D2A\"/> <rect x=\"402.83\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"375.29\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"347.78\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"320.23\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"292.72\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"265.17\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"237.66\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"210.12\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"182.6\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"155.06\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"127.55\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"100.0\" y=\"101.29\" width=\"9.18\" height=\"309.42\" fill=\"#F7F9FC\"/> <rect x=\"402.83\" y=\"101.29\" width=\"9.18\" height=\"148.52\" opacity=\"0.08\" fill=\"#E85D2A\"/> <rect x=\"375.29\" y=\"110.57\" width=\"9.18\" height=\"146.97\" opacity=\"0.16\" fill=\"#E85D2A\"/> <rect x=\"347.78\" y=\"119.86\" width=\"9.18\" height=\"148.52\" opacity=\"0.24\" fill=\"#E85D2A\"/> <rect x=\"320.23\" y=\"135.32\" width=\"9.18\" height=\"148.52\" opacity=\"0.32\" fill=\"#E85D2A\"/> <rect x=\"292.72\" y=\"158.54\" width=\"9.18\" height=\"145.43\" opacity=\"0.4\" fill=\"#E85D2A\"/> <rect x=\"265.17\" y=\"186.39\" width=\"9.18\" height=\"145.43\" opacity=\"0.48\" fill=\"#E85D2A\"/> <rect x=\"237.66\" y=\"211.13\" width=\"9.18\" height=\"145.43\" opacity=\"0.56\" fill=\"#E85D2A\"/> <rect x=\"210.25\" y=\"231.25\" width=\"9.18\" height=\"146.97\" opacity=\"0.64\" fill=\"#E85D2A\"/> <rect x=\"182.6\" y=\"243.61\" width=\"9.18\" height=\"145.43\" opacity=\"0.72\" fill=\"#E85D2A\"/> <rect x=\"155.06\" y=\"259.1\" width=\"9.18\" height=\"140.79\" opacity=\"0.8\" fill=\"#E85D2A\"/> <rect x=\"127.55\" y=\"265.28\" width=\"9.18\" height=\"145.43\" opacity=\"0.88\" fill=\"#E85D2A\"/> <rect x=\"100.0\" y=\"279.22\" width=\"9.18\" height=\"131.5\" fill=\"#E85D2A\"/> </svg>")}`;

export async function GET(req: NextRequest) {
  const key = parseRateCardKey(req.nextUrl.searchParams);
  if (!key) return new Response("invalid order", { status: 400 });
  const order = await resolveRateCard(key);

  const known = order.state !== "unknown";
  const label = order.state === "filled" ? "FILLED AT MY RATE" : order.state === "waiting" ? "MY RATE" : "RATE";
  const verb = known ? `I'd ${key.side} ${order.baseSymbol} at` : "Pick a price. Walk away.";
  const headline = known ? rateLine(order.price, order.baseSymbol, order.quoteSymbol) : "Set your rate.";
  const status = order.state === "filled" ? "Filled" : order.state === "waiting" ? "Waiting" : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `radial-gradient(120% 140% at 85% 0%, #1D2D42 0%, #101824 45%, ${NIGHT} 100%)`,
          color: INK,
          fontFamily: "Arial",
          padding: "56px 72px",
          position: "relative",
        }}
      >
        {/* the ladder, as a quiet edge on the right */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 360, display: "flex", alignItems: "flex-end", gap: 10, paddingRight: 48, opacity: 0.55 }}>
          {[0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92].map((h, i) => (
            <div key={i} style={{ display: "flex", width: 8, height: `${h * 100}%`, background: `linear-gradient(180deg, rgba(232,93,42,0) 0%, rgba(232,93,42,${0.25 + i * 0.09}) 100%)` }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={LOGO} width={52} height={52} style={{ borderRadius: 12 }} />
          <div style={{ display: "flex", marginLeft: 16, fontSize: 38, fontWeight: 700, letterSpacing: -1.5 }}>Rate</div>
          {status ? (
            <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", padding: "8px 18px", borderRadius: 999, border: `2px solid ${order.state === "filled" ? GOOD : "rgba(238,241,245,0.25)"}`, color: order.state === "filled" ? GOOD : INK, fontSize: 24 }}>
              {status}{order.network ? ` · ${order.network}` : ""}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 74 }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: ORANGE }}>{label}</div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 38, color: MUTED }}>{verb}</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: headline.length > 26 ? 70 : 88, fontWeight: 700, letterSpacing: -3 }}>{headline}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Don't trade.</div>
            <div style={{ display: "flex", fontSize: 30, color: ORANGE }}>Let the market come to you.</div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 24, letterSpacing: 3, color: MUTED }}>RATE.LIMO</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
