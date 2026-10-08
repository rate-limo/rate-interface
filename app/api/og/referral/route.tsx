import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { supportedNetworkName } from "@/lib/routing/chainParams";
import { getAccountProfileForViewer } from "@/queries/server/profile";
import { referralShareLink } from "@/lib/referral/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same palette as `/api/og/profile`: the accent is the frame and the brand bar. */
const INK = "#0b0b0f";
const CARD = "#141419";
const MUTED = "#8b8b93";
const ACCENT = "#E85D2A";

/** A code is the vanity/derived shape admin-service mints; anything else is refused. */
const CODE_SHAPE = /^[A-Z0-9]{3,24}$/;
const LOOKUP_TIMEOUT_MS = 2500;

/**
 * Who a code belongs to, as a display name — or null.
 *
 * Resolved through this app's own `/referral/resolve`, the same pinned origin
 * the invite page and onboarding use, so the card and the landing it links to
 * can never disagree about whose code this is. Every failure is null: a card
 * that says "You're invited" is still true, a card that 500s unfurls as nothing.
 */
async function inviterName(origin: string, code: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/referral/resolve/${code}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: unknown };
    if (typeof body.address !== "string" || !isAddress(body.address)) return null;
    const address = getAddress(body.address);
    const profile = (await getAccountProfileForViewer(supportedNetworkName(""), address, undefined)) as
      | { profile?: { displayName?: string | null; handle?: string | null } }
      | null;
    return profile?.profile?.displayName?.trim() || profile?.profile?.handle?.trim() || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!CODE_SHAPE.test(code)) return new Response("invalid code", { status: 400 });

  const name = await inviterName(req.nextUrl.origin, code);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
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
            justifyContent: "center",
            flex: 1,
            background: CARD,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: "0 72px",
          }}
        >
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
            {name ? `${name} invited you` : "You're invited"}
          </div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 70, fontWeight: 700, letterSpacing: -2 }}>
            Join Rate
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>Invite code</div>
            <div
              style={{
                display: "flex",
                marginLeft: 22,
                padding: "10px 26px",
                borderRadius: 14,
                border: `2px solid ${ACCENT}`,
                color: ACCENT,
                fontSize: 52,
                fontWeight: 700,
                letterSpacing: 6,
              }}
            >
              {code}
            </div>
          </div>
        </div>

        {/* the brand bar — part of the frame, same as the profile card */}
        <div style={{ display: "flex", alignItems: "center", height: 86, paddingLeft: 12, paddingRight: 12, color: INK }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: -2 }}>Rate</div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 26, fontWeight: 700 }}>
            {referralShareLink(code)}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
