import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { ApiError, type SessionClient } from "./session-client";

export const accountReceiptSchema: z.ZodType<
  components["schemas"]["AccountCommandReceipt"]
> = z.object({
  id: z.uuid(),
  entityType: z.enum([
    "MemberProfile",
    "ProfileAvatar",
    "MemberEmailChange",
    "UserAccount",
    "Cart",
  ]),
  entityId: z.uuid(),
  version: z.number().int().positive(),
  state: z.string(),
  serverTime: z.iso.datetime(),
});
export const memberProfileSchema: z.ZodType<
  components["schemas"]["MemberProfile"]
> = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  displayName: z.string(),
  email: z.email(),
  contactPhone: z.string().nullable(),
  avatarId: z.uuid().nullable(),
  pendingEmailChange: z
    .object({
      id: z.uuid(),
      email: z.email(),
      expiresAt: z.iso.datetime(),
      resendAt: z.iso.datetime(),
    })
    .nullable(),
});
export const profileAvatarReadSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export function validProfilePhone(value: string | null) {
  if (!value) return true;
  const digits = value.replace(/\D/g, "").length;
  return /^\+?[0-9 ()-]{8,20}$/.test(value) && digits >= 8 && digits <= 15;
}
type ExpectedReceipt = {
  entityType: components["schemas"]["AccountCommandReceipt"]["entityType"];
  entityId?: string;
};
type Intent = {
  path: string;
  body: string;
  key: string;
  expected?: ExpectedReceipt;
  credentialRequired?: boolean;
};
export type ProfilePhoto = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
};
type AvatarIntent = {
  photo: ProfilePhoto;
  createKey: string;
  uploadKey: string;
  id?: string;
};
type Store = {
  owner: string | null;
  generation: number;
  commands: Map<string, Intent>;
  avatar?: AvatarIntent;
  readyAvatar?: string;
};
const stores = new WeakMap<SessionClient, Store>();
function stateFor(client: SessionClient) {
  let value = stores.get(client);
  if (!value) {
    const identity = () => {
      const state = client.getSnapshot();
      return state.status === "authenticated" ? state.user.id : null;
    };
    const current: Store = {
      owner: identity(),
      generation: 0,
      commands: new Map(),
    };
    client.subscribe(() => {
      const next = identity();
      if (next !== current.owner) {
        current.owner = next;
        current.generation++;
        current.commands.clear();
        current.avatar = undefined;
        current.readyAvatar = undefined;
      }
    });
    stores.set(client, current);
    value = current;
  }
  return value;
}
function definite(error: unknown) {
  return (
    error instanceof ApiError &&
    ((error.status >= 400 &&
      error.status < 500 &&
      ![401, 403, 408, 429].includes(error.status)) ||
      // These business refusals occur after current authorization/receipt lookup.
      (error.status === 429 &&
        ["AvatarQuotaExceeded", "EMAIL_CHANGE_COOLDOWN"].includes(error.code)))
  );
}
export function accountErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      INVALID_CREDENTIALS: "Mật khẩu hiện tại chưa đúng.",
      CURRENT_PASSWORD_REQUIRED:
        "Nhập lại mật khẩu hiện tại để xác minh yêu cầu trước.",
      CREDENTIAL_CHANGED:
        "Mật khẩu đã thay đổi. Hãy nhập lại mật khẩu hiện tại.",
      INVALID_EMAIL_CHANGE:
        "Mã không hợp lệ, đã hết hạn hoặc yêu cầu không còn hiệu lực. Hãy yêu cầu mã mới.",
      EMAIL_UNAVAILABLE:
        "Chưa thể dùng email này. Hãy yêu cầu đổi sang email khác.",
      EMAIL_CHANGE_COOLDOWN: "Đợi 60 giây trước khi yêu cầu mã mới.",
      RATE_LIMITED: "Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau 15 phút.",
      AvatarQuotaExceeded:
        "Bạn có 3 ảnh đang chờ. Hoàn tất ảnh đã tải hoặc thử lại sau.",
      InvalidImage:
        "Ảnh không hợp lệ. Chọn ảnh JPEG, PNG hoặc WebP một khung hình.",
    };
    if (messages[error.code]) return messages[error.code];
    if (error.status === 409)
      return "Thông tin đã thay đổi ở nơi khác. Nội dung đang nhập vẫn được giữ; tải bản mới để đối chiếu.";
    if (error.status === 413) return "Chọn ảnh đại diện không quá 2 MB.";
    if (error.status === 415) return "Chọn ảnh JPEG, PNG hoặc WebP.";
    if (error.status === 422)
      return "Kiểm tra tên, số điện thoại, email hoặc ảnh vừa chọn.";
    if (error.status === 401)
      return "Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại để tiếp tục.";
    if (error.status === 403)
      return "Quyền hiện tại chưa cho phép thao tác. Hãy kiểm tra lại tài khoản.";
  }
  return "Chưa xác nhận được kết quả. Nội dung đang nhập vẫn được giữ; hãy thử lại thao tác trước.";
}
function assertOwner(state: Store, generation: number) {
  if (!state.owner || state.generation !== generation)
    throw new ApiError(401, "SESSION_CHANGED", "Phiên tài khoản đã thay đổi.");
}
export async function readMemberProfile(client: SessionClient) {
  const state = stateFor(client),
    generation = state.generation;
  assertOwner(state, generation);
  const profile = await client.request("/me/profile", memberProfileSchema);
  assertOwner(state, generation);
  if (profile.id !== state.owner) throw new Error("Unexpected profile owner");
  await client.reloadUser();
  assertOwner(state, generation);
  return profile;
}
export function pendingAccountCommand(client: SessionClient, slot: string) {
  return stateFor(client).commands.has(slot);
}
export function pendingAccountCommandPath(client: SessionClient, slot: string) {
  return stateFor(client).commands.get(slot)?.path;
}
export function accountPasswordRequired(client: SessionClient, slot: string) {
  return stateFor(client).commands.get(slot)?.credentialRequired === true;
}
export function pendingEmailChangeTarget(client: SessionClient) {
  const attempt = stateFor(client).commands.get("profile-email");
  if (!attempt) return undefined;
  const value = JSON.parse(attempt.body).email;
  return typeof value === "string" ? value : undefined;
}
export function pendingProfileAvatar(client: SessionClient) {
  return !!stateFor(client).avatar;
}
export function readyProfileAvatar(client: SessionClient) {
  return stateFor(client).readyAvatar;
}
export function clearReadyProfileAvatar(client: SessionClient, id: string) {
  const state = stateFor(client);
  if (state.readyAvatar === id) state.readyAvatar = undefined;
}
export async function sendAccountCommand(
  client: SessionClient,
  slot: string,
  path: string,
  body: unknown,
  keyFactory: () => string,
  expected?: ExpectedReceipt,
) {
  const state = stateFor(client),
    generation = state.generation;
  assertOwner(state, generation);
  const previous = state.commands.get(slot);
  if (previous && previous.path !== path)
    throw new Error("Cần xác minh thao tác trước khi đổi quyết định.");
  if (!previous && body === null)
    throw new Error("Không có thao tác đang chờ để thử lại.");
  const emailRequest = path === "/me/profile/email-changes";
  const credential =
    emailRequest &&
    body &&
    typeof body === "object" &&
    "password" in body &&
    typeof body.password === "string"
      ? body.password
      : undefined;
  if (emailRequest && !credential)
    throw new ApiError(
      400,
      "CURRENT_PASSWORD_REQUIRED",
      "Nhập mật khẩu hiện tại để xác minh yêu cầu trước.",
    );
  const businessBody =
    emailRequest && body && typeof body === "object"
      ? Object.fromEntries(
          Object.entries(body).filter(([name]) => name !== "password"),
        )
      : body;
  const attempt = previous ?? {
    path,
    body: JSON.stringify(businessBody),
    key: keyFactory(),
    expected,
  };
  // Keep only business fields in the pending store. A credential belongs to
  // this request/form; remount recovery requires explicit password re-entry.
  const requestBody = emailRequest
    ? JSON.stringify({ ...JSON.parse(attempt.body), password: credential })
    : attempt.body;
  attempt.credentialRequired = false;
  state.commands.set(slot, attempt);
  try {
    const receipt = await client.request(attempt.path, accountReceiptSchema, {
      method: "POST",
      headers: { "Idempotency-Key": attempt.key },
      body: requestBody,
    });
    if (
      attempt.expected &&
      (receipt.entityType !== attempt.expected.entityType ||
        (attempt.expected.entityId &&
          receipt.entityId !== attempt.expected.entityId))
    )
      throw new Error("Unexpected command receipt");
    assertOwner(state, generation);
    if (state.commands.get(slot) === attempt) state.commands.delete(slot);
    return receipt;
  } catch (error) {
    if (
      state.generation === generation &&
      state.commands.get(slot) === attempt &&
      attempt.path === "/me/profile/email-changes"
    )
      attempt.credentialRequired = true;
    if (
      state.generation === generation &&
      state.commands.get(slot) === attempt &&
      definite(error)
    )
      state.commands.delete(slot);
    throw error;
  }
}
export async function uploadProfileAvatar(
  client: SessionClient,
  photo: ProfilePhoto | null,
  keyFactory: () => string,
) {
  const state = stateFor(client),
    generation = state.generation;
  assertOwner(state, generation);
  if (!state.avatar && !photo) throw new Error("Chọn ảnh trước khi tải.");
  const attempt = state.avatar ?? {
    photo: { ...photo!, bytes: Uint8Array.from(photo!.bytes) },
    createKey: keyFactory(),
    uploadKey: keyFactory(),
  };
  state.avatar = attempt;
  try {
    // Replacing a staged photo explicitly retires it before creating another.
    // The new bytes stay pinned if this cleanup or its response is uncertain.
    await discardReadyProfileAvatar(client, keyFactory);
    assertOwner(state, generation);
    if (!attempt.id) {
      const created = await client.request(
        "/me/profile/avatar-uploads",
        accountReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.createKey },
          body: JSON.stringify({
            mimeType: attempt.photo.mimeType,
            byteSize: attempt.photo.bytes.byteLength,
            sha256: attempt.photo.sha256,
          }),
        },
      );
      if (created.entityType !== "ProfileAvatar" || created.state !== "Pending")
        throw new Error("Unexpected avatar create receipt");
      assertOwner(state, generation);
      attempt.id = created.entityId;
    }
    const bytes = attempt.photo.bytes;
    const uploaded = await client.request(
      `/me/profile/avatar-uploads/${attempt.id}/content`,
      accountReceiptSchema,
      {
        method: "PUT",
        headers: {
          "Content-Type": attempt.photo.mimeType,
          "Idempotency-Key": attempt.uploadKey,
        },
        body: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      },
      120_000,
    );
    if (
      uploaded.entityType !== "ProfileAvatar" ||
      uploaded.entityId !== attempt.id ||
      uploaded.state !== "Ready"
    )
      throw new Error("Unexpected avatar upload receipt");
    assertOwner(state, generation);
    if (state.avatar === attempt) {
      state.readyAvatar = attempt.id;
      state.avatar = undefined;
    }
    return attempt.id;
  } catch (error) {
    if (
      state.generation === generation &&
      state.avatar === attempt &&
      definite(error)
    )
      state.avatar = undefined;
    throw error;
  }
}
export async function discardReadyProfileAvatar(
  client: SessionClient,
  keyFactory: () => string,
) {
  const state = stateFor(client),
    generation = state.generation,
    id = state.readyAvatar;
  if (!id) return;
  try {
    const result = await sendAccountCommand(
      client,
      "profile-avatar-discard",
      `/me/profile/avatar-uploads/${id}/discard`,
      { expectedVersion: 2 },
      keyFactory,
      { entityType: "ProfileAvatar", entityId: id },
    );
    if (result.state !== "Retired")
      throw new Error("Unexpected avatar discard receipt");
    assertOwner(state, generation);
    clearReadyProfileAvatar(client, id);
  } catch (error) {
    // A stale local staged pointer may already be attached/collected elsewhere.
    // Forget only that pointer, never delete or alter the active server image.
    if (
      state.generation === generation &&
      error instanceof ApiError &&
      [404, 409].includes(error.status)
    )
      clearReadyProfileAvatar(client, id);
    throw error;
  }
}
