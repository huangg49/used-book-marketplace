import { Linking, View } from "react-native";
import { router } from "expo-router";
import {
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_CONTACT_FAQ,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  colors,
  space,
} from "../../core/ui";
import { useState } from "react";

const back = () => (router.canGoBack() ? router.back() : router.navigate("/"));

// Same channels as user-web /contact. Case-specific help goes through the
// authenticated support flow so Staff see the right record.
export function ContactScreen() {
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

  const block = {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  } as const;

  return (
    <Screen header={<BackAction title="Quay lại" onPress={back} />}>
      <AppText kind="title" accessibilityRole="header">
        Liên hệ
      </AppText>
      <AppText>
        Cần trợ giúp về một giao dịch, tài khoản hoặc góp ý cho đồ án? Chọn kênh phù hợp bên dưới.
      </AppText>

      <View style={block}>
        <AppText kind="heading" accessibilityRole="header">
          Email
        </AppText>
        <AppText selectable kind="bold">
          {PLATFORM_CONTACT_EMAIL}
        </AppText>
        <AppText kind="small">
          Phản hồi trong giờ hành chính. Đừng gửi mật khẩu hoặc mã xác thực qua email.
        </AppText>
        {mailError ? (
          <Notice tone="warning">
            Máy chưa có ứng dụng email. Hãy chép địa chỉ ở trên để gửi.
          </Notice>
        ) : null}
        <Button wine secondary title="Gửi email" onPress={() => void openMail()} />
      </View>

      <View style={block}>
        <AppText kind="heading" accessibilityRole="header">
          Yêu cầu hỗ trợ
        </AppText>
        <AppText>
          Với vấn đề của một đơn, trao đổi hoặc phiên đấu giá, tạo yêu cầu hỗ trợ để nhân viên xem đúng hồ sơ.
        </AppText>
        <Button
          wine
          title={signedIn ? "Mở hỗ trợ" : "Đăng nhập để tạo yêu cầu"}
          onPress={() => router.push(signedIn ? "/support" : "/account")}
        />
      </View>

      <View style={block}>
        <AppText kind="heading" accessibilityRole="header">
          Câu hỏi thường gặp
        </AppText>
        {PLATFORM_CONTACT_FAQ.map((item) => (
          <View key={item.q} style={{ gap: 2 }}>
            <AppText kind="bold">{item.q}</AppText>
            <AppText>{item.a}</AppText>
          </View>
        ))}
      </View>
      <Button wine secondary title="Xem chính sách & quy chế" onPress={() => router.push("/policy")} />
    </Screen>
  );
}
