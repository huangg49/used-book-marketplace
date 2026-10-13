import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  BackAction,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
} from "../../core/ui";
import { draftPage } from "../drafts/contracts";
import { BookIdentity } from "../drafts/catalog-picker";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  AUCTION_MAX_PRICE,
  auctionErrorText,
  auctionEligible,
  intakePriceErrors,
  outcomeUnknown,
  withdrawable,
} from "./auctions-model";
import { handoverPoints, intakeReceipt, myIntake, myIntakes, type MyIntake } from "./contracts";

// FR-AU01 / POL-38–41: the seller sends one approved Sale book to a managed
// point; Staff receive and inspect it before a 24-hour session opens. Prices
// are fixed here and cannot change once the session opens.

const time = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const digits = (text: string) => Number(text.replace(/\D/g, "")) || null;
const INTAKE_LABEL: Record<MyIntake["state"], string> = {
  AwaitingDropoff: "Chờ bạn mang sách tới",
  Received: "Điểm đã nhận, chờ kiểm tra",
  NeedsEvidence: "Điểm cần bạn bổ sung bằng chứng",
  Passed: "Đạt kiểm tra, chờ mở phiên",
  Auctioning: "Đang đấu giá",
  ReclaimRequired: "Mời bạn tới điểm nhận lại sách",
  Reclaimed: "Đã nhận lại sách",
  Cancelled: "Đã rút",
  Sold: "Đã bán",
};

type Pending = { kind: "create" | "withdraw" | "evidence"; path: string; body: string; key: string };
// N4-12 (FR-T02, POL-09): one written answer before the 48-hour deadline.
export const EVIDENCE_MIN_LENGTH = 20;

