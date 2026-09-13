// utils/eventBus.ts
import EventEmitter from 'eventemitter3';
import { SpotBarEvent, SpotDeleteOrderItemEvent, SpotOrderBlockEvent, SpotOrderEvent, SpotOrderHistoryEvent, SpotOrderMatchedEvent, SpotToken, SpotTradeEvent, SpotFillSummaryEvent } from '@/types';

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
  'spot-balance-update': SpotBalanceUpdateEvent;
  'spot-allowance-update': SpotAllowanceUpdateEvent;
  'spot-token-price-update': SpotBarEvent;
  'primary-wallet-network-changed': { chainName: string, chainId: number };
};

export const eventBus = new EventEmitter<Events>();