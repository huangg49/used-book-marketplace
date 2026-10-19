import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import { addressBook, addressReceipt } from "../addresses/contracts";
import { walletSummary } from "../wallet/contracts";
import {
  buyNowError,
  orderDetailsSchema,
  orderReceiptSchema,
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

export function BuyNowModal({
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

  const [step, setStep] = useState<"address_quote" | "payment" | "success">(
    "address_quote",
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
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);

  // Operation state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const orderAttemptKey = useRef<string>(Crypto.randomUUID());
  const payAttemptKey = useRef<string>(Crypto.randomUUID());

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
    setStep("address_quote");
    setCreatedOrderId(null);
    setOrderDetails(null);
    setError("");
    setBusy(false);
    onClose();
  }

  // Load existing order when initialOrderId is provided
  useEffect(() => {
    if (!visible || !initialOrderId || state.status !== "authenticated") return;
    let cancelled = false;
    async function loadInitialOrder() {
      try {
        setBusy(true);
        setError("");
        const details = await client.request(
          `/me/orders/${initialOrderId}`,
          orderDetailsSchema,
        );
        if (!cancelled) {
          setOrderDetails(details);
          setCreatedOrderId(initialOrderId ?? null);
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
  }, [visible, initialOrderId, state.status, client]);


  // Request Quote automatically when selected address changes
  useEffect(() => {
    if (!visible || !listing || !effectiveAddressId || addingAddress) return;
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
  }, [visible, listing, effectiveAddressId, addingAddress, client, items]);


  // Handle saving new address inline
  async function handleSaveNewAddress() {
    if (!newRecipient.trim() || newPhone.trim().length !== 10 || !newLocality || !newDetail.trim()) {
      setAddressError("Vui lòng điền đủ họ tên, SĐT 10 số, khu vực và địa chỉ chi tiết.");
      return;
    }
    setBusy(true);
    setAddressError("");
    try {
      const addKey = Crypto.randomUUID();
      const saved = await client.request(
        "/me/addresses",
        addressReceipt,
        {
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
        },
      );
      await addressesQuery.refetch();
      setSelectedAddressId(saved.addressId);
      setAddingAddress(false);
      setNewRecipient("");
      setNewPhone("");
      setNewDetail("");
      setNewLocality("");
    } catch (err) {
      setAddressError(buyNowError(err));
    } finally {
      setBusy(false);
    }
  }

  // Handle Create Buy Now Order
  async function handleCreateOrder() {
    if (!listing || !quote || busy) return;
    setBusy(true);
    setError("");
    try {
      const receipt = await client.request(
        "/orders/buy-now",
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": orderAttemptKey.current },
          body: JSON.stringify({
            quoteId: quote.id,
            expectedQuoteVersion: quote.version,
            expectedListingVersion: quote.listingVersion,
            expectedListingRevisionId: quote.listingRevisionId,
          }),
        },
      );

      setCreatedOrderId(receipt.entityId);
      // Fetch fresh order details
      const details = await client.request(
        `/me/orders/${receipt.entityId}`,
        orderDetailsSchema,
      );
      setOrderDetails(details);
      setStep("payment");
      void cache.invalidateQueries({ queryKey: ["public-listing", listing.id] });
      void walletQuery.refetch();
    } catch (err) {
      setError(buyNowError(err));
    } finally {
      setBusy(false);
    }
  }

  // Handle Pay Order via Wallet
  async function handlePayOrder() {
    if (!createdOrderId || !orderDetails || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${createdOrderId}/pay`,
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": payAttemptKey.current },
          body: JSON.stringify({
            expectedVersion: orderDetails.version,
          }),
        },
      );

      setStep("success");
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["wallet"] });
      void cache.invalidateQueries({ queryKey: ["my-orders"] });
      onSuccess?.(createdOrderId);
    } catch (err) {
      setError(buyNowError(err));
    } finally {
      setBusy(false);
    }
  }

  // Handle Cancel Order
  async function handleCancelOrder() {
    if (!createdOrderId || !orderDetails || busy) return;
    setBusy(true);
    setError("");
    try {
      await client.request(
        `/orders/${createdOrderId}/cancel`,
        orderReceiptSchema,
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify({
            expectedVersion: orderDetails.version,
          }),
        },
      );
      void cache.invalidateQueries({ queryKey: ["public-listing"] });
      void cache.invalidateQueries({ queryKey: ["my-orders"] });
      handleDismiss();
    } catch (err) {
      setError(buyNowError(err));
    } finally {
      setBusy(false);
    }
  }

  const walletBalance = walletQuery.data?.available ?? 0;
  const totalAmount = orderDetails?.amounts?.buyerTotal ?? quote?.amounts?.buyerTotal ?? (listing?.salePrice ?? 0);
  const hasEnoughBalance = walletBalance >= totalAmount;

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
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="book" size={24} color={stitchTokens.wine} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText
                    kind="bold"
                    color={stitchTokens.wineDark}
                    numberOfLines={2}
                    style={{ fontSize: 14 }}
                  >
                    {listing?.book?.title ?? initialBookTitle ?? "Bản sách đang đặt mua"}
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
                    {formatVnd(orderDetails?.amounts?.bookPrice ?? listing?.salePrice)}
                  </AppText>
                </View>
              </View>
            ) : null}


            {error ? <Notice tone="error">{error}</Notice> : null}

            {/* STEP 1: Address & Quote */}
            {step === "address_quote" && (
              <>
                {/* Delivery Address Section */}
                <View style={{ gap: space.xs }}>
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
                        <AppText kind="small" color={stitchTokens.wineDark} style={{ fontWeight: "600" }}>
                          Khu vực luân chuyển
                        </AppText>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
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
                                  backgroundColor: isLocActive ? stitchTokens.wine : stitchTokens.parchment,
                                  borderWidth: 1,
                                  borderColor: isLocActive ? stitchTokens.wine : stitchTokens.peachBorder,
                                }}
                              >
                                <AppText
                                  kind="small"
                                  color={isLocActive ? stitchTokens.white : stitchTokens.wineDark}
                                  style={{ fontWeight: isLocActive ? "700" : "500" }}
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

                      {addressError ? <Notice tone="error">{addressError}</Notice> : null}

                      <View style={{ flexDirection: "row", gap: space.sm, marginTop: 4 }}>
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
                              backgroundColor: isSelected ? stitchTokens.roseWarmSurface : stitchTokens.warmIvory,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected ? stitchTokens.wine : stitchTokens.borderWarm,
                              borderRadius: 12,
                              padding: space.sm,
                              gap: 2,
                            }}
                          >
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 13 }}>
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
                                  <Icon name="check" size={10} color={stitchTokens.gold} />
                                </View>
                              ) : null}
                            </View>
                            <AppText kind="small" color={stitchTokens.subtleGray} numberOfLines={2}>
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
                  <AppText kind="label" color={stitchTokens.wine} style={{ fontWeight: "700" }}>
                    CHI PHÍ ĐƠN HÀNG
                  </AppText>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Tiền sách
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {formatVnd(quote?.amounts.bookPrice ?? listing?.salePrice)}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Phí giao hàng
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {quoteLoading ? "Đang tính phí..." : formatVnd(quote?.amounts.shippingFee ?? 0)}
                    </AppText>
                  </View>

                  <View
                    style={{
                      height: 1,
                      backgroundColor: stitchTokens.borderWarm,
                      marginVertical: 4,
                    }}
                  />

                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                    <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
                      Tổng thanh toán
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 18, fontWeight: "800" }}>
                      {quoteLoading ? "..." : formatVnd(quote?.amounts.buyerTotal ?? listing?.salePrice)}
                    </AppText>
                  </View>
                </View>

                <Notice tone="info">
                  Bấm &quot;Xác nhận đặt mua&quot; sẽ giữ bản sách trong 15 phút để bạn tiến hành thanh toán qua Ví Lật Lại. Người bán có 48 giờ bàn giao sách sau khi thanh toán.
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

            {/* STEP 2: Payment Step */}
            {step === "payment" && orderDetails && (
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="clock" size={18} color={stitchTokens.wineDark} />
                    <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 14 }}>
                      Đang giữ sách trong 15 phút
                    </AppText>
                  </View>
                  <AppText kind="small" color={stitchTokens.wineDark}>
                    Hạn thanh toán:{" "}
                    {new Date(orderDetails.paymentDeadline).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    . Quá thời gian này, sách sẽ tự động mở lại cho người khác mua.
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
                  <AppText kind="label" color={stitchTokens.wine} style={{ fontWeight: "700" }}>
                    VÍ LẬT LẠI (SỐ DƯ THANH TOÁN)
                  </AppText>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Số dư khả dụng:
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
                      {formatVnd(walletBalance)}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <AppText kind="body" color={stitchTokens.subtleGray}>
                      Số tiền cần trả:
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.wine} style={{ fontSize: 18, fontWeight: "800" }}>
                      {formatVnd(orderDetails.amounts.buyerTotal)}
                    </AppText>
                  </View>
                </View>

                {!hasEnoughBalance && (
                  <Notice tone="warning">
                    Số dư ví không đủ để thanh toán đơn hàng này. Vui lòng nạp thêm tiền vào ví trước khi hết hạn 15 phút.
                  </Notice>
                )}

                <View style={{ gap: space.sm, marginTop: space.sm }}>
                  {hasEnoughBalance ? (
                    <Button
                      wine
                      title={busy ? "Đang thanh toán..." : `Thanh toán ngay (${formatVnd(orderDetails.amounts.buyerTotal)})`}
                      disabled={busy}
                      onPress={() => void handlePayOrder()}
                    />
                  ) : (
                    <Button
                      wine
                      title="Nạp tiền vào Ví"
                      onPress={() => {
                        handleDismiss();
                        router.push("/wallet");
                      }}
                    />
                  )}

                  <Button
                    secondary
                    destructive
                    title="Hủy đơn đặt mua"
                    disabled={busy}
                    onPress={() => void handleCancelOrder()}
                  />
                </View>
              </>
            )}

            {/* STEP 3: Success Step */}
            {step === "success" && (
              <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.lg }}>
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
                  <Icon name="check" size={32} color={stitchTokens.likeNewGreen} />
                </View>

                <AppText kind="heading" color={stitchTokens.wineDark} style={{ textAlign: "center" }}>
                  Đặt mua thành công!
                </AppText>

                <AppText kind="body" color={stitchTokens.subtleGray} style={{ textAlign: "center", lineHeight: 22 }}>
                  Tiền đã được giữ an toàn trên hệ thống bảo chứng Lật Lại. Người bán có 48 giờ để chuẩn bị và gửi sách cho đơn vị vận chuyển DirectDelivery.
                </AppText>

                <Button
                  wine
                  title="Hoàn tất và xem sách"
                  onPress={() => {
                    handleDismiss();
                  }}
                />
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}
