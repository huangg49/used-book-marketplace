import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { AuctionOperationsController } from './auction-operations.controller.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { ExecutionContext } from '@nestjs/common';
import type { CurrentActor } from '../commands/mongo-command.service.js';

describe('Auction intakes permissions for Admin and Staff', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const mockContext = (handler: Function, roles: string[]): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => AuctionOperationsController,
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            user: { roles },
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  const intakeEndpoints: (keyof AuctionOperationsController)[] = [
    'list',
    'receive',
    'inspect',
    'decideEvidence',
    'open',
    'reclaim',
  ];

  it.each(intakeEndpoints)(
    'endpoint %s has Roles metadata containing both STAFF and ADMIN',
    (methodName) => {
      const handler = AuctionOperationsController.prototype[methodName];
      const roles = reflector.get<string[]>('auth:roles', handler);
      expect(roles).toBeDefined();
      expect(roles).toContain('STAFF');
      expect(roles).toContain('ADMIN');
    },
  );

  it.each(intakeEndpoints)(
    'RolesGuard allows ADMIN on endpoint %s',
    (methodName) => {
      const handler = AuctionOperationsController.prototype[methodName];
      const ctx = mockContext(handler, ['ADMIN']);
      expect(guard.canActivate(ctx)).toBe(true);
    },
  );

  it.each(intakeEndpoints)(
    'RolesGuard allows STAFF on endpoint %s',
    (methodName) => {
      const handler = AuctionOperationsController.prototype[methodName];
      const ctx = mockContext(handler, ['STAFF']);
      expect(guard.canActivate(ctx)).toBe(true);
    },
  );

  it.each(intakeEndpoints)(
    'RolesGuard rejects MEMBER without STAFF/ADMIN on endpoint %s',
    (methodName) => {
      const handler = AuctionOperationsController.prototype[methodName];
      const ctx = mockContext(handler, ['MEMBER']);
      expect(() => guard.canActivate(ctx)).toThrowError(
        'Bạn không có quyền thực hiện thao tác này.',
      );
    },
  );

  describe('AuctionIntakesService.staff authorization helper', () => {
    const mockPoints = {
      requireAssigned: vi.fn(async (_tx, userId, pointId) => {
        if (userId === 'unassigned-staff') {
          throw new Error('Bạn không được phân công tại điểm giao nhận này.');
        }
      }),
    };

    const service = {
      points: mockPoints,
      staff: (AuctionIntakesService.prototype as any).staff,
    };

    const tx = {} as any;
    const now = new Date();
    const intake = {
      _id: 'intake-1',
      sellerId: 'seller-1',
      pointId: 'point-1',
    } as any;

    const mockActor = (
      id: string,
      role: 'ADMIN' | 'STAFF' | 'MEMBER',
      status: 'ACTIVE' | 'RESTRICTED' = 'ACTIVE',
    ): CurrentActor =>
      ({
        _id: id,
        displayName: 'Test User',
        emailNormalized: `${id}@example.test`,
        passwordHash: 'hash',
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        status,
        roles: [{ role, grantedAt: now }],
      }) as CurrentActor;

    it('allows ADMIN even without assignment at the point', async () => {
      const adminActor = mockActor('admin-1', 'ADMIN');
      await expect(service.staff(tx, adminActor, intake, now)).resolves.toBeUndefined();
      expect(mockPoints.requireAssigned).not.toHaveBeenCalled();
    });

    it('allows STAFF when assigned to the point', async () => {
      const staffActor = mockActor('assigned-staff', 'STAFF');
      await expect(service.staff(tx, staffActor, intake, now)).resolves.toBeUndefined();
      expect(mockPoints.requireAssigned).toHaveBeenCalledWith(tx, 'assigned-staff', 'point-1', now);
    });

    it('rejects STAFF when not assigned to the point', async () => {
      const unassignedStaff = mockActor('unassigned-staff', 'STAFF');
      await expect(service.staff(tx, unassignedStaff, intake, now)).rejects.toThrow(
        'Bạn không được phân công tại điểm giao nhận này.',
      );
    });

    it('rejects ADMIN when admin is the seller (SelfReviewForbidden)', async () => {
      const adminSeller = mockActor('seller-1', 'ADMIN');
      await expect(service.staff(tx, adminSeller, intake, now)).rejects.toThrow(
        'Không được xử lý sách của chính mình.',
      );
    });

    it('rejects non-staff, non-admin users', async () => {
      const memberActor = mockActor('member-1', 'MEMBER');
      await expect(service.staff(tx, memberActor, intake, now)).rejects.toThrow(
        'Chỉ nhân viên điểm hoặc quản trị viên được thực hiện thao tác này.',
      );
    });
  });
});
