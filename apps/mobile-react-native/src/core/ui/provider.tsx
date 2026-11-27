import { useEffect, useState, type PropsWithChildren } from "react";
import { useFonts, loadAsync } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors, stitchTokens } from "./theme";
import "./focus-platform";

const fonts = {
  BeRegular: require("../../../../../packages/brand/fonts/BeVietnamPro-Regular.ttf"),
  BeBold: require("../../../../../packages/brand/fonts/BeVietnamPro-Bold.ttf"),
};
export function BrandProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts(fonts);
  const [recovered, setRecovered] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    // Reveal either the ready UI or its font-recovery controls after mounting.
    if (loaded || error || recovered) SplashScreen.hide();
  }, [loaded, error, recovered]);
  if (loaded || recovered) return children;
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
        gap: 16,
        backgroundColor: colors.paper,
      }}
    >
      {error && !retrying ? (
        <>
          <Text
            accessibilityRole="alert"
            style={{ color: colors.ink, fontSize: 16, textAlign: "center" }}
          >
            Chưa tải được giao diện Lật lại.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại giao diện"
            onPress={() => {
              setRetrying(true);
              void loadAsync(fonts)
                .then(() => setRecovered(true))
                .catch(() => {})
                .finally(() => setRetrying(false));
            }}
            style={({ pressed }) => [
              {
                minHeight: 52,
                padding: 16,
                backgroundColor: stitchTokens.wine,
                borderRadius: 8,
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={{ color: colors.paper }}>Thử tải lại</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator
          color={stitchTokens.wine}
          accessibilityLabel="Đang tải giao diện Lật lại"
        />
      )}
    </View>
  );
}
