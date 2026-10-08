// Namespaced for the broker, which calls StreamTypes.eventToStream(...).
export * as StreamTypes from "./streams";
// ...and flat, so apps/web can re-export these directly instead of keeping the
// hand-maintained SECOND copy of the wire format it used to have. That copy had already
// drifted on three schemas; one definition is what stops it recurring. No collisions with
// ./orderbook (checked), and tables stays namespaced.
export * from "./streams";
export * as TableTypes from "./tables";
export * from "./orderbook";

// Support tickets — shared by apps/web (writes), admin-service (writes) and
// apps/admin (reads). Flat, like ./streams: all three import these directly.
export * from "./support";
// Verifying that a transaction actually moved value to an account. Shared so
// apps/web and identity-service cannot disagree about what counts as a deposit.
export * from "./transfer";
export * from "./transferRoutes";

// Earn-config defaults — shared by the broker's accrual, admin-service's
// missing-row fallback and packages/db's column defaults — and the referral
// fee → points formula, shared by the accrual and admin-service's live
// referral report. Flat, like ./support: every consumer imports these
// directly. See ./earn for why one copy.
export * from "./earn";

// ITER season payouts — the budget split and the Disperse matcher, shared by the
// broker (which records Disperse events) and admin-service (manual verify), and
// the reward-asset lookup through identity-service. One implementation, or the
// two paths disagree about who has been paid.
export * from "./rewardPayout";

// User profiles — the generated default identity + shape rules, shared by
// apps/gateway (generates on first read) and apps/admin-service (validates
// edits against the same rules). Flat, like ./support.
export * from "./profile";

// TradingView UDF ticker convention for the market-cap chart variant, shared
// by apps/gateway (routes /symbols and /history off it) and apps/web (builds
// the ticker it hands the widget). Flat, like ./support.
export * from "./tradingviewSymbol";

// One flat carry-forward candle, shared by the broker's CandleTick (which
// writes them for graduated pairs) and the gateway's densify (which rebuilds
// them on read for everything else). See ./candles/flatRow for why one copy.
export * from "./candles/flatRow";

// Cost basis — the weighted-average fold behind realised PnL, shared by the
// broker (which folds it over live fills) and apps/gateway (which replays it to
// build a PnL series). Flat, like ./earn. See ./costBasis for why one copy is
// not a style preference here: a weighted average does not commute, so a second
// implementation produces a plausible wrong number rather than an obvious one.
export * from "./costBasis";
