import { z } from "zod";
import type { components } from "@used-books/api-contract";
export type OperationsUser = components["schemas"]["OperationsUser"];
export const operationsUser = z.object({
  id: z.uuid(), email: z.email(), displayName: z.string(),
  status: z.enum(["PENDING_VERIFICATION", "ACTIVE", "RESTRICTED", "LOCKED", "DISABLED"]),
  emailVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
  roles: z.array(z.enum(["MEMBER", "STAFF", "ADMIN", "TEST_OPERATOR"])),
  createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<OperationsUser>;
export const operationsUsersPage = z.object({ items: z.array(operationsUser), nextCursor: z.string().nullable(), serverTime: z.iso.datetime({ offset: true }) });
export const userStatusLabel: Record<OperationsUser["status"], string> = {
  ACTIVE: "Đang hoạt động", PENDING_VERIFICATION: "Chờ xác minh", RESTRICTED: "Hạn chế", LOCKED: "Đã khóa", DISABLED: "Đã vô hiệu",
};
