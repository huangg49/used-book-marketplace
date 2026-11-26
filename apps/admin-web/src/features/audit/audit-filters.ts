import { z } from "zod";
import type { components } from "@used-books/api-contract";

export const auditActorRoles = [
  ["Operations", "Nhân viên & quản trị"],
  ["STAFF", "Nhân viên"],
  ["ADMIN", "Quản trị viên"],
  ["All", "Mọi tác nhân"],
] as const;

export const auditEntityTypes = [
  ["", "Mọi đối tượng"],
  ["Listing", "Bài đăng"],
  ["Book", "Đầu sách"],
  ["Media", "Ảnh/tệp"],
  ["Context", "Giao dịch"],
  ["Quote", "Báo giá"],
  ["Topup", "Nạp tiền"],
  ["Withdrawal", "Rút tiền"],
  ["Point", "Điểm giao nhận"],
  ["SupportCase", "Hỗ trợ"],
  ["Account", "Tài khoản"],
  ["Review", "Đánh giá"],
  ["AddressBook", "Sổ địa chỉ"],
] as const;

export type AuditFilters = {
  actorRole: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  requestId: string;
  eventId: string;
  reason: string;
  from: string;
  to: string;
};

const uuid = z.uuid();
const ACTION = /^[A-Za-z][A-Za-z0-9]{0,79}$/;
const ids = ["actorId", "entityId", "requestId", "eventId"] as const;
// datetime-local value (no zone); the browser's zone is applied when sending.
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function readAuditFilters(params: URLSearchParams): AuditFilters {
  const get = (key: string) => (params.get(key) ?? "").trim();
  const role = get("actorRole");
  const type = get("entityType");
  const filters: AuditFilters = {
    actorRole: auditActorRoles.some(([v]) => v === role) ? role : "Operations",
    actorId: "",
    entityType: auditEntityTypes.some(([v]) => v === type) ? type : "",
    entityId: "",
    action: ACTION.test(get("action")) ? get("action") : "",
    requestId: "",
    eventId: "",
    reason: get("reason").slice(0, 100),
    from: LOCAL.test(get("from")) ? get("from") : "",
    to: LOCAL.test(get("to")) ? get("to") : "",
  };
  for (const key of ids) {
    const value = get(key).toLowerCase();
    if (uuid.safeParse(value).success) filters[key] = value;
  }
  return filters;
}

export function auditSearchParams(filters: AuditFilters) {
  const normalized = readAuditFilters(new URLSearchParams(filters));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalized)) {
    if (value && !(key === "actorRole" && value === "Operations")) params.set(key, value);
  }
  return params;
}

export function auditRequest(filters: AuditFilters, cursor?: string | null) {
  const params = auditSearchParams(filters);
  params.delete("actorRole");
  const { actorRole, from, to } = readAuditFilters(new URLSearchParams(filters));
  params.set("actorRole", actorRole);
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  params.set("limit", "20");
  if (cursor) params.set("cursor", cursor);
  return `/operations/audit-events?${params}`;
}

const date = z.iso.datetime({ offset: true });
const roleCode = z.enum(["MEMBER", "STAFF", "ADMIN", "TEST_OPERATOR"]);
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const snapshot = z.record(z.string(), z.union([scalar, z.array(scalar)])).nullable();
export const auditEvent = z.object({
  id: z.uuid(),
  createdAt: date,
  action: z.string(),
  actor: z.object({
    kind: z.enum(["User", "System"]),
    id: z.uuid().nullable(),
    displayName: z.string().nullable(),
    roles: z.array(roleCode),
    systemActor: z.string().nullable(),
  }),
  entity: z
    .object({
      type: z.enum(auditEntityTypes.slice(1).map(([v]) => v) as [string, ...string[]]),
      id: z.uuid(),
    })
    .nullable(),
  reason: z.string().nullable(),
  requestId: z.uuid(),
  receiptId: z.uuid().nullable(),
  before: snapshot,
  after: snapshot,
  redactedFields: z.number().int().min(0),
});
export const auditEventPage = z.object({
  items: z.array(auditEvent),
  nextCursor: z.string().nullable(),
  serverTime: date,
});
export type AuditEvent = z.infer<typeof auditEvent>;
// Compile-time guard that the client schema still matches the contract.
export type ContractAuditEvent = components["schemas"]["AuditEvent"];

export const entityLabel = Object.fromEntries(auditEntityTypes) as Record<string, string>;

// Deep links to the admin page that owns the entity, where one exists.
export function entityHref(entity: AuditEvent["entity"]) {
  if (!entity) return null;
  switch (entity.type) {
    case "Account":
      return `/users/${entity.id}`;
    case "Listing":
      return `/review/listings/${entity.id}`;
    case "SupportCase":
      return `/support/${entity.id}`;
    case "Withdrawal":
      return `/withdrawals/${entity.id}`;
    default:
      return null;
  }
}

// Commands are camelCase operation names (lockUserAccount); show them readably.
export function actionText(action: string) {
  return action.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}
