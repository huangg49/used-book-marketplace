import { View } from "react-native";
import { router } from "expo-router";
import {
  PLATFORM_POLICY_NOTICE,
  PLATFORM_POLICY_SECTIONS,
  PLATFORM_POLICY_UPDATED,
} from "@used-books/session-client";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  colors,
  space,
} from "../../core/ui";

const back = () => (router.canGoBack() ? router.back() : router.navigate("/"));
const updated = new Date(`${PLATFORM_POLICY_UPDATED}T00:00:00+07:00`).toLocaleDateString("vi-VN");

// Same copy as user-web /policy, shared through @used-books/session-client.
export function PolicyScreen() {
  return (
    <Screen header={<BackAction title="Quay lại" onPress={back} />}>
      <AppText kind="title" accessibilityRole="header">
        Chính sách & quy chế
      </AppText>
      <AppText>
        Những điều cần biết trước khi đăng, mua, đổi hoặc đấu giá sách trên Lật lại.
      </AppText>
      <AppText kind="small">Cập nhật {updated}</AppText>
      <Notice tone="info">{PLATFORM_POLICY_NOTICE}</Notice>
      {PLATFORM_POLICY_SECTIONS.map((section) => (
        <View
          key={section.id}
          style={{
            gap: space.sm,
            paddingTop: space.md,
            borderTopWidth: 1,
            borderTopColor: colors.rule,
          }}
        >
          <AppText kind="heading" accessibilityRole="header">
            {section.title}
          </AppText>
          <AppText>{section.summary}</AppText>
          {section.points.map((point) => (
            <View key={point} style={{ flexDirection: "row", gap: space.sm }}>
              <AppText accessible={false}>•</AppText>
              <AppText style={{ flex: 1 }}>{point}</AppText>
            </View>
          ))}
        </View>
      ))}
      <AppText kind="small">
        Phí, thời hạn và tỷ lệ được lưu lại lúc giao kết; thay đổi chính sách sau đó không áp dụng ngược cho
        giao dịch đang chạy.
      </AppText>
      <Button wine secondary title="Liên hệ Lật lại" onPress={() => router.push("/contact")} />
    </Screen>
  );
}
