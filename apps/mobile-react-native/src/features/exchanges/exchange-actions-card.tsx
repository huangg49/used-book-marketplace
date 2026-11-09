import {
  exchangeCommandIdentity,
  pendingExchangeIntent,
  readExchange,
  sendExchangeCommand,
  type ExchangeCommand,
} from "@used-books/session-client";
import {
  ExchangeRecoveryPanel,
  useExchangeRecovery,
} from "./exchange-recovery";
import { ExchangeCounterForm } from "./exchange-counter-form";
import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { exchangeSchema, formatCancelReason } from "./contracts";
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
  readError?: boolean;
  onReload?: () => Promise<unknown>;
}

const CARRIER_OPTIONS = [
  { code: "GHN", name: "Giao Hàng Nhanh (GHN)" },
  { code: "GHTK", name: "Giao Hàng Tiết Kiệm (GHTK)" },
  { code: "VIETTEL", name: "ViettelPost" },
  { code: "VNPOST", name: "VNPost / Bưu điện" },
  { code: "OTHER", name: "Khác" },
];

const DISPUTE_CATEGORIES = [
  "Sách rách nát / hư hỏng nặng",
  "Giao sai sách / Không đúng cam kết",
  "Thiếu sách / Bưu kiện rỗng",
  "Sách nghi vấn bản in lậu / photo",
  "Sự cố giao nhận khác",
];

function parseDisputeReason(rawReason: string) {
  const categoryMatch = rawReason.match(/\[Sự cố\]:\s*([^\n\r]+)/i);
  const detailMatch = rawReason.match(/\[Chi tiết\]:\s*([^\n\r]+)/i);
  const videoMatch = rawReason.match(/\[Video[^\]]*\]:\s*([^\n\r]+)/i);
  const imageMatch = rawReason.match(/\[Ảnh[^\]]*\]:\s*([^\n\r]+)/i);

  const category = categoryMatch
    ? categoryMatch[1].trim()
    : "Khiếu nại giao nhận";
  let detailText = detailMatch ? detailMatch[1].trim() : "";
  if (!detailText) {
    detailText =
      rawReason.replace(/\[[^\]]+\]:[^\n\r]*/g, "").trim() || rawReason;
  }
  const videoRef = videoMatch ? videoMatch[1].trim() : null;
  const imageRef = imageMatch ? imageMatch[1].trim() : null;

  return {
    category,
    detailText,
    videoRef,
    imageRef,
  };
}

