import { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Button,
  Icon,
  Notice,
  TextField,
  formatVnd,
  presentError,
  space,
  stitchTokens,
} from "../../core/ui";
import {
  createVNPayTopup,
  queryVNPayTopup,
  topupLabels,
} from "./wallet-model";
import type { TopupIntent } from "./contracts";

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];

interface TopupModalProps {
  visible: boolean;
  onClose: () => void;
  ownerId?: string;
  initialAmount?: number;
  onSuccess?: (amount: number) => void;
}

function TopupInnerContent({
  onClose,
  ownerId,
  initialAmount,
  onSuccess,
}: Omit<TopupModalProps, "visible">) {
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const effectiveOwnerId =
    ownerId ?? (state.status === "authenticated" ? state.user.id : undefined);

  const [rawAmount, setRawAmount] = useState<string>(
    initialAmount && initialAmount > 0
      ? String(Math.max(5_000, initialAmount))
      : "100000",
  );
  const [busy, setBusy] = useState(false);
  const [checkingResult, setCheckingResult] = useState(false);
  const [error, setError] = useState<string>("");
  const [lastIntent, setLastIntent] = useState<TopupIntent | null>(null);

  const parsedAmount = parseInt(rawAmount.replace(/\D/g, ""), 10) || 0;

  async function handleQueryStatus(topupId: string) {
    setCheckingResult(true);
    setError("");
    try {
      const updated = await queryVNPayTopup(client, topupId);
      setLastIntent(updated);

      if (effectiveOwnerId) {
        void queryClient.invalidateQueries({
          queryKey: ["wallet", effectiveOwnerId, "summary"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["wallet", effectiveOwnerId, "history"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["wallet", effectiveOwnerId, "topups"],
        });
      }

      if (updated.credited || updated.state === "Succeeded") {
        onSuccess?.(updated.amount);
      }
    } catch (err) {
      setError(presentError(err).message);
    } finally {
      setCheckingResult(false);
    }
  }

  async function handleStartTopup() {
    if (busy) return;
    if (parsedAmount < 5_000 || parsedAmount > 10_000_000) {
      setError("Số tiền nạp phải từ 5.000đ đến 10.000.000đ.");
      return;
    }

    setBusy(true);
    setError("");
    setLastIntent(null);

    const idempotencyKey = Crypto.randomUUID();

    try {
      const receipt = await createVNPayTopup(client, parsedAmount, idempotencyKey);

      // Open auth session in-app browser with VNPay Sandbox URL.
      // When VNPay redirects to the return URL (http://localhost:5174/wallet),
      // openAuthSessionAsync intercepts the redirect immediately and closes the browser
      // before it tries to load localhost on the mobile device, avoiding ERR_CONNECTION_REFUSED.
      try {
        await WebBrowser.openAuthSessionAsync(
          receipt.paymentUrl,
          "http://localhost:5174/wallet",
        );
      } catch {
        // Fallback to openBrowserAsync if auth session is unavailable
        await WebBrowser.openBrowserAsync(receipt.paymentUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          controlsColor: stitchTokens.wine,
          toolbarColor: stitchTokens.parchment,
        });
      }

      // Once the browser closes (auto-closed upon redirect, or user dismissed), verify transaction
      await handleQueryStatus(receipt.entityId);
    } catch (err) {
      setError(presentError(err).message);
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    if (busy) return;
    onClose();
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{
        flex: 1,
        backgroundColor: stitchTokens.modalScrim,
        justifyContent: "flex-end",
      }}
    >
      <View
        style={{
          backgroundColor: stitchTokens.white,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "90%",
          paddingTop: space.md,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: space.lg,
            paddingBottom: space.sm,
            borderBottomWidth: 1,
            borderColor: stitchTokens.parchment,
          }}
        >
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <AppText
                kind="bold"
                color={stitchTokens.wineDark}
                style={{ fontSize: 18 }}
              >
                Nạp tiền vào Ví
              </AppText>
              <View
                style={{
                  backgroundColor: stitchTokens.goldLight,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: stitchTokens.goldDark,
                }}
              >
                <AppText
                  kind="small"
                  color={stitchTokens.goldDark}
                  style={{ fontWeight: "700", fontSize: 11 }}
                >
                  VNPay Sandbox
                </AppText>
              </View>
            </View>
            <AppText kind="small" color={stitchTokens.subtleGray}>
              Mô phỏng thanh toán trực tuyến qua cổng VNPay
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng modal nạp tiền"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleDismiss}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: stitchTokens.roseWarmSurface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" size={20} color={stitchTokens.wine} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            gap: space.md,
          }}
        >
          {/* Success state display */}
          {lastIntent?.credited ? (
            <View
              style={{
                alignItems: "center",
                gap: space.md,
                paddingVertical: space.md,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: stitchTokens.likeNewGreenBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="check" size={32} color={stitchTokens.likeNewGreen} />
              </View>
              <AppText
                kind="heading"
                color={stitchTokens.wineDark}
                style={{ textAlign: "center" }}
              >
                Nạp tiền thành công!
              </AppText>
              <View
                style={{
                  backgroundColor: stitchTokens.warmIvory,
                  borderRadius: 12,
                  padding: space.md,
                  width: "100%",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                  alignItems: "center",
                }}
              >
                <AppText kind="small" color={stitchTokens.subtleGray}>
                  Số tiền đã nạp vào ví
                </AppText>
                <AppText
                  kind="price"
                  color={stitchTokens.wine}
                  style={{ fontSize: 24, fontWeight: "800" }}
                >
                  +{formatVnd(lastIntent.amount)}
                </AppText>
                <AppText kind="small" color={stitchTokens.likeNewGreen}>
                  Số dư ví của bạn đã được cập nhật ngay lập tức.
                </AppText>
              </View>
              <Button
                wine
                title="Hoàn tất"
                onPress={handleDismiss}
              />
            </View>
          ) : lastIntent && !lastIntent.credited ? (
            <View
              style={{
                backgroundColor: stitchTokens.goldLight,
                borderRadius: 12,
                padding: space.md,
                gap: space.sm,
                borderWidth: 1,
                borderColor: stitchTokens.goldDark,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="clock" size={18} color={stitchTokens.wineDark} />
                <AppText kind="bold" color={stitchTokens.wineDark}>
                  Trạng thái: {topupLabels[lastIntent.state]}
                </AppText>
              </View>
              <AppText kind="small" color={stitchTokens.wineDark}>
                {lastIntent.state === "Pending" || lastIntent.state === "Processing"
                  ? "Nếu bạn vừa hoàn thành thanh toán trên VNPay, bấm nút bên dưới để app đối soát và cộng tiền vào ví."
                  : "Giao dịch không thành công hoặc đã bị huỷ trên cổng thanh toán."}
              </AppText>
              <Button
                wine
                title={checkingResult ? "Đang đối soát..." : "Kiểm tra lại kết quả"}
                busy={checkingResult}
                onPress={() => void handleQueryStatus(lastIntent.id)}
              />
            </View>
          ) : null}

          {/* Input section (hidden when credited successfully) */}
          {!lastIntent?.credited && (
            <>
              <View style={{ gap: space.xs }}>
                <AppText
                  kind="label"
                  color={stitchTokens.wineDark}
                  style={{ fontWeight: "700" }}
                >
                  SỐ TIỀN CẦN NẠP (VNĐ)
                </AppText>
                <TextField
                  label="Nhập số tiền nạp"
                  keyboardType="numeric"
                  value={rawAmount}
                  onChangeText={(val) => {
                    const digits = val.replace(/\D/g, "");
                    setRawAmount(digits);
                  }}
                  hint="Tối thiểu 5.000đ · Tối đa 10.000.000đ"
                />
                {parsedAmount > 0 ? (
                  <AppText
                    kind="small"
                    color={stitchTokens.wine}
                    style={{ fontWeight: "600", marginTop: 2 }}
                  >
                    Số tiền hiển thị: {formatVnd(parsedAmount)}
                  </AppText>
                ) : null}
              </View>

              {/* Quick amount chips */}
              <View style={{ gap: 6 }}>
                <AppText kind="small" color={stitchTokens.subtleGray}>
                  Hoặc chọn nhanh mệnh giá:
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {QUICK_AMOUNTS.map((amt) => {
                    const isSelected = parsedAmount === amt;
                    return (
                      <Pressable
                        key={amt}
                        onPress={() => setRawAmount(String(amt))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.warmIvory,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.peachBorder,
                        }}
                      >
                        <AppText
                          kind="small"
                          color={
                            isSelected ? stitchTokens.white : stitchTokens.wineDark
                          }
                          style={{ fontWeight: isSelected ? "700" : "500" }}
                        >
                          {formatVnd(amt)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <Notice tone="info">
                Cổng VNPay Sandbox dùng thông tin thẻ ATM / quét QR thử nghiệm của VNPay để hoàn tất nạp tiền mô phỏng mà không tốn tiền thật.
              </Notice>

              {error ? <Notice tone="error">{error}</Notice> : null}

              {/* Submit button */}
              <Button
                wine
                title={
                  busy
                    ? "Đang mở cổng VNPay..."
                    : `Mở cổng VNPay Sandbox (${formatVnd(parsedAmount)})`
                }
                disabled={busy || parsedAmount < 5_000 || parsedAmount > 10_000_000}
                onPress={() => void handleStartTopup()}
              />
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

export function TopupModal({
  visible,
  onClose,
  ownerId,
  initialAmount,
  onSuccess,
}: TopupModalProps) {
  return (
    <AppModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {visible ? (
        <TopupInnerContent
          key={`${visible}-${initialAmount ?? "default"}`}
          onClose={onClose}
          ownerId={ownerId}
          initialAmount={initialAmount}
          onSuccess={onSuccess}
        />
      ) : null}
    </AppModal>
  );
}
