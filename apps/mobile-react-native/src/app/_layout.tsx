import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBar as SystemNavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../core/session/session-provider";
import { BrandProvider } from "../core/ui";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* SDK 57 resolves "dark" to dark system buttons on our light safe area. */}
      <SystemNavigationBar style="dark" />
      <BrandProvider>
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </BrandProvider>
    </SafeAreaProvider>
  );
}
