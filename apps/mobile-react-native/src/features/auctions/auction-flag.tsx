import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  stitchTokens,
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
  externalVisible,
  onExternalClose,
  hideTrigger = false,
}: {
  auction: { id: string; title: string };
  owner: string;
  externalVisible?: boolean;
  onExternalClose?: () => void;
  hideTrigger?: boolean;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [internalVisible, setInternalVisible] = useState(false);
  const visible = externalVisible !== undefined ? externalVisible : internalVisible;
  const close = () => {
    if (onExternalClose) onExternalClose();
    else setInternalVisible(false);
  };

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
      close();
      await queryClient.invalidateQueries({ queryKey: ["support"] });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) void existing.refetch();
      setError(supportError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {current ? (
        <View style={styles.openCaseBanner}>
          <Icon name="shield" size={18} color={colors.warning} />
          <View style={styles.openCaseText}>
            <AppText kind="bold" style={styles.openCaseTitle}>
              {`Hồ sơ báo cáo #${current.id.slice(0, 8).toUpperCase()} (${supportStates[current.state]})`}
            </AppText>
            <AppText kind="small" color={colors.ink} style={styles.openCaseNote}>
              Admin đã tiếp nhận và sẽ phản hồi qua thông báo và mục Yêu cầu hỗ trợ.
            </AppText>
          </View>
        </View>
      ) : !hideTrigger ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Báo cáo sự cố cho Admin"
          disabled={existing.isPending}
          onPress={() => setInternalVisible(true)}
          style={({ pressed }) => [
            styles.triggerRow,
            existing.isPending && styles.triggerDisabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.triggerLeft}>
            <Icon name="shield" size={17} color={stitchTokens.wineDark} />
            <AppText kind="bold" style={styles.triggerLabel}>
              Báo cáo sự cố cho Admin
            </AppText>
          </View>
          <Icon name="chevronRight" size={16} color={stitchTokens.subtleGray} />
        </Pressable>
      ) : null}

      <Sheet
        title="Báo cáo sự cố cho Admin"
        visible={visible && !current}
        onClose={() => !busy && close()}
        dismissible={!busy}
        footer={
          <Button
            wine
            title={busy ? "Đang gửi…" : pending ? "Thử lại báo cáo đã gửi" : "Gửi báo cáo cho Admin"}
            busy={busy}
            onPress={() => void submit()}
          />
        }
      >
        <View style={styles.sheetBody}>
          <View style={styles.auctionBox}>
            <AppText kind="small" color={colors.muted}>Phiên đang báo cáo</AppText>
            <AppText kind="bold" numberOfLines={2} style={styles.auctionTitle}>{auction.title}</AppText>
          </View>

          {pending ? (
            <Notice tone="warning">
              Báo cáo trước chưa xác định được kết quả. Thử lại sẽ gửi đúng nội dung đó, không tạo hồ sơ trùng.
            </Notice>
          ) : null}

          <View style={styles.group}>
            <AppText kind="label" color={stitchTokens.brownMuted}>Bạn gặp vấn đề gì?</AppText>
            <View style={styles.chipWrap}>
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
            hint={`${chosen?.hint ?? "Ghi mốc thời gian, số tiền hoặc chi tiết giúp Admin đối chiếu."} Không gửi mật khẩu hoặc OTP.`}
            error={
              invalid && chosen && text.trim().length < AUCTION_FLAG_MIN_TEXT
                ? `Mô tả ít nhất ${AUCTION_FLAG_MIN_TEXT} ký tự để Admin đối chiếu.`
                : undefined
            }
          />

          <View style={styles.disclaimerBox}>
            <Icon name="info" size={15} color={stitchTokens.wineDark} />
            <AppText kind="small" color={stitchTokens.brownMuted} style={styles.disclaimerText}>
              Báo cáo gửi tới Admin để đối chiếu lượt giá và tiền giữ, không tự dừng phiên hay hoàn tiền.
            </AppText>
          </View>

          {error ? <Notice tone="error">{error}</Notice> : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  openCaseBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: stitchTokens.amberBg,
    borderWidth: 1,
    borderColor: stitchTokens.orangeBorderSoft,
  },
  openCaseText: { flex: 1, gap: 2 },
  openCaseTitle: { color: stitchTokens.wineDark, fontSize: 13 },
  openCaseNote: { lineHeight: 18 },
  triggerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  triggerDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.78 },
  triggerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  triggerLabel: { fontSize: 14, color: stitchTokens.wineDark },
  sheetBody: { gap: space.lg },
  auctionBox: {
    backgroundColor: stitchTokens.parchment,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 2,
  },
  auctionTitle: { color: stitchTokens.wineDark, fontSize: 15, lineHeight: 20 },
  group: { gap: space.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  disclaimerBox: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    backgroundColor: stitchTokens.roseWarmSurface,
    padding: 12,
    borderRadius: 12,
  },
  disclaimerText: { flex: 1, lineHeight: 18 },
});
