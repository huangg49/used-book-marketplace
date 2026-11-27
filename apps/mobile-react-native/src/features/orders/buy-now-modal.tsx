import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  acknowledgedBuyNowOrder,
  buyerSaleFeeText,
  forgetBuyNowOrder,
  pendingBuyNowOrder,
  pendingBuyNowOrderInput,
  pendingOrderResponse,
  sendBuyNowOrder,
  sendOrderResponse,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Checkbox,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  TextField,
  space,
  stitchTokens,
} from "../../core/ui";
import type { Listing } from "../shelf/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { addressBook, addressReceipt } from "../addresses/contracts";
import { walletSummary } from "../wallet/contracts";
import { TopupModal } from "../wallet/topup-modal";
import {
  buyNowError,
  orderDetailsSchema,
  type OrderDetails,
} from "./contracts";
import {
  CheckoutQuote,
  quoteRemaining,
  quoteSignature,
  quoteUsable,
  type ReadQuote,
} from "./checkout-quote";
import { z } from "zod";
import { BundleManifest } from "../bundles/bundle-manifest";

const areasSchema = z.object({
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});

function formatVnd(amount: number | null | undefined): string {
  if (amount == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

interface BuyNowModalProps {
  visible: boolean;
  listing?: Listing;
  initialOrderId?: string | null;
  initialBookTitle?: string;
  onClose: () => void;
  onSuccess?: (orderId: string) => void;
}

export function BuyNowModal(props: BuyNowModalProps) {
  const { state } = useSession();
  return (
    <IdentityBuyNowModal
      key={state.status === "authenticated" ? state.user.id : "guest"}
      {...props}
    />
  );
}

function IdentityBuyNowModal(props: BuyNowModalProps) {
  const { client } = useSession();
  // Keep the listing/revision the buyer actually saw while the dialog is open.
  const [selection, setSelection] = useState(() => ({
    source: props.listing,
    value: props.listing
      ? (JSON.parse(JSON.stringify(props.listing)) as Listing)
      : undefined,
  }));
  if (
    (!selection.value && props.listing) ||
    (!props.visible && selection.source !== props.listing)
  ) {
    setSelection({
      source: props.listing,
      value: props.listing
        ? (JSON.parse(JSON.stringify(props.listing)) as Listing)
        : undefined,
    });
  }
  const orderId =
    props.initialOrderId ??
    (props.listing
      ? acknowledgedBuyNowOrder(client, props.listing.id)
      : undefined);
  // Keep address drafts across Back; a closed checkout has no live UI callbacks.
  // Shared intents and acknowledged IDs survive navigation within this identity.
  return (
    <BuyNowSession
      key={`${selection.value?.id ?? ""}:${selection.value?.revisionId ?? ""}:${orderId ?? ""}`}
      {...props}
      listing={selection.value}
      initialOrderId={orderId}
    />
  );
}

function BuyNowSession({
  visible,
  listing,
  initialOrderId,
  initialBookTitle,
  onClose,
  onSuccess,
}: BuyNowModalProps) {
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const cache = useQueryClient();
  const lifecycle = useRef({ active: visible, generation: 0 });
  useEffect(() => {
    const current = lifecycle.current;
    current.active = visible;
    return () => {
      current.active = false;
      current.generation++;
    };
  }, [visible]);
  function isCurrent(generation: number) {
    return (
      lifecycle.current.active && lifecycle.current.generation === generation
    );
  }
  const pendingCreation = !!listing && pendingBuyNowOrder(client, listing.id);
  const pendingInput = listing
    ? pendingBuyNowOrderInput(client, listing.id)
    : undefined;
  const mismatchedPending =
    !!pendingInput &&
    pendingInput.expectedListingRevisionId !== listing?.revisionId;
  const [bundleAcknowledged, setBundleAcknowledged] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const quoteAttempt = useRef(new CheckoutQuote());
  const retryPinnedQuote = useRef(false);

  const [step, setStep] = useState<"address_quote" | "payment" | "success">(
    initialOrderId && !pendingCreation ? "payment" : "address_quote",
  );

  // Address state
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocality, setNewLocality] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [addressError, setAddressError] = useState("");

  // Quote state
  const [readQuote, setReadQuote] = useState<ReadQuote | null>(null);
  const quote = readQuote?.value ?? null;
  const [quoteClock, setQuoteClock] = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Order state
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(
    pendingCreation ? null : (initialOrderId ?? null),
  );
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);

  // Operation state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [showTopupModal, setShowTopupModal] = useState(false);
  const pending = createdOrderId
    ? pendingOrderResponse(client, createdOrderId)
    : undefined;

  // Queries
  const addressesQuery = useQuery({
    queryKey: ["address-book"],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled: visible && state.status === "authenticated",
    retry: false,
  });

  const areasQuery = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", areasSchema),
    enabled: visible && state.status === "authenticated",
    retry: false,
  });

  const walletQuery = useQuery({
    queryKey: ["wallet"],
    queryFn: () => client.request("/me/wallet", walletSummary),
    enabled: visible && state.status === "authenticated",
    retry: false,
  });

  const items = useMemo(
    () => addressesQuery.data?.items ?? [],
    [addressesQuery.data?.items],
  );
  const effectiveAddressId =
    selectedAddressId && items.some((a) => a.id === selectedAddressId)
      ? selectedAddressId
      : (items.find((a) => a.isDefault)?.id ?? items[0]?.id ?? "");
  const address = items.find((a) => a.id === effectiveAddressId);
  const quoteBody =
    listing && address
      ? JSON.stringify({
          expectedListingVersion: listing.version,
          expectedListingRevisionId: listing.revisionId,
          destinationAddressId: address.id,
          expectedDestinationAddressVersion: address.version,
          method: "DirectDelivery",
          ...(listing.bundle ? { acknowledgeWholeBundle: true } : {}),
        })
      : "";
  const signature = listing ? quoteSignature(listing.id, quoteBody) : "";
  const usableQuote = !!readQuote && quoteUsable(readQuote, signature);
  const expiredQuote =
    !!readQuote &&
    readQuote.signature === signature &&
    (quote?.assessment === "Expired" ||
      (quote?.assessment === "Current" && quoteRemaining(readQuote) === 0));

  useEffect(() => {
    if (!visible || !readQuote || readQuote.value.assessment !== "Current")
      return;
    const remaining = quoteRemaining(readQuote);
    if (remaining === 0) return;
    const timer = setTimeout(() => setQuoteClock((v) => v + 1), remaining + 1);
    return () => clearTimeout(timer);
  }, [visible, readQuote, quoteClock]);

  function renewQuote() {
    if (
      busy ||
      quoteLoading ||
      pendingCreation ||
      !quoteAttempt.current.renew()
    )
      return;
    setReadQuote(null);
    setQuoteRetry((v) => v + 1);
  }

  function handleDismiss() {
    lifecycle.current.active = false;
    lifecycle.current.generation++;
    setBusy(false);
    onClose();
  }

  function reviewListing() {
    if (listing)
      void cache.invalidateQueries({
        queryKey: ["public-listing", listing.id],
      });
    void addressesQuery.refetch();
    handleDismiss();
  }

  // Load existing order when initialOrderId is provided
  useEffect(() => {
    if (pendingCreation) return;
    if (!visible || !initialOrderId || state.status !== "authenticated") return;
    let cancelled = false;
    async function loadInitialOrder() {
      try {
        setCreatedOrderId(initialOrderId ?? null);
        setStep("payment");
        setBusy(true);
        setError("");
        const details = await client.request(
          `/me/orders/${initialOrderId}`,
          orderDetailsSchema,
        );
        if (!cancelled) {
          if (listing && details.state !== "AwaitingPayment")
            forgetBuyNowOrder(client, listing.id, details.id);
          setOrderDetails(details);
          setCreatedOrderId(initialOrderId ?? null);
          setError("");
          setStep("payment");
        }
      } catch (err) {
        if (!cancelled) {
          setError(buyNowError(err));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }
    void loadInitialOrder();
    return () => {
      cancelled = true;
    };
  }, [visible, initialOrderId, state.status, client, pendingCreation, listing]);

  // Request Quote automatically when selected address changes
  useEffect(() => {
    if (
      !visible ||
      !listing ||
      !quoteBody ||
      state.status !== "authenticated" ||
      addingAddress ||
      step !== "address_quote" ||
      Boolean(initialOrderId) ||
      pendingCreation ||
      (listing.bundle && !bundleAcknowledged)
    )
      return;
    let cancelled = false;
    async function fetchQuote() {
      setQuoteLoading(true);
      setError("");
      try {
        const retryPinned = retryPinnedQuote.current;
        retryPinnedQuote.current = false;
        const fetchedQuote = await (retryPinned
          ? quoteAttempt.current.retry(client)
          : quoteAttempt.current.read(client, listing!.id, quoteBody, () =>
              Crypto.randomUUID(),
            ));
        if (!cancelled) {
          setReadQuote(fetchedQuote);
        }
      } catch (err) {
        if (!cancelled) {
          setError(buyNowError(err));
          setReadQuote(null);
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    }

    void fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    listing,
    quoteBody,
    addingAddress,
    step,
    initialOrderId,
    pendingCreation,
    client,
    state.status,
    bundleAcknowledged,
    quoteRetry,
  ]);

  // Handle saving new address inline
  async function handleSaveNewAddress() {
    const generation = lifecycle.current.generation;
    if (
      !newRecipient.trim() ||
      newPhone.trim().length !== 10 ||
      !newLocality ||
      !newDetail.trim()
    ) {
      setAddressError(
        "Vui lòng điền đủ họ tên, SĐT 10 số, khu vực và địa chỉ chi tiết.",
      );
      return;
    }
    setBusy(true);
    setAddressError("");
    try {
      const addKey = Crypto.randomUUID();
      const saved = await client.request("/me/addresses", addressReceipt, {
        method: "POST",
        headers: { "Idempotency-Key": addKey },
        body: JSON.stringify({
          expectedBookVersion: addressesQuery.data?.version ?? 0,
          address: {
            recipientName: newRecipient.trim(),
            phone: newPhone.trim(),
            serviceAreaCode: "HCM-DEMO-v1",
            localityCode: newLocality,
            detail: newDetail.trim(),
          },
          makeDefault: (addressesQuery.data?.items?.length ?? 0) === 0,
        }),
      });
      await addressesQuery.refetch();
      if (!isCurrent(generation)) return;
      setSelectedAddressId(saved.addressId);
      setAddingAddress(false);
      setNewRecipient("");
      setNewPhone("");
      setNewDetail("");
      setNewLocality("");
    } catch (err) {
      if (isCurrent(generation)) setAddressError(buyNowError(err));
    } finally {
      if (isCurrent(generation)) setBusy(false);
    }
  }

  async function readCreatedOrder(id: string, generation: number) {
    const details = await client.request(
      `/me/orders/${id}`,
      orderDetailsSchema,
    );
    if (!isCurrent(generation)) return;
    if (listing && details.state !== "AwaitingPayment")
      forgetBuyNowOrder(client, listing.id, id);
    setOrderDetails(details);
    setStep("payment");
  }

  // An acknowledged Order remains addressable even if its follow-up read fails.
  async function handleCreateOrder() {
    const generation = lifecycle.current.generation;
    if (
      !listing ||
      (!quote && !pendingCreation) ||
      busy ||
      (!pendingCreation && listing.bundle && !bundleAcknowledged)
    )
      return;
    if (
      !pendingCreation &&
      (!readQuote || !quoteUsable(readQuote, signature))
    ) {
      setError(
        "Báo giá không còn dùng được. Kiểm tra trạng thái báo giá trước khi đặt mua.",
      );
      setQuoteClock((v) => v + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const receipt = await sendBuyNowOrder(
        client,
        listing.id,
        quote
          ? {
              quoteId: quote.id,
              expectedQuoteVersion: quote.version,
              expectedListingVersion: quote.listingVersion,
              expectedListingRevisionId: quote.listingRevisionId,
            }
          : null,
        () => Crypto.randomUUID(),
      );
      void cache.invalidateQueries({
        queryKey: ["public-listing", listing.id],
      });
      void cache.invalidateQueries({ queryKey: ["my-orders"] });
      if (!isCurrent(generation)) return;
      setCreatedOrderId(receipt.entityId);
      setStep("payment");
      await readCreatedOrder(receipt.entityId, generation);
      void walletQuery.refetch();
    } catch (err) {
      if (isCurrent(generation)) {
        setError(buyNowError(err));
        if (!pendingBuyNowOrder(client, listing.id)) {
          setReadQuote(null);
          setQuoteRetry((v) => v + 1);
        }
      }
    } finally {
      if (isCurrent(generation)) setBusy(false);
    }
  }

  async function retryOrderRead() {
    const generation = lifecycle.current.generation;
    if (!createdOrderId || busy) return;
    setBusy(true);
    setError("");
    try {
      await readCreatedOrder(createdOrderId, generation);
    } catch (err) {
      if (isCurrent(generation)) setError(buyNowError(err));
    } finally {
      if (isCurrent(generation)) setBusy(false);
    }
  }

  function openCreatedOrder() {
    if (!createdOrderId) return;
    const orderId = createdOrderId;
    handleDismiss();
    router.push({ pathname: "/orders", params: { orderId } });
  }

  // Handle Pay Order via Wallet
  async function handlePayOrder() {
    const generation = lifecycle.current.generation;
    if (!createdOrderId || !orderDetails || busy) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(
        client,
        createdOrderId,
        "pay",
        orderDetails.version,
        () => Crypto.randomUUID(),
      );
      if (listing) forgetBuyNowOrder(client, listing.id, createdOrderId);
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["wallet"] });
      void cache.invalidateQueries({ queryKey: ["my-orders"] });
      if (!isCurrent(generation)) return;
      setStep("success");
      onSuccess?.(createdOrderId);
    } catch (err) {
      if (isCurrent(generation)) setError(buyNowError(err));
    } finally {
      if (isCurrent(generation)) setBusy(false);
    }
  }

  // Handle Cancel Order
  async function handleCancelOrder() {
    const generation = lifecycle.current.generation;
    if (!createdOrderId || !orderDetails || busy) return;
    setBusy(true);
    setError("");
    try {
      await sendOrderResponse(
        client,
        createdOrderId,
        "cancel",
        orderDetails.version,
        () => Crypto.randomUUID(),
      );
      if (listing) forgetBuyNowOrder(client, listing.id, createdOrderId);
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["my-orders"] });
      if (!isCurrent(generation)) return;
      setConfirmCancelOpen(false);
      handleDismiss();
    } catch (err) {
      if (isCurrent(generation)) setError(buyNowError(err));
    } finally {
      if (isCurrent(generation)) setBusy(false);
    }
  }

  const walletBalance = walletQuery.data?.available ?? 0;
  const walletReady = !!walletQuery.data && !walletQuery.error;
  const totalAmount =
    orderDetails?.amounts?.buyerTotal ??
    quote?.amounts?.buyerTotal ??
    listing?.salePrice ??
    0;
  const hasEnoughBalance = walletReady && walletBalance >= totalAmount;

  const canSubmitOrder = !(
    busy ||
    quoteLoading ||
    !usableQuote ||
    addingAddress ||
    (!!listing?.bundle && !bundleAcknowledged)
  );

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng cửa sổ mua ngay"
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
        />

        <View style={styles.sheet}>
          {/* Drag Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handleBar} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <AppText kind="bold" style={styles.headerTitle} numberOfLines={1}>
                {step === "address_quote"
                  ? listing?.bundle
                    ? "Mua cả bộ sách"
                    : "Mua ngay bản sách"
                  : step === "payment"
                    ? "Thanh toán đơn hàng"
                    : "Đặt mua thành công"}
              </AppText>
              <AppText kind="small" style={styles.headerSubtitle} numberOfLines={1}>
                {step === "address_quote"
                  ? "Giao tận nơi · Xem phí trước khi đặt mua"
                  : step === "payment"
                    ? "Thanh toán an toàn qua Ví Lật Lại"
                    : "Đơn hàng đã được xác nhận"}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng modal mua ngay"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={handleDismiss}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.72 },
              ]}
            >
              <Icon name="close" size={18} color={stitchTokens.wineDark} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Book Mini Card */}
            {!mismatchedPending &&
            (listing || initialBookTitle || orderDetails) ? (
              <View style={styles.bookCard}>
                <View style={styles.bookCoverBox}>
                  {listing?.photos?.[0] ? (
                    <PublicPhoto
                      listingId={listing.id}
                      revisionId={listing.revisionId}
                      mediaId={listing.photos[0].id}
                      label={listing.book.title}
                      active
                      compact
                    />
                  ) : (
                    <Icon name="book" size={22} color={stitchTokens.wine} />
                  )}
                </View>
                <View style={styles.bookInfo}>
                  <AppText
                    kind="bold"
                    style={styles.bookTitle}
                    numberOfLines={2}
                  >
                    {orderDetails?.item?.bundle?.title ||
                      orderDetails?.item?.metadata.title ||
                      listing?.bundle?.title ||
                      listing?.book?.title ||
                      initialBookTitle ||
                      "Bản sách đang đặt mua"}
                  </AppText>
                  {listing?.book?.authors ? (
                    <AppText kind="small" style={styles.bookAuthor} numberOfLines={1}>
                      {listing.book.authors.join(", ") || "Nhiều tác giả"}
                    </AppText>
                  ) : null}
                  <AppText kind="bold" style={styles.bookPrice}>
                    {formatVnd(
                      orderDetails?.amounts?.bookPrice ?? listing?.salePrice,
                    )}
                  </AppText>
                </View>
              </View>
            ) : null}

            {mismatchedPending && !orderDetails ? (
              <Notice>
                Đang khôi phục lệnh đặt mua trước đó. Nội dung mới của bài đăng
                không thay danh sách đã xác nhận; danh sách chính xác sẽ hiện
                trong đơn sau khi đọc được kết quả.
              </Notice>
            ) : (
              <BundleManifest
                bundle={
                  step === "address_quote"
                    ? listing?.bundle
                    : orderDetails?.item?.bundle
                }
              />
            )}
            {listing?.bundle && step === "address_quote" && !pendingCreation ? (
              <Checkbox
                title={`Tôi đã xem danh sách và mua toàn bộ ${listing.bundle.items.length} cuốn trong bộ.`}
                checked={bundleAcknowledged}
                disabled={busy || quoteLoading || !!quote}
                onPress={() => setBundleAcknowledged((v) => !v)}
              />
            ) : null}
            {error ? <Notice tone="error">{error}</Notice> : null}
            {error && step === "address_quote" && !pendingCreation ? (
              <Button
                secondary
                title="Thử lại báo giá đã yêu cầu"
                onPress={() => {
                  retryPinnedQuote.current = true;
                  setQuoteRetry((v) => v + 1);
                }}
                disabled={quoteLoading || busy}
              />
            ) : null}

            {/* STEP 1: Address & Quote */}
            {step === "address_quote" && !pendingCreation && (
              <>
                {readQuote &&
                  readQuote.signature !== signature &&
                  !quoteLoading && (
                    <>
                      <Notice tone="warning">
                        Đã khôi phục báo giá trước. Báo giá này không dành cho
                        địa chỉ hoặc thông tin đang chọn.
                      </Notice>
                      <Button
                        secondary
                        title="Xem phí cho địa chỉ đã chọn"
                        onPress={() => setQuoteRetry((v) => v + 1)}
                        disabled={busy}
                      />
                    </>
                  )}
                {expiredQuote && !quoteLoading && (
                  <>
                    <Notice tone="warning">
                      Báo giá đã hết hạn. Lấy báo giá mới rồi kiểm tra lại tổng
                      tiền trước khi đặt mua.
                    </Notice>
                    <Button
                      secondary
                      title="Lấy báo giá mới"
                      onPress={renewQuote}
                      disabled={busy}
                    />
                  </>
                )}
                {quote?.assessment === "Changed" && !quoteLoading && (
                  <Notice tone="warning">
                    Thông tin sách, địa chỉ hoặc phí đã thay đổi. Chọn lại địa
                    chỉ; nếu vẫn chưa dùng được, đóng cửa sổ và mở lại bản sách
                    để xem thông tin mới.
                  </Notice>
                )}
                {quote?.assessment === "Unavailable" && !quoteLoading && (
                  <Notice tone="warning">
                    Bản sách hiện không còn đủ điều kiện đặt mua. Đóng cửa sổ để
                    xem lại trạng thái bản sách.
                  </Notice>
                )}
                {(quote?.assessment === "Changed" ||
                  quote?.assessment === "Unavailable") &&
                  !quoteLoading && (
                    <>
                      <Button
                        secondary
                        title="Kiểm tra lại báo giá"
                        onPress={() => setQuoteRetry((v) => v + 1)}
                        disabled={busy}
                      />
                      <Button
                        secondary
                        title="Xem lại bản sách"
                        onPress={reviewListing}
                        disabled={busy}
                      />
                    </>
                  )}

                {/* Delivery Address Section */}
                <View style={styles.sectionBlock}>
                  {addressesQuery.isPending && (
                    <Notice>Đang tải địa chỉ nhận sách…</Notice>
                  )}
                  {addressesQuery.error && (
                    <>
                      <Notice tone="error">
                        Chưa tải được địa chỉ. Dữ liệu nhập vẫn được giữ.
                      </Notice>
                      <Button
                        secondary
                        title="Thử tải lại địa chỉ"
                        onPress={() => void addressesQuery.refetch()}
                      />
                    </>
                  )}
                  {areasQuery.error && (
                    <>
                      <Notice tone="error">
                        Chưa tải được khu vực giao nhận.
                      </Notice>
                      <Button
                        secondary
                        title="Thử tải lại khu vực"
                        onPress={() => void areasQuery.refetch()}
                      />
                    </>
                  )}

                  <View style={styles.sectionHeaderRow}>
                    <AppText kind="small" style={styles.sectionOverline}>
                      ĐỊA CHỈ NHẬN SÁCH
                    </AppText>
                    {!addingAddress && addressesQuery.data?.items.length ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Thêm địa chỉ giao hàng mới"
                        onPress={() => setAddingAddress(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                          styles.addAddressPill,
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <Icon name="plus" size={12} color={stitchTokens.wine} strokeWidth={2.4} />
                        <AppText kind="small" style={styles.addAddressText}>
                          Thêm địa chỉ
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {addressesQuery.data?.items.length === 0 &&
                    !addingAddress && (
                      <Button
                        secondary
                        title="Thêm địa chỉ nhận sách"
                        onPress={() => setAddingAddress(true)}
                      />
                    )}

                  {/* Add New Address Form */}
                  {addingAddress ? (
                    <View style={styles.addressFormCard}>
                      <AppText kind="bold" style={styles.addressFormTitle}>
                        Thêm địa chỉ nhận sách mới
                      </AppText>

                      <TextField
                        label="Họ tên người nhận"
                        hint="Ví dụ: Nguyễn Văn A"
                        value={newRecipient}
                        onChangeText={setNewRecipient}
                      />

                      <TextField
                        label="Số điện thoại người nhận"
                        hint="10 chữ số (VD: 0901234567)"
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={newPhone}
                        onChangeText={setNewPhone}
                      />

                      <View style={{ gap: 6 }}>
                        <AppText kind="small" style={styles.fieldSubLabel}>
                          Khu vực giao nhận
                        </AppText>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 6 }}
                        >
                          {areasQuery.data?.localities.map((loc) => {
                            const isLocActive = newLocality === loc.code;
                            return (
                              <Pressable
                                key={loc.code}
                                onPress={() => setNewLocality(loc.code)}
                                style={[
                                  styles.localityChip,
                                  isLocActive && styles.localityChipActive,
                                ]}
                              >
                                <AppText
                                  kind="small"
                                  style={[
                                    styles.localityChipText,
                                    isLocActive && styles.localityChipTextActive,
                                  ]}
                                >
                                  {loc.label}
                                </AppText>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>

                      <TextField
                        label="Địa chỉ cụ thể"
                        hint="Số nhà, tên đường, phường/xã..."
                        value={newDetail}
                        onChangeText={setNewDetail}
                      />

                      {addressError ? (
                        <Notice tone="error">{addressError}</Notice>
                      ) : null}

                      <View style={styles.addressFormActions}>
                        {addressesQuery.data?.items?.length ? (
                          <Button
                            secondary
                            title="Quay lại"
                            onPress={() => setAddingAddress(false)}
                          />
                        ) : null}
                        <Button
                          wine
                          title="Lưu & chọn địa chỉ"
                          busy={busy}
                          onPress={() => void handleSaveNewAddress()}
                        />
                      </View>
                    </View>
                  ) : (
                    /* Existing Addresses List */
                    <View style={{ gap: 8 }}>
                      {addressesQuery.data?.items.map((addr) => {
                        const isSelected = addr.id === effectiveAddressId;
                        return (
                          <Pressable
                            key={addr.id}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isSelected }}
                            onPress={() => setSelectedAddressId(addr.id)}
                            style={({ pressed }) => [
                              styles.addressOption,
                              isSelected && styles.addressOptionSelected,
                              pressed && { opacity: 0.88 },
                            ]}
                          >
                            <View style={styles.addressOptionBody}>
                              <AppText
                                kind="bold"
                                style={styles.addressRecipient}
                                numberOfLines={1}
                              >
                                {addr.recipientName} · {addr.phone}
                              </AppText>
                              <AppText
                                kind="small"
                                style={styles.addressDetail}
                                numberOfLines={2}
                              >
                                {addr.detail}
                              </AppText>
                            </View>
                            <View
                              style={[
                                styles.radioCircle,
                                isSelected && styles.radioCircleSelected,
                              ]}
                            >
                              {isSelected ? (
                                <Icon
                                  name="check"
                                  size={11}
                                  color={stitchTokens.white}
                                  strokeWidth={2.8}
                                />
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Price Breakdown Card */}
                <View style={styles.summaryCard}>
                  <AppText kind="small" style={styles.sectionOverline}>
                    CHI TIẾT THANH TOÁN
                  </AppText>

                  <View style={styles.summaryRows}>
                    <View style={styles.summaryRow}>
                      <AppText kind="small" style={styles.summaryLabel}>
                        Tiền sách
                      </AppText>
                      <AppText kind="bold" style={styles.summaryValue}>
                        {formatVnd(
                          quote?.amounts.bookPrice ?? listing?.salePrice,
                        )}
                      </AppText>
                    </View>

                    <View style={styles.summaryRow}>
                      <AppText kind="small" style={styles.summaryLabel}>
                        Phí vận chuyển
                      </AppText>
                      {quoteLoading ? (
                        <View style={styles.inlineLoading}>
                          <ActivityIndicator size="small" color={stitchTokens.wine} />
                          <AppText kind="small" style={styles.summaryMuted}>
                            Đang tính…
                          </AppText>
                        </View>
                      ) : quote ? (
                        quote.amounts.shippingFee > 0 ? (
                          <AppText kind="bold" style={styles.summaryValue}>
                            {formatVnd(quote.amounts.shippingFee)}
                          </AppText>
                        ) : (
                          <View style={styles.freeShipBadge}>
                            <AppText kind="small" style={styles.freeShipText}>
                              Miễn phí
                            </AppText>
                          </View>
                        )
                      ) : (
                        <AppText kind="small" style={styles.summaryMuted}>
                          Chưa có báo giá
                        </AppText>
                      )}
                    </View>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.totalRow}>
                    <AppText kind="bold" style={styles.totalLabel}>
                      Tổng thanh toán
                    </AppText>
                    <AppText kind="bold" style={styles.totalValue}>
                      {quoteLoading
                        ? "…"
                        : quote
                          ? formatVnd(quote.amounts.buyerTotal)
                          : "—"}
                    </AppText>
                  </View>

                  {quote ? (
                    <View style={styles.feeFootnoteRow}>
                      <Icon name="info" size={13} color={stitchTokens.softStone} />
                      <AppText kind="small" style={styles.feeFootnoteText}>
                        {buyerSaleFeeText(quote.amounts.commissionBps)}
                      </AppText>
                    </View>
                  ) : null}
                </View>

                {/* Compact Protection Note */}
                <View style={styles.protectionCard}>
                  <Icon name="shield" size={16} color={stitchTokens.likeNewGreen} />
                  <View style={styles.protectionBody}>
                    <AppText kind="bold" style={styles.protectionTitle}>
                      Bảo chứng Ví Lật Lại · Giữ sách 15 phút
                    </AppText>
                    <AppText kind="small" style={styles.protectionDesc}>
                      Tiền đơn được Ví giữ an toàn trong lúc giao nhận và kiểm tra sách. Theo dõi các mốc tiếp theo trong chi tiết đơn.
                    </AppText>
                  </View>
                </View>
              </>
            )}

            {step === "address_quote" && pendingCreation && (
              <>
                <Notice tone="warning">
                  Chưa xác minh xong yêu cầu tạo đơn trước. Thử lại giữ nguyên
                  báo giá và yêu cầu; chưa đổi địa chỉ hoặc tạo đơn khác.
                </Notice>
                <Button
                  wine
                  title="Thử lại tạo đơn trước"
                  busy={busy}
                  onPress={() => void handleCreateOrder()}
                />
              </>
            )}
            {step === "payment" && !orderDetails && (
              <>
                <Notice>
                  Đơn đã có mã. Cần tải thông tin đơn trước khi thanh toán;
                  không tạo đơn thay thế.
                </Notice>
                <Button
                  wine
                  title="Thử tải lại đơn đã tạo"
                  busy={busy}
                  onPress={() => void retryOrderRead()}
                />
              </>
            )}

            {/* STEP 2: Payment Step */}
            {step === "payment" &&
              orderDetails &&
              !orderDetails.paymentEnabled &&
              !pending && (
                <>
                  <Notice>
                    Đơn không còn ở bước thanh toán. Mở chi tiết để xem trạng
                    thái, thời hạn và việc tiếp theo.
                  </Notice>
                  <Button
                    wine
                    title="Mở chi tiết đơn"
                    onPress={openCreatedOrder}
                  />
                </>
              )}
            {step === "payment" &&
              orderDetails &&
              (orderDetails.paymentEnabled || pending) && (
                <>
                  <View style={styles.deadlineBanner}>
                    <View style={styles.deadlineHeader}>
                      <Icon name="clock" size={16} color={stitchTokens.goldBronze} />
                      <AppText kind="bold" style={styles.deadlineTitle}>
                        Đang giữ bản sách trong 15 phút
                      </AppText>
                    </View>
                    <AppText kind="small" style={styles.deadlineBody}>
                      Hạn thanh toán:{" "}
                      <AppText kind="bold" style={styles.deadlineTime}>
                        {new Date(
                          orderDetails.paymentDeadline,
                        ).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </AppText>
                      . Quá hạn, bản sách sẽ tự động mở lại cho bạn đọc khác.
                    </AppText>
                  </View>

                  {/* Wallet Balance & Payment Breakdown Card */}
                  <View style={styles.summaryCard}>
                    <AppText kind="small" style={styles.sectionOverline}>
                      THANH TOÁN QUA VÍ LẬT LẠI
                    </AppText>

                    <View style={styles.summaryRows}>
                      <View style={styles.summaryRow}>
                        <AppText kind="small" style={styles.summaryLabel}>
                          Tiền sách
                        </AppText>
                        <AppText kind="bold" style={styles.summaryValue}>
                          {formatVnd(orderDetails.amounts.bookPrice)}
                        </AppText>
                      </View>
                      <View style={styles.summaryRow}>
                        <AppText kind="small" style={styles.summaryLabel}>
                          Phí vận chuyển
                        </AppText>
                        {orderDetails.amounts.shippingFee > 0 ? (
                          <AppText kind="bold" style={styles.summaryValue}>
                            {formatVnd(orderDetails.amounts.shippingFee)}
                          </AppText>
                        ) : (
                          <View style={styles.freeShipBadge}>
                            <AppText kind="small" style={styles.freeShipText}>
                              Miễn phí
                            </AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.summaryRow}>
                        <AppText kind="small" style={styles.summaryLabel}>
                          Số dư Ví khả dụng
                        </AppText>
                        <AppText
                          kind="bold"
                          style={[
                            styles.summaryValue,
                            walletReady && {
                              color: hasEnoughBalance
                                ? stitchTokens.likeNewGreen
                                : stitchTokens.crimson,
                            },
                          ]}
                        >
                          {walletQuery.isPending
                            ? "Đang tải…"
                            : walletReady
                              ? formatVnd(walletBalance)
                              : "Chưa tải được"}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.summaryDivider} />

                    <View style={styles.totalRow}>
                      <AppText kind="bold" style={styles.totalLabel}>
                        Số tiền cần trả
                      </AppText>
                      <AppText kind="bold" style={styles.totalValue}>
                        {formatVnd(orderDetails.amounts.buyerTotal)}
                      </AppText>
                    </View>

                    <View style={styles.feeFootnoteRow}>
                      <Icon name="info" size={13} color={stitchTokens.softStone} />
                      <AppText kind="small" style={styles.feeFootnoteText}>
                        {buyerSaleFeeText(orderDetails.amounts.commissionBps)}
                      </AppText>
                    </View>
                  </View>

                  {/* Compact Protection Note for Step 2 */}
                  <View style={styles.protectionCard}>
                    <Icon name="shield" size={16} color={stitchTokens.likeNewGreen} />
                    <View style={styles.protectionBody}>
                      <AppText kind="bold" style={styles.protectionTitle}>
                        Tiền được bảo chứng qua Ví Lật Lại
                      </AppText>
                      <AppText kind="small" style={styles.protectionDesc}>
                        Ví giữ toàn bộ tiền đơn trong lúc giao nhận và kiểm tra sách.
                      </AppText>
                    </View>
                  </View>

                  {walletReady && !hasEnoughBalance && (
                    <Notice tone="warning">
                      Số dư ví chưa đủ để thanh toán đơn này. Vui lòng nạp thêm
                      trước khi hết hạn 15 phút.
                    </Notice>
                  )}

                  {pending ? (
                    <View style={{ gap: space.sm }}>
                      <Notice tone="warning">
                        Chưa xác minh xong thao tác trước. Thử lại cùng yêu
                        cầu; chưa thanh toán hoặc hủy bằng lệnh khác.
                      </Notice>
                      {pending === "pay" || pending === "cancel" ? (
                        <Button
                          wine
                          busy={busy}
                          title={
                            pending === "pay"
                              ? "Thử lại thanh toán trước"
                              : "Thử lại hủy đơn trước"
                          }
                          onPress={() =>
                            void (pending === "pay"
                              ? handlePayOrder()
                              : handleCancelOrder())
                          }
                        />
                      ) : (
                        <Notice>
                          Mở chi tiết đơn để xác minh quyết định trước.
                        </Notice>
                      )}
                    </View>
                  ) : null}
                </>
              )}

            {/* STEP 3: Success Step */}
            {step === "success" && (
              <View style={styles.successWrap}>
                <View style={styles.successIconCircle}>
                  <Icon
                    name="check"
                    size={30}
                    color={stitchTokens.likeNewGreen}
                    strokeWidth={2.5}
                  />
                </View>

                <AppText kind="heading" style={styles.successTitle}>
                  Đặt mua thành công!
                </AppText>

                <AppText kind="body" style={styles.successBody}>
                  Tiền đơn đã được Ví Lật Lại bảo chứng an toàn. Mở chi tiết đơn
                  để theo dõi quá trình gửi sách và mốc kiểm tra.
                </AppText>

                <View style={{ width: "100%", marginTop: 4 }}>
                  <Button
                    wine
                    title="Xem đơn vừa thanh toán"
                    onPress={openCreatedOrder}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Anchored Bottom CTA Bar (Step 1: Ready to Create Order) */}
          {step === "address_quote" && !pendingCreation && !addingAddress ? (
            <View
              style={[
                styles.stickyFooter,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xác nhận đặt mua"
                accessibilityState={{ disabled: !canSubmitOrder, busy }}
                disabled={!canSubmitOrder}
                onPress={() => void handleCreateOrder()}
                style={({ pressed }) => [
                  styles.stickyPrimaryBtn,
                  !canSubmitOrder && styles.stickyPrimaryBtnDisabled,
                  pressed && canSubmitOrder && { opacity: 0.86 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={stitchTokens.gold} />
                ) : null}
                <AppText kind="bold" style={styles.stickyPrimaryBtnText} numberOfLines={1}>
                  {busy ? "Đang tạo đơn…" : "Xác nhận đặt mua"}
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {/* Anchored Bottom CTA Bar (Step 2: Wallet Payment) */}
          {step === "payment" &&
          orderDetails &&
          orderDetails.paymentEnabled &&
          !pending ? (
            <View
              style={[
                styles.stickyFooterStacked,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              {!walletReady ? (
                <Button
                  secondary
                  title="Thử tải lại số dư ví"
                  busy={walletQuery.isFetching}
                  onPress={() => void walletQuery.refetch()}
                />
              ) : hasEnoughBalance ? (
                <Button
                  wine
                  title={`Thanh toán ngay · ${formatVnd(orderDetails.amounts.buyerTotal)}`}
                  busy={busy}
                  disabled={!orderDetails.paymentEnabled}
                  onPress={() => void handlePayOrder()}
                />
              ) : (
                <Button
                  wine
                  title={`Nạp thêm vào Ví (thiếu ${formatVnd(Math.max(0, orderDetails.amounts.buyerTotal - walletBalance))})`}
                  onPress={() => setShowTopupModal(true)}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hủy đơn đặt mua"
                disabled={busy || orderDetails.canCancel === false}
                onPress={() => {
                  setError("");
                  setConfirmCancelOpen(true);
                }}
                style={({ pressed }) => [
                  styles.cancelOrderLink,
                  (busy || orderDetails.canCancel === false) && { opacity: 0.45 },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <AppText kind="bold" style={styles.cancelOrderLinkText}>
                  Hủy đơn đặt mua
                </AppText>
              </Pressable>
            </View>
          ) : null}

          {/* Safe area spacer when no sticky footer is active */}
          {!(
            (step === "address_quote" && !pendingCreation && !addingAddress) ||
            (step === "payment" && orderDetails && orderDetails.paymentEnabled && !pending)
          ) ? (
            <View style={{ height: Math.max(insets.bottom, 14) }} />
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmCancelOpen}
        title="Hủy đơn đặt mua này?"
        message={`Đơn #${(createdOrderId ?? "").slice(0, 8).toUpperCase()}${orderDetails ? ` (${formatVnd(orderDetails.amounts.buyerTotal)})` : ""} chưa được thanh toán. Nếu hủy, quyền giữ sách sẽ kết thúc ngay và người khác có thể mua bản sách này.`}
        confirmLabel="Hủy đơn hàng"
        destructive
        busy={busy}
        error={error || undefined}
        onCancel={() => !busy && setConfirmCancelOpen(false)}
        onConfirm={() => void handleCancelOrder()}
      />

      {/* Inline VNPay Topup Modal so user does not lose order progress */}
      <TopupModal
        visible={showTopupModal}
        onClose={() => setShowTopupModal(false)}
        initialAmount={
          orderDetails
            ? Math.max(
                10_000,
                Math.ceil(
                  (orderDetails.amounts.buyerTotal - walletBalance) / 10_000,
                ) * 10_000,
              )
            : 100_000
        }
        onSuccess={() => {
          void walletQuery.refetch();
          setShowTopupModal(false);
        }}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: stitchTokens.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    overflow: "hidden",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.cardBorder,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: stitchTokens.wineDark,
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.subtleGray,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: stitchTokens.pillWarmBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },

  // Book Summary Row
  bookCard: {
    flexDirection: "row",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
  },
  bookCoverBox: {
    width: 48,
    height: 66,
    borderRadius: 6,
    backgroundColor: stitchTokens.white,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bookInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bookTitle: {
    fontSize: 14,
    lineHeight: 19,
    color: stitchTokens.wineDark,
  },
  bookAuthor: {
    fontSize: 12,
    lineHeight: 16,
    color: stitchTokens.subtleGray,
  },
  bookPrice: {
    fontSize: 14.5,
    lineHeight: 19,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
    marginTop: 3,
  },

  // Section Headers
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sectionOverline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: stitchTokens.subtleGray,
  },
  addAddressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseParchment,
  },
  addAddressText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },

  // Address Options
  addressOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  addressOptionSelected: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
  },
  addressOptionBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  addressRecipient: {
    fontSize: 13.5,
    lineHeight: 18,
    color: stitchTokens.wineDark,
  },
  addressDetail: {
    fontSize: 12.5,
    lineHeight: 17,
    color: stitchTokens.subtleGray,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: stitchTokens.radioDisabledBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioCircleSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },

  // Inline Address Form
  addressFormCard: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
  },
  addressFormTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  fieldSubLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  localityChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  localityChipActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  localityChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  localityChipTextActive: {
    color: stitchTokens.white,
    fontWeight: "700",
  },
  addressFormActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },

  // Summary / Price Breakdown Card
  summaryCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 14,
    gap: 10,
  },
  summaryRows: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13.5,
    lineHeight: 18,
    color: stitchTokens.subtleGray,
  },
  summaryValue: {
    fontSize: 13.5,
    lineHeight: 18,
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
  },
  summaryMuted: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  freeShipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  freeShipText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
    includeFontPadding: false,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: stitchTokens.borderParchmentSoft,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  totalLabel: {
    fontSize: 14.5,
    lineHeight: 20,
    color: stitchTokens.wineDark,
  },
  totalValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  feeFootnoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 2,
  },
  feeFootnoteText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: stitchTokens.softStone,
  },

  // Compact Protection Card
  protectionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: stitchTokens.cardWarmLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
    padding: 12,
  },
  protectionBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  protectionTitle: {
    fontSize: 12.5,
    lineHeight: 17,
    color: stitchTokens.wineDark,
  },
  protectionDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.subtleGray,
  },

  // Step 2 Deadline Banner
  deadlineBanner: {
    backgroundColor: stitchTokens.amberWarmBg,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorderSoft,
  },
  deadlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deadlineTitle: {
    fontSize: 13.5,
    color: stitchTokens.wineDark,
  },
  deadlineBody: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.espresso,
  },
  deadlineTime: {
    fontSize: 12.5,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },

  // Step 3 Success
  successWrap: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 18,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: stitchTokens.likeNewGreenBg,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    textAlign: "center",
    color: stitchTokens.wineDark,
  },
  successBody: {
    textAlign: "center",
    fontSize: 13.5,
    lineHeight: 20,
    color: stitchTokens.subtleGray,
  },

  // Sticky Bottom Checkout Footer
  stickyFooter: {
    paddingHorizontal: space.lg,
    paddingTop: 10,
    backgroundColor: stitchTokens.white,
    borderTopWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
  stickyPrimaryBtn: {
    width: "100%",
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  stickyPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  stickyPrimaryBtnText: {
    fontSize: 14.5,
    lineHeight: 19,
    color: stitchTokens.gold,
    includeFontPadding: false,
  },
  stickyFooterStacked: {
    paddingHorizontal: space.lg,
    paddingTop: 12,
    gap: 8,
    backgroundColor: stitchTokens.white,
    borderTopWidth: 1,
    borderColor: stitchTokens.borderParchmentSoft,
  },
  cancelOrderLink: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  cancelOrderLinkText: {
    fontSize: 13,
    color: stitchTokens.crimson,
  },
});
