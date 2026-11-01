import { useEffect, useRef, useState, useCallback } from "react";
import { BackHandler, Image, StyleSheet, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import type { components } from "@used-books/api-contract";
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
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  ConfirmDialog,
  TextField as Field,
  Notice,
  Screen,
  StatePanel,
  colors,
  space,
} from "../../core/ui";
import { photoBytes } from "../drafts/photo-bytes";
type Draft = components["schemas"]["UpdateMemberProfile"];
const key = () => Crypto.randomUUID();
const goAccount = () =>
  router.canGoBack() ? router.back() : router.replace("/account");

export function ProfileScreen({ ownerId }: { ownerId: string }) {
  const { client } = useSession(),
    cache = useQueryClient(),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => {
    const s = client.getSnapshot();
    return (
      alive.current && s.status === "authenticated" && s.user.id === ownerId
    );
  };
  const profile = useQuery({
    queryKey: ["member-profile", ownerId],
    queryFn: () => readMemberProfile(client),
    retry: false,
  });
  const makeDraft = (p: components["schemas"]["MemberProfile"]): Draft => ({
    expectedVersion: p.version,
    displayName: p.displayName,
    contactPhone: p.contactPhone,
    avatarId: readyProfileAvatar(client) ?? p.avatarId,
  });
  const [draftOverride, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [needsRead, setNeedsRead] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [emailError, setEmailError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [leaveOpen, setLeaveOpen] = useState(false);
  const draft =
    draftOverride ?? (profile.data ? makeDraft(profile.data) : null);
  const pendingSave = pendingAccountCommand(client, "profile-update"),
    pendingEmail = pendingAccountCommand(client, "profile-email"),
    pendingConfirm = pendingAccountCommand(client, "profile-confirm"),
    pendingPhoto = pendingProfileAvatar(client);
  const pendingDiscard = pendingAccountCommand(
    client,
    "profile-avatar-discard",
  );
  const locked =
    busy ||
    needsRead ||
    pendingSave ||
    pendingEmail ||
    pendingConfirm ||
    pendingPhoto ||
    pendingDiscard;
  const needsPassword = accountPasswordRequired(client, "profile-email");
  const dirty = !!(
    profile.data &&
    draft &&
    (draft.displayName !== profile.data.displayName ||
      draft.contactPhone !== profile.data.contactPhone ||
      draft.avatarId !== profile.data.avatarId)
  );
  const leave = useCallback(() => {
    if (!dirty || pendingSave) {
      goAccount();
      return;
    }
    setLeaveOpen(true);
  }, [dirty, pendingSave]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        leave();
        return true;
      });
      return () => listener.remove();
    }, [leave]),
  );
  const avatar = useQuery({
    queryKey: ["profile-avatar", ownerId, draft?.avatarId],
    queryFn: () =>
      client.request(
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
    setDraft(makeDraft(result.data));
    if (current()) setNeedsRead(false);
    void cache.invalidateQueries({ queryKey: ["me", ownerId] });
  }
  async function perform(action: () => Promise<void>, emailOperation = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setEmailError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (current())
        (emailOperation ? setEmailError : setError)(accountErrorMessage(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    if (
      !pendingSave &&
      (!draft.displayName.trim() || draft.displayName.trim().length > 80)
    ) {
      setFieldErrors({ name: "Nhập tên từ 1 đến 80 ký tự." });
      return;
    }
    if (
      !pendingSave &&
      draft.contactPhone &&
      !validProfilePhone(draft.contactPhone)
    ) {
      setFieldErrors({
        phone: "Nhập số điện thoại gồm 8–15 chữ số, tối đa 20 ký tự.",
      });
      return;
    }
    setFieldErrors({});
    await perform(async () => {
      const receipt = await sendAccountCommand(
        client,
        "profile-update",
        "/me/profile",
        draft,
        key,
        { entityType: "MemberProfile", entityId: ownerId },
      );
      if (!current()) return;
      if (
        receipt.entityType !== "MemberProfile" ||
        receipt.entityId !== ownerId
      )
        throw new Error("Unexpected receipt");
      const ready = readyProfileAvatar(client);
      if (ready) clearReadyProfileAvatar(client, ready);
      setNeedsRead(true);
      setMessage("Đã lưu hồ sơ.");
      await refresh();
    });
  }
  async function photo() {
    await perform(async () => {
      let prepared = null;
      if (!pendingPhoto) {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.65,
          allowsMultipleSelection: false,
        });
        if (picked.canceled) return;
        const asset = picked.assets[0],
          mimeType = asset.mimeType;
        if (
          !mimeType ||
          !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
        )
          throw new ApiError(415, "UnsupportedMediaType", "Unsupported image");
        if ((asset.fileSize ?? 0) > 2_000_000)
          throw new ApiError(413, "PayloadTooLarge", "Image too large");
        const bytes = await photoBytes(asset.uri);
        if (!bytes.length || bytes.length > 2_000_000)
          throw new ApiError(413, "PayloadTooLarge", "Image too large");
        const hash = new Uint8Array(
          await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes),
        );
        prepared = {
          bytes,
          mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
          sha256: Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join(
            "",
          ),
        };
      }
      if (!current()) return;
      const avatarId = await uploadProfileAvatar(client, prepared, key);
      if (current()) {
        setDraft((previous) => ({
          ...(previous ?? makeDraft(profile.data!)),
          avatarId,
        }));
        setMessage("Ảnh đã tải. Chọn Lưu hồ sơ để dùng ảnh này.");
      }
    });
  }
  async function resetDraft() {
    await perform(async () => {
      await discardReadyProfileAvatar(client, key);
      if (current()) setDraft(makeDraft(profile.data!));
    });
  }
  async function removeAvatar() {
    await perform(async () => {
      await discardReadyProfileAvatar(client, key);
      if (current())
        setDraft((previous) => ({
          ...(previous ?? makeDraft(profile.data!)),
          avatarId: null,
        }));
    });
  }
  async function requestEmail() {
    if (
      (!pendingEmail && !email.trim()) ||
      ((!pendingEmail || needsPassword) && password.length < 10)
    ) {
      setEmailError("Nhập email mới và mật khẩu hiện tại.");
      return;
    }
    await perform(async () => {
      await sendAccountCommand(
        client,
        "profile-email",
        "/me/profile/email-changes",
        { expectedVersion: profile.data!.version, email, password },
        key,
        { entityType: "MemberEmailChange" },
      );
      if (!current()) return;
      setPassword("");
      setNeedsRead(true);
      setMessage(
        "Nếu email phù hợp, mã xác nhận đã được gửi đến địa chỉ mới. Email hiện tại chưa thay đổi.",
      );
      await refresh();
    }, true);
  }
  async function confirmEmail() {
    if (!pendingConfirm && !/^\d{6}$/.test(code)) {
      setEmailError("Nhập đúng mã xác nhận gồm 6 số.");
      return;
    }
    await perform(async () => {
      await sendAccountCommand(
        client,
        "profile-confirm",
        "/me/profile/email-changes/confirm",
        { changeId: profile.data?.pendingEmailChange?.id, code },
        key,
        {
          entityType: "MemberEmailChange",
          entityId: profile.data?.pendingEmailChange?.id,
        },
      );
      if (!current()) return;
      setCode("");
      setEmail("");
      setNeedsRead(true);
      setMessage(
        "Đã xác minh và đổi email. Các phiên đăng nhập khác đã được thu hồi.",
      );
      await refresh();
    }, true);
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !dirty || pendingSave }} />
      <BackAction title="Về tài khoản" onPress={leave} />
      <View style={styles.content}>
        <AppText kind="heading" accessibilityRole="header">
          Hồ sơ của tôi
        </AppText>
        <AppText>Tên, ảnh đại diện và thông tin liên hệ tại Lật lại.</AppText>
        {profile.isPending && <StatePanel loading title="Đang tải hồ sơ…" />}
        {(!profile.data || !draft) && profile.error && (
          <StatePanel
            title="Chưa tải được hồ sơ"
            action={{ label: "Thử lại", onPress: () => void profile.refetch() }}
          />
        )}
        {message && <Notice>{message}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {busy && needsRead && (
          <StatePanel loading title="Đang cập nhật hồ sơ…" />
        )}
        {!busy && (needsRead || profile.error) && profile.data && (
          <StatePanel
            title="Chưa tải lại được thông tin hiện tại"
            message="Tải lại hồ sơ trước lần sửa tiếp."
            action={{
              label: "Tải lại hồ sơ",
              busy,
              onPress: () => void perform(refresh),
            }}
          />
        )}
        {profile.data && draft && (
          <>
            {pendingSave && (
              <Notice>
                Chưa rõ kết quả lần lưu trước. Thử lại để xác minh đúng lần lưu
                đó.
              </Notice>
            )}
            <View style={styles.avatarRow}>
              {avatar.data && failedAvatar !== avatar.data.url ? (
                <Image
                  source={{ uri: avatar.data.url }}
                  style={styles.avatar}
                  accessibilityLabel="Ảnh đại diện của bạn"
                  onError={() => setFailedAvatar(avatar.data!.url)}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <AppText kind="heading">
                    {Array.from(draft.displayName.trim())[0] || "L"}
                  </AppText>
                </View>
              )}
              <View style={styles.avatarActions}>
                <Button
                  secondary
                  title={
                    pendingPhoto ? "Thử lại ảnh đang tải" : "Chọn ảnh đại diện"
                  }
                  disabled={locked && !pendingPhoto}
                  busy={busy}
                  onPress={() => void photo()}
                />
                {draft.avatarId && (
                  <Button
                    secondary
                    title="Bỏ ảnh đại diện"
                    disabled={
                      busy ||
                      needsRead ||
                      pendingSave ||
                      pendingEmail ||
                      pendingConfirm ||
                      pendingPhoto
                    }
                    onPress={() => void removeAvatar()}
                  />
                )}
                {(avatar.error || failedAvatar === avatar.data?.url) && (
                  <Button
                    secondary
                    title="Tải lại ảnh đại diện"
                    onPress={() => {
                      setFailedAvatar(null);
                      void avatar.refetch();
                    }}
                  />
                )}
              </View>
            </View>
            <AppText kind="small">
              Ảnh JPEG, PNG hoặc WebP không quá 2 MB. Chỉ đổi ảnh đại diện sau
              khi lưu hồ sơ.
            </AppText>
            <Field
              label="Tên hiển thị"
              error={fieldErrors.name}
              required
              value={draft.displayName}
              maxLength={80}
              editable={!locked}
              autoComplete="name"
              onChangeText={(value) =>
                setDraft({ ...draft, displayName: value })
              }
            />
            <Field
              label="Số điện thoại liên hệ"
              error={fieldErrors.phone}
              hint="Không bắt buộc. Không thay số điện thoại hoặc địa chỉ trên đơn đã tạo."
              keyboardType="phone-pad"
              autoComplete="tel"
              value={draft.contactPhone ?? ""}
              maxLength={20}
              editable={!locked}
              onChangeText={(value) =>
                setDraft({ ...draft, contactPhone: value || null })
              }
            />
            <Button
              title={pendingSave ? "Xác minh lần lưu trước" : "Lưu hồ sơ"}
              busy={busy}
              disabled={
                needsRead ||
                pendingEmail ||
                pendingConfirm ||
                pendingPhoto ||
                pendingDiscard ||
                (!dirty && !pendingSave)
              }
              onPress={() => void save()}
            />
            <Button
              secondary
              title={
                pendingDiscard
                  ? "Xác minh bỏ ảnh đang chờ"
                  : "Khôi phục bản đang xem"
              }
              disabled={
                busy ||
                needsRead ||
                pendingSave ||
                pendingEmail ||
                pendingConfirm ||
                pendingPhoto
              }
              onPress={() => void resetDraft()}
            />
            <Button
              secondary
              title="Tải bản mới"
              disabled={locked}
              onPress={() => void perform(refresh)}
            />
            <View style={styles.emailSection}>
              <AppText kind="title" accessibilityRole="header">
                Email đăng nhập
              </AppText>
              <AppText selectable>{profile.data.email}</AppText>
              <AppText>
                Email mới chỉ thay địa chỉ hiện tại sau khi xác minh mã 6 số.
              </AppText>
              {dirty && (
                <Notice>Lưu hoặc bỏ thay đổi hồ sơ trước khi đổi email.</Notice>
              )}
              {pendingEmail && (
                <Notice>
                  {needsPassword
                    ? "Nhập lại mật khẩu hiện tại để tiếp tục. Email mới và yêu cầu đang chờ được giữ nguyên."
                    : "Yêu cầu gửi mã trước chưa rõ kết quả. Thử lại sẽ xác minh đúng yêu cầu đó."}
                </Notice>
              )}
              {emailError && !needsPassword && (
                <Notice tone="error">{emailError}</Notice>
              )}
              <Field
                label="Email mới"
                value={
                  pendingEmail
                    ? (pendingEmailChangeTarget(client) ?? email)
                    : email
                }
                maxLength={254}
                editable={!locked}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                onChangeText={setEmail}
              />
              <Field
                label="Mật khẩu hiện tại"
                error={needsPassword ? emailError : undefined}
                hint={
                  needsPassword
                    ? "Nhập lại mật khẩu để tiếp tục đúng yêu cầu đổi email trước."
                    : undefined
                }
                value={password}
                maxLength={128}
                editable={!locked || (needsPassword && !busy && !needsRead)}
                secureTextEntry
                autoComplete="current-password"
                onChangeText={setPassword}
              />
              <Button
                secondary
                title={
                  pendingEmail
                    ? "Xác minh yêu cầu gửi mã"
                    : "Gửi mã đến email mới"
                }
                busy={busy}
                disabled={
                  needsRead ||
                  dirty ||
                  pendingSave ||
                  pendingConfirm ||
                  pendingPhoto
                }
                onPress={() => void requestEmail()}
              />
              {(profile.data.pendingEmailChange || pendingConfirm) && (
                <>
                  <AppText>
                    Mã gửi đến {profile.data.pendingEmailChange?.email}. Hết hạn
                    lúc{" "}
                    {profile.data.pendingEmailChange
                      ? new Date(
                          profile.data.pendingEmailChange.expiresAt,
                        ).toLocaleTimeString("vi-VN")
                      : "chưa cập nhật"}
                    . Có thể yêu cầu mã mới sau 60 giây.
                  </AppText>
                  <Field
                    label="Mã xác nhận"
                    value={code}
                    maxLength={6}
                    editable={!locked}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    onChangeText={setCode}
                  />
                  {pendingConfirm && (
                    <Notice>
                      Chưa rõ kết quả xác minh trước. Thử lại cùng mã đã gửi.
                    </Notice>
                  )}
                  <Button
                    title={
                      pendingConfirm
                        ? "Xác minh kết quả trước"
                        : "Xác minh và đổi email"
                    }
                    busy={busy}
                    disabled={
                      needsRead ||
                      dirty ||
                      pendingSave ||
                      pendingEmail ||
                      pendingPhoto
                    }
                    onPress={() => void confirmEmail()}
                  />
                </>
              )}
            </View>
          </>
        )}
      </View>
      <ConfirmDialog
        visible={leaveOpen}
        title="Rời hồ sơ chưa lưu?"
        message="Rời trang sẽ bỏ thông tin bạn đang nhập."
        confirmLabel="Rời trang"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          goAccount();
        }}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: space.md },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flexWrap: "wrap",
  },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActions: { flexGrow: 1, gap: space.sm },
  emailSection: {
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: space.lg,
    marginTop: space.sm,
  },
});
