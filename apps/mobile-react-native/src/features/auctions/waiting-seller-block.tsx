import { useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import { AppText, Button, ConfirmDialog, Notice, colors, space } from "../../core/ui";
import { auctionReceipt, type PublicAuctionSummary } from "./contracts";
import {
  AUCTION_MAX_SCHEDULE_EDITS,
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
  LowerMin: "Đã giảm số người tối thiểu.",
  Close: "Đã đóng phiên; người đăng ký được hoàn cọc.",
};

/**
 * ADR 0079/0081: the seller's controls while the auction waits for
 * registrants: move the open time (5 changes, before it and never in its last
 * 30 minutes, within publish + 72 h), lower the minimum (never below 4,
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
  const editsLeft = AUCTION_MAX_SCHEDULE_EDITS - (auction.scheduleRevision ?? 0);
  const lowered = Math.max(AUCTION_MIN_BIDDERS_FLOOR, need - 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<SellerCommand | null>(null);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);

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
    <View style={{ gap: space.sm }}>
      <Notice>
        <AppText kind="bold">{`Đang chờ người đăng ký: ${count}/${need}`}</AppText>
        {"\n"}
        {openRuleText(auction, now)}
      </Notice>
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {pending ? (
        <Button title="Thử lại đúng lệnh vừa rồi" busy={busy} onPress={() => void send(pending)} />
      ) : (
        <>
          <Button
            wine
            secondary
            title="Đổi giờ mở"
            disabled={busy || frozen || editsLeft <= 0}
            onPress={() => setEditing(true)}
          />
          <AppText kind="small" color={colors.muted}>
            {passed
              ? `Đã qua giờ mở nên không đổi giờ được nữa. Phiên mở ngay khi đủ ${need} người đăng ký.`
              : frozen
              ? "Không đổi giờ trong 30 phút cuối trước giờ mở."
              : editsLeft <= 0
                ? "Đã đổi giờ tối đa 5 lần."
                : `Còn ${editsLeft} lần đổi giờ, trong 72 giờ kể từ lúc đăng.`}
          </AppText>
          {!reached && need > AUCTION_MIN_BIDDERS_FLOOR && (
            <Button
              wine
              secondary
              title={`Giảm tối thiểu còn ${lowered} người`}
              disabled={busy}
              onPress={() => run("LowerMin", lowered)}
            />
          )}
          {reached && (
            <AppText kind="small" color={colors.muted}>Đã đủ người nên số người tối thiểu được giữ nguyên.</AppText>
          )}
          <Button destructive secondary title="Đóng phiên" disabled={busy} onPress={() => setClosing(true)} />
        </>
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
