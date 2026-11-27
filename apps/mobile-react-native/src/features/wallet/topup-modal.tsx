import { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
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
  resolveVnpayReturnUrl,
  topupLabels,
} from "./wallet-model";
import type { TopupIntent } from "./contracts";

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];
// VNPay's vnp_Amount (VND × 100) has at most 12 digits.
const VNPAY_TOPUP_MAX = 9_999_999_999;

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
    if (parsedAmount < 5_000 || parsedAmount > VNPAY_TOPUP_MAX) {
      setError("Số tiền nạp phải từ 5.000đ đến 9.999.999.999đ.");
      return;
    }

    setBusy(true);
    setError("");
    setLastIntent(null);

    const idempotencyKey = Crypto.randomUUID();

    try {
      const receipt = await createVNPayTopup(client, parsedAmount, idempotencyKey);

      // Open auth session in-app browser with VNPay Sandbox URL.
      // When VNPay redirects to the configured web return URL,
      // openAuthSessionAsync intercepts the redirect immediately and closes the browser.
      const returnUrl = resolveVnpayReturnUrl({
        vnpayReturnUrl: process.env.EXPO_PUBLIC_VNPAY_RETURN_URL,
        webOrigin: process.env.EXPO_PUBLIC_WEB_ORIGIN,
      });
      try {
        await WebBrowser.openAuthSessionAsync(
          receipt.paymentUrl,
          returnUrl,
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng cửa sổ nạp tiền"
        style={StyleSheet.absoluteFill}
        onPress={handleDismiss}
      />
      <View
        style={{
          backgroundColor: stitchTokens.white,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "90%",
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        {/* Drag Handle */}
        <View style={{ alignItems: "center", paddingBottom: 8 }}>
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: stitchTokens.cardBorder,
            }}
          />
        </View>

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
                  Cổng VNPay
                </AppText>
              </View>
            </View>
            <AppText kind="small" color={stitchTokens.subtleGray}>
              Nạp tiền trực tuyến qua cổng thanh toán VNPay
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng modal nạp tiền"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleDismiss}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: stitchTokens.roseWarmSurface,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
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
                  ? "Nếu bạn vừa hoàn thành thanh toán trên VNPay, bấm nút bên dưới để ứng dụng đối soát và cộng tiền vào ví."
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
                <TextField
                  label="Số tiền cần nạp (VNĐ)"
                  keyboardType="numeric"
                  value={rawAmount}
                  onChangeText={(val) => {
                    const digits = val.replace(/\D/g, "");
                    setRawAmount(digits);
                  }}
                  hint="Tối thiểu 5.000đ · Tối đa 9.999.999.999đ"
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
                Cổng VNPay mô phỏng dùng thông tin thẻ ATM / quét QR thử nghiệm để hoàn tất nạp tiền mà không trừ tiền thật.
              </Notice>

              {error ? <Notice tone="error">{error}</Notice> : null}

              {/* Submit button */}
              <Button
                wine
                title={
                  busy
                    ? "Đang mở cổng VNPay..."
                    : `Tiếp tục qua VNPay (${formatVnd(parsedAmount)})`
                }
                disabled={busy || parsedAmount < 5_000 || parsedAmount > VNPAY_TOPUP_MAX}
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
