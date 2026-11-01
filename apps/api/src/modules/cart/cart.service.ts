import { Injectable } from '@nestjs/common';
import {
  MongoCommandService,
  member,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { PublicListingService } from '../listings/public-listing.service.js';
@Injectable()
export class CartService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly listings: PublicListingService,
  ) {}
  read(auth: Actor) {
    return this.commands.readObligation(
      auth,
      async (tx, actor): Promise<Wire['MemberCart']> => {
        member(actor);
        const row = await tx.c.member_carts.findOne({ _id: actor._id }),
          views = await this.listings.forCart(
            tx,
            row?.items.map((i) => i.listingId) ?? [],
          );
        return {
          id: actor._id,
          version: row?.version ?? 1,
          items: (row?.items ?? []).map((item) => {
            const listing = views.get(item.listingId) ?? null;
            return {
              listingId: item.listingId,
              quantity: 1,
              priceAtAdd: item.priceAtAdd,
              addedAt: item.addedAt.toISOString(),
              listing,
              canBuy:
                actor.status === 'ACTIVE' &&
                !!listing &&
                listing.seller.id !== actor._id &&
                listing.salePrice !== null &&
                listing.purchaseAvailability.status === 'Available' &&
                listing.fulfillment !== null,
            };
          }),
          serverTime: (await tx.now()).toISOString(),
        };
      },
    );
  }
  change(
    context: CommandContext,
    body: Wire['AddCartItem'] | Wire['RemoveCartItem'],
    adding: boolean,
  ) {
    return this.commands.runAccount(
      context,
      adding ? 'addCartItem' : 'removeCartItem',
      context.auth.user.id,
      body,
      {
        discover: async (tx) => {
          if (!adding) return [];
          const l = await tx.c.listings.findOne({ _id: body.listingId });
          return l ? [l.ownerId] : [];
        },
        authorize: async (_tx, actor) => {
          member(actor, adding);
          return actor;
        },
        mutate: async (tx, actor) => {
          // Owner user lock serializes initial creation too; no absent-row race.
          const previous = await tx.c.member_carts.findOne({ _id: actor._id }),
            version = previous?.version ?? 1;
          if (version !== body.expectedVersion) throw conflict();
          const items = [...(previous?.items ?? [])],
            index = items.findIndex((i) => i.listingId === body.listingId),
            now = await tx.now();
          if (adding) {
            await tx.lock('listings', [body.listingId]);
            const listing = (
              await this.listings.forCart(tx, [body.listingId])
            ).get(body.listingId);
            if (!listing) throw notFound();
            if (
              listing.version !==
              (body as Wire['AddCartItem']).expectedListingVersion
            )
              throw conflict();
            if (
              listing.seller.id === actor._id ||
              listing.mode === 'Exchange' ||
              listing.salePrice === null ||
              listing.purchaseAvailability.status !== 'Available'
            )
              throw invalidState(
                'Bài đăng này hiện chưa thể thêm vào giỏ để mua.',
              );
            if (index >= 0)
              return {
                entityType: 'Cart' as const,
                entityId: actor._id,
                accountId: actor._id,
                version,
                state: 'Unchanged',
              };
            if (items.length >= 50)
              throw new DomainError(
                409,
                'CartFull',
                'Giỏ đã có 50 bài đăng. Xóa bớt trước khi thêm.',
              );
            items.push({
              listingId: listing.id,
              priceAtAdd: listing.salePrice,
              addedAt: now,
            });
          } else {
            if (index < 0)
              return {
                entityType: 'Cart' as const,
                entityId: actor._id,
                accountId: actor._id,
                version,
                state: 'Unchanged',
              };
            items.splice(index, 1);
          }
          if (previous)
            await tx.c.member_carts.updateOne(
              { _id: actor._id },
              { $set: { items, updatedAt: now }, $inc: { version: 1 } },
            );
          else
            await tx.c.member_carts.insertOne({
              _id: actor._id,
              version: version + 1,
              items,
              createdAt: now,
              updatedAt: now,
              lockSeq: 0,
            });
          return {
            entityType: 'Cart' as const,
            entityId: actor._id,
            accountId: actor._id,
            version: version + 1,
            state: 'Updated',
          };
        },
      },
    );
  }
}
