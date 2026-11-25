import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { ApiError } from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  Notice,
  colors,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { photoBytes } from "../drafts/photo-bytes";
import { directory } from "../addresses/contracts";
import {
  directShipment,
  packagingPage,
  ShippingInputError,
  type PackagingInput,
} from "./shipping-contracts";
import {
  sendPackaging,
  sendShipment,
  shippingIntent,
} from "./shipping-intents";

type Order = {
  id: string;
  role: "Buyer" | "Seller";
  state: string;
  version: number;
  serverTime: string;
  shipmentRegistrationEnabled: boolean;
  preparation: { pickupDeadline: string } | null;
  shippingAddress: {
    recipientName: string;
    phone: string;
    localityCode: string;
    detail: string;
  } | null;
};

const FALLBACK_LOCALITY_LABELS: Record<string, string> = {
  "DEMO-A": "TP.HCM",
  "DEMO-B": "Bình Dương",
  "DEMO-C": "Vũng Tàu",
};

function generateDemoTrackingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = Crypto.getRandomBytes(8);
  let suffix = "";
  for (let i = 0; i < bytes.length; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `LL-${suffix}`;
}

export function OrderShipping({
  order,
  ownerId,
  foreground,
  readFailed,
  readAt,
  onChange,
}: {
  order: Order;
  ownerId: string;
  foreground: boolean;
  readFailed: boolean;
  readAt: number;
  onChange: () => Promise<void>;
}) {
  const { client } = useSession();
  const alive = useRef(true);
  const visible = useRef(foreground);
  const busyRef = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    visible.current = foreground;
  }, [foreground]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const intent = shippingIntent(client, order.id);
  const [tracking, setTracking] = useState(intent.trackingCode ?? "");
  const [expiredSnapshot, setExpiredSnapshot] = useState<number | null>(null);

  const shipment = useQuery({
    queryKey: ["order-shipment", ownerId, order.id],
    queryFn: async () => {
      try {
        return await client.request(
          `/me/orders/${order.id}/shipment`,
          directShipment,
        );
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    },
    enabled: foreground,
    retry: false,
    refetchInterval: foreground ? 5000 : false,
  });

  const evidence = useQuery({
    queryKey: ["order-packaging", ownerId, order.id],
    queryFn: () =>
      client.request(
        `/me/orders/${order.id}/packaging-evidence`,
        packagingPage,
      ),
    enabled: foreground && order.role === "Seller",
    retry: false,
  });

  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", directory),
    enabled: foreground && order.role === "Seller" && !!order.shippingAddress,
    retry: false,
  });

  const ready =
    evidence.data?.items.filter((item) => item.status === "Ready") ?? [];
  const hasPendingUpload =
    evidence.data?.items.some((item) => item.status === "Pending") ?? false;

  const deadlineRemaining = () =>
    order.preparation
      ? Date.parse(order.preparation.pickupDeadline) -
        Date.parse(order.serverTime) -
        Math.max(0, Date.now() - readAt)
      : 0;

  const serverRemaining = order.preparation
    ? Date.parse(order.preparation.pickupDeadline) -
      Date.parse(order.serverTime)
    : 0;

  const windowOpen =
    order.state === "Preparing" &&
    serverRemaining > 0 &&
    expiredSnapshot !== readAt;

  useEffect(() => {
    if (!foreground || !windowOpen) return;
    const timer = setTimeout(
      () => setExpiredSnapshot(readAt),
      Math.max(0, serverRemaining - Math.max(0, Date.now() - readAt)) + 1,
    );
    return () => clearTimeout(timer);
    // Server snapshot and query read time define the budget, not phone date.
  }, [
    foreground,
    order.serverTime,
    order.preparation?.pickupDeadline,
    readAt,
    serverRemaining,
    windowOpen,
  ]);

  const canEdit =
    windowOpen &&
    !readFailed &&
    shipment.isSuccess &&
    !shipment.isError &&
    !shipment.data &&
    !intent.acknowledged;
  const uncertain = intent.uploadPending || intent.shipmentPending;
  const canChoose =
    canEdit &&
    evidence.isSuccess &&
    !evidence.isError &&
    ready.length < 8 &&
    !uncertain;

  const refresh = async () => {
    await Promise.all([shipment.refetch(), evidence.refetch(), onChange()]);
  };

  async function savePhoto() {
    if (
      busyRef.current ||
      (!intent.uploadPending && (!canChoose || deadlineRemaining() <= 0))
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let input: PackagingInput | null = null;
      if (!intent.uploadPending) {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
          allowsMultipleSelection: false,
        });
        if (picked.canceled || !alive.current || !visible.current) return;
        const asset = picked.assets[0];
        if ((asset.fileSize ?? 0) > 10000000)
          throw new ShippingInputError("PhotoTooLarge");
        if (
          !asset.mimeType ||
          !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)
        )
          throw new ShippingInputError("UnsupportedPhoto");
        const bytes = await photoBytes(asset.uri);
        const digest = await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          bytes,
        );
        if (!alive.current || !visible.current) return;
        input = {
          expectedVersion: order.version,
          mimeType: asset.mimeType,
          bytes,
          sha256: Array.from(new Uint8Array(digest), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
        };
      }
      await sendPackaging(client, order.id, input, () => Crypto.randomUUID());
      if (!alive.current) return;
      setMessage("Ảnh đóng gói đã lưu. Bạn có thể đăng ký vận đơn ngay.");
      if (visible.current) await refresh();
    } catch (cause) {
      if (alive.current)
        setError(
          shippingIntent(client, order.id).uploadPending
            ? "Chưa xác minh ảnh đã lưu. Thử lại đúng ảnh và yêu cầu trước; chưa đăng ký vận đơn."
            : cause instanceof ShippingInputError
              ? cause.message
              : cause instanceof Error && cause.message === "PhotoTooLarge"
                ? new ShippingInputError("PhotoTooLarge").message
                : presentError(cause).message,
        );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function register() {
    if (
      busyRef.current ||
      (!intent.shipmentPending &&
        (!canEdit ||
          !order.shipmentRegistrationEnabled ||
          deadlineRemaining() <= 0))
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendShipment(
        client,
        order.id,
        intent.shipmentPending
          ? null
          : {
              expectedOrderVersion: order.version,
              carrier: "LatLaiSimulator",
              trackingCode: tracking.trim(),
              packagingEvidenceIds: ready.slice(0, 8).map((item) => item.id),
            },
        () => Crypto.randomUUID(),
      );
      if (!alive.current) return;
      setMessage("Đã đăng ký vận đơn. Đang chờ xác nhận bàn giao vận chuyển.");
      if (visible.current) await refresh();
    } catch (cause) {
      if (alive.current)
        setError(
          shippingIntent(client, order.id).shipmentPending
            ? "Chưa xác minh vận đơn đã lưu. Thử lại giữ nguyên mã, ảnh và phiên bản đơn trước."
            : cause instanceof ShippingInputError
              ? cause.message
              : presentError(cause).message,
        );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const localityLabel = order.shippingAddress
    ? areas.data?.localities.find(
        (item) => item.code === order.shippingAddress?.localityCode,
      )?.label ??
      FALLBACK_LOCALITY_LABELS[order.shippingAddress.localityCode] ??
      null
    : null;

  const canSubmitShipment =
    !busy &&
    order.shipmentRegistrationEnabled &&
    !evidence.isError &&
    Boolean(evidence.data) &&
    ready.length > 0 &&
    tracking.trim().length > 0;

  return (
    <View style={styles.root}>
      {/* Card Header */}
      <View style={styles.headerRow}>
        <View style={styles.iconTile}>
          <Icon name="bag" size={16} color={stitchTokens.wine} />
        </View>
        <View style={styles.headerTextCol}>
          <AppText style={styles.cardTitle} accessibilityRole="header">
            Đóng gói & Giao sách
          </AppText>
          <AppText style={styles.cardSubtitle}>
            {shipment.data
              ? `Vận đơn ${shipment.data.trackingCode}`
              : order.role === "Seller"
                ? "Chuẩn bị sách và đăng ký mã vận đơn"
                : "Theo dõi tiến độ đóng gói từ người bán"}
          </AppText>
        </View>
        {shipment.data ? (
          <View style={styles.badgeSuccess}>
            <Icon name="check" size={11} color={stitchTokens.likeNewGreen} />
            <AppText style={styles.badgeSuccessText}>Đã đăng ký</AppText>
          </View>
        ) : order.role === "Seller" ? (
          <View
            style={
              ready.length > 0 ? styles.badgeSuccess : styles.badgePending
            }
          >
            <AppText
              style={
                ready.length > 0
                  ? styles.badgeSuccessText
                  : styles.badgePendingText
              }
            >
              {ready.length > 0 ? `${ready.length} ảnh đã lưu` : "Chờ đóng gói"}
            </AppText>
          </View>
        ) : null}
      </View>

      {shipment.isPending && <Notice>Đang tải vận đơn…</Notice>}

      {shipment.isError && (
        <View style={styles.alertStack}>
          <Notice tone="error">
            Chưa tải được vận đơn. Không đăng ký vận đơn khác khi chưa biết kết
            quả trước.
          </Notice>
          <Button
            wine
            secondary
            title="Thử tải lại vận đơn"
            onPress={() => void shipment.refetch()}
            busy={shipment.isFetching}
          />
        </View>
      )}

      {shipment.data && (
        <View style={styles.shipmentSummaryBox}>
          <View style={styles.shipmentCodeRow}>
            <AppText style={styles.shipmentCodeLabel}>
              Mã vận đơn mô phỏng
            </AppText>
            <View style={styles.shipmentCodePill}>
              <AppText selectable style={styles.shipmentCodeValue}>
                {shipment.data.trackingCode}
              </AppText>
            </View>
          </View>
          <AppText style={styles.shipmentNoteText}>
            {shipment.data.pickupConfirmed
              ? "Đã xác nhận bàn giao vận chuyển. Theo dõi cập nhật tại đơn; chưa xác nhận giao tới người mua."
              : "Đã đăng ký vận đơn, đang chờ xác nhận bàn giao. Mã vận đơn và ảnh đóng gói chưa chứng minh đã gửi hoặc đã nhận sách."}
          </AppText>
        </View>
      )}

      {!shipment.data && intent.acknowledged && (
        <Notice>
          Đã có xác nhận đăng ký vận đơn. Tải lại vận đơn để xem; không tạo vận
          đơn thay thế.
        </Notice>
      )}

      {Boolean(message) && !shipment.data && (
        <Notice tone="success">{message}</Notice>
      )}
      {Boolean(error) && <Notice tone="error">{error}</Notice>}

      {order.role === "Seller" && (
        <>
          {/* Compact Inset Address Block */}
          {order.shippingAddress && (
            <View style={styles.addressBox}>
              <View style={styles.addressHeaderRow}>
                <Icon name="pin" size={13} color={stitchTokens.wine} />
                <AppText style={styles.addressHeaderLabel}>
                  Địa chỉ giao đã chốt trong đơn
                </AppText>
              </View>
              <AppText style={styles.addressPrimary}>
                {order.shippingAddress.recipientName} ·{" "}
                {order.shippingAddress.phone}
              </AppText>
              <AppText style={styles.addressDetail}>
                {order.shippingAddress.detail}
                {localityLabel ? ` · ${localityLabel}` : ""}
              </AppText>
              {areas.isError && !localityLabel && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void areas.refetch()}
                  style={styles.inlineRetryLink}
                >
                  <AppText style={styles.inlineRetryText}>
                    Thử tải lại tên khu vực
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {!windowOpen && !shipment.data && order.preparation && (
            <Notice tone="warning">
              Đơn đã qua bước chuẩn bị hoặc quá hạn bàn giao. Cập nhật đơn để
              xem trạng thái; không tạo vận đơn mới.
            </Notice>
          )}

          {/* Step 1: Packaging Evidence */}
          {!shipment.data && (canEdit || intent.uploadPending || evidence.isError) && (
            <View style={styles.stepBox}>
              <View style={styles.stepHeaderRow}>
                <View
                  style={[
                    styles.stepNumBadge,
                    ready.length > 0 && styles.stepNumBadgeDone,
                  ]}
                >
                  {ready.length > 0 ? (
                    <Icon name="check" size={11} color={stitchTokens.white} />
                  ) : (
                    <AppText style={styles.stepNumText}>1</AppText>
                  )}
                </View>
                <AppText style={styles.stepTitle}>Ảnh đóng gói sách</AppText>
                {evidence.data ? (
                  <AppText style={styles.stepMetaCount}>
                    {ready.length}/8 ảnh
                  </AppText>
                ) : null}
              </View>

              {evidence.isPending && (
                <AppText style={styles.stepHint}>
                  Đang tải danh sách ảnh đã lưu…
                </AppText>
              )}

              {evidence.isError ? (
                <View style={styles.alertStack}>
                  <Notice tone="error">
                    Chưa tải được ảnh đóng gói. Chưa đủ thông tin để đăng ký vận
                    đơn.
                  </Notice>
                  <Button
                    wine
                    secondary
                    title="Thử tải lại ảnh đóng gói"
                    onPress={() => void evidence.refetch()}
                    busy={evidence.isFetching}
                  />
                </View>
              ) : hasPendingUpload ? (
                <AppText style={styles.stepWarningText}>
                  Có ảnh chưa hoàn tất tải lên.
                </AppText>
              ) : null}

              {intent.uploadPending ? (
                <View style={styles.alertStack}>
                  <Notice tone="warning">
                    Ảnh trước chưa rõ kết quả. Dữ liệu giữ trong phiên ứng dụng
                    để thử lại sau khi quay lại đơn.
                  </Notice>
                  <Button
                    wine
                    title="Thử lại lưu ảnh đóng gói"
                    busy={busy}
                    onPress={() => void savePhoto()}
                  />
                </View>
              ) : (
                canChoose && (
                  <>
                    <AppText style={styles.stepHint}>
                      Chụp gói sách trước khi bàn giao (JPG, PNG hoặc WebP · tối
                      đa 10 MB).
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Chọn ảnh đóng gói"
                      disabled={busy}
                      onPress={() => void savePhoto()}
                      style={({ pressed }) => [
                        styles.photoPickerBtn,
                        (pressed || busy) && styles.pressed,
                      ]}
                    >
                      <Icon
                        name="camera"
                        size={16}
                        color={stitchTokens.wineDark}
                      />
                      <AppText style={styles.photoPickerText}>
                        {busy
                          ? "Đang tải ảnh lên…"
                          : ready.length > 0
                            ? "Thêm ảnh đóng gói"
                            : "Chọn ảnh đóng gói"}
                      </AppText>
                    </Pressable>
                  </>
                )
              )}
            </View>
          )}

          {/* Step 2: Register Tracking Code */}
          {intent.shipmentPending ? (
            <View style={styles.stepBox}>
              <Notice tone="warning">
                Vận đơn trước chưa rõ kết quả; chưa đổi mã hoặc thêm ảnh.
              </Notice>
              <Button
                wine
                title="Thử lại đăng ký vận đơn"
                busy={busy}
                onPress={() => void register()}
              />
            </View>
          ) : (
            canEdit &&
            !intent.uploadPending && (
              <View style={styles.stepBox}>
                <View style={styles.stepHeaderRow}>
                  <View style={styles.stepNumBadge}>
                    <AppText style={styles.stepNumText}>2</AppText>
                  </View>
                  <AppText style={styles.stepTitle}>
                    Mã vận đơn mô phỏng
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tạo mã vận đơn tự động"
                    disabled={busy}
                    onPress={() => {
                      setError("");
                      setTracking(generateDemoTrackingCode());
                    }}
                    style={({ pressed }) => [
                      styles.autoGenPill,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name="bolt" size={11} color={stitchTokens.wineDark} />
                    <AppText style={styles.autoGenText}>Tạo mã nhanh</AppText>
                  </Pressable>
                </View>

                <AppTextInput
                  accessibilityLabel="Mã vận đơn mô phỏng"
                  value={tracking}
                  onChangeText={setTracking}
                  editable={!busy}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={35}
                  placeholder="Ví dụ: LL-12345678"
                  placeholderTextColor={stitchTokens.subtleGray}
                  style={styles.trackingInput}
                />

                <AppText style={styles.stepHint}>
                  Bắt đầu bằng LL-, theo sau 8–32 chữ in hoa hoặc số.
                </AppText>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đăng ký vận đơn mô phỏng"
                  disabled={!canSubmitShipment}
                  onPress={() => void register()}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    !canSubmitShipment && styles.submitBtnDisabled,
                    pressed && canSubmitShipment && styles.pressed,
                  ]}
                >
                  <AppText
                    style={[
                      styles.submitBtnText,
                      !canSubmitShipment && styles.submitBtnTextDisabled,
                    ]}
                  >
                    {busy ? "Đang đăng ký…" : "Đăng ký vận đơn"}
                  </AppText>
                </Pressable>

                {ready.length === 0 && !evidence.isError && (
                  <View style={styles.requirementRow}>
                    <Icon name="info" size={12} color={colors.muted} />
                    <AppText style={styles.requirementText}>
                      Cần lưu ít nhất 1 ảnh ở Bước 1 trước khi đăng ký.
                    </AppText>
                  </View>
                )}
              </View>
            )
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  badgeSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.mintGreen,
  },
  badgeSuccessText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    includeFontPadding: false,
  },
  badgePending: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
  },
  badgePendingText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.orangeDeep,
    includeFontPadding: false,
  },
  alertStack: {
    gap: space.sm,
  },
  shipmentSummaryBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    gap: 8,
  },
  shipmentCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  shipmentCodeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  shipmentCodePill: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shipmentCodeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  shipmentNoteText: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.darkWood,
  },
  addressBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    gap: 3,
  },
  addressHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  addressHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wine,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  addressPrimary: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  addressDetail: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  inlineRetryLink: {
    alignSelf: "flex-start",
    paddingTop: 4,
  },
  inlineRetryText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    textDecorationLine: "underline",
  },
  stepBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    gap: 9,
  },
  stepHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumBadgeDone: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  stepNumText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  stepTitle: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  stepMetaCount: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  stepHint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  stepWarningText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.orangeDeep,
  },
  photoPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  photoPickerText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  autoGenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  autoGenText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  trackingInput: {
    height: 44,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    letterSpacing: 0.4,
  },
  submitBtn: {
    backgroundColor: stitchTokens.wineDark,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    backgroundColor: stitchTokens.canvasMuted,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.white,
    includeFontPadding: false,
  },
  submitBtnTextDisabled: {
    color: colors.muted,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  requirementText: {
    fontSize: 11.5,
    color: colors.muted,
    flex: 1,
  },
  pressed: {
    opacity: 0.82,
  },
});
