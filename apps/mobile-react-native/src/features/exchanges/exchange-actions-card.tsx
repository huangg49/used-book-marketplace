import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { z } from "zod";
import { AppText, Button, ConfirmDialog, Icon, space, stitchTokens } from "../../core/ui";
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
  const { client } = useSession();
  const queryClient = useQueryClient();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [confirmDisputeOpen, setConfirmDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    void queryClient.invalidateQueries({ queryKey: ["exchange-messages", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  const cancelMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/cancel`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({ expectedVersion: exchange.revision }),
      }),
    onSuccess: invalidate,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/accept`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({ revision: exchange.revision }),
      }),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/reject`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          reason: "Không phù hợp thời điểm này",
        }),
      }),
    onSuccess: invalidate,
  });

  const fundMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/funding`, z.unknown(), {
        method: "POST",
      }),
    onSuccess: invalidate,
  });

  const shipMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/ship`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          method: "direct",
        }),
      }),
    onSuccess: invalidate,
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/receive`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({ expectedVersion: exchange.revision }),
      }),
    onSuccess: invalidate,
  });

  const disputeMutation = useMutation({
    mutationFn: (reason: string) =>
      client.request(`/exchanges/${exchange.id}/dispute`, z.unknown(), {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          reason,
        }),
      }),
    onSuccess: () => {
      setDisputeReason("");
      invalidate();
    },
  });

  const isBusy =
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
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

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="verified" size={16} color={stitchTokens.wineDark} />
        <AppText style={styles.title}>Hành động tiếp theo</AppText>
      </View>

      {/* State: PROPOSED */}
      {exchange.status === "Proposed" && (
        <View style={styles.actionsBox}>
          {isInitiator ? (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Đề nghị đã được gửi đến chủ sách. Bạn có thể rút lại đề nghị bất kỳ lúc nào nếu đổi ý.
              </AppText>
              <Button
                title="Hủy đề nghị đổi sách"
                secondary
                wine
                busy={isBusy}
                onPress={() => setConfirmCancelOpen(true)}
              />
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Đối tác đã đề nghị trao đổi sách với bạn. Bạn có muốn chấp nhận hoán đổi này?
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
            </View>
          )}
        </View>
      )}

      {/* State: ACCEPTED / FUNDING */}
      {exchange.status === "AcceptedAwaitingFunding" && (
        <View style={styles.actionsBox}>
          {isFundedByMe ? (
            <View style={styles.successNote}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.successNoteText}>
                Bạn đã hoàn tất đặt cọc bảo chứng. Đang chờ đối tác cọc để chuyển sang giai đoạn gửi sách.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Cả hai bên đã đồng thuận. Hãy đặt cọc bảo chứng từ số dư ví để kích hoạt quy trình giao nhận.
              </AppText>
              <Button
                title="Đặt cọc bảo chứng ngay"
                wine
                busy={isBusy}
                onPress={() => fundMutation.mutate()}
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
        title="Rút lại đề nghị?"
        message="Hủy đề nghị trao đổi sẽ trả lại trạng thái sách về kệ của bạn."
        confirmLabel="Hủy đề nghị"
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
});
