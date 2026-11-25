import React, { useState } from "react";
import { randomUUID } from "expo-crypto";
import { buyerSaleFeeText } from "@used-books/session-client";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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
    enabled: Boolean(currentUserId) && isBuyer && !isExchange && !room.orderId && room.status === "Active",
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
    } catch (e: any) {
      setQuoteError(
        e?.message ?? "Chưa gửi được địa chỉ và báo giá giao hàng. Vui lòng thử lại.",
      );
    } finally {
      setQuoteBusy(false);
    }
  };

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

  // Buyer pays order directly
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
          <View style={styles.rowAlign}>
            <View style={styles.sectionIconBox}>
              <Icon name="swap" size={15} color={stitchTokens.wine} />
            </View>
            <AppText style={styles.cardTitle}>Hình thức giao dịch</AppText>
          </View>
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
              <View style={styles.proposalDeclineBtn}>
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

      {/* 3. BẢNG GIÁ THỎA THUẬN (PRICE SUMMARY) HOẶC PHIẾU ĐỀ NGHỊ TRAO ĐỔI */}
      {isExchange ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.rowAlign}>
              <Icon name="book" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.cardTitle}>Phiếu đề nghị trao đổi sách</AppText>
            </View>
            <View
              style={[
                styles.modeTag,
                terms?.activeExchangeId
                  ? { backgroundColor: stitchTokens.likeNewGreenBg }
                  : { backgroundColor: stitchTokens.goldLight },
              ]}
            >
              <AppText
                style={[
                  styles.modeTagText,
                  terms?.activeExchangeId
                    ? { color: stitchTokens.likeNewGreen }
                    : { color: stitchTokens.wineDark },
                ]}
              >
                {terms?.activeExchangeId
                  ? "Đang thực hiện"
                  : terms?.exchangeIds?.length
                    ? "Đã kết thúc / Hoàn tất"
                    : "Chưa có phiếu"}
              </AppText>
            </View>
          </View>

          {(() => {
            const exchangeIds = terms?.exchangeIds ?? [];
            const latestExchangeId =
              terms?.activeExchangeId ??
              (exchangeIds.length > 0 ? exchangeIds[exchangeIds.length - 1] : null);

            if (!latestExchangeId) {
              return (
                <View style={{ gap: space.sm, marginTop: 4 }}>
                  <AppText style={styles.cardNoticeDesc}>
                    Hai bên đã thống nhất chuyển sang hình thức trao đổi sách hai chiều. Hãy mở phiếu đề nghị để chọn cuốn sách đối ứng và nhập thông tin giao nhận.
                  </AppText>
                  {!isLocked && (
                    <Button
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
              <View style={{ gap: space.sm, marginTop: 4 }}>
                <AppText style={styles.cardNoticeDesc}>
                  {terms?.activeExchangeId
                    ? "Phiếu trao đổi đang diễn ra. Bấm vào bên dưới để xem trạng thái vận chuyển, tải bằng chứng đóng gói hoặc xác nhận nhận sách."
                    : "Phiếu trao đổi trước đó đã hoàn tất hoặc được giải quyết. Bạn vẫn có thể xem lại toàn bộ chi tiết vận đơn và lịch sử phân xử bất cứ lúc nào."}
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
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <AppText kind="small" color={colors.muted}>
                      Lịch sử các lần đề nghị trao đổi ({exchangeIds.length}):
                    </AppText>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
                            style={({ pressed }) => [
                              {
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: radius.pill,
                                borderWidth: 1,
                                borderColor: isLatest
                                  ? stitchTokens.wineDark
                                  : colors.border,
                                backgroundColor: isLatest
                                  ? stitchTokens.roseWarmSurface
                                  : stitchTokens.parchment,
                              },
                              pressed && { opacity: 0.75 },
                            ]}
                          >
                            <AppText
                              kind="small"
                              style={{
                                fontWeight: isLatest ? "700" : "600",
                                color: isLatest ? stitchTokens.wineDark : colors.ink,
                              }}
                            >
                              {`Đề nghị lần ${idx + 1}${isLatest ? " (mới nhất)" : ""}`}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
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
              <AppText style={styles.cardTitle}>Giá sách giao dịch</AppText>
            </View>
            <View style={styles.freeShipPill}>
              <AppText style={styles.freeShipPillText}>Miễn phí ship</AppText>
            </View>
          </View>

          <View style={styles.priceHeroBanner}>
            <View style={styles.priceCol}>
              <AppText style={styles.priceHeroLabel}>Giá niêm yết</AppText>
              <AppText style={styles.priceHeroOriginal}>
                {formatVnd(listing?.salePrice ?? 0)}
              </AppText>
            </View>

            <View style={styles.priceHeroDivider} />

            <View style={styles.priceCol}>
              <AppText style={styles.priceHeroLabel}>Giá đã thống nhất</AppText>
              <AppText
                style={[
                  styles.priceHeroAgreed,
                  terms?.agreedPrice != null && styles.priceHeroAgreedDone,
                ]}
              >
                {terms?.agreedPrice != null
                  ? formatVnd(terms.agreedPrice)
                  : "Chưa chốt"}
              </AppText>
            </View>
          </View>

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
                      ? "Đề xuất lại mức giá mới"
                      : "Đề xuất giá thương lượng"}
                  </AppText>

                  {listing?.salePrice != null && listing.salePrice >= 20000 && (
                    <View style={styles.quickPriceRow}>
                      {[0.85, 0.9, 0.95, 1].map((ratio) => {
                        const preset = Math.max(
                          10000,
                          Math.round((listing.salePrice! * ratio) / 1000) * 1000,
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
                        placeholder="Nhập giá (VD: 100000)"
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
                          setError("Giá đề xuất phải từ 10.000 ₫ đến 1.000.000 ₫.");
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
                          (busy || !proposedPrice) && styles.offerSendBtnTextDisabled,
                        ]}
                      >
                        {busy ? "Đang gửi…" : "Gửi giá"}
                      </AppText>
                    </Pressable>
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
              <AppText style={styles.verifiedTagText}>
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
            <View style={styles.destFeeRow}>
              <AppText style={styles.destFeeLabel}>Cước giao nhận:</AppText>
              <AppText style={styles.destFeeValue}>
                {room.quotePreview.shippingFee > 0 ? formatVnd(room.quotePreview.shippingFee) : "Miễn phí"}
              </AppText>
            </View>
            {isBuyer && <AppText style={styles.destExpiry}>{buyerSaleFeeText(room.quotePreview.commissionBps)}</AppText>}
            <AppText style={styles.destExpiry}>
              Báo giá có hiệu lực đến:{" "}
              {formatDateTimeVi(room.quotePreview.expiresAt)}
            </AppText>
          </View>

          {isBuyer && quoteExpired && !room.orderId && !isLocked && (
            <View style={{ marginTop: space.sm, gap: space.xs }}>
              {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
              <Button
                wine
                secondary
                title={quoteBusy ? "Đang cập nhật…" : "Lấy lại báo giá giao hàng"}
                disabled={quoteBusy || !effectiveAddressId || !listing}
                busy={quoteBusy}
                onPress={() => void handleAttachQuote()}
              />
            </View>
          )}
        </View>
      ) : isBuyer && !isExchange && !room.orderId ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.rowAlign}>
              <View style={styles.sectionIconBox}>
                <Icon name="pin" size={15} color={stitchTokens.wine} />
              </View>
              <AppText style={styles.cardTitle}>
                Địa chỉ nhận sách & báo giá
              </AppText>
            </View>
          </View>
          <AppText style={styles.cardNoticeDesc}>
            Chọn địa chỉ nhận sách để lấy cước vận chuyển và gửi cho người bán tạo đơn hàng.
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
                        <Icon name="check" size={11} color={stitchTokens.gold} />
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
                  title={quoteBusy ? "Đang lấy báo giá…" : "Gửi địa chỉ & lấy báo giá ship"}
                  disabled={quoteBusy || !effectiveAddressId || !listing || isLocked}
                  busy={quoteBusy}
                  onPress={() => void handleAttachQuote()}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 4 }}>
              <Button
                wine
                secondary
                title="Thêm địa chỉ nhận sách"
                onPress={() => router.push("/addresses")}
              />
            </View>
          )}
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
                    wine
                    title={payBusy ? "Đang thanh toán…" : "Thanh toán ngay qua Ví"}
                    onPress={() => void handlePayOrder()}
                    disabled={payBusy}
                    busy={payBusy}
                  />
                </View>
                <View style={styles.viewOrderBtn}>
                  <Button
                    wine
                    secondary
                    title="Xem đơn hàng"
                    onPress={() =>
                      router.push({
                        pathname: "/orders",
                        params: { orderId: room.orderId! },
                      })
                    }
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
                  wine
                  secondary
                  title="Quản lý đơn hàng"
                  onPress={() =>
                    router.push({
                      pathname: "/orders",
                      params: { orderId: room.orderId! },
                    })
                  }
                />
              </View>
            </>
          )}
        </View>
      ) : isSeller && onOpenCreateOrder ? (
        <View style={styles.actionCard}>
          <AppText style={styles.actionCardTitle}>Sẵn sàng tạo đơn</AppText>
          <AppText style={styles.actionCardDesc}>
            Người mua đã gửi địa chỉ nhận sách. Bấm nút
            dưới để xác nhận giá và tạo đơn hàng.
          </AppText>
          <View style={styles.createOrderBtn}>
            <Button
              wine
              title="Tạo đơn cho người mua này"
              onPress={() => onOpenCreateOrder()}
            />
          </View>
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
    gap: 14,
    paddingBottom: space.xl * 2,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 12,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: stitchTokens.wineAlpha08,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  modeTag: {
    backgroundColor: stitchTokens.wineAlpha08,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  modeTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  freeShipPill: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  freeShipPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  modeSwitchRow: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: 2,
  },
  modeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.creamBg,
  },
  modeOptionActive: {
    borderColor: stitchTokens.wine,
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
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  requestExchangeText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  proposalCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    padding: 16,
    gap: space.xs,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
    fontSize: 16,
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
  priceHeroBanner: {
    flexDirection: "row",
    backgroundColor: stitchTokens.wine,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  priceCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  priceHeroDivider: {
    width: 1,
    height: 36,
    backgroundColor: stitchTokens.whiteAlpha20,
  },
  priceHeroLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.gold,
    opacity: 0.9,
  },
  priceHeroOriginal: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  priceHeroAgreed: {
    fontSize: 15,
    fontWeight: "600",
    color: stitchTokens.whiteAlpha70,
  },
  priceHeroAgreedDone: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.gold,
  },
  editPriceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: stitchTokens.wine,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  editPriceText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  offerForm: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  offerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  quickPriceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickPricePill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  quickPricePillActive: {
    backgroundColor: stitchTokens.wineAlpha08,
    borderColor: stitchTokens.wine,
  },
  quickPriceText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
  },
  quickPriceTextActive: {
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  offerInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  offerInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.creamBg,
    paddingHorizontal: 12,
  },
  offerTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    paddingVertical: 0,
  },
  offerCurrency: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginLeft: 4,
  },
  offerSendBtn: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  offerSendBtnDisabled: {
    backgroundColor: stitchTokens.cardBorder,
  },
  offerSendBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.gold,
  },
  offerSendBtnTextDisabled: {
    color: colors.muted,
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
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  verifiedTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  destBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    gap: 4,
  },
  destName: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  destAddress: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
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
  addressList: {
    gap: 8,
  },
  addressOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.creamBg,
  },
  addressOptionActive: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioCircleActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  addressOptionBody: {
    flex: 1,
    gap: 3,
  },
  addressNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  addressName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  addressNameActive: {
    color: stitchTokens.wineDark,
  },
  addressPhone: {
    fontSize: 12,
    color: colors.muted,
  },
  defaultBadge: {
    backgroundColor: stitchTokens.wineAlpha08,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressDetail: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  cardNoticeDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleCurrent: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  stepCircleCompleted: {
    backgroundColor: stitchTokens.verifiedGreen,
    borderColor: stitchTokens.verifiedGreen,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  stepNumberCurrent: {
    color: stitchTokens.gold,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  stepLabelActive: {
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: stitchTokens.cardBorder,
    marginBottom: 16,
  },
  guidanceBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  guidanceDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  orderCreatedCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    padding: 16,
    gap: space.xs,
  },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderCreatedTitle: {
    fontSize: 15,
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
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.wine,
    padding: 16,
    gap: space.xs,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  actionCardDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  createOrderBtn: {
    marginTop: space.xs,
  },
  pressed: {
    opacity: 0.8,
  },
});
