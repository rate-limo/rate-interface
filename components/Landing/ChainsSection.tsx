import { findChain } from "@iter/deployments";
import { Container } from "@components/Landing/ui/Container";
import { Reveal } from "@components/Landing/ui/Reveal";
import { ChainTabs } from "@components/Landing/ChainTabs";
import { Button } from "@components/Landing/ui/Button";
import { getVisibleChains } from "@/lib/chains/visibleServer";
import { networkNameToSlug } from "@/consts";
import { gasSymbol } from "@/lib/chains/gasToken";

/**
 * "Multichain" as a list the site can't get wrong.
 *
 * The chains come from the same place the trading row's tape does: the
 * operator's visible list (identity-service `/chains/display`) over the build's
 * `SUPPORTED_CHAINS`, falling back to the build's list when the service can't
 * answer. So a chain added to the registry and switched on appears here with
 * no copy change, and a hidden one disappears — nothing is hardcoded, which is
 * the point: a hand-written "live on N chains" is the kind of claim that goes
 * stale silently.
 *
 * Chain ID, gas asset and the mainnet/testnet split come from `@iter/deployments`
 * (`testnet` on each chain), never a local table or the chain's name.
 * Arc's gas asset is USDC; writing "ETH" for every chain is the mistake this
 * avoids.
 *
 * No market count: the only synchronous source is the tape's, read from the
 * static token list, which has no Arc pairs and printed "—" beside a chain
 * with live markets. A link to trade there says "it's real" better than a
 * number that is wrong on half the chains.
 *
 * The copy promises nothing about which chains are next: a chain is added once
 * its deployment is recorded and its gateways answer (apps/web/CLAUDE.md,
 * Conventions → Chains), and naming one early is how Monad ended up offering a
 * route to a contract that did not exist.
 */
export async function ChainsSection() {
  const visible = await getVisibleChains();
  const chains = visible
    .map((name) => ({ name, chain: findChain(name) }))
    .filter((c): c is { name: string; chain: NonNullable<ReturnType<typeof findChain>> } => Boolean(c.chain));
  if (chains.length === 0) return null;

  return (
    <section className="border-t border-white/5 py-24 md:py-32">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-medium tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            One protocol. Your rate on every chain it runs on.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-dark-grey-1">
            The same order book, the same launchpad and the same holder-first
            liquidity, deployed natively on each chain. One portfolio and one
            Explore view across all of them, and one profile that follows your
            wallet everywhere.
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <ChainTabs
            chains={chains.map(({ name, chain }) => ({
              name,
              chainId: chain.chainId,
              gas: gasSymbol(chain.chainId, chain.nativeCurrency.symbol) ?? chain.nativeCurrency.symbol,
              testnet: chain.testnet,
              slug: networkNameToSlug[name] ?? null,
            }))}
          />
        </Reveal>

        {/* The integration ask. Real-world assets are the case a chain team
            feels most: they trade around a known value, and a curve is the
            wrong shape for that. No compliance claim — Rate provides none. */}
        <Reveal delay={0.1}>
          <div className="mt-10 grid items-center gap-6 rounded-2xl border border-[color:var(--m-accent)]/40 bg-black-300 p-7 md:grid-cols-[1fr_auto] md:p-9">
            <div>
              <h3 className="font-display text-2xl font-medium tracking-tight text-white sm:text-3xl">
                Your chain needs a real market. Bring Rate to it.
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {["Built for real-world assets", "Quote at NAV with limit orders", "No curve slippage on size", "A launch venue for your ecosystem"].map((t) => (
                  <li key={t} className="rounded-full border border-dark-grey-3 px-3 py-1 text-[13px] text-dark-grey-1">{t}</li>
                ))}
              </ul>
            </div>
            <Button href="/integrate">Apply to integrate</Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
