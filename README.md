# Iter Interface

The web interface for [Iter](https://rate.limo) — an on-chain order-book exchange.
This is the app served at `rate.limo`: the trading screens, the swap card, the
wallet, the portfolio, and the design system behind them.

It is a **public mirror**. The code is developed in a private monorepo and
exported here by a script, so this repository is generated rather than edited
directly. Pull requests are welcome; changes are applied upstream and appear here
on the next export.

## What is not here

Three things are held back, for two different reasons.

**Licensing.** `public/tradingview/` holds TradingView's Charting Library, which
is licensed to Iter and cannot be redistributed. `components/Organisms/TradingView/TradingViewChart.tsx`
is a stub with the same props, so everything that renders a chart still compiles
and lays out correctly. To run a real one, get your own licence from TradingView,
drop the bundle in `public/tradingview/`, and implement a datafeed.

`components/Chart/ThesisChart.tsx` — the token profile's chart — is **not**
stubbed. It is built on lightweight-charts, which is Apache-2.0.

**Server and data access.** Five modules read Postgres directly, and the schema
package behind them describes every table the indexer writes. They are replaced
by stubs that keep the same exports and types:

| Stubbed | What it does upstream |
|---|---|
| `lib/db.ts` | opens the Postgres pool |
| `lib/rows/content.ts` | reads the operator's site-row copy |
| `lib/liquidity/threshold.ts` | reads the graduation threshold |
| `lib/iter/protocolMetrics.ts` | aggregates protocol revenue |
| `lib/support/server.ts` | support tickets and threads |
| `packages/db` | the entire database schema |

Each stub returns what the real module returns when the database is unreachable
— a state every caller already handles — so the app degrades rather than
breaking. Where you see a fallback or an empty list, that is why.

**`queries/server/*` is NOT stubbed**, deliberately. Those are fetch clients
against the public indexer gateways, whose URLs are already compiled into the
bundle every visitor downloads. Withholding them would hide nothing and break
most of the app.

## Running it

```bash
pnpm install                 # also builds the vendored packages
cp .env.example .env.local
pnpm dev
```

`pnpm dev` runs with nothing configured — pages render with empty or fallback
data. The interface talks to services it does not contain: the indexer gateways
(compiled in from `packages/deployments`) and identity-service.

```bash
pnpm typecheck
pnpm test
pnpm build                   # needs the variables in .env.example
```

**`pnpm build` refuses to run without `ADMIN_SERVICE_URL` and one
`ADMIN_SERVICE_URL_<chainId>` per served chain.** That is not a missing default;
it is a guard. Next resolves rewrites at build time, so an unset value bakes
`http://localhost:4100` into the output — and the resulting failure is invisible,
because every hop answers 200 and the feature is simply gone. Any reachable URL
satisfies it. `.env.example` explains each one.

## Layout

```
app/            Next.js App Router — one directory per route
components/     UI, grouped by surface (Trade, Transfer, Swap, Shell…)
hooks/          React data hooks, mostly TanStack Query
lib/            the logic the components render; one folder per domain
queries/server/ server-side fetch clients for the indexer gateways
packages/       vendored workspace packages (types, deployments, token-list, abis)
```

Two conventions worth knowing before reading:

Comments explain **why**, not what — most of what looks like an odd decision has
a paragraph above it naming the failure it prevents.

Money is never rendered as a bare number. Rates are `1 ETH = 1,635 USDC` and
never carry a `$`; USD figures go through one formatter; a zero and a missing
value are different things and render differently.

## Licence

MIT, except `public/tradingview/` — which is not included here, and is governed
by TradingView's own licence.
