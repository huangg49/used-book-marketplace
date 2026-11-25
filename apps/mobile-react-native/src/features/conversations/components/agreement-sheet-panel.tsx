import React, { useState } from "react";
import { randomUUID } from "expo-crypto";
import { buyerSaleFeeText } from "@used-books/session-client";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../../core/ui";
import { formatVnd } from "../../../core/ui/format";
import type { Listing } from "../../shelf/contracts";
import { addressBook } from "../../addresses/contracts";
import { orderDetailsSchema, quoteSchema } from "../../orders/contracts";
import {
  orderReceiptSchema,
  type PurchaseConversation,
  type TermsProposalBody,
  type TermsResponseBody,
} from "../contracts";
import {
  attachConversationQuote,
  changeConversationTerms,
  formatDateTimeVi,
  purchaseChatGuidance,
} from "../purchase-conversation-service";
import { useSession } from "../../../core/session/session-provider";

interface AgreementSheetPanelProps {
  room: PurchaseConversation;
  listing?: Listing | null;
  onRefresh: () => void;
  onOpenAddressSelect?: () => void;
  onOpenCreateOrder?: () => void;
}

const SHEET_STEPS = [
  { step: 0, label: "Thỏa thuận" },
  { step: 1, label: "Địa chỉ & Phí" },
  { step: 2, label: "Tạo đơn" },
] as const;

