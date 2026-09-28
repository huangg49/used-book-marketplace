import { Injectable } from '@nestjs/common';
import type { ListingRevision } from '../../generated/prisma/client.js';
import type { Tx } from '../commands/command.service.js';
import {
  conflict,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';

export const originInclude = {
  select: { current: { select: { version: true } } },
} as const;
export function originReference(
  r: ListingRevision,
): Wire['ListingFulfillment'] | null {
  return r.originAddressId
    ? {
        originAddressId: r.originAddressId,
        originAddressVersion: r.originAddressVersion!,
        method: 'DirectDelivery',
      }
    : null;
}
export function originStatus(
  r: ListingRevision & {
    originAddress: { current: { version: number } | null } | null;
  },
): Wire['ListingRevision']['fulfillmentStatus'] {
  if (!r.originAddressId) return 'NotConfigured';
  return r.originAddress?.current?.version === r.originAddressVersion
    ? 'Current'
    : 'NeedsUpdate';
}

@Injectable()
export class ListingFulfillmentService {
  // Call after user/session locks, before catalog/listing locks. No nested transaction.
  async prepare(
    tx: Tx,
    ownerId: string,
    input: Wire['ListingFulfillment'] | null | undefined,
  ) {
    if (!input)
      return {
        originAddressId: null,
        originAddressVersion: null,
        originServiceAreaCode: null,
      };
    await tx.$queryRaw`SELECT id FROM member_addresses WHERE id=${input.originAddressId}::uuid AND owner_id=${ownerId}::uuid FOR SHARE`;
    const address = await tx.memberAddress.findFirst({
      where: { id: input.originAddressId, ownerId },
    });
    if (!address) throw notFound();
    if (address.version !== input.originAddressVersion) throw conflict();
    if (address.serviceAreaCode !== 'HCM-DEMO-v1')
      invalidField(
        '/content/fulfillment',
        'Chọn nơi gửi trong vùng phục vụ TP.HCM.',
      );
    return {
      originAddressId: address.id,
      originAddressVersion: address.version,
      originServiceAreaCode: address.serviceAreaCode,
    };
  }
}
