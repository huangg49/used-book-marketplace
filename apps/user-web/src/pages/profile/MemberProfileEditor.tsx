import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  accountErrorMessage,
  accountPasswordRequired,
  clearReadyProfileAvatar,
  discardReadyProfileAvatar,
  readMemberProfile,
  pendingAccountCommand,
  pendingEmailChangeTarget,
  pendingProfileAvatar,
  profileAvatarReadSchema,
  readyProfileAvatar,
  sendAccountCommand,
  uploadProfileAvatar,
  validProfilePhone,
  type CurrentUser,
} from "@used-books/session-client";
import type { components } from "@used-books/api-contract";
import {
  Camera,
  Check,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Trash2,
  Mail,
  ShieldCheck,
  KeyRound,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import { session } from "../../lib/session";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import styles from "../ProfilePage.module.css";
import { ReaderCard } from "./ReaderCard";
import readerCardStyles from "./ReaderCard.module.css";

type Draft = components["schemas"]["UpdateMemberProfile"];
const draftOf = (profile: components["schemas"]["MemberProfile"]): Draft => ({
  expectedVersion: profile.version,
  displayName: profile.displayName,
  contactPhone: profile.contactPhone,
  avatarId: readyProfileAvatar(session) ?? profile.avatarId,
});
const errorText = accountErrorMessage;
const id = () => crypto.randomUUID();

const statusLabels: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  RESTRICTED: "Hạn chế giao dịch",
  LOCKED: "Đang khóa giao dịch",
};