export function AgreementSheetPanel({
  room,
  listing,
  onRefresh,
  onOpenCreateOrder,
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
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string>();
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string>();

  const terms = room.terms;
  const proposal = terms?.pendingProposal;
  const mode = terms?.mode ?? "Negotiation";
  const isExchange = mode === "Exchange";

  const addressesQuery = useQuery({
    queryKey: ["member-addresses", currentUserId],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled:
      Boolean(currentUserId) &&
      isBuyer &&
      !isExchange &&
      !room.orderId &&
      room.status === "Active",
    staleTime: 10_000,
  });

  const addresses = addressesQuery.data?.items ?? [];
  const effectiveAddressId =
    selectedAddressId ||
    addresses.find((a) => a.isDefault)?.id ||
    addresses[0]?.id ||
    "";

  const [renderNow] = useState(() => Date.now());
  const quoteExpired = Boolean(
    room.quotePreview && Date.parse(room.quotePreview.expiresAt) <= renderNow,
  );

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

  const listedPrice = listing?.salePrice ?? 0;
  const agreedPrice = terms?.agreedPrice ?? null;
  const effectiveBookPrice = agreedPrice ?? listedPrice;
  const shippingFee = room.quotePreview?.shippingFee ?? null;
  const estimatedBuyerTotal =
    shippingFee != null ? effectiveBookPrice + shippingFee : null;
  const isDiscounted =
    agreedPrice != null && listedPrice > 0 && agreedPrice !== listedPrice;

  const handleAttachQuote = async () => {
    if (!listing || !effectiveAddressId || quoteBusy || isLocked) return;
    setQuoteBusy(true);
    setQuoteError(undefined);
    try {
      const quote = await client.request(
        `/listings/${room.listingId}/quotes`,
        quoteSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            destinationAddressId: effectiveAddressId,
            expectedListingVersion: listing.version,
            expectedListingRevisionId: listing.revisionId,
          }),
        },
      );
      await attachConversationQuote(
        client,
        room.id,
        {
          expectedVersion: room.version,
          quoteId: quote.id,
          expectedQuoteVersion: quote.version,
          expectedListingVersion: quote.listingVersion,
          expectedListingRevisionId: quote.listingRevisionId,
        },
        randomUUID(),
      );
      onRefresh();
    } catch (e: unknown) {
      setQuoteError(
        e instanceof Error
          ? e.message
          : "Chưa gửi được địa chỉ và báo giá giao hàng. Vui lòng thử lại.",
      );
    } finally {
      setQuoteBusy(false);
    }
  };

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
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa cập nhật được thỏa thuận. Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePayOrder = async () => {
    if (!room.orderId || payBusy) return;
    setPayBusy(true);
    setPayError(undefined);
    try {
      const currentOrder = await client.request(
        `/me/orders/${room.orderId}`,
        orderDetailsSchema,
      );
      if (currentOrder.state !== "AwaitingPayment") {
        setPayError("Đơn hàng này không còn ở trạng thái chờ thanh toán.");
        onRefresh();
        return;
      }
      await client.request(
        `/orders/${room.orderId}/pay`,
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({ expectedVersion: currentOrder.version }),
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      onRefresh();
    } catch (e: unknown) {
      setPayError(
        e instanceof Error
          ? e.message
          : "Chưa thanh toán được đơn hàng. Kiểm tra số dư ví của bạn.",
      );
    } finally {
      setPayBusy(false);
    }
  };

  const currentPhase = guidance.phase ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      {payError ? <Notice tone="error">{payError}</Notice> : null}

      {/* TIER 1: COMPACT PROGRESS BAR + IMMEDIATE PRIMARY ACTION HERO */}
      {!isExchange && (
        <View style={styles.progressCard}>
          <View style={styles.segmentsRow}>
            {SHEET_STEPS.map((item) => {
              const isDone = currentPhase > item.step || Boolean(room.orderId);
              const isCur = currentPhase === item.step && !room.orderId;
              return (
                <View key={item.label} style={styles.segmentCol}>
                  <View
                    style={[
                      styles.segmentBar,
                      isDone && styles.segmentBarDone,
                      isCur && styles.segmentBarActive,
                    ]}
                  />
                  <AppText
                    numberOfLines={1}
                    style={[
                      styles.segmentLabel,
                      isDone && styles.segmentLabelDone,
                      isCur && styles.segmentLabelActive,
                    ]}
                  >
                    {item.step + 1}. {item.label}
                  </AppText>
                </View>
              );
            })}
          </View>

          {room.orderId ? (
            <View style={styles.heroBlock}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroPillSuccess}>
                  <AppText style={styles.heroPillSuccessText}>
                    Đã tạo đơn #{room.orderId.slice(0, 8).toUpperCase()}
                  </AppText>
                </View>
              </View>
              <AppText style={styles.heroTitle}>
                {isBuyer
                  ? "Người bán đã tạo đơn giữ sách cho bạn"
                  : "Đơn hàng đã sẵn sàng · Chờ người mua thanh toán"}
              </AppText>
              <AppText style={styles.heroDesc}>
                {isBuyer
                  ? "Thanh toán qua Ví Lật Lại để khóa tiền an toàn vào Quỹ bảo chứng."
                  : "Bạn sẽ nhận được thông báo ngay khi người mua hoàn tất thanh toán."}
              </AppText>
              {isBuyer ? (
                <View style={styles.heroActionsRow}>
                  <View style={{ flex: 1 }}>
                    <Button
                      wine
                      title={
                        payBusy
                          ? "Đang thanh toán…"
                          : estimatedBuyerTotal != null
                            ? `Thanh toán ${formatVnd(estimatedBuyerTotal)}`
                            : "Thanh toán ngay qua Ví"
                      }
                      onPress={() => void handlePayOrder()}
                      disabled={payBusy}
                      busy={payBusy}
                    />
                  </View>
                  <Button
                    wine
                    secondary
                    title="Chi tiết"
                    onPress={() =>
                      router.push({
                        pathname: "/orders",
                        params: { orderId: room.orderId! },
                      })
                    }
                  />
                </View>
              ) : (
                <Button
                  wine
                  title="Mở chi tiết đơn hàng"
                  onPress={() =>
                    router.push({
                      pathname: "/orders",
                      params: { orderId: room.orderId! },
                    })
                  }
                />
              )}
            </View>
          ) : isSeller && onOpenCreateOrder && !proposal ? (
            <View style={styles.heroBlock}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroPillWine}>
                  <View style={styles.liveDot} />
                  <AppText style={styles.heroPillWineText}>
                    Đến lượt bạn · Tạo đơn
                  </AppText>
                </View>
                {estimatedBuyerTotal != null ? (
                  <AppText style={styles.heroAmountHighlight}>
                    {formatVnd(estimatedBuyerTotal)}
                  </AppText>
                ) : null}
              </View>
              <AppText style={styles.heroTitle}>
                Đã chốt giá &amp; có địa chỉ nhận sách
              </AppText>
              <AppText style={styles.heroDesc}>
                Người mua đã gửi thông tin giao nhận hợp lệ. Bấm tạo đơn để mở
                bước thanh toán vào Quỹ bảo chứng.
              </AppText>
              <Button
                wine
                title="Tạo đơn cho người mua này"
                onPress={() => onOpenCreateOrder()}
              />
            </View>
          ) : (
            <View style={styles.guidanceStrip}>
              <AppText style={styles.guidanceTitle}>{guidance.title}</AppText>
              <AppText style={styles.guidanceDesc}>
                {guidance.description}
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* PENDING PROPOSAL BANNER (always prominent when active) */}
      {proposal && (
        <View style={styles.proposalCard}>
          <View style={styles.proposalHeader}>
            <Icon name="tag" size={16} color={stitchTokens.wine} />
            <AppText style={styles.proposalTitle}>
              {proposal.proposedById === currentUserId
                ? "Bạn vừa gửi đề xuất"
                : "Đối tác gửi đề xuất mới"}
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
              <View style={{ flex: 1 }}>
                <Button
                  wine
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
              <Button
                wine
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

      {/* TIER 2: EXCHANGE WORKSPACE OR CLEAN PRICE & PAYMENT SUMMARY */}
      {isExchange ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.rowAlign}>
              <View style={styles.sectionIconBox}>
                <Icon name="book" size={15} color={stitchTokens.wine} />
              </View>
              <AppText style={styles.cardTitle}>
                Phiếu đề nghị trao đổi sách
              </AppText>
            </View>
            <View
              style={[
                styles.statusBadge,
                terms?.activeExchangeId
                  ? styles.statusBadgeGreen
                  : styles.statusBadgeWarm,
              ]}
            >
              <AppText
                style={[
                  styles.statusBadgeText,
                  terms?.activeExchangeId
                    ? styles.statusBadgeTextGreen
                    : styles.statusBadgeTextWarm,
                ]}
              >
                {terms?.activeExchangeId
                  ? "Đang thực hiện"
                  : terms?.exchangeIds?.length
                    ? "Đã kết thúc"
                    : "Chưa có phiếu"}
              </AppText>
            </View>
          </View>

          {(() => {
            const exchangeIds = terms?.exchangeIds ?? [];
            const latestExchangeId =
              terms?.activeExchangeId ??
              (exchangeIds.length > 0
                ? exchangeIds[exchangeIds.length - 1]
                : null);

            if (!latestExchangeId) {
              return (
                <View style={{ gap: space.sm }}>
                  <AppText style={styles.cardNoticeDesc}>
                    Hai bên đã thống nhất chuyển sang trao đổi sách hai chiều.
                    Mở phiếu đề nghị để chọn sách đối ứng và thông tin giao nhận.
                  </AppText>
                  {!isLocked && (
                    <Button
                      wine
                      title="+ Tạo đề nghị đổi sách mới"
                      onPress={() =>
                        router.push({
                          pathname: "/exchange-compose",
                          params: {
                            book: room.listingId,
                            conversationId: room.id,
                            expectedConversationVersion: String(room.version),
                          },
                        })
                      }
                    />
                  )}
                </View>
              );
            }

            return (
              <View style={{ gap: space.sm }}>
                <AppText style={styles.cardNoticeDesc}>
                  {terms?.activeExchangeId
                    ? "Phiếu trao đổi đang diễn ra. Mở chi tiết để theo dõi vận đơn, kiểm tra sách hoặc xử lý tranh chấp."
                    : "Phiếu trao đổi trước đó đã khép lại. Bạn có thể mở xem lại chi tiết bất cứ lúc nào."}
                </AppText>
                <Button
                  wine
                  title="Mở chi tiết phiếu trao đổi"
                  onPress={() =>
                    router.push({
                      pathname: "/exchange",
                      params: { id: latestExchangeId },
                    })
                  }
                />
                {exchangeIds.length > 1 && (
                  <View style={styles.historyChipsRow}>
                    {exchangeIds.map((exId, idx) => {
                      const isLatest = exId === latestExchangeId;
                      return (
                        <Pressable
                          key={exId}
                          accessibilityRole="button"
                          onPress={() =>
                            router.push({
                              pathname: "/exchange",
                              params: { id: exId },
                            })
                          }
                          style={[
                            styles.historyChip,
                            isLatest && styles.historyChipActive,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.historyChipText,
                              isLatest && styles.historyChipTextActive,
                            ]}
                          >
                            {`Lần ${idx + 1}${isLatest ? " (mới nhất)" : ""}`}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {!terms?.activeExchangeId && !isLocked && (
                  <Button
                    wine
                    secondary
                    title="+ Tạo đề nghị đổi sách mới"
                    onPress={() =>
                      router.push({
                        pathname: "/exchange-compose",
                        params: {
                          book: room.listingId,
                          conversationId: room.id,
                          expectedConversationVersion: String(room.version),
                        },
                      })
                    }
                  />
                )}
              </View>
            );
          })()}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.rowAlign}>
              <View style={styles.sectionIconBox}>
                <Icon name="tag" size={15} color={stitchTokens.wine} />
              </View>
              <AppText style={styles.cardTitle}>
                Giá &amp; Thanh toán dự kiến
              </AppText>
            </View>
            <View
              style={[
                styles.statusBadge,
                agreedPrice != null
                  ? styles.statusBadgeGreen
                  : styles.statusBadgeWarm,
              ]}
            >
              <AppText
                style={[
                  styles.statusBadgeText,
                  agreedPrice != null
                    ? styles.statusBadgeTextGreen
                    : styles.statusBadgeTextWarm,
                ]}
              >
                {agreedPrice != null ? "Đã chốt giá" : "Đang thương lượng"}
              </AppText>
            </View>
          </View>

          {/* Clean Editorial Price Breakdown (NO heavy double-135k wine block & NO fake 'Miễn phí ship' pill!) */}
          <View style={styles.priceTable}>
            <View style={styles.priceRow}>
              <AppText style={styles.priceRowLabel}>
                {agreedPrice != null ? "Giá sách đã chốt" : "Giá niêm yết"}
              </AppText>
              <View style={styles.priceValueGroup}>
                {isDiscounted ? (
                  <AppText style={styles.priceStrike}>
                    {formatVnd(listedPrice)}
                  </AppText>
                ) : null}
                <AppText style={styles.priceRowValue}>
                  {formatVnd(effectiveBookPrice)}
                </AppText>
              </View>
            </View>

            <View style={styles.priceRow}>
              <AppText style={styles.priceRowLabel}>Phí giao nhận</AppText>
              <AppText
                style={[
                  styles.priceRowValue,
                  shippingFee === 0 && styles.freeShipText,
                  shippingFee == null && styles.mutedValue,
                ]}
              >
                {shippingFee == null
                  ? "Chưa tính cước"
                  : shippingFee > 0
                    ? formatVnd(shippingFee)
                    : "Miễn phí"}
              </AppText>
            </View>

            {estimatedBuyerTotal != null && (
              <>
                <View style={styles.priceDivider} />
                <View style={styles.priceRow}>
                  <AppText style={styles.totalLabel}>
                    {isBuyer ? "Tổng bạn thanh toán" : "Tổng người mua trả"}
                  </AppText>
                  <AppText style={styles.totalValue}>
                    {formatVnd(estimatedBuyerTotal)}
                  </AppText>
                </View>
              </>
            )}
          </View>

          {isBuyer && room.quotePreview ? (
            <AppText style={styles.feeNoteText}>
              {buyerSaleFeeText(room.quotePreview.commissionBps)}
            </AppText>
          ) : null}

          {/* Collapsible Price Proposal Form */}
          {!isLocked && !proposal && (
            <>
              {agreedPrice != null && !editingPrice ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đề nghị mức giá khác"
                  style={({ pressed }) => [
                    styles.editPriceBtn,
                    pressed && styles.pressed,
                  ]}
                  disabled={busy}
                  onPress={() => setEditingPrice(true)}
                >
                  <Icon name="pen" size={13} color={stitchTokens.wine} />
                  <AppText style={styles.editPriceText}>
                    Đề nghị mức giá khác
                  </AppText>
                </Pressable>
              ) : (
                <View style={styles.offerForm}>
                  <AppText style={styles.offerLabel}>
                    {agreedPrice != null
                      ? "Đề xuất lại mức giá mới"
                      : "Đề xuất giá thương lượng"}
                  </AppText>

                  {listedPrice >= 20000 && (
                    <View style={styles.quickPriceRow}>
                      {[0.85, 0.9, 0.95, 1].map((ratio) => {
                        const preset = Math.max(
                          10000,
                          Math.round((listedPrice * ratio) / 1000) * 1000,
                        );
                        const activePreset = proposedPrice === String(preset);
                        return (
                          <Pressable
                            key={ratio}
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => setProposedPrice(String(preset))}
                            style={({ pressed }) => [
                              styles.quickPricePill,
                              activePreset && styles.quickPricePillActive,
                              pressed && styles.pressed,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.quickPriceText,
                                activePreset && styles.quickPriceTextActive,
                              ]}
                            >
                              {formatVnd(preset)}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.offerInputRow}>
                    <View style={styles.offerInputBox}>
                      <AppTextInput
                        value={proposedPrice}
                        onChangeText={(t) =>
                          setProposedPrice(t.replace(/[^0-9]/g, ""))
                        }
                        placeholder="Nhập giá (VD: 120000)"
                        placeholderTextColor={colors.muted}
                        keyboardType="numeric"
                        editable={!busy}
                        style={styles.offerTextInput}
                      />
                      <AppText style={styles.offerCurrency}>₫</AppText>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Gửi đề xuất giá"
                      disabled={busy || !proposedPrice}
                      onPress={() => {
                        const val = Number(proposedPrice);
                        if (
                          !Number.isInteger(val) ||
                          val < 10000 ||
                          val > 1000000
                        ) {
                          setError(
                            "Giá đề xuất phải từ 10.000 ₫ đến 1.000.000 ₫.",
                          );
                          return;
                        }
                        void handleTermsCommand({
                          expectedVersion: room.version,
                          kind: "Price",
                          amount: val,
                        });
                      }}
                      style={({ pressed }) => [
                        styles.offerSendBtn,
                        (busy || !proposedPrice) && styles.offerSendBtnDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText
                        numberOfLines={1}
                        style={[
                          styles.offerSendBtnText,
                          (busy || !proposedPrice) &&
                            styles.offerSendBtnTextDisabled,
                        ]}
                      >
                        {busy ? "Đang gửi…" : "Gửi giá"}
                      </AppText>
                    </Pressable>
                  </View>

                  {editingPrice && agreedPrice != null && (
                    <Pressable
                      style={styles.cancelOfferBtn}
                      onPress={() => setEditingPrice(false)}
                    >
                      <AppText style={styles.cancelOfferText}>
                        Giữ giá đã chốt
                      </AppText>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* TIER 3: DELIVERY ADDRESS & QUOTE */}
      {!isExchange &&
        (room.quotePreview ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.rowAlign}>
                <View style={styles.sectionIconBox}>
                  <Icon name="pin" size={15} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.cardTitle}>Địa chỉ nhận sách</AppText>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  quoteExpired
                    ? styles.statusBadgeDanger
                    : styles.statusBadgeGreen,
                ]}
              >
                <AppText
                  style={[
                    styles.statusBadgeText,
                    quoteExpired
                      ? styles.statusBadgeTextDanger
                      : styles.statusBadgeTextGreen,
                  ]}
                >
                  {quoteExpired ? "Báo giá hết hạn" : "Đã có báo giá"}
                </AppText>
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
              <AppText style={styles.destExpiry}>
                Hiệu lực báo giá đến:{" "}
                {formatDateTimeVi(room.quotePreview.expiresAt)}
              </AppText>
            </View>

            {isBuyer && quoteExpired && !room.orderId && !isLocked && (
              <View style={{ gap: space.xs }}>
                {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
                <Button
                  wine
                  secondary
                  title={
                    quoteBusy ? "Đang cập nhật…" : "Lấy lại báo giá giao hàng"
                  }
                  disabled={quoteBusy || !effectiveAddressId || !listing}
                  busy={quoteBusy}
                  onPress={() => void handleAttachQuote()}
                />
              </View>
            )}
          </View>
        ) : isBuyer && !room.orderId ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.rowAlign}>
                <View style={styles.sectionIconBox}>
                  <Icon name="pin" size={15} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.cardTitle}>
                  Chọn địa chỉ nhận sách
                </AppText>
              </View>
            </View>
            <AppText style={styles.cardNoticeDesc}>
              Chọn địa chỉ nhận để tính cước vận chuyển và gửi cho người bán tạo
              đơn hàng.
            </AppText>
            {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
            {addresses.length > 0 ? (
              <View style={styles.addressList}>
                {addresses.map((addr) => {
                  const activeAddr = addr.id === effectiveAddressId;
                  return (
                    <Pressable
                      key={addr.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activeAddr }}
                      onPress={() => setSelectedAddressId(addr.id)}
                      style={({ pressed }) => [
                        styles.addressOption,
                        activeAddr && styles.addressOptionActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.radioCircle,
                          activeAddr && styles.radioCircleActive,
                        ]}
                      >
                        {activeAddr && (
                          <Icon
                            name="check"
                            size={11}
                            color={stitchTokens.white}
                          />
                        )}
                      </View>
                      <View style={styles.addressOptionBody}>
                        <View style={styles.addressNameRow}>
                          <AppText
                            numberOfLines={1}
                            style={[
                              styles.addressName,
                              activeAddr && styles.addressNameActive,
                            ]}
                          >
                            {addr.recipientName}
                          </AppText>
                          <AppText style={styles.addressPhone}>
                            · {addr.phone}
                          </AppText>
                          {addr.isDefault && (
                            <View style={styles.defaultBadge}>
                              <AppText style={styles.defaultBadgeText}>
                                Mặc định
                              </AppText>
                            </View>
                          )}
                        </View>
                        <AppText numberOfLines={2} style={styles.addressDetail}>
                          {addr.detail}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
                <View style={{ marginTop: 4 }}>
                  <Button
                    wine
                    title={
                      quoteBusy
                        ? "Đang lấy báo giá…"
                        : "Gửi địa chỉ & lấy báo giá ship"
                    }
                    disabled={
                      quoteBusy || !effectiveAddressId || !listing || isLocked
                    }
                    busy={quoteBusy}
                    onPress={() => void handleAttachQuote()}
                  />
                </View>
              </View>
            ) : (
              <Button
                wine
                secondary
                title="Thêm địa chỉ nhận sách"
                onPress={() => router.push("/addresses")}
              />
            )}
          </View>
        ) : null)}

      {/* TIER 4: COMPACT MODE SWITCHER (only full buttons when Exchange is actually allowed) */}
      {(isSeller && listing?.mode !== "Sale") ||
      (!isSeller &&
        mode === "Negotiation" &&
        listing?.mode === "Both" &&
        !proposal &&
        !isLocked) ? (
        <View style={styles.compactModeCard}>
          <View style={styles.cardHeaderRow}>
            <AppText style={styles.compactModeLabel}>
              Hình thức giao dịch
            </AppText>
            {!isSeller && (
              <AppText style={styles.compactModeValue}>
                {isExchange ? "Đổi sách" : "Thương lượng mua"}
              </AppText>
            )}
          </View>

          {isSeller ? (
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
                  <Icon name="check" size={13} color={stitchTokens.wineDark} />
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
                disabled={busy || isLocked || Boolean(proposal)}
                onPress={() =>
                  void handleTermsCommand({
                    expectedVersion: room.version,
                    kind: "Mode",
                    mode: "Exchange",
                  })
                }
              >
                {mode === "Exchange" && (
                  <Icon name="check" size={13} color={stitchTokens.wineDark} />
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
          ) : (
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
              <Icon name="swap" size={14} color={stitchTokens.wine} />
              <AppText style={styles.requestExchangeText}>
                Đề nghị chuyển sang đổi sách
              </AppText>
            </Pressable>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  contentContainer: {
    padding: space.md,
    gap: 12,
    paddingBottom: space.xl * 2,
  },
  progressCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    padding: 15,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentsRow: {
    flexDirection: "row",
    gap: 6,
  },
  segmentCol: {
    flex: 1,
    gap: 5,
  },
  segmentBar: {
    height: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.creamParchment,
  },
  segmentBarDone: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  segmentBarActive: {
    backgroundColor: stitchTokens.wine,
  },
  segmentLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    textAlign: "center",
  },
  segmentLabelDone: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
  },
  segmentLabelActive: {
    color: stitchTokens.wine,
    fontWeight: "800",
  },
  heroBlock: {
    gap: 8,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroPillWine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.roseParchment,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.wine,
  },
  heroPillWineText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  heroPillSuccess: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  heroPillSuccessText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  heroAmountHighlight: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  heroTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    lineHeight: 21,
  },
  heroDesc: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 18,
  },
  heroActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  guidanceStrip: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 2,
  },
  guidanceTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  guidanceDesc: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 18,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 15,
    gap: 11,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  rowAlign: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusBadgeGreen: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.greenBorderSoft,
  },
  statusBadgeWarm: {
    backgroundColor: stitchTokens.goldLight,
    borderColor: stitchTokens.goldBorder,
  },
  statusBadgeDanger: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.redBorderSoft,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadgeTextGreen: {
    color: stitchTokens.likeNewGreen,
  },
  statusBadgeTextWarm: {
    color: stitchTokens.wineDark,
  },
  statusBadgeTextDanger: {
    color: stitchTokens.crimson,
  },
  priceTable: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  priceRowLabel: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
  },
  priceValueGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  priceStrike: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    textDecorationLine: "line-through",
  },
  priceRowValue: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  freeShipText: {
    color: stitchTokens.likeNewGreen,
  },
  mutedValue: {
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  priceDivider: {
    height: 1,
    backgroundColor: stitchTokens.cardBorder,
  },
  totalLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  totalValue: {
    fontSize: 16.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  feeNoteText: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
    lineHeight: 16,
  },
  editPriceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  editPriceText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  offerForm: {
    gap: 10,
    paddingTop: 4,
  },
  offerLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  quickPriceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  quickPricePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  quickPricePillActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseParchment,
  },
  quickPriceText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.deepCocoa,
  },
  quickPriceTextActive: {
    color: stitchTokens.wine,
    fontWeight: "800",
  },
  offerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offerInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  offerTextInput: {
    flex: 1,
    fontSize: 14,
    color: stitchTokens.darkWood,
    paddingVertical: 8,
  },
  offerCurrency: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  offerSendBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  offerSendBtnDisabled: {
    backgroundColor: stitchTokens.creamParchment,
  },
  offerSendBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  offerSendBtnTextDisabled: {
    color: stitchTokens.subtleGray,
  },
  cancelOfferBtn: {
    alignSelf: "center",
    paddingVertical: 4,
  },
  cancelOfferText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
    textDecorationLine: "underline",
  },
  destBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 3,
  },
  destName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  destAddress: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
    lineHeight: 19,
  },
  destExpiry: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
    marginTop: 2,
  },
  cardNoticeDesc: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
    lineHeight: 19,
  },
  addressList: {
    gap: 8,
  },
  addressOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  addressOptionActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: stitchTokens.borderWarm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioCircleActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  addressOptionBody: {
    flex: 1,
    gap: 2,
  },
  addressNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  addressName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  addressNameActive: {
    color: stitchTokens.wineDark,
  },
  addressPhone: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: stitchTokens.goldLight,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressDetail: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
  },
  proposalCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    padding: 15,
    gap: 10,
  },
  proposalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  proposalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  proposalBody: {
    fontSize: 13.5,
    color: stitchTokens.darkWood,
    lineHeight: 20,
  },
  proposalHighlight: {
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  proposalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  proposalSelfRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  proposalHelp: {
    flex: 1,
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  withdrawBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
  },
  withdrawText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  compactModeCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 13,
    gap: 10,
  },
  compactModeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  compactModeValue: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  modeSwitchRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  modeOptionActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  modeOptionText: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
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
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  requestExchangeText: {
    fontSize: 12.5,
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  historyChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  historyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  historyChipActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  historyChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  historyChipTextActive: {
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.8,
  },
});
