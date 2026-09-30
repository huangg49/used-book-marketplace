import { useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { Icon } from "./icon";
import { AppText } from "./text";
import { colors, colorRoles, radius, space } from "./theme";
import { layout } from "./styles";
import { formatVnd } from "./format";

export function BookCover({
  source,
  label,
  missing = false,
  style,
  cachePolicy,
  onError,
}: {
  source?: ImageSource | number;
  label: string;
  missing?: boolean;
  style?: StyleProp<ViewStyle>;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  onError?: () => void;
}) {
  // Associate failure with the source that failed, so a new image can recover.
  const key = typeof source === "number" ? String(source) : source?.uri;
  const [failed, setFailed] = useState<string | undefined | null>(null);
  return (
    <View style={[layout.cover, style]}>
      {source && !missing && failed !== key ? (
        <Image
          source={source}
          accessible
          accessibilityLabel={label}
          contentFit="contain"
          cachePolicy={cachePolicy}
          style={{ width: "100%", height: "100%" }}
          onError={() => {
            setFailed(key);
            onError?.();
          }}
        />
      ) : (
        <View
          style={layout.placeholder}
          accessible
          accessibilityLabel={`${label}. Chưa có ảnh bìa`}
        >
          <Icon name="book" size={30} color={colors.muted} />
          <AppText
            kind="small"
            color={colors.muted}
            style={{ textAlign: "center" }}
          >
            Chưa có ảnh bìa
          </AppText>
        </View>
      )}
    </View>
  );
}
export function BookCondition({
  condition,
  mode,
  stamp = false,
}: {
  condition: string;
  mode?: string;
  stamp?: boolean;
}) {
  if (stamp)
    return (
      <View style={{ gap: space.sm, alignItems: "flex-start" }}>
        <View
          style={{
            borderColor: colorRoles.bookStamp,
            borderWidth: 1,
            borderRadius: radius.record,
            paddingHorizontal: space.md,
            paddingVertical: space.xs,
            maxWidth: "100%",
          }}
        >
          <AppText
            kind="stamp"
            color={colorRoles.bookStamp}
            accessibilityLabel={`Tình trạng: ${condition}`}
          >
            {condition}
          </AppText>
        </View>
        {mode && (
          <AppText kind="annotation" color={colors.muted}>
            {mode}
          </AppText>
        )}
      </View>
    );
  return (
    <AppText kind="label" color={colors.rustText}>
      {condition.toLocaleUpperCase("vi-VN")}
      {mode ? ` · ${mode.toLocaleUpperCase("vi-VN")}` : ""}
    </AppText>
  );
}
export function BookPrice({
  sale,
  exchange,
  reading = false,
}: {
  sale?: number;
  exchange?: number;
  reading?: boolean;
}) {
  return (
    <View
      style={[
        layout.row,
        {
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: reading ? space.md : space.xxl,
        },
      ]}
    >
      {[
        ["Giá bán", sale],
        ["Giá trị đổi", exchange],
      ].map(([label, amount]) =>
        typeof amount === "number" ? (
          <View key={label} style={reading ? { maxWidth: "100%" } : undefined}>
            <AppText
              kind={reading ? "annotation" : "small"}
              color={colors.muted}
            >
              {label}
            </AppText>
            <AppText kind={reading ? "bookPrice" : "price"}>
              {formatVnd(amount)}
            </AppText>
          </View>
        ) : null,
      )}
    </View>
  );
}

// Presentation only: the caller owns availability and any future transaction actions.
export function BookTradeBar({
  sale,
  exchange,
  children,
}: {
  sale?: number;
  exchange?: number;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <BookPrice sale={sale} exchange={exchange} reading />
      {children}
    </View>
  );
}
