import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  accountErrorMessage,
  accountPasswordRequired,
  clearReadyProfileAvatar,
  discardReadyProfileAvatar,
  readMemberProfile,
  pendingAccountCommand,
  pendingProfileAvatar,
  pendingEmailChangeTarget,
  profileAvatarReadSchema,
  readyProfileAvatar,
  sendAccountCommand,
  uploadProfileAvatar,
  validProfilePhone,
} from "@used-books/session-client";
import type { components } from "@used-books/api-contract";
import { session } from "../../lib/session";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import styles from "../ProfilePage.module.css";
import { ReaderCard } from './ReaderCard';

type Draft = components["schemas"]["UpdateMemberProfile"];
const draftOf = (profile: components["schemas"]["MemberProfile"]): Draft => ({
  expectedVersion: profile.version,
  displayName: profile.displayName,
  contactPhone: profile.contactPhone,
  avatarId: readyProfileAvatar(session) ?? profile.avatarId,
});
const errorText = accountErrorMessage;
const id = () => crypto.randomUUID();

export function MemberProfileEditor({ ownerId }: { ownerId: string }) {
  const cache = useQueryClient(),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => {
    const s = session.getSnapshot();
    return (
      alive.current && s.status === "authenticated" && s.user.id === ownerId
    );
  };
  const profile = useQuery({
    queryKey: ["member-profile", ownerId],
    queryFn: () => readMemberProfile(session),
    retry: false,
  });
  const [draftOverride, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [needsRead, setNeedsRead] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const draft = draftOverride ?? (profile.data ? draftOf(profile.data) : null);
  const pendingSave = pendingAccountCommand(session, "profile-update"),
    pendingEmail = pendingAccountCommand(session, "profile-email"),
    pendingConfirm = pendingAccountCommand(session, "profile-confirm");
  const pendingDiscard = pendingAccountCommand(
    session,
    "profile-avatar-discard",
  );
  const pendingPhoto = pendingProfileAvatar(session),
    locked =
      busy ||
      needsRead ||
      pendingSave ||
      pendingEmail ||
      pendingConfirm ||
      pendingPhoto ||
      pendingDiscard;
  const needsPassword = accountPasswordRequired(session, "profile-email");
  const dirty = !!(
    profile.data &&
    draft &&
    (draft.displayName !== profile.data.displayName ||
      draft.contactPhone !== profile.data.contactPhone ||
      draft.avatarId !== profile.data.avatarId)
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !busy &&
      !pendingSave &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const avatar = useQuery({
    queryKey: ["profile-avatar", ownerId, draft?.avatarId],
    queryFn: () =>
      session.request(
        `/me/profile/avatar-uploads/${draft!.avatarId}/read`,
        profileAvatarReadSchema,
      ),
    enabled: !!draft?.avatarId,
    retry: false,
    refetchInterval: 90_000,
    gcTime: 0,
  });
  async function refresh() {
    const result = await profile.refetch();
    if (!current()) return;
    if (result.error || !result.data) {
      setNeedsRead(true);
      throw result.error ?? new Error("Read unavailable");
    }
    setDraft(draftOf(result.data));
    if (current()) setNeedsRead(false);
    void cache.invalidateQueries({ queryKey: ["me", ownerId] });
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (current()) setError(errorText(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const invalid: Record<string, string> = {};
    if (!pendingSave) {
      if (!draft.displayName.trim() || draft.displayName.trim().length > 80)
        invalid.name = "Nhập tên từ 1 đến 80 ký tự.";
      if (draft.contactPhone && !validProfilePhone(draft.contactPhone))
        invalid.phone = "Nhập số điện thoại từ 8 đến 20 ký tự.";
    }
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    await perform(async () => {
      const receipt = await sendAccountCommand(
        session,
        "profile-update",
        "/me/profile",
        draft,
        id,
        { entityType: "MemberProfile", entityId: ownerId },
      );
      if (!current()) return;
      if (
        receipt.entityType !== "MemberProfile" ||
        receipt.entityId !== ownerId
      )
        throw new Error("Unexpected receipt");
      const ready = readyProfileAvatar(session);
      if (ready) clearReadyProfileAvatar(session, ready);
      setNeedsRead(true);
      setMessage("Đã lưu hồ sơ.");
      await refresh();
    });
  }
  async function photo(file?: File) {
    await perform(async () => {
      let prepared = null;
      if (file && !pendingPhoto) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10_000_000
        )
          throw new ApiError(
            422,
            "VALIDATION_ERROR",
            "Chọn ảnh JPEG, PNG hoặc WebP không quá 10 MB.",
          );
        const bitmap = await createImageBitmap(file);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          const size = Math.min(bitmap.width, bitmap.height);
          context.drawImage(
            bitmap,
            (bitmap.width - size) / 2,
            (bitmap.height - size) / 2,
            size,
            size,
            0,
            0,
            256,
            256,
          );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("Image unavailable"))),
              "image/webp",
              0.82,
            ),
          );
          const bytes = new Uint8Array(await blob.arrayBuffer()),
            hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
          prepared = {
            bytes,
            mimeType: "image/webp" as const,
            sha256: Array.from(hash, (b) =>
              b.toString(16).padStart(2, "0"),
            ).join(""),
          };
        } finally {
          bitmap.close();
        }
      }
      if (!current()) return;
      const avatarId = await uploadProfileAvatar(session, prepared, id);
      if (current()) {
        setDraft((previous) => ({
          ...(previous ?? draftOf(profile.data!)),
          avatarId,
        }));
        setMessage("Ảnh đã tải. Chọn Lưu hồ sơ để dùng ảnh này.");
      }
    });
  }
  async function resetDraft() {
    await perform(async () => {
      await discardReadyProfileAvatar(session, id);
      if (current()) {
        setDraft(draftOf(profile.data!));
        setFieldErrors({});
      }
    });
  }
  async function removeAvatar() {
    await perform(async () => {
      await discardReadyProfileAvatar(session, id);
      if (current())
        setDraft((previous) => ({
          ...(previous ?? draftOf(profile.data!)),
          avatarId: null,
        }));
    });
  }
  async function requestEmail(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      await sendAccountCommand(
        session,
        "profile-email",
        "/me/profile/email-changes",
        { expectedVersion: profile.data!.version, email, password },
        id,
        { entityType: "MemberEmailChange" },
      );
      if (!current()) return;
      setPassword("");
      setNeedsRead(true);
      setMessage(
        "Nếu email phù hợp, mã xác nhận đã được gửi đến địa chỉ mới. Email đăng nhập hiện tại chưa thay đổi.",
      );
      await refresh();
    });
  }
  async function confirmEmail(event: FormEvent) {
    event.preventDefault();
    const changeId = profile.data?.pendingEmailChange?.id;
    if (!changeId && !pendingConfirm) return;
    await perform(async () => {
      await sendAccountCommand(
        session,
        "profile-confirm",
        "/me/profile/email-changes/confirm",
        { changeId, code },
        id,
        { entityType: "MemberEmailChange", entityId: changeId },
      );
      if (!current()) return;
      setCode("");
      setEmail("");
      setNeedsRead(true);
      setMessage(
        "Đã xác minh và đổi email đăng nhập. Các phiên đăng nhập khác đã được thu hồi.",
      );
      await refresh();
    });
  }
  if (profile.isPending) return <p role="status">Đang tải hồ sơ…</p>;
  if (!profile.data || !draft)
    return (
      <div role="alert">
        <p>Chưa tải được hồ sơ.</p>
        <button type="button" onClick={() => void profile.refetch()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <>
      {message && (
        <p className={styles.feedback} role="status">
          {message}
        </p>
      )}
      {error && (
        <div className={styles.feedback} role="alert">
          <p>{error}</p>
          {error.includes("phiên bản") || error.includes("thay đổi") ? (
            <p>
              Nội dung đang nhập vẫn được giữ. Bạn có thể tải bản mới để đối
              chiếu.
            </p>
          ) : null}
        </div>
      )}
      {busy && needsRead && (
        <p className={styles.feedback} role="status">
          Đang cập nhật hồ sơ…
        </p>
      )}
      {!busy && (needsRead || profile.error) && (
        <div className={styles.feedback} role="alert">
          <p>
            Chưa tải lại được thông tin hiện tại. Hồ sơ chưa sẵn sàng cho lần
            sửa tiếp.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void perform(refresh)}
          >
            Tải lại hồ sơ
          </button>
        </div>
      )}
      {pendingSave && (
        <p className={styles.feedback} role="status">
          Chưa rõ kết quả lần lưu trước. Thử lại sẽ xác minh đúng lần lưu đó.
        </p>
      )}
      <ReaderCard ownerId={ownerId} name={draft.displayName.trim() || profile.data.displayName}
        avatar={avatar.data && failedAvatar !== avatar.data.url ? <img src={avatar.data.url} alt="Ảnh đại diện của bạn" onError={() => setFailedAvatar(avatar.data!.url)} /> : undefined} />
      <form onSubmit={(event) => void save(event)} className={styles.editor}>
        <div className={styles.avatarEditor}>
          {avatar.data && failedAvatar !== avatar.data.url ? (
            <img
              className={styles.avatarPhoto}
              src={avatar.data.url}
              alt="Ảnh đại diện của bạn"
              onError={() => setFailedAvatar(avatar.data!.url)}
            />
          ) : (
            <span className={styles.initial} aria-hidden="true">
              {Array.from(draft.displayName.trim())[0] || "L"}
            </span>
          )}
          <div>
            <label className={styles.fileLabel}>
              Chọn ảnh đại diện
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void photo(file);
                }}
              />
            </label>
            <p>Ảnh được cắt vuông. Chỉ đổi avatar sau khi lưu hồ sơ.</p>
            {pendingPhoto && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void photo()}
              >
                Thử lại ảnh đang tải
              </button>
            )}
            {(avatar.error || failedAvatar === avatar.data?.url) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFailedAvatar(null);
                  void avatar.refetch();
                }}
              >
                Tải lại ảnh đại diện
              </button>
            )}
            {draft.avatarId && (
              <button
                type="button"
                disabled={
                  busy ||
                  needsRead ||
                  pendingSave ||
                  pendingEmail ||
                  pendingConfirm ||
                  pendingPhoto
                }
                onClick={() => void removeAvatar()}
              >
                Bỏ ảnh đại diện
              </button>
            )}
          </div>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.fieldGroup}>
            <label htmlFor="profile-name">Tên hiển thị</label>
            <input
              id="profile-name"
              autoComplete="name"
              value={draft.displayName}
              maxLength={80}
              disabled={locked}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={
                fieldErrors.name ? "profile-name-error" : undefined
              }
              onChange={(event) =>
                setDraft({ ...draft, displayName: event.target.value })
              }
            />
            {fieldErrors.name && (
              <span id="profile-name-error" role="alert">
                {fieldErrors.name}
              </span>
            )}
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="profile-phone">
              Số điện thoại liên hệ <span>(không bắt buộc)</span>
            </label>
            <input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              value={draft.contactPhone ?? ""}
              maxLength={20}
              disabled={locked}
              aria-invalid={!!fieldErrors.phone}
              aria-describedby="profile-phone-note"
              onChange={(event) =>
                setDraft({ ...draft, contactPhone: event.target.value || null })
              }
            />
            <small id="profile-phone-note">
              {fieldErrors.phone ||
                "Thông tin này không thay địa chỉ hoặc số điện thoại của đơn đã tạo."}
            </small>
          </div>
        </div>
        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={
              busy ||
              needsRead ||
              pendingEmail ||
              pendingConfirm ||
              pendingPhoto ||
              pendingDiscard ||
              (!dirty && !pendingSave)
            }
          >
            {busy
              ? "Đang xử lý…"
              : pendingSave
                ? "Xác minh lần lưu trước"
                : "Lưu hồ sơ"}
          </button>
          <button
            type="button"
            disabled={
              busy ||
              needsRead ||
              pendingSave ||
              pendingEmail ||
              pendingConfirm ||
              pendingPhoto
            }
            onClick={() => void resetDraft()}
          >
            {pendingDiscard
              ? "Xác minh bỏ ảnh đang chờ"
              : "Khôi phục bản đang xem"}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => void perform(refresh)}
          >
            Tải bản mới
          </button>
        </div>
      </form>
      <section
        className={styles.emailSection}
        aria-labelledby="email-change-heading"
      >
        <h2 id="email-change-heading">Email đăng nhập</h2>
        <p className={styles.emailValue}>{profile.data.email}</p>
        <p>Email mới chỉ thay thế địa chỉ này sau khi xác minh bằng mã 6 số.</p>
        {dirty && <p>Lưu hoặc bỏ thay đổi hồ sơ trước khi đổi email.</p>}
        {pendingEmail && (
          <p role="status">
            {needsPassword
              ? "Nhập lại mật khẩu hiện tại để tiếp tục. Email mới và yêu cầu đang chờ được giữ nguyên."
              : "Yêu cầu gửi mã trước chưa rõ kết quả. Hãy xác minh lại yêu cầu đó."}
          </p>
        )}
        <form
          onSubmit={(event) => void requestEmail(event)}
          className={styles.editor}
        >
          <div className={styles.formGrid}>
            <label htmlFor="profile-new-email">
              Email mới
              <input
                id="profile-new-email"
                type="email"
                autoComplete="email"
                required={!pendingEmail}
                value={
                  pendingEmail
                    ? (pendingEmailChangeTarget(session) ?? email)
                    : email
                }
                disabled={locked}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
              />
            </label>
            <div className={styles.fieldGroup}>
              <label htmlFor="profile-current-password">
                Mật khẩu hiện tại
              </label>
              <input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                aria-describedby={
                  needsPassword ? "profile-password-note" : undefined
                }
                required={!pendingEmail || needsPassword}
                value={password}
                disabled={locked && !(needsPassword && !busy && !needsRead)}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={128}
              />
              {needsPassword && (
                <small id="profile-password-note">
                  Nhập lại mật khẩu để tiếp tục đúng yêu cầu đổi email trước.
                </small>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={
              busy ||
              needsRead ||
              dirty ||
              pendingSave ||
              pendingConfirm ||
              pendingPhoto
            }
          >
            {pendingEmail ? "Xác minh yêu cầu gửi mã" : "Gửi mã đến email mới"}
          </button>
        </form>
        {(profile.data.pendingEmailChange || pendingConfirm) && (
          <form
            className={styles.editor}
            onSubmit={(event) => void confirmEmail(event)}
          >
            <p>
              Mã gửi đến{" "}
              <strong>{profile.data.pendingEmailChange?.email}</strong>. Hết hạn
              lúc{" "}
              {profile.data.pendingEmailChange
                ? new Date(
                    profile.data.pendingEmailChange.expiresAt,
                  ).toLocaleTimeString("vi-VN")
                : "chưa cập nhật"}
              . Có thể yêu cầu mã mới sau 60 giây.
            </p>
            {pendingConfirm && (
              <p role="status">
                Chưa rõ kết quả xác minh trước. Thử lại cùng mã đã gửi.
              </p>
            )}
            <label htmlFor="profile-email-code">
              Mã xác nhận
              <input
                id="profile-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required={!pendingConfirm}
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                disabled={locked}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={
                busy ||
                needsRead ||
                dirty ||
                pendingSave ||
                pendingEmail ||
                pendingPhoto
              }
            >
              {pendingConfirm
                ? "Xác minh kết quả trước"
                : "Xác minh và đổi email"}
            </button>
          </form>
        )}
      </section>
      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        title="Rời hồ sơ chưa lưu?"
        description="Thông tin bạn vừa sửa chưa được lưu. Rời trang sẽ bỏ nội dung đang nhập."
        confirmText="Rời trang"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </>
  );
}
