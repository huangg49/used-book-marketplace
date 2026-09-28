import { Injectable } from '@nestjs/common';
import {
  CommandService,
  member,
  type Actor,
  type CommandContext,
} from '../commands/command.service.js';
import {
  conflict,
  DomainError,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';

@Injectable()
export class AddressesService {
  constructor(private readonly commands: CommandService) {}
  directory(auth: Actor) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['ServiceAreaDirectory']> => {
        member(actor);
        const area = await tx.serviceArea.findUniqueOrThrow({
          where: { code: 'HCM-DEMO-v1' },
          include: { localities: { orderBy: { code: 'asc' } } },
        });
        return {
          code: 'HCM-DEMO-v1',
          name: 'TP.HCM',
          demoOnly: true,
          localities: area.localities.map(({ code, label }) => ({
            code,
            label,
          })),
        };
      },
    );
  }
  read(auth: Actor) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['AddressBook']> => {
        member(actor);
        const book = await tx.addressBook.findUnique({
          where: { ownerId: actor.id },
        });
        const items = await tx.memberAddress.findMany({
          where: { ownerId: actor.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            version: true,
            recipientName: true,
            phone: true,
            serviceAreaCode: true,
            localityCode: true,
            detail: true,
            isDefault: true,
          },
        });
        return { version: book?.version ?? 0, items };
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
        return actor.id;
      },
      mutate: async (tx, actor, ownerId) => {
        // Owner user is already locked by the command orchestrator. Restricted users
        // may maintain addresses; no transaction eligibility is granted here.
        const current = id
          ? await tx.memberAddress.findFirst({ where: { id, ownerId } })
          : null;
        if (id && !current) throw notFound();
        const book = await tx.addressBook.findUnique({ where: { ownerId } });
        if ((book?.version ?? 0) !== body.expectedBookVersion) throw conflict();
        const items = await tx.memberAddress.findMany({
          where: { ownerId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (action === 'create' && items.length >= 10)
          throw new DomainError(
            429,
            'RATE_LIMITED',
            'Bạn đã lưu đủ 10 địa chỉ. Hãy sửa hoặc xóa một địa chỉ trước.',
          );
        if ('address' in body) {
          const a = body.address;
          const locality = await tx.serviceLocality.findUnique({
            where: {
              areaCode_code: {
                areaCode: a.serviceAreaCode,
                code: a.localityCode,
              },
            },
          });
          if (!locality || a.serviceAreaCode !== 'HCM-DEMO-v1')
            invalidField(
              '/address/localityCode',
              'Chọn một khu vực trong vùng phục vụ TP.HCM.',
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
        if (!book) await tx.addressBook.create({ data: { ownerId } });
        let addressId = id;
        if (action === 'create' || action === 'update') {
          if (!('address' in body)) throw new Error('Address payload required');
          const isDefault =
            body.makeDefault || items.length === 0 || !!current?.isDefault;
          if (isDefault)
            await tx.memberAddress.updateMany({
              where: { ownerId, isDefault: true },
              data: { isDefault: false },
            });
          const data = { ...body.address, isDefault };
          const saved =
            action === 'create'
              ? await tx.memberAddress.create({ data: { ...data, ownerId } })
              : await tx.memberAddress.update({ where: { id: id! }, data });
          addressId = saved.id;
        } else if (action === 'default') {
          await tx.memberAddress.updateMany({
            where: { ownerId, isDefault: true },
            data: { isDefault: false },
          });
          await tx.memberAddress.update({
            where: { id: id! },
            data: { isDefault: true },
          });
        } else {
          await tx.memberAddress.delete({ where: { id: id! } });
          if (current!.isDefault) {
            const replacement = items.find((item) => item.id !== id);
            if (replacement)
              await tx.memberAddress.update({
                where: { id: replacement.id },
                data: { isDefault: true },
              });
          }
        }
        const next = await tx.addressBook.update({
          where: { ownerId },
          data: { version: { increment: 1 } },
        });
        return {
          entityType: 'AddressBook' as const,
          entityId: actor.id,
          version: next.version,
          addressId: addressId!,
        };
      },
    });
  }
}
