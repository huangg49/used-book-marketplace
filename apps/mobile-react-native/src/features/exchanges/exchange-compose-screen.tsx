import {
  exchangeCommandIdentity,
  exchangeServiceFeeText,
  exchangeShippingCostText,
  pendingExchangeProposal,
  sendExchangeProposal,
} from "@used-books/session-client";
import { useExchangeRecovery } from "./exchange-recovery";
import { exchangeSchema } from "./contracts";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { draftPage, type PrivateDraft } from "../drafts/contracts";
import { addressBook } from "../addresses/contracts";
import { PublicPhoto } from "../shelf/public-photo";
import { DraftCoverPhoto } from "../drafts/draft-cover-photo";
import { BookIdentity, useCatalogBook } from "../drafts/catalog-picker";
import * as Crypto from "expo-crypto";
import { z } from "zod";

function checkMatch(
  book:
    | { title?: string; authors?: string[]; category?: string }
    | undefined
    | null,
  pref:
    | {
        targetCategory?: string | null;
        targetAuthor?: string | null;
        targetDescription?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!book || !pref) return false;
  const targetCat = pref.targetCategory?.trim().toLowerCase();
  const targetAuth = pref.targetAuthor?.trim().toLowerCase();
  const targetDesc = pref.targetDescription?.trim().toLowerCase();

  if (!targetCat && !targetAuth && !targetDesc) return false;

  if (
    targetCat &&
    book.category &&
    book.category.toLowerCase().includes(targetCat)
  ) {
    return true;
  }
  if (
    targetAuth &&
    book.authors &&
    book.authors.some((a) => a.toLowerCase().includes(targetAuth))
  ) {
    return true;
  }
  if (
    targetDesc &&
    book.title &&
    (book.title.toLowerCase().includes(targetDesc) ||
      targetDesc.includes(book.title.toLowerCase()))
  ) {
    return true;
  }
  return false;
}

