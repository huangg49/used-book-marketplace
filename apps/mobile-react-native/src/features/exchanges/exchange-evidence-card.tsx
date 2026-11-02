import { useState } from "react";
import { View, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
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
import { AppText, Button, Notice, space } from "../../core/ui";
export function ExchangeEvidenceCard({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const { client, state } = useSession();
  const userId = state.status === "authenticated" ? state.user.id : "";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [resumeId, setResumeId] = useState<string>();
  const list = useQuery({
    queryKey: ["exchange-evidence", userId, id],
    queryFn: () =>
      client.request(`/exchanges/${id}/evidence`, exchangeEvidenceListSchema),
    retry: false,
    refetchInterval: 5000,
  });
  const pending = pendingEvidence(client, id);
  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let input: EvidenceInput | null = null;
      if (!pending) {
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
        if (result.canceled) return;
        if (evidenceIdentity(client) !== userId) return;
        const asset = result.assets[0],
          mime = asset.mimeType as EvidenceInput["mimeType"];
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
          ? 10000000
          : mime === "application/pdf"
            ? 20000000
            : 100000000;
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
  return (
    <View
      style={{ gap: space.sm, padding: space.md }}
      accessibilityLabel="Bằng chứng sự cố"
    >
      <AppText kind="title">Bằng chứng sự cố</AppText>
      <AppText>
        Báo sự cố đã tiếp nhận; tải tệp lỗi không làm mất báo cáo. Tiền tiếp tục
        được giữ. Video không bắt buộc.
      </AppText>
      <AppText>
        Ảnh tối đa 10 MB, PDF tĩnh 20 MB, MP4 100 MB. Tối đa 10 tệp mỗi người,
        gồm tệp đang chờ.
      </AppText>
      {list.isPending && <AppText>Đang tải bằng chứng…</AppText>}
      {list.isError ? (
        <>
          <Notice>Chưa tải được danh sách.</Notice>
          <Button
            title="Tải lại bằng chứng"
            secondary
            onPress={() => void list.refetch()}
          />
        </>
      ) : (
        list.data?.items.map((e) => (
          <View key={e.id} style={{ gap: space.xs }}>
            <AppText>
              {e.fileName} · {e.status === "Ready" ? "Đã gửi" : "Chưa gửi xong"}{" "}
              · {Math.ceil(e.byteSize / 1000)} KB
            </AppText>
            {e.status === "Ready" ? (
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
                  onPress={() => setResumeId(e.id)}
                />
              )
            )}
          </View>
        ))
      )}
      {resumeId && (
        <AppText>
          Chọn lại đúng tệp gốc; máy chủ đối chiếu hash và không ghi đè.
        </AppText>
      )}
      {pending && (
        <Notice>
          Chưa rõ kết quả: {pending.fileName}. Thử lại gửi cùng yêu cầu.
        </Notice>
      )}
      <Button
        title={pending ? "Thử lại gửi bằng chứng" : "Chọn và gửi bằng chứng"}
        busy={busy || pending?.busy}
        onPress={() => void send()}
      />
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}
