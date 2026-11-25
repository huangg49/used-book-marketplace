import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import {
  demoExchangeDeadlineLabel,
  exchangeReturnPhase,
  isExchangeReturnOverdue,
  sendExchangeCommand,
  type ExchangeReturnAction,
  type ExchangeReturnResolution,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  ConfirmDialog,
  Icon,
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

interface ActionMeta {
  label: string;
  submitLabel: string;
  tier: "primary" | "secondary";
  field?: "note" | "trackingCode";
  fieldLabel?: string;
  placeholder?: string;
  helper?: string;
}

const ACTION_CONFIG: Partial<Record<ExchangeReturnAction, ActionMeta>> = {
  SubmitStatement: {
    label: "Gửi giải trình",
    submitLabel: "Xác nhận gửi giải trình",
    tier: "primary",
    field: "note",
    fieldLabel: "Nội dung giải trình",
    placeholder: "Trình bày ngắn gọn tình trạng sách và mốc giao nhận...",
    helper: "Admin sẽ đối chiếu giải trình cùng tệp bằng chứng của hai bên.",
  },
  ReportDispatch: {
    label: "Ghi mã vận đơn hoàn",
    submitLabel: "Xác nhận đã gửi trả sách",
    tier: "primary",
    field: "trackingCode",
    fieldLabel: "Mã vận đơn hoàn sách",
    placeholder: "VD: GHN12345678 hoặc mã bưu gửi...",
    helper: "Chỉ gửi sau khi đã bàn giao kiện sách hoàn cho đơn vị vận chuyển.",
  },
  AcknowledgeReturn: {
    label: "Xác nhận đã nhận sách hoàn",
    submitLabel: "Xác nhận đã nhận sách hoàn",
    tier: "primary",
  },
  Appeal: {
    label: "Gửi kháng nghị",
    submitLabel: "Gửi kháng nghị lên Admin",
    tier: "secondary",
    field: "note",
    fieldLabel: "Lý do kháng nghị quyết định",
    placeholder: "Nêu rõ căn cứ hoặc điểm chưa phù hợp trong phán quyết...",
    helper: "Quyết định sẽ tạm dừng hiệu lực để Admin rà soát lại hồ sơ.",
  },
  ReportReturnProblem: {
    label: "Báo vấn đề khi trả sách",
    submitLabel: "Gửi báo cáo sự cố hoàn sách",
    tier: "secondary",
    field: "note",
    fieldLabel: "Mô tả vấn đề khi nhận sách hoàn",
    placeholder:
      "VD: Sách bị rách gáy, thiếu trang, sai cuốn hoặc không nhận được hàng...",
    helper:
      "Tiền ký quỹ tiếp tục giữ nguyên. Bạn nên tải thêm ảnh/video bằng chứng ở mục bên dưới.",
  },
};

const RETURN_SUB_STEPS = [
  "Tiếp nhận",
  "Phán quyết",
  "Hoàn sách",
  "Tất toán",
] as const;

function getReturnSubStepIndex(
  r: ExchangeReturnResolution,
  now: number,
): number {
  switch (r.phase) {
    case "Evidence":
    case "NeedsReview":
      return 0;
    case "CompensationOrdered":
      return 1;
    case "ReturnOrdered": {
      const effective =
        Boolean(r.effectiveAt) ||
        Boolean(
          r.appealDueAt &&
            Date.parse(r.appealDueAt) <= now &&
            r.appeals.length === 0,
        );
      return effective ? 2 : 1;
    }
    case "ReturnInProgress":
    case "ReturnIssue":
      return 2;
    case "CheckingReturn":
      return 3;
    case "Closed":
      return 4;
    default:
      return 0;
  }
}

function formatDateTimeVi(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export function ExchangeReturnAndDemoCard({
  exchange,
  userId,
  onReload,
  section = "all",
}: {
  exchange: Exchange;
  userId: string;
  onReload: () => Promise<unknown>;
  section?: "all" | "resolution" | "demo";
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

  const showResolution = section === "all" || section === "resolution";
  const showDemo = section === "all" || section === "demo";

  const hasResolutionContent = showResolution && (Boolean(r) || hasVerification);
  const hasDemoContent = showDemo && hasDemoAdvance;

  if (!hasResolutionContent && !hasDemoContent) return null;

  const open = (date: string | null) => Boolean(date && Date.parse(date) > now);
  const expired = (date: string | null) =>
    Boolean(date && Date.parse(date) <= now);
  const returnOverdue = isExchangeReturnOverdue(r, now);

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

  const primaryActions = available.filter(
    (act) => ACTION_CONFIG[act]?.tier === "primary",
  );
  const secondaryActions = available.filter(
    (act) => ACTION_CONFIG[act]?.tier === "secondary",
  );

  const currentConfig =
    selected && available.includes(selected)
      ? ACTION_CONFIG[selected]
      : undefined;

  const submitReturnAction = async (action: ExchangeReturnAction) => {
    const config = ACTION_CONFIG[action];
    if (!config) return;
    if (config.field === "note" && value.trim().length < 5) {
      setError(
        `Vui lòng nhập ${config.fieldLabel?.toLowerCase() ?? "nội dung"} ít nhất 5 ký tự.`,
      );
      return;
    }
    if (config.field === "trackingCode" && value.trim().length < 5) {
      setError("Vui lòng nhập mã vận đơn hợp lệ (tối thiểu 5 ký tự).");
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
          : action === "ReportDispatch"
            ? "Đã cập nhật mã vận đơn hoàn sách."
            : action === "AcknowledgeReturn"
              ? "Đã xác nhận nhận lại sách hoàn. Bắt đầu 48 giờ kiểm tra."
              : action === "Appeal"
                ? "Đã gửi kháng nghị lên Admin."
                : "Đã ghi nhận yêu cầu.",
      );
      await queryClient.invalidateQueries({
        queryKey: ["exchange", exchange.id],
      });
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
      await queryClient.invalidateQueries({
        queryKey: ["exchange", exchange.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      await onReload();
    } catch (caught) {
      setError(presentError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const isOwner = r ? r.ownerId === userId : false;
  const subStepIdx = r ? getReturnSubStepIndex(r, now) : 0;
  const myLockedAmount = r
    ? (isOwner ? r.ownerDeposit : r.holderDeposit) +
      (r.differencePayerId === userId ? r.differenceAmount : 0)
    : 0;

  const escrowOutcomeHint = (() => {
    if (!r || r.outcome || myLockedAmount <= 0) return null;
    if (r.phase === "CompensationOrdered") {
      return isOwner
        ? `Dự kiến hoàn đủ ${formatVnd(myLockedAmount)} đã khóa và nhận thêm ${formatVnd(r.compensation)} bồi hoàn.`
        : `Dự kiến khấu trừ ${formatVnd(r.compensation)} từ khoản đã khóa (${formatVnd(myLockedAmount)}); phần dư (nếu có) được hoàn về ví.`;
    }
    return isOwner
      ? `Khi bạn nhận lại sách hoàn nguyên vẹn, bạn được hoàn đủ 100% khoản đã khóa (${formatVnd(myLockedAmount)}). Nếu đối tác không trả, Admin xử lý bồi thường từ cọc đối tác.`
      : `Khi đối tác xác nhận nhận lại sách hoàn nguyên vẹn, bạn được hoàn đủ 100% khoản đã khóa (${formatVnd(myLockedAmount)}). Chỉ khấu trừ nếu không trả hoặc sách hư hại.`;
  })();

  const activeDeadline = (() => {
    if (!r) return null;
    if (r.phase === "Evidence" && r.evidenceDueAt) {
      return { label: "Hạn bổ sung", iso: r.evidenceDueAt };
    }
    if (
      (r.phase === "ReturnOrdered" || r.phase === "CompensationOrdered") &&
      !r.effectiveAt &&
      r.appealDueAt &&
      !r.appeals.length
    ) {
      return { label: "Hạn kháng nghị", iso: r.appealDueAt };
    }
    if (r.phase === "ReturnOrdered" && r.returnDueAt) {
      return { label: "Hạn gửi trả sách", iso: r.returnDueAt };
    }
    if (r.phase === "CheckingReturn" && r.checkDueAt) {
      return { label: "Hạn kiểm tra 48h", iso: r.checkDueAt };
    }
    return null;
  })();

  const returnAddress =
    r &&
    !isOwner &&
    (r.phase === "ReturnOrdered" || r.phase === "ReturnInProgress")
      ? r.ownerId === exchange.initiatorId
        ? exchange.initiatorAddress
        : exchange.recipientAddress
      : null;

  const badgeTone = (() => {
    if (!r) return "wine" as const;
    if (
      returnOverdue ||
      r.phase === "ReturnIssue" ||
      r.phase === "NeedsReview"
    ) {
      return "danger" as const;
    }
    if (r.phase === "Closed") return "success" as const;
    return "wine" as const;
  })();

  const roleText = !r
    ? ""
    : isOwner
      ? "Chủ sách · Bên nhận hoàn"
      : r.phase === "ReturnOrdered" || r.phase === "ReturnInProgress"
        ? "Bên đang giữ sách · Cần gửi trả"
        : "Bên đang giữ sách";

  const handleActionPress = (act: ExchangeReturnAction) => {
    const cfg = ACTION_CONFIG[act];
    if (!cfg) return;
    if (act === "AcknowledgeReturn") {
      setConfirmAckOpen(true);
    } else if (!cfg.field) {
      void submitReturnAction(act);
    } else if (selected === act) {
      setSelected(null);
      setError(null);
    } else {
      setSelected(act);
      setValue("");
      setError(null);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      {showResolution && exchange.outboundDeliveryVerification ? (
        <View style={styles.verifiedCard}>
          <View style={styles.verifiedHeaderRow}>
            <Icon name="verified" size={16} color={stitchTokens.likeNewGreen} />
            <AppText kind="bold" color={stitchTokens.likeNewGreen}>
              Admin đã xác minh sách đã đến người nhận
            </AppText>
          </View>
          <AppText kind="small" color={colors.ink}>
            {exchange.outboundDeliveryVerification.note}
          </AppText>
        </View>
      ) : null}

      {showResolution && r ? (
        <View style={styles.hubCard}>
          {/* 1. Compact Header + Phase Status Pill */}
          <View style={styles.hubHeader}>
            <View style={styles.hubTitleWrap}>
              <View style={styles.hubIconCircle}>
                <Icon name="gavel" size={16} color={stitchTokens.wine} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.hubTitle}>
                  {r.phase === "CompensationOrdered"
                    ? "Phán quyết bồi thường"
                    : "Phán quyết & Hoàn sách"}
                </AppText>
                <AppText style={styles.hubSubtitle}>{roleText}</AppText>
              </View>
            </View>

            <View
              style={[
                styles.phaseBadge,
                badgeTone === "danger" && styles.phaseBadgeDanger,
                badgeTone === "success" && styles.phaseBadgeSuccess,
              ]}
            >
              <AppText
                style={[
                  styles.phaseBadgeText,
                  badgeTone === "danger" && styles.phaseBadgeTextDanger,
                  badgeTone === "success" && styles.phaseBadgeTextSuccess,
                ]}
              >
                {returnOverdue
                  ? "Quá hạn trả sách"
                  : exchangeReturnPhase[r.phase]}
              </AppText>
            </View>
          </View>

          {/* 2. 4-Step Post-Dispute Progress Bar */}
          <View style={styles.subTrack}>
            {RETURN_SUB_STEPS.map((label, idx) => {
              const isDone = idx < subStepIdx;
              const isCurrent = idx === subStepIdx && r.phase !== "Closed";
              return (
                <View key={label} style={styles.subStepCol}>
                  <View
                    style={[
                      styles.subStepBar,
                      isDone && styles.subStepBarDone,
                      isCurrent && styles.subStepBarActive,
                    ]}
                  />
                  <AppText
                    numberOfLines={1}
                    style={[
                      styles.subStepLabel,
                      isDone && styles.subStepLabelDone,
                      isCurrent && styles.subStepLabelActive,
                    ]}
                  >
                    {label}
                  </AppText>
                </View>
              );
            })}
          </View>

          {/* 3. Appeal Pending Callout (only when active appeal pauses ruling) */}
          {r.appeals.length > 0 && !r.effectiveAt ? (
            <View style={styles.appealPendingBanner}>
              <Icon name="info" size={15} color={stitchTokens.wine} />
              <AppText style={styles.appealPendingText}>
                Đã ghi nhận kháng nghị. Quyết định đang tạm dừng để Admin xem
                xét lại.
              </AppText>
            </View>
          ) : null}

          {/* 4. Admin Decision Note */}
          {r.note ? (
            <View style={styles.rulingNoteBox}>
              <AppText style={styles.rulingNoteLabel}>
                Ghi chú từ Admin phụ trách
              </AppText>
              <AppText style={styles.rulingNoteBody}>{r.note}</AppText>
            </View>
          ) : null}

          {/* 5. Actionable Key Facts (Deadline / Tracking Code / Return Address / Compensation / Escrow Outcome) */}
          {(activeDeadline ||
            r.trackingCode ||
            returnAddress ||
            r.compensation > 0 ||
            escrowOutcomeHint ||
            returnOverdue) && (
            <View style={styles.factsCard}>
              {activeDeadline && formatDateTimeVi(activeDeadline.iso) ? (
                <View style={styles.factRow}>
                  <View style={styles.factIconWrap}>
                    <Icon name="clock" size={14} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.factTextCol}>
                    <AppText style={styles.factLabel}>
                      {activeDeadline.label}
                    </AppText>
                    <AppText style={styles.factValueHighlight}>
                      {formatDateTimeVi(activeDeadline.iso)}
                    </AppText>
                  </View>
                </View>
              ) : null}

              {r.trackingCode ? (
                <View style={styles.factRow}>
                  <View style={styles.factIconWrap}>
                    <Icon name="truck" size={14} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.factTextCol}>
                    <AppText style={styles.factLabel}>
                      Mã vận đơn hoàn sách
                    </AppText>
                    <AppText style={styles.trackingCodeText} selectable>
                      {r.trackingCode}
                    </AppText>
                  </View>
                </View>
              ) : null}

              {returnAddress ? (
                <View style={styles.factRow}>
                  <View style={styles.factIconWrap}>
                    <Icon name="pin" size={14} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.factTextCol}>
                    <AppText style={styles.factLabel}>
                      Địa chỉ gửi trả sách về chủ sách
                    </AppText>
                    <AppText style={styles.factValue}>
                      {returnAddress.recipientName} · {returnAddress.phone}
                    </AppText>
                    <AppText style={styles.factSubtext}>
                      {returnAddress.detail}
                    </AppText>
                  </View>
                </View>
              ) : null}

              {r.compensation > 0 ? (
                <View style={styles.factRow}>
                  <View style={styles.factIconWrap}>
                    <Icon name="wallet" size={14} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.factTextCol}>
                    <AppText style={styles.factLabel}>
                      {r.outcome
                        ? "Mức bồi hoàn đã chốt"
                        : "Mức bồi hoàn dự kiến"}
                    </AppText>
                    <AppText style={styles.factValueHighlight}>
                      {formatVnd(r.compensation)}
                    </AppText>
                  </View>
                </View>
              ) : null}

              {escrowOutcomeHint ? (
                <View style={styles.factRow}>
                  <View style={styles.factIconWrap}>
                    <Icon name="shield" size={14} color={stitchTokens.wine} />
                  </View>
                  <View style={styles.factTextCol}>
                    <AppText style={styles.factLabel}>
                      Dự kiến hoàn tiền ký quỹ
                    </AppText>
                    <AppText style={styles.factSubtext}>
                      {escrowOutcomeHint}
                    </AppText>
                  </View>
                </View>
              ) : null}

              {returnOverdue ? (
                <AppText style={styles.overdueText}>
                  Đã quá hạn gửi hoàn sách. Admin sẽ căn cứ bằng chứng để xử lý
                  tất toán bước tiếp theo.
                </AppText>
              ) : null}
            </View>
          )}

          {/* 6. Clear Wine CTA Hierarchy (Primary Action first, Secondary below) */}
          {available.length > 0 ? (
            <View style={styles.actionsSection}>
              {primaryActions.map((act) => {
                const cfg = ACTION_CONFIG[act];
                if (!cfg) return null;
                return (
                  <Button
                    key={act}
                    wine
                    title={cfg.label}
                    disabled={busy}
                    onPress={() => handleActionPress(act)}
                  />
                );
              })}

              {secondaryActions.length > 0 ? (
                <View style={styles.secondaryRow}>
                  {secondaryActions.map((act) => {
                    const cfg = ACTION_CONFIG[act];
                    if (!cfg) return null;
                    return (
                      <View key={act} style={{ flex: 1 }}>
                        <Button
                          wine
                          secondary={selected !== act}
                          title={cfg.label}
                          disabled={busy}
                          onPress={() => handleActionPress(act)}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {selected && currentConfig?.field ? (
                <View style={styles.inlineFormCard}>
                  <TextField
                    label={currentConfig.fieldLabel ?? "Nội dung"}
                    value={value}
                    onChangeText={setValue}
                    placeholder={
                      currentConfig.placeholder ?? "Nhập thông tin chi tiết..."
                    }
                    multiline={currentConfig.field === "note"}
                  />
                  {currentConfig.helper ? (
                    <AppText style={styles.formHelperText}>
                      {currentConfig.helper}
                    </AppText>
                  ) : null}
                  <View style={styles.formButtonRow}>
                    <View style={{ flex: 1 }}>
                      <Button
                        wine
                        title={currentConfig.submitLabel}
                        busy={busy}
                        onPress={() => void submitReturnAction(selected)}
                      />
                    </View>
                    <Button
                      secondary
                      title="Hủy"
                      disabled={busy}
                      onPress={() => {
                        setSelected(null);
                        setError(null);
                      }}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 7. Submitted Statements (compact list if any) */}
          {exchange.statements && exchange.statements.length > 0 ? (
            <View style={styles.statementsSection}>
              <AppText style={styles.statementsHeading}>
                Giải trình đã gửi ({exchange.statements.length})
              </AppText>
              {exchange.statements.map((st) => {
                const isMine = st.senderId === userId;
                return (
                  <View key={st.id} style={styles.statementItem}>
                    <View style={styles.statementMetaRow}>
                      <AppText style={styles.statementAuthor}>
                        {isMine ? "Bạn" : "Đối tác"}
                      </AppText>
                      {formatDateTimeVi(st.sentAt) ? (
                        <AppText style={styles.statementTime}>
                          {formatDateTimeVi(st.sentAt)}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText style={styles.statementBody}>{st.note}</AppText>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {showDemo && hasDemoAdvance ? (
        <View style={styles.demoCard}>
          <View style={styles.demoHeaderRow}>
            <AppText style={styles.demoTitle}>Tua nhanh thời hạn (Demo)</AppText>
            <AppText style={styles.demoTag}>Chế độ kiểm thử</AppText>
          </View>
          <Button
            wine
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

      {showResolution ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  verifiedCard: {
    padding: space.md,
    borderRadius: 16,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderWidth: 1,
    borderColor: stitchTokens.greenBorderSoft,
    gap: 6,
  },
  verifiedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hubCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  hubHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  hubTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  hubIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  hubTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  hubSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    marginTop: 1,
  },
  phaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.roseParchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    maxWidth: 150,
  },
  phaseBadgeDanger: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.redBorderSoft,
  },
  phaseBadgeSuccess: {
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.greenBorderSoft,
  },
  phaseBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  phaseBadgeTextDanger: {
    color: stitchTokens.crimson,
  },
  phaseBadgeTextSuccess: {
    color: stitchTokens.likeNewGreen,
  },
  subTrack: {
    flexDirection: "row",
    gap: 6,
  },
  subStepCol: {
    flex: 1,
    gap: 5,
  },
  subStepBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: stitchTokens.creamParchment,
  },
  subStepBarDone: {
    backgroundColor: stitchTokens.likeNewGreen,
  },
  subStepBarActive: {
    backgroundColor: stitchTokens.wine,
  },
  subStepLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
    textAlign: "center",
  },
  subStepLabelDone: {
    color: stitchTokens.likeNewGreen,
    fontWeight: "700",
  },
  subStepLabelActive: {
    color: stitchTokens.wine,
    fontWeight: "800",
  },
  appealPendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  appealPendingText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: stitchTokens.wineDark,
    lineHeight: 18,
  },
  rulingNoteBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: stitchTokens.parchment,
    borderLeftWidth: 3,
    borderLeftColor: stitchTokens.wine,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 3,
  },
  rulingNoteLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: stitchTokens.wine,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  rulingNoteBody: {
    fontSize: 13.5,
    color: stitchTokens.darkWood,
    lineHeight: 20,
  },
  factsCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.warmIvory,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 10,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  factIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  factTextCol: {
    flex: 1,
    gap: 1,
  },
  factLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  factValue: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  factValueHighlight: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  factSubtext: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 18,
  },
  trackingCodeText: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    letterSpacing: 0.4,
  },
  overdueText: {
    fontSize: 12.5,
    color: stitchTokens.crimson,
    fontWeight: "600",
    lineHeight: 18,
  },
  actionsSection: {
    gap: 10,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineFormCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: 10,
  },
  formHelperText: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  formButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statementsSection: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.cardBorder,
  },
  statementsHeading: {
    fontSize: 12.5,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  statementItem: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    gap: 3,
  },
  statementMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  statementAuthor: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wine,
  },
  statementTime: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
  },
  statementBody: {
    fontSize: 13,
    color: stitchTokens.darkWood,
    lineHeight: 19,
  },
  demoCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha05,
    gap: 10,
  },
  demoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  demoTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: stitchTokens.subtleGray,
  },
  demoTag: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
});
