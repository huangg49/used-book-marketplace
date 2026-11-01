import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  acknowledgedBuyNowOrder,
  forgetBuyNowOrder,
  pendingBuyNowOrder,
  pendingOrderResponse,
  sendBuyNowOrder,
  sendOrderResponse,
} from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Button,
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
  quoteSchema,
  type OrderDetails,
  type Quote,
} from "./contracts";
import { z } from "zod";

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
  const { client } = useSession();
  const orderId =
    props.initialOrderId ??
    (props.listing
      ? acknowledgedBuyNowOrder(client, props.listing.id)
      : undefined);
  // Keep address drafts across Back; a closed checkout has no live UI callbacks.
  // Shared intents and acknowledged IDs survive navigation within this identity.
  return (
    <BuyNowSession
      key={`${props.listing?.id ?? ""}:${orderId ?? ""}`}
      {...props}
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
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Order state
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

  function handleDismiss() {
    lifecycle.current.active = false;
    lifecycle.current.generation++;
    setBusy(false);
    onClose();
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
      !effectiveAddressId ||
      addingAddress ||
      step !== "address_quote" ||
      Boolean(initialOrderId) ||
      pendingCreation
    )
      return;
    const address = items.find((a) => a.id === effectiveAddressId);
    if (!address) return;

    let cancelled = false;
    async function fetchQuote() {
      setQuoteLoading(true);
      setError("");
      try {
        const quoteKey = Crypto.randomUUID();
        const quoteResult = await client.request(
          `/listings/${listing!.id}/quotes`,
          z.object({ entityId: z.string().uuid() }),
          {
            method: "POST",
            headers: { "Idempotency-Key": quoteKey },
            body: JSON.stringify({
              expectedListingVersion: listing!.version,
              expectedListingRevisionId: listing!.revisionId,
              destinationAddressId: address!.id,
              expectedDestinationAddressVersion: address!.version,
              method: "DirectDelivery",
            }),
          },
        );

        if (cancelled) return;
        const fetchedQuote = await client.request(
          `/me/quotes/${quoteResult.entityId}`,
          quoteSchema,
        );
        if (!cancelled) {
          setQuote(fetchedQuote);
        }
      } catch (err) {
        if (!cancelled) {
          setError(buyNowError(err));
          setQuote(null);
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
    effectiveAddressId,
    addingAddress,
    step,
    initialOrderId,
    pendingCreation,
    client,
    items,
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
    if (!listing || (!quote && !pendingCreation) || busy) return;
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
      if (isCurrent(generation)) setError(buyNowError(err));
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

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          backgroundColor: stitchTokens.modalScrim,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: stitchTokens.white,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "92%",
            paddingTop: space.md,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: space.lg,
              paddingBottom: space.sm,
              borderBottomWidth: 1,
              borderColor: stitchTokens.parchment,
            }}
          >
            <View>
              <AppText
                kind="bold"
                color={stitchTokens.wineDark}
                style={{ fontSize: 18 }}
              >
                {step === "address_quote"
                  ? "Mua ngay bản sách"
                  : step === "payment"
                    ? "Thanh toán đơn hàng"
                    : "Đặt mua thành công"}
              </AppText>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                {step === "address_quote"
                  ? "Giao tận nơi · Giữ sách 15 phút"
                  : step === "payment"
                    ? "Thanh toán an toàn qua Ví Lật Lại"
                    : "Đơn hàng đã được xác nhận"}
              </AppText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng modal mua ngay"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={handleDismiss}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: stitchTokens.roseWarmSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" size={20} color={stitchTokens.wine} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              gap: space.md,
            }}
          >
            {/* Book Mini Card */}
            {listing || initialBookTitle || orderDetails ? (
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: stitchTokens.warmIvory,
                  borderRadius: 14,
                  padding: space.sm,
                  gap: space.md,
                  borderWidth: 1,
                  borderColor: stitchTokens.peachBorder,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 70,
                    borderRadius: 6,
                    backgroundColor: stitchTokens.parchment,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: stitchTokens.peachBorder,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
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
                    <Icon name="book" size={24} color={stitchTokens.wine} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText
                    kind="bold"
                    color={stitchTokens.wineDark}
                    numberOfLines={2}
                    style={{ fontSize: 14 }}
                  >
                    {listing?.book?.title ??
                      initialBookTitle ??
                      "Bản sách đang đặt mua"}
                  </AppText>
                  {listing?.book?.authors ? (
                    <AppText kind="small" color={stitchTokens.subtleGray}>
                      {listing.book.authors.join(", ") || "Nhiều tác giả"}
                    </AppText>
                  ) : null}
                  <AppText
                    kind="bold"
                    color={stitchTokens.wine}
                    style={{ fontSize: 15, marginTop: 2 }}
                  >
                    {formatVnd(
                      orderDetails?.amounts?.bookPrice ?? listing?.salePrice,
                    )}
                  </AppText>
                </View>
              </View>
            ) : null}

            {error ? <Notice tone="error">{error}</Notice> : null}

            {/* STEP 1: Address & Quote */}
            {step === "address_quote" && !pendingCreation && (
              <>
                {/* Delivery Address Section */}
                <View style={{ gap: space.xs }}>
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
                  {addressesQuery.data?.items.length === 0 &&
                    !addingAddress && (
                      <Button
                        secondary
                        title="Thêm địa chỉ nhận sách"
                        onPress={() => setAddingAddress(true)}
                      />
                    )}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <AppText
                      kind="label"
                      color={stitchTokens.wine}
                      style={{ fontWeight: "700" }}
                    >
                      ĐỊA CHỈ NHẬN SÁCH (DIRECT DELIVERY)
                    </AppText>
                    {!addingAddress && addressesQuery.data?.items.length ? (
                      <Pressable
                        onPress={() => setAddingAddress(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppText
                          kind="small"
                          color={stitchTokens.wine}
                          style={{ fontWeight: "700" }}
                        >
                          + Thêm địa chỉ mới
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Add New Address Form */}
                  {addingAddress ? (
                    <View
                      style={{
                        backgroundColor: stitchTokens.warmIvory,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: stitchTokens.peachBorder,
                        padding: space.md,
                        gap: space.sm,
                      }}
                    >
                      <AppText kind="bold" color={stitchTokens.wineDark}>
                        Nhập địa chỉ giao hàng mới
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

                      <View style={{ gap: 4 }}>
                        <AppText
                          kind="small"
                          color={stitchTokens.wineDark}
                          style={{ fontWeight: "600" }}
                        >
                          Khu vực luân chuyển
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
                                style={{
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  borderRadius: 8,
                                  backgroundColor: isLocActive
                                    ? stitchTokens.wine
                                    : stitchTokens.parchment,
                                  borderWidth: 1,
                                  borderColor: isLocActive
                                    ? stitchTokens.wine
                                    : stitchTokens.peachBorder,
                                }}
                              >
                                <AppText
                                  kind="small"
                                  color={
                                    isLocActive
                                      ? stitchTokens.white
                                      : stitchTokens.wineDark
                                  }
                                  style={{
                                    fontWeight: isLocActive ? "700" : "500",
                                  }}
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

                      <View
                        style={{
                          flexDirection: "row",
                          gap: space.sm,
                          marginTop: 4,
                        }}
                      >
                        {addressesQuery.data?.items?.length ? (
                          <Button
                            secondary
                            title="Quay lại danh sách"
                            onPress={() => setAddingAddress(false)}
                          />
                        ) : null}
                        <Button
                          wine
                          title="Lưu và chọn nơi nhận"
                          busy={busy}
                          onPress={() => void handleSaveNewAddress()}
                        />
                      </View>
                    </View>
                  ) : (
                    /* Existing Addresses List */
                    <View style={{ gap: space.xs }}>
                      {addressesQuery.data?.items.map((addr) => {
                        const isSelected = addr.id === effectiveAddressId;
                        return (
                          <Pressable
                            key={addr.id}
                            onPress={() => setSelectedAddressId(addr.id)}
                            style={{
                              backgroundColor: isSelected
                                ? stitchTokens.roseWarmSurface
                                : stitchTokens.warmIvory,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected
                                ? stitchTokens.wine
                                : stitchTokens.borderWarm,
                              borderRadius: 12,
                              padding: space.sm,
                              gap: 2,
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
                                kind="bold"
                                color={stitchTokens.wineDark}
                                style={{ fontSize: 13 }}
                              >
                                {addr.recipientName} · {addr.phone}
                              </AppText>
                              {isSelected ? (
                                <View
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 8,
                                    backgroundColor: stitchTokens.wine,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Icon
                                    name="check"
                                    size={10}
                                    color={stitchTokens.gold}
                                  />
                                </View>
                              ) : null}
                            </View>
                            <AppText
                              kind="small"
                              color={stitchTokens.subtleGray}
                              numberOfLines={2}
                            >
                              {addr.detail}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Price Breakdown / Quote Result */}
                <View
                  style={{
                    backgroundColor: stitchTokens.warmIvory,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: stitchTokens.borderWarm,
                    padding: space.md,
                    gap: space.xs,
                  }}
                >
                  <AppText
                    kind="label"
                    color={stitchTokens.wine}
                    style={{ fontWeight: "700" }}
                  >
                    CHI PHÍ ĐƠN HÀNG
                  </AppText>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 2,
                    }}
                  >
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Tiền sách
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {formatVnd(
                        quote?.amounts.bookPrice ?? listing?.salePrice,
                      )}
                    </AppText>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 2,
                    }}
                  >
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Phí giao hàng
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {quoteLoading
                        ? "Đang tính phí..."
                        : quote
                          ? formatVnd(quote.amounts.shippingFee)
                          : "Chưa có báo giá"}
                    </AppText>
                  </View>

                  <View
                    style={{
                      height: 1,
                      backgroundColor: stitchTokens.borderWarm,
                      marginVertical: 4,
                    }}
                  />

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 2,
                    }}
                  >
                    <AppText
                      kind="bold"
                      color={stitchTokens.wineDark}
                      style={{ fontSize: 16 }}
                    >
                      Tổng thanh toán
                    </AppText>
                    <AppText
                      kind="bold"
                      color={stitchTokens.wine}
                      style={{ fontSize: 18, fontWeight: "800" }}
                    >
                      {quoteLoading
                        ? "..."
                        : quote
                          ? formatVnd(quote.amounts.buyerTotal)
                          : "Chưa có báo giá"}
                    </AppText>
                  </View>
                </View>

                <Notice tone="info">
                  Bấm &quot;Xác nhận đặt mua&quot; sẽ giữ bản sách trong 15 phút
                  để thanh toán qua Ví Lật Lại. Sau thanh toán, người bán chuẩn
                  bị bàn giao theo thời hạn tại đơn.
                </Notice>

                {/* Order Action Button */}
                <Button
                  wine
                  title={busy ? "Đang tạo đơn mua..." : "Xác nhận đặt mua"}
                  disabled={busy || quoteLoading || !quote || addingAddress}
                  onPress={() => void handleCreateOrder()}
                />
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
                  <View
                    style={{
                      backgroundColor: stitchTokens.goldLight,
                      borderRadius: 12,
                      padding: space.md,
                      gap: 6,
                      borderWidth: 1,
                      borderColor: stitchTokens.goldDark,
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
                        name="clock"
                        size={18}
                        color={stitchTokens.wineDark}
                      />
                      <AppText
                        kind="bold"
                        color={stitchTokens.wineDark}
                        style={{ fontSize: 14 }}
                      >
                        Đang giữ sách trong 15 phút
                      </AppText>
                    </View>
                    <AppText kind="small" color={stitchTokens.wineDark}>
                      Hạn thanh toán:{" "}
                      {new Date(
                        orderDetails.paymentDeadline,
                      ).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      . Quá thời gian này, sách sẽ tự động mở lại cho người khác
                      mua.
                    </AppText>
                  </View>

                  {/* Wallet Balance Card */}
                  <View
                    style={{
                      backgroundColor: stitchTokens.warmIvory,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: stitchTokens.peachBorder,
                      padding: space.md,
                      gap: space.xs,
                    }}
                  >
                    <AppText
                      kind="label"
                      color={stitchTokens.wine}
                      style={{ fontWeight: "700" }}
                    >
                      VÍ LẬT LẠI (SỐ DƯ THANH TOÁN)
                    </AppText>

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <AppText kind="body" color={stitchTokens.subtleGray}>
                        Số dư khả dụng:
                      </AppText>
                      <AppText
                        kind="bold"
                        color={stitchTokens.wineDark}
                        style={{ fontSize: 16 }}
                      >
                        {walletQuery.isPending
                          ? "Đang tải…"
                          : walletReady
                            ? formatVnd(walletBalance)
                            : "Chưa tải được"}
                      </AppText>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <AppText kind="body" color={stitchTokens.subtleGray}>
                        Số tiền cần trả:
                      </AppText>
                      <AppText
                        kind="bold"
                        color={stitchTokens.wine}
                        style={{ fontSize: 18, fontWeight: "800" }}
                      >
                        {formatVnd(orderDetails.amounts.buyerTotal)}
                      </AppText>
                    </View>
                  </View>

                  {walletReady && !hasEnoughBalance && (
                    <Notice tone="warning">
                      Số dư ví không đủ để thanh toán đơn hàng này. Vui lòng nạp
                      thêm tiền vào ví trước khi hết hạn 15 phút.
                    </Notice>
                  )}

                  <View style={{ gap: space.sm, marginTop: space.sm }}>
                    {pending ? (
                      <>
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
                      </>
                    ) : (
                      <>
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
                            title={`Thanh toán ngay (${formatVnd(orderDetails.amounts.buyerTotal)})`}
                            busy={busy}
                            disabled={!orderDetails.paymentEnabled}
                            onPress={() => void handlePayOrder()}
                          />
                        ) : (
                          <Button
                            wine
                            title={`Nạp tiền vào Ví (Thiếu ${formatVnd(Math.max(0, orderDetails.amounts.buyerTotal - walletBalance))})`}
                            onPress={() => setShowTopupModal(true)}
                          />
                        )}
                        <Button
                          secondary
                          destructive
                          title="Hủy đơn đặt mua"
                          disabled={busy || orderDetails.canCancel === false}
                          onPress={() => void handleCancelOrder()}
                        />
                      </>
                    )}
                  </View>
                </>
              )}

            {/* STEP 3: Success Step */}
            {step === "success" && (
              <View
                style={{
                  alignItems: "center",
                  gap: space.md,
                  paddingVertical: space.lg,
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: stitchTokens.likeNewGreenBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name="check"
                    size={32}
                    color={stitchTokens.likeNewGreen}
                  />
                </View>

                <AppText
                  kind="heading"
                  color={stitchTokens.wineDark}
                  style={{ textAlign: "center" }}
                >
                  Đặt mua thành công!
                </AppText>

                <AppText
                  kind="body"
                  color={stitchTokens.subtleGray}
                  style={{ textAlign: "center", lineHeight: 22 }}
                >
                  Tiền đang được giữ trong giao dịch. Mở chi tiết để theo dõi
                  trạng thái, thời hạn và bước tiếp theo.
                </AppText>

                <Button
                  wine
                  title="Xem đơn vừa thanh toán"
                  onPress={openCreatedOrder}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

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
