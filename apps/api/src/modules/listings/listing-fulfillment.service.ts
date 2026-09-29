import { Injectable } from '@nestjs/common';
import type { ListingRevisionDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  conflict,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';

export function originReference(
  r: ListingRevisionDoc,
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
  r: ListingRevisionDoc & { originCurrentVersion: number | null },
): Wire['ListingRevision']['fulfillmentStatus'] {
  if (!r.originAddressId) return 'NotConfigured';
  return r.originCurrentVersion === r.originAddressVersion
    ? 'Current'
    : 'NeedsUpdate';
}

@Injectable()
export class ListingFulfillmentService {
  // Call after user/session locks, before catalog/listing locks. Address
  // writers lock the same owner user (the executor locked it), which replaces
  // the PostgreSQL FOR SHARE on the address row (latlai_revision_origin_check).
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
    const address = await tx.c.member_addresses.findOne({
      _id: input.originAddressId.toLowerCase(),
      ownerId,
    });
    if (!address) throw notFound();
    if (address.version !== input.originAddressVersion) throw conflict();
    if (address.serviceAreaCode !== 'HCM-DEMO-v1')
      invalidField(
        '/content/fulfillment',
        'Chọn nơi gửi trong vùng phục vụ TP.HCM.',
      );
    return {
      originAddressId: address._id,
      originAddressVersion: address.version,
      originServiceAreaCode: address.serviceAreaCode,
    };
  }
}
