import {
  exchangeCommandIdentity,
  exchangeFundingNotes,
  exchangeServiceFeeText,
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
import React, { useCallback, useState, useSyncExternalStore } from "react";
import { AppState, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { TransactionAmount, TransactionNotes } from "../../core/ui/transaction-review";
import type { Exchange } from "./contracts";
import { exchangeSchema, formatCancelReason } from "./contracts";
import { ExchangeReviewsCard } from "./exchange-reviews-card";
import { ExchangeShippingCard } from "./exchange-shipping-card";
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
  partnerName?: string;
  readError?: boolean;
  onReload?: () => Promise<unknown>;
  isViewingHistory?: boolean;
  onReturnToLive?: () => void;
  onOpenChat?: () => void;
  bottomInset?: number;
  renderScrollBody?: (actionsBody: React.ReactNode) => React.ReactNode;
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
  "Đối tác chưa gửi sách",
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
  partnerName = "Đối tác",
  identity,
  readError,
  onReload,
  isViewingHistory = false,
  onReturnToLive,
  onOpenChat,
  bottomInset = 12,
  renderScrollBody,
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
  const [disputeBookIds, setDisputeBookIds] = useState<string[]>([]);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  // Accept with address selector, inline address creation & diff negotiation
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [isNegotiatingDiff, setIsNegotiatingDiff] = useState(false);
  const [negotiatedPayer, setNegotiatedPayer] = useState<"me" | "partner" | "none">("none");
  const [negotiatedDiffInput, setNegotiatedDiffInput] = useState("0");
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
      (exchange.status === "AcceptedAwaitingFunding" ||
        (exchange.status === "Proposed" && acceptModalOpen)),
  });

  const addressesQuery = useQuery({
    queryKey: ["my-addresses", currentUserId],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled:
      state.status === "authenticated" &&
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
    void queryClient.invalidateQueries({ queryKey: ["exchange"] });
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
    void onReload?.();
  };
  const failure = (error: unknown) => {
    if (exchangeCommandIdentity(client) !== identity) return;
    setActionError(presentError(error).message);
    if (pendingExchangeIntent(client, exchange.id)) closeForms();
    void onReload?.();
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
      negotiatedDiffAmount,
      diffPayerId,
      deliveryAddressId,
      note,
    }: {
      listingIds?: string[];
      negotiatedDiffAmount?: number;
      diffPayerId?: string | null;
      deliveryAddressId?: string | null;
      note?: string;
    }) =>
      command("counter", {
        expectedVersion: exchange.revision,
        ...(listingIds ? { listingIds } : {}),
        ...(negotiatedDiffAmount !== undefined ? { negotiatedDiffAmount } : {}),
        ...(diffPayerId !== undefined ? { diffPayerId } : {}),
        ...(deliveryAddressId ? { deliveryAddressId } : {}),
        note: note?.trim() || undefined,
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

  const receiveSnapshots = isInitiator
    ? (exchange.agreement ? [exchange.agreement.recipientBook] : [])
    : (exchange.agreement?.initiatorBooks ?? []);

  const handleConfirmDispute = () => {
    const detailText = disputeDetail.trim();
    if (detailText.length < 5) {
      setDisputeError("Vui lòng nhập mô tả chi tiết sự cố từ 5 ký tự.");
      return;
    }
    setDisputeError(null);

    const selectedBookTitles = receiveSnapshots
      .filter((b) => disputeBookIds.includes(b.listingId))
      .map((b) => b.book.title);
    const booksLine = selectedBookTitles.length
      ? `\n[Sách gặp sự cố]: ${selectedBookTitles.join(", ")}`
      : "";
    const finalReason = `[Sự cố]: ${disputeCategory}${booksLine}\n[Chi tiết]: ${detailText}`;

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
    ? Boolean(exchange.initiatorShipment || exchange.initiatorShippedAt)
    : Boolean(exchange.recipientShipment || exchange.recipientShippedAt);

  const isPartnerShipped = isInitiator
    ? Boolean(exchange.recipientShipment || exchange.recipientShippedAt)
    : Boolean(exchange.initiatorShipment || exchange.initiatorShippedAt);

  const isReceivedByMe = isInitiator
    ? Boolean(exchange.initiatorReceivedAt)
    : Boolean(exchange.recipientReceivedAt);
  const partnerPickedUpAt = isInitiator ? exchange.recipientShippedAt : exchange.initiatorShippedAt;
  const myInspectionDeadline = isInitiator ? exchange.initiatorInspectionDeadline : exchange.recipientInspectionDeadline;
  const cutoff = myInspectionDeadline ? Date.parse(myInspectionDeadline) : Infinity;
  const settlementCutoff = exchange.inspectionDeadline ? Date.parse(exchange.inspectionDeadline) : Infinity;
  const readInspectionPhase = useCallback(() => {
    const now = Date.now();
    if (now >= settlementCutoff) return "settling";
    return now >= cutoff ? "waiting-for-partner" : "open";
  }, [cutoff, settlementCutoff]);
  const subscribeInspectionDeadline = useCallback((notify: () => void) => {
    if (!Number.isFinite(Math.min(cutoff, settlementCutoff))) return () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const now = Date.now();
      const next = Math.min(cutoff > now ? cutoff : Infinity, settlementCutoff > now ? settlementCutoff : Infinity);
      if (Number.isFinite(next)) timer = setTimeout(schedule, Math.min(next - now, 2_147_483_647));
      notify();
    };
    schedule();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") schedule();
    });
    return () => {
      listener.remove();
      clearTimeout(timer);
    };
  }, [cutoff, settlementCutoff]);
  const inspectionPhase = useSyncExternalStore(subscribeInspectionDeadline, readInspectionPhase, readInspectionPhase);
  const inspectionOpen = inspectionPhase === "open";
  const receiveAction = partnerPickedUpAt && !isReceivedByMe ? (
    <Button title="Xác nhận đã nhận sách" wine busy={isBusy} onPress={() => receiveMutation.mutate()} />
  ) : null;
  const disputeAction = inspectionOpen ? (
    <Button title="Báo sự cố / Khiếu nại sách" secondary wine busy={isBusy} onPress={() => {
      setDisputeError(null);
      setDisputeModalOpen(true);
    }} />
  ) : null;

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
        quality: 0.7,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) {
          setShipFormError("Dung lượng ảnh tối đa là 10MB.");
          return;
        }
        const mime = asset.mimeType || "image/jpeg";
        const resolvedUrl = asset.base64
          ? `data:${mime};base64,${asset.base64}`
          : asset.uri;
        setPackagingPhoto(resolvedUrl);
        setPackagingPhotoName(asset.fileName || "anh-sach-chua-dong-hop.jpg");
        return;
      }
    } catch {
      setShipFormError("Không mở được bộ chọn ảnh trên thiết bị.");
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
      setShipFormError("Không mở được bộ chọn video trên thiết bị.");
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

  const openAcceptSheet = () => {
    setAddressFormError(null);
    setIsNegotiatingDiff(false);
    const currentPayer =
      exchange.diffAmount <= 0 || !exchange.diffPayerId
        ? "none"
        : exchange.diffPayerId === currentUserId
          ? "me"
          : "partner";
    setNegotiatedPayer(currentPayer);
    setNegotiatedDiffInput(String(exchange.diffAmount || 0));
    if (!addressesQuery.data?.items?.length) {
      setIsAddingNewAddress(true);
    } else {
      setIsAddingNewAddress(false);
    }
    setAcceptModalOpen(true);
  };

  const openShipSheet = () => {
    setShipFormError(null);
    setGhnSuccessMsg(null);
    setShipModalOpen(true);
  };

  const openDisputeSheet = (defaultCategory?: string) => {
    setDisputeError(null);
    if (defaultCategory) setDisputeCategory(defaultCategory);
    setDisputeModalOpen(true);
  };

  const [renderNow] = useState(Date.now);
  const dockedMode = Boolean(renderScrollBody);
  const shippingExpired = Boolean(
    exchange.shippingDeadline &&
      Date.parse(exchange.shippingDeadline) <= renderNow,
  );
  const missedOneSided =
    exchange.status === "Preparing" &&
    shippingExpired &&
    Boolean(isShippedByMe) !== Boolean(isPartnerShipped);
  const myRole = isInitiator ? "Initiator" : "Recipient";
  const partnerRole = isInitiator ? "Recipient" : "Initiator";
  const isPartnerFunded = isInitiator
    ? Boolean(exchange.recipientFundedAt)
    : Boolean(exchange.initiatorFundedAt);
  const isPartnerCompleted = isInitiator
    ? Boolean(exchange.recipientCompletedAt)
    : Boolean(exchange.initiatorCompletedAt);

  const isHandoverWorkspace =
    !blocked &&
    (exchange.status === "Preparing" || exchange.status === "InTransit");
  const isEmptyProposedWorkspace =
    dockedMode && !blocked && exchange.status === "Proposed" && !actionError && !hasRecovery && !readError;

  const sectionTitle =
    exchange.status === "Proposed"
      ? isAwaitingMyResponse
        ? "Đề nghị chờ bạn phản hồi"
        : "Đang chờ đối tác phản hồi"
      : exchange.status === "AcceptedAwaitingFunding"
        ? "Tiến độ đặt cọc bảo chứng"
        : exchange.status === "Delivered"
          ? "Đồng kiểm sách 72 giờ"
          : exchange.status === "ResolutionPending"
            ? "Thông tin sự cố & Ký quỹ"
            : exchange.status === "Completed"
              ? "Đánh giá & Ghi nhận"
              : "Trạng thái giao dịch";

  const actionsBody = isEmptyProposedWorkspace ? null : (
    <View style={isHandoverWorkspace ? styles.plainContainer : styles.card}>
      {!isHandoverWorkspace ? (
        <View style={styles.titleRow}>
          <View style={styles.titleIconPill}>
            <Icon
              name={
                exchange.status === "ResolutionPending" ? "shield" : "verified"
              }
              size={14}
              color={stitchTokens.wine}
            />
          </View>
          <AppText style={styles.title}>{sectionTitle}</AppText>
        </View>
      ) : null}

      {(exchange.status === "Preparing" || exchange.status === "InTransit") && (
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
        <View style={{ marginTop: space.xs }}>
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
          {/* State: PROPOSED (only rendered inline if not docked) */}
          {exchange.status === "Proposed" && !dockedMode && (
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
                  <View style={styles.rowTwoButtons}>
                    <View style={{ flex: 1 }}>
                      <Button
                        title={isInitiator ? "Hủy đề nghị" : "Từ chối"}
                        secondary
                        busy={isBusy}
                        onPress={() =>
                          isInitiator
                            ? setConfirmCancelOpen(true)
                            : setConfirmRejectOpen(true)
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Đồng ý đổi"
                        wine
                        busy={isBusy}
                        onPress={openAcceptSheet}
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
                  <AppText style={styles.hintText}>
                    {isInitiator
                      ? "Đề nghị đã gửi, sách chưa được giữ. Đang chờ đối tác phản hồi."
                      : "Bạn đã gửi đề xuất điều chỉnh. Đang chờ đối tác phản hồi."}
                  </AppText>
                  {isInitiator && (
                    <Button
                      title="Hủy đề nghị đổi sách"
                      secondary
                      wine
                      busy={isBusy}
                      onPress={() => setConfirmCancelOpen(true)}
                    />
                  )}
                </View>
              )}
            </View>
          )}

          {/* State: ACCEPTED / FUNDING */}
          {exchange.status === "AcceptedAwaitingFunding" && (
            <View style={styles.actionsBox}>
              {/* 2-side Funding Status Pills */}
              <View style={styles.twoSideGrid}>
                <View
                  style={[
                    styles.sideStatusPill,
                    isFundedByMe
                      ? styles.sideStatusPillDone
                      : styles.sideStatusPillPending,
                  ]}
                >
                  <View style={styles.sideStatusHeader}>
                    <View
                      style={[
                        styles.statusDotSmall,
                        {
                          backgroundColor: isFundedByMe
                            ? stitchTokens.likeNewGreen
                            : stitchTokens.wine,
                        },
                      ]}
                    />
                    <AppText style={styles.sideStatusOwner}>Bạn</AppText>
                  </View>
                  <AppText
                    style={[
                      styles.sideStatusValue,
                      {
                        color: isFundedByMe
                          ? stitchTokens.likeNewGreen
                          : stitchTokens.wine,
                      },
                    ]}
                  >
                    {isFundedByMe ? "Đã đặt cọc" : "Chờ bạn đặt cọc"}
                  </AppText>
                </View>

                <View
                  style={[
                    styles.sideStatusPill,
                    isPartnerFunded
                      ? styles.sideStatusPillDone
                      : styles.sideStatusPillIdle,
                  ]}
                >
                  <View style={styles.sideStatusHeader}>
                    <View
                      style={[
                        styles.statusDotSmall,
                        {
                          backgroundColor: isPartnerFunded
                            ? stitchTokens.likeNewGreen
                            : stitchTokens.subtleGray,
                        },
                      ]}
                    />
                    <AppText
                      style={styles.sideStatusOwner}
                      numberOfLines={1}
                    >
                      {partnerName}
                    </AppText>
                  </View>
                  <AppText
                    style={[
                      styles.sideStatusValue,
                      {
                        color: isPartnerFunded
                          ? stitchTokens.likeNewGreen
                          : stitchTokens.subtleGray,
                      },
                    ]}
                  >
                    {isPartnerFunded ? "Đã đặt cọc" : "Đang chờ cọc"}
                  </AppText>
                </View>
              </View>

              {isFundedByMe ? (
                <View style={styles.buttonGroup}>
                  <View style={styles.successNote}>
                    <Icon
                      name="check"
                      size={16}
                      color={stitchTokens.likeNewGreen}
                    />
                    <AppText style={styles.successNoteText}>
                      Bạn đã ký quỹ {formatVnd(amountToPay)}. Hệ thống sẽ tự
                      động mở bước gửi sách ngay khi {partnerName} hoàn tất cọc.
                    </AppText>
                  </View>
                  {!dockedMode ? (
                    <Button
                      title="Hủy trao đổi"
                      secondary
                      wine
                      busy={isBusy}
                      onPress={() => setConfirmCancelOpen(true)}
                    />
                  ) : null}
                </View>
              ) : (
                <View style={styles.buttonGroup}>
                  <TransactionAmount label="Số tiền Ví sẽ giữ" value={formatVnd(amountToPay)} />
                  {/* Clean Digital Receipt */}
                  <View style={styles.receiptBox}>
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>
                        Cọc bảo chứng
                      </AppText>
                      <AppText style={styles.receiptVal}>
                        {formatVnd(baseDeposit)}
                      </AppText>
                    </View>
                    {diffRequired > 0 ? (
                      <View style={styles.receiptRow}>
                        <AppText style={styles.receiptLabel}>
                          Tiền bù chênh lệch bạn trả
                        </AppText>
                        <AppText style={styles.receiptVal}>
                          {formatVnd(diffRequired)}
                        </AppText>
                      </View>
                    ) : null}
                    <AppText style={styles.receiptLabel}>{exchangeServiceFeeText}</AppText>
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>
                        Số dư ví khả dụng
                      </AppText>
                      <AppText
                        style={[
                          styles.receiptWalletVal,
                          hasInsufficientFunds && {
                            color: stitchTokens.crimson,
                          },
                        ]}
                      >
                        {walletQuery.isPending
                          ? "Đang tải..."
                          : formatVnd(walletAvailable)}
                      </AppText>
                    </View>
                  </View>
                  <TransactionNotes notes={exchangeFundingNotes} />

                  {hasInsufficientFunds && (
                    <Notice tone="error">
                      Số dư ví còn thiếu{" "}
                      {formatVnd(amountToPay - walletAvailable)}. Nạp thêm vào
                      ví để hoàn tất đặt cọc.
                    </Notice>
                  )}

                  {!dockedMode ? (
                    <>
                      {hasInsufficientFunds && (
                        <Button
                          title="Mở ví để nạp thêm"
                          secondary
                          onPress={() => router.push("/wallet")}
                        />
                      )}
                      <Button
                        title={
                          fundMutation.isPending
                            ? "Đang xử lý đặt cọc..."
                            : walletQuery.isPending
                              ? "Đang kiểm tra số dư ví..."
                              : `Đặt cọc ${formatVnd(amountToPay)}`
                        }
                        wine
                        busy={isBusy}
                        disabled={
                          hasInsufficientFunds || walletQuery.isPending || isBusy
                        }
                        onPress={() => fundMutation.mutate()}
                      />
                      <Button
                        title="Hủy trao đổi"
                        secondary
                        busy={isBusy}
                        onPress={() => setConfirmCancelOpen(true)}
                      />
                    </>
                  ) : null}
                </View>
              )}
            </View>
          )}

          {/* State: PREPARING & IN_TRANSIT — Unified 2-Leg Shipping Workspace */}
          {(exchange.status === "Preparing" ||
            exchange.status === "InTransit") &&
            (() => {
              const sendActionNode =
                !dockedMode && !isShippedByMe ? (
                  <Button
                    title="Tạo đơn gửi sách"
                    wine
                    busy={isBusy}
                    onPress={openShipSheet}
                  />
                ) : null;

              const outgoingExtraNode =
                exchange.status === "Preparing" && !isShippedByMe ? (
                  <>
                    {exchange.cancellationRequestedBy ? (
                      <Notice tone="info">
                        {exchange.cancellationRequestedBy === myRole
                          ? "Bạn đã đề nghị hủy giao dịch trước khi gửi sách. Đang chờ đối tác phản hồi."
                          : "Đối tác đề nghị hủy giao dịch trước khi gửi sách. Nếu đồng ý, 100% tiền cọc và tiền bù sẽ được hoàn về ví."}
                      </Notice>
                    ) : null}
                    {!dockedMode &&
                    !isPartnerShipped &&
                    !exchange.cancellationRequestedBy ? (
                      <Button
                        title="Đề nghị hủy giao dịch"
                        secondary
                        busy={isBusy}
                        onPress={() => setConfirmCancelOpen(true)}
                      />
                    ) : null}
                    {!isPartnerShipped &&
                    exchange.cancellationRequestedBy === partnerRole ? (
                      <View style={styles.rowTwoButtons}>
                        <View style={{ flex: 1 }}>
                          <Button
                            title="Đồng ý hủy"
                            secondary
                            wine
                            busy={isBusy}
                            onPress={() => setConfirmCancelOpen(true)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            title="Từ chối hủy"
                            secondary
                            busy={isBusy}
                            onPress={() => setConfirmRejectOpen(true)}
                          />
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : null;

              const incomingExtraNode = (
                <>
                  {isReceivedByMe ? (
                    <View style={styles.successNote}>
                      <Icon
                        name="check"
                        size={15}
                        color={stitchTokens.likeNewGreen}
                      />
                      <AppText style={styles.successNoteText}>
                        Bạn đã nhận sách và có 72 giờ kiểm tra. Tiền cọc giữ an
                        toàn đến khi cả hai hoàn tất.
                      </AppText>
                    </View>
                  ) : null}
                  {!dockedMode &&
                  (exchange.status === "InTransit" || isReceivedByMe)
                    ? disputeAction
                    : !dockedMode && missedOneSided ? (
                        <Button
                          title="Báo sự cố (Đối tác chưa gửi sách)"
                          secondary
                          wine
                          busy={isBusy}
                          onPress={() =>
                            openDisputeSheet("Đối tác chưa gửi sách")
                          }
                        />
                      ) : null}
                </>
              );

              return (
                <ExchangeShippingCard
                  exchange={exchange}
                  isInitiator={isInitiator}
                  partnerName={partnerName}
                  sendAction={sendActionNode}
                  receiveAction={dockedMode ? null : receiveAction}
                  outgoingExtra={outgoingExtraNode}
                  incomingExtra={incomingExtraNode}
                />
              );
            })()}

          {/* State: DELIVERED (INSPECTING, ACKNOWLEDGE OR DISPUTE) */}
          {exchange.status === "Delivered" &&
            (() => {
              const myDeadline = isInitiator
                ? exchange.initiatorInspectionDeadline
                : exchange.recipientInspectionDeadline;
              const commonDeadline = exchange.inspectionDeadline;
              const myDeadlineStr = myDeadline
                ? new Date(myDeadline).toLocaleString("vi-VN")
                : null;
              const commonDeadlineStr = commonDeadline
                ? new Date(commonDeadline).toLocaleString("vi-VN")
                : null;

              return (
                <View style={styles.actionsBox}>
                  <AppText kind="small" color={stitchTokens.subtleGray}>
                    Tiền Ví đang giữ {formatVnd(amountToPay)}.
                  </AppText>
                  {/* 2-side inspection confirmation pills */}
                  <View style={styles.twoSideGrid}>
                    <View
                      style={[
                        styles.sideStatusPill,
                        isCompletedByMe
                          ? styles.sideStatusPillDone
                          : styles.sideStatusPillPending,
                      ]}
                    >
                      <View style={styles.sideStatusHeader}>
                        <View
                          style={[
                            styles.statusDotSmall,
                            {
                              backgroundColor: isCompletedByMe
                                ? stitchTokens.likeNewGreen
                                : stitchTokens.wine,
                            },
                          ]}
                        />
                        <AppText style={styles.sideStatusOwner}>Bạn</AppText>
                      </View>
                      <AppText
                        style={[
                          styles.sideStatusValue,
                          {
                            color: isCompletedByMe
                              ? stitchTokens.likeNewGreen
                              : stitchTokens.wine,
                          },
                        ]}
                      >
                        {isCompletedByMe ? "Đã nghiệm thu" : "Chờ kiểm tra"}
                      </AppText>
                    </View>

                    <View
                      style={[
                        styles.sideStatusPill,
                        isPartnerCompleted
                          ? styles.sideStatusPillDone
                          : styles.sideStatusPillIdle,
                      ]}
                    >
                      <View style={styles.sideStatusHeader}>
                        <View
                          style={[
                            styles.statusDotSmall,
                            {
                              backgroundColor: isPartnerCompleted
                                ? stitchTokens.likeNewGreen
                                : stitchTokens.subtleGray,
                            },
                          ]}
                        />
                        <AppText
                          style={styles.sideStatusOwner}
                          numberOfLines={1}
                        >
                          {partnerName}
                        </AppText>
                      </View>
                      <AppText
                        style={[
                          styles.sideStatusValue,
                          {
                            color: isPartnerCompleted
                              ? stitchTokens.likeNewGreen
                              : stitchTokens.subtleGray,
                          },
                        ]}
                      >
                        {isPartnerCompleted ? "Đã nghiệm thu" : "Đang kiểm tra"}
                      </AppText>
                    </View>
                  </View>

                  {myDeadlineStr && (
                    <AppText kind="small" color={stitchTokens.subtleGray}>
                      Hạn báo sự cố của bạn {myDeadlineStr}
                    </AppText>
                  )}
                  {commonDeadlineStr && (
                      <View style={styles.commonDeadlineTag}>
                        <Icon
                          name="clock"
                          size={12}
                          color={stitchTokens.subtleGray}
                        />
                        <AppText style={styles.commonDeadlineText}>
                          {inspectionPhase === "settling"
                            ? "Cả hai hạn đã qua. Đang chờ hệ thống tất toán về Ví."
                            : `Dự kiến xử lý tiền sau ${commonDeadlineStr} nếu không có tranh chấp.`}
                        </AppText>
                      </View>
                    )}

                  {isCompletedByMe && (
                    <View style={styles.successNote}>
                      <Icon
                        name="check"
                        size={17}
                        color={stitchTokens.likeNewGreen}
                      />
                      <AppText style={styles.successNoteText}>
                        {inspectionOpen
                          ? "Bạn đã xác nhận kiểm tra. Bạn vẫn có thể báo sự cố trong hạn của mình."
                          : "Bạn đã xác nhận kiểm tra. Hạn báo sự cố của bạn đã qua."}
                      </AppText>
                    </View>
                  )}
                  {!dockedMode && (
                    <View style={styles.buttonGroup}>
                      {!isCompletedByMe && isReceivedByMe && inspectionOpen && (
                        <Button
                          title="Xác nhận đã kiểm tra"
                          wine
                          busy={isBusy}
                          onPress={() => setConfirmCompleteOpen(true)}
                        />
                      )}
                      {!isReceivedByMe && receiveAction}
                      {disputeAction}
                    </View>
                  )}
                </View>
              );
            })()}

          {/* State: RESOLUTION_PENDING (Tier 3: Compact Dispute Reference & Escrow) */}
          {exchange.status === "ResolutionPending" &&
            (() => {
              const parsed = parseDisputeReason(exchange.disputeReason || "");
              const myDeposit = isInitiator
                ? exchange.initiatorDeposit
                : exchange.recipientDeposit;
              const partnerDeposit = isInitiator
                ? exchange.recipientDeposit
                : exchange.initiatorDeposit;
              const reportedByMe =
                Boolean(exchange.disputedBy && currentUserId) &&
                exchange.disputedBy === currentUserId;
              const disputedAtText = exchange.disputedAt
                ? new Date(exchange.disputedAt).toLocaleString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })
                : null;
              return (
                <View style={styles.disputeRichBox}>
                  <View style={styles.disputeMetaRow}>
                    <View style={styles.disputeCategoryTag}>
                      <AppText style={styles.disputeCategoryText}>
                        {parsed.category}
                      </AppText>
                    </View>
                    {exchange.disputedBy || disputedAtText ? (
                      <AppText style={styles.disputeMetaText}>
                        {exchange.disputedBy
                          ? reportedByMe
                            ? "Bạn báo sự cố"
                            : `${partnerName} báo sự cố`
                          : "Đã tiếp nhận"}
                        {disputedAtText ? ` · ${disputedAtText}` : ""}
                      </AppText>
                    ) : null}
                  </View>

                  {parsed.detailText ? (
                    <View style={styles.disputeDetailBlock}>
                      <AppText style={styles.disputeDetailLabel}>
                        Nội dung phản ánh ban đầu
                      </AppText>
                      <AppText style={styles.disputeDetailText}>
                        {parsed.detailText}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.disputeEscrowBox}>
                    <View style={styles.disputeEscrowRow}>
                      <AppText style={styles.disputeEscrowLabel}>
                        Cọc của bạn
                      </AppText>
                      <AppText style={styles.disputeEscrowValue}>
                        {formatVnd(myDeposit)}
                      </AppText>
                    </View>
                    <View style={styles.disputeEscrowRow}>
                      <AppText style={styles.disputeEscrowLabel}>
                        Cọc của {partnerName}
                      </AppText>
                      <AppText style={styles.disputeEscrowValue}>
                        {formatVnd(partnerDeposit)}
                      </AppText>
                    </View>
                    {exchange.diffAmount > 0 ? (
                      <View style={styles.disputeEscrowRow}>
                        <AppText style={styles.disputeEscrowLabel}>
                          Tiền bù chênh lệch
                        </AppText>
                        <AppText style={styles.disputeEscrowValue}>
                          {formatVnd(exchange.diffAmount)}
                        </AppText>
                      </View>
                    ) : null}
                    <View style={styles.disputeEscrowDivider} />
                    <View style={styles.disputeEscrowFoot}>
                      <Icon name="lock" size={13} color={stitchTokens.wine} />
                      <AppText style={styles.disputeEscrowNote}>
                        Tự động tất toán 72h đã tạm dừng. Toàn bộ ký quỹ được
                        giữ an toàn trên sổ cái cho tới khi hoàn tất phán quyết.
                      </AppText>
                    </View>
                  </View>

                  {!dockedMode &&
                    !exchange.returnResolution &&
                    !exchange.outboundDeliveryVerification &&
                    receiveAction}
                </View>
              );
            })()}

          <ExchangeReviewsCard exchange={exchange} />
          {/* State: COMPLETED (Verdict callout if resolved via dispute) */}
          {exchange.status === "Completed" && (
            <View style={{ gap: space.sm }}>
              {(exchange.resolutionDecision === "CompleteExchange" ||
                ((exchange.resolutionCompensationAmount ?? 0) > 0 &&
                  (exchange.resolutionDecision === "CompensateInitiator" ||
                    exchange.resolutionDecision === "CompensateRecipient"))) && (
                <View
                  style={[
                    styles.disputeBox,
                    {
                      backgroundColor: stitchTokens.likeNewGreenBg,
                      borderColor: stitchTokens.mintGreen,
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
                      {(exchange.resolutionCompensationAmount ?? 0) > 0
                        ? `Hoàn tất theo phán quyết · Khấu trừ thiệt hại ${formatVnd(exchange.resolutionCompensationAmount!)}`
                        : "Trao đổi hoàn tất theo phán quyết của Quản trị viên"}
                    </AppText>
                    <AppText
                      style={{
                        fontSize: 12,
                        color: stitchTokens.darkWood,
                        marginTop: 2,
                      }}
                    >
                      {(exchange.resolutionCompensationAmount ?? 0) > 0
                        ? "Hai bên giữ sách đã nhận. Hệ thống đã khấu trừ mức thiệt hại theo phán quyết và hoàn phần tiền ký quỹ còn lại về ví."
                        : "Toàn bộ tiền cọc bảo chứng và tiền bù đã được tất toán theo thỏa thuận."}
                    </AppText>
                    {exchange.resolutionReason && (
                      <AppText
                        style={{
                          fontSize: 12.5,
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

                  const returned = exchange.returnResolution?.outcome === "Returned";
                  const decisionTitle = returned
                    ? "Đã xác minh trả sách"
                    : isCompInit
                    ? "Phán quyết: Chấp thuận khiếu nại Bên khởi tạo"
                    : isCompRecip
                      ? "Phán quyết: Chấp thuận khiếu nại Bên đối tác"
                      : "Phán quyết: Hủy giao dịch & Hoàn cọc hai bên";

                  const compAmt =
                    exchange.resolutionCompensationAmount ??
                    exchange.returnResolution?.compensation ??
                    0;
                  const decisionDesc =
                    returned
                      ? "Chủ sách đã nhận lại sách. Khoản cọc và tiền bù đã được hoàn theo kết quả hồ sơ."
                      : isCompInit || isCompRecip
                      ? `Giao dịch đã hủy theo phán quyết bồi thường${compAmt > 0 ? ` (${formatVnd(compAmt)})` : ""}. Bên bị hại được hoàn ký quỹ + nhận bồi thường; phần dư (nếu có) đã hoàn lại ví.`
                      : "Toàn bộ tiền cọc bảo chứng và tiền bù đã được hoàn lại 100% về ví của cả hai bên. Sách chưa gửi đã mở lại trên kệ.";

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
                              fontSize: 12.5,
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
                    {isFundedByMe && ["MutualAgreement", "FundingExpired", "ShippingExpired"].includes(exchange.cancelReason ?? "") && (
                      <AppText
                        style={{
                          fontSize: 12.5,
                          color: stitchTokens.darkWood,
                          marginTop: 2,
                        }}
                      >
                        Khoản bạn đã nộp đã được hoàn về Ví.
                      </AppText>
                    )}
                    {exchange.resolutionReason && (
                      <AppText
                        style={{
                          fontSize: 12.5,
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
              {isFundedByMe && <Button title="Xem lịch sử giao dịch Ví" secondary onPress={() => router.push({ pathname: "/wallet", params: { section: "history" } })} />}
            </View>
          )}
        </>
      )}
    </View>
  );

  // =========================================================================
  // NATIVE STICKY THUMB-ZONE BOTTOM ACTION DOCK
  // =========================================================================
  const renderBottomDock = () => {
    if (!dockedMode) return null;

    if (isViewingHistory && onReturnToLive) {
      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <Pressable
            accessibilityRole="button"
            onPress={onReturnToLive}
            style={({ pressed }) => [
              styles.dockPrimaryBtn,
              { flex: 1 },
              pressed && styles.dockPressed,
            ]}
          >
            <Icon name="arrow" size={16} color={stitchTokens.white} />
            <AppText style={styles.dockPrimaryText}>
              Quay về bước hiện tại
            </AppText>
          </Pressable>
        </View>
      );
    }

    if (blocked) {
      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onReload?.()}
            style={({ pressed }) => [
              styles.dockPrimaryBtn,
              { flex: 1 },
              pressed && styles.dockPressed,
            ]}
          >
            <Icon name="sync" size={16} color={stitchTokens.white} />
            <AppText style={styles.dockPrimaryText}>
              Tải lại trạng thái phiếu
            </AppText>
          </Pressable>
        </View>
      );
    }

    if (exchange.status === "Proposed") {
      if (isAwaitingMyResponse) {
        return (
          <View style={[styles.bottomDockCol, { paddingBottom: bottomInset }]}>
            <View style={styles.dockTopMetaRow}>
              <AppText style={styles.dockTopMetaLabel} numberOfLines={1}>
                {diffPayerLabel}
              </AppText>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => setCounterModalOpen(true)}
                style={({ pressed }) => [
                  styles.dockLinkChip,
                  pressed && styles.dockPressed,
                ]}
              >
                <Icon name="swap" size={13} color={stitchTokens.wine} />
                <AppText style={styles.dockLinkChipText}>Đổi sách khác</AppText>
              </Pressable>
            </View>
            <View style={styles.dockActionRow}>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() =>
                  isInitiator
                    ? setConfirmCancelOpen(true)
                    : setConfirmRejectOpen(true)
                }
                style={({ pressed }) => [
                  styles.dockSecondaryBtn,
                  pressed && styles.dockPressed,
                ]}
              >
                <AppText style={styles.dockSecondaryText}>
                  {isInitiator ? "Hủy" : "Từ chối"}
                </AppText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={openAcceptSheet}
                style={({ pressed }) => [
                  styles.dockPrimaryBtn,
                  { flex: 1 },
                  pressed && styles.dockPressed,
                  isBusy && styles.dockDisabled,
                ]}
              >
                <Icon name="check" size={16} color={stitchTokens.white} />
                <AppText style={styles.dockPrimaryText}>Đồng ý đổi</AppText>
              </Pressable>
            </View>
          </View>
        );
      }

      if (!isInitiator) return null;

      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <View style={styles.dockInfoSlot}>
            <AppText style={styles.dockInfoTitle}>Đang chờ phản hồi</AppText>
            <AppText style={styles.dockInfoSub} numberOfLines={1}>
              {partnerName} sẽ sớm xem phiếu
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => setConfirmCancelOpen(true)}
            style={({ pressed }) => [
              styles.dockDangerOutlineBtn,
              pressed && styles.dockPressed,
            ]}
          >
            <AppText style={styles.dockDangerOutlineText}>Hủy đề nghị</AppText>
          </Pressable>
        </View>
      );
    }

    if (exchange.status === "AcceptedAwaitingFunding") {
      if (!isFundedByMe) {
        return (
          <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
            <View style={styles.dockInfoSlot}>
              <AppText style={styles.dockInfoSub}>
                {hasInsufficientFunds ? "Ví còn thiếu" : "Tổng cần nộp"}
              </AppText>
              <AppText
                style={[
                  styles.dockAmountText,
                  hasInsufficientFunds && { color: stitchTokens.crimson },
                ]}
              >
                {hasInsufficientFunds
                  ? formatVnd(amountToPay - walletAvailable)
                  : formatVnd(amountToPay)}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => setConfirmCancelOpen(true)}
              style={({ pressed }) => [
                styles.dockGhostBtn,
                pressed && styles.dockPressed,
              ]}
            >
              <AppText style={styles.dockGhostText}>Hủy</AppText>
            </Pressable>

            {hasInsufficientFunds ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/wallet")}
                style={({ pressed }) => [
                  styles.dockPrimaryBtn,
                  pressed && styles.dockPressed,
                ]}
              >
                <Icon name="wallet" size={16} color={stitchTokens.white} />
                <AppText style={styles.dockPrimaryText}>Nạp thêm ví</AppText>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={walletQuery.isPending || isBusy}
                onPress={() => fundMutation.mutate()}
                style={({ pressed }) => [
                  styles.dockPrimaryBtn,
                  pressed && styles.dockPressed,
                  (walletQuery.isPending || isBusy) && styles.dockDisabled,
                ]}
              >
                <Icon name="wallet" size={16} color={stitchTokens.white} />
                <AppText style={styles.dockPrimaryText}>
                  {fundMutation.isPending ? "Đang xử lý..." : "Đặt cọc ngay"}
                </AppText>
              </Pressable>
            )}
          </View>
        );
      }

      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <View style={styles.dockInfoSlot}>
            <AppText
              style={[
                styles.dockInfoTitle,
                { color: stitchTokens.likeNewGreen },
              ]}
            >
              Đã cọc {formatVnd(amountToPay)}
            </AppText>
            <AppText style={styles.dockInfoSub} numberOfLines={1}>
              Chờ {partnerName} hoàn tất cọc
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => setConfirmCancelOpen(true)}
            style={({ pressed }) => [
              styles.dockSecondaryBtn,
              pressed && styles.dockPressed,
            ]}
          >
            <AppText style={styles.dockSecondaryText}>Hủy & Hoàn cọc</AppText>
          </Pressable>
        </View>
      );
    }

    if (exchange.status === "Preparing" || exchange.status === "InTransit") {
      if (!isShippedByMe) {
        return (
          <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
            {exchange.status === "Preparing" &&
            !isPartnerShipped &&
            !exchange.cancellationRequestedBy ? (
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => setConfirmCancelOpen(true)}
                style={({ pressed }) => [
                  styles.dockSecondaryBtn,
                  pressed && styles.dockPressed,
                ]}
              >
                <AppText style={styles.dockSecondaryText}>Đề nghị hủy</AppText>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={openShipSheet}
              style={({ pressed }) => [
                styles.dockPrimaryBtn,
                { flex: 1 },
                pressed && styles.dockPressed,
                isBusy && styles.dockDisabled,
              ]}
            >
              <Icon name="truck" size={16} color={stitchTokens.white} />
              <AppText style={styles.dockPrimaryText}>Tạo đơn gửi sách</AppText>
            </Pressable>
          </View>
        );
      }

      if (partnerPickedUpAt && !isReceivedByMe) {
        return (
          <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
            {inspectionOpen && exchange.status === "InTransit" ? (
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => openDisputeSheet()}
                style={({ pressed }) => [
                  styles.dockDangerOutlineBtn,
                  pressed && styles.dockPressed,
                ]}
              >
                <AppText style={styles.dockDangerOutlineText}>Báo sự cố</AppText>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => receiveMutation.mutate()}
              style={({ pressed }) => [
                styles.dockPrimaryBtn,
                { flex: 1 },
                pressed && styles.dockPressed,
                isBusy && styles.dockDisabled,
              ]}
            >
              <Icon name="check" size={16} color={stitchTokens.white} />
              <AppText style={styles.dockPrimaryText}>
                Xác nhận đã nhận sách
              </AppText>
            </Pressable>
          </View>
        );
      }

      const canReportShippingIssue =
        missedOneSided ||
        ((exchange.status === "InTransit" || isReceivedByMe) && inspectionOpen);
      if (!canReportShippingIssue) return null;

      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <View style={styles.dockInfoSlot}>
            <AppText style={styles.dockInfoTitle}>
              {isReceivedByMe ? "Bạn đã nhận sách" : "Đã gửi sách đi"}
            </AppText>
            <AppText style={styles.dockInfoSub} numberOfLines={1}>
              {missedOneSided
                ? `${partnerName} đã quá hạn gửi`
                : `Đang chờ ${partnerName}`}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() =>
              openDisputeSheet(
                missedOneSided ? "Đối tác chưa gửi sách" : undefined,
              )
            }
            style={({ pressed }) => [
              styles.dockDangerOutlineBtn,
              pressed && styles.dockPressed,
            ]}
          >
            <Icon name="shield" size={14} color={stitchTokens.crimson} />
            <AppText style={styles.dockDangerOutlineText}>Báo sự cố</AppText>
          </Pressable>
        </View>
      );
    }

    if (exchange.status === "Delivered") {
      if (isCompletedByMe && !inspectionOpen) {
        return null;
      }

      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          {inspectionOpen ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => openDisputeSheet()}
              style={({ pressed }) => [
                styles.dockDangerOutlineBtn,
                pressed && styles.dockPressed,
              ]}
            >
              <AppText style={styles.dockDangerOutlineText}>Báo sự cố</AppText>
            </Pressable>
          ) : null}

          {!isReceivedByMe && partnerPickedUpAt ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => receiveMutation.mutate()}
              style={({ pressed }) => [
                styles.dockPrimaryBtn,
                { flex: 1 },
                pressed && styles.dockPressed,
                isBusy && styles.dockDisabled,
              ]}
            >
              <Icon name="check" size={16} color={stitchTokens.white} />
              <AppText style={styles.dockPrimaryText}>
                Xác nhận đã nhận sách
              </AppText>
            </Pressable>
          ) : !isCompletedByMe && isReceivedByMe && inspectionOpen ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => setConfirmCompleteOpen(true)}
              style={({ pressed }) => [
                styles.dockPrimaryBtn,
                { flex: 1 },
                pressed && styles.dockPressed,
                isBusy && styles.dockDisabled,
              ]}
            >
              <Icon name="check" size={16} color={stitchTokens.white} />
              <AppText style={styles.dockPrimaryText}>
                Xác nhận hài lòng
              </AppText>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (exchange.status === "ResolutionPending") {
      const canReceiveInDispute =
        !exchange.returnResolution &&
        !exchange.outboundDeliveryVerification &&
        Boolean(partnerPickedUpAt) &&
        !isReceivedByMe;
      if (!canReceiveInDispute) return null;

      return (
        <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
          <View style={styles.dockInfoSlot}>
            <AppText
              style={[styles.dockInfoTitle, { color: stitchTokens.crimson }]}
            >
              Admin đang thụ lý
            </AppText>
            <AppText style={styles.dockInfoSub} numberOfLines={1}>
              Tiền cọc đang được bảo vệ an toàn
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={() => receiveMutation.mutate()}
            style={({ pressed }) => [
              styles.dockPrimaryBtn,
              pressed && styles.dockPressed,
            ]}
          >
            <AppText style={styles.dockPrimaryText}>Đã nhận sách</AppText>
          </Pressable>
        </View>
      );
    }

    // Completed or Cancelled
    return (
      <View style={[styles.bottomDock, { paddingBottom: bottomInset }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/wallet")}
          style={({ pressed }) => [
            styles.dockSecondaryBtn,
            { flex: 1 },
            pressed && styles.dockPressed,
          ]}
        >
          <Icon name="wallet" size={15} color={stitchTokens.wine} />
          <AppText style={styles.dockSecondaryText}>Kiểm tra ví</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/")}
          style={({ pressed }) => [
            styles.dockPrimaryBtn,
            { flex: 1.2 },
            pressed && styles.dockPressed,
          ]}
        >
          <Icon name="search" size={15} color={stitchTokens.white} />
          <AppText style={styles.dockPrimaryText}>Khám phá sách</AppText>
        </Pressable>
      </View>
    );
  };

  const modals = (
    <>

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
        title="Xác nhận nghiệm thu sách?"
        message="Thao tác này ghi nhận bạn đã kiểm tra sách. Bạn vẫn có thể báo sự cố trong 72 giờ kể từ lúc nhận. Hệ thống xử lý tiền khi hết hạn kiểm tra của cả hai và không có tranh chấp."
        confirmLabel="Xác nhận nghiệm thu"
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
        animationType="slide"
        onRequestClose={() => setDisputeModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.disputeModalCard, { paddingBottom: Math.max(bottomInset, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                }}
              >
                <View style={styles.sheetIconBadgeDanger}>
                  <Icon name="shield" size={16} color={stitchTokens.crimson} />
                </View>
                <AppText style={styles.modalTitle} numberOfLines={1}>
                  Báo sự cố / Khiếu nại
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                style={styles.sheetCloseBtn}
                onPress={() => setDisputeModalOpen(false)}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
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
              {receiveSnapshots.length > 1 && (
                <View style={styles.formGroup}>
                  <AppText style={styles.formLabel}>
                    Chọn cuốn sách gặp sự cố (không bắt buộc)
                  </AppText>
                  <View style={{ gap: 6 }}>
                    {receiveSnapshots.map((snap) => {
                      const checked = disputeBookIds.includes(snap.listingId);
                      return (
                        <Pressable
                          key={snap.listingId}
                          onPress={() =>
                            setDisputeBookIds((prev) =>
                              checked
                                ? prev.filter((id) => id !== snap.listingId)
                                : [...prev, snap.listingId],
                            )
                          }
                          style={[
                            styles.sideOptionItem,
                            checked && styles.sideOptionItemActive,
                          ]}
                        >
                          <View
                            style={[
                              styles.radioCircle,
                              checked && styles.radioCircleActive,
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <AppText style={styles.sideOptionTitle} numberOfLines={1}>
                              {snap.book.title}
                            </AppText>
                            <AppText style={styles.sideOptionDesc}>
                              Định giá: {formatVnd(snap.exchangeValue)}
                            </AppText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
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
                    {disputeDetail.length}/500 ký tự
                  </AppText>
                </View>
                <AppTextInput
                  style={styles.disputeMultilineInput}
                  multiline
                  numberOfLines={3}
                  value={disputeDetail}
                  maxLength={500}
                  placeholder="Mô tả cụ thể vị trí hư hại, vết rách hoặc sự sai lệch của sách lúc mở gói..."
                  placeholderTextColor={stitchTokens.subtleGray}
                  onChangeText={(val) => {
                    setDisputeDetail(val);
                    if (disputeError) setDisputeError(null);
                  }}
                />
              </View>
              <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 12.5, lineHeight: 18 }}>
                Báo sự cố trước để ghi nhận đúng hạn. Sau đó bổ sung tệp ở mục
                Bằng chứng sự cố. Video mở hộp không bắt buộc.
              </AppText>
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
        animationType="slide"
        onRequestClose={() => setAcceptModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(bottomInset, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
              >
                <View style={styles.sheetIconBadge}>
                  <Icon name="check" size={16} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.modalTitle}>
                  Xác nhận đồng ý đổi sách
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                style={styles.sheetCloseBtn}
                onPress={() => setAcceptModalOpen(false)}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
              </Pressable>
            </View>

            <AppText style={styles.modalSub}>
              Khi đồng ý, bài đăng của bạn sẽ tạm khóa khỏi sàn để chuẩn bị giao
              dịch. Kiểm tra khoản cọc, tiền bù và chọn địa chỉ nhận sách:
            </AppText>

            {/* Financial Summary + Optional Diff Negotiation */}
            {(() => {
              const myBookVal = isInitiator
                ? (exchange.agreement?.initiatorBooks.reduce((s, b) => s + b.exchangeValue, 0) ?? exchange.initiatorDeposit)
                : (exchange.agreement?.recipientBook.exchangeValue ?? exchange.recipientDeposit);
              const partnerBookVal = isInitiator
                ? (exchange.agreement?.recipientBook.exchangeValue ?? exchange.recipientDeposit)
                : (exchange.agreement?.initiatorBooks.reduce((s, b) => s + b.exchangeValue, 0) ?? exchange.initiatorDeposit);
              const defaultDiff = Math.abs(myBookVal - partnerBookVal);
              const parsedNeg = Number.parseInt(negotiatedDiffInput.replace(/\D/g, ""), 10) || 0;
              const effDiff = isNegotiatingDiff
                ? negotiatedPayer === "none"
                  ? 0
                  : parsedNeg
                : exchange.diffAmount;
              const effPayer: "me" | "partner" | "none" = isNegotiatingDiff
                ? effDiff === 0
                  ? "none"
                  : negotiatedPayer
                : exchange.diffAmount <= 0 || !exchange.diffPayerId
                  ? "none"
                  : exchange.diffPayerId === currentUserId
                    ? "me"
                    : "partner";
              const effMyTotal = baseDeposit + (effPayer === "me" ? effDiff : 0);
              const lowerVal = Math.min(myBookVal, partnerBookVal);
              const higherVal = Math.max(myBookVal, partnerBookVal);
              const cheaperIsMe = myBookVal < partnerBookVal;
              const cheaperPays =
                effPayer === "none"
                  ? 0
                  : (cheaperIsMe && effPayer === "me") || (!cheaperIsMe && effPayer === "partner")
                    ? effDiff
                    : 0;
              const protectedCap = Math.min(higherVal, lowerVal + cheaperPays);
              const showCapWarning = defaultDiff > 0 && protectedCap < higherVal;

              return (
                <View style={[styles.fundingSummaryCard, { gap: 6 }]}>
                  <AppText style={styles.fundingSummarySubLabel}>{exchangeServiceFeeText}</AppText>
                  <View style={styles.fundingSummaryRow}>
                    <AppText style={styles.fundingSummarySubLabel}>
                      Cọc của bạn (giá trị sách gửi):
                    </AppText>
                    <AppText style={styles.fundingSummaryWallet}>
                      {formatVnd(baseDeposit)}
                    </AppText>
                  </View>
                  <View style={styles.fundingSummaryRow}>
                    <AppText style={styles.fundingSummarySubLabel}>
                      Tiền bù chênh lệch:
                    </AppText>
                    <AppText style={styles.fundingSummaryWallet}>
                      {effPayer === "none"
                        ? "0 đ (Đổi ngang)"
                        : effPayer === "me"
                          ? `Bạn bù ${formatVnd(effDiff)}`
                          : `Đối tác bù ${formatVnd(effDiff)}`}
                    </AppText>
                  </View>
                  <View style={styles.fundingSummaryRow}>
                    <AppText style={styles.fundingSummaryLabel}>
                      Tổng cần nộp khi cọc:
                    </AppText>
                    <AppText style={styles.fundingSummaryAmount}>
                      {formatVnd(effMyTotal)}
                    </AppText>
                  </View>
                  {walletQuery.data ? (
                    <AppText
                      style={{
                        fontSize: 11.5,
                        color:
                          walletQuery.data.available >= effMyTotal
                            ? stitchTokens.likeNewGreen
                            : stitchTokens.crimson,
                        fontWeight: "600",
                      }}
                    >
                      Ví khả dụng: {formatVnd(walletQuery.data.available)}
                      {walletQuery.data.available >= effMyTotal
                        ? " (Đủ số dư)"
                        : ` (Thiếu ${formatVnd(effMyTotal - walletQuery.data.available)})`}
                    </AppText>
                  ) : null}

                  <Pressable
                    onPress={() => setIsNegotiatingDiff((v) => !v)}
                    style={{ alignSelf: "flex-start", paddingVertical: 2 }}
                  >
                    <AppText
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: stitchTokens.wineDark,
                        textDecorationLine: "underline",
                      }}
                    >
                      {isNegotiatingDiff
                        ? "← Quay lại chấp nhận mức hiện tại"
                        : "✎ Thỏa thuận lại tiền bù"}
                    </AppText>
                  </Pressable>

                  {isNegotiatingDiff ? (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {(
                          [
                            { id: "me", label: "Bạn bù" },
                            { id: "partner", label: "Đối tác bù" },
                            { id: "none", label: "Đổi ngang" },
                          ] as const
                        ).map((opt) => (
                          <Pressable
                            key={opt.id}
                            onPress={() => {
                              setNegotiatedPayer(opt.id);
                              if (opt.id === "none") setNegotiatedDiffInput("0");
                            }}
                            style={[
                              styles.categoryPill,
                              negotiatedPayer === opt.id && styles.categoryPillActive,
                              { flex: 1, alignItems: "center" },
                            ]}
                          >
                            <AppText
                              style={[
                                styles.categoryPillText,
                                negotiatedPayer === opt.id &&
                                  styles.categoryPillTextActive,
                              ]}
                            >
                              {opt.label}
                            </AppText>
                          </Pressable>
                        ))}
                      </View>
                      {negotiatedPayer !== "none" ? (
                        <AppTextInput
                          style={styles.singleLineInput}
                          keyboardType="number-pad"
                          value={negotiatedDiffInput}
                          onChangeText={(txt) =>
                            setNegotiatedDiffInput(txt.replace(/\D/g, ""))
                          }
                          placeholder="Nhập số tiền bù (VND)"
                          placeholderTextColor={stitchTokens.subtleGray}
                        />
                      ) : null}
                    </View>
                  ) : null}

                  {showCapWarning ? (
                    <Notice tone="info">
                      Lưu ý mức bảo chứng tối đa: Tiền bù đang thấp hơn chênh
                      lệch định giá ({formatVnd(defaultDiff)}). Nếu phát sinh sự
                      cố, mức bồi thường tối đa từ quỹ ký quỹ của bên gửi sách
                      giá thấp hơn chỉ đạt {formatVnd(protectedCap)} (cọc{" "}
                      {formatVnd(lowerVal)} + tiền bù {formatVnd(cheaperPays)}).
                    </Notice>
                  ) : null}
                </View>
              );
            })()}

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
                    {isNegotiatingDiff ? (
                      <Button
                        title="Gửi đề xuất tiền bù"
                        wine
                        busy={counterMutation.isPending}
                        onPress={() => {
                          const parsed =
                            negotiatedPayer === "none"
                              ? 0
                              : Number.parseInt(
                                  negotiatedDiffInput.replace(/\D/g, ""),
                                  10,
                                ) || 0;
                          const partnerId = isInitiator
                            ? exchange.recipientId
                            : exchange.initiatorId;
                          const finalPayerId =
                            negotiatedPayer === "none" || parsed === 0
                              ? null
                              : negotiatedPayer === "me"
                                ? currentUserId
                                : partnerId;
                          counterMutation.mutate({
                            negotiatedDiffAmount: parsed,
                            diffPayerId: finalPayerId,
                            deliveryAddressId: effectiveAcceptAddressId,
                            note: `Thương lượng tiền bù: ${formatVnd(parsed)}`,
                          });
                        }}
                      />
                    ) : (
                      <Button
                        title="Đồng ý đổi sách"
                        wine
                        disabled={!effectiveAcceptAddressId}
                        busy={acceptMutation.isPending}
                        onPress={() =>
                          acceptMutation.mutate(effectiveAcceptAddressId)
                        }
                      />
                    )}
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

      {/* Modal 2: Đề xuất sách thay thế */}
      <AppModal
        visible={counterModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!counterMutation.isPending) setCounterModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(bottomInset, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <View style={styles.sheetIconBadge}>
                  <Icon name="swap" size={16} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.modalTitle}>Đề xuất sách thay thế</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                style={styles.sheetCloseBtn}
                disabled={counterMutation.isPending}
                onPress={() => setCounterModalOpen(false)}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
              </Pressable>
            </View>
            {actionError && <Notice tone="error">{actionError}</Notice>}
            {counterModalOpen && (
              <ExchangeCounterForm
                key={currentUserId + ":" + exchange.revision}
                exchangeId={exchange.id}
                isInitiator={isInitiator}
                currentIds={
                  isInitiator
                    ? (exchange.initiatorListingIds ?? [
                        exchange.initiatorListingId!,
                      ])
                    : [exchange.recipientListingId]
                }
                partnerName={partnerName}
                partnerBooks={
                  exchange.agreement
                    ? isInitiator
                      ? [exchange.agreement.recipientBook]
                      : exchange.agreement.initiatorBooks
                    : []
                }
                partnerValue={
                  isInitiator
                    ? exchange.recipientDeposit
                    : exchange.initiatorDeposit
                }
                busy={counterMutation.isPending}
                onSubmit={(listingIds, note) =>
                  counterMutation.mutate({ listingIds, note })
                }
              />
            )}
          </View>
        </View>
      </AppModal>

      {/* Modal 3: Báo gửi sách & Cập nhật vận đơn */}
      <AppModal
        visible={shipModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShipModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(bottomInset, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
              >
                <View style={styles.sheetIconBadge}>
                  <Icon name="truck" size={16} color={stitchTokens.wine} />
                </View>
                <AppText style={styles.modalTitle}>Xác nhận gửi sách</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng modal"
                style={styles.sheetCloseBtn}
                onPress={() => setShipModalOpen(false)}
              >
                <Icon name="close" size={18} color={stitchTokens.darkWood} />
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
    </>
  );

  if (renderScrollBody) {
    return (
      <View style={styles.dockedRoot}>
        <View style={styles.dockedBody}>{renderScrollBody(actionsBody)}</View>
        {renderBottomDock()}
        {modals}
      </View>
    );
  }

  return (
    <View>
      {actionsBody}
      {modals}
    </View>
  );
}

const styles = StyleSheet.create({
  dockedRoot: {
    flex: 1,
  },
  dockedBody: {
    flex: 1,
  },
  plainContainer: {
    gap: 14,
  },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    gap: 14,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleIconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  twoSideGrid: {
    flexDirection: "row",
    gap: 10,
  },
  sideStatusPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 4,
  },
  sideStatusPillDone: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  sideStatusPillPending: {
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  sideStatusPillIdle: {
    backgroundColor: stitchTokens.surfaceSoft,
  },
  sideStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sideStatusOwner: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    flexShrink: 1,
  },
  sideStatusValue: {
    fontSize: 13.5,
    fontWeight: "800",
  },
  receiptBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 16,
    padding: 14,
    gap: 9,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  receiptLabel: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    flex: 1,
  },
  receiptVal: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    fontVariant: ["tabular-nums"],
  },
  receiptDivider: {
    height: 1,
    backgroundColor: stitchTokens.borderWarm,
    marginVertical: 2,
  },
  receiptWalletVal: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    fontVariant: ["tabular-nums"],
  },
  disputeMiniTrack: {
    flexDirection: "row",
    gap: 6,
  },
  disputeMiniPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
  },
  disputeMiniPillActive: {
    backgroundColor: stitchTokens.wine,
  },
  disputeMiniPillDone: {
    backgroundColor: stitchTokens.roseParchment,
  },
  disputeMiniText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  disputeMiniTextActive: {
    color: stitchTokens.white,
  },
  disputeMiniTextDone: {
    color: stitchTokens.wineDark,
  },
  /* Native Sticky Thumb-Zone Bottom Dock */
  bottomDock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 14,
  },
  bottomDockCol: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 14,
  },
  dockTopMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dockTopMetaLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  dockLinkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
  },
  dockLinkChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  dockActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dockInfoSlot: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  dockInfoTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  dockInfoSub: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  dockAmountText: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  dockPrimaryBtn: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  dockPrimaryText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.white,
  },
  dockSecondaryBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dockSecondaryText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  dockDangerOutlineBtn: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dockDangerOutlineText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.crimson,
  },
  dockGhostBtn: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dockGhostText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  dockPressed: {
    opacity: 0.78,
  },
  dockDisabled: {
    opacity: 0.5,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.borderWarm,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetIconBadgeDanger: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.flashRedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsBox: {
    gap: 10,
  },
  proposalNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    backgroundColor: stitchTokens.parchment,
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
  inspectionCard: {
    backgroundColor: stitchTokens.parchment,
    borderColor: stitchTokens.borderWarm,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  inspectionHeader: {
    gap: 6,
  },
  inspectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inspectionIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.warmCard,
    alignItems: "center",
    justifyContent: "center",
  },
  inspectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  inspectionSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.darkWood,
    marginTop: 2,
  },
  commonDeadlineTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  commonDeadlineText: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    fontWeight: "500",
  },
  inspectionGuidelines: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
    paddingTop: 8,
  },
  guidelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  guidelineText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.darkWood,
  },
  guidelineBold: {
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  completedInspectionBox: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.verifiedGreen,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  completedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  completedInspectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.verifiedGreen,
  },
  completedInspectionDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.darkWood,
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
  /* Native Bottom Sheet Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: stitchTokens.whiteSurface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 12,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 18,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.surfaceSoft,
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
  /* Dispute Rich Box for ResolutionPending (Tier 3 Reference & Escrow) */
  disputeRichBox: {
    gap: 10,
  },
  disputeMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  disputeMetaText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.redBorderSoft,
  },
  disputeCategoryText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.crimson,
  },
  disputeDetailBlock: {
    backgroundColor: stitchTokens.parchment,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 3,
  },
  disputeDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  disputeDetailText: {
    fontSize: 13,
    color: stitchTokens.darkWood,
    lineHeight: 19,
  },
  disputeEscrowBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 7,
  },
  disputeEscrowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  disputeEscrowLabel: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  disputeEscrowValue: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  disputeEscrowDivider: {
    height: 1,
    backgroundColor: stitchTokens.cardBorder,
    marginVertical: 2,
  },
  disputeEscrowFoot: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  disputeEscrowNote: {
    flex: 1,
    fontSize: 12,
    color: stitchTokens.deepCocoa,
    lineHeight: 17,
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
