import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Icon,
  Notice,
  TextField,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../../core/ui";
import { formatVnd } from "../../../core/ui/format";
import type { Listing } from "../../shelf/contracts";
import {
  orderReceiptSchema,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "../contracts";
import {
  changeConversationTerms,
  createSellerOrder,
  formatDateTimeVi,
  purchaseChatGuidance,
} from "../purchase-conversation-service";
import { useSession } from "../../../core/session/session-provider";
import { CreateOrderDialog } from "./create-order-dialog";

interface AgreementSheetPanelProps {
  room: PurchaseConversation;
  listing?: Listing | null;
  onRefresh: () => void;
  onOpenAddressSelect?: () => void;
}

export function AgreementSheetPanel({
  room,
  listing,
  onRefresh,
}: AgreementSheetPanelProps) {
  const router = useRouter();
  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const isSeller = room.seller.id === currentUserId;
  const isBuyer = room.buyer.id === currentUserId;

  const [proposedPrice, setProposedPrice] = useState("");
  const [editingPrice, setEditingPrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string>();

  const terms = room.terms;
  const proposal = terms?.pendingProposal;
  const mode = terms?.mode ?? "Negotiation";
  const isExchange = mode === "Exchange";

  const isLocked =
    terms?.locked ||
    room.status !== "Active" ||
    (listing != null &&
      listing.purchaseAvailability?.status !== "Available");

  const guidance = purchaseChatGuidance(
    room,
    currentUserId,
    listing ? Boolean(listing.fulfillment) : undefined,
  );

  // Command to propose or respond to terms
  const handleTermsCommand = async (
    body: TermsProposalBody | TermsResponseBody,
  ) => {
    if (busy || isLocked) return;
    setBusy(true);
    setError(undefined);
    try {
      await changeConversationTerms(client, room.id, body);
      setProposedPrice("");
      setEditingPrice(false);
      onRefresh();
    } catch (e: any) {
      setError(
        e?.message ?? "Chưa cập nhật được thỏa thuận. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  // Seller creates order
  const handleConfirmCreateOrder = async (agreedPrice: number) => {
    await createSellerOrder(client, {
      conversationId: room.id,
      expectedVersion: room.version,
      agreedBookPrice: agreedPrice,
    });
    setOrderDialogOpen(false);
    onRefresh();
  };

  // Buyer pays order directly
  const handlePayOrder = async () => {
    if (!room.orderId || payBusy) return;
    setPayBusy(true);
    setPayError(undefined);
    try {
      await client.request(
        `/orders/${room.orderId}/pay`,
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: 1 }),
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      onRefresh();
    } catch (e: any) {
      setPayError(
        e?.message ?? "Chưa thanh toán được đơn hàng. Kiểm tra số dư ví của bạn.",
      );
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {payError && <Notice tone="error">{payError}</Notice>}

      {/* 1. HÌNH THỨC GIAO DỊCH */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <AppText style={styles.cardTitle}>Hình thức giao dịch</AppText>
          {!isSeller && (
            <View style={styles.modeTag}>
              <AppText style={styles.modeTagText}>
                {isExchange ? "Đổi sách" : "Thương lượng mua"}
              </AppText>
            </View>
          )}
        </View>

        {isSeller && (
          <View style={styles.modeSwitchRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chọn hình thức Thương lượng mua"
              style={[
                styles.modeOption,
                mode === "Negotiation" && styles.modeOptionActive,
              ]}
              disabled={busy || isLocked || Boolean(proposal)}
              onPress={() =>
                void handleTermsCommand({
                  expectedVersion: room.version,
                  kind: "Mode",
                  mode: "Negotiation",
                })
              }
            >
              {mode === "Negotiation" && (
                <Icon name="check" size={14} color={stitchTokens.wineDark} />
              )}
              <AppText
                style={[
                  styles.modeOptionText,
                  mode === "Negotiation" && styles.modeOptionTextActive,
                ]}
              >
                Thương lượng mua
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chọn hình thức Đổi sách"
              style={[
                styles.modeOption,
                mode === "Exchange" && styles.modeOptionActive,
              ]}
              disabled={
                busy ||
                isLocked ||
                Boolean(proposal) ||
                listing?.mode === "Sale"
              }
              onPress={() =>
                void handleTermsCommand({
                  expectedVersion: room.version,
                  kind: "Mode",
                  mode: "Exchange",
                })
              }
            >
              {mode === "Exchange" && (
                <Icon name="check" size={14} color={stitchTokens.wineDark} />
              )}
              <AppText
                style={[
                  styles.modeOptionText,
                  mode === "Exchange" && styles.modeOptionTextActive,
                ]}
              >
                Đổi sách
              </AppText>
            </Pressable>
          </View>
        )}

        {!isSeller &&
          mode === "Negotiation" &&
          listing?.mode === "Both" &&
          !proposal &&
          !isLocked && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đề nghị đổi sách"
              style={({ pressed }) => [
                styles.requestExchangeBtn,
                pressed && styles.pressed,
              ]}
              disabled={busy}
              onPress={() =>
                void handleTermsCommand({
                  expectedVersion: room.version,
                  kind: "RequestExchange",
                })
              }
            >
              <Icon name="swap" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.requestExchangeText}>
                Đề nghị chuyển sang đổi sách
              </AppText>
            </Pressable>
          )}
      </View>

      {/* 2. ĐỀ XUẤT ĐANG CHỜ PHẢN HỒI (PENDING PROPOSAL) */}
      {proposal && (
        <View style={styles.proposalCard}>
          <View style={styles.proposalHeader}>
            <Icon name="tag" size={16} color={stitchTokens.wineDark} />
            <AppText style={styles.proposalTitle}>
              {proposal.proposedById === currentUserId
                ? "Bạn đã đề xuất"
                : "Đối tác đề xuất"}
            </AppText>
          </View>

          <AppText style={styles.proposalBody}>
            {proposal.kind === "Price" ? (
              <>
                Đề xuất giá sách:{" "}
                <AppText style={styles.proposalHighlight}>
                  {formatVnd(proposal.amount ?? 0)}
                </AppText>
              </>
            ) : (
              <>
                Đề xuất chuyển hình thức sang:{" "}
                <AppText style={styles.proposalHighlight}>
                  {proposal.mode === "Exchange"
                    ? "Đổi sách"
                    : "Thương lượng mua"}
                </AppText>
              </>
            )}
          </AppText>

          {proposal.proposedById !== currentUserId ? (
            <View style={styles.proposalActionRow}>
              <View style={styles.proposalAcceptBtn}>
                <Button
                  title={
                    proposal.kind === "Price"
                      ? "Chấp nhận giá"
                      : "Chấp nhận hình thức"
                  }
                  onPress={() =>
                    void handleTermsCommand({
                      expectedVersion: room.version,
                      proposalId: proposal.id,
                      accept: true,
                    })
                  }
                  disabled={busy}
                />
              </View>
              <View style={styles.proposalDeclineBtn}>
                <Button
                  secondary
                  title="Từ chối"
                  onPress={() =>
                    void handleTermsCommand({
                      expectedVersion: room.version,
                      proposalId: proposal.id,
                      accept: false,
                    })
                  }
                  disabled={busy}
                />
              </View>
            </View>
          ) : (
            <View style={styles.proposalSelfRow}>
              <AppText style={styles.proposalHelp}>
                Đang chờ đối tác phản hồi. Đề nghị chưa giữ sách.
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rút lại đề nghị này"
                style={styles.withdrawBtn}
                disabled={busy}
                onPress={() =>
                  void handleTermsCommand({
                    expectedVersion: room.version,
                    proposalId: proposal.id,
                    accept: false,
                  })
                }
              >
                <AppText style={styles.withdrawText}>Rút đề nghị</AppText>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* 3. BẢNG GIÁ THỎA THUẬN (PRICE SUMMARY) */}
      {!isExchange && (
        <View style={styles.card}>
          <AppText style={styles.cardTitle}>Giá sách giao dịch</AppText>

          <View style={styles.priceRowContainer}>
            <View style={styles.priceCol}>
              <AppText style={styles.priceLabel}>Giá niêm yết</AppText>
              <AppText style={styles.priceOriginal}>
                {formatVnd(listing?.salePrice ?? 0)}
              </AppText>
            </View>

            <View style={styles.priceColDivider} />

            <View style={styles.priceCol}>
              <AppText style={styles.priceLabel}>Giá đã thống nhất</AppText>
              <AppText
                style={[
                  styles.priceAgreed,
                  terms?.agreedPrice != null && styles.priceAgreedDone,
                ]}
              >
                {terms?.agreedPrice != null
                  ? formatVnd(terms.agreedPrice)
                  : "Chưa thống nhất"}
              </AppText>
            </View>
          </View>

          <AppText style={styles.priceFootnote}>
            * Giá sách chưa bao gồm phí giao nhận.
          </AppText>

          {/* Form / Nút đề nghị giá mới */}
          {!isLocked && !proposal && (
            <>
              {terms?.agreedPrice != null && !editingPrice ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đề nghị giá khác"
                  style={({ pressed }) => [
                    styles.editPriceBtn,
                    pressed && styles.pressed,
                  ]}
                  disabled={busy}
                  onPress={() => setEditingPrice(true)}
                >
                  <Icon name="pen" size={14} color={stitchTokens.wineDark} />
                  <AppText style={styles.editPriceText}>
                    Đề nghị giá khác
                  </AppText>
                </Pressable>
              ) : (terms?.agreedPrice == null || editingPrice) && (
                <View style={styles.offerForm}>
                  <AppText style={styles.offerLabel}>
                    {terms?.agreedPrice != null
                      ? "Nhập giá sách đề xuất mới (₫)"
                      : "Đề xuất giá sách thương lượng (₫)"}
                  </AppText>
                  <View style={styles.offerInputRow}>
                    <TextField
                      value={proposedPrice}
                      onChangeText={(t) =>
                        setProposedPrice(t.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Ví dụ: 80000"
                      keyboardType="numeric"
                      editable={!busy}
                      style={styles.offerInput}
                    />
                    <View style={styles.offerSubmitBtn}>
                      <Button
                        title={busy ? "…" : "Gửi giá"}
                        disabled={busy || !proposedPrice}
                        onPress={() => {
                          const val = Number(proposedPrice);
                          if (
                            !Number.isInteger(val) ||
                            val < 10000 ||
                            val > 1000000
                          ) {
                            setError("Giá đề xuất phải từ 10.000 ₫ đến 1.000.000 ₫.");
                            return;
                          }
                          void handleTermsCommand({
                            expectedVersion: room.version,
                            kind: "Price",
                            amount: val,
                          });
                        }}
                      />
                    </View>
                  </View>

                  {editingPrice && terms?.agreedPrice != null && (
                    <Pressable
                      style={styles.cancelOfferBtn}
                      onPress={() => setEditingPrice(false)}
                    >
                      <AppText style={styles.cancelOfferText}>
                        Giữ giá đã thống nhất
                      </AppText>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* 4. THÔNG TIN GIAO NHẬN & BÁO GIÁ VẬN CHUYỂN */}
      {room.quotePreview ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.rowAlign}>
              <Icon name="pin" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.cardTitle}>Thông tin nhận sách</AppText>
            </View>
            <View style={styles.verifiedTag}>
              <Icon name="check" size={13} color={stitchTokens.verifiedGreen} />
              <AppText style={styles.verifiedTagText}>Đã có báo giá</AppText>
            </View>
          </View>

          <View style={styles.destBox}>
            <AppText style={styles.destName}>
              {room.quotePreview.destination.recipientName} ·{" "}
              {room.quotePreview.destination.phone}
            </AppText>
            <AppText style={styles.destAddress}>
              {room.quotePreview.destination.detail}
            </AppText>
            <View style={styles.destFeeRow}>
              <AppText style={styles.destFeeLabel}>Cước giao nhận:</AppText>
              <AppText style={styles.destFeeValue}>
                {formatVnd(room.quotePreview.shippingFee)}
              </AppText>
            </View>
            <AppText style={styles.destExpiry}>
              Báo giá có hiệu lực đến:{" "}
              {formatDateTimeVi(room.quotePreview.expiresAt)}
            </AppText>
          </View>
        </View>
      ) : isBuyer ? (
        <View style={styles.cardNotice}>
          <View style={styles.rowAlign}>
            <Icon name="truck" size={16} color={stitchTokens.wineDark} />
            <AppText style={styles.cardNoticeTitle}>
              Chưa gửi thông tin nhận sách
            </AppText>
          </View>
          <AppText style={styles.cardNoticeDesc}>
            Sau khi hai bên thống nhất giá hoặc tình trạng sách, hãy gửi địa chỉ
            và nhận báo giá giao hàng để người bán tạo đơn cho bạn.
          </AppText>
        </View>
      ) : null}

      {/* 5. TIẾN TRÌNH GIAO DỊCH (STEPPER) */}
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>Tiến trình mua bán</AppText>
        <View style={styles.stepperRow}>
          {[
            { step: 0, label: "Trao đổi" },
            { step: 1, label: "Địa chỉ & Phí" },
            { step: 2, label: "Đơn hàng" },
          ].map((item, index) => {
            const isCurrent = guidance.phase === item.step;
            const isCompleted =
              guidance.phase !== undefined && guidance.phase > item.step;
            return (
              <React.Fragment key={item.label}>
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isCompleted && styles.stepCircleCompleted,
                      isCurrent && styles.stepCircleCurrent,
                    ]}
                  >
                    {isCompleted ? (
                      <Icon name="check" size={12} color={stitchTokens.white} />
                    ) : (
                      <AppText
                        style={[
                          styles.stepNumber,
                          isCurrent && styles.stepNumberCurrent,
                        ]}
                      >
                        {item.step + 1}
                      </AppText>
                    )}
                  </View>
                  <AppText
                    style={[
                      styles.stepLabel,
                      (isCurrent || isCompleted) && styles.stepLabelActive,
                    ]}
                  >
                    {item.label}
                  </AppText>
                </View>
                {index < 2 && <View style={styles.stepLine} />}
              </React.Fragment>
            );
          })}
        </View>

        <View style={styles.guidanceBox}>
          <AppText style={styles.guidanceTitle}>{guidance.title}</AppText>
          <AppText style={styles.guidanceDesc}>{guidance.description}</AppText>
        </View>
      </View>

      {/* 6. HÀNH ĐỘNG TIẾP THEO (NEXT ACTION BLOCK) */}
      {room.orderId ? (
        <View style={styles.orderCreatedCard}>
          <View style={styles.orderHeaderRow}>
            <Icon name="bag" size={18} color={stitchTokens.wineDark} />
            <AppText style={styles.orderCreatedTitle}>
              Đơn hàng #{room.orderId.slice(0, 8).toUpperCase()}
            </AppText>
          </View>

          {isBuyer ? (
            <>
              <AppText style={styles.orderCreatedDesc}>
                Người bán đã tạo đơn giữ sách cho bạn. Hãy thanh toán để hoàn tất
                đặt mua.
              </AppText>
              <View style={styles.orderActionRow}>
                <View style={styles.payBtn}>
                  <Button
                    title={payBusy ? "Đang thanh toán…" : "Thanh toán ngay qua Ví"}
                    onPress={() => void handlePayOrder()}
                    disabled={payBusy}
                    busy={payBusy}
                  />
                </View>
                <View style={styles.viewOrderBtn}>
                  <Button
                    secondary
                    title="Xem đơn hàng"
                    onPress={() => router.push("/orders")}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <AppText style={styles.orderCreatedDesc}>
                Bạn đã tạo đơn cho người mua này. Đang chờ người mua thanh toán
                để tiến hành gửi sách.
              </AppText>
              <View style={{ marginTop: space.sm }}>
                <Button
                  secondary
                  title="Quản lý đơn hàng"
                  onPress={() => router.push("/orders")}
                />
              </View>
            </>
          )}
        </View>
      ) : isSeller && room.quotePreview ? (
        <View style={styles.actionCard}>
          <AppText style={styles.actionCardTitle}>Sẵn sàng tạo đơn</AppText>
          <AppText style={styles.actionCardDesc}>
            Người mua đã gửi địa chỉ nhận sách và cước phí đã được tính. Bấm nút
            dưới để xác nhận giá và tạo đơn hàng.
          </AppText>
          <View style={styles.createOrderBtn}>
            <Button
              title="Tạo đơn cho người mua này"
              onPress={() => setOrderDialogOpen(true)}
            />
          </View>
        </View>
      ) : null}

      {/* Dialog tạo đơn dành cho Seller */}
      <CreateOrderDialog
        visible={orderDialogOpen}
        onClose={() => setOrderDialogOpen(false)}
        room={room}
        onConfirm={handleConfirmCreateOrder}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTokens.parchment,
  },
  contentContainer: {
    padding: space.md,
    gap: space.md,
    paddingBottom: space.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowAlign: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  modeTag: {
    backgroundColor: stitchTokens.parchment,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modeTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  modeSwitchRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: 4,
  },
  modeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: stitchTokens.parchment,
  },
  modeOptionActive: {
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  modeOptionText: {
    fontSize: 13,
    color: colors.muted,
  },
  modeOptionTextActive: {
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  requestExchangeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.rule,
    marginTop: 4,
  },
  requestExchangeText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    fontWeight: "600",
  },
  proposalCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
    padding: space.md,
    gap: space.xs,
  },
  proposalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  proposalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  proposalBody: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
    marginVertical: 4,
  },
  proposalHighlight: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  proposalActionRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.xs,
  },
  proposalAcceptBtn: {
    flex: 2,
  },
  proposalDeclineBtn: {
    flex: 1,
  },
  proposalSelfRow: {
    gap: 6,
    marginTop: 4,
  },
  proposalHelp: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: "italic",
  },
  withdrawBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  withdrawText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  priceRowContainer: {
    flexDirection: "row",
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.small,
    padding: space.md,
    alignItems: "center",
    marginVertical: 4,
  },
  priceCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  priceColDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.rule,
  },
  priceLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  priceOriginal: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  priceAgreed: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  priceAgreedDone: {
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  priceFootnote: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: "italic",
  },
  editPriceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: stitchTokens.wineDark,
    borderRadius: radius.small,
    marginTop: 4,
  },
  editPriceText: {
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  offerForm: {
    gap: space.xs,
    marginTop: space.xs,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  offerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
  },
  offerInputRow: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
  },
  offerInput: {
    flex: 1,
  },
  offerSubmitBtn: {
    width: 90,
  },
  cancelOfferBtn: {
    paddingVertical: 4,
    alignSelf: "center",
  },
  cancelOfferText: {
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: "underline",
  },
  verifiedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
  },
  destBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.small,
    padding: space.sm,
    gap: 4,
    marginTop: 4,
  },
  destName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  destAddress: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  destFeeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  destFeeLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  destFeeValue: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  destExpiry: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  cardNotice: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.md,
    gap: space.xs,
  },
  cardNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  cardNoticeDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: space.xs,
  },
  stepItem: {
    alignItems: "center",
    gap: 4,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: stitchTokens.canvasMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleCurrent: {
    backgroundColor: stitchTokens.wineDark,
  },
  stepCircleCompleted: {
    backgroundColor: stitchTokens.verifiedGreen,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  stepNumberCurrent: {
    color: stitchTokens.white,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  stepLabelActive: {
    fontWeight: "700",
    color: colors.ink,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.rule,
    marginBottom: 16,
  },
  guidanceBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.small,
    padding: space.sm,
    gap: 4,
    marginTop: 4,
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  guidanceDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  orderCreatedCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: stitchTokens.amberBg,
    padding: space.md,
    gap: space.xs,
  },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderCreatedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  orderCreatedDesc: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
    marginTop: 2,
  },
  orderActionRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  payBtn: {
    flex: 2,
  },
  viewOrderBtn: {
    flex: 1,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  actionCardDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  createOrderBtn: {
    marginTop: space.xs,
  },
  pressed: {
    opacity: 0.85,
  },
});
