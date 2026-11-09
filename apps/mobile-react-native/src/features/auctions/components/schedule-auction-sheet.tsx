import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../../../core/session/session-provider";
import { AppText, Button, Chip, Icon, Notice, Sheet, colors, space, stitchTokens } from "../../../core/ui";
import { auctionReceipt } from "../contracts";
import {
  AUCTION_OPEN_GRACE_MS,
  AUCTION_OPEN_CEILING_MS,
  DURATION_CHOICES,
  auctionErrorText,
  createScheduleCommand,
  durationAllowed,
  durationLabel,
  outcomeUnknown,
  startChoices,
  type ScheduleCommand,
} from "../auctions-model";

const when = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/** ADR 0047: publish a Passed intake, or edit an auction's time before its first bid. */
export type ScheduleTarget =
  | { kind: "publish"; intakeId: string; version: number }
  | { kind: "reschedule"; auctionId: string; version: number; live: boolean; startAt: string; endAt: string;
      /** ADR 0079: set for a waiting registration auction (fixed start ceiling). */
      latestStartAt?: string | null };

export function ScheduleAuctionSheet({
  visible,
  title,
  target,
  onClose,
  onDone,
}: {
  visible: boolean;
  title: string;
  target: ScheduleTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { client } = useSession();
  // Ticking clock kept in state: render stays pure and the limits stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [visible]);
  const live = target?.kind === "reschedule" && target.live;
  const currentSeconds =
    target?.kind === "reschedule"
      ? Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / 1000)
      : 24 * 3600;
  const lifecycle =
    target?.kind === "publish"
      ? { ceiling: now + AUCTION_OPEN_CEILING_MS }
      : target?.kind === "reschedule" && !target.live && target.latestStartAt
        ? { ceiling: Date.parse(target.latestStartAt) }
        : undefined;
  const choices = startChoices(now, lifecycle);
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(currentSeconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A lost response keeps the frozen request so the retry replays it.
  const [pending, setPending] = useState<ScheduleCommand | null>(null);
  if (!target) return null;

  const startAt = live ? Date.parse(target.startAt) : (choices[start]?.at ?? now);
  const allowed = !live || durationAllowed(seconds, startAt, now);
  const durations = [...new Set([...DURATION_CHOICES, currentSeconds])].sort((a, b) => a - b);

  const submit = async () => {
    const command =
      pending ??
      createScheduleCommand(
        target.kind === "publish"
          ? { kind: "publish", intakeId: target.intakeId }
          : { kind: "reschedule", auctionId: target.auctionId },
        {
          expectedVersion: target.version,
          startAt: live ? null : choices[start]?.at ? new Date(choices[start]!.at!).toISOString() : null,
          durationSeconds: seconds,
        },
        Crypto.randomUUID(),
      );
    setBusy(true);
    setError(null);
    try {
      await client.request(command.path, auctionReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);
      onDone();
      onClose();
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
      if (!outcomeUnknown(caught)) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={target.kind === "publish" ? "Đăng phiên đấu giá" : "Đổi thời gian phiên"}
      visible={visible}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      footer={
        <Button
          wine
          title={busy ? "Đang gửi…" : pending ? "Thử lại" : target.kind === "publish" ? (choices[start]?.at ? "Hẹn giờ mở phiên" : "Mở phiên ngay") : "Lưu thời gian mới"}
          busy={busy}
          disabled={!pending && !allowed}
          onPress={() => void submit()}
        />
      }
    >
      <View style={{ gap: space.lg }}>
        <View
          style={{
            backgroundColor: stitchTokens.parchment,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: stitchTokens.cardBorder,
            gap: 2,
          }}
        >
          <AppText kind="small" color={colors.muted}>
            Sách đấu giá:
          </AppText>
          <AppText kind="bold" numberOfLines={2} style={{ color: stitchTokens.wineDark }}>
            {title}
          </AppText>
        </View>
        {live ? (
          <AppText kind="small" color={colors.muted}>
            {`Phiên đã mở lúc ${when(startAt)}. Khi chưa có ai trả giá, bạn có thể đổi thời lượng; giờ mở giữ nguyên.`}
          </AppText>
        ) : (
          <View style={{ gap: space.sm }}>
            <AppText kind="label" color={colors.muted}>KHI NÀO MỞ PHIÊN (TRONG 30 NGÀY)</AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {choices.map((choice, index) => (
                <Chip key={choice.label} wine title={choice.label} selected={start === index} disabled={busy || !!pending} onPress={() => setStart(index)} />
              ))}
            </View>
          </View>
        )}
        <View style={{ gap: space.sm }}>
          <AppText kind="label" color={colors.muted}>THỜI LƯỢNG PHIÊN</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {durations.map((d) => (
              <Chip
                key={d}
                wine
                title={durationLabel(d)}
                selected={seconds === d}
                disabled={busy || !!pending || (live && !durationAllowed(d, startAt, now))}
                onPress={() => setSeconds(d)}
              />
            ))}
          </View>
        </View>

        {/* Timeline Summary Card */}
        <View
          style={{
            backgroundColor: allowed ? stitchTokens.goldLight : stitchTokens.flashRedBg,
            borderWidth: 1,
            borderColor: allowed ? stitchTokens.goldBorder : stitchTokens.flashRed,
            borderRadius: 12,
            padding: 12,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="clock" size={15} color={allowed ? stitchTokens.wineDark : colors.rustText} />
            <AppText kind="bold" color={allowed ? stitchTokens.wineDark : colors.rustText}>
              {allowed
                ? lifecycle
                  ? `Mở ${when(startAt)} nếu đủ người · chờ thêm tới ${when(startAt + AUCTION_OPEN_GRACE_MS)}`
                  : `Mở ${live || choices[start]?.at ? when(startAt) : "ngay khi xác nhận"} · kết thúc ${when(startAt + seconds * 1000)}`
                : "Phiên đang mở phải còn ít nhất 1 giờ. Chọn thời lượng dài hơn."}
            </AppText>
          </View>
          <AppText kind="small" color={colors.muted} style={{ lineHeight: 17 }}>
            {lifecycle
              ? "Phiên chỉ mở khi đủ người đăng ký: đến giờ mở mà chưa đủ, phiên chờ thêm tối đa 24 giờ và mở ngay khi đủ; hết 24 giờ vẫn chưa đủ thì phiên bị hủy và hoàn cọc. Bạn đổi giờ mở tối đa 2 lần, trong 30 ngày kể từ lúc đăng, trước giờ mở và không trong 30 phút cuối."
              : "Bạn đổi được thời gian tối đa 5 lần, chỉ khi chưa có lượt trả giá. Sau lượt trả giá đầu tiên, thời gian phiên được giữ nguyên."}
          </AppText>
        </View>

        {error && <Notice tone="error">{error}</Notice>}
      </View>
    </Sheet>
  );
}
