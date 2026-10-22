import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { z } from "zod";
import * as Crypto from "expo-crypto";
import { AppModal, AppText, AppTextInput, Button, ConfirmDialog, Icon, Notice, presentError, space, stitchTokens } from "../../core/ui";
import type { Exchange } from "./contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";

interface ExchangeActionsCardProps {
  exchange: Exchange;
  isInitiator: boolean;
}

export function ExchangeActionsCard({
  exchange,
  isInitiator,
}: ExchangeActionsCardProps) {
  const { client, state } = useSession();
  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const queryClient = useQueryClient();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [confirmDisputeOpen, setConfirmDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Counter offer state
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterSide, setCounterSide] = useState<"me" | "partner" | "none">(
    exchange.diffAmount === 0 || !exchange.diffPayerId
      ? "none"
      : (isInitiator && exchange.diffPayerId === exchange.initiatorId) ||
        (!isInitiator && exchange.diffPayerId === exchange.recipientId)
        ? "me"
        : "partner"
  );
  const [counterAmountStr, setCounterAmountStr] = useState(
    exchange.diffAmount ? String(exchange.diffAmount) : "0"
  );
  const [counterNote, setCounterNote] = useState("");

  const invalidate = () => {
    setActionError(null);
    void queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    void queryClient.invalidateQueries({ queryKey: ["exchange-messages", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  const cancelMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/cancel`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: exchange.revision }),
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/accept`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({ revision: exchange.revision }),
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/reject`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          reason: "Không phù hợp thời điểm này",
        }),
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const counterMutation = useMutation({
    mutationFn: () => {
      let diffPayer: "initiator" | "recipient" | "none" = "none";
      let diffAmount = 0;

      if (counterSide === "me") {
        diffPayer = isInitiator ? "initiator" : "recipient";
        diffAmount = Math.max(0, parseInt(counterAmountStr.replace(/\D/g, ""), 10) || 0);
      } else if (counterSide === "partner") {
        diffPayer = isInitiator ? "recipient" : "initiator";
        diffAmount = Math.max(0, parseInt(counterAmountStr.replace(/\D/g, ""), 10) || 0);
      }

      return client.request(`/exchanges/${exchange.id}/counter`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          diffAmount,
          diffPayer,
          note: counterNote.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      setCounterModalOpen(false);
      invalidate();
    },
    onError: (err) => setActionError(presentError(err).message),
  });

  const fundMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/funding`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const shipMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/ship`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          method: "direct",
        }),
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/receive`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: exchange.revision }),
      }),
    onSuccess: invalidate,
    onError: (err) => setActionError(presentError(err).message),
  });

  const disputeMutation = useMutation({
    mutationFn: (reason: string) =>
      client.request(`/exchanges/${exchange.id}/dispute`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          reason,
        }),
      }),
    onSuccess: () => {
      setDisputeReason("");
      invalidate();
    },
    onError: (err) => setActionError(presentError(err).message),
  });

  const isBusy =
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    counterMutation.isPending ||
    fundMutation.isPending ||
    shipMutation.isPending ||
    receiveMutation.isPending ||
    disputeMutation.isPending;

  const isFundedByMe = isInitiator
    ? Boolean(exchange.initiatorFundedAt)
    : Boolean(exchange.recipientFundedAt);

  const isShippedByMe = isInitiator
    ? Boolean(exchange.initiatorShippedAt)
    : Boolean(exchange.recipientShippedAt);

  const isReceivedByMe = isInitiator
    ? Boolean(exchange.initiatorReceivedAt)
    : Boolean(exchange.recipientReceivedAt);

  const isAwaitingMyResponse = exchange.lastProposedById
    ? exchange.lastProposedById !== currentUserId
    : !isInitiator;

  const diffPayerLabel =
    exchange.diffAmount === 0 || !exchange.diffPayerId
      ? "Đổi ngang giá (không bù tiền)"
      : ((isInitiator && exchange.diffPayerId === exchange.initiatorId) ||
         (!isInitiator && exchange.diffPayerId === exchange.recipientId))
        ? `Bạn bù thêm ${exchange.diffAmount.toLocaleString("vi-VN")} ₫`
        : `Đối tác bù thêm ${exchange.diffAmount.toLocaleString("vi-VN")} ₫`;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="verified" size={16} color={stitchTokens.wineDark} />
        <AppText style={styles.title}>Hành động tiếp theo</AppText>
      </View>

      {actionError ? (
        <View style={{ marginTop: space.sm, marginBottom: space.xs }}>
          <Notice tone="error">{actionError}</Notice>
        </View>
      ) : null}

      {/* State: PROPOSED */}
      {exchange.status === "Proposed" && (
        <View style={styles.actionsBox}>
          {isAwaitingMyResponse ? (
            <View style={styles.buttonGroup}>
              <View style={styles.proposalNoticeBox}>
                <Icon name="tag" size={14} color={stitchTokens.wineDark} />
                <AppText style={styles.proposalNoticeText}>
                  Mức bù hiện tại: <AppText style={{ fontWeight: "700" }}>{diffPayerLabel}</AppText>
                </AppText>
              </View>
              <AppText style={styles.hintText}>
                Đối tác đề nghị trao đổi sách với bạn. Bạn có thể đồng ý, yêu cầu đổi giá bù, hoặc từ chối hoán đổi này.
              </AppText>
              <View style={styles.rowTwoButtons}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Từ chối"
                    secondary
                    busy={isBusy}
                    onPress={() => setConfirmRejectOpen(true)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Đồng ý đổi"
                    wine
                    busy={isBusy}
                    onPress={() => setConfirmAcceptOpen(true)}
                  />
                </View>
              </View>
              <Button
                title="🏷️ Đề xuất lại mức bù tiền"
                secondary
                busy={isBusy}
                onPress={() => setCounterModalOpen(true)}
              />
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <View style={styles.proposalNoticeBox}>
                <Icon name="tag" size={14} color={stitchTokens.wineDark} />
                <AppText style={styles.proposalNoticeText}>
                  Mức bù bạn đề xuất: <AppText style={{ fontWeight: "700" }}>{diffPayerLabel}</AppText>
                </AppText>
              </View>
              <AppText style={styles.hintText}>
                Đề nghị đã được gửi đến đối tác. Bạn có thể điều chỉnh lại tiền bù hoặc rút lại đề nghị bất kỳ lúc nào nếu đổi ý.
              </AppText>
              <Button
                title="🏷️ Thay đổi mức bù tiền"
                secondary
                busy={isBusy}
                onPress={() => setCounterModalOpen(true)}
              />
              <Button
                title="Hủy đề nghị đổi sách"
                secondary
                wine
                busy={isBusy}
                onPress={() => setConfirmCancelOpen(true)}
              />
            </View>
          )}
        </View>
      )}

      {/* State: ACCEPTED / FUNDING */}
      {exchange.status === "AcceptedAwaitingFunding" && (
        <View style={styles.actionsBox}>
          {isFundedByMe ? (
            <View style={styles.buttonGroup}>
              <View style={styles.successNote}>
                <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
                <AppText style={styles.successNoteText}>
                  Bạn đã hoàn tất đặt cọc bảo chứng. Đang chờ đối tác cọc để chuyển sang giai đoạn gửi sách.
                </AppText>
              </View>
              <AppText style={styles.hintText}>
                Nếu đối tác không cọc hoặc bạn muốn dừng giao dịch trước khi bắt đầu gửi sách, bạn vẫn có thể hủy. Tiền cọc sẽ được hoàn lại 100% về ví.
              </AppText>
              <Button
                title="Hủy giao dịch trao đổi"
                secondary
                wine
                busy={isBusy}
                onPress={() => setConfirmCancelOpen(true)}
              />
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Cả hai bên đã đồng thuận. Hãy đặt cọc bảo chứng từ số dư ví để kích hoạt quy trình giao nhận. Nếu đổi ý, bạn có thể hủy giao dịch.
              </AppText>
              <Button
                title="Đặt cọc bảo chứng ngay"
                wine
                busy={isBusy}
                onPress={() => fundMutation.mutate()}
              />
              <Button
                title="Hủy giao dịch trao đổi"
                secondary
                busy={isBusy}
                onPress={() => setConfirmCancelOpen(true)}
              />
            </View>
          )}
        </View>
      )}

      {/* State: PREPARING (SHIP) */}
      {exchange.status === "Preparing" && (
        <View style={styles.actionsBox}>
          {exchange.shippingDeadline && (
            <View style={styles.deadlineContainer}>
              <Icon name="clock" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.deadlineText}>
                Hạn chót gửi sách: {new Date(exchange.shippingDeadline).toLocaleString("vi-VN")} (72 giờ)
              </AppText>
            </View>
          )}

          {isShippedByMe ? (
            <View style={styles.successNote}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.successNoteText}>
                Bạn đã báo gửi sách thành công. Vui lòng giữ mã vận đơn hoặc liên hệ đối tác qua khung chat dưới.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Hãy đóng gói cẩn thận và gửi sách đến địa chỉ của đối tác theo thỏa thuận. Quá 72h không gửi đơn sẽ bị hủy hoặc chuyển sang khiếu nại.
              </AppText>
              <Button
                title="Xác nhận tôi đã gửi sách"
                wine
                busy={isBusy}
                onPress={() => shipMutation.mutate()}
              />
            </View>
          )}
        </View>
      )}

      {/* State: IN_TRANSIT (RECEIVE OR DISPUTE) */}
      {exchange.status === "InTransit" && (
        <View style={styles.actionsBox}>
          {isReceivedByMe ? (
            <View style={styles.successNote}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.successNoteText}>
                Bạn đã nhận được sách! Đơn hàng sẽ hoàn tất sau thời gian đồng kiểm 48h.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Sách đang trên đường giao đến bạn. Khi nhận sách và kiểm tra đúng mô tả, hãy bấm nút dưới.
              </AppText>
              <Button
                title="Tôi đã nhận được sách an toàn"
                wine
                busy={isBusy}
                onPress={() => receiveMutation.mutate()}
              />
              <Button
                title="Báo cáo khiếu nại sách"
                secondary
                wine
                busy={isBusy}
                onPress={() => setConfirmDisputeOpen(true)}
              />
            </View>
          )}
        </View>
      )}

      {/* State: DELIVERED (INSPECTING OR DISPUTE) */}
      {exchange.status === "Delivered" && (
        <View style={styles.actionsBox}>
          <View style={styles.buttonGroup}>
            <AppText style={styles.hintText}>
              Sách đã được giao. Hai bên có 48 giờ để kiểm tra tình trạng sách trước khi hệ thống tự động tất toán hoàn cọc.
            </AppText>
            <Button
              title="Báo cáo khiếu nại sách"
              secondary
              wine
              busy={isBusy}
              onPress={() => setConfirmDisputeOpen(true)}
            />
          </View>
        </View>
      )}

      {/* State: RESOLUTION_PENDING */}
      {exchange.status === "ResolutionPending" && (
        <View style={styles.disputeBox}>
          <Icon name="info" size={20} color={stitchTokens.crimson} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText style={styles.disputeTitle}>Đang giải quyết khiếu nại</AppText>
            <AppText style={styles.disputeReason}>
              Lý do: {exchange.disputeReason || "Phát sinh khiếu nại trong giao nhận hoặc đồng kiểm."}
            </AppText>
            <AppText style={styles.disputeHint}>
              Quy trình tự động tất toán 48 giờ đã được tạm dừng và tiền cọc được đóng băng bảo vệ. Ban quản trị Lật Lại đang tiếp nhận hỗ trợ hai bên.
            </AppText>
          </View>
        </View>
      )}

      {/* State: COMPLETED */}
      {exchange.status === "Completed" && (
        <View style={styles.completedBox}>
          <Icon name="check" size={20} color={stitchTokens.likeNewGreen} />
          <View style={{ flex: 1 }}>
            <AppText style={styles.completedTitle}>Trao đổi hoàn tất thành công!</AppText>
            <AppText style={styles.completedSub}>
              Cọc bảo chứng đã được hoàn trả về ví hai bên an toàn.
            </AppText>
          </View>
        </View>
      )}

      {/* State: CANCELLED */}
      {exchange.status === "Cancelled" && (
        <View style={styles.cancelledBox}>
          <Icon name="close" size={16} color={stitchTokens.flashRed} />
          <AppText style={styles.cancelledText}>
            Đơn trao đổi đã đóng ({exchange.cancelReason || "Đã hủy"}).
          </AppText>
        </View>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        visible={confirmCancelOpen}
        title="Hủy giao dịch trao đổi?"
        message={
          exchange.status === "AcceptedAwaitingFunding"
            ? "Bạn có chắc chắn muốn hủy giao dịch trao đổi này? Nếu bạn hoặc đối tác đã đặt cọc, 100% số tiền cọc sẽ được hoàn lại về ví ngay lập tức và sách sẽ được mở lại trên kệ."
            : "Hủy đề nghị trao đổi sẽ trả lại trạng thái sách về kệ của bạn."
        }
        confirmLabel="Hủy giao dịch"
        destructive
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={() => {
          setConfirmCancelOpen(false);
          cancelMutation.mutate();
        }}
      />

      <ConfirmDialog
        visible={confirmAcceptOpen}
        title="Đồng ý trao đổi sách?"
        message="Khi đồng ý, bạn và đối tác sẽ tiến hành đặt cọc bảo chứng và giao nhận sách theo địa chỉ đã chọn."
        confirmLabel="Đồng ý ngay"
        onCancel={() => setConfirmAcceptOpen(false)}
        onConfirm={() => {
          setConfirmAcceptOpen(false);
          acceptMutation.mutate();
        }}
      />

      <ConfirmDialog
        visible={confirmRejectOpen}
        title="Từ chối đề nghị?"
        message="Từ chối đề nghị hoán đổi này từ đối tác."
        confirmLabel="Từ chối"
        onCancel={() => setConfirmRejectOpen(false)}
        onConfirm={() => {
          setConfirmRejectOpen(false);
          rejectMutation.mutate();
        }}
      />

      <ConfirmDialog
        visible={confirmDisputeOpen}
        title="Báo cáo khiếu nại giao dịch?"
        message="Quy trình tất toán 48h sẽ tạm dừng ngay lập tức và tiền cọc được giữ an toàn. Bạn có chắc muốn gửi khiếu nại cho đơn hàng này?"
        confirmLabel="Gửi khiếu nại ngay"
        destructive
        onCancel={() => setConfirmDisputeOpen(false)}
        onConfirm={() => {
          setConfirmDisputeOpen(false);
          disputeMutation.mutate(disputeReason.trim() || "Sách không đúng như mô tả khi nhận");
        }}
      />

      {/* Modal Đề xuất lại mức bù tiền */}
      <AppModal
        visible={counterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCounterModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="tag" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle}>Đề xuất lại mức bù tiền</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setCounterModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <AppText style={styles.modalSub}>
              Chọn bên chịu tiền bù chênh lệch giá trị sách và mức tiền mong muốn:
            </AppText>

            {/* Chọn ai bù */}
            <View style={styles.sideOptionGroup}>
              <Pressable
                style={[
                  styles.sideOptionItem,
                  counterSide === "none" && styles.sideOptionItemActive,
                ]}
                onPress={() => {
                  setCounterSide("none");
                  setCounterAmountStr("0");
                }}
              >
                <View
                  style={[
                    styles.radioCircle,
                    counterSide === "none" && styles.radioCircleActive,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <AppText style={styles.sideOptionTitle}>Đổi ngang giá</AppText>
                  <AppText style={styles.sideOptionDesc}>Hai bên bằng giá, không ai bù tiền</AppText>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.sideOptionItem,
                  counterSide === "me" && styles.sideOptionItemActive,
                ]}
                onPress={() => setCounterSide("me")}
              >
                <View
                  style={[
                    styles.radioCircle,
                    counterSide === "me" && styles.radioCircleActive,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <AppText style={styles.sideOptionTitle}>Tôi sẽ bù thêm tiền cho đối tác</AppText>
                  <AppText style={styles.sideOptionDesc}>Sách của đối tác có giá trị cao hơn</AppText>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.sideOptionItem,
                  counterSide === "partner" && styles.sideOptionItemActive,
                ]}
                onPress={() => setCounterSide("partner")}
              >
                <View
                  style={[
                    styles.radioCircle,
                    counterSide === "partner" && styles.radioCircleActive,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <AppText style={styles.sideOptionTitle}>Đối tác sẽ bù thêm tiền cho tôi</AppText>
                  <AppText style={styles.sideOptionDesc}>Sách của tôi có giá trị cao hơn</AppText>
                </View>
              </Pressable>
            </View>

            {/* Nhập số tiền nếu không phải 'none' */}
            {counterSide !== "none" && (
              <View style={styles.inputSection}>
                <AppText style={styles.inputLabel}>Số tiền bù chênh lệch (VNĐ):</AppText>
                <AppTextInput
                  accessibilityLabel="Số tiền bù chênh lệch"
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={counterAmountStr}
                  onChangeText={(val) => setCounterAmountStr(val.replace(/\D/g, ""))}
                  placeholder="Ví dụ: 10000"
                  placeholderTextColor={stitchTokens.subtleGray}
                />

                <View style={styles.presetRow}>
                  {[10000, 20000, 30000, 50000].map((preset) => (
                    <Pressable
                      key={preset}
                      style={styles.presetChip}
                      onPress={() => setCounterAmountStr(String(preset))}
                    >
                      <AppText style={styles.presetChipText}>
                        +{preset.toLocaleString("vi-VN")} ₫
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Lời nhắn kèm theo */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>Lời nhắn cho đối tác (tùy chọn):</AppText>
              <AppTextInput
                accessibilityLabel="Lời nhắn cho đối tác"
                style={styles.noteInput}
                value={counterNote}
                onChangeText={setCounterNote}
                placeholder="Ví dụ: Sách mình là bản bìa cứng mới 99% nhé..."
                placeholderTextColor={stitchTokens.subtleGray}
                maxLength={300}
                multiline
              />
            </View>

            {/* Action buttons */}
            <View style={styles.modalActionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Hủy"
                  secondary
                  onPress={() => setCounterModalOpen(false)}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Button
                  title="Gửi đề xuất bù mới"
                  wine
                  busy={counterMutation.isPending}
                  onPress={() => counterMutation.mutate()}
                />
              </View>
            </View>
          </View>
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  actionsBox: {
    gap: 8,
  },
  proposalNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    backgroundColor: stitchTokens.amberBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  proposalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  buttonGroup: {
    gap: 10,
  },
  rowTwoButtons: {
    flexDirection: "row",
    gap: 10,
  },
  hintText: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 18,
  },
  deadlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    flex: 1,
  },
  disputeBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.flashRed,
  },
  disputeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.flashRed,
  },
  disputeReason: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  disputeHint: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  successNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.likeNewGreen,
  },
  successNoteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
    lineHeight: 16,
  },
  completedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.likeNewGreen,
  },
  completedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  completedSub: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    marginTop: 2,
  },
  cancelledBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.flashRedBg,
  },
  cancelledText: {
    fontSize: 12,
    color: stitchTokens.flashRed,
    fontWeight: "600",
  },
  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "center",
    alignItems: "center",
    padding: space.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    padding: space.lg,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  modalSub: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  sideOptionGroup: {
    gap: 8,
  },
  sideOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.creamBg,
  },
  sideOptionItemActive: {
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.roseParchment,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: stitchTokens.borderWarm,
  },
  radioCircleActive: {
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.wineDark,
  },
  sideOptionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  sideOptionDesc: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    marginTop: 2,
  },
  inputSection: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  amountInput: {
    height: 42,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
  },
  noteInput: {
    minHeight: 60,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: stitchTokens.darkWood,
    backgroundColor: stitchTokens.whiteSurface,
    textAlignVertical: "top",
  },
  presetRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  presetChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
});

