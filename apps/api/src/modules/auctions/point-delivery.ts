import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { canonicalJson } from '../../common/canonical-json.js';
import type {
  PointOrderDeliveryDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';

// ADR 0044: delivery from the point to the buyer's saved address in the
// supported service area, at the selected DirectSale policy fee (one demo
// area, fixed fee, the same as ordinary deliveries).
export const DELIVERY_SERVICE_AREA = 'HCM-DEMO-v1';

export async function deliveryPrice(
  tx: Tx,
  o: PointOrderDoc,
  addressId: string,
) {
  const address = await tx.c.member_addresses.findOne({
    _id: addressId.toLowerCase(),
    ownerId: o.buyerId,
  });
  if (!address) throw notFound();
  if (address.serviceAreaCode !== DELIVERY_SERVICE_AREA)
    invalidField(
      '/destinationAddressId',
      'Chọn địa chỉ nhận thuộc khu vực luân chuyển sách được hỗ trợ.',
    );
  const selection = await tx.c.sale_quote_policy_selection.findOne({
    _id: 'DirectSale',
  });
  const policy =
    selection &&
    (await tx.c.sale_quote_policies.findOne({ _id: selection.policyCode }));
  if (!policy || policy.shippingFee <= 0)
    throw new DomainError(
      503,
      'UNAVAILABLE',
      'Giao sách từ điểm hiện chưa có biểu phí.',
    );
  return { address, policyCode: policy._id, fee: policy.shippingFee };
}

// Payment body rules: CarrierOutbound names the address, its version and the
// fee the buyer saw; SelfCollect names none of them.
export function deliveryChoice(body: Wire['PayPointOrder']) {
  const method = body.fulfillmentMethod ?? 'SelfCollect';
  const fields = [
    body.destinationAddressId,
    body.expectedDestinationAddressVersion,
    body.expectedOutboundFee,
  ];
  if (method === 'CarrierOutbound' && fields.some((v) => v === undefined))
    invalidField(
      '/destinationAddressId',
      'Chọn địa chỉ nhận và xác nhận phí giao trước khi thanh toán.',
    );
  if (method === 'SelfCollect' && fields.some((v) => v !== undefined))
    invalidField(
      '/fulfillmentMethod',
      'Tự nhận tại điểm không dùng địa chỉ hoặc phí giao.',
    );
  return method;
}

// Locks nothing new: the Order lock serializes payment; a concurrent address
// edit bumps its version, which the buyer confirmed (409 otherwise).
export async function deliverySnapshot(
  tx: Tx,
  o: PointOrderDoc,
  body: Wire['PayPointOrder'],
  now: Date,
  receiptId: string,
): Promise<PointOrderDeliveryDoc> {
  const { address, policyCode, fee } = await deliveryPrice(
    tx,
    o,
    body.destinationAddressId!,
  );
  if (address.version !== body.expectedDestinationAddressVersion)
    throw conflict();
  if (fee !== body.expectedOutboundFee)
    throw new DomainError(
      409,
      'VersionConflict',
      'Phí giao đã thay đổi. Hãy xem lại phí trước khi thanh toán.',
    );
  return {
    _id: o._id,
    buyerId: o.buyerId,
    addressId: address._id,
    addressVersion: address.version,
    recipientName: address.recipientName,
    phone: address.phone,
    serviceAreaCode: address.serviceAreaCode,
    localityCode: address.localityCode,
    detail: address.detail,
    policyCode,
    outboundFee: fee,
    chosenAt: now,
    receiptId,
  };
}

export function deliveryView(
  o: PointOrderDoc,
  d: PointOrderDeliveryDoc,
): Wire['PointOrderDelivery'] {
  return {
    recipientName: d.recipientName,
    phone: d.phone,
    serviceAreaCode: d.serviceAreaCode,
    localityCode: d.localityCode,
    detail: d.detail,
    outboundFee: d.outboundFee,
    carrier: 'LatLaiSimulator',
    trackingCode: o.trackingCode,
    dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
    deliveryDeadline: o.deliveryDeadline?.toISOString() ?? null,
    deliveredAt: o.collectedAt?.toISOString() ?? null,
  };
}

// Simulated carrier outcome, signed in its own protocol domain with the
// configured simulator secret (like carrier pickup/delivery events).
export function signPointDelivery(
  config: ConfigService,
  event: Wire['SimulatedPointDeliveryEvent'],
) {
  const secret = config.get<string>('PAYMENT_SIMULATOR_SECRET');
  if (!secret)
    throw new DomainError(
      503,
      'UNAVAILABLE',
      'Bộ vận chuyển mô phỏng chưa được bật.',
    );
  return createHmac('sha256', secret)
    .update('LatLaiPointDelivery-v1\n' + canonicalJson(event))
    .digest('hex');
}
export function verifyPointDelivery(
  config: ConfigService,
  event: Wire['SimulatedPointDeliveryEvent'],
  signature: string,
) {
  const expected = Buffer.from(signPointDelivery(config, event), 'hex');
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  )
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Sự kiện giao hàng chưa được xác thực.',
    );
}
