import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
export const exchangeEvidenceSchema = z.object({
  id: z.uuid(),
  exchangeId: z.uuid(),
  uploaderId: z.uuid(),
  fileName: z.string(),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "video/mp4",
  ]),
  byteSize: z.number().int(),
  sha256: z.string(),
  status: z.enum(["Pending", "Ready"]),
  createdAt: z.string(),
  uploadedAt: z.string().nullable(),
});
export const exchangeEvidenceListSchema = z.object({
  items: z.array(exchangeEvidenceSchema),
});
export const exchangeEvidenceAccessSchema = z.object({
  version: z.number().int(),
  assigneeId: z.uuid().nullable(),
});
export const exchangeEvidenceReadSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  expiresAt: z.string(),
});
const receipt = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  exchangeId: z.uuid(),
  version: z.number().int(),
  state: z.enum(["Pending", "Ready", "Assigned"]),
  serverTime: z.string(),
});
export type EvidenceInput = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: z.infer<typeof exchangeEvidenceSchema>["mimeType"];
  sha256: string;
  expectedVersion: number;
};
type Intent = {
  input: EvidenceInput;
  createKey: string;
  uploadKey: string;
  id?: string;
  busy: boolean;
  done: boolean;
};
type State = { owner: string | undefined; items: Map<string, Intent> };
const states = new WeakMap<SessionClient, State>();
function state(client: SessionClient) {
  let s = states.get(client);
  if (!s) {
    s = { owner: undefined, items: new Map() };
    states.set(client, s);
    client.subscribe(() => {
      const auth = client.getSnapshot();
      if (auth.status === "loading" || auth.status === "unavailable") return;
      const owner = auth.status === "authenticated" ? auth.user.id : undefined;
      if (owner !== s!.owner) {
        s!.items.clear();
        s!.owner = owner;
      }
    });
  }
  const auth = client.getSnapshot();
  const owner = auth.status === "authenticated" ? auth.user.id : undefined;
  if (owner !== s.owner) {
    s.items.clear();
    s.owner = owner;
  }
  return s;
}
export function pendingEvidence(client: SessionClient, id: string) {
  const p = state(client).items.get(id);
  return p && !p.done
    ? { fileName: p.input.fileName, busy: p.busy }
    : undefined;
}
export function evidenceIdentity(client: SessionClient) {
  return state(client).owner;
}
export async function sendEvidence(
  client: SessionClient,
  id: string,
  input: EvidenceInput | null,
  makeKey: () => string,
) {
  const s = state(client),
    owner = s.owner;
  if (!owner)
    throw new ApiError(401, "UNAUTHORIZED", "Đăng nhập để gửi bằng chứng.");
  let p = s.items.get(id);
  if (!p || p.done) {
    if (!input) throw Error("Chọn tệp trước.");
    const limit = input.mimeType.startsWith("image/")
      ? 10000000
      : input.mimeType === "application/pdf"
        ? 20000000
        : 100000000;
    if (!input.bytes.length || input.bytes.length > limit)
      throw Error("Tệp vượt giới hạn dung lượng.");
    p = {
      input: { ...input, bytes: Uint8Array.from(input.bytes) },
      createKey: makeKey(),
      uploadKey: makeKey(),
      busy: false,
      done: false,
    };
    s.items.set(id, p);
  }
  if (p.busy) throw Error("Tệp đang được gửi.");
  p.busy = true;
  const current = () => {
    if (state(client).owner !== owner || s.items.get(id) !== p)
      throw new ApiError(401, "SESSION_CHANGED", "Phiên đã đổi. Mở lại hồ sơ.");
  };
  try {
    current();
    if (!p.id) {
      const { bytes, ...body } = p.input;
      const r = await client.request(`/exchanges/${id}/evidence`, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": p.createKey },
        body: JSON.stringify({ ...body, byteSize: bytes.length }),
      });
      current();
      p.id = r.entityId;
    }
    const result = await client.request(
      `/exchanges/${id}/evidence/${p.id}/content`,
      receipt,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Idempotency-Key": p.uploadKey,
        },
        body: p.input.bytes as unknown as BodyInit,
      },
      180000,
    );
    current();
    p.done = true;
    p.input.bytes = new Uint8Array();
    return result;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      ![401, 403, 408, 429].includes(error.status) &&
      s.items.get(id) === p
    )
      s.items.delete(id);
    throw error;
  } finally {
    p.busy = false;
  }
}
export async function resumeEvidence(
  client: SessionClient,
  id: string,
  eid: string,
  input: EvidenceInput,
  makeKey: () => string,
) {
  const s = state(client);
  if (pendingEvidence(client, id))
    throw Error("Thử lại tệp trước trước khi chọn tệp khác.");
  s.items.set(id, {
    input: { ...input, bytes: Uint8Array.from(input.bytes) },
    id: eid,
    createKey: makeKey(),
    uploadKey: makeKey(),
    busy: false,
    done: false,
  });
  return sendEvidence(client, id, null, makeKey);
}
