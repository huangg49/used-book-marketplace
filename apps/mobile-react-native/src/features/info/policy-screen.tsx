import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PLATFORM_POLICY_NOTICE,
  PLATFORM_POLICY_SECTIONS,
  PLATFORM_POLICY_UPDATED,
} from "@used-books/session-client";
import {
  AppText,
  Button,
  Icon,
  Notice,
  WineHeader,
  space,
  stitchTokens,
} from "../../core/ui";

const back = () => (router.canGoBack() ? router.back() : router.navigate("/"));
const updated = new Date(`${PLATFORM_POLICY_UPDATED}T00:00:00+07:00`).toLocaleDateString("vi-VN");

// Same copy as user-web /policy, shared through @used-books/session-client.
export function PolicyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <WineHeader
        title="Chính sách & quy chế"
        subtitle={`Cập nhật ${updated}`}
        onBack={back}
        backLabel="Quay lại"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
      >
        <View style={styles.introCard}>
          <View style={styles.introIconBox}>
            <Icon name="shield" size={18} color={stitchTokens.wine} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText kind="bold" style={styles.introTitle}>
              Quy tắc giao dịch minh bạch
            </AppText>
            <AppText kind="small" style={styles.introDesc}>
              Những điều cần biết trước khi đăng, mua, đổi hoặc đấu giá sách trên Lật lại.
            </AppText>
          </View>
        </View>

        <Notice tone="info">{PLATFORM_POLICY_NOTICE}</Notice>

        {PLATFORM_POLICY_SECTIONS.map((section, idx) => (
          <View key={section.id} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionNumBadge}>
                <AppText kind="small" style={styles.sectionNumText}>
                  {String(idx + 1).padStart(2, "0")}
                </AppText>
              </View>
              <AppText kind="bold" accessibilityRole="header" style={styles.sectionTitle}>
                {section.title}
              </AppText>
            </View>

            <AppText kind="small" style={styles.sectionSummary}>
              {section.summary}
            </AppText>

            <View style={styles.pointsList}>
              {section.points.map((point) => (
                <View key={point} style={styles.pointRow}>
                  <View style={styles.pointDot} />
                  <AppText kind="small" style={styles.pointText}>
                    {point}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footnoteBox}>
          <Icon name="info" size={15} color={stitchTokens.subtleGray} />
          <AppText kind="small" style={styles.footnoteText}>
            Phí, thời hạn và tỷ lệ được lưu lại lúc giao kết; thay đổi chính sách sau đó không áp dụng ngược cho giao dịch đang chạy.
          </AppText>
        </View>

        <Button
          wine
          secondary
          title="Liên hệ Lật lại"
          onPress={() => router.push("/contact")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: stitchTokens.creamBg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 14,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  introIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  introTitle: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  introDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: stitchTokens.subtleGray,
  },
  sectionCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionNumBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: stitchTokens.roseParchment,
  },
  sectionNumText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wine,
    includeFontPadding: false,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 21,
    color: stitchTokens.wineDark,
  },
  sectionSummary: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.espresso,
  },
  pointsList: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderParchmentSoft,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  pointDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: stitchTokens.wine,
    marginTop: 7,
    flexShrink: 0,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
  },
  footnoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.cardWarmLight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarmLight,
  },
  footnoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.subtleGray,
  },
});