export function SendToAuctionScreen({ userId }: { userId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const listings = useQuery({
    queryKey: ["my-listings", userId, "auction-eligible"],
    queryFn: () => client.request("/me/listings?moderation=Approved&limit=50", draftPage),
    enabled: foreground,
    staleTime: 0,
  });
  const points = useQuery({
    queryKey: ["handover-points"],
    queryFn: () => client.request("/handover-points", handoverPoints),
    enabled: foreground,
    staleTime: 0,
  });
  const intakes = useQuery({
    queryKey: ["my-auction-intakes", userId],
    queryFn: () => client.request("/me/auction-intakes", myIntakes),
    enabled: foreground,
  });
  const eligible = (listings.data?.items ?? []).filter(auctionEligible);
  const [listingId, setListingId] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [step, setStep] = useState<10000 | 50000>(10000);
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [buyNow, setBuyNow] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<MyIntake | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyIntake | null>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [evidenceTarget, setEvidenceTarget] = useState<MyIntake | null>(null);
  const [evidenceError, setEvidenceError] = useState<{ id: string; text: string } | null>(null);

  const listing = eligible.find((l) => l.id === listingId);
  const openPoints = (points.data?.items ?? []).filter((p) => p.status === "Active");
  const point = openPoints.find((p) => p.id === pointId);
  const startPrice = digits(start);
  const buyNowPrice = buyNowOn ? digits(buyNow) : null;
  const priceErrors = intakePriceErrors(startPrice, step, buyNowOn ? buyNowPrice ?? 0 : null);
  const formError = !listing
    ? "Chọn một cuốn sách."
    : !point || point.availableSlots < 1
      ? "Chọn điểm còn chỗ."
      : priceErrors.startPrice ?? priceErrors.buyNowPrice ?? null;
  const locked = busy || !!pending;

  const send = async (command: Pending) => {
    setBusy(true);
    setError(null);
    try {
      const receipt = await client.request(command.path, intakeReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);
      if (command.kind === "create") {
        // The receipt has no deadline; read the intake the seller now owns.
        setCreated(await client.request(`/me/auction-intakes/${receipt.intakeId}`, myIntake));
        setListingId(null);
        setStart("");
        setBuyNow("");
        setBuyNowOn(false);
        setTouched(false);
      }
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setConfirming(false);
      setWithdrawTarget(null);
      setEvidenceTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["my-auction-intakes", userId] });
      void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
      void queryClient.invalidateQueries({ queryKey: ["handover-points"] });
    }
  };

  return (
    <Screen footer={<MemberNavigation current="/auctions" />} footerAppearance="navigation">
      <BackAction title="Về phiên đang mở" onPress={() => router.replace("/auctions")} />
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          ĐẤU GIÁ
        </AppText>
        <AppText kind="heading" color={colors.forest} accessibilityRole="header">
          Gửi sách đấu giá
        </AppText>
        <AppText color={colors.muted}>
          Bạn mang sách tới điểm trong 72 giờ. Nhân viên nhận và kiểm tra tình trạng theo bài đã duyệt; đạt thì phiên mở
          24 giờ. Không đạt hoặc không bán được, bạn nhận lại sách tại điểm.
        </AppText>
      </View>
      {created && (
        <Notice tone="success">
          Đã ghi nhận “{created.title}”. Hãy mang sách tới điểm trước {time(created.dropoffDeadline)}. Giá khởi điểm{" "}
          {formatVnd(created.startPrice)}, bước {formatVnd(created.step)}
          {created.buyNowPrice !== null ? `, mua ngay ${formatVnd(created.buyNowPrice)}` : ""}.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {pending && (
        <View style={{ gap: space.sm }}>
          <Button title="Thử lại thao tác vừa rồi" busy={busy} onPress={() => void send(pending)} />
          <Button
            secondary
            title="Cập nhật danh sách"
            disabled={busy}
            onPress={() => {
              void listings.refetch();
              void intakes.refetch();
            }}
          />
        </View>
      )}

      <Section title="1. Chọn sách">
        {listings.isPending && <StatePanel loading title="Đang tải sách của bạn" />}
        {listings.error && <Notice tone="error">{presentError(listings.error).message}</Notice>}
        {listings.isSuccess && eligible.length === 0 && (
          <AppText kind="small" color={colors.muted}>
            Chưa có sách đủ điều kiện. Chỉ bài đăng Bán đã duyệt, đang hiển thị và còn sẵn sàng mới gửi đấu giá được.
          </AppText>
        )}
        {eligible.map((item) => (
          <Option
            key={item.id}
            selected={listingId === item.id}
            disabled={locked}
            onPress={() => setListingId(item.id)}
          >
            <BookIdentity id={item.currentRevision.content.bookId} compact />
            {item.currentRevision.content.salePrice != null && (
              <AppText kind="small" color={colors.muted}>
                Giá bán đã duyệt {formatVnd(item.currentRevision.content.salePrice)} (giá trị bảo vệ khi gửi)
              </AppText>
            )}
          </Option>
        ))}
      </Section>

      <Section title="2. Chọn điểm gửi sách">
        {points.isPending && <StatePanel loading title="Đang tải điểm giao nhận" />}
        {points.error && <Notice tone="error">{presentError(points.error).message}</Notice>}
        {(points.data?.items ?? []).map((p) => {
          const full = p.status !== "Active" || p.availableSlots < 1;
          return (
            <Option key={p.id} selected={pointId === p.id} disabled={locked || full} onPress={() => setPointId(p.id)} label={p.name}>
              <AppText kind="bold">{p.name}</AppText>
              <AppText kind="small" color={colors.muted}>
                {p.displayAddress} ·{" "}
                {p.status === "Paused" ? "Tạm ngưng nhận" : p.status === "Closed" ? "Đã đóng" : full ? "Hết chỗ" : `Còn ${p.availableSlots} chỗ`}
              </AppText>
            </Option>
          );
        })}
        <AppText kind="small" color={colors.muted}>
          Điểm mô phỏng tại TP.HCM, mở cửa 09:00–18:00.
        </AppText>
      </Section>

      <Section title="3. Giá phiên">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {([10000, 50000] as const).map((value) => (
            <Chip key={value} wine title={`Bước ${formatVnd(value)}`} selected={step === value} disabled={locked} onPress={() => setStep(value)} />
          ))}
        </View>
        <TextField
          label="Giá khởi điểm"
          keyboardType="number-pad"
          value={start}
          editable={!locked}
          onChangeText={(text) => setStart(text.replace(/\D/g, ""))}
          hint={`Từ ${formatVnd(10000)} đến ${formatVnd(AUCTION_MAX_PRICE)}.`}
          error={touched ? priceErrors.startPrice : undefined}
        />
        <Checkbox checked={buyNowOn} title="Cho phép mua ngay trước lượt trả giá đầu tiên" disabled={locked} onPress={() => setBuyNowOn(!buyNowOn)} />
        {buyNowOn && (
          <TextField
            label="Giá mua ngay"
            keyboardType="number-pad"
            value={buyNow}
            editable={!locked}
            onChangeText={(text) => setBuyNow(text.replace(/\D/g, ""))}
            hint="Bằng giá khởi điểm cộng một số bước giá."
            error={touched ? priceErrors.buyNowPrice : undefined}
          />
        )}
      </Section>

      {touched && formError && <Notice tone="error">{formError}</Notice>}
      <Button
        wine
        title="Xem lại và gửi"
        disabled={locked}
        onPress={() => {
          setTouched(true);
          setCreated(null);
          if (!formError) setConfirming(true);
        }}
      />

      <Section title="Sách đã gửi đấu giá">
        {intakes.isPending && <StatePanel loading title="Đang tải" />}
        {(intakes.data?.items ?? [])
          .filter((i) => i.state !== "Cancelled" && i.state !== "Reclaimed")
          .map((i) => (
            <View key={i.id} style={{ gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.rule }}>
              <AppText kind="label" color={colors.rustText}>
                {INTAKE_LABEL[i.state].toUpperCase()}
              </AppText>
              <AppText kind="bold">{i.title}</AppText>
              <AppText kind="small" color={colors.muted}>
                {i.state === "AwaitingDropoff" ? `Mang tới điểm trước ${time(i.dropoffDeadline)}. ` : ""}
                {i.inspectionOutcome === "Fail" && i.inspectionNote ? `Ghi chú kiểm tra: ${i.inspectionNote}` : ""}
                {i.state === "NeedsEvidence" && i.inspectionNote ? `Điểm cần: ${i.inspectionNote} ` : ""}
                {i.state === "NeedsEvidence" && !i.evidenceSubmittedAt && i.evidenceDeadline
                  ? `Hạn bổ sung ${time(i.evidenceDeadline)}; quá hạn, sách không được đấu giá và bạn sẽ được mời nhận lại.`
                  : ""}
                {i.state === "NeedsEvidence" && i.evidenceSubmittedAt
                  ? `Bạn đã gửi bằng chứng lúc ${time(i.evidenceSubmittedAt)}. Một nhân viên khác tại điểm sẽ quyết định.`
                  : ""}
              </AppText>
              {i.state === "NeedsEvidence" && !i.evidenceSubmittedAt && (
                <>
                  <TextField
                    label="Bằng chứng của bạn"
                    hint={`Nguồn gốc, dấu riêng hoặc giấy tờ bạn có (${EVIDENCE_MIN_LENGTH}–2.000 ký tự). Chỉ gửi được một lần.`}
                    error={evidenceError?.id === i.id ? evidenceError.text : undefined}
                    multiline
                    maxLength={2000}
                    editable={!locked}
                    value={evidence[i.id] ?? ""}
                    onChangeText={(text) => {
                      setEvidence((all) => ({ ...all, [i.id]: text }));
                      setEvidenceError(null);
                    }}
                  />
                  <Button
                    secondary
                    title="Gửi bằng chứng"
                    disabled={locked}
                    onPress={() => {
                      if ([...(evidence[i.id] ?? "").trim()].length < EVIDENCE_MIN_LENGTH)
                        setEvidenceError({ id: i.id, text: `Mô tả bằng chứng ít nhất ${EVIDENCE_MIN_LENGTH} ký tự.` });
                      else setEvidenceTarget(i);
                    }}
                  />
                </>
              )}
              {withdrawable(i.state) && (
                <Button secondary destructive title="Rút sách khỏi đấu giá" disabled={locked} onPress={() => setWithdrawTarget(i)} />
              )}
            </View>
          ))}
        {intakes.isSuccess && intakes.data.items.length === 0 && (
          <AppText kind="small" color={colors.muted}>
            Chưa có sách nào gửi đấu giá.
          </AppText>
        )}
      </Section>

      <ConfirmDialog
        visible={confirming}
        title="Gửi sách đấu giá?"
        message={
          listing && point && startPrice
            ? `Bạn có 72 giờ để mang sách tới ${point.name}. Giá khởi điểm ${formatVnd(startPrice)}, bước ${formatVnd(step)}${buyNowPrice ? `, mua ngay ${formatVnd(buyNowPrice)}` : ""}. Bài đăng tạm ngừng bán thường trong thời gian này. Giá không đổi được sau khi phiên mở.`
            : ""
        }
        confirmLabel="Gửi sách"
        busy={busy}
        onCancel={() => !busy && setConfirming(false)}
        onConfirm={() =>
          listing &&
          point &&
          startPrice &&
          void send({
            kind: "create",
            path: "/auction-intakes",
            key: Crypto.randomUUID(),
            body: JSON.stringify({
              listingId: listing.id,
              expectedListingVersion: listing.version,
              pointId: point.id,
              startPrice,
              step,
              buyNowPrice,
            }),
          })
        }
      />
      <ConfirmDialog
        visible={!!evidenceTarget}
        title="Gửi bằng chứng?"
        message="Bạn chỉ gửi được một lần. Nhân viên khác tại điểm sẽ xem và quyết định sách có được đấu giá hay không."
        confirmLabel="Gửi"
        busy={busy}
        onCancel={() => !busy && setEvidenceTarget(null)}
        onConfirm={() =>
          evidenceTarget &&
          void send({
            kind: "evidence",
            path: `/me/auction-intakes/${evidenceTarget.id}/evidence`,
            key: Crypto.randomUUID(),
            body: JSON.stringify({
              expectedVersion: evidenceTarget.version,
              note: (evidence[evidenceTarget.id] ?? "").trim(),
            }),
          })
        }
      />
      <ConfirmDialog
        visible={!!withdrawTarget}
        title="Rút sách khỏi đấu giá?"
        message={
          withdrawTarget?.state === "AwaitingDropoff"
            ? "Chỗ ở điểm được trả lại và bài đăng trở về bán thường."
            : "Sách đang ở điểm; bạn cần tới điểm nhận lại sách."
        }
        confirmLabel="Rút sách"
        destructive
        busy={busy}
        onCancel={() => !busy && setWithdrawTarget(null)}
        onConfirm={() =>
          withdrawTarget &&
          void send({
            kind: "withdraw",
            path: `/auction-intakes/${withdrawTarget.id}/cancel`,
            key: Crypto.randomUUID(),
            body: JSON.stringify({ expectedVersion: withdrawTarget.version }),
          })
        }
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderColor: colors.rule }}>
      <AppText kind="bold" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Option({
  selected,
  disabled,
  onPress,
  label,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  // Omitted when the children read well on their own (async book titles).
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.forest : colors.rule,
        backgroundColor: colors.surface,
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}
