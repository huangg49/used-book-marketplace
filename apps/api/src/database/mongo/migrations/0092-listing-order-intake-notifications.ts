import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';

export function withListingOrderIntakeNotifications(
  spec: CollectionSpec,
): CollectionSpec {
  if (spec.name !== 'member_notifications') return spec;
  const next = structuredClone(spec);
  next.schema.properties.kind.enum = [
    ...(next.schema.properties.kind.enum as string[]),
    'ListingApproved',
    'ListingRejected',
    'OrderStatusUpdated',
    'AuctionIntakeUpdated',
  ];
  next.schema.properties.targetType.enum = [
    ...(next.schema.properties.targetType.enum as string[]),
    'Listing',
    'AuctionIntake',
  ];
  return next;
}

export function createListingOrderIntakeNotificationsMigration(
  previous: CollectionSpec,
) {
  const collections = [withListingOrderIntakeNotifications(previous)];
  return {
    id: '0092-listing-order-intake-notifications',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
