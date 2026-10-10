import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, colorRoles, metrics, space } from "./theme";

export function Screen({
  children,
  header,
  footer,
  compactFooter = false,
  footerAppearance = "paper",
  scrollRef,
  appearance = "paper",
}: React.PropsWithChildren<{
  header?: React.ReactNode;
  footer?: React.ReactNode;
  compactFooter?: boolean;
  footerAppearance?: "paper" | "navigation";
  scrollRef?: React.Ref<ScrollView>;
  appearance?: "paper" | "shelf" | "browse";
}>) {
  const inset = useSafeAreaInsets();
  const shelf = appearance === "shelf";
  const browse = appearance === "browse";
  const canvas = shelf || browse ? colorRoles.shelfCanvas : colors.paper;
  const navigationFooter = footerAppearance === "navigation";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: canvas }}>
      <StatusBar style={shelf ? "light" : "dark"} />
      {shelf && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: inset.top,
            backgroundColor: colors.forest,
          }}
        />
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {header}
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: space.xl,
            paddingVertical: shelf ? space.lg : space.xl,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: metrics.content,
              alignSelf: "center",
              gap: shelf ? space.sm : space.xl,
            }}
          >
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View
            style={{
              backgroundColor: navigationFooter
                ? colorRoles.navigationBackground
                : canvas,
              borderTopWidth: 1,
              borderColor: colors.rule,
              paddingVertical:
                compactFooter || navigationFooter ? space.sm : space.lg,
              paddingHorizontal: navigationFooter ? space.md : space.xl,
            }}
          >
            {/* SafeAreaView owns the system inset once, with a light canvas for
                Android gesture/three-button controls. The footer never overlays
                content; action footers keep the same side padding as the form. */}
            <View
              style={{
                width: "100%",
                maxWidth: metrics.content,
                alignSelf: "center",
              }}
            >
              {footer}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
