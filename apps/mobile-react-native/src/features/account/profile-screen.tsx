import { useEffect, useRef, useState, useCallback } from "react";
import {
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
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
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { photoBytes } from "../drafts/photo-bytes";
type Draft = components["schemas"]["UpdateMemberProfile"];
const key = () => Crypto.randomUUID();
const goAccount = () =>
  router.canGoBack() ? router.back() : router.replace("/account");

function WineField({
  label,
  required,
  error,
  hint,
  ...props
}: TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wineFieldWrap}>
      <AppText kind="bold" style={styles.wineFieldLabel}>
        {label}
        {required ? " *" : ""}
      </AppText>
      <TextInput
        {...props}
        placeholderTextColor="rgba(255, 223, 151, 0.45)"
        selectionColor={stitchTokens.gold}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.wineInput,
          focused && styles.wineInputFocused,
          error && styles.wineInputError,
          props.editable === false && styles.wineInputDisabled,
        ]}
      />
      {error ? (
        <AppText kind="small" style={styles.wineFieldError}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText kind="small" style={styles.wineFieldHint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function ProfileBackdrop() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 860"
      preserveAspectRatio="xMidYMin slice"
    >
      <Defs>
        <LinearGradient id="paperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FBF7F0" />
          <Stop offset="52%" stopColor="#F6EFE3" />
          <Stop offset="100%" stopColor="#EFE5D5" />
        </LinearGradient>
        <LinearGradient id="wineArchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#6E0505" />
          <Stop offset="55%" stopColor="#5C0202" />
          <Stop offset="100%" stopColor="#3B0000" />
        </LinearGradient>
        <RadialGradient id="goldGlowTop" cx="85%" cy="10%" r="45%">
          <Stop offset="0%" stopColor="#FFDF97" stopOpacity="0.34" />
          <Stop offset="60%" stopColor="#F4CB67" stopOpacity="0.08" />
          <Stop offset="100%" stopColor="#5C0202" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="warmHaloBottom" cx="15%" cy="88%" r="46%">
          <Stop offset="0%" stopColor="#F4CB67" stopOpacity="0.22" />
          <Stop offset="65%" stopColor="#FFDF97" stopOpacity="0.08" />
          <Stop offset="100%" stopColor="#EFE5D5" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="wineTintBottom" cx="92%" cy="74%" r="40%">
          <Stop offset="0%" stopColor="#5C0202" stopOpacity="0.07" />
          <Stop offset="100%" stopColor="#EFE5D5" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Warm fine-paper canvas */}
      <Rect x="0" y="0" width="400" height="860" fill="url(#paperGrad)" />

      {/* Subtle bottom warm halos */}
      <Rect x="0" y="0" width="400" height="860" fill="url(#warmHaloBottom)" />
      <Rect x="0" y="0" width="400" height="860" fill="url(#wineTintBottom)" />

      {/* Sweeping curved wine header backdrop */}
      <Path
        d="M0 0 H400 V158 Q200 202 0 158 Z"
        fill="url(#wineArchGrad)"
      />
      <Path
        d="M0 0 H400 V158 Q200 202 0 158 Z"
        fill="url(#goldGlowTop)"
      />

      {/* Delicate golden filigree arcs on the wine header */}
      <Circle
        cx="358"
        cy="34"
        r="86"
        fill="none"
        stroke="#FFDF97"
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <Circle
        cx="358"
        cy="34"
        r="58"
        fill="none"
        stroke="#FFDF97"
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <Circle
        cx="34"
        cy="132"
        r="64"
        fill="none"
        stroke="#FFDF97"
        strokeOpacity="0.12"
        strokeWidth="1"
      />

      {/* Subtle gold accent border along the curved bottom edge */}
      <Path
        d="M0 158 Q200 202 400 158"
        fill="none"
        stroke="#FFDF97"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />

      {/* Decorative watermark rings on lower parchment */}
      <Circle
        cx="38"
        cy="780"
        r="110"
        fill="none"
        stroke="#5C0202"
        strokeOpacity="0.05"
        strokeWidth="1"
      />
      <Circle
        cx="38"
        cy="780"
        r="76"
        fill="none"
        stroke="#B08D2F"
        strokeOpacity="0.1"
        strokeWidth="1"
      />
    </Svg>
  );
}

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
  const [activeTab, setActiveTab] = useState<"info" | "email">("info");
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
  const hasPendingEmailFlow = Boolean(
    profile.data?.pendingEmailChange || pendingEmail || pendingConfirm,
  );
  const saveDisabled =
    busy ||
    needsRead ||
    pendingEmail ||
    pendingConfirm ||
    pendingPhoto ||
    pendingDiscard ||
    (!dirty && !pendingSave);
  const resetDisabled =
    busy ||
    needsRead ||
    pendingSave ||
    pendingEmail ||
    pendingConfirm ||
    pendingPhoto;
  const emailReqDisabled =
    busy ||
    needsRead ||
    dirty ||
    pendingSave ||
    pendingConfirm ||
    pendingPhoto;
  const emailConfirmDisabled =
    busy ||
    needsRead ||
    dirty ||
    pendingSave ||
    pendingEmail ||
    pendingPhoto;

  return (
    <Screen background={<ProfileBackdrop />} canvasColor={stitchTokens.creamBg}>
      <Stack.Screen options={{ gestureEnabled: !dirty || pendingSave }} />
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về tài khoản"
          onPress={leave}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="back" size={18} color={stitchTokens.white} />
          <AppText kind="bold" style={styles.backBtnText}>
            Về tài khoản
          </AppText>
        </Pressable>
        {profile.data && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tải bản mới"
            disabled={locked}
            onPress={() => void perform(refresh)}
            style={({ pressed }) => [
              styles.refreshIconBtn,
              pressed && styles.pressed,
              locked && styles.disabledChip,
            ]}
          >
            <Icon name="sync" size={16} color={stitchTokens.gold} />
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
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

            {/* Compact Wine & Gold Identity Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    pendingPhoto ? "Thử lại ảnh đang tải" : "Chọn ảnh đại diện"
                  }
                  disabled={locked && !pendingPhoto}
                  onPress={() => void photo()}
                  style={({ pressed }) => [
                    styles.avatarPressable,
                    pressed && styles.pressed,
                  ]}
                >
                  {avatar.data && failedAvatar !== avatar.data.url ? (
                    <Image
                      source={{ uri: avatar.data.url }}
                      style={styles.avatar}
                      accessibilityLabel="Ảnh đại diện của bạn"
                      onError={() => setFailedAvatar(avatar.data!.url)}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <AppText kind="heading" style={styles.avatarInitial}>
                        {Array.from(draft.displayName.trim())[0]?.toUpperCase() ||
                          "L"}
                      </AppText>
                    </View>
                  )}
                  <View style={styles.cameraBadge}>
                    <Icon name="camera" size={12} color={stitchTokens.white} />
                  </View>
                </Pressable>

                <View style={styles.heroInfo}>
                  <AppText
                    kind="card"
                    numberOfLines={1}
                    style={styles.heroName}
                  >
                    {draft.displayName.trim() || "Bạn đọc Lật lại"}
                  </AppText>
                  <AppText
                    kind="small"
                    numberOfLines={1}
                    style={styles.heroEmail}
                  >
                    {profile.data.email}
                  </AppText>

                  <View style={styles.heroActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={locked && !pendingPhoto}
                      onPress={() => void photo()}
                      style={({ pressed }) => [
                        styles.heroPillBtn,
                        pressed && styles.pressed,
                        locked && !pendingPhoto && styles.disabledChip,
                      ]}
                    >
                      <Icon
                        name="camera"
                        size={12}
                        color={stitchTokens.wine}
                      />
                      <AppText kind="small" style={styles.heroPillText}>
                        {pendingPhoto ? "Thử lại ảnh" : "Đổi ảnh"}
                      </AppText>
                    </Pressable>

                    {draft.avatarId && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={resetDisabled}
                        onPress={() => void removeAvatar()}
                        style={({ pressed }) => [
                          styles.heroPillGhost,
                          pressed && styles.pressed,
                          resetDisabled && styles.disabledChip,
                        ]}
                      >
                        <Icon
                          name="trash"
                          size={12}
                          color={colors.error}
                        />
                        <AppText kind="small" style={styles.heroPillGhostText}>
                          Bỏ ảnh
                        </AppText>
                      </Pressable>
                    )}

                    {(avatar.error || failedAvatar === avatar.data?.url) && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setFailedAvatar(null);
                          void avatar.refetch();
                        }}
                        style={({ pressed }) => [
                          styles.heroPillGhost,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText kind="small" style={styles.heroPillGhostText}>
                          Tải lại ảnh
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* 2-Tab Segmented Switcher */}
            <View style={styles.tabBar} accessibilityRole="tablist">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "info" }}
                onPress={() => setActiveTab("info")}
                style={[
                  styles.tabItem,
                  activeTab === "info" && styles.tabItemActive,
                ]}
              >
                <Icon
                  name="person"
                  size={15}
                  color={
                    activeTab === "info" ? stitchTokens.white : colors.muted
                  }
                />
                <AppText
                  kind="small"
                  style={[
                    styles.tabLabel,
                    activeTab === "info" && styles.tabLabelActive,
                  ]}
                >
                  Thông tin
                </AppText>
                {dirty && <View style={styles.tabDot} />}
              </Pressable>

              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "email" }}
                onPress={() => setActiveTab("email")}
                style={[
                  styles.tabItem,
                  activeTab === "email" && styles.tabItemActive,
                ]}
              >
                <Icon
                  name="mail"
                  size={15}
                  color={
                    activeTab === "email" ? stitchTokens.white : colors.muted
                  }
                />
                <AppText
                  kind="small"
                  style={[
                    styles.tabLabel,
                    activeTab === "email" && styles.tabLabelActive,
                  ]}
                >
                  Email đăng nhập
                </AppText>
                {hasPendingEmailFlow && <View style={styles.tabDot} />}
              </Pressable>
            </View>

            {/* Tab 1: Personal Information */}
            {activeTab === "info" ? (
              <View style={styles.card}>
                <WineField
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
                <WineField
                  label="Số điện thoại liên hệ"
                  error={fieldErrors.phone}
                  hint="Không bắt buộc · Không ảnh hưởng đơn hàng đã tạo."
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  value={draft.contactPhone ?? ""}
                  maxLength={20}
                  editable={!locked}
                  onChangeText={(value) =>
                    setDraft({ ...draft, contactPhone: value || null })
                  }
                />

                <AppText kind="small" style={styles.subtleHint}>
                  Ảnh đại diện hỗ trợ JPEG, PNG, WebP (tối đa 2 MB) và áp dụng
                  khi bấm Lưu thay đổi.
                </AppText>

                <View style={styles.actionStack}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saveDisabled}
                    onPress={() => void save()}
                    style={({ pressed }) => [
                      styles.primaryCta,
                      saveDisabled && styles.primaryCtaDisabled,
                      pressed && !saveDisabled && styles.pressed,
                    ]}
                  >
                    <AppText
                      kind="bold"
                      style={[
                        styles.primaryCtaText,
                        saveDisabled && styles.primaryCtaTextDisabled,
                      ]}
                    >
                      {busy
                        ? "Đang lưu…"
                        : pendingSave
                          ? "Xác minh lần lưu trước"
                          : "Lưu thay đổi"}
                    </AppText>
                  </Pressable>

                  {(dirty || pendingDiscard) && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={resetDisabled}
                      onPress={() => void resetDraft()}
                      style={({ pressed }) => [
                        styles.ghostCta,
                        resetDisabled && styles.disabledChip,
                        pressed && !resetDisabled && styles.pressed,
                      ]}
                    >
                      <AppText kind="small" style={styles.ghostCtaText}>
                        {pendingDiscard
                          ? "Xác minh bỏ ảnh đang chờ"
                          : "Khôi phục bản đang xem"}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              /* Tab 2: Email & Security */
              <View style={styles.card}>
                <View style={styles.currentEmailBox}>
                  <View style={styles.currentEmailRow}>
                    <Icon
                      name="verified"
                      size={16}
                      color={stitchTokens.gold}
                    />
                    <AppText
                      kind="bold"
                      selectable
                      style={styles.currentEmailValue}
                    >
                      {profile.data.email}
                    </AppText>
                  </View>
                  <AppText kind="small" style={styles.currentEmailHint}>
                    Email mới chỉ thay địa chỉ hiện tại sau khi xác minh mã 6
                    số.
                  </AppText>
                </View>

                {dirty && (
                  <Notice>
                    Lưu hoặc bỏ thay đổi ở mục Thông tin trước khi đổi email.
                  </Notice>
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

                <WineField
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
                <WineField
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

                <Pressable
                  accessibilityRole="button"
                  disabled={emailReqDisabled}
                  onPress={() => void requestEmail()}
                  style={({ pressed }) => [
                    styles.primaryCta,
                    emailReqDisabled && styles.primaryCtaDisabled,
                    pressed && !emailReqDisabled && styles.pressed,
                  ]}
                >
                  <AppText
                    kind="bold"
                    style={[
                      styles.primaryCtaText,
                      emailReqDisabled && styles.primaryCtaTextDisabled,
                    ]}
                  >
                    {busy
                      ? "Đang gửi…"
                      : pendingEmail
                        ? "Xác minh yêu cầu gửi mã"
                        : "Gửi mã đến email mới"}
                  </AppText>
                </Pressable>

                {(profile.data.pendingEmailChange || pendingConfirm) && (
                  <View style={styles.verifyBox}>
                    <AppText kind="small" style={styles.verifyText}>
                      Mã xác nhận đã gửi đến{" "}
                      <AppText kind="bold" style={styles.verifyEmailHighlight}>
                        {profile.data.pendingEmailChange?.email}
                      </AppText>
                      . Hết hạn lúc{" "}
                      {profile.data.pendingEmailChange
                        ? new Date(
                            profile.data.pendingEmailChange.expiresAt,
                          ).toLocaleTimeString("vi-VN")
                        : "chưa cập nhật"}
                      . Có thể yêu cầu mã mới sau 60 giây.
                    </AppText>
                    <WineField
                      label="Mã xác nhận 6 số"
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
                    <Pressable
                      accessibilityRole="button"
                      disabled={emailConfirmDisabled}
                      onPress={() => void confirmEmail()}
                      style={({ pressed }) => [
                        styles.primaryCta,
                        emailConfirmDisabled && styles.primaryCtaDisabled,
                        pressed && !emailConfirmDisabled && styles.pressed,
                      ]}
                    >
                      <AppText
                        kind="bold"
                        style={[
                          styles.primaryCtaText,
                          emailConfirmDisabled && styles.primaryCtaTextDisabled,
                        ]}
                      >
                        {busy
                          ? "Đang xác minh…"
                          : pendingConfirm
                            ? "Xác minh kết quả trước"
                            : "Xác minh và đổi email"}
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: stitchTokens.white,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledChip: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.82,
  },
  content: {
    gap: space.md,
    paddingBottom: space.xxl,
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    padding: space.lg,
    borderWidth: 1,
    borderColor: stitchTokens.gold,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  avatarPressable: {
    position: "relative",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.goldVeryLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatar: {
    width: 67,
    height: 67,
    borderRadius: 33.5,
  },
  avatarFallback: {
    width: 67,
    height: 67,
    borderRadius: 33.5,
    backgroundColor: stitchTokens.goldVeryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: stitchTokens.wine,
    fontSize: 26,
  },
  cameraBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
    borderWidth: 2,
    borderColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  heroName: {
    color: colors.ink,
    fontSize: 19,
  },
  heroEmail: {
    color: colors.muted,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  heroPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
  },
  heroPillText: {
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  heroPillGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.flashRedBg,
  },
  heroPillGhostText: {
    color: colors.error,
    fontWeight: "600",
  },
  tabBar: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: stitchTokens.wine,
  },
  tabLabel: {
    color: colors.muted,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: stitchTokens.white,
  },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: stitchTokens.goldAccent,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    backgroundColor: stitchTokens.wine,
    padding: space.lg,
    gap: space.md,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  wineFieldWrap: {
    gap: 6,
  },
  wineFieldLabel: {
    color: stitchTokens.gold,
    fontSize: 14,
  },
  wineInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    backgroundColor: "rgba(38, 0, 0, 0.36)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: stitchTokens.goldLight,
    fontSize: 15,
    fontFamily: "BeRegular",
  },
  wineInputFocused: {
    borderColor: stitchTokens.gold,
    borderWidth: 1.5,
    backgroundColor: "rgba(38, 0, 0, 0.5)",
  },
  wineInputError: {
    borderColor: "#FF9B9B",
  },
  wineInputDisabled: {
    opacity: 0.65,
  },
  wineFieldHint: {
    color: "rgba(255, 223, 151, 0.78)",
  },
  wineFieldError: {
    color: "#FFD1D1",
  },
  subtleHint: {
    color: "rgba(255, 223, 151, 0.75)",
  },
  actionStack: {
    gap: space.sm,
    marginTop: space.xs,
  },
  primaryCta: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: stitchTokens.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primaryCtaDisabled: {
    backgroundColor: stitchTokens.goldAlpha20,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  primaryCtaText: {
    color: stitchTokens.wineDark,
  },
  primaryCtaTextDisabled: {
    color: "rgba(255, 223, 151, 0.65)",
  },
  ghostCta: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    backgroundColor: stitchTokens.whiteAlpha14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  ghostCtaText: {
    color: stitchTokens.gold,
    fontWeight: "700",
  },
  currentEmailBox: {
    padding: space.md,
    borderRadius: 12,
    backgroundColor: "rgba(38, 0, 0, 0.36)",
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    gap: 4,
  },
  currentEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentEmailValue: {
    color: stitchTokens.gold,
    flexShrink: 1,
  },
  currentEmailHint: {
    color: "rgba(255, 223, 151, 0.78)",
  },
  verifyBox: {
    padding: space.md,
    borderRadius: 12,
    backgroundColor: "rgba(38, 0, 0, 0.42)",
    borderWidth: 1,
    borderColor: stitchTokens.gold,
    gap: space.md,
    marginTop: space.xs,
  },
  verifyText: {
    color: stitchTokens.goldLight,
  },
  verifyEmailHighlight: {
    color: stitchTokens.gold,
  },
});
