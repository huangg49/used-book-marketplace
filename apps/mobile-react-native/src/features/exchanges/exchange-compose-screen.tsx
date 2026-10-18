import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppText,
  Button,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  presentError,
  space,
  stitchTokens,
} from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { publicListing } from "../shelf/contracts";
import { draftPage } from "../drafts/contracts";
import { addressBook } from "../addresses/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { DraftCoverPhoto } from "../drafts/draft-cover-photo";
import { BookIdentity } from "../drafts/catalog-picker";
import { exchangeReceiptSchema } from "./contracts";
import { z } from "zod";

export function ExchangeComposeScreen() {
  const params = useLocalSearchParams<{ book?: string }>();
  const targetListingId = typeof params.book === "string" ? params.book : "";

  const { client, state } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [selectedMyListingIds, setSelectedMyListingIds] = useState<string[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState("");
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const toggleSelectBook = (id: string) => {
    setSelectedMyListingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // 1. Fetch Target Book (Sách đối tác muốn đổi)
  const targetQuery = useQuery({
    queryKey: ["public-listing", targetListingId],
    queryFn: () => client.request(`/listings/${targetListingId}`, publicListing),
    enabled: Boolean(targetListingId) && foreground,
  });

  // 2. Fetch My Inventory (Sách đã duyệt của tôi)
  const myInventoryQuery = useQuery({
    queryKey: ["my-listings", currentUserId, "exchange-eligible"],
    queryFn: () => client.request("/me/listings?moderation=Approved&limit=50", draftPage),
    enabled: state.status === "authenticated" && foreground,
  });

  // 3. Fetch My Addresses
  const addressQuery = useQuery({
    queryKey: ["my-addresses", currentUserId],
    queryFn: () => client.request("/me/addresses", addressBook),
    enabled: state.status === "authenticated" && foreground,
  });

  // Default address selection derived purely without useEffect
  const defaultAddressId =
    addressQuery.data?.items?.find((a) => a.isDefault)?.id ??
    addressQuery.data?.items?.[0]?.id ??
    null;
  const effectiveAddressId = selectedAddressId ?? defaultAddressId;

  // Filter eligible listings: must have trade available and not Sale-only
  const myEligibleListings = (myInventoryQuery.data?.items ?? []).filter((item) => {
    const isAvailable = item.state.trade === "Available" && item.state.visibility === "Visible";
    const mode = item.currentRevision.content.mode;
    const canExchange = mode === "Exchange" || mode === "Both";
    return isAvailable && canExchange;
  });

  const targetBook = targetQuery.data;
  const chosenMyListings = myEligibleListings.filter((l) =>
    selectedMyListingIds.includes(l.id),
  );

  // Financial difference calculation (Multi-book sum)
  const targetValue =
    (targetBook && "exchangeValue" in targetBook && targetBook.exchangeValue != null
      ? targetBook.exchangeValue
      : targetBook && "salePrice" in targetBook && targetBook.salePrice != null
        ? targetBook.salePrice
        : 0) ?? 0;
  const totalMyValue = chosenMyListings.reduce(
    (sum, item) => sum + (item.currentRevision.content.exchangeValue ?? 0),
    0,
  );
  const diff = targetValue - totalMyValue;

  // Submit Mutation
  const submitProposalMutation = useMutation({
    mutationFn: async () => {
      if (chosenMyListings.length === 0 || !targetBook) {
        throw new Error("Vui lòng chọn ít nhất một cuốn sách từ kệ của bạn để trao đổi.");
      }

      // Step A: Create proposal (supports multi-book)
      const res = await client.request(
        "/exchanges",
        exchangeReceiptSchema,
        {
          method: "POST",
          body: JSON.stringify({
            initiatorListingId: chosenMyListings[0].id,
            initiatorListingIds: chosenMyListings.map((b) => b.id),
            recipientListingId: targetBook.id,
            ...(effectiveAddressId ? { deliveryAddressId: effectiveAddressId } : {}),
          }),
        },
      );

      // Step B: Send opening message if typed
      if (initialMessage.trim()) {
        try {
          await client.request(
            `/exchanges/${res.entityId}/messages`,
            z.object({ id: z.string() }),
            {
              method: "POST",
              body: JSON.stringify({ body: initialMessage.trim() }),
            },
          );
        } catch {
          // Message failure does not block proposal
        }
      }

      return res;
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
      void queryClient.invalidateQueries({ queryKey: ["exchange", res.entityId] });
      router.replace({
        pathname: "/exchange",
        params: { id: res.entityId },
      });
    },
    onError: (err) => {
      setErrorNotice(presentError(err).message);
    },
  });

  if (state.status !== "authenticated") {
    return (
      <Screen appearance="browse">
        <StatePanel
          title="Yêu cầu đăng nhập"
          message="Vui lòng đăng nhập để chọn sách từ kệ cá nhân của bạn và gửi đề nghị trao đổi."
          action={{
            label: "Đăng nhập",
            onPress: () =>
              router.push({
                pathname: "/account",
                params: { returnBook: targetListingId },
              }),
          }}
        />
      </Screen>
    );
  }

  if (targetQuery.isPending || myInventoryQuery.isPending) {
    return (
      <Screen appearance="browse">
        <StatePanel loading title="Đang nạp dữ liệu trao đổi sách…" />
      </Screen>
    );
  }

  if (targetQuery.error || !targetBook) {
    return (
      <Screen appearance="browse">
        <View style={styles.errorBox}>
          <Notice tone="error">
            {targetQuery.error
              ? presentError(targetQuery.error).message
              : "Không tìm thấy cuốn sách này để trao đổi."}
          </Notice>
          <Button
            title="Quay lại"
            secondary
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      appearance="browse"
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={20} color={stitchTokens.wineDark} />
            <AppText style={styles.backLabel}>Quay lại</AppText>
          </Pressable>

          <AppText style={styles.headerTitle}>Soạn đề nghị đổi sách</AppText>

          <View style={{ width: 40 }} />
        </View>
      }
    >
      <View style={styles.scrollContent}>
        {errorNotice ? <Notice tone="error">{errorNotice}</Notice> : null}

        {/* 1. Sách bạn muốn nhận (Target Book Banner) */}
        <View style={styles.targetCard}>
          <View style={styles.targetCardBadgeRow}>
            <View style={styles.targetBadge}>
              <Icon name="bookmark" size={13} color={stitchTokens.wineDark} />
              <AppText style={styles.targetBadgeText}>SÁCH BẠN MUỐN NHẬN</AppText>
            </View>
            <AppText style={styles.targetOwner}>Chủ sách: @{targetBook.seller.displayName}</AppText>
          </View>

          <View style={styles.targetBookRow}>
            <View style={styles.photoBox}>
              {targetBook.photos[0] ? (
                <PublicPhoto
                  listingId={targetBook.id}
                  revisionId={targetBook.revisionId}
                  mediaId={targetBook.photos[0].id}
                  label="Bìa sách muốn nhận"
                  active={false}
                  compact
                />
              ) : null}
            </View>

            <View style={styles.targetDetails}>
              <AppText style={styles.targetBookTitle} numberOfLines={2}>
                {targetBook.book.title}
              </AppText>
              <AppText style={styles.targetBookAuthors} numberOfLines={1}>
                {targetBook.book.authors.join(", ")}
              </AppText>
              <View style={styles.valueRow}>
                <AppText style={styles.valueLabel}>Định giá quy đổi:</AppText>
                <AppText style={styles.targetValueText}>
                  {formatVnd(targetValue)}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* 2. Chọn sách từ kệ của bạn */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWithIcon}>
              <Icon name="book" size={18} color={stitchTokens.wineDark} />
              <AppText style={styles.sectionTitle}>
                Chọn sách của bạn để hoán đổi
              </AppText>
            </View>
            <View style={styles.countBadge}>
              <AppText style={styles.countBadgeText}>
                {selectedMyListingIds.length > 0
                  ? `Đã chọn ${selectedMyListingIds.length} cuốn`
                  : `${myEligibleListings.length} cuốn khả dụng`}
              </AppText>
            </View>
          </View>

          {myEligibleListings.length === 0 ? (
            <View style={styles.emptyInventory}>
              <Icon name="book" size={32} color={stitchTokens.roseBrown} />
              <AppText style={styles.emptyTitle}>
                Chưa có sách nào sẵn sàng đổi
              </AppText>
              <AppText style={styles.emptySubtitle}>
                Bạn cần có ít nhất một cuốn sách đã được duyệt và bật chế độ Đổi sách trong kệ của mình.
              </AppText>
              <Button
                title="Đăng sách mới vào kệ"
                wine
                onPress={() => router.push("/drafts")}
              />
            </View>
          ) : (
            <View style={styles.inventoryList}>
              {myEligibleListings.map((listing) => {
                const isSelected = selectedMyListingIds.includes(listing.id);
                const coverMediaId = listing.currentRevision.content.mediaIds[0];
                const listingValue = listing.currentRevision.content.exchangeValue ?? 0;

                return (
                  <Pressable
                    key={listing.id}
                    accessibilityRole="button"
                    accessibilityLabel={isSelected ? "Bỏ chọn cuốn sách này" : "Chọn cuốn sách này"}
                    onPress={() => {
                      toggleSelectBook(listing.id);
                      setErrorNotice(null);
                    }}
                    style={({ pressed }) => [
                      styles.bookOptionCard,
                      isSelected && styles.bookOptionCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.optionPhotoBox}>
                      {coverMediaId ? (
                        <DraftCoverPhoto
                          listingId={listing.id}
                          mediaId={coverMediaId}
                        />
                      ) : (
                        <View style={styles.optionPhotoEmpty}>
                          <Icon name="book" size={20} color={stitchTokens.roseBrown} />
                        </View>
                      )}
                    </View>

                    <View style={styles.optionInfoCol}>
                      <BookIdentity
                        id={listing.currentRevision.content.bookId}
                        compact
                      />
                      <View style={styles.optionValueRow}>
                        <AppText style={styles.optionValueTag}>
                          Quy đổi: {formatVnd(listingValue)}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.checkCol}>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleSelected,
                        ]}
                      >
                        {isSelected && (
                          <Icon name="check" size={13} color={stitchTokens.white} />
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 3. So khớp giá trị & Chênh lệch (nếu đã chọn sách) */}
        {chosenMyListings.length > 0 && (
          <View style={styles.diffCard}>
            <View style={styles.diffHeader}>
              <Icon name="swap" size={16} color={stitchTokens.wineDark} />
              <AppText style={styles.diffTitle}>So khớp giá trị trao đổi</AppText>
            </View>

            <View style={styles.diffGrid}>
              <View style={styles.diffItem}>
                <AppText style={styles.diffItemLabel}>
                  Sách bạn gửi ({chosenMyListings.length} cuốn)
                </AppText>
                <AppText style={styles.diffItemValue}>{formatVnd(totalMyValue)}</AppText>
              </View>

              <View style={styles.diffDivider}>
                <Icon name="arrow" size={14} color={stitchTokens.roseBrown} />
              </View>

              <View style={styles.diffItem}>
                <AppText style={styles.diffItemLabel}>Sách bạn nhận</AppText>
                <AppText style={styles.diffItemValue}>{formatVnd(targetValue)}</AppText>
              </View>
            </View>

            <View
              style={[
                styles.diffResultBox,
                diff > 0
                  ? styles.diffResultBoxWarning
                  : diff < 0
                    ? styles.diffResultBoxPositive
                    : styles.diffResultBoxNeutral,
              ]}
            >
              <AppText
                style={[
                  styles.diffResultText,
                  diff > 0
                    ? styles.diffResultTextWarning
                    : diff < 0
                      ? styles.diffResultTextPositive
                      : styles.diffResultTextNeutral,
                ]}
              >
                {diff > 0
                  ? `Bạn bù thêm: +${formatVnd(diff)}`
                  : diff < 0
                    ? `Đối tác bù thêm: +${formatVnd(-diff)}`
                    : "Trao đổi ngang giá (0 ₫ chênh lệch)"}
              </AppText>
            </View>
          </View>
        )}

        {/* 4. Địa chỉ nhận sách của bạn */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWithIcon}>
              <Icon name="pin" size={18} color={stitchTokens.wineDark} />
              <AppText style={styles.sectionTitle}>Địa chỉ nhận sách của bạn</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quản lý địa chỉ"
              onPress={() => router.push("/addresses")}
              style={({ pressed }) => [styles.addressManageBtn, pressed && styles.pressed]}
            >
              <AppText style={styles.addressManageText}>Quản lý sổ địa chỉ ↗</AppText>
            </Pressable>
          </View>

          {addressQuery.data?.items?.length ? (
            <View style={styles.addressList}>
              {addressQuery.data.items.map((addr) => {
                const isSelected = addr.id === effectiveAddressId;

                return (
                  <Pressable
                    key={addr.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedAddressId(addr.id)}
                    style={[
                      styles.addressCard,
                      isSelected && styles.addressCardSelected,
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.addressTopRow}>
                        <AppText style={styles.addressName}>
                          {addr.recipientName} ({addr.phone})
                        </AppText>
                        {addr.isDefault && (
                          <View style={styles.defaultPill}>
                            <AppText style={styles.defaultPillText}>Mặc định</AppText>
                          </View>
                        )}
                      </View>
                      <AppText style={styles.addressDetailText}>{addr.detail}</AppText>
                    </View>

                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected && (
                        <Icon name="check" size={13} color={stitchTokens.white} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.addressEmpty}>
              <AppText style={styles.addressEmptyText}>
                Bạn chưa lưu địa chỉ giao nhận nào.
              </AppText>
              <Button
                title="Thêm địa chỉ ngay"
                secondary
                onPress={() => router.push("/addresses")}
              />
            </View>
          )}
        </View>

        {/* 5. Lời nhắn mở đầu gửi chủ sách */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWithIcon}>
              <Icon name="message" size={18} color={stitchTokens.wineDark} />
              <AppText style={styles.sectionTitle}>
                Lời nhắn gửi đối tác (Tùy chọn)
              </AppText>
            </View>
          </View>

          <TextField
            style={styles.messageInput}
            value={initialMessage}
            onChangeText={setInitialMessage}
            placeholder="Chào bạn, mình muốn gửi cuốn sách này để đổi lấy cuốn của bạn..."
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>

        {/* Nút gửi đề nghị */}
        <View style={styles.submitContainer}>
          <Button
            title={
              submitProposalMutation.isPending
                ? "Đang gửi đề nghị..."
                : chosenMyListings.length > 0
                  ? `Gửi đề xuất đổi ${chosenMyListings.length} cuốn (${diff > 0 ? "Bù " + formatVnd(diff) : diff < 0 ? "Nhận bù " + formatVnd(-diff) : "Ngang giá"})`
                  : "Vui lòng chọn ít nhất 1 cuốn sách để đổi"
            }
            wine
            busy={submitProposalMutation.isPending}
            disabled={chosenMyListings.length === 0 || submitProposalMutation.isPending}
            onPress={() => submitProposalMutation.mutate()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 54,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.roseWarmBlur,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.cardBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.section,
    gap: space.md,
  },
  errorBox: {
    padding: space.lg,
    gap: space.md,
  },
  targetCard: {
    padding: space.md,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachMuted,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  targetCardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  targetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  targetBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  targetOwner: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.roseBrown,
  },
  targetBookRow: {
    flexDirection: "row",
    gap: 12,
  },
  photoBox: {
    width: 65,
    height: 85,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.warmCard,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  targetDetails: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  targetBookTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    lineHeight: 19,
  },
  targetBookAuthors: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  valueLabel: {
    fontSize: 11,
    color: stitchTokens.darkWood,
  },
  targetValueText: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
  },
  sectionCard: {
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  countBadge: {
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  inventoryList: {
    gap: 10,
  },
  bookOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 12,
  },
  bookOptionCardSelected: {
    borderColor: stitchTokens.wineMid,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  optionPhotoBox: {
    width: 50,
    height: 65,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: stitchTokens.warmCard,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  optionPhotoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionInfoCol: {
    flex: 1,
    gap: 2,
  },
  optionValueRow: {
    marginTop: 2,
  },
  optionValueTag: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  checkCol: {
    paddingLeft: 4,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.whiteSurface,
  },
  radioCircleSelected: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  emptyInventory: {
    padding: space.lg,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 6,
  },
  diffCard: {
    padding: space.md,
    borderRadius: 18,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    gap: 10,
  },
  diffHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  diffTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  diffGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.whiteSurface,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorderAlpha35,
  },
  diffItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  diffItemLabel: {
    fontSize: 10,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  diffItemValue: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  diffDivider: {
    paddingHorizontal: 8,
  },
  diffResultBox: {
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  diffResultBoxWarning: {
    backgroundColor: stitchTokens.roseWarmTag,
  },
  diffResultBoxPositive: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  diffResultBoxNeutral: {
    backgroundColor: stitchTokens.whiteSurface,
  },
  diffResultText: {
    fontSize: 13,
    fontWeight: "800",
  },
  diffResultTextWarning: {
    color: stitchTokens.wineDark,
  },
  diffResultTextPositive: {
    color: stitchTokens.likeNewGreen,
  },
  diffResultTextNeutral: {
    color: stitchTokens.darkWood,
  },
  addressManageBtn: {
    paddingVertical: 2,
  },
  addressManageText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineMid,
  },
  addressList: {
    gap: 8,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 10,
  },
  addressCardSelected: {
    borderColor: stitchTokens.wineMid,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  addressTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addressName: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  defaultPill: {
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  defaultPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressDetailText: {
    fontSize: 11,
    color: stitchTokens.darkWood,
    lineHeight: 15,
  },
  addressEmpty: {
    alignItems: "center",
    padding: space.md,
    gap: 8,
  },
  addressEmptyText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  messageInput: {
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    fontSize: 13,
    color: stitchTokens.wineDark,
    textAlignVertical: "top",
  },
  submitContainer: {
    paddingVertical: space.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
