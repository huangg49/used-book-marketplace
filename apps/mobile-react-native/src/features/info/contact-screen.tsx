import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_CONTACT_FAQ,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
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

// Same channels as user-web /contact. Case-specific help goes through the
// authenticated support flow so Staff see the right record.
export function ContactScreen() {
  const insets = useSafeAreaInsets();
  const { state } = useSession();
  const signedIn = state.status === "authenticated";
  const [mailError, setMailError] = useState(false);

  async function openMail() {
    setMailError(false);
    try {
      await Linking.openURL(`mailto:${PLATFORM_CONTACT_EMAIL}`);
    } catch {
      setMailError(true);
    }
  }

  return (
    <View style={styles.root}>
      <WineHeader
        title="Liên hệ Lật lại"
        subtitle="Kênh hỗ trợ & câu hỏi thường gặp"
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
        <AppText kind="small" style={styles.leadText}>
          Cần trợ giúp về giao dịch, tài khoản hoặc góp ý cho Lật lại? Chọn kênh phù hợp bên dưới.
        </AppText>

        {/* Support Ticket Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: stitchTokens.blueLightBg }]}>
              <Icon name="shield" size={18} color={stitchTokens.blueTextDeep} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText kind="bold" accessibilityRole="header" style={styles.cardTitle}>
                Yêu cầu hỗ trợ giao dịch
              </AppText>
              <AppText kind="small" style={styles.cardSub}>
                Ưu tiên cho đơn hàng, trao đổi hoặc đấu giá
              </AppText>
            </View>
          </View>
          <AppText kind="small" style={styles.cardBody}>
            Tạo phiếu hỗ trợ gắn đúng mã giao dịch để nhân viên kiểm tra hồ sơ và xử lý nhanh chóng.
          </AppText>
          <Button
            wine
            title={signedIn ? "Mở trung tâm hỗ trợ" : "Đăng nhập để tạo yêu cầu"}
            onPress={() => router.push(signedIn ? "/support" : "/account")}
          />
        </View>

        {/* Email Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: stitchTokens.roseWarmTag }]}>
              <Icon name="mail" size={18} color={stitchTokens.wine} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText kind="bold" accessibilityRole="header" style={styles.cardTitle}>
                Email hỗ trợ
              </AppText>
              <AppText selectable kind="bold" style={styles.emailText}>
                {PLATFORM_CONTACT_EMAIL}
              </AppText>
            </View>
          </View>
          <AppText kind="small" style={styles.cardBody}>
            Phản hồi trong giờ hành chính. Không gửi mật khẩu hoặc mã xác thực qua email.
          </AppText>
          {mailError ? (
            <Notice tone="warning">
              Thiết bị chưa cài ứng dụng email. Bạn có thể chép địa chỉ ở trên để gửi.
            </Notice>
          ) : null}
          <Button wine secondary title="Gửi email" onPress={() => void openMail()} />
        </View>

        {/* FAQ Card */}
        <View style={styles.groupBlock}>
          <AppText kind="small" style={styles.overline}>
            CÂU HỎI THƯỜNG GẶP
          </AppText>
          <View style={styles.faqCard}>
            {PLATFORM_CONTACT_FAQ.map((item, idx) => (
              <View
                key={item.q}
                style={[
                  styles.faqItem,
                  idx === PLATFORM_CONTACT_FAQ.length - 1 && styles.faqItemLast,
                ]}
              >
                <AppText kind="bold" style={styles.faqQ}>
                  {item.q}
                </AppText>
                <AppText kind="small" style={styles.faqA}>
                  {item.a}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <Button
          wine
          secondary
          title="Xem chính sách & quy chế"
          onPress={() => router.push("/policy")}
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
  leadText: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
  },
  card: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  cardSub: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
  },
  emailText: {
    fontSize: 13.5,
    color: stitchTokens.wine,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    color: stitchTokens.subtleGray,
  },
  groupBlock: {
    gap: 8,
  },
  overline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: stitchTokens.subtleGray,
    paddingHorizontal: 4,
  },
  faqCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    overflow: "hidden",
  },
  faqItem: {
    padding: 14,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.borderParchmentSoft,
  },
  faqItemLast: {
    borderBottomWidth: 0,
  },
  faqQ: {
    fontSize: 13.5,
    lineHeight: 19,
    color: stitchTokens.wineDark,
  },
  faqA: {
    fontSize: 12.5,
    lineHeight: 18,
    color: stitchTokens.subtleGray,
  },
});
