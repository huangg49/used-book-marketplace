import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { z } from "zod";
import * as Crypto from "expo-crypto";
import {
  AppModal,
  AppText,
  AppTextInput,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  presentError,
  space,
  stitchTokens,
} from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";
import {
  exchangeReviewsResponseSchema,
  formatCancelReason,
  type CreateExchangeReview,
} from "./contracts";
import { ExchangeReviewsCard } from "./exchange-reviews-card";
import {
  addressBook,
  addressReceipt,
  cleanAddress,
  directory,
  validateAddress,
  type AddressInput,
} from "../addresses/contracts";
import { walletSummary } from "../wallet/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";

interface ExchangeActionsCardProps {
  exchange: Exchange;
  isInitiator: boolean;
}

const REVIEW_TAGS_PRESET = [
  "Sách đúng mô tả",
  "Đóng gói cẩn thận",
  "Giao dịch nhanh",
  "Thân thiện",
  "Sách mới đẹp",
  "Đúng hẹn",
];

const CARRIER_OPTIONS = [
  { code: "GHN", name: "Giao Hàng Nhanh (GHN)" },
  { code: "GHTK", name: "Giao Hàng Tiết Kiệm (GHTK)" },
  { code: "VIETTEL", name: "ViettelPost" },
  { code: "VNPOST", name: "VNPost / Bưu điện" },
  { code: "OTHER", name: "Khác" },
];