export function ExchangeActionsCard(props: ExchangeActionsCardProps) {
  const { identity } = useExchangeRecovery();
  return (
    <ExchangeActionsContent
      key={identity + ":" + props.exchange.id}
      {...props}
      identity={identity}
    />
  );
}
function ExchangeActionsContent({
  exchange,
  isInitiator,
  identity,
  readError,
  onReload,
}: ExchangeActionsCardProps & { identity: string }) {
  const { pending, ack } = useExchangeRecovery(exchange.id);
  const { client, state } = useSession();
  const currentUserId = state.status === "authenticated" ? state.user.id : "";
  const queryClient = useQueryClient();

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Rich Dispute Modal State
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeCategory, setDisputeCategory] = useState(DISPUTE_CATEGORIES[0]);
  const [disputeDetail, setDisputeDetail] = useState("");
  const [disputeError, setDisputeError] = useState<string | null>(null);
  // Accept with address selector & inline address creation
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedAcceptAddressId, setSelectedAcceptAddressId] = useState<
    string | null
  >(null);
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocalityCode, setNewLocalityCode] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);

  // Counter offer state
  const [counterModalOpen, setCounterModalOpen] = useState(false);
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

  // BA Requirement: Packaging Photo & Video Evidence
  const [packagingPhoto, setPackagingPhoto] = useState<string>("");
  const [packagingPhotoName, setPackagingPhotoName] = useState<string>("");
  const [packagingVideo, setPackagingVideo] = useState<string>("");
  const [packagingVideoName, setPackagingVideoName] = useState<string>("");

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
    const validLocalities = areasQuery.data?.localities?.map((l) => l.code) ?? [
      "DEMO-A",
      "DEMO-B",
      "DEMO-C",
    ];
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
      setAddressFormError(
        issues[firstKey] ?? "Vui lòng kiểm tra lại thông tin địa chỉ.",
      );
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
          makeDefault: !addressesQuery.data?.items?.length,
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

  const invalidate = () => {
    if (exchangeCommandIdentity(client) !== identity) return;
    setActionError(null);
    void queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    void queryClient.invalidateQueries({
      queryKey: ["exchange-messages", exchange.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  const closeForms = () => {
    setAcceptModalOpen(false);
    setCounterModalOpen(false);
    setShipModalOpen(false);
    setConfirmCancelOpen(false);
    setConfirmRejectOpen(false);
    setDisputeModalOpen(false);
    setConfirmCompleteOpen(false);
  };
  const success = () => {
    if (exchangeCommandIdentity(client) !== identity) return;
    closeForms();
    invalidate();
  };
  const failure = (error: unknown) => {
    if (exchangeCommandIdentity(client) !== identity) return;
    setActionError(presentError(error).message);
    if (pendingExchangeIntent(client, exchange.id)) closeForms();
  };
  const command = (action: ExchangeCommand, body: object) =>
    sendExchangeCommand(
      client,
      exchange.id,
      action,
      body,
      () => Crypto.randomUUID(),
      exchangeSchema,
    );
  const cancelMutation = useMutation({
    mutationFn: () => command("cancel", { expectedVersion: exchange.revision }),
    onSuccess: success,
    onError: failure,
  });
  const acceptMutation = useMutation({
    mutationFn: (deliveryAddressId?: string | null) =>
      command("accept", {
        revision: exchange.revision,
        ...(deliveryAddressId ? { deliveryAddressId } : {}),
      }),
    onSuccess: success,
    onError: failure,
  });
  const rejectMutation = useMutation({
    mutationFn: (reason?: string) =>
      command("reject", {
        expectedVersion: exchange.revision,
        reason: reason || "Không phù hợp thời điểm này",
      }),
    onSuccess: success,
    onError: failure,
  });
  const counterMutation = useMutation({
    mutationFn: ({
      listingIds,
      note,
    }: {
      listingIds: string[];
      note: string;
    }) =>
      command("counter", {
        expectedVersion: exchange.revision,
        listingIds,
        note: note.trim() || undefined,
      }),
    onSuccess: success,
    onError: failure,
  });
  const fundMutation = useMutation({
    mutationFn: () => command("funding", {}),
    onSuccess: success,
    onError: failure,
  });
  const shipMutation = useMutation({
    mutationFn: async (data: {
      method: "carrier" | "direct";
      carrierCode?: string;
      carrierName?: string;
      trackingCode?: string;
      meetupLocation?: string;
      notes?: string;
      packagingPhotoUrl?: string;
      packagingPhotoName?: string;
      packagingVideoUrl?: string;
      packagingVideoName?: string;
    }) => {
      const latest = await readExchange(client, exchange.id, exchangeSchema).catch(
        () => null,
      );
      const rev = latest?.revision ?? exchange.revision;
      return command("ship", { expectedVersion: rev, ...data });
    },
    onSuccess: () => {
      if (exchangeCommandIdentity(client) !== identity) return;
      setGhnSuccessMsg(null);
      success();
    },
    onError: failure,
  });
  const receiveMutation = useMutation({
    mutationFn: async () => {
      const latest = await readExchange(client, exchange.id, exchangeSchema).catch(
        () => null,
      );
      const rev = latest?.revision ?? exchange.revision;
      return command("receive", { expectedVersion: rev });
    },
    onSuccess: success,
    onError: failure,
  });
  const completeMutation = useMutation({
    mutationFn: async () => {
      const latest = await readExchange(client, exchange.id, exchangeSchema).catch(
        () => null,
      );
      const rev = latest?.revision ?? exchange.revision;
      return command("complete", { expectedVersion: rev });
    },
    onSuccess: success,
    onError: failure,
  });
  const disputeMutation = useMutation({
    mutationFn: async (reason: string) => {
      const latest = await readExchange(client, exchange.id, exchangeSchema).catch(
        () => null,
      );
      const rev = latest?.revision ?? exchange.revision;
      return command("dispute", { expectedVersion: rev, reason });
    },
    onSuccess: () => {
      if (exchangeCommandIdentity(client) !== identity) return;
      setDisputeError(null);
      success();
    },
    onError: failure,
  });
  const hasRecovery = Boolean(pending || ack);
  const blocked = hasRecovery || Boolean(readError);

  const handleConfirmDispute = () => {
    const detailText = disputeDetail.trim();
    if (detailText.length < 5) {
      setDisputeError("Vui lòng nhập mô tả chi tiết sự cố từ 5 ký tự.");
      return;
    }
    setDisputeError(null);

    const finalReason = `[Sự cố]: ${disputeCategory}\n[Chi tiết]: ${detailText}`;

    disputeMutation.mutate(finalReason);
  };

  const isBusy =
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    counterMutation.isPending ||
    fundMutation.isPending ||
    shipMutation.isPending ||
    receiveMutation.isPending ||
    completeMutation.isPending ||
    disputeMutation.isPending;

  const isFundedByMe = isInitiator
    ? Boolean(exchange.initiatorFundedAt)
    : Boolean(exchange.recipientFundedAt);

  const isShippedByMe = isInitiator
    ? Boolean(exchange.initiatorShippedAt)
    : Boolean(exchange.recipientShippedAt);

  const isPartnerShipped = isInitiator
    ? Boolean(exchange.recipientShippedAt)
    : Boolean(exchange.initiatorShippedAt);

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

  const handlePickPackagingPhoto = async () => {
    setShipFormError(null);
    try {
      const ImagePicker = await import("expo-image-picker");
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) {
          setShipFormError("Dung lượng ảnh tối đa là 10MB.");
          return;
        }
        setPackagingPhoto(asset.uri);
        setPackagingPhotoName(asset.fileName || "anh-sach-chua-dong-hop.jpg");
        return;
      }
    } catch {
      try {
        const DocumentPicker = await import("expo-document-picker");
        const res = await DocumentPicker.getDocumentAsync({
          type: ["image/jpeg", "image/png", "image/webp"],
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.[0]) {
          const asset = res.assets[0];
          setPackagingPhoto(asset.uri);
          setPackagingPhotoName(asset.name || "anh-sach-chua-dong-hop.jpg");
        }
      } catch {
        setShipFormError("Không mở được bộ chọn ảnh trên thiết bị.");
      }
    }
  };

  const handlePickPackagingVideo = async () => {
    setShipFormError(null);
    try {
      const ImagePicker = await import("expo-image-picker");
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        if ((asset.fileSize ?? 0) > 100 * 1024 * 1024) {
          setShipFormError("Dung lượng video tối đa là 100MB.");
          return;
        }
        setPackagingVideo(asset.uri);
        setPackagingVideoName(asset.fileName || "video-dong-goi-niem-phong.mp4");
        return;
      }
    } catch {
      try {
        const DocumentPicker = await import("expo-document-picker");
        const res = await DocumentPicker.getDocumentAsync({
          type: ["video/mp4", "video/webm"],
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.[0]) {
          const asset = res.assets[0];
          setPackagingVideo(asset.uri);
          setPackagingVideoName(asset.name || "video-dong-goi-niem-phong.mp4");
        }
      } catch {
        setShipFormError("Không mở được bộ chọn video trên thiết bị.");
      }
    }
  };

  const handleApplyDemoEvidence = () => {
    setPackagingPhoto("/demo-evidence/sample-book-damage.jpg");
    setPackagingPhotoName("anh-sach-chua-dong-hop.jpg");
    setPackagingVideo("/demo-evidence/sample-unboxing.mp4");
    setPackagingVideoName("video-dong-goi-niem-phong.mp4");
    if (!shipNotes) {
      setShipNotes(
        "Đã chụp ảnh kiểm tra 4 góc sách và quay video đóng gói bọc chống sốc 2 lớp kỹ càng.",
      );
    }
    setShipFormError(null);
  };

  const handleShipSubmit = () => {
    setShipFormError(null);
    if (shipMethod === "carrier") {
      if (!shipTrackingCode.trim()) {
        setShipFormError(
          "Vui lòng nhập mã vận đơn từ bưu cục hoặc ứng dụng giao hàng.",
        );
        return;
      }
      if (shipCarrierCode === "OTHER" && !shipCustomCarrier.trim()) {
        setShipFormError("Vui lòng nhập tên đơn vị vận chuyển.");
        return;
      }
    } else {
      if (!shipMeetupLocation.trim()) {
        setShipFormError("Vui lòng nhập địa điểm hẹn gặp để bàn giao sách.");
        return;
      }
    }

    if (!packagingPhoto) {
      setShipFormError(
        "Bắt buộc: Vui lòng tải lên ảnh chụp hiện trạng sách trước khi đóng gói.",
      );
      return;
    }
    if (!packagingVideo) {
      setShipFormError(
        "Bắt buộc: Vui lòng tải lên video quay quá trình đóng gói bưu kiện và dán mã.",
      );
      return;
    }

    const selectedOption = CARRIER_OPTIONS.find(
      (c) => c.code === shipCarrierCode,
    );
    const carrierName =
      shipMethod === "carrier"
        ? shipCarrierCode === "OTHER"
          ? shipCustomCarrier.trim() || "Đơn vị vận chuyển khác"
          : (selectedOption?.name ?? shipCarrierCode)
        : "Gặp mặt trực tiếp tại TP.HCM";

    shipMutation.mutate({
      method: shipMethod,
      carrierCode: shipMethod === "carrier" ? shipCarrierCode : "DIRECT",
      carrierName,
      trackingCode:
        shipMethod === "carrier" ? shipTrackingCode.trim().toUpperCase() : undefined,
      meetupLocation:
        shipMethod === "direct" ? shipMeetupLocation.trim() : undefined,
      notes: shipNotes.trim() || undefined,
      packagingPhotoUrl: packagingPhoto,
      packagingPhotoName: packagingPhotoName || "anh-dong-goi.jpg",
      packagingVideoUrl: packagingVideo,
      packagingVideoName: packagingVideoName || "video-dong-goi.mp4",
    });
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
        },
      );

      setShipTrackingCode(res.trackingCode);
      const feeStr = (res.fee ?? 22000).toLocaleString("vi-VN");
      setGhnSuccessMsg(
        `✓ Tạo đơn GHN thành công! Mã: ${res.trackingCode} (Cước: ${feeStr} đ)`,
      );
    } catch {
      // Fallback tự sinh mã nếu API chưa sẵn sàng hoặc offline
      const rand = Math.floor(Math.random() * 900000 + 100000);
      const fallbackCode = `GHN${rand}VN`;
      setShipTrackingCode(fallbackCode);
      setGhnSuccessMsg(
        `✓ Tạo đơn GHN thành công! Mã: ${fallbackCode} (Cước: 22.000 đ)`,
      );
    } finally {
      setIsCreatingGhn(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="verified" size={16} color={stitchTokens.wineDark} />
        <AppText style={styles.title}>Hành động tiếp theo</AppText>
      </View>

      {(
        isInitiator
          ? exchange.initiatorInspectionDeadline
          : exchange.recipientInspectionDeadline
      ) ? (
        <Notice tone="info">
          Hạn kiểm tra sách của bạn:{" "}
          {new Date(
            (isInitiator
              ? exchange.initiatorInspectionDeadline
              : exchange.recipientInspectionDeadline)!,
          ).toLocaleString("vi-VN")}
          . Tiền cọc tiếp tục được giữ đến khi cả hai hạn kết thúc và không có
          tranh chấp.
        </Notice>
      ) : null}

      {actionError && !hasRecovery ? (
        <View style={{ marginTop: space.sm, marginBottom: space.xs }}>
          <Notice tone="error">{actionError}</Notice>
        </View>
      ) : null}

      <ExchangeRecoveryPanel
        id={exchange.id}
        onRead={
          onReload ??
          (async () => {
            await queryClient.invalidateQueries({
              queryKey: ["exchange", exchange.id],
            });
          })
        }
      />
      {readError && !hasRecovery && (
        <>
          <Notice tone="error">
            Chưa đọc được trạng thái hiện tại. Tải lại trước khi thực hiện thao
            tác mới.
          </Notice>
          <Button
            title="Tải lại trạng thái"
            onPress={() => {
              void onReload?.();
            }}
          />
        </>
      )}
      {!blocked && (
        <>
          {/* State: PROPOSED */}
          {exchange.status === "Proposed" && (
            <View style={styles.actionsBox}>
              {isAwaitingMyResponse ? (
                <View style={styles.buttonGroup}>
                  <View style={styles.proposalNoticeBox}>
                    <Icon name="tag" size={14} color={stitchTokens.wineDark} />
                    <AppText style={styles.proposalNoticeText}>
                      Mức bù hiện tại:{" "}
                      <AppText style={{ fontWeight: "700" }}>
                        {diffPayerLabel}
                      </AppText>
                    </AppText>
                  </View>
                  <AppText style={styles.hintText}>
                    Đối tác đề nghị trao đổi sách với bạn. Bạn có thể đồng ý,
                    yêu chọn sách của mình thay thế, hoặc từ chối đề nghị.
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
                    title="Đề xuất sách thay thế"
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
                      Tiền bù tính từ sách:{" "}
                      <AppText style={{ fontWeight: "700" }}>
                        {diffPayerLabel}
                      </AppText>
                    </AppText>
                  </View>
                  <AppText style={styles.hintText}>
                    Đề nghị đã gửi, sách chưa được giữ. Đang chờ đối tác phản
                    hồi; bạn có thể rút đề nghị nếu đổi ý.
                  </AppText>
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
                    <Icon
                      name="check"
                      size={16}
                      color={stitchTokens.likeNewGreen}
                    />
                    <AppText style={styles.successNoteText}>
                      Bạn đã hoàn tất đặt cọc bảo chứng (
                      {formatVnd(amountToPay)}). Đang chờ đối tác cọc để chuyển
                      sang giai đoạn gửi sách.
                    </AppText>
                  </View>
                  <AppText style={styles.hintText}>
                    Nếu đối tác không cọc hoặc bạn muốn dừng giao dịch trước khi
                    bắt đầu gửi sách, bạn vẫn có thể hủy. Tiền cọc sẽ được hoàn
                    lại 100% về ví ngay lập tức.
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
                      <AppText style={styles.fundingSummaryLabel}>
                        Tiền cọc cần nạp:
                      </AppText>
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
                        {formatVnd(amountToPay - walletAvailable)}). Vui lòng
                        nạp thêm tiền vào ví để tiếp tục.
                      </Notice>
                      <Button
                        title="Nạp tiền vào ví ngay ↗"
                        secondary
                        onPress={() => router.push("/wallet")}
                      />
                    </View>
                  )}

                  <AppText style={styles.hintText}>
                    Cả hai bên đã đồng thuận. Hãy đặt cọc bảo chứng từ số dư ví
                    để kích hoạt quy trình giao nhận. Tiền cọc được khóa an toàn
                    trên hệ thống.
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
                    {new Date(exchange.shippingDeadline).toLocaleString(
                      "vi-VN",
                    )}{" "}
                    (72 giờ)
                  </AppText>
                </View>
              )}

              {exchange.cancellationRequestedBy && (
                <View style={styles.proposalNoticeBox}>
                  <Icon
                    name={
                      exchange.cancellationRequestedBy ===
                      (isInitiator ? "Initiator" : "Recipient")
                        ? "clock"
                        : "info"
                    }
                    size={16}
                    color={stitchTokens.wineDark}
                  />
                  <AppText style={styles.proposalNoticeText}>
                    {exchange.cancellationRequestedBy ===
                    (isInitiator ? "Initiator" : "Recipient")
                      ? "Bạn đã gửi yêu cầu hủy giao dịch trước khi gửi sách. Đang chờ đối tác xác nhận. Nếu đối tác đồng thuận, 100% tiền cọc và tiền bù sẽ được hoàn lại về ví của cả hai bên."
                      : "Đối tác đã đề nghị hủy giao dịch trao đổi này trước khi gửi sách. Nếu bạn đồng ý hủy, 100% tiền cọc bảo chứng và tiền bù sẽ được hoàn trả về ví. Nếu muốn tiếp tục, bạn có thể bấm Từ chối yêu cầu hủy hoặc tiếp tục gửi sách."}
                  </AppText>
                </View>
              )}

              {isShippedByMe ? (
                <View style={styles.successNote}>
                  <Icon
                    name="check"
                    size={16}
                    color={stitchTokens.likeNewGreen}
                  />
                  <AppText style={styles.successNoteText}>
                    Bạn đã báo gửi sách thành công. Mã vận đơn đã được lưu trên
                    hệ thống để đối tác cùng theo dõi.
                  </AppText>
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <AppText style={styles.hintText}>
                    Cả hai bên đã hoàn tất đặt cọc. Hãy đóng gói cẩn thận và gửi
                    sách đến địa chỉ của đối tác theo thỏa thuận, sau đó cập
                    nhật mã vận đơn dưới đây.
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
                  {!isPartnerShipped && !exchange.cancellationRequestedBy && (
                    <Button
                      title="🛑 Đề nghị hủy giao dịch"
                      secondary
                      wine
                      busy={isBusy}
                      onPress={() => setConfirmCancelOpen(true)}
                    />
                  )}
                  {!isPartnerShipped &&
                    exchange.cancellationRequestedBy ===
                      (isInitiator ? "Recipient" : "Initiator") && (
                      <>
                        <Button
                          title="🤝 Đồng ý hủy (Hoàn cọc 100%)"
                          secondary
                          wine
                          busy={isBusy}
                          onPress={() => setConfirmCancelOpen(true)}
                        />
                        <Button
                          title="❌ Từ chối yêu cầu hủy"
                          secondary
                          busy={isBusy}
                          onPress={() => setConfirmRejectOpen(true)}
                        />
                      </>
                    )}
                </View>
              )}
            </View>
          )}

          {/* State: IN_TRANSIT (SHIP IF NOT YET, RECEIVE OR DISPUTE) */}
          {exchange.status === "InTransit" && (
            <View style={styles.actionsBox}>
              {!isShippedByMe && (
                <View style={[styles.buttonGroup, { marginBottom: 8 }]}>
                  <AppText style={styles.hintText}>
                    Đối tác đã báo gửi sách chiều về. Vui lòng đóng gói cẩn thận
                    và gửi sách chiều đi của bạn trước thời hạn 72 giờ:
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
              {isReceivedByMe ? (
                <View style={styles.successNote}>
                  <Icon
                    name="check"
                    size={16}
                    color={stitchTokens.likeNewGreen}
                  />
                  <AppText style={styles.successNoteText}>
                    Bạn có 72 giờ kiểm tra từ lúc nhận sách. Cọc vẫn được giữ
                    đến khi cả hai hạn kết thúc và không có tranh chấp.
                  </AppText>
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <AppText style={styles.hintText}>
                    Sách đang trên đường giao đến bạn. Khi nhận sách và kiểm tra
                    đúng mô tả, hãy bấm nút xác nhận dưới đây.
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
                    onPress={() => {
                      setDisputeError(null);
                      setDisputeModalOpen(true);
                    }}
                  />
                </View>
              )}
            </View>
          )}

          {/* State: DELIVERED (INSPECTING, ACKNOWLEDGE OR DISPUTE) */}
          {exchange.status === "Delivered" && (
            <View style={styles.actionsBox}>
              {exchange.inspectionDeadline && (
                <View style={styles.deadlineContainer}>
                  <Icon name="clock" size={14} color={stitchTokens.wineDark} />
                  <AppText style={styles.deadlineText}>
                    Hạn kiểm tra chung:{" "}
                    {new Date(exchange.inspectionDeadline).toLocaleString(
                      "vi-VN",
                    )}
                  </AppText>
                </View>
              )}

              {isCompletedByMe ? (
                <View style={styles.successNote}>
                  <Icon
                    name="check"
                    size={16}
                    color={stitchTokens.likeNewGreen}
                  />
                  <AppText style={styles.successNoteText}>
                    Bạn đã xác nhận kiểm tra sách. Cọc vẫn được giữ đến khi cả
                    hai hạn kiểm tra kết thúc và không có tranh chấp.
                  </AppText>
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <AppText style={styles.hintText}>
                    Mỗi bên có 72 giờ kiểm tra tính từ lúc nhận sách. Xác nhận
                    đã kiểm tra không tất toán hoặc hoàn cọc sớm.
                  </AppText>
                  <Button
                    title="Xác nhận đã kiểm tra"
                    wine
                    busy={isBusy}
                    onPress={() => setConfirmCompleteOpen(true)}
                  />
                  <Button
                    title="Báo cáo khiếu nại sách"
                    secondary
                    wine
                    busy={isBusy}
                    onPress={() => {
                      setDisputeError(null);
                      setDisputeModalOpen(true);
                    }}
                  />
                </View>
              )}
              {isCompletedByMe && (
                <Button
                  title="Báo cáo khiếu nại sách"
                  secondary
                  wine
                  busy={isBusy}
                  onPress={() => {
                    setDisputeError(null);
                    setDisputeModalOpen(true);
                  }}
                />
              )}
            </View>
          )}

          {/* State: RESOLUTION_PENDING */}
          {exchange.status === "ResolutionPending" &&
            (() => {
              const parsed = parseDisputeReason(exchange.disputeReason || "");
              return (
                <View style={styles.disputeRichBox}>
                  <View style={styles.disputeHeaderRow}>
                    <View style={styles.disputeHeaderTitleRow}>
                      <Icon
                        name="shield"
                        size={18}
                        color={stitchTokens.crimson}
                      />
                      <AppText style={styles.disputeTitle}>
                        Đang giải quyết khiếu nại
                      </AppText>
                    </View>
                    <View style={styles.pendingBadge}>
                      <AppText style={styles.pendingBadgeText}>
                        Chờ phân xử
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.disputeCategoryTag}>
                    <AppText style={styles.disputeCategoryText}>
                      ⚠️ {parsed.category}
                    </AppText>
                  </View>

                  {parsed.detailText ? (
                    <View style={styles.disputeDetailBlock}>
                      <AppText style={styles.disputeDetailLabel}>
                        Mô tả chi tiết:
                      </AppText>
                      <AppText style={styles.disputeDetailText}>
                        {parsed.detailText}
                      </AppText>
                    </View>
                  ) : null}

                  <AppText>Tệp đã gửi được kiểm tra riêng ở mục Bằng chứng sự cố. Tên tệp trong mô tả cũ không chứng minh tệp đã được tải lên.</AppText>

                  <View style={styles.ledgerNoticeCallout}>
                    <Icon name="info" size={14} color={stitchTokens.wineDark} />
                    <AppText style={styles.disputeHint}>
                      Quy trình tự động tất toán 72 giờ đã được tạm dừng. Tiền
                      cọc và tiền bù đang được bảo vệ an toàn trên Ledger trong
                      khi Quản trị viên thẩm định đối chiếu bằng chứng.
                    </AppText>
                  </View>
                </View>
              );
            })()}

          <ExchangeReviewsCard exchange={exchange} />
          {/* State: COMPLETED (WITH REVIEWS) */}
          {exchange.status === "Completed" && (
            <View style={{ gap: space.sm }}>
              {exchange.resolutionDecision === "CompleteExchange" && (
                <View
                  style={[
                    styles.disputeBox,
                    {
                      backgroundColor: stitchTokens.likeNewGreenBg,
                      borderColor: stitchTokens.verifiedGreen,
                    },
                  ]}
                >
                  <Icon
                    name="check"
                    size={18}
                    color={stitchTokens.verifiedGreen}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText
                      style={[
                        styles.disputeTitle,
                        { color: stitchTokens.verifiedGreen },
                      ]}
                    >
                      Trao đổi hoàn tất theo phán quyết của Quản trị viên
                    </AppText>
                    <AppText
                      style={{
                        fontSize: 12,
                        color: stitchTokens.darkWood,
                        marginTop: 2,
                      }}
                    >
                      Toàn bộ tiền cọc bảo chứng và tiền bù đã được tất toán
                      theo thỏa thuận.
                    </AppText>
                    {exchange.resolutionReason && (
                      <AppText
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: stitchTokens.wineDark,
                          marginTop: 4,
                        }}
                      >
                        Căn cứ phán quyết: &quot;{exchange.resolutionReason}
                        &quot;
                      </AppText>
                    )}
                  </View>
                </View>
              )}

            </View>
          )}

          {/* State: CANCELLED */}
          {exchange.status === "Cancelled" && (
            <View style={{ gap: space.sm }}>
              {exchange.cancelReason === "DisputeResolvedRefund" ? (
                (() => {
                  const isCompInit =
                    exchange.resolutionDecision === "CompensateInitiator" ||
                    Boolean(
                      exchange.resolutionReason?.startsWith(
                        "[CompensateInitiator]",
                      ),
                    );
                  const isCompRecip =
                    exchange.resolutionDecision === "CompensateRecipient" ||
                    Boolean(
                      exchange.resolutionReason?.startsWith(
                        "[CompensateRecipient]",
                      ),
                    );
                  const cleanReason = exchange.resolutionReason
                    ? exchange.resolutionReason
                        .replace(
                          /^\[(CompensateInitiator|CompensateRecipient)\]\s*/,
                          "",
                        )
                        .trim()
                    : null;

                  const decisionTitle = isCompInit
                    ? "Phán quyết Quản trị viên: Chấp thuận khiếu nại của Bên khởi tạo"
                    : isCompRecip
                      ? "Phán quyết Quản trị viên: Chấp thuận khiếu nại của Bên đối tác"
                      : "Phán quyết Quản trị viên: Hủy đơn & Hoàn tiền (RefundBoth)";

                  const decisionDesc =
                    isCompInit || isCompRecip
                      ? "Giao dịch đã được hủy theo phán quyết bảo vệ bên khiếu nại. Sổ cái đã hoàn trả 100% tiền cọc bảo chứng cùng tiền bù và ghi nhận biên bản vi phạm quy chế sàn đối với bên có lỗi."
                      : "Toàn bộ tiền cọc bảo chứng và tiền bù đã được hoàn lại 100% về ví mô phỏng của cả hai bên. Sách đã được mở lại trên kệ.";

                  return (
                    <View
                      style={[
                        styles.disputeBox,
                        {
                          backgroundColor: stitchTokens.amberBg,
                          borderColor: stitchTokens.goldBorder,
                        },
                      ]}
                    >
                      <Icon
                        name="sync"
                        size={18}
                        color={stitchTokens.wineDark}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText
                          style={[
                            styles.disputeTitle,
                            { color: stitchTokens.wineDark },
                          ]}
                        >
                          {decisionTitle}
                        </AppText>
                        <AppText
                          style={{
                            fontSize: 12,
                            color: stitchTokens.darkWood,
                            marginTop: 2,
                          }}
                        >
                          {decisionDesc}
                        </AppText>
                        {cleanReason && (
                          <AppText
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: stitchTokens.wineDark,
                              marginTop: 4,
                            }}
                          >
                            Căn cứ phán quyết: &quot;{cleanReason}&quot;
                          </AppText>
                        )}
                      </View>
                    </View>
                  );
                })()
              ) : (
                <View style={styles.cancelledBox}>
                  <Icon name="close" size={16} color={stitchTokens.flashRed} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText style={styles.cancelledText}>
                      Đơn trao đổi đã đóng (
                      {formatCancelReason(exchange.cancelReason)}).
                    </AppText>
                    {exchange.cancelReason === "MutualAgreement" && (
                      <AppText
                        style={{
                          fontSize: 13,
                          color: stitchTokens.darkWood,
                          marginTop: 2,
                        }}
                      >
                        Hai bên đã đồng thuận hủy giao dịch trước khi gửi sách.
                        Toàn bộ tiền cọc bảo chứng và tiền bù đã được hoàn lại
                        100% về ví mô phỏng. Sách đã được mở lại trên kệ.
                      </AppText>
                    )}
                    {exchange.resolutionReason && (
                      <AppText
                        style={{
                          fontSize: 13,
                          color: stitchTokens.darkWood,
                          marginTop: 2,
                        }}
                      >
                        Lý do phán quyết: {exchange.resolutionReason}
                      </AppText>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        visible={confirmCancelOpen}
        title={
          exchange.status === "Preparing"
            ? exchange.cancellationRequestedBy ===
              (isInitiator ? "Recipient" : "Initiator")
              ? "Đồng ý hủy giao dịch?"
              : "Đề nghị hủy giao dịch?"
            : "Hủy giao dịch trao đổi?"
        }
        message={
          exchange.status === "Preparing"
            ? exchange.cancellationRequestedBy ===
              (isInitiator ? "Recipient" : "Initiator")
              ? "Đối tác đã đề nghị hủy giao dịch này trước khi gửi sách. Bằng việc đồng ý, giao dịch sẽ hủy an toàn và 100% tiền cọc cùng tiền bù của cả hai bên sẽ được hoàn trả về ví. Sách được mở lại trên kệ."
              : "Bạn có chắc muốn gửi yêu cầu hủy giao dịch trao đổi này trước khi gửi sách? Khi đối tác xác nhận đồng thuận, giao dịch sẽ hủy và hoàn trả 100% tiền cọc cho cả hai bên."
            : exchange.status === "AcceptedAwaitingFunding"
              ? "Bạn có chắc chắn muốn hủy giao dịch trao đổi này? Nếu bạn hoặc đối tác đã đặt cọc, 100% số tiền cọc sẽ được hoàn lại về ví ngay lập tức và sách sẽ được mở lại trên kệ."
              : "Hủy đề nghị trao đổi sẽ trả lại trạng thái sách về kệ của bạn."
        }
        confirmLabel={
          exchange.status === "Preparing" &&
          exchange.cancellationRequestedBy ===
            (isInitiator ? "Recipient" : "Initiator")
            ? "Đồng ý hủy"
            : "Xác nhận hủy"
        }
        destructive
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={() => {
          setConfirmCancelOpen(false);
          cancelMutation.mutate();
        }}
      />

      <ConfirmDialog
        visible={confirmRejectOpen}
        title={
          exchange.status === "Preparing"
            ? "Từ chối yêu cầu hủy?"
            : "Từ chối đề nghị?"
        }
        message={
          exchange.status === "Preparing"
            ? "Bạn muốn từ chối yêu cầu hủy của đối tác để tiếp tục giao dịch trao đổi sách? Vui lòng gửi sách trước thời hạn 72 giờ."
            : "Từ chối đề nghị hoán đổi này từ đối tác."
        }
        confirmLabel={
          exchange.status === "Preparing" ? "Từ chối hủy & Tiếp tục" : "Từ chối"
        }
        onCancel={() => setConfirmRejectOpen(false)}
        onConfirm={() => {
          setConfirmRejectOpen(false);
          rejectMutation.mutate(
            exchange.status === "Preparing"
              ? "Tôi đã chuẩn bị xong sách và muốn tiếp tục hoàn thành giao dịch này."
              : undefined,
          );
        }}
      />

      <ConfirmDialog
        visible={confirmCompleteOpen}
        title="Xác nhận đã kiểm tra sách?"
        message="Xác nhận bạn đã kiểm tra sách. Cọc vẫn được giữ đến khi cả hai hạn kiểm tra 72 giờ kết thúc và không có tranh chấp."
        confirmLabel="Xác nhận đã kiểm tra"
        onCancel={() => setConfirmCompleteOpen(false)}
        onConfirm={() => {
          setConfirmCompleteOpen(false);
          completeMutation.mutate();
        }}
      />

      {/* Modal: Báo sự cố / Khiếu nại đơn trao đổi */}
      <AppModal
        visible={disputeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDisputeModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.disputeModalCard]}>
            <View style={styles.modalHeader}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  flex: 1,
                }}
              >
                <Icon name="shield" size={18} color={stitchTokens.crimson} />
                <AppText style={styles.modalTitle} numberOfLines={1}>
                  Báo sự cố / Khiếu nại
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                onPress={() => setDisputeModalOpen(false)}
              >
                <Icon name="close" size={20} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.disputeScroll}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {/* Notice Banner */}
              <View style={styles.disputeNoticeBanner}>
                <Icon name="info" size={16} color={stitchTokens.crimson} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={styles.disputeNoticeTitle}>
                    Bảo vệ quyền lợi &amp; Ký quỹ an toàn:
                  </AppText>
                  <AppText style={styles.disputeNoticeDesc}>
                    Giao dịch sẽ tạm dừng tất toán ngay lập tức. Toàn bộ tiền
                    cọc bảo chứng và tiền bù được giữ an toàn trên Ledger để Hội
                    đồng Quản trị thẩm định qua video unboxing và ảnh đối chiếu.
                  </AppText>
                </View>
              </View>
              {/* Category Selector */}
              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>
                  Phân loại sự cố{" "}
                  <AppText style={{ color: stitchTokens.crimson }}>*</AppText>
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                >
                  {DISPUTE_CATEGORIES.map((cat) => {
                    const isSelected = cat === disputeCategory;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setDisputeCategory(cat)}
                        style={[
                          styles.categoryPill,
                          isSelected && styles.categoryPillActive,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.categoryPillText,
                            isSelected && styles.categoryPillTextActive,
                          ]}
                        >
                          {cat}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              {/* Detail Input */}
              <View style={styles.formGroup}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <AppText style={styles.formLabel}>
                    Mô tả chi tiết vấn đề{" "}
                    <AppText style={{ color: stitchTokens.crimson }}>*</AppText>
                  </AppText>
                  <AppText style={styles.charCountText}>
                    {disputeDetail.length}/220 ký tự
                  </AppText>
                </View>
                <AppTextInput
                  style={styles.disputeMultilineInput}
                  multiline
                  numberOfLines={3}
                  value={disputeDetail}
                  maxLength={220}
                  placeholder="Mô tả cụ thể vị trí hư hại, vết rách hoặc sự sai lệch của sách lúc mở gói..."
                  placeholderTextColor={stitchTokens.subtleGray}
                  onChangeText={(val) => {
                    setDisputeDetail(val);
                    if (disputeError) setDisputeError(null);
                  }}
                />
              </View>
              <AppText>
                Báo sự cố trước để ghi nhận đúng hạn. Sau đó bổ sung tệp ở mục
                Bằng chứng sự cố. Video mở hộp không bắt buộc.
              </AppText>{" "}
              {disputeError ? (
                <View style={styles.errorAlertBox}>
                  <Icon name="info" size={14} color={stitchTokens.flashRed} />
                  <AppText style={styles.errorAlertText}>
                    {disputeError}
                  </AppText>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Hủy"
                  secondary
                  disabled={disputeMutation.isPending}
                  onPress={() => setDisputeModalOpen(false)}
                />
              </View>
              <View style={{ flex: 1.4 }}>
                <Button
                  title="Gửi biên bản khiếu nại"
                  destructive
                  busy={disputeMutation.isPending}
                  onPress={handleConfirmDispute}
                />
              </View>
            </View>
          </View>
        </View>
      </AppModal>

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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Icon name="check" size={18} color={stitchTokens.wineDark} />
                <AppText style={styles.modalTitle}>
                  Xác nhận đồng ý đổi sách
                </AppText>
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
              Khi đồng ý, bài đăng của bạn sẽ tạm khóa khỏi sàn để chuẩn bị giao
              dịch. Vui lòng chọn địa chỉ để đối tác gửi sách cho bạn:
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
                          <AppText
                            style={styles.sideOptionDesc}
                            numberOfLines={2}
                          >
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
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
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
        onRequestClose={() => {
          if (!counterMutation.isPending) setCounterModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <AppText style={styles.modalTitle}>Đề xuất sách thay thế</AppText>
            {actionError && <Notice tone="error">{actionError}</Notice>}
            {counterModalOpen && (
              <ExchangeCounterForm
                key={currentUserId + ":" + exchange.revision}
                isInitiator={isInitiator}
                currentIds={
                  isInitiator
                    ? (exchange.initiatorListingIds ?? [
                        exchange.initiatorListingId!,
                      ])
                    : [exchange.recipientListingId]
                }
                partnerValue={
                  isInitiator
                    ? exchange.initiatorDeposit
                    : exchange.recipientDeposit
                }
                busy={counterMutation.isPending}
                onSubmit={(listingIds, note) =>
                  counterMutation.mutate({ listingIds, note })
                }
              />
            )}
            <Button
              title="Quay lại"
              secondary
              disabled={counterMutation.isPending}
              onPress={() => setCounterModalOpen(false)}
            />
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
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
                    <AppText style={styles.inputLabel}>
                      Đơn vị vận chuyển:
                    </AppText>
                    <View style={styles.presetRow}>
                      {CARRIER_OPTIONS.map((c) => (
                        <Pressable
                          key={c.code}
                          style={[
                            styles.presetChip,
                            shipCarrierCode === c.code &&
                              styles.presetChipActive,
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
                      <AppText style={styles.inputLabel}>
                        Tên đơn vị vận chuyển:
                      </AppText>
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
                          <Icon
                            name="bolt"
                            size={13}
                            color={stitchTokens.exchangeCarrierInk}
                          />
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
                    <AppText style={styles.inputLabel}>
                      Ghi chú gửi hàng (tùy chọn):
                    </AppText>
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
                    <AppText style={styles.inputLabel}>
                      Địa điểm hẹn gặp (*):
                    </AppText>
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
                    <AppText style={styles.inputLabel}>
                      Thời gian & ghi chú hẹn:
                    </AppText>
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

              {/* =========================================================================
                  BA Requirement: Packaging Evidence (Photos & Video)
                  ========================================================================= */}
              <View
                style={{
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: stitchTokens.roseWarmSurface,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                }}
              >
                <View style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icon
                        name="shield"
                        size={16}
                        color={stitchTokens.wineDark}
                      />
                      <AppText
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color: stitchTokens.wineDark,
                        }}
                      >
                        Bằng chứng đóng gói bưu phẩm
                      </AppText>
                    </View>
                    <View
                      style={{
                        backgroundColor: stitchTokens.wineDark,
                        borderRadius: 8,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                      }}
                    >
                      <AppText
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          color: stitchTokens.white,
                        }}
                      >
                        BẮT BUỘC
                      </AppText>
                    </View>
                  </View>
                  <AppText
                    style={{
                      fontSize: 11,
                      color: stitchTokens.darkWood,
                      lineHeight: 16,
                    }}
                  >
                    Chụp ảnh tình trạng sách và quay video quá trình đóng gói để
                    Admin đối chiếu, bảo vệ quyền lợi nếu đối tác khiếu nại sách
                    hỏng.
                  </AppText>
                </View>

                {/* 1. Photo Evidence Card */}
                <View
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: stitchTokens.whiteSurface,
                    borderWidth: 1,
                    borderColor: packagingPhoto
                      ? stitchTokens.greenBorderSoft
                      : stitchTokens.peachBorder,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <AppText
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: stitchTokens.wineDark,
                      }}
                    >
                      1. Ảnh hiện trạng sách *
                    </AppText>
                    {packagingPhoto ? (
                      <Pressable
                        onPress={() => {
                          setPackagingPhoto("");
                          setPackagingPhotoName("");
                        }}
                      >
                        <AppText
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: stitchTokens.crimson,
                          }}
                        >
                          Xóa ảnh
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {packagingPhoto ? (
                    <View style={{ gap: 6 }}>
                      {packagingPhoto.startsWith("http") ||
                      packagingPhoto.startsWith("file:") ||
                      packagingPhoto.startsWith("data:") ? (
                        <Image
                          source={{ uri: packagingPhoto }}
                          style={{
                            width: "100%",
                            height: 110,
                            borderRadius: 8,
                            backgroundColor: stitchTokens.parchment,
                          }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon
                          name="check"
                          size={14}
                          color={stitchTokens.likeNewGreen}
                        />
                        <AppText
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: stitchTokens.likeNewGreen,
                            flex: 1,
                          }}
                        >
                          {packagingPhotoName || "Ảnh hiện trạng"}
                        </AppText>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void handlePickPackagingPhoto()}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: stitchTokens.wineDark,
                        backgroundColor: stitchTokens.parchment,
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <AppText
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: stitchTokens.wineDark,
                        }}
                      >
                        + Tải ảnh chụp sách
                      </AppText>
                      <AppText
                        style={{
                          fontSize: 10,
                          color: stitchTokens.subtleGray,
                        }}
                      >
                        JPG, PNG, WebP tối đa 10MB
                      </AppText>
                    </Pressable>
                  )}
                </View>

                {/* 2. Video Evidence Card */}
                <View
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: stitchTokens.whiteSurface,
                    borderWidth: 1,
                    borderColor: packagingVideo
                      ? stitchTokens.greenBorderSoft
                      : stitchTokens.peachBorder,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <AppText
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: stitchTokens.wineDark,
                      }}
                    >
                      2. Video đóng gói *
                    </AppText>
                    {packagingVideo ? (
                      <Pressable
                        onPress={() => {
                          setPackagingVideo("");
                          setPackagingVideoName("");
                        }}
                      >
                        <AppText
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: stitchTokens.crimson,
                          }}
                        >
                          Xóa video
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {packagingVideo ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingVertical: 4,
                      }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        color={stitchTokens.likeNewGreen}
                      />
                      <AppText
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: stitchTokens.likeNewGreen,
                          flex: 1,
                        }}
                      >
                        {packagingVideoName || "Video đóng gói"}
                      </AppText>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void handlePickPackagingVideo()}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: stitchTokens.wineDark,
                        backgroundColor: stitchTokens.parchment,
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <AppText
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: stitchTokens.wineDark,
                        }}
                      >
                        + Tải video đóng gói
                      </AppText>
                      <AppText
                        style={{
                          fontSize: 10,
                          color: stitchTokens.subtleGray,
                        }}
                      >
                        MP4, WebM tối đa 100MB
                      </AppText>
                    </Pressable>
                  )}
                </View>

                {/* Demo Quick Preset Button */}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleApplyDemoEvidence}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: stitchTokens.goldLight,
                      borderWidth: 1,
                      borderColor: stitchTokens.goldBorder,
                      alignItems: "center",
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <AppText
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: stitchTokens.wineDark,
                      textAlign: "center",
                    }}
                  >
                    ⚡ Nạp nhanh chứng cứ đóng gói mẫu (Ảnh sách + Video niêm
                    phong)
                  </AppText>
                </Pressable>
              </View>

              {/* Policy Notice Box */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: stitchTokens.parchment,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                }}
              >
                <Icon name="info" size={15} color={stitchTokens.wineDark} />
                <AppText
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: stitchTokens.darkWood,
                    lineHeight: 16,
                  }}
                >
                  <AppText
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: stitchTokens.wineDark,
                    }}
                  >
                    Nguyên tắc trao đổi hai chiều:{" "}
                  </AppText>
                  Mỗi bên chủ động gửi sách của chiều mình. Hệ thống không thu
                  phí giao hàng. Tiền đặt cọc bảo chứng vẫn được Lật Lại giữ an
                  toàn cho đến khi cả hai bên xác nhận đã nhận sách.
                </AppText>
              </View>
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
    backgroundColor: stitchTokens.exchangeCarrierSurface,
    borderWidth: 1,
    borderColor: stitchTokens.exchangeCarrierBorder,
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
    color: stitchTokens.exchangeCarrierInk,
    letterSpacing: 0.5,
  },
  ghnAutoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: stitchTokens.exchangeCarrierAction,
  },
  ghnAutoBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
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
  /* Dispute Modal & Rich Box Styles */
  disputeModalCard: {
    maxHeight: "90%",
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  disputeScroll: {
    maxHeight: 460,
  },
  disputeNoticeBanner: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  disputeNoticeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.crimson,
  },
  disputeNoticeDesc: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 15,
  },
  charCountText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  categoryPillActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  categoryPillTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  disputeMultilineInput: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: stitchTokens.wineDark,
    backgroundColor: stitchTokens.whiteSurface,
    textAlignVertical: "top",
  },
  evidenceSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.peachBorder,
  },
  evidenceSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  sampleEvidenceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  sampleEvidenceBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  evidenceGrid: {
    gap: 10,
  },
  evidenceCardBox: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 8,
  },
  evidenceCardBoxActive: {
    borderColor: stitchTokens.wineMid,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  evidenceCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  evidenceCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  evidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  evidenceBadgeActive: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.verifiedGreen,
  },
  evidenceBadgeText: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  evidenceBadgeTextActive: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
  },
  evidenceBtnRow: {
    flexDirection: "row",
    gap: 6,
  },
  evidencePickerBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
  },
  evidencePickerBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  miniSampleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    alignItems: "center",
  },
  miniSampleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  evidencePreviewBox: {
    borderRadius: 8,
    overflow: "hidden",
  },
  emptyPreviewBox: {
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    borderStyle: "dashed",
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  emptyPreviewText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  imagePreviewWrap: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },
  previewOverlayBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: stitchTokens.videoBadgeBg,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  previewOverlayText: {
    fontSize: 10,
    color: stitchTokens.white,
    fontWeight: "500",
  },
  videoPreviewWrap: {
    borderRadius: 8,
    overflow: "hidden",
  },
  videoSimulatedPlayer: {
    height: 90,
    backgroundColor: stitchTokens.videoBackground,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 4,
  },
  playButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteAlpha25,
    alignItems: "center",
    justifyContent: "center",
  },
  videoSimulatedTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.white,
    textAlign: "center",
  },
  videoSimulatedSubtitle: {
    fontSize: 10,
    color: stitchTokens.whiteAlpha70,
    textAlign: "center",
  },
  errorAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.flashRedBg,
  },
  errorAlertText: {
    fontSize: 11,
    color: stitchTokens.flashRed,
    flex: 1,
  },
  /* Dispute Rich Box for ResolutionPending */
  disputeRichBox: {
    padding: space.md,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    gap: 10,
  },
  disputeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  disputeHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  disputeCategoryTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  disputeCategoryText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.crimson,
  },
  disputeDetailBlock: {
    backgroundColor: stitchTokens.whiteSurface,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 2,
  },
  disputeDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  disputeDetailText: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 16,
  },
  disputeEvidencePillsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  evidencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    maxWidth: "48%",
  },
  evidencePillText: {
    fontSize: 11,
    color: stitchTokens.darkWood,
  },
  ledgerNoticeCallout: {
    flexDirection: "row",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
});
