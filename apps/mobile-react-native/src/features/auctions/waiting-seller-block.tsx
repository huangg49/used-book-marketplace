import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  ConfirmDialog,
  Icon,
  Notice,
  colors,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { auctionReceipt, type PublicAuctionSummary } from "./contracts";
import {
  AUCTION_MAX_OPEN_CHANGES,
  AUCTION_MIN_BIDDERS_FLOOR,
  AUCTION_RESCHEDULE_FREEZE_MS,
  auctionErrorText,
  createSellerCommand,
  openRuleText,
  openTimeOf,
  outcomeUnknown,
  type SellerCommand,
} from "./auctions-model";
import { ScheduleAuctionSheet } from "./components";

const DONE: Record<SellerCommand["kind"], string> = {
  LowerMin: "Đã giảm số người đăng ký tối thiểu.",
  Close: "Đã đóng phiên; người đăng ký được hoàn cọc.",
};

/**
 * ADR 0079/0081: the seller's controls while the auction waits for
 * registrants: move the open time (2 changes, before it and never in its last
 * 30 minutes, within publish + 30 days), lower the minimum (never below 4,
 * locked once reached) and close before the start. There is no "open now":
 * the auction opens at its time once enough registered.
 */
export function WaitingSellerBlock({
  auction,
  now,
  refresh,
}: {
  auction: PublicAuctionSummary;
  now: number;
  refresh: () => Promise<unknown>;
}) {
  const { client } = useSession();
  const need = auction.minBidders ?? AUCTION_MIN_BIDDERS_FLOOR;
  const count = auction.registeredCount ?? 0;
  const reached = count >= need;
  const version = auction.version ?? 0;
  const openTime = openTimeOf(auction);
  const passed = Date.parse(openTime) <= now;
  const frozen = Date.parse(openTime) - now <= AUCTION_RESCHEDULE_FREEZE_MS;
  // The sheet edits the open time and keeps the chosen length.
  const length = Date.parse(auction.endAt) - Date.parse(auction.startAt);
  const editsLeft = Math.max(0, AUCTION_MAX_OPEN_CHANGES - (auction.scheduleRevision ?? 0));
  const defaultLower = Math.max(AUCTION_MIN_BIDDERS_FLOOR, need - 1);
  const [targetMin, setTargetMin] = useState(defaultLower);
  useEffect(() => {
    setTargetMin(Math.max(AUCTION_MIN_BIDDERS_FLOOR, need - 1));
  }, [need]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<SellerCommand | null>(null);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);

  const progressPct = Math.min(100, Math.round((count / Math.max(1, need)) * 100));

  // Build candidate options from 4 up to need - 1
  const lowerChoices: number[] = [];
  for (let n = AUCTION_MIN_BIDDERS_FLOOR; n < need; n++) {
    lowerChoices.push(n);
  }

  const send = async (command: SellerCommand) => {
    setBusy(true);
    setError(null);
    try {
      await client.request(command.path, auctionReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);
      setNotice(DONE[command.kind]);
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setClosing(false);
      void refresh();
    }
  };
  const run = (kind: SellerCommand["kind"], minBidders?: number) =>
    void send(createSellerCommand(auction.id, kind, version, Crypto.randomUUID(), minBidders));

  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.card * 2,
        backgroundColor: stitchTokens.whiteSurface,
        borderWidth: 1.5,
        borderColor: stitchTokens.goldBorder,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Card Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: stitchTokens.goldLight,
              borderWidth: 1,
              borderColor: stitchTokens.goldBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="tune" size={17} color={stitchTokens.wineDark} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText kind="bold" style={{ fontSize: 16, color: stitchTokens.wineDark }}>
              Quản lý phiên của bạn
            </AppText>
            <AppText kind="small" color={colors.muted}>
              {reached ? "Đã đủ người đăng ký mở phiên" : "Đang chờ đủ người đăng ký đặt cọc"}
            </AppText>
          </View>
        </View>

        <View
          style={{
            backgroundColor: reached ? stitchTokens.likeNewGreenBg : stitchTokens.roseWarmSurface,
            borderWidth: 1,
            borderColor: reached ? stitchTokens.greenBorderSoft : stitchTokens.peachBorder,
            borderRadius: radius.pill,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <AppText
            kind="small"
            style={{
              fontSize: 11,
              fontWeight: "800",
              color: reached ? stitchTokens.likeNewGreen : stitchTokens.wineDark,
            }}
          >
            {`${count}/${need} NGƯỜI`}
          </AppText>
        </View>
      </View>

      {/* Progress & Rule Box */}
      <View
        style={{
          backgroundColor: stitchTokens.parchment,
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: stitchTokens.cardBorder,
          gap: 8,
        }}
      >
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: need, now: count }}
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: stitchTokens.sandWarm,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 4,
              backgroundColor: reached ? stitchTokens.likeNewGreen : stitchTokens.wineDark,
            }}
          />
        </View>
        <AppText kind="small" color={colors.ink} style={{ lineHeight: 18 }}>
          {openRuleText(auction, now)}
        </AppText>
      </View>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {pending ? (
        <Button title="Thử lại đúng lệnh vừa rồi" busy={busy} onPress={() => void send(pending)} />
      ) : (
        <View style={{ gap: space.md }}>
          {/* 1. Reschedule Open Time */}
          <View
            style={{
              backgroundColor: stitchTokens.parchment,
              borderRadius: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: stitchTokens.cardBorder,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="clock" size={15} color={stitchTokens.wineDark} />
                <AppText kind="bold" style={{ fontSize: 14, color: stitchTokens.wineDark }}>
                  Giờ hẹn mở phiên
                </AppText>
              </View>
              <View
                style={{
                  backgroundColor: stitchTokens.goldLight,
                  borderRadius: 6,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: stitchTokens.goldBorder,
                }}
              >
                <AppText kind="small" style={{ fontSize: 11, fontWeight: "700", color: stitchTokens.wineDark }}>
                  {`Còn ${editsLeft}/${AUCTION_MAX_OPEN_CHANGES} lần đổi`}
                </AppText>
              </View>
            </View>

            <AppText kind="small" color={colors.muted} style={{ lineHeight: 17 }}>
              {passed
                ? `Đã qua giờ mở nên không đổi giờ được nữa. Phiên mở ngay khi đủ ${need} người đăng ký.`
                : frozen
                  ? "Không đổi giờ trong 30 phút cuối trước giờ mở."
                  : editsLeft <= 0
                    ? "Đã đổi giờ mở tối đa 2 lần."
                    : `Còn ${editsLeft} lần đổi giờ mở, trong 30 ngày kể từ lúc đăng.`}
            </AppText>

            <Button
              wine
              secondary
              title="Đổi giờ mở"
              disabled={busy || frozen || editsLeft <= 0}
              onPress={() => setEditing(true)}
            />
          </View>

          {/* 2. Lower Minimum Registrants */}
          {!reached && need > AUCTION_MIN_BIDDERS_FLOOR ? (
            <View
              style={{
                backgroundColor: stitchTokens.roseWarmSurface,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                gap: 8,
              }}
            >
              <AppText kind="bold" style={{ fontSize: 14, color: stitchTokens.wineDark }}>
                Hạ số người đăng ký tối thiểu
              </AppText>
              <AppText kind="small" color={colors.muted} style={{ lineHeight: 17 }}>
                Chọn mức thấp hơn (tối thiểu 4 người) để phiên dễ đủ điều kiện mở hơn:
              </AppText>

              {lowerChoices.length > 1 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {lowerChoices.map((n) => {
                    const selected = targetMin === n;
                    return (
                      <Pressable
                        key={n}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: busy }}
                        disabled={busy}
                        onPress={() => setTargetMin(n)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: radius.pill,
                          borderWidth: 1.5,
                          borderColor: selected ? stitchTokens.wineDark : stitchTokens.peachBorder,
                          backgroundColor: selected ? stitchTokens.wineDark : stitchTokens.whiteSurface,
                        }}
                      >
                        <AppText
                          kind="bold"
                          style={{
                            fontSize: 13,
                            color: selected ? stitchTokens.white : stitchTokens.wineDark,
                          }}
                        >
                          {`${n} người`}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {count >= targetMin && (
                <AppText kind="small" style={{ color: stitchTokens.likeNewGreen, fontWeight: "700" }}>
                  {`✓ Hiện đã có ${count} người đăng ký — hạ xuống ${targetMin} người là đủ điều kiện mở phiên!`}
                </AppText>
              )}

              <Button
                wine
                secondary
                title={`Giảm tối thiểu còn ${targetMin} người`}
                disabled={busy}
                onPress={() => run("LowerMin", targetMin)}
              />
            </View>
          ) : reached ? (
            <AppText kind="small" color={colors.muted}>
              Đã đủ người đăng ký nên số người tối thiểu được giữ nguyên.
            </AppText>
          ) : null}

          {/* 3. Close Auction Before Start */}
          <Button
            destructive
            secondary
            title="Đóng phiên trước giờ mở"
            disabled={busy}
            onPress={() => setClosing(true)}
          />
        </View>
      )}

      <ScheduleAuctionSheet
        key={`${auction.id}:${version}`}
        visible={editing}
        title={auction.title}
        target={{
          kind: "reschedule",
          auctionId: auction.id,
          version,
          live: false,
          startAt: openTime,
          endAt: new Date(Date.parse(openTime) + length).toISOString(),
          latestStartAt: auction.latestStartAt ?? null,
        }}
        onClose={() => setEditing(false)}
        onDone={() => void refresh()}
      />
      <ConfirmDialog
        visible={closing}
        title="Đóng phiên trước giờ mở?"
        message={`Phiên bị hủy ngay, ${count} người đăng ký được hoàn cọc và nhận thông báo, sách được trả lại cho bạn tại ${auction.pointName}. Sau khi phiên mở, bạn không đóng được nữa.`}
        confirmLabel="Đóng phiên"
        destructive
        busy={busy}
        onCancel={() => !busy && setClosing(false)}
        onConfirm={() => run("Close")}
      />
    </View>
  );
}
