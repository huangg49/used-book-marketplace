import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  Notice,
  colors,
  radius,
  stitchTokens,
} from "../../core/ui";
import { useSession } from "../../core/session/session-provider";
import { formatVnd } from "../../core/ui/format";
import { draftPage } from "../drafts/contracts";
import { BookIdentity } from "../drafts/catalog-picker";
import { PublicPhoto } from "../shelf/public-photo";
import type { Exchange } from "./contracts";

type FrozenBook = NonNullable<Exchange["agreement"]>["recipientBook"];

const CONDITION_LABELS: Record<string, string> = {
  LikeNew: "Như mới",
  Good: "Tốt",
  Fair: "Khá",
  Acceptable: "Đọc được",
};

export function ExchangeCounterForm({
  exchangeId,
  isInitiator,
  currentIds,
  partnerName,
  partnerBooks,
  partnerValue,
  busy,
  onSubmit,
}: {
  exchangeId: string;
  isInitiator: boolean;
  currentIds: string[];
  partnerName: string;
  partnerBooks: FrozenBook[];
  partnerValue: number;
  busy: boolean;
  onSubmit: (ids: string[], note: string) => void;
}) {
  const { client, state } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const actorId = state.status === "authenticated" ? state.user.id : "";
  const maxSelect = isInitiator ? 5 : 1;

  const read = useInfiniteQuery({
    queryKey: ["exchange-replacement-books", actorId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.request(
        "/me/listings?moderation=Approved&limit=20&channel=Marketplace" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        draftPage,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(actorId),
    retry: false,
  });

  const items =
    read.data?.pages
      .flatMap((page) => page.items)
      .filter(
        (item) =>
          !currentIds.includes(item.id) &&
          item.channel === "Marketplace" &&
          item.state.visibility === "Visible" &&
          item.state.trade === "Available" &&
          ["Exchange", "Both"].includes(
            item.currentRevision.content.mode ?? "",
          ) &&
          !item.currentRevision.content.bundle,
      ) ?? [];

  const ownValue = items
    .filter((item) => selected.includes(item.id))
    .reduce(
      (sum, item) => sum + (item.currentRevision.content.exchangeValue ?? 0),
      0,
    );
  const diff = Math.abs(ownValue - partnerValue);
  const iPayDiff = ownValue < partnerValue && diff > 0;
  const partnerPaysDiff = ownValue > partnerValue && diff > 0;

  const toggleItem = (id: string) => {
    setSelected((old) => {
      if (old.includes(id)) return old.filter((entry) => entry !== id);
      if (maxSelect === 1) return [id];
      if (old.length >= maxSelect) return old;
      return [...old, id];
    });
  };

  return (
    <ScrollView
      style={styles.sheetScroll}
      contentContainerStyle={styles.sheetScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Partner's Books Reference Card — makes clear what you're trading for */}
      <View style={styles.partnerSection}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.incomingPill}>
            <AppText style={styles.incomingPillText}>
              BẠN SẼ NHẬN TỪ {partnerName.toUpperCase()}
            </AppText>
          </View>
          <AppText style={styles.partnerTotalText}>
            {formatVnd(partnerValue)}
          </AppText>
        </View>

        {partnerBooks.length > 0 ? (
          <View style={styles.partnerBookList}>
            {partnerBooks.map((book) => (
              <View key={book.listingId} style={styles.partnerBookRow}>
                <View style={styles.partnerCover}>
                  {book.mediaIds[0] ? (
                    <PublicPhoto
                      exchangeId={exchangeId}
                      listingId={book.listingId}
                      revisionId={book.revisionId}
                      mediaId={book.mediaIds[0]}
                      label={book.book.title}
                      active
                      thumbnail
                    />
                  ) : (
                    <View style={styles.coverFallback}>
                      <Icon
                        name="book"
                        size={15}
                        color={stitchTokens.subtleGray}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.partnerBookInfo}>
                  <AppText style={styles.partnerBookTitle} numberOfLines={2}>
                    {book.book.title}
                  </AppText>
                  {book.book.authors.length > 0 ? (
                    <AppText style={styles.partnerBookAuthor} numberOfLines={1}>
                      {book.book.authors.join(", ")}
                    </AppText>
                  ) : null}
                  <View style={styles.metaChipRow}>
                    <View style={styles.conditionChip}>
                      <AppText style={styles.conditionChipText}>
                        {CONDITION_LABELS[book.condition] ?? book.condition}
                      </AppText>
                    </View>
                    <AppText style={styles.partnerBookPrice}>
                      {formatVnd(book.exchangeValue)}
                    </AppText>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <AppText style={styles.helperText}>
            Giá trị sách đối tác: {formatVnd(partnerValue)}
          </AppText>
        )}
      </View>

      {/* 2. Choose Replacement Books from My Shelf */}
      <View style={styles.pickerSection}>
        <View style={styles.sectionHeaderRow}>
          <AppText style={styles.sectionTitle}>
            Chọn sách thay thế của bạn
          </AppText>
          <View style={styles.counterBadge}>
            <AppText style={styles.counterBadgeText}>
              {selected.length}/{maxSelect} cuốn
            </AppText>
          </View>
        </View>
        <AppText style={styles.helperText}>
          {isInitiator
            ? "Chọn từ 1 đến 5 cuốn đã duyệt trên kệ của bạn. Đối tác sẽ xem và xác nhận lại đề xuất mới."
            : "Chọn 1 cuốn khác trên kệ của bạn để đổi thay thế. Đối tác sẽ xem và xác nhận lại."}
        </AppText>

        {read.isPending && (
          <View style={styles.stateBox}>
            <AppText style={styles.helperText}>
              Đang tải sách khả dụng trên kệ của bạn…
            </AppText>
          </View>
        )}

        {read.isError && (
          <View style={styles.alertStack}>
            <Notice tone="error">
              Chưa tải được danh sách sách của bạn. Vui lòng thử lại.
            </Notice>
            <Button
              wine
              secondary
              title="Tải lại sách"
              onPress={() => void read.refetch()}
            />
          </View>
        )}

        {!read.isPending && !read.isError && items.length === 0 && (
          <View style={styles.emptyBox}>
            <Icon name="book" size={20} color={stitchTokens.subtleGray} />
            <AppText style={styles.emptyTitle}>
              Chưa có sách thay thế khả dụng
            </AppText>
            <AppText style={styles.emptySub}>
              Chỉ các bài đăng đã duyệt, đang bật chế độ Đổi sách và chưa kẹt
              giao dịch khác mới hiển thị tại đây.
            </AppText>
          </View>
        )}

        {items.length > 0 && (
          <View style={styles.bookList}>
            {items.map((item) => {
              const isChecked = selected.includes(item.id);
              const disabled =
                busy ||
                (!isChecked && maxSelect > 1 && selected.length >= maxSelect);
              const firstMediaId = item.currentRevision.content.mediaIds[0];
              const condition = item.currentRevision.content.condition;
              const exchangeVal =
                item.currentRevision.content.exchangeValue ?? 0;

              return (
                <Pressable
                  key={item.id}
                  accessibilityRole={maxSelect === 1 ? "radio" : "checkbox"}
                  accessibilityState={{ checked: isChecked, disabled }}
                  disabled={disabled}
                  onPress={() => toggleItem(item.id)}
                  style={({ pressed }) => [
                    styles.bookCard,
                    isChecked && styles.bookCardSelected,
                    disabled && styles.bookCardDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.ownCover}>
                    {firstMediaId ? (
                      <PublicPhoto
                        listingId={item.id}
                        revisionId={item.currentRevision.id}
                        mediaId={firstMediaId}
                        label="Ảnh bìa sách"
                        active
                        thumbnail
                      />
                    ) : (
                      <View style={styles.coverFallback}>
                        <Icon
                          name="book"
                          size={15}
                          color={stitchTokens.subtleGray}
                        />
                      </View>
                    )}
                  </View>

                  <View style={styles.bookCardBody}>
                    <BookIdentity
                      id={item.currentRevision.content.bookId}
                      compact
                    />
                    <View style={styles.metaChipRow}>
                      {condition ? (
                        <View style={styles.conditionChip}>
                          <AppText style={styles.conditionChipText}>
                            {CONDITION_LABELS[condition] ?? condition}
                          </AppText>
                        </View>
                      ) : null}
                      <AppText style={styles.ownBookPrice}>
                        {formatVnd(exchangeVal)}
                      </AppText>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.checkCircle,
                      isChecked && styles.checkCircleSelected,
                    ]}
                  >
                    {isChecked ? (
                      <Icon name="check" size={13} color={stitchTokens.white} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {read.hasNextPage && (
          <Button
            wine
            secondary
            title="Tải thêm sách trên kệ"
            busy={read.isFetchingNextPage}
            onPress={() => void read.fetchNextPage()}
          />
        )}
      </View>

      {/* 3. Live Value Comparison Summary */}
      {selected.length > 0 && (
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <AppText style={styles.summaryLabel}>Sách bạn đưa</AppText>
              <AppText style={styles.summaryAmount}>
                {formatVnd(ownValue)}
              </AppText>
            </View>
            <Icon name="swap" size={16} color={stitchTokens.wine} />
            <View style={[styles.summaryCol, { alignItems: "flex-end" }]}>
              <AppText style={styles.summaryLabel}>Sách bạn nhận</AppText>
              <AppText style={styles.summaryAmount}>
                {formatVnd(partnerValue)}
              </AppText>
            </View>
          </View>

          <View style={styles.summaryFooter}>
            <Icon
              name={diff === 0 || partnerPaysDiff ? "check" : "info"}
              size={14}
              color={
                diff === 0 || partnerPaysDiff
                  ? stitchTokens.likeNewGreen
                  : stitchTokens.wineDark
              }
            />
            <AppText
              style={[
                styles.summaryResult,
                (diff === 0 || partnerPaysDiff) && styles.summaryResultGreen,
                iPayDiff && styles.summaryResultWine,
              ]}
            >
              {diff === 0
                ? "Trao đổi ngang giá (không cần bù tiền)"
                : iPayDiff
                  ? `Bạn sẽ bù thêm ${formatVnd(diff)}`
                  : `${partnerName} sẽ bù cho bạn +${formatVnd(diff)}`}
            </AppText>
          </View>
        </View>
      )}

      {/* 4. Optional Note */}
      <View style={styles.noteSection}>
        <AppText style={styles.noteLabel}>Lời nhắn cho {partnerName} (tùy chọn)</AppText>
        <AppTextInput
          accessibilityLabel="Lời nhắn gửi đối tác"
          value={note}
          onChangeText={setNote}
          placeholder="Ví dụ: Mình đổi sang cuốn này cho ngang giá nhé…"
          placeholderTextColor={stitchTokens.subtleGray}
          maxLength={500}
          multiline
          style={styles.noteInput}
        />
      </View>

      {/* 5. Submit CTA */}
      <Button
        title="Gửi đề xuất sách mới"
        wine
        busy={busy}
        disabled={!selected.length || read.isFetching}
        onPress={() => onSubmit(selected, note)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheetScroll: {
    maxHeight: 540,
  },
  sheetScrollContent: {
    gap: 14,
    paddingBottom: 6,
  },
  partnerSection: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderLeftWidth: 3.5,
    borderLeftColor: stitchTokens.verifiedGreen,
    padding: 12,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  incomingPill: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.mintGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  incomingPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  partnerTotalText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: stitchTokens.deepCocoa,
    fontVariant: ["tabular-nums"],
  },
  partnerBookList: {
    gap: 8,
  },
  partnerBookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partnerCover: {
    width: 40,
    height: 54,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  partnerBookInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  partnerBookTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
  partnerBookAuthor: {
    fontSize: 11.5,
    color: colors.muted,
  },
  partnerBookPrice: {
    fontSize: 12.5,
    fontWeight: "800",
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  pickerSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.deepCocoa,
  },
  counterBadge: {
    backgroundColor: stitchTokens.roseParchment,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  counterBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    includeFontPadding: false,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  stateBox: {
    paddingVertical: 14,
    alignItems: "center",
  },
  alertStack: {
    gap: 8,
  },
  emptyBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    alignItems: "center",
    gap: 5,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: "center",
  },
  bookList: {
    gap: 8,
  },
  bookCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 10,
  },
  bookCardSelected: {
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
  },
  bookCardDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
  ownCover: {
    width: 44,
    height: 60,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bookCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  metaChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  conditionChip: {
    backgroundColor: stitchTokens.surfaceSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  conditionChipText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    includeFontPadding: false,
  },
  ownBookPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: stitchTokens.warmBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.wineDark,
  },
  summaryBox: {
    backgroundColor: stitchTokens.creamBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryCol: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.deepCocoa,
    fontVariant: ["tabular-nums"],
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  summaryResult: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
    flex: 1,
  },
  summaryResultGreen: {
    color: stitchTokens.likeNewGreen,
  },
  summaryResultWine: {
    color: stitchTokens.wineDark,
  },
  noteSection: {
    gap: 6,
  },
  noteLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.deepCocoa,
  },
  noteInput: {
    minHeight: 68,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: colors.ink,
    textAlignVertical: "top",
  },
});