function InventoryBookRow({
  listing,
  isSelected,
  targetPref,
  onToggle,
}: {
  listing: PrivateDraft;
  isSelected: boolean;
  targetPref:
    | {
        targetCategory?: string | null;
        targetAuthor?: string | null;
        targetDescription?: string | null;
      }
    | null
    | undefined;
  onToggle: () => void;
}) {
  const bookQuery = useCatalogBook(listing.currentRevision.content.bookId);
  const book = bookQuery.data;

  const isMatched = checkMatch(book, targetPref);
  const coverMediaId = listing.currentRevision.content.mediaIds[0];
  const listingValue = listing.currentRevision.content.exchangeValue ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isSelected ? "Bỏ chọn cuốn sách này" : "Chọn cuốn sách này"
      }
      accessibilityState={{ selected: isSelected }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.bookOptionCard,
        isMatched && !isSelected && styles.bookOptionCardMatched,
        isSelected && styles.bookOptionCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.optionPhotoBox}>
        {coverMediaId ? (
          <DraftCoverPhoto
            listingId={listing.id}
            mediaId={coverMediaId}
            compact
          />
        ) : (
          <View style={styles.optionPhotoEmpty}>
            <Icon name="book" size={18} color={stitchTokens.roseBrown} />
          </View>
        )}
      </View>

      <View style={styles.optionInfoCol}>
        <BookIdentity id={listing.currentRevision.content.bookId} compact />

        <View style={styles.optionMetaRow}>
          <AppText style={styles.optionValueTag}>
            {formatVnd(listingValue)}
          </AppText>
          {isMatched && (
            <View style={styles.matchedBadge}>
              <Icon name="star" size={10} color={stitchTokens.goldBronze} />
              <AppText style={styles.matchedBadgeText}>Khớp mong muốn</AppText>
            </View>
          )}
        </View>
      </View>

      <View style={styles.checkCol}>
        <View
          style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}
        >
          {isSelected && (
            <Icon name="check" size={13} color={stitchTokens.white} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function ExchangeComposeScreen() {
  const { identity } = useExchangeRecovery();
  const params = useLocalSearchParams<{
    book?: string;
    conversationId?: string;
    expectedConversationVersion?: string;
  }>();
  return (
    <ExchangeComposeContent
      key={identity + ":" + params.book}
      identity={identity}
    />
  );
}
function ExchangeComposeContent({ identity }: { identity: string }) {
  const params = useLocalSearchParams<{
    book?: string;
    conversationId?: string;
    expectedConversationVersion?: string;
  }>();
  const targetListingId = typeof params.book === "string" ? params.book : "";
  const conversationId =
    typeof params.conversationId === "string" && params.conversationId.length > 0
      ? params.conversationId
      : undefined;
  const expectedConversationVersion =
    typeof params.expectedConversationVersion === "string" &&
    Number.isInteger(Number(params.expectedConversationVersion)) &&
    Number(params.expectedConversationVersion) > 0
      ? Number(params.expectedConversationVersion)
      : undefined;
  const insets = useSafeAreaInsets();

  const { client, state } = useSession();
  const { proposal: retained, created } = useExchangeRecovery(
    "",
    targetListingId,
  );
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const currentUserId = state.status === "authenticated" ? state.user.id : null;

  const [selectedMyListingIds, setSelectedMyListingIds] = useState<string[]>(
    [],
  );
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [initialMessage, setInitialMessage] = useState("");
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const toggleSelectBook = (id: string) => {
    setSelectedMyListingIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 5) {
        setErrorNotice("Bạn chỉ có thể chọn tối đa 5 cuốn sách trong một đề nghị trao đổi.");
        return prev;
      }
      setErrorNotice(null);
      return [...prev, id];
    });
  };

  // 1. Fetch Target Book (Sách đối tác muốn đổi)
  const targetQuery = useQuery({
    queryKey: ["public-listing", targetListingId],
    queryFn: () =>
      client.request(`/listings/${targetListingId}`, publicListing),
    enabled: Boolean(targetListingId) && foreground,
  });

  // 2. Fetch My Inventory (Sách đã duyệt của tôi)
  const myInventoryQuery = useQuery({
    queryKey: ["my-listings", currentUserId, "exchange-eligible"],
    queryFn: () =>
      client.request("/me/listings?moderation=Approved&limit=50", draftPage),
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

  // Filter eligible listings: single book (no bundle), Confirmed catalog, exchange value & photo present
  const myEligibleListings = (myInventoryQuery.data?.items ?? []).filter(
    (item) => {
      const content = item.currentRevision.content;
      const isAvailable =
        item.state.trade === "Available" &&
        item.state.visibility === "Visible" &&
        item.catalogStatus === "Confirmed";
      const mode = content.mode;
      const canExchange = mode === "Exchange" || mode === "Both";
      const hasValueAndPhoto =
        !content.bundle &&
        (content.exchangeValue ?? 0) > 0 &&
        content.mediaIds.length > 0;
      return isAvailable && canExchange && hasValueAndPhoto;
    },
  );

  const targetBook = targetQuery.data;
  const sortedEligibleListings = useMemo(() => {
    if (!targetBook?.exchangePreferences) return myEligibleListings;
    return [...myEligibleListings].sort((a, b) => {
      const bookA = queryClient.getQueryData<{
        title?: string;
        authors?: string[];
        category?: string;
      }>(["listing-book", a.currentRevision.content.bookId]);
      const bookB = queryClient.getQueryData<{
        title?: string;
        authors?: string[];
        category?: string;
      }>(["listing-book", b.currentRevision.content.bookId]);
      const matchA = checkMatch(bookA, targetBook.exchangePreferences) ? 1 : 0;
      const matchB = checkMatch(bookB, targetBook.exchangePreferences) ? 1 : 0;
      return matchB - matchA;
    });
  }, [myEligibleListings, targetBook, queryClient]);
  const chosenMyListings = myEligibleListings.filter((l) =>
    selectedMyListingIds.includes(l.id),
  );

  // Financial difference calculation (Multi-book sum)
  const targetValue =
    (targetBook &&
    "exchangeValue" in targetBook &&
    targetBook.exchangeValue != null
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
      const saved = pendingExchangeProposal(client);
      if (!saved && (chosenMyListings.length === 0 || !targetBook)) {
        throw new Error(
          "Vui lòng chọn ít nhất một cuốn sách từ kệ của bạn để trao đổi.",
        );
      }

      setErrorNotice(null);

      const sendingIdentity = exchangeCommandIdentity(client);
      if (saved && saved.recipientListingId !== targetListingId)
        throw new Error("Hãy mở đề nghị chưa rõ kết quả trước khi đổi sách.");
      const res = await sendExchangeProposal(
        client,
        saved ?? {
          initiatorListingId: chosenMyListings[0].id,
          initiatorListingIds: chosenMyListings.map((book) => book.id),
          recipientListingId: targetBook!.id,
          ...(effectiveAddressId
            ? { deliveryAddressId: effectiveAddressId }
            : {}),
          ...(conversationId && expectedConversationVersion
            ? { conversationId, expectedConversationVersion }
            : {}),
        },
        () => Crypto.randomUUID(),
        exchangeSchema,
      );
      if (exchangeCommandIdentity(client) !== sendingIdentity)
        throw new Error("Phiên tài khoản đã thay đổi.");
      const exchangeId = res.id;

      // Step B: Send opening message if typed
      if (initialMessage.trim()) {
        try {
          await client.request(
            `/exchanges/${exchangeId}/messages`,
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

      return { exchangeId, identity: sendingIdentity };
    },
    onSuccess: (res) => {
      if (exchangeCommandIdentity(client) !== res.identity) return;
      void queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
      void queryClient.invalidateQueries({
        queryKey: ["exchange", res.exchangeId],
      });
      router.replace({
        pathname: "/exchange",
        params: { id: res.exchangeId },
      });
    },
    onError: (err) => {
      if (exchangeCommandIdentity(client) !== identity) return;
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

  if (state.status === "authenticated" && (retained || created))
    return (
      <Screen appearance="browse">
        <Notice>
          {created
            ? "Đề nghị đã được tạo. Mở đề nghị để xem trạng thái, không cần gửi lại."
            : "Chưa xác nhận được kết quả gửi đề nghị. Nội dung và mã yêu cầu gốc được giữ nguyên."}
        </Notice>
        {errorNotice && <Notice tone="error">{errorNotice}</Notice>}
        {created ? (
          <Button
            title="Xem đề nghị đã tạo"
            onPress={() =>
              router.replace({ pathname: "/exchange", params: { id: created } })
            }
          />
        ) : retained?.recipientListingId === targetListingId ? (
          <Button
            title="Thử lại đề nghị trước"
            busy={submitProposalMutation.isPending}
            onPress={() => submitProposalMutation.mutate()}
          />
        ) : (
          <Button
            title="Mở đề nghị chưa rõ kết quả"
            onPress={() =>
              router.replace({
                pathname: "/exchange-compose",
                params: { book: String(retained?.recipientListingId) },
              })
            }
          />
        )}
        <Button title="Quay lại" secondary onPress={() => router.back()} />
      </Screen>
    );

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
      appearance="home"
      canvasColor={stitchTokens.creamBg}
      compactFooter={true}
      header={
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, 10) + 6, paddingBottom: 14 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={19} color={stitchTokens.white} />
          </Pressable>

          <AppText style={styles.headerTitle}>Soạn đề nghị đổi sách</AppText>

          <View style={{ width: 38 }} />
        </View>
      }
      footer={
        <View style={styles.stickyFooterContainer}>
          {errorNotice ? (
            <View style={{ marginBottom: space.xs }}>
              <Notice tone="error">{errorNotice}</Notice>
            </View>
          ) : null}
          <View style={styles.composeDockRow}>
            <View style={styles.composeDockInfo}>
              <AppText style={styles.composeDockLabel}>
                {chosenMyListings.length > 0
                  ? `Đã chọn ${chosenMyListings.length} cuốn · ${diff > 0 ? "Bạn bù " + formatVnd(diff) : diff < 0 ? "Nhận bù " + formatVnd(-diff) : "Ngang giá"}`
                  : "Chưa chọn sách nào"}
              </AppText>
              <AppText style={styles.composeDockAmount}>
                {chosenMyListings.length > 0
                  ? `Dự kiến giữ từ Ví ${formatVnd(totalMyValue + Math.max(0, diff))}`
                  : "Chọn sách từ kệ bên trên"}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={
                chosenMyListings.length === 0 ||
                submitProposalMutation.isPending
              }
              onPress={() => submitProposalMutation.mutate()}
              style={({ pressed }) => [
                styles.composeDockBtn,
                (chosenMyListings.length === 0 ||
                  submitProposalMutation.isPending) &&
                  styles.composeDockBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={styles.composeDockBtnText}>
                {submitProposalMutation.isPending ? "Đang gửi..." : "Gửi đề nghị"}
              </AppText>
            </Pressable>
          </View>
        </View>
      }
    >
      {/* 1. Sách bạn muốn nhận + tiêu chí đối tác */}
      <View style={styles.targetCard}>
        <View style={styles.targetCardBadgeRow}>
          <View style={styles.targetBadge}>
            <AppText style={styles.targetBadgeText}>Bạn sẽ nhận</AppText>
          </View>
          <AppText style={styles.targetOwner} numberOfLines={1}>
            @{targetBook.seller.displayName}
          </AppText>
        </View>

        <View style={styles.targetBookRow}>
          <View style={styles.photoBox}>
            {targetBook.photos[0] ? (
              <PublicPhoto
                listingId={targetBook.id}
                revisionId={targetBook.revisionId}
                mediaId={targetBook.photos[0].id}
                label="Bìa sách muốn nhận"
                active={true}
                thumbnail
              />
            ) : (
              <View style={styles.optionPhotoEmpty}>
                <Icon name="book" size={20} color={stitchTokens.roseBrown} />
              </View>
            )}
          </View>

          <View style={styles.targetDetails}>
            <AppText style={styles.targetBookTitle} numberOfLines={2}>
              {targetBook.book.title}
            </AppText>
            <AppText style={styles.targetBookAuthors} numberOfLines={1}>
              {targetBook.book.authors.join(", ")}
            </AppText>
            <View style={styles.valueRow}>
              <AppText style={styles.valueLabel}>Định giá</AppText>
              <AppText style={styles.targetValueText}>
                {formatVnd(targetValue)}
              </AppText>
            </View>
          </View>
        </View>

        {/* Compact partner preferences strip (attached cleanly to partner's book) */}
        {targetBook?.exchangePreferences &&
          (targetBook.exchangePreferences.targetCategory ||
            targetBook.exchangePreferences.targetAuthor ||
            targetBook.exchangePreferences.targetDescription) && (
            <View style={styles.prefStrip}>
              <View style={styles.prefStripTop}>
                <AppText style={styles.prefStripHeading}>
                  Đối tác ưu tiên đổi
                </AppText>
                <View style={styles.prefChipsWrap}>
                  {targetBook.exchangePreferences.targetCategory ? (
                    <View style={styles.prefChip}>
                      <AppText style={styles.prefChipText}>
                        {targetBook.exchangePreferences.targetCategory}
                      </AppText>
                    </View>
                  ) : null}
                  {targetBook.exchangePreferences.targetAuthor ? (
                    <View style={styles.prefChip}>
                      <AppText style={styles.prefChipText}>
                        {targetBook.exchangePreferences.targetAuthor}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>

              {targetBook.exchangePreferences.targetDescription ? (
                <AppText style={styles.prefStripNote}>
                  &ldquo;{targetBook.exchangePreferences.targetDescription}&rdquo;
                </AppText>
              ) : null}
            </View>
          )}
      </View>

      <View style={styles.scrollContent}>
        {errorNotice ? <Notice tone="error">{errorNotice}</Notice> : null}

        {/* 2. Chọn sách từ kệ của bạn */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>
              Chọn sách của bạn để gửi
            </AppText>
            <View
              style={[
                styles.countBadge,
                selectedMyListingIds.length > 0 && styles.countBadgeActive,
              ]}
            >
              <AppText
                style={[
                  styles.countBadgeText,
                  selectedMyListingIds.length > 0 &&
                    styles.countBadgeTextActive,
                ]}
              >
                {selectedMyListingIds.length > 0
                  ? `Đã chọn ${selectedMyListingIds.length}/5`
                  : `${myEligibleListings.length} cuốn sẵn sàng`}
              </AppText>
            </View>
          </View>

          {myEligibleListings.length === 0 ? (
            <View style={styles.emptyInventory}>
              <Icon name="book" size={28} color={stitchTokens.roseBrown} />
              <AppText style={styles.emptyTitle}>
                Chưa có sách nào sẵn sàng đổi
              </AppText>
              <AppText style={styles.emptySubtitle}>
                Bạn cần ít nhất một cuốn sách đã duyệt và bật chế độ Đổi sách
                trong kệ của mình.
              </AppText>
              <Button
                title="Đăng sách mới vào kệ"
                wine
                onPress={() => router.push("/drafts")}
              />
            </View>
          ) : (
            <View style={styles.inventoryList}>
              {sortedEligibleListings.map((listing) => {
                const isSelected = selectedMyListingIds.includes(listing.id);

                return (
                  <InventoryBookRow
                    key={listing.id}
                    listing={listing}
                    isSelected={isSelected}
                    targetPref={targetBook?.exchangePreferences}
                    onToggle={() => {
                      toggleSelectBook(listing.id);
                      setErrorNotice(null);
                    }}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* 3. So khớp giá trị & Dự tính đặt cọc */}
        {chosenMyListings.length > 0 && (
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <AppText style={styles.receiptTitle}>
                Dự tính ký quỹ nếu đối tác đồng ý
              </AppText>
              <View style={styles.zeroFeePill}>
                <AppText style={styles.zeroFeeText}>Phí 0đ</AppText>
              </View>
            </View>

            <View style={styles.receiptRows}>
              <View style={styles.receiptRow}>
                <AppText style={styles.receiptLabel}>
                  Cọc của bạn ({chosenMyListings.length} cuốn gửi)
                </AppText>
                <AppText style={styles.receiptValue}>
                  {formatVnd(totalMyValue)}
                </AppText>
              </View>

              <View style={styles.receiptRow}>
                <AppText style={styles.receiptLabel}>
                  Cọc đối tác giữ lại
                </AppText>
                <AppText style={styles.receiptValueMuted}>
                  {formatVnd(targetValue)}
                </AppText>
              </View>

              <View style={styles.receiptRow}>
                <AppText style={styles.receiptLabel}>
                  {diff > 0
                    ? "Chênh lệch (bạn bù thêm)"
                    : diff < 0
                      ? "Chênh lệch (đối tác bù bạn)"
                      : "Chênh lệch giá trị"}
                </AppText>
                <AppText
                  style={[
                    styles.receiptValue,
                    diff > 0
                      ? styles.receiptDiffPay
                      : diff < 0
                        ? styles.receiptDiffReceive
                        : styles.receiptValueMuted,
                  ]}
                >
                  {diff > 0
                    ? `+${formatVnd(diff)}`
                    : diff < 0
                      ? `+${formatVnd(-diff)}`
                      : "Ngang giá"}
                </AppText>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptRow}>
                <AppText style={styles.receiptTotalLabel}>
                  Tổng dự kiến giữ từ Ví
                </AppText>
                <AppText style={styles.receiptTotalValue}>
                  {formatVnd(totalMyValue + Math.max(0, diff))}
                </AppText>
              </View>
            </View>

            <View style={styles.receiptFootnotes}>
              <AppText style={styles.receiptNoteText}>
                {exchangeServiceFeeText} {exchangeShippingCostText}
              </AppText>
              <AppText style={styles.receiptNoteText}>
                Gửi đề nghị chưa giữ sách hay trừ ví. Tiền cọc được hoàn khi hai
                bên hoàn tất trao đổi.
              </AppText>
            </View>
          </View>
        )}

        {/* 4. Địa chỉ nhận sách của bạn */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>Địa chỉ nhận sách</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quản lý địa chỉ"
              onPress={() => router.push("/addresses")}
              style={({ pressed }) => [
                styles.addressManageBtn,
                pressed && styles.pressed,
              ]}
            >
              <AppText style={styles.addressManageText}>
                Quản lý sổ địa chỉ ›
              </AppText>
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
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedAddressId(addr.id)}
                    style={({ pressed }) => [
                      styles.addressCard,
                      isSelected && styles.addressCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.addressTopRow}>
                        <AppText style={styles.addressName} numberOfLines={1}>
                          {addr.recipientName} · {addr.phone}
                        </AppText>
                        {addr.isDefault && (
                          <View style={styles.defaultPill}>
                            <AppText style={styles.defaultPillText}>
                              Mặc định
                            </AppText>
                          </View>
                        )}
                      </View>
                      <AppText
                        style={styles.addressDetailText}
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
                      {isSelected && (
                        <Icon
                          name="check"
                          size={13}
                          color={stitchTokens.white}
                        />
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
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>
              Lời nhắn gửi đối tác
            </AppText>
            <AppText style={styles.optionalTag}>Tùy chọn</AppText>
          </View>

          <TextField
            style={styles.messageInput}
            value={initialMessage}
            onChangeText={setInitialMessage}
            placeholder="Ví dụ: Sách mình giữ kỹ, có thể gửi ngay hôm nay..."
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.wine,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: stitchTokens.whiteAlpha15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: "700",
    color: stitchTokens.white,
    letterSpacing: -0.2,
  },
  composeDockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  composeDockInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  composeDockLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: stitchTokens.subtleGray,
  },
  composeDockAmount: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  composeDockBtn: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  composeDockBtnDisabled: {
    opacity: 0.42,
  },
  composeDockBtnText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: space.section,
    gap: 20,
  },
  errorBox: {
    padding: space.lg,
    gap: space.md,
  },
  targetCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    gap: 10,
  },
  targetCardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  targetBadge: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  targetBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  targetOwner: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    flexShrink: 1,
  },
  targetBookRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  photoBox: {
    width: 60,
    height: 82,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.canvasMuted,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
  },
  targetDetails: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  targetBookTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    lineHeight: 20,
  },
  targetBookAuthors: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  valueLabel: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  targetValueText: {
    fontSize: 14.5,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  prefStrip: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: 10,
    gap: 6,
  },
  prefStripTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  prefStripHeading: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    marginRight: 2,
  },
  prefChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  prefChip: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  prefChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.darkWood,
  },
  prefStripNote: {
    fontSize: 12,
    fontStyle: "italic",
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    letterSpacing: -0.2,
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: "500",
    color: stitchTokens.subtleGray,
  },
  countBadge: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countBadgeActive: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderColor: stitchTokens.wine,
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  countBadgeTextActive: {
    color: stitchTokens.wine,
  },
  inventoryList: {
    gap: 9,
  },
  bookOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 11,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    gap: 12,
  },
  bookOptionCardMatched: {
    borderColor: stitchTokens.goldAccent,
    backgroundColor: stitchTokens.warmIvory,
  },
  bookOptionCardSelected: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  optionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  matchedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: stitchTokens.goldVeryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  matchedBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.warmUmber,
  },
  optionPhotoBox: {
    width: 54,
    height: 74,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: stitchTokens.canvasMuted,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
  },
  optionPhotoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionValueTag: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  checkCol: {
    paddingLeft: 4,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: stitchTokens.borderWarm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stitchTokens.whiteSurface,
  },
  radioCircleSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  emptyInventory: {
    padding: space.lg,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 4,
  },
  receiptCard: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    gap: 12,
  },
  receiptHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  receiptTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  zeroFeePill: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  zeroFeeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  receiptRows: {
    gap: 8,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  receiptLabel: {
    fontSize: 13,
    color: stitchTokens.subtleGray,
    flex: 1,
  },
  receiptValue: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    fontVariant: ["tabular-nums"],
  },
  receiptValueMuted: {
    fontSize: 13.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    fontVariant: ["tabular-nums"],
  },
  receiptDiffPay: {
    color: stitchTokens.wine,
  },
  receiptDiffReceive: {
    color: stitchTokens.likeNewGreen,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: stitchTokens.borderWarm,
    marginVertical: 2,
  },
  receiptTotalLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    flex: 1,
  },
  receiptTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  receiptFootnotes: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  receiptNoteText: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
    lineHeight: 16,
  },
  addressManageBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  addressManageText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  addressList: {
    gap: 8,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    gap: 10,
  },
  addressCardSelected: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  addressTopRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  addressName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    flexShrink: 1,
  },
  defaultPill: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  defaultPillText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  addressDetailText: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  addressEmpty: {
    alignItems: "center",
    padding: space.md,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    gap: 8,
  },
  addressEmptyText: {
    fontSize: 12.5,
    color: stitchTokens.subtleGray,
  },
  messageInput: {
    minHeight: 78,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    fontSize: 13.5,
    color: stitchTokens.darkWood,
    textAlignVertical: "top",
  },
  stickyFooterContainer: {
    paddingVertical: space.xs,
  },
  pressed: {
    opacity: 0.72,
  },
});
