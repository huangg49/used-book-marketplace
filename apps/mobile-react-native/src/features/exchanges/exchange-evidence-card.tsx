import { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import {
  exchangeEvidenceListSchema,
  exchangeEvidenceReadSchema,
  pendingEvidence,
  sendEvidence,
  resumeEvidence,
  evidenceIdentity,
  type EvidenceInput,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";

interface PickedEvidenceAsset {
  uri: string;
  name: string;
  mimeType: EvidenceInput["mimeType"];
  size: number;
  file?: globalThis.File;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function pickEvidenceAsset(): Promise<PickedEvidenceAsset | null> {
  try {
    const DocumentPicker = await import("expo-document-picker");
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "video/mp4",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType: (asset.mimeType || "image/jpeg") as EvidenceInput["mimeType"],
      size: asset.size ?? 0,
      file: asset.file,
    };
  } catch {
    const ImagePicker = await import("expo-image-picker");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    const a = res.assets[0];
    return {
      uri: a.uri,
      name:
        a.fileName || (a.type === "video" ? "evidence.mp4" : "evidence.jpg"),
      mimeType: (a.mimeType ||
        (a.type === "video"
          ? "video/mp4"
          : "image/jpeg")) as EvidenceInput["mimeType"],
      size: a.fileSize || 0,
      file: (a as { file?: globalThis.File }).file,
    };
  }
}

export function ExchangeEvidenceCard({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const { client, state } = useSession();
  const userId = state.status === "authenticated" ? state.user.id : "";
  const [selectedAsset, setSelectedAsset] =
    useState<PickedEvidenceAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resumeId, setResumeId] = useState<string>();

  const list = useQuery({
    queryKey: ["exchange-evidence", userId, id],
    queryFn: () =>
      client.request(`/exchanges/${id}/evidence`, exchangeEvidenceListSchema),
    retry: false,
    refetchInterval: 5000,
  });

  const pending = pendingEvidence(client, id);

  async function chooseAndSend() {
    if (busy || pending) return;
    setError("");
    setMessage("");
    try {
      const asset = await pickEvidenceAsset();
      if (!asset) return;
      const mime = asset.mimeType;
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
          "video/mp4",
        ].includes(mime)
      ) {
        setError("Dùng JPEG, PNG, WebP, PDF hoặc MP4.");
        return;
      }
      const max = mime.startsWith("image/")
        ? 10_000_000
        : mime === "application/pdf"
          ? 20_000_000
          : 100_000_000;
      if ((asset.size ?? 0) > max) {
        setError(`Tệp vượt giới hạn dung lượng (${formatBytes(max)}).`);
        return;
      }
      setSelectedAsset(asset);
      await send(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa chọn được tệp.");
    }
  }

  async function send(directAsset?: PickedEvidenceAsset) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let input: EvidenceInput | null = null;
      if (!pending) {
        const asset = directAsset ?? selectedAsset ?? (await pickEvidenceAsset());
        if (!asset) return;
        if (evidenceIdentity(client) !== userId) return;
        const mime = asset.mimeType;
        if (
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "video/mp4",
          ].includes(mime)
        )
          throw Error("Dùng JPEG, PNG, WebP, PDF hoặc MP4.");
        const max = mime.startsWith("image/")
          ? 10_000_000
          : mime === "application/pdf"
            ? 20_000_000
            : 100_000_000;
        if ((asset.size ?? 0) > max)
          throw Error("Tệp vượt giới hạn dung lượng.");
        const bytes = asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : new Uint8Array(await new File(asset.uri).arrayBuffer());
        const hash = await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          bytes,
        );
        if (evidenceIdentity(client) !== userId) return;
        input = {
          bytes,
          fileName: asset.name,
          mimeType: mime,
          sha256: Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
          expectedVersion: revision,
        };
      }
      if (resumeId && input)
        await resumeEvidence(client, id, resumeId, input, () =>
          Crypto.randomUUID(),
        );
      else await sendEvidence(client, id, input, () => Crypto.randomUUID());
      if (evidenceIdentity(client) !== userId) return;
      setSelectedAsset(null);
      setResumeId(undefined);
      setMessage(
        "Máy chủ đã ghi nhận tệp. Nhóm vận hành có thể xem sau khi nhận phụ trách.",
      );
      await list.refetch();
    } catch (e) {
      if (evidenceIdentity(client) === userId)
        setError(
          e instanceof Error ? e.message : "Chưa gửi được. Thử lại cùng tệp.",
        );
    } finally {
      setBusy(false);
    }
  }

  async function read(eid: string) {
    setError("");
    try {
      const r = await client.request(
        `/exchanges/${id}/evidence/${eid}/read`,
        exchangeEvidenceReadSchema,
        { method: "POST" },
      );
      if (evidenceIdentity(client) === userId) await Linking.openURL(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa tải được tệp.");
    }
  }

  const itemsCount = list.data?.items.length ?? 0;
  const isImagePreview = Boolean(selectedAsset?.mimeType.startsWith("image/"));

  return (
    <View style={styles.card} accessibilityLabel="Bằng chứng sự cố">
      {/* 1. Card Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.headerIconBox}>
            <Icon name="shield" size={18} color={stitchTokens.wineDark} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={styles.titleText}>
              Bằng chứng sự cố
            </AppText>
            <AppText kind="small" color={colors.muted}>
              Đối chiếu ảnh chụp &amp; video mở hộp khi phân xử
            </AppText>
          </View>
        </View>
        <View style={styles.countBadge}>
          <AppText kind="small" style={styles.countBadgeText}>
            {`${itemsCount}/10 tệp`}
          </AppText>
        </View>
      </View>

      {/* 2. Guidelines Banner */}
      <View style={styles.guidelineBox}>
        <AppText kind="small" style={styles.guidelineText}>
          Báo sự cố đã tiếp nhận; tải tệp lỗi không làm mất báo cáo. Tiền tiếp
          tục được giữ an toàn. Ảnh tối đa 10 MB, PDF 20 MB, MP4 100 MB (tối đa
          10 tệp mỗi bên).
        </AppText>
      </View>

      {/* 3. Upload & Visual Preview Area */}
      {!selectedAsset && !pending ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chọn và gửi bằng chứng"
          disabled={busy}
          onPress={() => void chooseAndSend()}
          style={({ pressed }) => [
            styles.dropzone,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
        >
          <View style={styles.dropzoneIconCircle}>
            <Icon name="plus" size={20} color={stitchTokens.wineDark} />
          </View>
          <AppText kind="bold" style={styles.dropzoneTitle}>
            {resumeId
              ? "Chọn lại đúng tệp gốc để gửi tiếp"
              : "Chọn ảnh hoặc video bằng chứng"}
          </AppText>
          <AppText kind="small" color={colors.muted}>
            Hỗ trợ JPG, PNG, WebP, PDF hoặc video MP4
          </AppText>
        </Pressable>
      ) : selectedAsset ? (
        <View style={styles.previewBox}>
          <View style={styles.previewHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText kind="bold" numberOfLines={1} style={styles.previewName}>
                {selectedAsset.name}
              </AppText>
              <AppText kind="small" color={colors.muted}>
                {selectedAsset.size > 0
                  ? `${formatBytes(selectedAsset.size)} · ${selectedAsset.mimeType}`
                  : selectedAsset.mimeType}
              </AppText>
            </View>
            {!busy && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedAsset(null);
                  setResumeId(undefined);
                  setMessage("");
                  setError("");
                }}
                style={styles.changeFileBtn}
              >
                <AppText kind="bold" style={styles.changeFileText}>
                  Đổi tệp
                </AppText>
              </Pressable>
            )}
          </View>

          {isImagePreview ? (
            <View style={styles.imagePreviewFrame}>
              <Image
                source={{ uri: selectedAsset.uri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={styles.nonImagePreviewCard}>
              <Icon
                name={
                  selectedAsset.mimeType === "video/mp4" ? "flame" : "ticket"
                }
                size={18}
                color={stitchTokens.wineDark}
              />
              <AppText kind="small" style={{ color: stitchTokens.deepCocoa, flex: 1 }}>
                {selectedAsset.mimeType === "video/mp4"
                  ? "Video MP4 đã sẵn sàng tải lên để đối chiếu."
                  : "Tài liệu PDF đã sẵn sàng tải lên."}
              </AppText>
            </View>
          )}

          <Button
            wine
            title={busy ? "Đang gửi tệp..." : "Gửi bằng chứng"}
            busy={busy}
            onPress={() => void send()}
          />
        </View>
      ) : null}

      {resumeId && (
        <Notice tone="info">
          Chọn lại đúng tệp gốc; máy chủ đối chiếu mã băm SHA-256 và không ghi
          đè.
        </Notice>
      )}

      {pending && (
        <View style={{ gap: space.xs }}>
          <Notice>
            Chưa rõ kết quả: {pending.fileName}. Thử lại gửi cùng yêu cầu.
          </Notice>
          <Button
            wine
            title="Thử lại gửi bằng chứng"
            busy={busy || pending?.busy}
            onPress={() => void send()}
          />
        </View>
      )}

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {/* 4. Uploaded Evidence List */}
      <View style={styles.listSection}>
        <AppText kind="bold" style={styles.listHeading}>
          Bằng chứng đã gửi ({itemsCount})
        </AppText>

        {list.isPending && (
          <AppText kind="small" color={colors.muted}>
            Đang tải danh sách bằng chứng…
          </AppText>
        )}

        {list.isError ? (
          <View style={{ gap: space.xs }}>
            <Notice tone="error">Chưa tải được danh sách bằng chứng.</Notice>
            <Button
              title="Tải lại bằng chứng"
              secondary
              onPress={() => void list.refetch()}
            />
          </View>
        ) : !list.data?.items.length ? (
          <View style={styles.emptyListBox}>
            <AppText kind="small" color={colors.muted}>
              Chưa có tệp bằng chứng nào được tải lên.
            </AppText>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {list.data.items.map((e) => {
              const isReady = e.status === "Ready";
              return (
                <View key={e.id} style={styles.evidenceRowCard}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <AppText
                        kind="bold"
                        numberOfLines={1}
                        style={styles.evidenceFileName}
                      >
                        {e.fileName}
                      </AppText>
                      <View
                        style={[
                          styles.statusBadge,
                          isReady
                            ? styles.statusBadgeReady
                            : styles.statusBadgePending,
                        ]}
                      >
                        <AppText
                          kind="small"
                          style={[
                            styles.statusBadgeText,
                            isReady
                              ? styles.statusTextReady
                              : styles.statusTextPending,
                          ]}
                        >
                          {isReady ? "Đã gửi" : "Chưa gửi xong"}
                        </AppText>
                      </View>
                    </View>
                    <AppText kind="small" color={colors.muted}>
                      {`${Math.ceil(e.byteSize / 1000)} KB · ${new Date(
                        e.createdAt,
                      ).toLocaleDateString("vi-VN")}`}
                    </AppText>
                  </View>

                  {isReady ? (
                    <Button
                      secondary
                      title={"Tải tệp " + e.fileName}
                      onPress={() => void read(e.id)}
                    />
                  ) : (
                    e.uploaderId === userId && (
                      <Button
                        secondary
                        disabled={!!pending || busy}
                        title={"Gửi tiếp " + e.fileName}
                        onPress={() => {
                          setResumeId(e.id);
                          setSelectedAsset(null);
                        }}
                      />
                    )
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  countBadge: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  guidelineBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  guidelineText: {
    fontSize: 12,
    lineHeight: 17,
    color: stitchTokens.deepCocoa,
  },
  dropzone: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: stitchTokens.wineDark,
    backgroundColor: stitchTokens.roseWarmSurface,
    gap: 6,
  },
  dropzoneIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  dropzoneTitle: {
    fontSize: 14,
    color: stitchTokens.wineDark,
    textAlign: "center",
  },
  previewBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 10,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  previewName: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  changeFileBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  changeFileText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
  },
  imagePreviewFrame: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  nonImagePreviewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  listSection: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  listHeading: {
    fontSize: 14,
    color: stitchTokens.wineDark,
  },
  emptyListBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
  },
  evidenceRowCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 8,
  },
  evidenceFileName: {
    fontSize: 13,
    color: stitchTokens.deepCocoa,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusBadgeReady: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.greenBorderSoft,
  },
  statusBadgePending: {
    backgroundColor: stitchTokens.amberBg,
    borderColor: stitchTokens.goldBorder,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusTextReady: {
    color: stitchTokens.likeNewGreen,
  },
  statusTextPending: {
    color: stitchTokens.wineDark,
  },
});
