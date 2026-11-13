import type { ExchangeDoc, ExchangeShipmentSnapshot } from '../../database/mongo/documents.js';
import { hasExchangeDispute } from './exchange-inspection.js';

export function hasCarrierLabels(exchange: ExchangeDoc): exchange is ExchangeDoc & {
  initiatorShipment: ExchangeShipmentSnapshot;
  recipientShipment: ExchangeShipmentSnapshot;
} {
  const first = exchange.initiatorShipment;
  const second = exchange.recipientShipment;
  return first?.method === 'carrier' && second?.method === 'carrier' &&
    Boolean(first.trackingCode && second.trackingCode && first.trackingCode !== second.trackingCode);
}

export function canStartCarrierPickup(exchange: ExchangeDoc, now: Date) {
  return exchange.status === 'Preparing' &&
    Boolean(exchange.initiatorFundedAt && exchange.recipientFundedAt &&
      exchange.shippingDeadline && exchange.shippingDeadline > now) &&
    !hasExchangeDispute(exchange) &&
    hasCarrierLabels(exchange);
}
