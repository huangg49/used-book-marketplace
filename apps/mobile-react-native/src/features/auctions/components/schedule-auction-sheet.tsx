import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { auctionSellerFeeText } from "@used-books/session-client";
import * as Crypto from "expo-crypto";
import { useSession } from "../../../core/session/session-provider";
import { AppText, AppTextInput, Button, Icon, Notice, Sheet, colors, stitchTokens } from "../../../core/ui";
import { auctionReceipt } from "../contracts";
import {
  AUCTION_MIN_LEAD_MS,
  AUCTION_OPEN_CEILING_MS,
  AUCTION_OPEN_GRACE_MS,
  AUCTION_SCHEDULE_HORIZON_MS,
  DURATION_CHOICES,
  auctionErrorText,
  ceilSlot,
  composeDurationSeconds,
  createScheduleCommand,
  durationAllowed,
  durationLabel,
  outcomeUnknown,
  scheduleDays,
  splitDuration,
  validateCustomSchedule,
  type ScheduleCommand,
} from "../auctions-model";

const pad2 = (n: number) => String(n).padStart(2, "0");

const dateKeyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const whenShort = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

const clampInt = (raw: string, min: number, max: number) => {
  const parsed = Number.parseInt(raw.replace(/\D/g, ""), 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

const TIME_SHORTCUTS: (
  | { key: string; label: string; kind: "offset"; minutes: number }
  | { key: string; label: string; kind: "clock"; hour: number; minute: number }
)[] = [
  { key: "p15", label: "+15 phút", kind: "offset", minutes: 15 },
  { key: "p60", label: "+1 giờ", kind: "offset", minutes: 60 },
  { key: "p180", label: "+3 giờ", kind: "offset", minutes: 180 },
  { key: "c09", label: "09:00", kind: "clock", hour: 9, minute: 0 },
  { key: "c12", label: "12:00", kind: "clock", hour: 12, minute: 0 },
  { key: "c18", label: "18:00", kind: "clock", hour: 18, minute: 0 },
  { key: "c20", label: "20:00", kind: "clock", hour: 20, minute: 0 },
  { key: "c21", label: "21:00", kind: "clock", hour: 21, minute: 0 },
];

/** ADR 0047: publish a Passed intake, or edit an auction's time before its first bid. */
export type ScheduleTarget =
  | { kind: "publish"; intakeId: string; version: number }
  | {
      kind: "reschedule";
      auctionId: string;
      version: number;
      live: boolean;
      startAt: string;
      endAt: string;
      /** ADR 0079: set for a waiting registration auction (fixed start ceiling). */
      latestStartAt?: string | null;
    };

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
  if (!target || !visible) return null;
  const targetKey =
    target.kind === "publish"
      ? `publish:${target.intakeId}:${target.version}`
      : `reschedule:${target.auctionId}:${target.version}`;
  return (
    <ScheduleAuctionSheetBody
      key={targetKey}
      title={title}
      target={target}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function ScheduleAuctionSheetBody({
  title,
  target,
  onClose,
  onDone,
}: {
  title: string;
  target: ScheduleTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const { client } = useSession();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const live = target.kind === "reschedule" && target.live;
  const isLifecycle =
    target.kind === "publish" ||
    (target.kind === "reschedule" && !target.live && Boolean(target.latestStartAt));
  const ceiling =
    target.kind === "publish"
      ? now + AUCTION_OPEN_CEILING_MS
      : target.kind === "reschedule" && !target.live && target.latestStartAt
        ? Date.parse(target.latestStartAt)
        : now + AUCTION_SCHEDULE_HORIZON_MS;

  const initialSeconds =
    target.kind === "reschedule"
      ? Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / 1000)
      : 24 * 3600;

  const [later, setLater] = useState(() => isLifecycle || (target.kind === "reschedule" && !target.live));
  const [selectedStartMs, setSelectedStartMs] = useState(() => {
    const initialNow = Date.now();
    const raw =
      target.kind === "reschedule" &&
      !target.live &&
      Date.parse(target.startAt) > initialNow + AUCTION_MIN_LEAD_MS
        ? Date.parse(target.startAt)
        : ceilSlot(initialNow + 3_600_000);
    const d = new Date(raw);
    d.setSeconds(0, 0);
    return d.getTime();
  });
  const [hourInput, setHourInput] = useState(() => pad2(new Date(selectedStartMs).getHours()));
  const [minuteInput, setMinuteInput] = useState(() => pad2(new Date(selectedStartMs).getMinutes()));

  const [seconds, setSeconds] = useState(initialSeconds);
  const [durDaysInput, setDurDaysInput] = useState(() => String(splitDuration(initialSeconds).days));
  const [durHoursInput, setDurHoursInput] = useState(() => String(splitDuration(initialSeconds).hours));
  const [durMinsInput, setDurMinsInput] = useState(() => String(splitDuration(initialSeconds).minutes));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ScheduleCommand | null>(null);

  const syncStart = (ms: number) => {
    const d = new Date(ms);
    d.setSeconds(0, 0);
    setSelectedStartMs(d.getTime());
    setHourInput(pad2(d.getHours()));
    setMinuteInput(pad2(d.getMinutes()));
  };

  const syncDuration = (nextSeconds: number) => {
    setSeconds(nextSeconds);
    const parts = splitDuration(nextSeconds);
    setDurDaysInput(String(parts.days));
    setDurHoursInput(String(parts.hours));
    setDurMinsInput(String(parts.minutes));
  };

  const days = useMemo(() => scheduleDays(now, ceiling), [now, ceiling]);

  const timed = isLifecycle || later;
  const locked = busy || Boolean(pending);
  const effectiveStartMs = live ? Date.parse(target.startAt) : timed ? selectedStartMs : now;
  const selectedDayKey = dateKeyOf(selectedStartMs);

  const validationError = validateCustomSchedule({
    live,
    timed,
    startAtMs: effectiveStartMs,
    durationSeconds: seconds,
    now,
    ceiling,
    isLifecycle,
  });

  const applyDate = (year: number, month: number, day: number) => {
    const d = new Date(selectedStartMs);
    d.setFullYear(year, month, day);
    d.setSeconds(0, 0);
    const earliest = ceilSlot(now + AUCTION_MIN_LEAD_MS);
    if (d.getTime() < earliest && dateKeyOf(earliest) === `${year}-${pad2(month + 1)}-${pad2(day)}`) {
      syncStart(earliest);
      return;
    }
    if (d.getTime() > ceiling) {
      const capped = new Date(ceiling);
      capped.setSeconds(0, 0);
      syncStart(capped.getTime());
      return;
    }
    syncStart(d.getTime());
  };

  const applyClock = (hour: number, minute: number) => {
    const d = new Date(selectedStartMs);
    d.setHours(hour, minute, 0, 0);
    syncStart(d.getTime());
  };

  const stepHour = (delta: number) => {
    const d = new Date(selectedStartMs);
    const next = (d.getHours() + delta + 24) % 24;
    applyClock(next, d.getMinutes());
  };

  const stepMinute = (delta: number) => {
    const d = new Date(selectedStartMs);
    const next = (d.getMinutes() + delta + 60) % 60;
    applyClock(d.getHours(), next);
  };

  const applyShortcut = (shortcut: (typeof TIME_SHORTCUTS)[number]) => {
    if (shortcut.kind === "offset") {
      const targetMs = Math.min(ceiling, ceilSlot(now + shortcut.minutes * 60_000));
      syncStart(targetMs);
      return;
    }
    const d = new Date(selectedStartMs);
    d.setHours(shortcut.hour, shortcut.minute, 0, 0);
    if (d.getTime() < now + AUCTION_MIN_LEAD_MS) {
      d.setDate(d.getDate() + 1);
    }
    syncStart(Math.min(ceiling, d.getTime()));
  };

  const applyDurationParts = (d: number, h: number, m: number) => {
    const nextDays = Math.min(7, Math.max(0, d));
    const nextHours = nextDays === 7 ? 0 : Math.min(23, Math.max(0, h));
    const nextMins = nextDays === 7 ? 0 : Math.min(59, Math.max(0, m));
    syncDuration(composeDurationSeconds(nextDays, nextHours, nextMins));
  };

  const currentParts = splitDuration(seconds);

  const submit = async () => {
    const command =
      pending ??
      createScheduleCommand(
        target.kind === "publish"
          ? { kind: "publish", intakeId: target.intakeId }
          : { kind: "reschedule", auctionId: target.auctionId },
        {
          expectedVersion: target.version,
          startAt: !live && timed ? new Date(effectiveStartMs).toISOString() : null,
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

  const durations = [...new Set([...DURATION_CHOICES, initialSeconds])].sort((a, b) => a - b);

  return (
    <Sheet
      title={target.kind === "publish" ? "Đăng phiên đấu giá" : "Đổi thời gian phiên"}
      visible
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      footer={
        <Button
          wine
          title={
            busy
              ? "Đang gửi…"
              : pending
                ? "Thử lại"
                : target.kind === "publish"
                  ? timed
                    ? "Hẹn giờ mở phiên"
                    : "Mở phiên ngay"
                  : "Lưu thời gian mới"
          }
          busy={busy}
          disabled={!pending && Boolean(validationError)}
          onPress={() => void submit()}
        />
      }
    >
      <View style={styles.body}>
        {/* Book Summary */}
        <View style={styles.bookSummary}>
          <View style={styles.bookIconBadge}>
            <Icon name="gavel" size={16} color={stitchTokens.wine} />
          </View>
          <View style={styles.bookSummaryBody}>
            <AppText kind="label" color={stitchTokens.warmUmber} style={styles.overline}>
              SÁCH ĐẤU GIÁ
            </AppText>
            <AppText kind="bold" numberOfLines={2} style={styles.bookTitle}>
              {title}
            </AppText>
          </View>
        </View>

        {/* Section 1: Start Date & Time */}
        {live ? (
          <View style={styles.liveNoteCard}>
            <Icon name="info" size={16} color={stitchTokens.wine} />
            <AppText kind="small" color={stitchTokens.slateWarm} style={styles.liveNoteText}>
              Phiên đã mở lúc {whenShort(effectiveStartMs)}. Khi chưa có ai trả giá, bạn chỉ đổi được thời lượng.
            </AppText>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText kind="label" color={stitchTokens.wineDark} style={styles.sectionTitle}>
                GIỜ MỞ PHIÊN
              </AppText>
              {timed ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chọn giờ mở sớm nhất"
                  disabled={locked}
                  onPress={() => syncStart(ceilSlot(now + AUCTION_MIN_LEAD_MS))}
                  style={({ pressed }) => [styles.earliestBtn, pressed && styles.pressed, locked && styles.disabled]}
                >
                  <AppText kind="small" color={stitchTokens.wine} style={styles.earliestBtnText}>
                    Sớm nhất (+5p)
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {!isLifecycle ? (
              <View style={styles.modeSwitch}>
                <Pressable
                  accessibilityRole="button"
                  disabled={locked}
                  onPress={() => setLater(false)}
                  style={[styles.modeTab, !later && styles.modeTabActive]}
                >
                  <AppText
                    kind="bold"
                    color={!later ? stitchTokens.white : stitchTokens.wineDark}
                    style={styles.modeTabText}
                  >
                    Mở ngay
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={locked}
                  onPress={() => setLater(true)}
                  style={[styles.modeTab, later && styles.modeTabActive]}
                >
                  <AppText
                    kind="bold"
                    color={later ? stitchTokens.white : stitchTokens.wineDark}
                    style={styles.modeTabText}
                  >
                    Hẹn giờ mở
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            {timed ? (
              <View style={styles.pickerCard}>
                {/* Selected Date/Time Readout */}
                <View style={styles.readoutRow}>
                  <Icon name="clock" size={15} color={stitchTokens.wine} />
                  <AppText kind="bold" color={stitchTokens.wineDark} style={styles.readoutText}>
                    {whenShort(selectedStartMs)}
                  </AppText>
                  <View style={styles.rangeTag}>
                    <AppText kind="small" color={stitchTokens.warmUmber} style={styles.rangeTagText}>
                      {isLifecycle ? "Trong 30 ngày" : "Trong 7 ngày"}
                    </AppText>
                  </View>
                </View>

                {/* Scrollable Day Calendar Strip */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                >
                  {days.map((d) => {
                    const active = d.key === selectedDayKey;
                    return (
                      <Pressable
                        key={d.key}
                        accessibilityRole="button"
                        accessibilityLabel={`Ngày ${d.day} tháng ${d.month + 1}`}
                        accessibilityState={{ selected: active, disabled: locked }}
                        disabled={locked}
                        onPress={() => applyDate(d.year, d.month, d.day)}
                        style={({ pressed }) => [
                          styles.dayTile,
                          active && styles.dayTileActive,
                          pressed && !locked && styles.pressed,
                          locked && styles.disabled,
                        ]}
                      >
                        <AppText
                          kind="small"
                          color={active ? stitchTokens.gold : stitchTokens.warmUmber}
                          numberOfLines={1}
                          style={styles.dayWeekday}
                        >
                          {d.weekdayLabel}
                        </AppText>
                        <AppText
                          kind="bold"
                          color={active ? stitchTokens.white : stitchTokens.wineDark}
                          style={styles.dayNumber}
                        >
                          {d.dayNumber}
                        </AppText>
                        <AppText
                          kind="small"
                          color={active ? stitchTokens.goldLight : stitchTokens.subtleGray}
                          style={styles.dayMonth}
                        >
                          {d.monthLabel}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Custom Hour & Minute Steppers / Direct Inputs */}
                <View style={styles.clockRow}>
                  <StepperField
                    label="Giờ"
                    value={hourInput}
                    disabled={locked}
                    onDecrement={() => stepHour(-1)}
                    onIncrement={() => stepHour(1)}
                    onChangeText={(txt) => {
                      const clean = txt.replace(/\D/g, "").slice(0, 2);
                      setHourInput(clean);
                      if (clean.length === 2) {
                        const h = clampInt(clean, 0, 23);
                        applyClock(h, new Date(selectedStartMs).getMinutes());
                      }
                    }}
                    onBlur={() => {
                      const h = clampInt(hourInput, 0, 23);
                      applyClock(h, new Date(selectedStartMs).getMinutes());
                    }}
                  />
                  <AppText kind="bold" color={stitchTokens.wineDark} style={styles.colon}>
                    :
                  </AppText>
                  <StepperField
                    label="Phút"
                    value={minuteInput}
                    disabled={locked}
                    onDecrement={() => stepMinute(-5)}
                    onIncrement={() => stepMinute(5)}
                    onChangeText={(txt) => {
                      const clean = txt.replace(/\D/g, "").slice(0, 2);
                      setMinuteInput(clean);
                      if (clean.length === 2) {
                        const m = clampInt(clean, 0, 59);
                        applyClock(new Date(selectedStartMs).getHours(), m);
                      }
                    }}
                    onBlur={() => {
                      const m = clampInt(minuteInput, 0, 59);
                      applyClock(new Date(selectedStartMs).getHours(), m);
                    }}
                  />
                </View>

                {/* Quick Time Shortcuts */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.shortcutRow}
                >
                  {TIME_SHORTCUTS.map((sc) => (
                    <Pressable
                      key={sc.key}
                      accessibilityRole="button"
                      disabled={locked}
                      onPress={() => applyShortcut(sc)}
                      style={({ pressed }) => [
                        styles.shortcutPill,
                        pressed && !locked && styles.pressed,
                        locked && styles.disabled,
                      ]}
                    >
                      <AppText kind="small" color={stitchTokens.wineDark} style={styles.shortcutText}>
                        {sc.label}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}

        {/* Section 2: Duration Picker (Presets + Custom Days/Hours/Minutes) */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText kind="label" color={stitchTokens.wineDark} style={styles.sectionTitle}>
              THỜI LƯỢNG PHIÊN
            </AppText>
            <View style={styles.durationBadge}>
              <AppText kind="bold" color={stitchTokens.wine} style={styles.durationBadgeText}>
                {durationLabel(seconds)}
              </AppText>
            </View>
          </View>

          <View style={styles.pickerCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shortcutRow}
            >
              {durations.map((d) => {
                const active = seconds === d;
                const unfit = live && !durationAllowed(d, effectiveStartMs, now);
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: locked || unfit }}
                    disabled={locked || unfit}
                    onPress={() => syncDuration(d)}
                    style={({ pressed }) => [
                      styles.presetPill,
                      active && styles.presetPillActive,
                      pressed && !locked && !unfit && styles.pressed,
                      (locked || unfit) && styles.disabled,
                    ]}
                  >
                    <AppText
                      kind="bold"
                      color={active ? stitchTokens.white : stitchTokens.wineDark}
                      style={styles.presetText}
                    >
                      {durationLabel(d)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.durationStepperRow}>
              <StepperField
                compact
                label="Ngày"
                value={durDaysInput}
                disabled={locked}
                onDecrement={() =>
                  applyDurationParts(currentParts.days - 1, currentParts.hours, currentParts.minutes)
                }
                onIncrement={() =>
                  applyDurationParts(currentParts.days + 1, currentParts.hours, currentParts.minutes)
                }
                onChangeText={(txt) => {
                  const clean = txt.replace(/\D/g, "").slice(0, 1);
                  setDurDaysInput(clean);
                  if (clean !== "") {
                    applyDurationParts(clampInt(clean, 0, 7), currentParts.hours, currentParts.minutes);
                  }
                }}
                onBlur={() =>
                  applyDurationParts(clampInt(durDaysInput, 0, 7), currentParts.hours, currentParts.minutes)
                }
              />
              <StepperField
                compact
                label="Giờ"
                value={durHoursInput}
                disabled={locked || currentParts.days >= 7}
                onDecrement={() =>
                  applyDurationParts(currentParts.days, currentParts.hours - 1, currentParts.minutes)
                }
                onIncrement={() =>
                  applyDurationParts(currentParts.days, currentParts.hours + 1, currentParts.minutes)
                }
                onChangeText={(txt) => {
                  const clean = txt.replace(/\D/g, "").slice(0, 2);
                  setDurHoursInput(clean);
                  if (clean !== "") {
                    applyDurationParts(currentParts.days, clampInt(clean, 0, 23), currentParts.minutes);
                  }
                }}
                onBlur={() =>
                  applyDurationParts(currentParts.days, clampInt(durHoursInput, 0, 23), currentParts.minutes)
                }
              />
              <StepperField
                compact
                label="Phút"
                value={durMinsInput}
                disabled={locked || currentParts.days >= 7}
                onDecrement={() =>
                  applyDurationParts(
                    currentParts.days,
                    currentParts.hours,
                    Math.max(0, currentParts.minutes - 15),
                  )
                }
                onIncrement={() =>
                  applyDurationParts(
                    currentParts.days,
                    currentParts.hours,
                    Math.min(59, currentParts.minutes + 15),
                  )
                }
                onChangeText={(txt) => {
                  const clean = txt.replace(/\D/g, "").slice(0, 2);
                  setDurMinsInput(clean);
                  if (clean !== "") {
                    applyDurationParts(currentParts.days, currentParts.hours, clampInt(clean, 0, 59));
                  }
                }}
                onBlur={() =>
                  applyDurationParts(currentParts.days, currentParts.hours, clampInt(durMinsInput, 0, 59))
                }
              />
            </View>
            <AppText kind="small" color={stitchTokens.subtleGray} style={styles.rangeHint}>
              Tùy chỉnh từ 1 giờ đến tối đa 7 ngày (168 giờ).
            </AppText>
          </View>
        </View>

        {/* Section 3: Summary / Validation Card */}
        {validationError ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Icon name="info" size={16} color={colors.error} />
            <AppText kind="bold" color={colors.error} style={styles.errorCardText}>
              {validationError}
            </AppText>
          </View>
        ) : (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <AppText kind="small" color={stitchTokens.warmUmber} style={styles.summaryLabel}>
                Mở phiên
              </AppText>
              <AppText kind="bold" color={stitchTokens.wineDark} style={styles.summaryValue}>
                {live || timed
                  ? `${whenShort(effectiveStartMs)}${isLifecycle ? " (khi đủ người)" : ""}`
                  : "Ngay khi xác nhận"}
              </AppText>
            </View>
            {isLifecycle ? (
              <View style={styles.summaryRow}>
                <AppText kind="small" color={stitchTokens.warmUmber} style={styles.summaryLabel}>
                  Hạn chờ mở
                </AppText>
                <AppText kind="bold" color={stitchTokens.wineDark} style={styles.summaryValue}>
                  Tối đa tới {whenShort(effectiveStartMs + AUCTION_OPEN_GRACE_MS)}
                </AppText>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <AppText kind="small" color={stitchTokens.warmUmber} style={styles.summaryLabel}>
                {isLifecycle ? "Thời lượng" : "Kết thúc"}
              </AppText>
              <AppText kind="bold" color={stitchTokens.wineDark} style={styles.summaryValue}>
                {isLifecycle
                  ? `${durationLabel(seconds)} sau khi mở`
                  : whenShort(effectiveStartMs + seconds * 1000)}
              </AppText>
            </View>
            <View style={styles.summaryDivider} />
            <AppText kind="small" color={stitchTokens.slateWarm} style={styles.policyNote}>
              {isLifecycle
                ? "Đổi giờ mở tối đa 2 lần (trước 30 phút cuối). Hết 24 giờ chờ mà chưa đủ người, phiên tự hủy và hoàn cọc."
                : "Đổi thời gian tối đa 5 lần khi chưa có lượt trả giá nào."}
            </AppText>
          </View>
        )}

        {target.kind === "publish" ? (
          <AppText kind="small" color={stitchTokens.subtleGray} style={styles.feeText}>
            {auctionSellerFeeText}
          </AppText>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </View>
    </Sheet>
  );
}

function StepperField({
  label,
  value,
  disabled,
  compact = false,
  onDecrement,
  onIncrement,
  onChangeText,
  onBlur,
}: {
  label: string;
  value: string;
  disabled: boolean;
  compact?: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onChangeText: (text: string) => void;
  onBlur: () => void;
}) {
  return (
    <View style={[styles.stepperWrap, compact && styles.stepperWrapCompact]}>
      <AppText kind="small" color={stitchTokens.warmUmber} style={styles.stepperLabel}>
        {label}
      </AppText>
      <View style={[styles.stepperBox, disabled && styles.disabled]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Giảm ${label}`}
          disabled={disabled}
          onPress={onDecrement}
          hitSlop={4}
          style={({ pressed }) => [styles.stepBtn, pressed && !disabled && styles.pressed]}
        >
          <AppText kind="bold" color={stitchTokens.wine} style={styles.stepBtnText}>
            −
          </AppText>
        </Pressable>
        <AppTextInput
          value={value}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          accessibilityLabel={label}
          onChangeText={onChangeText}
          onBlur={onBlur}
          style={[styles.stepInput, compact && styles.stepInputCompact]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tăng ${label}`}
          disabled={disabled}
          onPress={onIncrement}
          hitSlop={4}
          style={({ pressed }) => [styles.stepBtn, pressed && !disabled && styles.pressed]}
        >
          <AppText kind="bold" color={stitchTokens.wine} style={styles.stepBtnText}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
    paddingBottom: 14,
  },
  bookSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: stitchTokens.warmIvory,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  bookIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bookSummaryBody: {
    flex: 1,
    gap: 1,
  },
  overline: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  bookTitle: {
    color: stitchTokens.wineDark,
    fontSize: 14.5,
    lineHeight: 19,
  },
  liveNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
  },
  liveNoteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  section: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11.5,
    letterSpacing: 0.6,
  },
  earliestBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  earliestBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    includeFontPadding: false,
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  modeTab: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTabActive: {
    backgroundColor: stitchTokens.wine,
  },
  modeTabText: {
    fontSize: 13,
    includeFontPadding: false,
  },
  pickerCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 12,
    gap: 11,
  },
  readoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  readoutText: {
    flex: 1,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  rangeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
  },
  rangeTagText: {
    fontSize: 10.5,
    fontWeight: "600",
    includeFontPadding: false,
  },
  dayStrip: {
    gap: 8,
    paddingVertical: 2,
  },
  dayTile: {
    width: 60,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.warmIvory,
    alignItems: "center",
    gap: 2,
  },
  dayTileActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  dayWeekday: {
    fontSize: 10,
    fontWeight: "600",
    includeFontPadding: false,
  },
  dayNumber: {
    fontSize: 17,
    lineHeight: 21,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  dayMonth: {
    fontSize: 10,
    includeFontPadding: false,
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  colon: {
    fontSize: 20,
    lineHeight: 40,
    paddingBottom: 2,
  },
  stepperWrap: {
    flex: 1,
    gap: 4,
  },
  stepperWrapCompact: {
    minWidth: 0,
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  stepperBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.warmIvory,
    overflow: "hidden",
  },
  stepBtn: {
    width: 34,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: 18,
    lineHeight: 20,
    includeFontPadding: false,
  },
  stepInput: {
    flex: 1,
    minWidth: 28,
    height: "100%",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
    padding: 0,
  },
  stepInputCompact: {
    fontSize: 15,
  },
  shortcutRow: {
    gap: 6,
    paddingVertical: 1,
  },
  shortcutPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  durationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  durationBadgeText: {
    fontSize: 12,
    includeFontPadding: false,
  },
  presetPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  presetPillActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  presetText: {
    fontSize: 12.5,
    includeFontPadding: false,
  },
  durationStepperRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeHint: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 12,
    padding: 12,
  },
  errorCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 14,
    padding: 12,
    gap: 7,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12.5,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  summaryDivider: {
    height: 1,
    backgroundColor: stitchTokens.peachBorder,
    marginVertical: 2,
  },
  policyNote: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  feeText: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
});
