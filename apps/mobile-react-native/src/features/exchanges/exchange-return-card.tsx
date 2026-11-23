import { useEffect, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import {
  demoExchangeDeadlineLabel,
  exchangeReturnPhase,
  sendExchangeCommand,
  type ExchangeReturnAction,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  ConfirmDialog,
  Notice,
  TextField,
  colors,
  formatVnd,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { exchangeSchema, type Exchange } from "./contracts";

const ACTION_CONFIG: Partial<
  Record<
    ExchangeReturnAction,
    { label: string; field?: "note" | "trackingCode"; fieldLabel?: string }
  >
> = {
  SubmitStatement: {
    label: "Gửi giải trình",
    field: "note",
    fieldLabel: "Nội dung giải trình",
  },
  Appeal: {
    label: "Gửi kháng nghị",
    field: "note",
    fieldLabel: "Nội dung kháng nghị",
  },
  ReportDispatch: {
    label: "Ghi mã vận đơn hoàn",
    field: "trackingCode",
    fieldLabel: "Mã vận đơn hoàn sách",
  },
  AcknowledgeReturn: { label: "Xác nhận đã nhận sách hoàn" },
  ReportReturnProblem: {
    label: "Báo vấn đề khi trả sách",
    field: "note",
    fieldLabel: "Chi tiết vấn đề khi trả sách",
  },
};

export function ExchangeReturnAndDemoCard({
  exchange,
  userId,
  onReload,
}: {
  exchange: Exchange;
  userId: string;
  onReload: () => Promise<unknown>;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ExchangeReturnAction | null>(null);
  const [confirmAckOpen, setConfirmAckOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const r = exchange.returnResolution;
  const hasDemoAdvance = Boolean(
    exchange.demoDeadline || exchange.demoShippingAdvanceAvailable,
  );
  const hasVerification = Boolean(exchange.outboundDeliveryVerification);

  if (!r && !hasDemoAdvance && !hasVerification) return null;

  const open = (date: string | null) => Boolean(date && Date.parse(date) > now);
  const expired = (date: string | null) =>
    Boolean(date && Date.parse(date) <= now);

  const available: ExchangeReturnAction[] = [];
  if (r) {
    const owner = r.ownerId === userId;
    const offerAppeal =
      (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
      !r.effectiveAt &&
      open(r.appealDueAt);

    if (r.phase === "Evidence" && (!r.evidenceDueAt || open(r.evidenceDueAt)))
      available.push("SubmitStatement");
    if (offerAppeal && !r.appeals.some((a) => a.by === userId))
      available.push("Appeal");
    if (
      !owner &&
      r.phase === "ReturnOrdered" &&
      open(r.returnDueAt) &&
      (r.effectiveAt || (expired(r.appealDueAt) && !r.appeals.length))
    )
      available.push("ReportDispatch");
    if (owner && r.phase === "ReturnInProgress")
      available.push("AcknowledgeReturn", "ReportReturnProblem");
    if (owner && r.phase === "CheckingReturn" && open(r.checkDueAt))
      available.push("ReportReturnProblem");
  }

  const currentConfig =
    selected && available.includes(selected)
      ? ACTION_CONFIG[selected]
      : undefined;

  const submitReturnAction = async (action: ExchangeReturnAction) => {
    const config = ACTION_CONFIG[action];
    if (!config) return;
    if (config.field === "note" && value.trim().length < 5) {
      setError(`Vui lòng nhập ${config.fieldLabel?.toLowerCase() ?? "nội dung"} ít nhất 5 ký tự.`);
      return;
    }
    if (config.field === "trackingCode" && value.trim().length < 3) {
      setError("Vui lòng nhập mã vận đơn hợp lệ (tối thiểu 3 ký tự).");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendExchangeCommand(
        client,
        exchange.id,
        "return-resolution",
        {
          expectedVersion: exchange.revision,
          action,
          ...(config.field ? { [config.field]: value.trim() } : {}),
        },
        () => Crypto.randomUUID(),
        exchangeSchema,
      );
      setSelected(null);
      setValue("");
      setNotice(
        action === "SubmitStatement"
          ? "Đã ghi nhận giải trình."
          : "Đã ghi nhận yêu cầu.",
      );
      await queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      await onReload();
    } catch (caught) {
      setError(presentError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const runDemoAdvance = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (exchange.demoDeadline) {
        await sendExchangeCommand(
          client,
          exchange.id,
          "demo-advance",
          {
            expectedVersion: exchange.revision,
            deadline: exchange.demoDeadline,
          },
          () => Crypto.randomUUID(),
          exchangeSchema,
        );
      } else if (exchange.demoShippingAdvanceAvailable) {
        await sendExchangeCommand(
          client,
          exchange.id,
          "demo-advance-shipping",
          { expectedVersion: exchange.revision },
          () => Crypto.randomUUID(),
          exchangeSchema,
        );
      }
      setNotice("Đã tua nhanh thời hạn Demo thành công.");
      await queryClient.invalidateQueries({ queryKey: ["exchange", exchange.id] });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      await onReload();
    } catch (caught) {
      setError(presentError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {exchange.outboundDeliveryVerification ? (
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card,
            backgroundColor: colors.successSurface,
            borderWidth: 1,
            borderColor: stitchTokens.greenBorderSoft,
            gap: 4,
          }}
        >
          <AppText kind="bold" color={colors.success}>
            Admin đã xác minh sách đã đến người nhận
          </AppText>
          <AppText kind="small" color={colors.ink}>
            {exchange.outboundDeliveryVerification.note}
          </AppText>
        </View>
      ) : null}

      {r ? (
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card,
            backgroundColor: stitchTokens.white,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            gap: space.sm,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText kind="heading" color={stitchTokens.wineDark}>
              Xử lý trả sách & sự cố
            </AppText>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: stitchTokens.parchment,
              }}
            >
              <AppText
                kind="small"
                color={stitchTokens.wine}
                style={{ fontWeight: "700" }}
              >
                {exchangeReturnPhase[r.phase]}
              </AppText>
            </View>
          </View>

          {r.note ? (
            <AppText kind="small" color={colors.ink}>
              Ghi chú từ Admin: {r.note}
            </AppText>
          ) : null}

          <View
            style={{
              padding: space.sm,
              borderRadius: radius.control,
              backgroundColor: stitchTokens.warmIvory,
              gap: 4,
            }}
          >
            <AppText kind="small" color={stitchTokens.wineDark}>
              Vai trò của bạn:{" "}
              <AppText kind="bold">
                {r.ownerId === userId ? "Chủ sách (bên nhận hoàn / bồi thường)" : "Bên đang giữ sách"}
              </AppText>
            </AppText>
            {r.evidenceDueAt && r.phase === "Evidence" ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Hạn bổ sung bằng chứng:{" "}
                <AppText kind="bold">
                  {new Date(r.evidenceDueAt).toLocaleString("vi-VN")}
                </AppText>
              </AppText>
            ) : null}
            {r.appealDueAt &&
            (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
            !r.effectiveAt ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Hạn kháng nghị:{" "}
                <AppText kind="bold">
                  {new Date(r.appealDueAt).toLocaleString("vi-VN")}
                </AppText>
              </AppText>
            ) : null}
            {r.returnDueAt && r.phase === "ReturnOrdered" ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Hạn gửi hoàn sách:{" "}
                <AppText kind="bold">
                  {new Date(r.returnDueAt).toLocaleString("vi-VN")}
                </AppText>
              </AppText>
            ) : null}
            {r.checkDueAt && r.phase === "CheckingReturn" ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Hạn kiểm tra sách hoàn:{" "}
                <AppText kind="bold">
                  {new Date(r.checkDueAt).toLocaleString("vi-VN")}
                </AppText>
              </AppText>
            ) : null}
            {r.ownerId !== userId &&
            (r.phase === "ReturnOrdered" || r.phase === "ReturnInProgress") ? (() => {
              const returnAddr =
                r.ownerId === exchange.initiatorId
                  ? exchange.initiatorAddress
                  : exchange.recipientAddress;
              return returnAddr ? (
                <AppText kind="small" color={stitchTokens.darkWood}>
                  Địa chỉ gửi trả sách:{" "}
                  <AppText kind="bold">
                    {returnAddr.recipientName} ({returnAddr.phone}) · {returnAddr.detail}
                  </AppText>
                </AppText>
              ) : null;
            })() : null}
            <AppText kind="small" color={stitchTokens.darkWood}>
              Cọc chủ sách: <AppText kind="bold">{formatVnd(r.ownerDeposit)}</AppText> · Cọc bên giữ sách:{" "}
              <AppText kind="bold">{formatVnd(r.holderDeposit)}</AppText>
              {r.differenceAmount > 0 ? ` · Tiền bù: ${formatVnd(r.differenceAmount)}` : ""}
            </AppText>
            {r.compensation > 0 ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Mức bồi hoàn dự kiến:{" "}
                <AppText kind="bold">{formatVnd(r.compensation)}</AppText>
              </AppText>
            ) : null}
            {r.trackingCode ? (
              <AppText kind="small" color={stitchTokens.darkWood}>
                Mã vận đơn hoàn: <AppText kind="bold">{r.trackingCode}</AppText>
              </AppText>
            ) : null}
          </View>

          {exchange.statements && exchange.statements.length > 0 ? (
            <View style={{ gap: 6 }}>
              <AppText kind="bold" color={stitchTokens.wineDark}>
                Giải trình đã gửi ({exchange.statements.length})
              </AppText>
              {exchange.statements.map((st) => (
                <View
                  key={st.id}
                  style={{
                    padding: space.sm,
                    borderRadius: 8,
                    backgroundColor: stitchTokens.parchment,
                  }}
                >
                  <AppText kind="small" color={colors.ink}>
                    {st.note}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {available.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {available.map((act) => {
                  const cfg = ACTION_CONFIG[act];
                  if (!cfg) return null;
                  return (
                    <Button
                      key={act}
                      secondary={selected !== act}
                      title={cfg.label}
                      disabled={busy}
                      onPress={() => {
                        if (act === "AcknowledgeReturn") {
                          setConfirmAckOpen(true);
                        } else if (!cfg.field) {
                          void submitReturnAction(act);
                        } else {
                          setSelected(act);
                          setValue("");
                          setError(null);
                        }
                      }}
                    />
                  );
                })}
              </View>

              {selected && currentConfig?.field ? (
                <View style={{ gap: space.sm }}>
                  <TextField
                    label={currentConfig.fieldLabel ?? "Nội dung"}
                    value={value}
                    onChangeText={setValue}
                    placeholder="Nhập thông tin chi tiết..."
                    multiline={currentConfig.field === "note"}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button
                      title={currentConfig.label}
                      busy={busy}
                      onPress={() => void submitReturnAction(selected)}
                    />
                    <Button
                      secondary
                      title="Hủy"
                      disabled={busy}
                      onPress={() => setSelected(null)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {hasDemoAdvance ? (
        <View
          style={{
            padding: 14,
            borderRadius: 18,
            backgroundColor: stitchTokens.whiteSurface,
            borderWidth: 1,
            borderColor: stitchTokens.wineAlpha05,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <AppText
              kind="small"
              color={stitchTokens.subtleGray}
              style={{ fontWeight: "700" }}
            >
              Tua nhanh thời hạn (Demo)
            </AppText>
            <AppText kind="small" color={stitchTokens.subtleGray}>
              Chế độ kiểm thử
            </AppText>
          </View>
          <Button
            secondary
            title={
              exchange.demoDeadline
                ? `Tua qua ${demoExchangeDeadlineLabel[exchange.demoDeadline]} · Demo`
                : "Qua hạn gửi sách · Demo"
            }
            busy={busy}
            onPress={() => void runDemoAdvance()}
          />
        </View>
      ) : null}

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <ConfirmDialog
        visible={confirmAckOpen}
        title="Xác nhận đã nhận sách hoàn?"
        message="Chỉ xác nhận khi bạn đã nhận lại bưu kiện sách hoàn. Sau bước này bạn có 48 giờ để kiểm tra tình trạng sách trước khi hoàn tất tất toán."
        confirmLabel="Đã nhận sách hoàn"
        onCancel={() => setConfirmAckOpen(false)}
        onConfirm={() => {
          setConfirmAckOpen(false);
          void submitReturnAction("AcknowledgeReturn");
        }}
      />
    </View>
  );
}

