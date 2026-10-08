// utils/eventBus.ts
import EventEmitter from 'eventemitter3';
import { SpotAccountActivityEvent, SpotBarEvent, SpotDeleteOrderItemEvent, SpotOrderBlockEvent, SpotOrderEvent, SpotOrderHistoryEvent, SpotOrderMatchedEvent, SpotToken, SpotTradeEvent, SpotFillSummaryEvent } from '@/types';

export type SpotBalanceUpdateEvent = {
  token: SpotToken;
  balance: number;
};

export type SpotAllowanceUpdateEvent = {
  token: SpotToken;
  allowance: number;
};


type Events = {
  'spot-recent-overall-trades-update': SpotTradeEvent;
  'spot-bar-update': SpotBarEvent;
  'spot-orderblock-update': SpotOrderBlockEvent;
  'spot-trade-update': SpotTradeEvent;
  'spot-order-update': SpotOrderEvent;
  'spot-order-matched': SpotOrderMatchedEvent;
  'spot-trade-history-update': SpotTradeEvent;
  // One transaction's fills, already folded by the gateway. Carries every fill, so
  // it replaces the per-fill frames rather than summarizing them away.
  'spot-fill-summary': SpotFillSummaryEvent;
  'spot-order-history-update': SpotOrderHistoryEvent;
  'spot-order-delete': SpotDeleteOrderItemEvent;
  'spot-order-history-delete': SpotDeleteOrderItemEvent;
  // A launch, band position or presale of this wallet's changed — refetch, the
  // frame carries no row (see SpotAccountActivityEvent).
  'spot-account-activity': SpotAccountActivityEvent;
  'spot-balance-update': SpotBalanceUpdateEvent;
  // "Re-read the chain", as distinct from "here is the new balance".
  //
  // The order path can emit a figure because the click computed one. A SWAP
  // cannot: the amount delivered depends on how the route filled, and gas comes
  // out of the same pool on a chain whose gas asset is the token being traded.
  // Emitting an arithmetic guess there would put a wrong number on screen with
  // the authority of a confirmed trade, which is worse than the stale one it
  // replaces. So this carries nothing and every balance hook refetches.
  'spot-balance-refetch': [];
  'spot-allowance-update': SpotAllowanceUpdateEvent;
  'spot-token-price-update': SpotBarEvent;
  'primary-wallet-network-changed': { chainName: string, chainId: number };
};

export const eventBus = new EventEmitter<Events>();