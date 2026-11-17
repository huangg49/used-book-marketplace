import { useState, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  withdrawalReasons,
  withdrawalReceiptSchema,
  withdrawalSchema,
  type CreateWithdrawal,
  type Withdrawal,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Button,
  TextField,
  formatVnd,
  space,
  stitchTokens,
  colors,
} from "../../core/ui";

export type WithdrawalModalProps = {
  visible: boolean;
  available: number;
  enabled: boolean;
  onClose: () => void;
  onSuccess: (withdrawal: Withdrawal) => void;
};

const QUICK_AMOUNTS = [50_000, 100_000, 500_000];

export function WithdrawalModal({
  visible,
  available,
  enabled,
  onClose,
  onSuccess,
}: WithdrawalModalProps) {
  if (!visible) return null;

  return (
    <WithdrawalModalContent
      available={available}
      enabled={enabled}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function WithdrawalModalContent({
  available,
  enabled,
  onClose,
  onSuccess,
}: Omit<WithdrawalModalProps, "visible">) {
  const { client } = useSession();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"entry" | "review">("entry");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState<CreateWithdrawal["reason"]>("SaleProceeds");
  const [reasonDetail, setReasonDetail] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const [reviewAvailable, setReviewAvailable] = useState(available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const pending = useRef<{ key: string; body: CreateWithdrawal } | null>(null);

  function clearPending() {
    pending.current = null;
    setUncertain(false);
    setError(null);
  }

  const parsedAmount = parseInt(amountText.replace(/\D/g, ""), 10) || 0;

  function validateEntry(): string | null {
    if (!parsedAmount || parsedAmount < 10_000) {
      return "Số tiền rút tối thiểu là 10.000đ.";
    }
    if (parsedAmount > available) {
      return `Số tiền rút vượt quá số dư khả dụng (${formatVnd(available)}).`;
    }
    if (!bankName.trim() || bankName.trim().length < 2) {
      return "Vui lòng nhập tên ngân hàng nhận tiền.";
    }
    const cleanAccount = accountNumber.trim();
    if (!/^[0-9]{6,30}$/.test(cleanAccount)) {
      return "Số tài khoản chỉ gồm chữ số (6–30 ký tự).";
    }
    if (!accountHolder.trim() || accountHolder.trim().length < 2) {
      return "Vui lòng nhập tên chủ tài khoản.";
    }
    if (reason === "Other" && !reasonDetail.trim()) {
      return "Vui lòng nhập chi tiết lý do rút tiền.";
    }
    return null;
  }

  function handleGoToReview() {
    const err = validateEntry();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setReviewAvailable(available);
    setStep("review");
  }

  async function submitRequest() {
    if (!pending.current) {
      const cryptoKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      pending.current = {
        key: cryptoKey,
        body: {
          amount: parsedAmount,
          reason,
          reasonDetail: reason === "Other" ? reasonDetail.trim() : "",
          recipient: {
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolder.trim().toUpperCase(),
          },
        },
      };
    }

    const current = pending.current;
    if (!current) return;

    setBusy(true);
    setError(null);

    try {
      const res = await client.request(
        "/me/withdrawals",
        withdrawalReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": current.key },
          body: JSON.stringify(current.body),
        },
      );

      pending.current = null;
      setUncertain(false);
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });

      // Fetch the created withdrawal detail
      const fullWithdrawal = await client
        .request(`/me/withdrawals/${res.entityId}`, withdrawalSchema)
        .catch(() => null);

      if (fullWithdrawal) {
        onSuccess(fullWithdrawal);
      } else {
        // Fallback placeholder withdrawal if detail read is slow
        onSuccess({
          id: res.entityId,
          ownerId: "",
          ownerName: "",
          amount: current.body.amount,
          fee: 0,
          reason: current.body.reason,
          reasonDetail: current.body.reasonDetail,
          recipient: current.body.recipient,
          state: res.state,
          version: res.version,
          approverId: null,
          payoutRef: null,
          proofId: null,
          createdAt: res.serverTime,
          updatedAt: res.serverTime,
          history: [{ state: res.state, at: res.serverTime, note: "Đã gửi yêu cầu rút tiền" }],
          processingMode: "Manual",
          demoOnly: true,
        });
      }
    } catch (err) {
      if (err instanceof ApiError && [400, 404, 409, 422].includes(err.status)) {
        pending.current = null;
        setUncertain(false);
        setError(err.message || "Yêu cầu rút tiền không hợp lệ.");
      } else {
        setUncertain(true);
        setError(
          "Chưa xác định được kết quả gửi. Bấm “Kiểm tra lại yêu cầu” để kiểm tra lại bằng cùng mã; không tạo thêm yêu cầu mới và thông tin của bạn được giữ nguyên.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      visible={true}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.dismissArea}
          onPress={() => {
            if (!busy) onClose();
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ gap: 2, flex: 1 }}>
              <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 18 }}>
                {step === "entry" ? "Rút tiền về tài khoản ngân hàng" : "Kiểm tra yêu cầu rút tiền"}
              </AppText>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                {step === "entry"
                  ? "Nhập số tiền và thông tin tài khoản nhận tiền"
                  : "Xác nhận kỹ thông tin trước khi gửi"}
              </AppText>
            </View>
            <Pressable
              disabled={busy}
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <AppText kind="bold" color={stitchTokens.subtleGray}>✕</AppText>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Available Balance Banner */}
            <View style={styles.balanceBanner}>
              <View style={{ gap: 2 }}>
                <AppText kind="small" color={stitchTokens.subtleGray}>
                  Số dư khả dụng hiện tại
                </AppText>
                <AppText kind="price" color={stitchTokens.wine} style={{ fontSize: 22 }}>
                  {formatVnd(step === "review" ? reviewAvailable : available)}
                </AppText>
              </View>
              {!enabled ? (
                <View style={styles.disabledTag}>
                  <AppText kind="small" color={stitchTokens.wine}>
                    Tạm khóa
                  </AppText>
                </View>
              ) : null}
            </View>

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  uncertain ? styles.uncertainBox : null,
                ]}
              >
                <AppText
                  kind="small"
                  color={uncertain ? stitchTokens.wineDark : colors.error}
                >
                  {error}
                </AppText>
              </View>
            ) : null}

            {step === "entry" ? (
              <View style={{ gap: space.md }}>
                {/* Amount Section */}
                <View style={{ gap: space.xs }}>
                  <AppText kind="bold" color={stitchTokens.wineDark}>
                    Số tiền muốn rút (VNĐ)
                  </AppText>
                  <TextField
                    placeholder="Tối thiểu 10.000đ"
                    keyboardType="number-pad"
                    value={amountText}
                    onChangeText={(val) => {
                      clearPending();
                      setAmountText(val);
                    }}
                  />
                  {/* Quick Chips */}
                  <View style={styles.chipsRow}>
                    {QUICK_AMOUNTS.map((qa) => (
                      <Pressable
                        key={qa}
                        style={[
                          styles.chip,
                          parsedAmount === qa && styles.chipActive,
                        ]}
                        onPress={() => {
                          clearPending();
                          setAmountText(qa.toString());
                        }}
                      >
                        <AppText
                          kind="small"
                          color={
                            parsedAmount === qa
                              ? stitchTokens.white
                              : stitchTokens.wineDark
                          }
                        >
                          {formatVnd(qa)}
                        </AppText>
                      </Pressable>
                    ))}
                    <Pressable
                      style={[
                        styles.chip,
                        parsedAmount === available && styles.chipActive,
                      ]}
                      onPress={() => {
                        clearPending();
                        setAmountText(available.toString());
                      }}
                    >
                      <AppText
                        kind="small"
                        color={
                          parsedAmount === available
                            ? stitchTokens.white
                            : stitchTokens.wineDark
                        }
                      >
                        Tối đa
                      </AppText>
                    </Pressable>
                  </View>
                </View>

                {/* Reason Selection */}
                <View style={{ gap: space.xs }}>
                  <AppText kind="bold" color={stitchTokens.wineDark}>
                    Lý do rút tiền
                  </AppText>
                  <View style={styles.reasonsList}>
                    {(
                      Object.entries(withdrawalReasons) as [
                        CreateWithdrawal["reason"],
                        string,
                      ][]
                    ).map(([rKey, rLabel]) => {
                      const isSelected = reason === rKey;
                      return (
                        <Pressable
                          key={rKey}
                          style={[
                            styles.reasonItem,
                            isSelected && styles.reasonItemActive,
                          ]}
                          onPress={() => {
                            clearPending();
                            setReason(rKey);
                          }}
                        >
                          <View
                            style={[
                              styles.radioCircle,
                              isSelected && styles.radioCircleActive,
                            ]}
                          >
                            {isSelected ? <View style={styles.radioDot} /> : null}
                          </View>
                          <AppText
                            color={isSelected ? stitchTokens.wineDark : stitchTokens.subtleGray}
                            kind={isSelected ? "bold" : undefined}
                            style={{ flex: 1 }}
                          >
                            {rLabel}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {reason === "Other" ? (
                    <TextField
                      placeholder="Chi tiết lý do rút tiền (tối đa 300 ký tự)"
                      value={reasonDetail}
                      multiline
                      maxLength={300}
                      onChangeText={(val) => {
                        clearPending();
                        setReasonDetail(val);
                      }}
                    />
                  ) : null}
                </View>

                {/* Bank Info */}
                <View style={styles.bankFormCard}>
                  <AppText kind="bold" color={stitchTokens.wineDark}>
                    Tài khoản ngân hàng nhận tiền
                  </AppText>
                  <TextField
                    placeholder="Tên ngân hàng (VD: Vietcombank, MB Bank, Techcombank)"
                    value={bankName}
                    onChangeText={(val) => {
                      clearPending();
                      setBankName(val);
                    }}
                  />
                  <TextField
                    placeholder="Số tài khoản ngân hàng"
                    keyboardType="number-pad"
                    value={accountNumber}
                    onChangeText={(val) => {
                      clearPending();
                      setAccountNumber(val);
                    }}
                  />
                  <TextField
                    placeholder="Tên chủ tài khoản (in hoa)"
                    autoCapitalize="characters"
                    value={accountHolder}
                    onChangeText={(val) => {
                      clearPending();
                      setAccountHolder(val);
                    }}
                  />
                  <AppText kind="small" color={stitchTokens.subtleGray}>
                    Vui lòng đối chiếu chính xác tên chủ tài khoản để lệnh chuyển khoản không bị hủy.
                  </AppText>
                </View>

                <View style={{ paddingTop: space.xs, gap: space.sm }}>
                  <Button
                    wine
                    title="Tiếp tục kiểm tra"
                    disabled={!enabled || busy}
                    onPress={handleGoToReview}
                  />
                </View>
              </View>
            ) : (
              /* Review Step */
              <View style={{ gap: space.md }}>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Số tiền rút</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {formatVnd(parsedAmount)}
                    </AppText>
                  </View>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Phí rút tiền</AppText>
                    <AppText kind="bold" color={stitchTokens.likeNewGreen}>
                      0đ (Miễn phí)
                    </AppText>
                  </View>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Số dư sau khi rút</AppText>
                    <AppText kind="bold" color={stitchTokens.wine}>
                      {formatVnd(Math.max(0, reviewAvailable - parsedAmount))}
                    </AppText>
                  </View>

                  <View style={styles.reviewDivider} />

                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Ngân hàng</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {bankName}
                    </AppText>
                  </View>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Số tài khoản</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark} selectable>
                      {accountNumber}
                    </AppText>
                  </View>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Chủ tài khoản</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {accountHolder.toUpperCase()}
                    </AppText>
                  </View>
                  <View style={styles.reviewRow}>
                    <AppText color={stitchTokens.subtleGray}>Lý do rút</AppText>
                    <AppText color={stitchTokens.wineDark} style={{ flexShrink: 1, textAlign: "right" }}>
                      {withdrawalReasons[reason]}
                      {reason === "Other" && reasonDetail ? ` (${reasonDetail})` : ""}
                    </AppText>
                  </View>
                </View>

                {/* Hold Notice */}
                <View style={styles.noticeBox}>
                  <AppText kind="small" color={stitchTokens.wineDark}>
                    Số tiền yêu cầu rút sẽ chuyển sang trạng thái đang giữ chờ rút tiền ngay khi gửi. Nếu quản trị viên từ chối, tiền sẽ được hoàn lại vào số dư khả dụng.
                  </AppText>
                </View>

                <View style={styles.actionsRow}>
                  {!uncertain ? (
                    <Button
                      secondary
                      title="Chỉnh sửa"
                      disabled={busy}
                      onPress={() => setStep("entry")}
                    />
                  ) : null}
                  <Button
                    wine
                    title={
                      busy
                        ? "Đang gửi…"
                        : uncertain
                          ? "Kiểm tra lại yêu cầu"
                          : "Xác nhận gửi yêu cầu"
                    }
                    busy={busy}
                    onPress={submitRequest}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrimDark,
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: stitchTokens.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.peachBorder,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  closeBtn: {
    padding: space.xs,
  },
  content: {
    padding: space.lg,
    gap: space.md,
  },
  balanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  disabledTag: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  errorBox: {
    backgroundColor: stitchTokens.goldLight,
    borderRadius: 10,
    padding: space.sm,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  uncertainBox: {
    backgroundColor: stitchTokens.goldLight,
    borderColor: stitchTokens.goldBorder,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    paddingTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  chipActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  reasonsList: {
    gap: 6,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.white,
  },
  reasonItemActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.parchment,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: stitchTokens.subtleGray,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: stitchTokens.wine,
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: stitchTokens.wine,
  },
  bankFormCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  reviewCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: stitchTokens.peachBorder,
    marginVertical: 4,
  },
  noticeBox: {
    backgroundColor: stitchTokens.goldLight,
    padding: space.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  actionsRow: {
    flexDirection: "row",
    gap: space.sm,
    paddingTop: space.xs,
  },
});
