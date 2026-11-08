import { useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AUCTION_FLAG_MIN_TEXT,
  auctionFlagBody,
  auctionFlagCasesPath,
  auctionFlagCategories,
  auctionFlagScope,
  openAuctionFlag,
  pendingSupportIntent,
  sendSupportIntent,
  supportError,
  supportPageSchema,
  supportStates,
  type AuctionFlagCategory,
} from "@used-books/session-client";
import { ApiError } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Chip,
  Icon,
  Notice,
  Sheet,
  TextField,
  colors,
  space,
} from "../../core/ui";

export const auctionFlagKey = (owner: string, auctionId: string) =>
  ["support", owner, "auction-flag", auctionId] as const;

/**
 * ADR 0078: the seller and members who registered or bid flag a problem with
 * the auction to the Admin queue. A flag is a support case; it never pauses the
 * auction or moves money by itself.
 */
export function AuctionFlag({
  auction,
  owner,
}: {
  auction: { id: string; title: string };
  owner: string;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const existing = useQuery({
    queryKey: auctionFlagKey(owner, auction.id),
    queryFn: () => client.request(auctionFlagCasesPath(auction.id), supportPageSchema),
    staleTime: 0,
    retry: false,
  });
  const current = openAuctionFlag(existing.data);
  const scope = auctionFlagScope(auction.id);
  const [category, setCategory] = useState<AuctionFlagCategory["id"] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // A lost response pins the body and Idempotency-Key; the retry resends them.
  const pending = pendingSupportIntent(client, scope);
  const chosen = auctionFlagCategories.find((c) => c.id === category) ?? null;
  const locked = busy || pending;

  const submit = async () => {
    if (busy) return;
    if (!pending && (!chosen || text.trim().length < AUCTION_FLAG_MIN_TEXT)) {
      setInvalid(true);
      setError(chosen ? null : "Chọn loại sự cố trước khi gửi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendSupportIntent(
        client,
        scope,
        "/me/support-cases",
        chosen ? auctionFlagBody(chosen, auction, text) : null,
        () => Crypto.randomUUID(),
      );
      setCategory(null);
      setText("");
      setInvalid(false);
      setVisible(false);
      await queryClient.invalidateQueries({ queryKey: ["support"] });
    } catch (caught) {
      // A duplicate means an open case already exists: show it on the screen.
      if (caught instanceof ApiError && caught.status === 409) void existing.refetch();
      setError(supportError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      {current ? (
        <Notice>
          {`Bạn đã báo cáo phiên này cho Admin (mã ${current.id.slice(0, 8).toUpperCase()}, ${supportStates[current.state].toLowerCase()}). Admin trả lời qua thông báo và mục Yêu cầu hỗ trợ trên web Lật lại.`}
        </Notice>
      ) : (
        <Button
          secondary
          wine
          title="Báo cáo sự cố cho Admin"
          disabled={existing.isPending}
          onPress={() => setVisible(true)}
        />
      )}
      <Sheet
        title="Báo cáo sự cố"
        visible={visible}
        onClose={() => !busy && setVisible(false)}
        dismissible={!busy}
        footer={
          <Button
            title={busy ? "Đang gửi…" : pending ? "Thử lại báo cáo đã gửi" : "Gửi cho Admin"}
            busy={busy}
            onPress={() => void submit()}
          />
        }
      >
        <View style={{ gap: space.lg }}>
          <AppText kind="bold" numberOfLines={2}>
            {auction.title}
          </AppText>
          {pending && (
            <Notice tone="warning">
              Báo cáo trước chưa xác định được kết quả. Thử lại sẽ gửi đúng nội dung đó một lần nữa, không tạo hồ sơ trùng.
            </Notice>
          )}
          <View style={{ gap: space.sm }}>
            <AppText kind="label" color={colors.muted}>
              BẠN GẶP VẤN ĐỀ GÌ?
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {auctionFlagCategories.map((c) => (
                <Chip
                  key={c.id}
                  wine
                  title={c.label}
                  selected={category === c.id}
                  disabled={locked}
                  onPress={() => {
                    setCategory(c.id);
                    setError(null);
                  }}
                />
              ))}
            </View>
          </View>
          <TextField
            label="Mô tả sự việc"
            multiline
            value={text}
            editable={!locked}
            maxLength={5000}
            onChangeText={(value) => {
              setText(value);
              setInvalid(false);
            }}
            hint={`${chosen?.hint ?? "Ghi mốc thời gian, số tiền hoặc thông tin giúp Admin đối chiếu."} Không gửi mật khẩu, OTP hoặc thông tin thẻ.`}
            error={
              invalid && chosen && text.trim().length < AUCTION_FLAG_MIN_TEXT
                ? `Mô tả ít nhất ${AUCTION_FLAG_MIN_TEXT} ký tự để Admin đối chiếu được.`
                : undefined
            }
          />
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <Icon name="info" size={15} color={colors.muted} />
            <AppText kind="small" color={colors.muted} style={{ flex: 1 }}>
              Báo cáo được gửi tới Admin, không tự dừng phiên hay hoàn tiền. Admin đối chiếu lượt giá, tiền cọc và khoản giữ rồi phản hồi qua thông báo. Mỗi phiên bạn có một hồ sơ đang mở.
            </AppText>
          </View>
          {error && <Notice tone="error">{error}</Notice>}
        </View>
      </Sheet>
    </View>
  );
}
