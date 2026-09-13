import { PonderLinks, PonderWssLinks, supportedChains } from "@/consts";

// Derives the https:// origin a browser actually needs to warm (DNS + TCP + TLS)
// for a gateway host, regardless of whether the configured URL is http(s):// or
// ws(s)://  — preconnecting to the https origin of a wss host still warms the
// handshake the upgrade request will reuse.
function toHttpsOrigin(url: string): string | null {
  try {
    return `https://${new URL(url).host}`;
  } catch {
    return null;
  }
}

// Renders one <link rel="preconnect"> (+ dns-prefetch fallback) per unique gateway
// origin, derived from `supportedChains` — the single source of truth for which
// chains the app serves (@iter/deployments, re-exported by @/consts). This warms the handshake
// for every chain's REST and WS gateway before the user switches chains, so the
// first request/socket after a switch doesn't pay the handshake cost.
export default function PreconnectGateways() {
  const origins = new Set<string>();

  for (const network of supportedChains) {
    const restOrigin = PonderLinks[network]
      ? toHttpsOrigin(PonderLinks[network])
      : null;
    const wsOrigin = PonderWssLinks[network]
      ? toHttpsOrigin(PonderWssLinks[network])
      : null;
    if (restOrigin) origins.add(restOrigin);
    if (wsOrigin) origins.add(wsOrigin);
  }

  return Array.from(origins).flatMap((origin) => [
    <link key={`${origin}-preconnect`} rel="preconnect" href={origin} />,
    <link key={`${origin}-dns-prefetch`} rel="dns-prefetch" href={origin} />,
  ]);
}
