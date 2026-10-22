import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";
import { conditions, type Listing } from "../contracts";

interface BookInspectionReportProps {
  item: Listing;
}

function normalizeSellerText(
  raw: string | undefined | null,
  emptyFallback: string,
): string {
  if (!raw) return emptyFallback;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (
    [
      "kh có",
      "không có",
      "không",
      "k",
      "kh",
      "chưa có",
      "none",
      "n/a",
      "ko có",
      "ko",
    ].includes(lower)
  ) {
    return emptyFallback;
  }
  return trimmed;
}

export function BookInspectionReport({ item }: BookInspectionReportProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const conditionLabel = conditions[item.condition] || "Rất tốt";

  const pagesText = normalizeSellerText(
    item.pages,
    "Ruột sách sạch đẹp, các mép giấy phẳng phiu, không quăn góc.",
  );
  const coverText = normalizeSellerText(
    item.coverNote,
    "Bìa và gáy sách nguyên vẹn, giữ dáng chuẩn, không gãy nếp.",
  );
  const notesText = normalizeSellerText(
    item.notes,
    "Không có vết bút viết, tô màu hay gạch chân trên trang.",
  );
  const accessoriesText = normalizeSellerText(
    item.accessories,
    "Không kèm phụ kiện ngoài sách.",
  );

  const inspectionRows = [
    {
      icon: "book" as const,
      label: "Ruột sách & Mép giấy",
      value: pagesText,
      warning: false,
    },
    {
      icon: item.hasMissingPages ? ("info" as const) : ("check" as const),
      label: "Trang thiếu / Rách",
      value: item.hasMissingPages
        ? "Người bán khai báo có thiếu trang — vui lòng kiểm tra kỹ ảnh chụp & mô tả."
        : "Đầy đủ 100% các trang, không bị rách rời.",
      warning: item.hasMissingPages,
    },
    {
      icon: "tag" as const,
      label: "Bìa & Gáy sách",
      value: coverText,
      warning: false,
    },
    {
      icon: "pen" as const,
      label: "Đánh dấu / Ghi chú",
      value: notesText,
      warning: false,
    },
    {
      icon: "bookmark" as const,
      label: "Phụ kiện kèm theo",
      value: accessoriesText,
      warning: false,
    },
  ];

  const catalogSpecs = [
    { label: "Thể loại", value: item.book.category || "Văn học" },
    { label: "Nhà xuất bản", value: item.book.publisher || "Chưa ghi rõ" },
    {
      label: "Năm phát hành",
      value: item.book.publicationYear ? `${item.book.publicationYear}` : "Chưa ghi rõ",
    },
    { label: "Quy cách", value: item.book.edition || "Bìa mềm" },
    { label: "Mã ISBN", value: item.book.isbn || "Chưa cung cấp" },
    {
      label: "Ngôn ngữ",
      value:
        item.book.language === "vi"
          ? "Tiếng Việt"
          : item.book.language === "en"
            ? "Tiếng Anh"
            : item.book.language || "Tiếng Việt",
    },
  ];

  return (
    <View style={styles.container}>
      {/* Section Header with Elegant Editorial Accent */}
      <View style={styles.sectionHeader}>
        <View style={styles.titleWithBar}>
          <View style={styles.accentBar} />
          <View style={styles.titleColumn}>
            <AppText style={styles.sectionTitle} accessibilityRole="header">
              Khảo chứng tình trạng sách
            </AppText>
            <AppText style={styles.sectionSubtitle}>
              Thông tin chi tiết do người bán tự kê khai
            </AppText>
          </View>
        </View>
        <View style={styles.badgeDeclaration}>
          <Icon name="verified" size={12} color={stitchTokens.wineDark} />
          <AppText style={styles.badgeDeclarationText}>Tự kê khai</AppText>
        </View>
      </View>

      {/* Bento Card 1: Physical Condition */}
      <View style={styles.bentoCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "Thu gọn đánh giá thực tế" : "Mở rộng đánh giá thực tế"}
          aria-expanded={isExpanded}
          onPress={() => setIsExpanded((prev) => !prev)}
          style={({ pressed }) => [
            styles.bentoHeader,
            !isExpanded && styles.bentoHeaderCollapsed,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.conditionTitleRow}>
            <Icon name="verified" size={17} color={stitchTokens.wineDark} />
            <AppText style={styles.bentoTitle}>
              Đánh giá thực tế: {conditionLabel}
            </AppText>
          </View>

          <View style={styles.headerRightGroup}>
            <View style={styles.approvedPill}>
              <AppText style={styles.approvedText}>
                {item.readable ? "Đọc rõ 100%" : "Nội dung mờ"}
              </AppText>
            </View>
            <View
              style={[
                styles.chevronCircle,
                { transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] },
              ]}
            >
              <Icon name="chevronDown" size={15} color={stitchTokens.wineMid} />
            </View>
          </View>
        </Pressable>

        {isExpanded ? (
          <>
            <View style={styles.inspectionList}>
              {inspectionRows.map((row) => (
                <View key={row.label} style={styles.inspectionItem}>
                  <View
                    style={[
                      styles.rowIcon,
                      row.warning && styles.rowIconWarning,
                    ]}
                  >
                    <Icon
                      name={row.icon}
                      size={15}
                      color={row.warning ? stitchTokens.crimson : stitchTokens.wineDark}
                    />
                  </View>
                  <View style={styles.rowContent}>
                    <AppText style={styles.rowLabel}>{row.label}:</AppText>
                    <AppText
                      style={[
                        styles.rowValue,
                        row.warning && styles.rowValueWarning,
                      ]}
                    >
                      {row.value}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            {item.description ? (
              <View style={styles.descriptionBox}>
                <View style={styles.descTitleRow}>
                  <Icon name="pen" size={13} color={stitchTokens.wineDark} />
                  <AppText style={styles.descTitle}>Lời nhắn từ chủ sách:</AppText>
                </View>
                <AppText style={styles.descBody}>{item.description}</AppText>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Bento Card 2: Catalog Specifications */}
      <View style={styles.specsCard}>
        <View style={styles.specsHeader}>
          <Icon name="book" size={16} color={stitchTokens.wineDark} />
          <AppText style={styles.specsTitle}>Thông số thư mục ấn bản</AppText>
        </View>

        <View style={styles.specsGrid}>
          {catalogSpecs.map((spec) => (
            <View key={spec.label} style={styles.specCell}>
              <AppText style={styles.specLabel}>{spec.label}</AppText>
              <AppText style={styles.specValue}>{spec.value}</AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWithBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  accentBar: {
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: stitchTokens.wineMid,
  },
  titleColumn: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },
  badgeDeclaration: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.terracottaSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  badgeDeclarationText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  bentoCard: {
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
  bentoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorder,
    gap: 8,
  },
  bentoHeaderCollapsed: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevronCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.roseWarmTag,
    alignItems: "center",
    justifyContent: "center",
  },
  conditionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bentoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  approvedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.likeNewGreen,
  },
  approvedText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  inspectionList: {
    gap: 10,
  },
  inspectionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rowIconWarning: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.crimson,
  },
  rowContent: {
    flex: 1,
    lineHeight: 18,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.darkWood,
    marginRight: 4,
  },
  rowValue: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    lineHeight: 18,
  },
  rowValueWarning: {
    color: stitchTokens.crimson,
    fontWeight: "600",
  },
  descriptionBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.amberBg,
    borderLeftWidth: 4,
    borderLeftColor: stitchTokens.wineMid,
    borderWidth: 1,
    borderColor: stitchTokens.amberBorder,
    gap: 4,
  },
  descTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  descTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  descBody: {
    fontSize: 12,
    color: stitchTokens.darkWood,
    lineHeight: 18,
  },
  specsCard: {
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
  specsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.peachBorderAlpha40,
  },
  specsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  specsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specCell: {
    width: "48%",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorderAlpha40,
    gap: 3,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.roseBrown,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  specValue: {
    fontSize: 12,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  pressed: {
    opacity: 0.8,
  },
});
