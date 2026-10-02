import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image, type ImageSource } from "expo-image";
import { Icon } from "./icon";
import { AppText } from "./text";
import { colors, colorRoles, radius, space } from "./theme";
import { layout } from "./styles";
import { formatVnd } from "./format";
import { motion, useReducedMotion } from "./motion";

export function BookCover({
  source,
  label,
  missing = false,
  style,
  cachePolicy,
  onError,
  onLoad,
  loading = false,
  fadeIn = false,
}: {
  source?: ImageSource | number;
  label: string;
  missing?: boolean;
  style?: StyleProp<ViewStyle>;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  onError?: () => void;
  onLoad?: () => void;
  loading?: boolean;
  fadeIn?: boolean;
}) {
  const key = typeof source === "number" ? String(source) : source?.uri;
  return (
    <View style={[layout.cover, style]}>
      {source && !missing ? (
        <SourceCover
          key={key}
          source={source}
          label={label}
          cachePolicy={cachePolicy}
          fadeIn={fadeIn}
          onError={onError}
          onLoad={onLoad}
        />
      ) : (
        <CoverPlaceholder label={label} loading={loading} />
      )}
    </View>
  );
}

function CoverPlaceholder({
  label,
  loading = false,
  failed = false,
}: {
  label: string;
  loading?: boolean;
  failed?: boolean;
}) {
  const message = loading
    ? "Đang tải ảnh…"
    : failed
      ? "Ảnh chưa tải được."
      : "Chưa có ảnh bìa";
  return (
    <View
      style={layout.placeholder}
      accessible
      accessibilityLabel={`${label}. ${message}`}
      pointerEvents="none"
    >
      <Icon name="book" size={30} color={colors.muted} />
      <AppText
        kind="small"
        color={colors.muted}
        style={{ textAlign: "center" }}
      >
        {message}
      </AppText>
    </View>
  );
}

// Each signed source owns its callbacks; an old request cannot fail a new attempt.
function SourceCover({
  source,
  label,
  cachePolicy,
  fadeIn,
  onError,
  onLoad,
}: {
  source: ImageSource | number;
  label: string;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  fadeIn: boolean;
  onError?: () => void;
  onLoad?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef(false);
  const settled = useRef(false);
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(fadeIn ? 0 : 1));
  const wasLoaded = useRef(false);
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    const firstLoad = loaded && !wasLoaded.current;
    wasLoaded.current = loaded;
    opacity.stopAnimation();
    if (!fadeIn || reducedMotion || !firstLoad) {
      opacity.setValue(loaded || !fadeIn ? 1 : 0);
    } else {
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }
    return () => opacity.stopAnimation();
  }, [fadeIn, loaded, reducedMotion, opacity]);
  if (failed) return <CoverPlaceholder label={label} failed />;
  return (
    <View style={{ width: "100%", height: "100%" }}>
      {fadeIn && !loaded && <CoverPlaceholder label={label} loading />}
      <Animated.View
        style={{ position: "absolute", width: "100%", height: "100%", opacity }}
      >
        <Image
          source={source}
          accessible={!fadeIn || loaded}
          accessibilityLabel={label}
          contentFit="contain"
          cachePolicy={cachePolicy}
          transition={0}
          style={{ width: "100%", height: "100%" }}
          onLoad={() => {
            if (!live.current || settled.current) return;
            settled.current = true;
            setLoaded(true);
            onLoad?.();
          }}
          onError={() => {
            if (!live.current || settled.current) return;
            settled.current = true;
            setFailed(true);
            onError?.();
          }}
        />
      </Animated.View>
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
  columns = false,
  stacked = false,
}: {
  sale?: number;
  exchange?: number;
  reading?: boolean;
  columns?: boolean;
  stacked?: boolean;
}) {
  return (
    <View
      style={[
        layout.row,
        {
          flexWrap: "wrap",
          flexDirection: stacked ? "column" : "row",
          alignItems: "flex-start",
          gap: columns ? space.section : reading ? space.md : space.xxl,
        },
      ]}
    >
      {[
        ["Giá bán", sale],
        ["Giá trị đổi", exchange],
      ].map(([label, amount]) =>
        typeof amount === "number" ? (
          <View
            key={label}
            style={[
              reading && { maxWidth: "100%" },
              columns && { flexGrow: 1, flexBasis: "auto", maxWidth: "100%" },
            ]}
          >
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
export function BookOffer({
  sale,
  exchange,
  horizontal = false,
}: {
  sale?: number;
  exchange?: number;
  horizontal?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: horizontal ? "row" : "column",
        flexWrap: "wrap",
        columnGap: space.xxl,
        rowGap: space.xs,
      }}
    >
      {(
        [
          ["Bán", sale],
          ["Đổi", exchange],
        ] as const
      ).map(([label, amount]) =>
        typeof amount === "number" ? (
          <View
            key={label}
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              flexWrap: "wrap",
              columnGap: space.sm,
              maxWidth: "100%",
            }}
          >
            <AppText kind="annotation" color={colors.muted}>
              {label}
            </AppText>
            <AppText
              kind="shelfPrice"
              accessibilityLabel={`${label === "Bán" ? "Giá bán" : "Giá trị đổi"}: ${formatVnd(amount)}`}
            >
              {formatVnd(amount)}
            </AppText>
          </View>
        ) : null,
      )}
    </View>
  );
}

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
    <View style={{ gap: space.sm }}>
      <BookPrice sale={sale} exchange={exchange} reading columns />
      {children}
    </View>
  );
}
