import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { ApiError } from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Notice,
  TextField,
  space,
  presentError,
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
  const alive = useRef(true),
    visible = useRef(foreground),
    busyRef = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    visible.current = foreground;
  }, [foreground]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
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
      setMessage("Ảnh đóng gói đã lưu. Kiểm tra vận đơn để tiếp tục.");
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
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold" accessibilityRole="header">
        Đóng gói và giao sách
      </AppText>
      {shipment.isPending && <Notice>Đang tải vận đơn…</Notice>}
      {shipment.isError && (
        <>
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
        </>
      )}
      {shipment.data && (
        <>
          <AppText selectable>
            Mã vận đơn mô phỏng: {shipment.data.trackingCode}
          </AppText>
          <Notice>
            {shipment.data.pickupConfirmed
              ? "Đã xác nhận bàn giao vận chuyển. Theo dõi cập nhật tại đơn; chưa xác nhận giao tới người mua."
              : "Đã đăng ký vận đơn, đang chờ xác nhận bàn giao. Mã vận đơn và ảnh đóng gói chưa chứng minh đã gửi hoặc đã nhận sách."}
          </Notice>
        </>
      )}
      {!shipment.data && intent.acknowledged && (
        <Notice>
          Đã có xác nhận đăng ký vận đơn. Tải lại vận đơn để xem; không tạo vận
          đơn thay thế.
        </Notice>
      )}
      {message && !shipment.data && <Notice tone="success">{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {order.role === "Seller" && (
        <>
          {order.shippingAddress && (
            <>
              <AppText kind="bold">Địa chỉ giao đã chốt trong đơn</AppText>
              <AppText>
                {order.shippingAddress.recipientName} ·{" "}
                {order.shippingAddress.phone}
              </AppText>
              <AppText>
                {order.shippingAddress.detail} ·{" "}
                {areas.data?.localities.find(
                  (item) => item.code === order.shippingAddress?.localityCode,
                )?.label ?? "Chưa tải tên khu vực"}
              </AppText>
              {areas.isError && (
                <Button
                  wine
                  secondary
                  title="Thử tải tên khu vực"
                  onPress={() => void areas.refetch()}
                />
              )}
            </>
          )}
          {evidence.isPending && <Notice>Đang tải ảnh đóng gói…</Notice>}
          {evidence.isError ? (
            <>
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
            </>
          ) : (
            evidence.data && (
              <AppText>
                Ảnh đóng gói đã lưu: {ready.length}
                {evidence.data.items.some((item) => item.status === "Pending")
                  ? " · Có ảnh chưa hoàn tất tải lên"
                  : ""}
              </AppText>
            )
          )}
          {!windowOpen && !shipment.data && order.preparation && (
            <Notice tone="warning">
              Đơn đã qua bước chuẩn bị hoặc quá hạn bàn giao. Cập nhật đơn để
              xem trạng thái; không tạo vận đơn mới.
            </Notice>
          )}
          {intent.uploadPending ? (
            <>
              <Notice tone="warning">
                Ảnh trước chưa rõ kết quả. Dữ liệu giữ trong phiên ứng dụng để
                thử lại sau khi quay lại đơn.
              </Notice>
              <Button
                wine
                title="Thử lại lưu ảnh đóng gói"
                busy={busy}
                onPress={() => void savePhoto()}
              />
            </>
          ) : (
            canChoose && (
              <>
                <AppText>
                  Chụp gói sách và chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB. Có
                  thể đính kèm tối đa 8 ảnh đã lưu.
                </AppText>
                <Button
                  wine
                  secondary
                  title="Chọn ảnh đóng gói"
                  busy={busy}
                  disabled={busy}
                  onPress={() => void savePhoto()}
                />
              </>
            )
          )}
          {intent.shipmentPending ? (
            <>
              <Notice tone="warning">
                Vận đơn trước chưa rõ kết quả; chưa đổi mã hoặc thêm ảnh.
              </Notice>
              <Button
                wine
                title="Thử lại đăng ký vận đơn"
                busy={busy}
                onPress={() => void register()}
              />
            </>
          ) : (
            canEdit &&
            !intent.uploadPending && (
              <>
                <TextField
                  label="Mã vận đơn mô phỏng"
                  hint="Bắt đầu LL-, tiếp theo 8–32 chữ in hoa hoặc số, ví dụ LL-12345678."
                  value={tracking}
                  onChangeText={setTracking}
                  editable={!busy}
                  autoCapitalize="characters"
                  maxLength={35}
                />
                <Button
                  wine
                  title="Đăng ký vận đơn mô phỏng"
                  busy={busy}
                  disabled={
                    busy ||
                    !order.shipmentRegistrationEnabled ||
                    evidence.isError ||
                    !evidence.data ||
                    ready.length === 0
                  }
                  onPress={() => void register()}
                />
                {ready.length === 0 && !evidence.isError && (
                  <AppText kind="small">
                    Lưu ít nhất một ảnh đóng gói trước khi đăng ký.
                  </AppText>
                )}
              </>
            )
          )}
        </>
      )}
    </View>
  );
}
