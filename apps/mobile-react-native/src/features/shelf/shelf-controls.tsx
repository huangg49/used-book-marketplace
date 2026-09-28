import { View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../core/session/session-provider";
import { AppText, BrandLogo, Button, colors, space } from "../../core/ui";
export function ShelfHeader() {
  const { state } = useSession();
  return (
    <View style={{ gap: space.md }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: space.md,
        }}
      >
        <BrandLogo />
        <Button
          secondary
          title={state.status === "authenticated" ? "Góc của bạn" : "Đăng nhập"}
          onPress={() => router.push("./account")}
        />
      </View>
      <AppText kind="label" color={colors.rustText}>
        CHUYỀN TAY TRONG TP.HCM
      </AppText>
    </View>
  );
}
