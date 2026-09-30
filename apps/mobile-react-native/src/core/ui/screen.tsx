import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, metrics, space } from "./theme";

export function Screen({
  children,
  header,
  footer,
  compactFooter = false,
  scrollRef,
}: React.PropsWithChildren<{
  header?: React.ReactNode;
  footer?: React.ReactNode;
  compactFooter?: boolean;
  scrollRef?: React.Ref<ScrollView>;
}>) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {header}
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, padding: space.xl }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: metrics.content,
              alignSelf: "center",
              gap: space.xl,
            }}
          >
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.rule,
              paddingVertical: compactFooter ? space.sm : space.lg,
              paddingHorizontal: space.xl,
            }}
          >
            {/* Same side padding and max width as the content, so actions line up. */}
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
