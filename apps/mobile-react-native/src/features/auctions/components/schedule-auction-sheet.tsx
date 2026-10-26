import { useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../../../core/session/session-provider";
import { AppText, Button, Chip, Notice, Sheet, colors, space } from "../../../core/ui";
import { auctionReceipt } from "../contracts";
import {
  DURATION_CHOICES,
  auctionErrorText,
  createScheduleCommand,
  durationAllowed,
  outcomeUnknown,
  startChoices,
  type ScheduleCommand,
} from "../auctions-model";

const HOUR = 3_600_000;
const when = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/** ADR 0047: publish a Passed intake, or edit an auction's time before its first bid. */
export type ScheduleTarget =
  | { kind: "publish"; intakeId: string; version: number }
  | { kind: "reschedule"; auctionId: string; version: number; live: boolean; startAt: string; endAt: string };

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
  const [now] = useState(() => Date.now());
  const live = target?.kind === "reschedule" && target.live;
  const currentHours =
    target?.kind === "reschedule"
      ? Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / HOUR)
      : 24;
  const choices = startChoices(now);
  const [start, setStart] = useState(0);
  const [hours, setHours] = useState(currentHours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A lost response keeps the frozen request so the retry replays it.
  const [pending, setPending] = useState<ScheduleCommand | null>(null);
  if (!target) return null;

  const startAt = live ? Date.parse(target.startAt) : (choices[start]?.at ?? now);
  const allowed = !live || durationAllowed(hours, startAt, Date.now());
  const durations = [...new Set([...DURATION_CHOICES, currentHours])].sort((a, b) => a - b);

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
          durationHours: hours,
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
          title={busy ? "Đang gửi…" : pending ? "Thử lại" : target.kind === "publish" ? (choices[start]?.at ? "Hẹn giờ mở phiên" : "Mở phiên ngay") : "Lưu thời gian mới"}
          busy={busy}
          disabled={!pending && !allowed}
          onPress={() => void submit()}
        />
      }
    >
      <View style={{ gap: space.lg }}>
        <AppText kind="bold" numberOfLines={2}>{title}</AppText>
        {live ? (
          <AppText kind="small" color={colors.muted}>
            {`Phiên đã mở lúc ${when(startAt)}. Khi chưa có ai trả giá, bạn có thể đổi thời lượng; giờ mở giữ nguyên.`}
          </AppText>
        ) : (
          <View style={{ gap: space.sm }}>
            <AppText kind="label" color={colors.muted}>KHI NÀO MỞ PHIÊN</AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {choices.map((choice, index) => (
                <Chip key={choice.label} wine title={choice.label} selected={start === index} disabled={busy || !!pending} onPress={() => setStart(index)} />
              ))}
            </View>
          </View>
        )}
        <View style={{ gap: space.sm }}>
          <AppText kind="label" color={colors.muted}>THỜI LƯỢNG</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {durations.map((h) => (
              <Chip
                key={h}
                wine
                title={h < 24 || h % 24 ? `${h} giờ` : `${h / 24} ngày`}
                selected={hours === h}
                disabled={busy || !!pending || (live && !durationAllowed(h, startAt, Date.now()))}
                onPress={() => setHours(h)}
              />
            ))}
          </View>
        </View>
        <AppText kind="bold" color={allowed ? colors.forest : colors.rustText}>
          {allowed
            ? `Mở ${live || choices[start]?.at ? when(startAt) : "ngay khi xác nhận"} · kết thúc ${when(startAt + hours * HOUR)}`
            : "Phiên đang mở phải còn ít nhất 1 giờ. Chọn thời lượng dài hơn."}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          Bạn đổi được thời gian tối đa 5 lần, chỉ khi chưa có lượt trả giá. Sau lượt trả giá đầu tiên, thời gian phiên được giữ nguyên.
        </AppText>
        {error && <Notice tone="error">{error}</Notice>}
      </View>
    </Sheet>
  );
}
