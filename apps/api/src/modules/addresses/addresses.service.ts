import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MemberAddressDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  member,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';

const CONTENT = [
  'recipientName',
  'phone',
  'serviceAreaCode',
  'localityCode',
  'detail',
] as const;
const newestLast = { sort: { createdAt: 1, _id: 1 } } as const;

// Commit-time replacement for latlai_address_book_check and the locality FK:
// at most ten addresses, exactly one default when any exist, and every
// address points to a configured locality of its area.
export async function checkAddressBook(tx: Tx, ownerId: string) {
  const items = await tx.c.member_addresses.find({ ownerId }).toArray();
  const defaults = items.filter((item) => item.isDefault).length;
  if (items.length > 10 || (items.length > 0 && defaults !== 1))
    throw new Error('Address quota or default invariant');
  for (const item of items) {
    const locality = await tx.c.service_localities.findOne({
      _id: `${item.serviceAreaCode}:${item.localityCode}`,
    });
    const identity = await tx.c.address_identities.findOne({ _id: item._id });
    if (!locality || identity?.ownerId !== ownerId)
      throw new Error('Address locality or identity invariant');
  }
}

@Injectable()
export class AddressesService {
  constructor(private readonly commands: MongoCommandService) {}
  directory(auth: Actor) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['ServiceAreaDirectory']> => {
        member(actor);
        const localities = await tx.c.service_localities
          .find({ areaCode: 'HCM-DEMO-v1' }, { sort: { code: 1 } })
          .toArray();
        return {
          code: 'HCM-DEMO-v1',
          name: 'TP.HCM',
          demoOnly: true,
          localities: localities.map(({ code, label }) => ({ code, label })),
        };
      },
    );
  }
  read(auth: Actor) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['AddressBook']> => {
        member(actor);
        const book = await tx.c.address_books.findOne({ _id: actor._id });
        const items = await tx.c.member_addresses
          .find({ ownerId: actor._id }, newestLast)
          .toArray();
        return {
          version: book?.version ?? 0,
          items: items.map((item) => ({
            id: item._id,
            version: item.version,
            recipientName: item.recipientName,
            phone: item.phone,
            serviceAreaCode: item.serviceAreaCode,
            localityCode: item.localityCode,
            detail: item.detail,
            isDefault: item.isDefault,
          })),
        };
      },
    );
  }
  mutate(
    context: CommandContext,
    action: 'create' | 'update' | 'default' | 'archive',
    id: string | null,
    body: Wire['SaveAddress'] | Wire['AddressBookCommand'],
  ) {
    const operation = {
      create: 'createMyAddress',
      update: 'updateMyAddress',
      default: 'setMyDefaultAddress',
      archive: 'deleteMyAddress',
    }[action];
    return this.commands.runAddress(context, operation, id, body, {
      authorize: async (_tx, actor) => {
        member(actor);
        return actor._id;
      },
      mutate: async (tx, actor, ownerId) => {
        // The owner user is locked by the command executor; every address
        // writer goes through it (latlai_address_write_guard equivalent).
        // Restricted users may maintain addresses; no eligibility is granted here.
        const current = id
          ? await tx.c.member_addresses.findOne({ _id: id, ownerId })
          : null;
        if (id && !current) throw notFound();
        const book = await tx.c.address_books.findOne({ _id: ownerId });
        if ((book?.version ?? 0) !== body.expectedBookVersion) throw conflict();
        const items = await tx.c.member_addresses
          .find({ ownerId }, newestLast)
          .toArray();
        if (action === 'create' && items.length >= 10)
          throw new DomainError(
            429,
            'RATE_LIMITED',
            'Bạn đã lưu đủ 10 địa chỉ. Hãy sửa hoặc xóa một địa chỉ trước.',
          );
        if ('address' in body) {
          const a = body.address;
          const locality = await tx.c.service_localities.findOne({
            _id: `${a.serviceAreaCode}:${a.localityCode}`,
          });
          if (!locality || a.serviceAreaCode !== 'HCM-DEMO-v1')
            invalidField(
              '/address/localityCode',
              'Chọn một khu vực luân chuyển sách trong danh sách.',
            );
          for (const field of ['recipientName', 'detail'] as const)
            if (
              [...a[field]].some(
                (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
              )
            )
              invalidField(
                `/address/${field}`,
                'Không dùng ký tự điều khiển hoặc xuống dòng.',
              );
        }
        if (!book)
          await tx.c.address_books.insertOne({
            _id: ownerId,
            version: 0,
            lockSeq: 0,
          });
        const clearDefault = () =>
          tx.c.member_addresses.updateMany(
            { ownerId, isDefault: true },
            { $set: { isDefault: false } },
          );
        let addressId = id;
        if (action === 'create' || action === 'update') {
          if (!('address' in body)) throw new Error('Address payload required');
          const isDefault =
            body.makeDefault || items.length === 0 || !!current?.isDefault;
          if (isDefault) await clearDefault();
          const content = Object.fromEntries(
            CONTENT.map((field) => [field, body.address[field]]),
          ) as Pick<MemberAddressDoc, (typeof CONTENT)[number]>;
          if (action === 'create') {
            addressId = randomUUID();
            // A new identity is never reused; it keeps only id/owner after deletion.
            await tx.c.address_identities.insertOne({
              _id: addressId,
              ownerId,
            });
            await tx.c.member_addresses.insertOne({
              _id: addressId,
              ownerId,
              version: 1,
              ...content,
              isDefault,
              createdAt: await tx.now(),
            });
          } else {
            // Content version advances only when contact content changes
            // (latlai_address_content_version equivalent).
            const changed = CONTENT.some((f) => current![f] !== content[f]);
            await tx.c.member_addresses.updateOne(
              { _id: id!, ownerId, version: current!.version },
              {
                $set: { ...content, isDefault },
                ...(changed ? { $inc: { version: 1 } } : {}),
              },
            );
          }
        } else if (action === 'default') {
          await clearDefault();
          await tx.c.member_addresses.updateOne(
            { _id: id!, ownerId },
            { $set: { isDefault: true } },
          );
        } else {
          await tx.c.member_addresses.deleteOne({ _id: id!, ownerId });
          if (current!.isDefault) {
            const replacement = items.find((item) => item._id !== id);
            if (replacement)
              await tx.c.member_addresses.updateOne(
                { _id: replacement._id },
                { $set: { isDefault: true } },
              );
          }
        }
        const next = await tx.c.address_books.findOneAndUpdate(
          { _id: ownerId },
          { $inc: { version: 1, lockSeq: 1 } },
          { returnDocument: 'after' },
        );
        tx.check(`address-book:${ownerId}`, () =>
          checkAddressBook(tx, ownerId),
        );
        return {
          entityType: 'AddressBook' as const,
          entityId: actor._id,
          version: next!.version,
          addressId: addressId!,
        };
      },
    });
  }
}