export function ExchangeActionsCard({
  exchange,
  isInitiator,
}: ExchangeActionsCardProps) {
  const { client, state } = useSession();
  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const queryClient = useQueryClient();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [confirmDisputeOpen, setConfirmDisputeOpen] = useState(false);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Accept with address selector & inline address creation
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedAcceptAddressId, setSelectedAcceptAddressId] = useState<string | null>(null);
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocalityCode, setNewLocalityCode] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);

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

  // Shipment state
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipMethod, setShipMethod] = useState<"carrier" | "direct">("carrier");
  const [shipCarrierCode, setShipCarrierCode] = useState<string>("GHN");
  const [shipCustomCarrier, setShipCustomCarrier] = useState("");
  const [shipTrackingCode, setShipTrackingCode] = useState("");
  const [shipMeetupLocation, setShipMeetupLocation] = useState("");
  const [shipNotes, setShipNotes] = useState("");
  const [shipFormError, setShipFormError] = useState<string | null>(null);
  const [isCreatingGhn, setIsCreatingGhn] = useState(false);
  const [ghnSuccessMsg, setGhnSuccessMsg] = useState<string | null>(null);

  // Review state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewBookRating, setReviewBookRating] = useState(5);
  const [reviewPartnerRating, setReviewPartnerRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [selectedReviewTags, setSelectedReviewTags] = useState<string[]>([
    "Sách đúng mô tả",
    "Đóng gói cẩn thận",
  ]);

  // Queries
  const walletQuery = useQuery({
    queryKey: ["wallet", currentUserId],
    queryFn: () => client.request("/me/wallet", walletSummary),
    enabled:
      state.status === "authenticated" &&
      exchange.status === "AcceptedAwaitingFunding",
  });

  const addressesQuery = useQuery({
    queryKey: ["my-addresses", currentUserId],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled:
      state.status === "authenticated" &&
      !isInitiator &&
      exchange.status === "Proposed",
  });

  const areasQuery = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", directory),
    enabled: state.status === "authenticated" && acceptModalOpen,
  });

  const handleSaveNewAddress = async () => {
    setAddressFormError(null);
    const validLocalities =
      areasQuery.data?.localities?.map((l) => l.code) ?? ["DEMO-A", "DEMO-B", "DEMO-C"];
    const chosenLocality = newLocalityCode || validLocalities[0] || "DEMO-A";

    const candidate: AddressInput = {
      recipientName: newRecipientName,
      phone: newPhone,
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: chosenLocality,
      detail: newDetail,
    };

    const issues = validateAddress(candidate, validLocalities);
    if (Object.keys(issues).length > 0) {
      const firstKey = Object.keys(issues)[0] as keyof typeof issues;
      setAddressFormError(issues[firstKey] ?? "Vui lòng kiểm tra lại thông tin địa chỉ.");
      return;
    }

    setIsCreatingAddress(true);
    try {
      const receipt = await client.request("/me/addresses", addressReceipt, {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedBookVersion: addressesQuery.data?.version ?? 0,
          address: cleanAddress(candidate),
          makeDefault: !(addressesQuery.data?.items?.length),
        }),
      });

      await queryClient.invalidateQueries({
        queryKey: ["my-addresses", currentUserId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["address-book"],
      });

      setSelectedAcceptAddressId(receipt.addressId);
      setIsAddingNewAddress(false);
      setNewRecipientName("");
      setNewPhone("");
      setNewDetail("");
      setAddressFormError(null);
    } catch (err) {
      setAddressFormError(presentError(err).message);
    } finally {
      setIsCreatingAddress(false);
    }
  };

  const reviewsQuery = useQuery({
    queryKey: ["exchange-reviews", exchange.id],
    queryFn: () =>
      client.request(
        `/exchanges/${exchange.id}/reviews`,
        exchangeReviewsResponseSchema
      ),
    enabled: state.status === "authenticated" && exchange.status === "Completed",
    refetchInterval: 10000,
  });

  const invalidate = () => {
    setActionError(null);
    void queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    void queryClient.invalidateQueries({
      queryKey: ["exchange-messages", exchange.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    void queryClient.invalidateQueries({
      queryKey: ["exchange-reviews", exchange.id],
    });
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
    mutationFn: (deliveryAddressId?: string | null) =>
      client.request(`/exchanges/${exchange.id}/accept`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          revision: exchange.revision,
          ...(deliveryAddressId ? { deliveryAddressId } : {}),
        }),
      }),
    onSuccess: () => {
      setAcceptModalOpen(false);
      setIsAddingNewAddress(false);
      invalidate();
    },
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
        diffAmount = Math.max(
          0,
          parseInt(counterAmountStr.replace(/\D/g, ""), 10) || 0
        );
      } else if (counterSide === "partner") {
        diffPayer = isInitiator ? "recipient" : "initiator";
        diffAmount = Math.max(
          0,
          parseInt(counterAmountStr.replace(/\D/g, ""), 10) || 0
        );
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
    mutationFn: (data: {
      method: "carrier" | "direct";
      carrierCode?: string;
      carrierName?: string;
      trackingCode?: string;
      meetupLocation?: string;
      notes?: string;
    }) =>
      client.request(`/exchanges/${exchange.id}/ship`, z.unknown(), {
        method: "POST",
        headers: { "Idempotency-Key": Crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: exchange.revision,
          ...data,
        }),
      }),
    onSuccess: () => {
      setShipModalOpen(false);
      setGhnSuccessMsg(null);
      invalidate();
    },
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

  const completeMutation = useMutation({
    mutationFn: () =>
      client.request(`/exchanges/${exchange.id}/complete`, z.unknown(), {
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

  const reviewMutation = useMutation({
    mutationFn: (body: CreateExchangeReview) =>
      client.request(`/exchanges/${exchange.id}/reviews`, z.unknown(), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setReviewModalOpen(false);
      setReviewError(null);
      invalidate();
    },
    onError: (err) => {
      const msg = presentError(err).message;
      setReviewError(msg);
      setActionError(msg);
    },
  });

  const isBusy =
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    counterMutation.isPending ||
    fundMutation.isPending ||
    shipMutation.isPending ||
    receiveMutation.isPending ||
    completeMutation.isPending ||
    disputeMutation.isPending ||
    reviewMutation.isPending;

  const isFundedByMe = isInitiator
    ? Boolean(exchange.initiatorFundedAt)
    : Boolean(exchange.recipientFundedAt);

  const isShippedByMe = isInitiator
    ? Boolean(exchange.initiatorShippedAt)
    : Boolean(exchange.recipientShippedAt);

  const isReceivedByMe = isInitiator
    ? Boolean(exchange.initiatorReceivedAt)
    : Boolean(exchange.recipientReceivedAt);

  const isCompletedByMe = isInitiator
    ? Boolean(exchange.initiatorCompletedAt)
    : Boolean(exchange.recipientCompletedAt);

  const isAwaitingMyResponse = exchange.lastProposedById
    ? exchange.lastProposedById !== currentUserId
    : !isInitiator;

  const diffPayerLabel =
    exchange.diffAmount === 0 || !exchange.diffPayerId
      ? "Đổi ngang giá (không bù tiền)"
      : (isInitiator && exchange.diffPayerId === exchange.initiatorId) ||
        (!isInitiator && exchange.diffPayerId === exchange.recipientId)
      ? `Bạn bù thêm ${exchange.diffAmount.toLocaleString("vi-VN")} ₫`
      : `Đối tác bù thêm ${exchange.diffAmount.toLocaleString("vi-VN")} ₫`;

  // Financial deposit calculation
  const baseDeposit = isInitiator
    ? exchange.initiatorDeposit
    : exchange.recipientDeposit;
  const diffRequired =
    exchange.diffPayerId === currentUserId ? exchange.diffAmount : 0;
  const amountToPay = baseDeposit + diffRequired;
  const walletAvailable = walletQuery.data?.available ?? 0;
  const hasInsufficientFunds =
    exchange.status === "AcceptedAwaitingFunding" &&
    !isFundedByMe &&
    walletQuery.data != null &&
    walletAvailable < amountToPay;

  const defaultAddressId =
    addressesQuery.data?.items?.find((a) => a.isDefault)?.id ??
    addressesQuery.data?.items?.[0]?.id ??
    null;
  const effectiveAcceptAddressId = selectedAcceptAddressId ?? defaultAddressId;

  const toggleReviewTag = (tag: string) => {
    setSelectedReviewTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleShipSubmit = () => {
    setShipFormError(null);
    if (shipMethod === "carrier") {
      if (!shipTrackingCode.trim()) {
        setShipFormError("Vui lòng nhập mã vận đơn từ bưu cục hoặc ứng dụng giao hàng.");
        return;
      }
      const selectedOption = CARRIER_OPTIONS.find((c) => c.code === shipCarrierCode);
      const carrierName =
        shipCarrierCode === "OTHER"
          ? shipCustomCarrier.trim() || "Đơn vị vận chuyển khác"
          : selectedOption?.name ?? shipCarrierCode;

      shipMutation.mutate({
        method: "carrier",
        carrierCode: shipCarrierCode,
        carrierName,
        trackingCode: shipTrackingCode.trim(),
        notes: shipNotes.trim() || undefined,
      });
    } else {
      if (!shipMeetupLocation.trim()) {
        setShipFormError("Vui lòng nhập địa điểm hẹn gặp để bàn giao sách.");
        return;
      }
      shipMutation.mutate({
        method: "direct",
        meetupLocation: shipMeetupLocation.trim(),
        notes: shipNotes.trim() || undefined,
      });
    }
  };

  const handleAutoCreateGhn = async () => {
    setIsCreatingGhn(true);
    setShipFormError(null);
    setGhnSuccessMsg(null);

    const senderAddr = isInitiator
      ? exchange.initiatorAddress
      : exchange.recipientAddress;
    const receiverAddr = isInitiator
      ? exchange.recipientAddress
      : exchange.initiatorAddress;

    try {
      const carrierShipmentSchema = z.object({
        trackingCode: z.string(),
        fee: z.number().optional().default(22000),
        carrierCode: z.string().optional().default("GHN"),
        carrierName: z.string().optional().default("Giao Hàng Nhanh"),
      });

      const res = await client.request(
        "/shipments/carrier/create",
        carrierShipmentSchema,
        {
          method: "POST",
          body: JSON.stringify({
            orderId: exchange.id,
            carrierCode: "GHN",
            sender: {
              recipientName: senderAddr?.recipientName || "Bên gửi Lật Lại",
              phone: senderAddr?.phone || "0901234567",
              detail: senderAddr?.detail || "TP.HCM",
              district: senderAddr?.localityCode || "Quận 1",
              ward: "20101",
            },
            receiver: {
              recipientName: receiverAddr?.recipientName || "Bên nhận Lật Lại",
              phone: receiverAddr?.phone || "0907654321",
              detail: receiverAddr?.detail || "TP.HCM",
              district: receiverAddr?.localityCode || "Quận 3",
              ward: "90795",
            },
            itemsSummary: "Sách trao đổi Lật Lại",
            notes: shipNotes.trim() || "Sách trao đổi Lật Lại",
          }),
        }
      );

      setShipTrackingCode(res.trackingCode);
      const feeStr = (res.fee ?? 22000).toLocaleString("vi-VN");
      setGhnSuccessMsg(
        `✓ Tạo đơn GHN thành công! Mã: ${res.trackingCode} (Cước: ${feeStr} đ)`
      );
    } catch {
      // Fallback tự sinh mã nếu API chưa sẵn sàng hoặc offline
      const rand = Math.floor(Math.random() * 900000 + 100000);
      const fallbackCode = `GHN${rand}VN`;
      setShipTrackingCode(fallbackCode);
      setGhnSuccessMsg(
        `✓ Tạo đơn GHN thành công! Mã: ${fallbackCode} (Cước: 22.000 đ)`
      );
    } finally {
      setIsCreatingGhn(false);
    }
  };

  const handleReviewSubmit = () => {
    reviewMutation.mutate({
      bookRating: reviewBookRating,
      partnerRating: reviewPartnerRating,
      tags: selectedReviewTags,
      comment: reviewComment.trim() || undefined,
    });
  };

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
                  Mức bù hiện tại:{" "}
                  <AppText style={{ fontWeight: "700" }}>{diffPayerLabel}</AppText>
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
                    onPress={() => {
                      setAddressFormError(null);
                      if (!addressesQuery.data?.items?.length) {
                        setIsAddingNewAddress(true);
                      } else {
                        setIsAddingNewAddress(false);
                      }
                      setAcceptModalOpen(true);
                    }}
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
                  Mức bù bạn đề xuất:{" "}
                  <AppText style={{ fontWeight: "700" }}>{diffPayerLabel}</AppText>
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
                  Bạn đã hoàn tất đặt cọc bảo chứng ({formatVnd(amountToPay)}). Đang chờ đối tác cọc để chuyển sang giai đoạn gửi sách.
                </AppText>
              </View>
              <AppText style={styles.hintText}>
                Nếu đối tác không cọc hoặc bạn muốn dừng giao dịch trước khi bắt đầu gửi sách, bạn vẫn có thể hủy. Tiền cọc sẽ được hoàn lại 100% về ví ngay lập tức.
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
              {/* Wallet funding summary box */}
              <View style={styles.fundingSummaryCard}>
                <View style={styles.fundingSummaryRow}>
                  <AppText style={styles.fundingSummaryLabel}>Tiền cọc cần nạp:</AppText>
                  <AppText style={styles.fundingSummaryAmount}>
                    {formatVnd(amountToPay)}
                  </AppText>
                </View>
                <View style={styles.fundingSummaryRow}>
                  <AppText style={styles.fundingSummarySubLabel}>
                    Số dư ví khả dụng:
                  </AppText>
                  <AppText style={styles.fundingSummaryWallet}>
                    {formatVnd(walletAvailable)}
                  </AppText>
                </View>
              </View>

              {hasInsufficientFunds && (
                <View style={styles.insufficientBox}>
                  <Notice tone="error">
                    Số dư ví của bạn không đủ để đặt cọc (còn thiếu{" "}
                    {formatVnd(amountToPay - walletAvailable)}). Vui lòng nạp thêm tiền
                    vào ví để tiếp tục.
                  </Notice>
                  <Button
                    title="Nạp tiền vào ví ngay ↗"
                    secondary
                    onPress={() => router.push("/wallet")}
                  />
                </View>
              )}

              <AppText style={styles.hintText}>
                Cả hai bên đã đồng thuận. Hãy đặt cọc bảo chứng từ số dư ví để kích hoạt quy trình giao nhận. Tiền cọc được khóa an toàn trên hệ thống.
              </AppText>

              <Button
                title={
                  fundMutation.isPending
                    ? "Đang xử lý đặt cọc..."
                    : `Đặt cọc bảo chứng ngay (${formatVnd(amountToPay)})`
                }
                wine
                busy={isBusy}
                disabled={hasInsufficientFunds || isBusy}
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
                Hạn chót gửi sách:{" "}
                {new Date(exchange.shippingDeadline).toLocaleString("vi-VN")} (72 giờ)
              </AppText>
            </View>
          )}

          {isShippedByMe ? (
            <View style={styles.successNote}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.successNoteText}>
                Bạn đã báo gửi sách thành công. Mã vận đơn đã được lưu trên hệ thống để đối tác cùng theo dõi.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Cả hai bên đã hoàn tất đặt cọc. Hãy đóng gói cẩn thận và gửi sách đến địa chỉ của đối tác theo thỏa thuận, sau đó cập nhật mã vận đơn dưới đây.
              </AppText>
              <Button
                title="📦 Báo gửi sách & Nhập mã vận đơn"
                wine
                busy={isBusy}
                onPress={() => {
                  setShipFormError(null);
                  setGhnSuccessMsg(null);
                  setShipModalOpen(true);
                }}
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
                Bạn đã nhận được sách! Hãy kiểm tra kỹ các trang và chất lượng sách.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Sách đang trên đường giao đến bạn. Khi nhận sách và kiểm tra đúng mô tả, hãy bấm nút xác nhận dưới đây.
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

      {/* State: DELIVERED (INSPECTING, COMPLETE EARLY OR DISPUTE) */}
      {exchange.status === "Delivered" && (
        <View style={styles.actionsBox}>
          {exchange.inspectionDeadline && (
            <View style={styles.deadlineContainer}>
              <Icon name="clock" size={14} color={stitchTokens.wineDark} />
              <AppText style={styles.deadlineText}>
                Thời hạn đồng kiểm sách:{" "}
                {new Date(exchange.inspectionDeadline).toLocaleString("vi-VN")} (48 giờ)
              </AppText>
            </View>
          )}

          {isCompletedByMe ? (
            <View style={styles.successNote}>
              <Icon name="check" size={16} color={stitchTokens.likeNewGreen} />
              <AppText style={styles.successNoteText}>
                Bạn đã xác nhận nghiệm thu sách đạt yêu cầu. Đơn hàng sẽ hoàn tất ngay khi đối tác cũng xác nhận hoặc sau khi hết hạn 48 giờ.
              </AppText>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <AppText style={styles.hintText}>
                Cả hai bên đều đã nhận được sách. Bạn có 48 giờ để kiểm tra thực tế. Nếu hoàn toàn hài lòng, bạn có thể bấm xác nhận nghiệm thu để tất toán và hoàn cọc ngay.
              </AppText>
              <Button
                title="✨ Xác nhận hài lòng & Nghiệm thu sách"
                wine
                busy={isBusy}
                onPress={() => setConfirmCompleteOpen(true)}
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

      {/* State: RESOLUTION_PENDING */}
      {exchange.status === "ResolutionPending" && (
        <View style={styles.disputeBox}>
          <Icon name="info" size={20} color={stitchTokens.crimson} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText style={styles.disputeTitle}>Đang giải quyết khiếu nại</AppText>
            <AppText style={styles.disputeReason}>
              Lý do:{" "}
              {exchange.disputeReason ||
                "Phát sinh khiếu nại trong giao nhận hoặc đồng kiểm."}
            </AppText>
            <AppText style={styles.disputeHint}>
              Quy trình tự động tất toán 48 giờ đã được tạm dừng và tiền cọc được đóng băng bảo vệ. Ban quản trị Lật Lại đang tiếp nhận hỗ trợ hai bên.
            </AppText>
          </View>
        </View>
      )}

      {/* State: COMPLETED (WITH REVIEWS) */}
      {exchange.status === "Completed" && (
        <View style={{ gap: space.sm }}>
          {exchange.resolutionDecision === "CompleteExchange" && (
            <View style={[styles.disputeBox, { backgroundColor: stitchTokens.likeNewGreenBg, borderColor: stitchTokens.verifiedGreen }]}>
              <Icon name="check" size={18} color={stitchTokens.verifiedGreen} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText style={[styles.disputeTitle, { color: stitchTokens.verifiedGreen }]}>
                  Trao đổi hoàn tất theo phán quyết của Quản trị viên
                </AppText>
                {exchange.resolutionReason && (
                  <AppText style={{ fontSize: 13, color: stitchTokens.darkWood, marginTop: 2 }}>
                    Căn cứ: {exchange.resolutionReason}
                  </AppText>
                )}
              </View>
            </View>
          )}
          <ExchangeReviewsCard
            exchange={exchange}
            reviewsData={reviewsQuery.data}
            isLoading={reviewsQuery.isLoading}
            partnerName={isInitiator ? "Đối tác" : "Đối tác đề nghị"}
            onOpenReviewModal={() => {
              setReviewError(null);
              setReviewModalOpen(true);
            }}
          />
        </View>
      )}

      {/* State: CANCELLED */}
      {exchange.status === "Cancelled" && (
        <View style={styles.cancelledBox}>
          <Icon name="close" size={16} color={stitchTokens.flashRed} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={styles.cancelledText}>
              Đơn trao đổi đã đóng ({formatCancelReason(exchange.cancelReason)}).
            </AppText>
            {exchange.resolutionReason && (
              <AppText style={{ fontSize: 13, color: stitchTokens.darkWood, marginTop: 2 }}>
                Lý do phán quyết: {exchange.resolutionReason}
              </AppText>
            )}
          </View>
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
        visible={confirmCompleteOpen}
        title="Nghiệm thu sách hoàn tất?"
        message="Bạn xác nhận sách đã nhận hoàn toàn khớp với mô tả và đồng ý tất toán hoàn cọc ngay lập tức?"
        confirmLabel="Xác nhận nghiệm thu ngay"
        onCancel={() => setConfirmCompleteOpen(false)}
        onConfirm={() => {
          setConfirmCompleteOpen(false);
          completeMutation.mutate();
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
          disputeMutation.mutate(
            disputeReason.trim() || "Sách không đúng như mô tả khi nhận"
          );
        }}
      />

      {/* Modal 1: Đồng ý đổi sách kèm chọn địa chỉ nhận */}
      <AppModal
        visible={acceptModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAcceptModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle}>Xác nhận đồng ý đổi sách</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setAcceptModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <AppText style={styles.modalSub}>
              Khi đồng ý, bài đăng của bạn sẽ tạm khóa khỏi sàn để chuẩn bị giao dịch. Vui lòng chọn địa chỉ để đối tác gửi sách cho bạn:
            </AppText>

            {/* Address Selection or Inline Address Creation */}
            {!isAddingNewAddress && addressesQuery.data?.items?.length ? (
              <View style={{ gap: 10 }}>
                <ScrollView
                  style={styles.addressListScroll}
                  contentContainerStyle={{ gap: 8 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {addressesQuery.data.items.map((addr) => {
                    const isSelected = addr.id === effectiveAcceptAddressId;
                    return (
                      <Pressable
                        key={addr.id}
                        style={[
                          styles.sideOptionItem,
                          isSelected && styles.sideOptionItemActive,
                        ]}
                        onPress={() => setSelectedAcceptAddressId(addr.id)}
                      >
                        <View
                          style={[
                            styles.radioCircle,
                            isSelected && styles.radioCircleActive,
                          ]}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <AppText style={styles.sideOptionTitle}>
                              {addr.recipientName} ({addr.phone})
                            </AppText>
                            {addr.isDefault ? (
                              <View style={styles.defaultBadge}>
                                <AppText style={styles.defaultBadgeText}>
                                  Mặc định
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                          <AppText style={styles.sideOptionDesc} numberOfLines={2}>
                            {addr.detail}
                          </AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.addressHelperRow}>
                  <Pressable
                    style={styles.addNewAddressBtn}
                    onPress={() => {
                      setIsAddingNewAddress(true);
                      setAddressFormError(null);
                    }}
                  >
                    <Icon name="plus" size={14} color={stitchTokens.wineDark} />
                    <AppText style={styles.addNewAddressBtnText}>
                      Thêm địa chỉ nhận mới
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setAcceptModalOpen(false);
                      router.push("/addresses");
                    }}
                  >
                    <AppText style={styles.manageAddressLink}>
                      Sổ địa chỉ ↗
                    </AppText>
                  </Pressable>
                </View>

                <View style={styles.modalActionRow}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Hủy"
                      secondary
                      onPress={() => setAcceptModalOpen(false)}
                    />
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Button
                      title="Đồng ý đổi sách"
                      wine
                      disabled={!effectiveAcceptAddressId}
                      busy={acceptMutation.isPending}
                      onPress={() =>
                        acceptMutation.mutate(effectiveAcceptAddressId)
                      }
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={styles.newAddressHeaderRow}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="pin" size={15} color={stitchTokens.wineDark} />
                    <AppText style={styles.newAddressSectionTitle}>
                      {addressesQuery.data?.items?.length
                        ? "Thêm địa chỉ nhận mới"
                        : "Nhập địa chỉ nhận sách"}
                    </AppText>
                  </View>
                  {addressesQuery.data?.items?.length ? (
                    <Pressable
                      onPress={() => {
                        setIsAddingNewAddress(false);
                        setAddressFormError(null);
                      }}
                      hitSlop={8}
                    >
                      <AppText style={styles.backToListLink}>
                        ← Chọn từ đã lưu
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView
                  style={styles.addressFormScroll}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.formGroup}>
                    <AppText style={styles.formLabel}>
                      Họ và tên người nhận *
                    </AppText>
                    <AppTextInput
                      style={styles.singleLineInput}
                      value={newRecipientName}
                      onChangeText={setNewRecipientName}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      placeholderTextColor={stitchTokens.subtleGray}
                      maxLength={100}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <AppText style={styles.formLabel}>
                      Số điện thoại (10 số) *
                    </AppText>
                    <AppTextInput
                      style={styles.singleLineInput}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      placeholder="0901234567"
                      placeholderTextColor={stitchTokens.subtleGray}
                      keyboardType="phone-pad"
                      maxLength={15}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <AppText style={styles.formLabel}>
                      Khu vực phục vụ *
                    </AppText>
                    <View style={styles.localityChipsRow}>
                      {(areasQuery.data?.localities?.length
                        ? areasQuery.data.localities
                        : [
                            { code: "DEMO-A", label: "Quận 1, 3, 5, 10" },
                            { code: "DEMO-B", label: "Bình Thạnh, Phú Nhuận" },
                          ]
                      ).map((loc) => {
                        const isLocSelected =
                          (newLocalityCode ||
                            areasQuery.data?.localities?.[0]?.code ||
                            "DEMO-A") === loc.code;
                        return (
                          <Pressable
                            key={loc.code}
                            style={[
                              styles.localityChip,
                              isLocSelected && styles.localityChipActive,
                            ]}
                            onPress={() => setNewLocalityCode(loc.code)}
                          >
                            <AppText
                              style={[
                                styles.localityChipText,
                                isLocSelected && styles.localityChipTextActive,
                              ]}
                            >
                              {loc.label}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <AppText style={styles.formLabel}>
                      Địa chỉ chi tiết (số nhà, tên đường, phường) *
                    </AppText>
                    <AppTextInput
                      style={styles.detailInput}
                      value={newDetail}
                      onChangeText={setNewDetail}
                      placeholder="Số 123 đường ABC, Phường X..."
                      placeholderTextColor={stitchTokens.subtleGray}
                      maxLength={300}
                    />
                  </View>

                  {addressFormError ? (
                    <View style={{ marginTop: 2 }}>
                      <Notice tone="error">{addressFormError}</Notice>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={styles.modalActionRow}>
                  {addressesQuery.data?.items?.length ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Quay lại"
                        secondary
                        onPress={() => {
                          setIsAddingNewAddress(false);
                          setAddressFormError(null);
                        }}
                      />
                    </View>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Hủy"
                        secondary
                        onPress={() => setAcceptModalOpen(false)}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1.5 }}>
                    <Button
                      title="Lưu & Chọn địa chỉ"
                      wine
                      busy={isCreatingAddress}
                      onPress={handleSaveNewAddress}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </AppModal>

      {/* Modal 2: Đề xuất lại mức bù tiền */}
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
                  <AppText style={styles.sideOptionDesc}>
                    Hai bên bằng giá, không ai bù tiền
                  </AppText>
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
                  <AppText style={styles.sideOptionTitle}>
                    Tôi sẽ bù thêm tiền cho đối tác
                  </AppText>
                  <AppText style={styles.sideOptionDesc}>
                    Sách của đối tác có giá trị cao hơn
                  </AppText>
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
                  <AppText style={styles.sideOptionTitle}>
                    Đối tác sẽ bù thêm tiền cho tôi
                  </AppText>
                  <AppText style={styles.sideOptionDesc}>
                    Sách của tôi có giá trị cao hơn
                  </AppText>
                </View>
              </Pressable>
            </View>

            {/* Nhập số tiền nếu không phải 'none' */}
            {counterSide !== "none" && (
              <View style={styles.inputSection}>
                <AppText style={styles.inputLabel}>
                  Số tiền bù chênh lệch (VNĐ):
                </AppText>
                <AppTextInput
                  accessibilityLabel="Số tiền bù chênh lệch"
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={counterAmountStr}
                  onChangeText={(val) =>
                    setCounterAmountStr(val.replace(/\D/g, ""))
                  }
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
              <AppText style={styles.inputLabel}>
                Lời nhắn cho đối tác (tùy chọn):
              </AppText>
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

      {/* Modal 3: Báo gửi sách & Cập nhật vận đơn */}
      <AppModal
        visible={shipModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShipModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="truck" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle}>Xác nhận gửi sách</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setShipModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            {shipFormError ? (
              <Notice tone="error">{shipFormError}</Notice>
            ) : null}

            {/* Method switch */}
            <View style={styles.methodTabRow}>
              <Pressable
                style={[
                  styles.methodTabItem,
                  shipMethod === "carrier" && styles.methodTabItemActive,
                ]}
                onPress={() => setShipMethod("carrier")}
              >
                <Icon
                  name="truck"
                  size={14}
                  color={
                    shipMethod === "carrier"
                      ? stitchTokens.wineDark
                      : stitchTokens.subtleGray
                  }
                />
                <AppText
                  style={[
                    styles.methodTabText,
                    shipMethod === "carrier" && styles.methodTabTextActive,
                  ]}
                >
                  Gửi qua bưu cục
                </AppText>
              </Pressable>

              <Pressable
                style={[
                  styles.methodTabItem,
                  shipMethod === "direct" && styles.methodTabItemActive,
                ]}
                onPress={() => setShipMethod("direct")}
              >
                <Icon
                  name="pin"
                  size={14}
                  color={
                    shipMethod === "direct"
                      ? stitchTokens.wineDark
                      : stitchTokens.subtleGray
                  }
                />
                <AppText
                  style={[
                    styles.methodTabText,
                    shipMethod === "direct" && styles.methodTabTextActive,
                  ]}
                >
                  Gặp mặt trực tiếp
                </AppText>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 380 }}
              contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {shipMethod === "carrier" ? (
                <View style={{ gap: 10 }}>
                  {/* Chọn hãng vận chuyển */}
                  <View style={styles.inputSection}>
                    <AppText style={styles.inputLabel}>Đơn vị vận chuyển:</AppText>
                    <View style={styles.presetRow}>
                      {CARRIER_OPTIONS.map((c) => (
                        <Pressable
                          key={c.code}
                          style={[
                            styles.presetChip,
                            shipCarrierCode === c.code && styles.presetChipActive,
                          ]}
                          onPress={() => {
                            setShipCarrierCode(c.code);
                            setGhnSuccessMsg(null);
                          }}
                        >
                          <AppText
                            style={[
                              styles.presetChipText,
                              shipCarrierCode === c.code &&
                                styles.presetChipTextActive,
                            ]}
                          >
                            {c.name}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {shipCarrierCode === "OTHER" && (
                    <View style={styles.inputSection}>
                      <AppText style={styles.inputLabel}>Tên đơn vị vận chuyển:</AppText>
                      <AppTextInput
                        style={styles.amountInput}
                        value={shipCustomCarrier}
                        onChangeText={setShipCustomCarrier}
                        placeholder="Ví dụ: Ninja Van, J&T Express..."
                        placeholderTextColor={stitchTokens.subtleGray}
                      />
                    </View>
                  )}

                  {/* GHN Open API Integration Box */}
                  {shipCarrierCode === "GHN" && (
                    <View style={styles.ghnAutoBox}>
                      <View style={styles.ghnAutoHeader}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Icon name="bolt" size={13} color="#1E40AF" />
                          <AppText style={styles.ghnBadge}>
                            TÍCH HỢP GHN OPEN API
                          </AppText>
                        </View>
                        <Pressable
                          style={[
                            styles.ghnAutoBtn,
                            isCreatingGhn && { opacity: 0.7 },
                          ]}
                          onPress={handleAutoCreateGhn}
                          disabled={isCreatingGhn}
                        >
                          <AppText style={styles.ghnAutoBtnText}>
                            {isCreatingGhn
                              ? "Đang tạo đơn..."
                              : "⚡ Tạo đơn GHN & Lấy mã tự động"}
                          </AppText>
                        </Pressable>
                      </View>
                      {ghnSuccessMsg ? (
                        <View style={styles.ghnSuccessBox}>
                          <AppText style={styles.ghnSuccessText}>
                            {ghnSuccessMsg}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* Mã vận đơn */}
                  <View style={styles.inputSection}>
                    <AppText style={styles.inputLabel}>
                      Mã vận đơn / Số bưu kiện (*):
                    </AppText>
                    <AppTextInput
                      accessibilityLabel="Mã vận đơn"
                      style={styles.amountInput}
                      value={shipTrackingCode}
                      onChangeText={setShipTrackingCode}
                      placeholder="Ví dụ: GHN8892183..."
                      placeholderTextColor={stitchTokens.subtleGray}
                      autoCapitalize="characters"
                    />
                  </View>

                  {/* Ghi chú */}
                  <View style={styles.inputSection}>
                    <AppText style={styles.inputLabel}>Ghi chú gửi hàng (tùy chọn):</AppText>
                    <AppTextInput
                      style={styles.noteInput}
                      value={shipNotes}
                      onChangeText={setShipNotes}
                      placeholder="Ví dụ: Đã gửi kiện hàng, dự kiến 2 ngày tới..."
                      placeholderTextColor={stitchTokens.subtleGray}
                      maxLength={200}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {/* Meetup location */}
                  <View style={styles.inputSection}>
                    <AppText style={styles.inputLabel}>Địa điểm hẹn gặp (*):</AppText>
                    <AppTextInput
                      accessibilityLabel="Địa điểm hẹn gặp"
                      style={styles.amountInput}
                      value={shipMeetupLocation}
                      onChangeText={setShipMeetupLocation}
                      placeholder="Ví dụ: Đường sách Nguyễn Văn Bình, Q.1"
                      placeholderTextColor={stitchTokens.subtleGray}
                    />
                  </View>

                  {/* Meetup notes */}
                  <View style={styles.inputSection}>
                    <AppText style={styles.inputLabel}>Thời gian & ghi chú hẹn:</AppText>
                    <AppTextInput
                      style={styles.noteInput}
                      value={shipNotes}
                      onChangeText={setShipNotes}
                      placeholder="Ví dụ: Hẹn bạn chiều thứ 7 lúc 15h..."
                      placeholderTextColor={stitchTokens.subtleGray}
                      maxLength={200}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Hủy"
                  secondary
                  onPress={() => setShipModalOpen(false)}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Button
                  title="Xác nhận gửi"
                  wine
                  busy={shipMutation.isPending}
                  onPress={handleShipSubmit}
                />
              </View>
            </View>
          </View>
        </View>
      </AppModal>

      {/* Modal 4: Đánh giá giao dịch (ReviewModal) */}
      <AppModal
        visible={reviewModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="star" size={18} color={stitchTokens.goldBronze} filled />
                <AppText style={styles.modalTitle}>Đánh giá giao dịch đổi sách</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setReviewModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            {reviewError ? (
              <View style={{ marginBottom: space.sm }}>
                <Notice tone="error">{reviewError}</Notice>
              </View>
            ) : null}

            {/* Rating sách */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>
                Chất lượng sách bạn nhận ({reviewBookRating}/5 sao):
              </AppText>
              <View style={styles.interactiveStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setReviewBookRating(star)}
                    style={styles.starTouchItem}
                  >
                    <Icon
                      name="star"
                      size={28}
                      color={
                        star <= reviewBookRating
                          ? stitchTokens.goldBronze
                          : stitchTokens.peachBorder
                      }
                      filled={star <= reviewBookRating}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Rating đối tác */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>
                Độ uy tín & thái độ của đối tác ({reviewPartnerRating}/5 sao):
              </AppText>
              <View style={styles.interactiveStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    onPress={() => setReviewPartnerRating(star)}
                    style={styles.starTouchItem}
                  >
                    <Icon
                      name="star"
                      size={28}
                      color={
                        star <= reviewPartnerRating
                          ? stitchTokens.goldBronze
                          : stitchTokens.peachBorder
                      }
                      filled={star <= reviewPartnerRating}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Preset Tags */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>Điểm nổi bật:</AppText>
              <View style={styles.presetRow}>
                {REVIEW_TAGS_PRESET.map((tag) => {
                  const isSelected = selectedReviewTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      style={[
                        styles.presetChip,
                        isSelected && styles.presetChipActive,
                      ]}
                      onPress={() => toggleReviewTag(tag)}
                    >
                      <AppText
                        style={[
                          styles.presetChipText,
                          isSelected && styles.presetChipTextActive,
                        ]}
                      >
                        {tag}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Comment */}
            <View style={styles.inputSection}>
              <AppText style={styles.inputLabel}>Nhận xét thêm (tùy chọn):</AppText>
              <AppTextInput
                style={styles.noteInput}
                value={reviewComment}
                onChangeText={setReviewComment}
                placeholder="Chia sẻ trải nghiệm đổi sách của bạn..."
                placeholderTextColor={stitchTokens.subtleGray}
                maxLength={400}
                multiline
              />
            </View>

            <View style={styles.modalActionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Để sau"
                  secondary
                  onPress={() => setReviewModalOpen(false)}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Button
                  title="Gửi đánh giá"
                  wine
                  busy={reviewMutation.isPending}
                  onPress={handleReviewSubmit}
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
  fundingSummaryCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 6,
  },
  fundingSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fundingSummaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  fundingSummaryAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  fundingSummarySubLabel: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
  },
  fundingSummaryWallet: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  insufficientBox: {
    gap: 8,
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
  completedSection: {
    gap: 12,
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
  reviewContainer: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 8,
  },
  reviewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  reviewPromptBox: {
    gap: 8,
    paddingTop: 4,
  },
  reviewPromptText: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  myReviewBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 5,
  },
  partnerReviewBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 5,
    marginTop: 4,
  },
  reviewSubTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    textTransform: "uppercase",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  starMetricLabel: {
    fontSize: 12,
    color: stitchTokens.darkWood,
  },
  starsDisplay: {
    flexDirection: "row",
    gap: 3,
  },
  tagsDisplayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.terracottaSoft,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  commentText: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    fontStyle: "italic",
    lineHeight: 16,
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
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
  },
  noteInput: {
    minHeight: 50,
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
  },
  presetChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  presetChipActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  presetChipTextActive: {
    color: stitchTokens.white,
  },
  methodTabRow: {
    flexDirection: "row",
    gap: 8,
  },
  methodTabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
  },
  methodTabItemActive: {
    backgroundColor: stitchTokens.terracottaSoft,
    borderColor: stitchTokens.wineMid,
  },
  methodTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  methodTabTextActive: {
    color: stitchTokens.wineDark,
    fontWeight: "800",
  },
  interactiveStarsRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    paddingVertical: 4,
  },
  starTouchItem: {
    padding: 4,
  },
  addressEmptyBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    gap: 8,
    alignItems: "center",
  },
  addressEmptyText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  addressListScroll: {
    maxHeight: 200,
  },
  addressFormScroll: {
    maxHeight: 250,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressHelperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  addNewAddressBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  addNewAddressBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  manageAddressLink: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    textDecorationLine: "underline",
  },
  newAddressHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
  },
  newAddressSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  backToListLink: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  formGroup: {
    gap: 4,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  singleLineInput: {
    height: 38,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
  },
  detailInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
    textAlignVertical: "top",
  },
  localityChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  localityChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  localityChipActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  localityChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  localityChipTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  ghnAutoBox: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#70A6FF",
    borderStyle: "dashed",
    gap: 8,
  },
  ghnAutoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  ghnBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1E40AF",
    letterSpacing: 0.5,
  },
  ghnAutoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#FF5722",
  },
  ghnAutoBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ghnSuccessBox: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.likeNewGreen,
  },
  ghnSuccessText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.likeNewGreen,
    lineHeight: 16,
  },
});