export function MemberProfileEditor({
  ownerId,
  user,
}: {
  ownerId: string;
  user?: CurrentUser;
}) {
  const cache = useQueryClient();
  const alive = useRef(true);
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

  const [draftOverride, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const running = useRef(false);
  // An acknowledged write needs the canonical read, even if its first GET failed.
  const replaceDraftOnRecovery = useRef(false);

  const draft = draftOverride ?? (profile.data ? draftOf(profile.data) : null);
  const pendingSave = pendingAccountCommand(session, "profile-update");
  const pendingEmail = pendingAccountCommand(session, "profile-email");
  const pendingConfirm = pendingAccountCommand(session, "profile-confirm");
  const pendingDiscard = pendingAccountCommand(
    session,
    "profile-avatar-discard",
  );
  const pendingPhoto = pendingProfileAvatar(session);
  const locked =
    busy ||
    needsRead ||
    pendingSave ||
    pendingEmail ||
    pendingConfirm ||
    pendingPhoto ||
    pendingDiscard;
  const needsPassword = accountPasswordRequired(session, "profile-email");
  const dirty = Boolean(
    profile.data &&
      draft &&
      (draft.displayName !== profile.data.displayName ||
        draft.contactPhone !== profile.data.contactPhone ||
        draft.avatarId !== profile.data.avatarId),
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
    enabled: Boolean(draft?.avatarId),
    retry: false,
    refetchInterval: 90_000,
    gcTime: 0,
  });

  async function refresh(preserveDraft = false) {
    const result = await profile.refetch();
    if (!current()) return;
    if (result.error || !result.data) {
      setNeedsRead(true);
      throw result.error ?? new Error("Read unavailable");
    }
    const keepDraft = preserveDraft && !replaceDraftOnRecovery.current;
    setDraft(previous => keepDraft && previous ? previous : draftOf(result.data));
    replaceDraftOnRecovery.current = false;
    if (current()) setNeedsRead(false);
    void cache.invalidateQueries({ queryKey: ["me", ownerId] });
    void cache.invalidateQueries({ queryKey: ["member-profile"] });
    void cache.invalidateQueries({ queryKey: ["profile-avatar"] });
  }

  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (current()) setError(errorText(e));
    } finally {
      running.current = false;
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
      replaceDraftOnRecovery.current = true;
      setNeedsRead(true);
      setMessage("Đã lưu hồ sơ thành công.");
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
      replaceDraftOnRecovery.current = true;
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
      replaceDraftOnRecovery.current = true;
      setNeedsRead(true);
      setMessage(
        "Đã xác minh và đổi email đăng nhập. Các phiên đăng nhập khác đã được thu hồi.",
      );
      await refresh();
    });
  }

  if (profile.isPending) {
    return (
      <div className={styles.loadingCard}>
        <div className={styles.spinner} aria-hidden="true" />
        <p>Đang tải thông tin hồ sơ Bạn đọc Lật Lại…</p>
      </div>
    );
  }

  if (!profile.data || !draft) {
    return (
      <div className={styles.errorCard} role="alert">
        <AlertCircle size={24} className={styles.errorIcon} aria-hidden="true" />
        <div>
          <h3>Chưa tải được hồ sơ</h3>
          <p>Đã xảy ra lỗi khi kết nối với máy chủ. Vui lòng thử lại.</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void profile.refetch()}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const sessionSnap = session.getSnapshot();
  const sessionUser =
    sessionSnap.status === "authenticated" ? sessionSnap.user : undefined;
  const userStatus = user?.status ?? sessionUser?.status ?? "ACTIVE";
  const statusClass =
    userStatus === "ACTIVE"
      ? styles.statusActive
      : userStatus === "RESTRICTED"
        ? styles.statusRestricted
        : styles.statusLocked;

  const initialLetter =
    Array.from(draft.displayName.trim())[0]?.toLocaleUpperCase("vi-VN") ||
    Array.from((user?.displayName ?? "L").trim())[0]?.toLocaleUpperCase("vi-VN") ||
    "L";

  return (
    <>
      {/* Feedback Messages */}
      {message && (
        <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <div>{error}</div>
            {(error.includes("phiên bản") || error.includes("thay đổi")) && (
              <small>
                Nội dung bạn đang nhập vẫn được bảo lưu an toàn. Bạn có thể tải lại bản mới để đối chiếu.
              </small>
            )}
          </div>
        </div>
      )}
      {busy && needsRead && (
        <div className={styles.statusNotice} role="status">
          <RefreshCw size={16} className={styles.spinner} aria-hidden="true" />
          <span>Đang đồng bộ hồ sơ với máy chủ…</span>
        </div>
      )}
      {!busy && (needsRead || profile.error) && (
        <div className={styles.alertNotice} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            Chưa tải lại được thông tin hiện tại. Hồ sơ chưa sẵn sàng cho lần sửa tiếp.
          </span>
          <button
            type="button"
            className={styles.ghostButton}
            disabled={busy}
            onClick={() => void perform(() => refresh(true))}
          >
            Tải lại hồ sơ
          </button>
        </div>
      )}
      {pendingSave && (
        <div className={styles.alertNotice} role="status">
          <AlertCircle size={16} aria-hidden="true" />
          <span>
            Chưa rõ kết quả lần lưu trước. Thử lại sẽ xác minh đúng lần lưu đó.
          </span>
        </div>
      )}

      <ReaderCard ownerId={ownerId} name={draft.displayName.trim() || user?.displayName || 'Bạn đọc Lật Lại'}
        avatar={<div className={styles.heroAvatarWrap}>
            {avatar.data && failedAvatar !== avatar.data.url && draft.avatarId ? (
              <img
                className={styles.heroAvatarImg}
                src={avatar.data.url}
                alt={`Ảnh đại diện của ${draft.displayName}`}
                onError={() => setFailedAvatar(avatar.data!.url)}
              />
            ) : (
              <span className={styles.heroAvatarLetter} aria-hidden="true">
                {initialLetter}
              </span>
            )}

            {/* Upload trigger overlay */}
            <label
              className={styles.heroCameraOverlay}
              title="Thay đổi ảnh đại diện"
              aria-label="Thay đổi ảnh đại diện"
            >
              <Camera size={16} aria-hidden="true" />
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
          </div>}
        status={<div className={`${styles.statusPill} ${statusClass}`}>
                <span className={styles.pulseDot} aria-hidden="true" />
                <span>{statusLabels[userStatus] ?? "Đang hoạt động"}</span>
              </div>} />

      {/* 2. Dual Parallel Functional Cards Grid (50 / 50) */}
      <div className={styles.dualCardsGrid}>
          {/* Card 1: Thông tin Bạn đọc */}
          <section className={styles.contentCard} aria-labelledby="section-profile-info">
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>
                <UserCheck size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 id="section-profile-info" className={styles.cardTitle}>
                  Thông tin Bạn đọc
                </h2>
                <p className={styles.cardSubtitle}>
                  Thông tin hiển thị công khai khi bạn giao lưu, thảo luận và giao dịch sách.
                </p>
              </div>
            </div>

            {(pendingPhoto || avatar.error || failedAvatar === avatar.data?.url || draft.avatarId) && (
              <div className={readerCardStyles.avatarActions}>
                {pendingPhoto && (
                  <button
                    type="button"
                    className={readerCardStyles.avatarAction}
                    disabled={busy}
                    onClick={() => void photo()}
                  >
                    Thử lại ảnh đang tải
                  </button>
                )}
                {(avatar.error || failedAvatar === avatar.data?.url) && (
                  <button
                    type="button"
                    className={readerCardStyles.avatarAction}
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
                    className={readerCardStyles.avatarAction}
                    disabled={
                      busy ||
                      needsRead ||
                      pendingSave ||
                      pendingEmail ||
                      pendingConfirm ||
                      pendingPhoto
                    }
                    onClick={() => void removeAvatar()}
                    title="Gỡ ảnh đại diện hiện tại"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    <span>Gỡ ảnh đại diện</span>
                  </button>
                )}
              </div>
            )}

            <form onSubmit={(event) => void save(event)} className={styles.formContainer}>
              <div className={styles.fieldsStack}>
                {/* Tên hiển thị */}
                <div className={styles.fieldGroup}>
                  <label htmlFor="profile-name">
                    <span>Tên hiển thị</span>
                  </label>
                  <input
                    id="profile-name"
                    className={styles.inputField}
                    autoComplete="name"
                    value={draft.displayName}
                    maxLength={80}
                    disabled={locked}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "profile-name-error" : undefined}
                    onChange={(event) =>
                      setDraft({ ...draft, displayName: event.target.value })
                    }
                  />
                  {fieldErrors.name && (
                    <span id="profile-name-error" role="alert" className={styles.fieldError}>
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

                {/* Số điện thoại liên hệ */}
                <div className={styles.fieldGroup}>
                  <label htmlFor="profile-phone">
                    <span>Số điện thoại liên hệ</span>
                    <span className={styles.optionalBadge}>Tùy chọn</span>
                  </label>
                  <input
                    id="profile-phone"
                    className={styles.inputField}
                    type="tel"
                    autoComplete="tel"
                    placeholder="Ví dụ: 0912345678"
                    value={draft.contactPhone ?? ""}
                    maxLength={20}
                    disabled={locked}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby="profile-phone-note"
                    onChange={(event) =>
                      setDraft({ ...draft, contactPhone: event.target.value || null })
                    }
                  />
                  <small id="profile-phone-note" className={styles.fieldHint}>
                    {fieldErrors.phone ||
                      "Thông tin này không thay đổi địa chỉ hoặc số điện thoại của đơn đã tạo."}
                  </small>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className={styles.actionToolbar}>
                <button
                  className={styles.saveButton}
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
                  <Check size={16} aria-hidden="true" />
                  <span>
                    {busy
                      ? "Đang lưu…"
                      : pendingSave
                        ? "Xác minh lần lưu trước"
                        : "Lưu thay đổi"}
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.ghostButton}
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
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>
                    {pendingDiscard ? "Xác minh bỏ ảnh đang chờ" : "Khôi phục"}
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={locked}
                  onClick={() => void perform(refresh)}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Tải bản mới</span>
                </button>
              </div>
            </form>
          </section>

          {/* Card 2: Đăng nhập & Bảo mật */}
          <section className={styles.contentCard} aria-labelledby="section-security-info">
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>
                <ShieldCheck size={20} aria-hidden="true" />
              </div>
              <div>
                <h2 id="section-security-info" className={styles.cardTitle}>
                  Đăng nhập &amp; Bảo mật
                </h2>
                <p className={styles.cardSubtitle}>
                  Bảo vệ tài khoản và quản trị phương thức xác thực an toàn của bạn.
                </p>
              </div>
            </div>

            {/* Credential Box - Email hiện tại */}
            <div className={styles.credentialBox}>
              <div className={styles.credentialLeft}>
                <div className={styles.credentialIconWrap}>
                  <Mail size={20} aria-hidden="true" />
                </div>
                <div>
                  <div className={styles.credentialLabel}>Email đăng nhập hiện tại</div>
                  <div className={styles.credentialValue}>{profile.data.email}</div>
                </div>
              </div>
              <span className={styles.verifiedBadge}>
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>Đã xác minh</span>
              </span>
            </div>

            {/* Email change subsection */}
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Đổi email đăng nhập</h3>
              <p className={styles.subSectionDesc}>
                Email mới sẽ chỉ thay thế địa chỉ hiện tại sau khi bạn xác thực mã bảo mật 6 số được gửi tới hòm thư mới.
              </p>

              {dirty && (
                <div className={styles.alertNotice} role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>Lưu hoặc bỏ thay đổi ở thông tin bạn đọc phía trên trước khi đổi email.</span>
                </div>
              )}

              {pendingEmail && (
                <div className={styles.statusNotice} role="status">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>
                    {needsPassword
                      ? "Nhập lại mật khẩu hiện tại để tiếp tục. Email mới và yêu cầu đang chờ được giữ nguyên."
                      : "Yêu cầu gửi mã trước chưa rõ kết quả. Hãy xác minh lại yêu cầu đó."}
                  </span>
                </div>
              )}

              <form onSubmit={(event) => void requestEmail(event)} className={styles.formContainer}>
                <div className={styles.fieldsStack}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="profile-new-email">
                      <span>Email mới</span>
                    </label>
                    <input
                      id="profile-new-email"
                      className={styles.inputField}
                      type="email"
                      autoComplete="email"
                      placeholder="nhap.email.moi@latlai.vn"
                      required={!pendingEmail}
                      value={pendingEmail ? pendingEmailChangeTarget(session) ?? email : email}
                      disabled={locked}
                      onChange={(event) => setEmail(event.target.value)}
                      maxLength={254}
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label htmlFor="profile-current-password">
                      <span>Mật khẩu hiện tại</span>
                    </label>
                    <input
                      id="profile-current-password"
                      className={styles.inputField}
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      aria-describedby={needsPassword ? "profile-password-note" : undefined}
                      required={!pendingEmail || needsPassword}
                      value={password}
                      disabled={locked && !(needsPassword && !busy && !needsRead)}
                      onChange={(event) => setPassword(event.target.value)}
                      maxLength={128}
                    />
                    {needsPassword && (
                      <small id="profile-password-note" className={styles.fieldHint}>
                        Nhập lại mật khẩu để tiếp tục đúng yêu cầu đổi email trước.
                      </small>
                    )}
                  </div>
                </div>

                <div className={styles.actionToolbar}>
                  <button
                    type="submit"
                    className={styles.secondaryButton}
                    disabled={
                      busy ||
                      needsRead ||
                      dirty ||
                      pendingSave ||
                      pendingConfirm ||
                      pendingPhoto
                    }
                  >
                    <Mail size={15} aria-hidden="true" />
                    <span>
                      {pendingEmail ? "Xác minh yêu cầu gửi mã" : "Gửi mã xác nhận"}
                    </span>
                  </button>
                </div>
              </form>

              {/* OTP confirm form */}
              {(profile.data.pendingEmailChange || pendingConfirm) && (
                <div className={styles.otpCard}>
                  <div className={styles.otpHeader}>
                    <KeyRound size={20} className={styles.otpIcon} aria-hidden="true" />
                    <div>
                      <div className={styles.otpTitle}>Nhập mã xác nhận 6 số</div>
                      <div className={styles.otpDesc}>
                        Mã bảo mật đã được gửi đến{" "}
                        <strong>{profile.data.pendingEmailChange?.email}</strong>. Hết hạn lúc{" "}
                        <span className={styles.otpTimer}>
                          {profile.data.pendingEmailChange
                            ? new Date(
                                profile.data.pendingEmailChange.expiresAt,
                              ).toLocaleTimeString("vi-VN")
                            : "chưa cập nhật"}
                        </span>
                        . Bạn có thể yêu cầu mã mới sau 60 giây nếu chưa nhận được.
                      </div>
                    </div>
                  </div>

                  {pendingConfirm && (
                    <p role="status" className={styles.statusNotice}>
                      Chưa rõ kết quả xác minh trước. Thử lại cùng mã đã gửi.
                    </p>
                  )}

                  <form onSubmit={(event) => void confirmEmail(event)} className={styles.otpForm}>
                    <div className={styles.fieldGroup}>
                      <input
                        id="profile-email-code"
                        className={styles.otpInput}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        required={!pendingConfirm}
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        disabled={locked}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    </div>

                    <button
                      className={styles.saveButton}
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
                      <Check size={16} aria-hidden="true" />
                      <span>
                        {pendingConfirm
                          ? "Xác minh kết quả trước"
                          : "Xác minh & Đổi email"}
                      </span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Password reset banner */}
            <div className={styles.passwordResetBanner}>
              <div className={styles.passwordResetLeft}>
                <div className={styles.keyIconWrap}>
                  <KeyRound size={20} aria-hidden="true" />
                </div>
                <div>
                  <div className={styles.passwordResetTitle}>Mật khẩu tài khoản</div>
                  <div className={styles.passwordResetDesc}>
                    Đặt lại mật khẩu an toàn qua liên kết gửi đến hòm thư đã đăng ký của bạn.
                  </div>
                </div>
              </div>
              <Link to="/forgot-password" className={styles.passwordResetLink}>
                <span>Đặt lại mật khẩu</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </section>
      </div>

      {/* Unsaved changes prompt */}
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
