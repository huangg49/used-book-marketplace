import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { signedMediaRemainingMs } from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  colors,
  space,
  stitchTokens,
} from "../../core/ui";
import { mediaRead, type Media } from "./contracts";

const TARGET_RATIO = 3 / 4; // 0.75 portrait ratio
const FRAME_WIDTH = 210;
const FRAME_HEIGHT = 280; // 210 / (3/4) = 280

export interface DraftCoverCropProps {
  listingId: string;
  mediaId: string;
  mediaStatus?: Media["status"];
  editable?: boolean;
  locked?: boolean;
  retryAvailable?: boolean;
  onOpenViewer?: () => void;
  onChangeCover?: () => void;
  onRemoveCover?: () => void;
}

export function DraftCoverCrop({
  listingId,
  mediaId,
  mediaStatus,
  editable = true,
  locked = false,
  retryAvailable = false,
  onOpenViewer,
  onChangeCover,
  onRemoveCover,
}: DraftCoverCropProps) {
  const { client } = useSession();
  const foreground = useForeground();
  const [expired, setExpired] = useState("");
  const [failed, setFailed] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const ready = !mediaStatus || mediaStatus === "Ready";

  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Offset percent: 0 (top/left) to 100 (bottom/right), default 50 (center)
  const [offset, setOffset] = useState<number>(50);

  const preview = useQuery({
    queryKey: ["media-read", listingId, mediaId],
    queryFn: async () => {
      const signed = await client.request(
        `/me/listings/${listingId}/media/${mediaId}/read`,
        mediaRead,
      );
      if (signedMediaRemainingMs(signed.expiresAt) <= 0)
        throw new Error("Signed image expired before display");
      return signed;
    },
    enabled: !!mediaId && foreground && ready,
    staleTime: 60_000,
    gcTime: 120_000,
    refetchInterval: foreground && ready ? 60_000 : false,
    retry: false,
  });

  useEffect(() => {
    if (!preview.data) return;
    const expiry = preview.data.expiresAt;
    const timer = setTimeout(
      () => setExpired(expiry),
      Math.max(0, Date.parse(expiry) - Date.now()) + 10,
    );
    return () => clearTimeout(timer);
  }, [preview.data]);

  const imageUrl = preview.data?.url;

  useEffect(() => {
    if (!imageUrl) return;
    Image.getSize(
      imageUrl,
      (w, h) => {
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      },
      () => {
        // Fallback if getSize fails
        setDimensions({ width: 300, height: 400 });
      },
    );
  }, [imageUrl, attempt]);

  const available =
    foreground &&
    ready &&
    !preview.error &&
    preview.data &&
    preview.data.expiresAt !== expired;

  const retry = !!mediaId && ready && foreground && (
    preview.isError ||
    (!!failed && failed === preview.data?.url) ||
    (!!preview.data && !available)
  );

  // Determine aspect ratio and orientation
  const naturalRatio = dimensions
    ? dimensions.width / dimensions.height
    : TARGET_RATIO;
  const isVertical = naturalRatio < TARGET_RATIO - 0.005;
  const isHorizontal = naturalRatio > TARGET_RATIO + 0.005;
  const canAdjust = isVertical || isHorizontal;

  // Calculate image rendering size inside 3:4 frame
  let renderedWidth = FRAME_WIDTH;
  let renderedHeight = FRAME_HEIGHT;
  let maxShift = 0;
  let translateY = 0;
  let translateX = 0;

  if (isVertical) {
    renderedWidth = FRAME_WIDTH;
    renderedHeight = FRAME_WIDTH / naturalRatio;
    maxShift = Math.max(0, renderedHeight - FRAME_HEIGHT);
    translateY = -(offset / 100) * maxShift;
  } else if (isHorizontal) {
    renderedHeight = FRAME_HEIGHT;
    renderedWidth = FRAME_HEIGHT * naturalRatio;
    maxShift = Math.max(0, renderedWidth - FRAME_WIDTH);
    translateX = -(offset / 100) * maxShift;
  }

  // Touch state for dragging cover frame
  const [touchStartPos, setTouchStartPos] = useState({ x: 0, y: 0, offset: 50 });
  const [sliderWidth, setSliderWidth] = useState(0);

  const handleFrameTouchStart = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
    if (!canAdjust) return;
    setTouchStartPos({
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      offset,
    });
  };

  const handleFrameTouchMove = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
    if (!canAdjust || maxShift <= 0) return;
    const delta = isVertical
      ? touchStartPos.y - e.nativeEvent.pageY
      : touchStartPos.x - e.nativeEvent.pageX;
    const deltaPercent = (delta / maxShift) * 100;
    const next = Math.max(0, Math.min(100, touchStartPos.offset + deltaPercent));
    setOffset(next);
  };

  const handleSliderTouch = (e: { nativeEvent: { locationX: number } }) => {
    if (sliderWidth <= 0) return;
    const next = Math.max(0, Math.min(100, (e.nativeEvent.locationX / sliderWidth) * 100));
    setOffset(next);
  };

  const isAlignActive = (target: number) => Math.abs(offset - target) < 10;

  return (
    <View style={styles.cardContainer}>
      {/* 3:4 Portrait Book Cover Frame */}
      <View style={styles.coverFrameOuter}>
        <View
          style={styles.coverFrame}
          onTouchStart={handleFrameTouchStart}
          onTouchMove={handleFrameTouchMove}
        >
          {available && imageUrl && failed !== imageUrl ? (
            <View
              style={[
                styles.imageTransformWrapper,
                {
                  width: renderedWidth,
                  height: renderedHeight,
                  transform: [{ translateX }, { translateY }],
                },
              ]}
            >
              <Image
                key={`${imageUrl}/${attempt}`}
                source={{ uri: imageUrl }}
                accessibilityLabel="Ảnh bìa bản sách"
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={() => setFailed(imageUrl)}
              />
            </View>
          ) : (
            <View style={styles.emptyPlaceholder}>
              <Icon name="book" size={32} color={colors.muted} />
            </View>
          )}

          {/* Badge: Bìa bản sách 3:4 */}
          <View style={styles.ratioBadge}>
            <AppText kind="small" style={styles.ratioBadgeText}>
              BÌA BẢN SÁCH (3:4)
            </AppText>
          </View>
        </View>

        {mediaStatus ? (
          <AppText kind="small" style={styles.statusLabel}>
            {{
              Pending: "Chưa tải xong",
              Processing: "Đang kiểm tra ảnh",
              Ready: "Ảnh đã sẵn sàng",
              Failed: "Ảnh chưa xử lý được",
            }[mediaStatus]}
          </AppText>
        ) : null}

        {retry ? (
          <View style={{ gap: space.xs, alignItems: "center" }}>
            <AppText kind="small" color={colors.rustText}>
              Chưa tải được ảnh xem trước.
            </AppText>
            <Button
              secondary
              title="Tải lại ảnh"
              busy={preview.isFetching}
              onPress={() => {
                setFailed(undefined);
                setAttempt((v) => v + 1);
                void preview.refetch();
              }}
            />
          </View>
        ) : null}
      </View>

      {/* Control Panel: Position Alignment & Slider */}
      {canAdjust ? (
        <View style={styles.controlsSection}>
          <View style={styles.alignHeaderRow}>
            <View style={styles.alignLabelWrap}>
              <Icon name="tune" size={14} color={stitchTokens.wine} />
              <AppText kind="bold" style={styles.controlTitle}>
                Vị trí khung cắt:
              </AppText>
            </View>
            <View style={styles.alignButtonGroup}>
              {isVertical ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí trên"
                    onPress={() => setOffset(0)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(0) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(0) && styles.alignBtnTextActive,
                      ]}
                    >
                      Trên
                    </AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí giữa"
                    onPress={() => setOffset(50)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(50) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(50) && styles.alignBtnTextActive,
                      ]}
                    >
                      Giữa
                    </AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí dưới"
                    onPress={() => setOffset(100)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(100) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(100) && styles.alignBtnTextActive,
                      ]}
                    >
                      Dưới
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí trái"
                    onPress={() => setOffset(0)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(0) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(0) && styles.alignBtnTextActive,
                      ]}
                    >
                      Trái
                    </AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí giữa"
                    onPress={() => setOffset(50)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(50) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(50) && styles.alignBtnTextActive,
                      ]}
                    >
                      Giữa
                    </AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Căn vị trí phải"
                    onPress={() => setOffset(100)}
                    style={[
                      styles.alignBtn,
                      isAlignActive(100) && styles.alignBtnActive,
                    ]}
                  >
                    <AppText
                      kind="small"
                      style={[
                        styles.alignBtnText,
                        isAlignActive(100) && styles.alignBtnTextActive,
                      ]}
                    >
                      Phải
                    </AppText>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {/* Interactive Touch Slider */}
          <View
            style={styles.sliderContainer}
            onLayout={(e) => {
              setSliderWidth(e.nativeEvent.layout.width);
            }}
            onTouchStart={handleSliderTouch}
            onTouchMove={handleSliderTouch}
          >
            <View style={styles.sliderTrackBackground}>
              <View
                style={[
                  styles.sliderTrackActive,
                  { width: `${Math.round(offset)}%` },
                ]}
              />
            </View>
            <View
              style={[
                styles.sliderThumb,
                { left: `${Math.round(offset)}%` },
              ]}
            >
              <View style={styles.sliderThumbInner} />
            </View>
          </View>

          <AppText kind="small" style={styles.helpHint}>
            {isVertical
              ? "Kéo trực tiếp trên ảnh hoặc dùng thanh trượt để di chuyển lên / xuống (tỉ lệ 3:4)."
              : "Kéo trực tiếp trên ảnh hoặc dùng thanh trượt để di chuyển sang trái / phải (tỉ lệ 3:4)."}
          </AppText>
        </View>
      ) : null}

      {/* Action Buttons: Xem lớn, Thay ảnh, Xóa bìa */}
      <View style={styles.actionButtonsRow}>
        {onOpenViewer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem ảnh bìa lớn"
            onPress={onOpenViewer}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnView,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Icon name="eye" size={15} color={stitchTokens.wineDark} />
            <AppText kind="bold" style={styles.actionBtnTextView}>
              Xem lớn
            </AppText>
          </Pressable>
        ) : null}

        {editable && onChangeCover ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thay ảnh bìa"
            disabled={locked || retryAvailable}
            onPress={onChangeCover}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnChange,
              (locked || retryAvailable) && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Icon name="camera" size={15} color={stitchTokens.wine} />
            <AppText kind="bold" style={styles.actionBtnTextChange}>
              Thay ảnh
            </AppText>
          </Pressable>
        ) : null}

        {editable && onRemoveCover ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa ảnh bìa"
            disabled={locked}
            onPress={onRemoveCover}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnRemove,
              locked && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Icon name="trash" size={15} color={stitchTokens.darkRed} />
            <AppText kind="bold" style={styles.actionBtnTextRemove}>
              Xóa bìa
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    padding: space.sm,
    gap: space.sm,
  },
  coverFrameOuter: {
    alignItems: "center",
    gap: 6,
  },
  coverFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.wineDark,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
    position: "relative",
  },
  imageTransformWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  emptyPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ratioBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: stitchTokens.wine,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: stitchTokens.goldAccent,
  },
  ratioBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: stitchTokens.gold,
    letterSpacing: 0.4,
  },
  statusLabel: {
    fontSize: 11,
    color: stitchTokens.roseBrown,
    fontWeight: "500",
  },

  // Alignment Controls Section
  controlsSection: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: 10,
    gap: 8,
  },
  alignHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alignLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  controlTitle: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  alignButtonGroup: {
    flexDirection: "row",
    gap: 5,
  },
  alignBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
  },
  alignBtnActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wineDark,
  },
  alignBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.charcoalBrown,
  },
  alignBtnTextActive: {
    color: stitchTokens.gold,
    fontWeight: "700",
  },

  // Slider Bar
  sliderContainer: {
    height: 30,
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 11,
  },
  sliderTrackBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.peachBorder,
    overflow: "hidden",
  },
  sliderTrackActive: {
    height: "100%",
    backgroundColor: stitchTokens.wine,
  },
  sliderThumb: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -11,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 2.5,
    borderColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  sliderThumbInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.gold,
  },
  helpHint: {
    fontSize: 10.5,
    color: stitchTokens.roseBrown,
    textAlign: "center",
    lineHeight: 15,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: space.xs,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnView: {
    borderColor: stitchTokens.borderWarm,
    backgroundColor: stitchTokens.whiteSurface,
  },
  actionBtnTextView: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  actionBtnChange: {
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  actionBtnTextChange: {
    fontSize: 12,
    color: stitchTokens.wine,
  },
  actionBtnRemove: {
    borderColor: stitchTokens.flashRedBg,
    backgroundColor: stitchTokens.flashRedBg,
  },
  actionBtnTextRemove: {
    fontSize: 12,
    color: stitchTokens.darkRed,
  },
});
