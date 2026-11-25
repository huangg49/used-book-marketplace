import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  pendingSupportIntent,
  sendSupportIntent,
  supportDetailSchema,
  supportError,
  supportKinds,
  supportPageSchema,
  supportRelatedState,
  supportStates,
  supportTargetOptionsPageSchema,
  supportTargets,
  type SupportCase,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  presentError,
  radius,
  space,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";

type TargetType = NonNullable<SupportCase["target"]>["type"];

const KIND_KEYS = Object.keys(supportKinds) as (keyof typeof supportKinds)[];
const TARGET_KEYS = Object.keys(supportTargets) as TargetType[];

function SupportBackdrop({ compact = false }: { compact?: boolean }) {
  const archY = compact ? 148 : 216;
  const curveY = compact ? 182 : 252;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 860"
      preserveAspectRatio="xMidYMin slice"
    >
      <Defs>
        <LinearGradient id="supPaperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.paperBackdropLight} />
          <Stop offset="55%" stopColor={stitchTokens.paperBackdropMid} />
          <Stop offset="100%" stopColor={stitchTokens.paperBackdropShade} />
        </LinearGradient>
        <LinearGradient id="supWineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.wineBackdropLight} />
          <Stop offset="55%" stopColor={stitchTokens.wine} />
          <Stop offset="100%" stopColor={stitchTokens.wineBackdropShade} />
        </LinearGradient>
        <RadialGradient id="supGoldGlow" cx="86%" cy="10%" r="44%">
          <Stop offset="0%" stopColor={stitchTokens.gold} stopOpacity="0.32" />
          <Stop offset="60%" stopColor={stitchTokens.goldAccent} stopOpacity="0.08" />
          <Stop offset="100%" stopColor={stitchTokens.wine} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="supBottomHalo" cx="14%" cy="88%" r="46%">
          <Stop offset="0%" stopColor={stitchTokens.goldAccent} stopOpacity="0.2" />
          <Stop offset="100%" stopColor={stitchTokens.paperBackdropShade} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="860" fill="url(#supPaperGrad)" />
      <Rect x="0" y="0" width="400" height="860" fill="url(#supBottomHalo)" />
      <Path
        d={`M0 0 H400 V${archY} Q200 ${curveY} 0 ${archY} Z`}
        fill="url(#supWineGrad)"
      />
      <Path
        d={`M0 0 H400 V${archY} Q200 ${curveY} 0 ${archY} Z`}
        fill="url(#supGoldGlow)"
      />
      <Circle
        cx="360"
        cy="38"
        r="84"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <Circle
        cx="360"
        cy="38"
        r="52"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <Path
        d={`M0 ${archY} Q200 ${curveY} 400 ${archY}`}
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
    </Svg>
  );
}

export function SupportScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    targetType?: string;
    targetId?: string;
  }>();
  const activeId = typeof params.id === "string" ? params.id : "";
  const initialTargetType = (
    typeof params.targetType === "string" &&
    TARGET_KEYS.includes(params.targetType as TargetType)
      ? params.targetType
      : ""
  ) as TargetType | "";
  const initialTargetId =
    typeof params.targetId === "string" ? params.targetId : "";

  const { client, state } = useSession();
  const queryClient = useQueryClient();
  const userId = state.status === "authenticated" ? state.user.id : null;

  const [composing, setComposing] = useState(
    Boolean(initialTargetType && initialTargetId),
  );
  const [kind, setKind] = useState<SupportCase["kind"]>(
    initialTargetType ? "TransactionIssue" : "Feedback",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<TargetType | "">(
    initialTargetType,
  );
  const [targetId, setTargetId] = useState(initialTargetId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const casesQuery = useQuery({
    queryKey: ["support", userId, "list"],
    queryFn: () => client.request("/me/support-cases?limit=20", supportPageSchema),
    enabled: Boolean(userId) && !activeId,
  });

  const targetsQuery = useQuery({
    queryKey: ["support-targets", userId, targetType],
    queryFn: () =>
      client.request(
        `/me/support-targets?type=${encodeURIComponent(targetType)}&limit=10`,
        supportTargetOptionsPageSchema,
      ),
    enabled: Boolean(userId) && composing && Boolean(targetType),
  });

  if (state.status !== "authenticated") {
    return (
      <Screen
        footer={<MemberNavigation current="/account" />}
        footerAppearance="navigation"
      >
        <BackAction
          title="Về tài khoản"
          onPress={() => router.replace("/account")}
        />
        <StatePanel
          title="Trung tâm hỗ trợ"
          message="Vui lòng đăng nhập để gửi hoặc theo dõi yêu cầu hỗ trợ với Quản trị viên."
          action={{
            label: "Đăng nhập",
            onPress: () => router.push("/account"),
          }}
        />
      </Screen>
    );
  }

  if (activeId) {
    return (
      <SupportCaseDetailView
        caseId={activeId}
        userId={userId!}
        onBack={() => router.setParams({ id: "" })}
      />
    );
  }

  const createScope = "support:create";
  const hasPendingCreate = pendingSupportIntent(client, createScope);

  const submitCase = async () => {
    if (!hasPendingCreate) {
      if (title.trim().length < 5) {
        setError("Tiêu đề cần ít nhất 5 ký tự.");
        return;
      }
      if (description.trim().length < 10) {
        setError("Nội dung mô tả cần ít nhất 10 ký tự.");
        return;
      }
      if (targetType && !targetId.trim()) {
        setError("Vui lòng chọn hoặc nhập mã đối tượng liên quan.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const receipt = await sendSupportIntent(
        client,
        createScope,
        "/me/support-cases",
        {
          kind,
          title: title.trim(),
          description: description.trim(),
          ...(targetType && targetId.trim()
            ? { target: { type: targetType, id: targetId.trim() } }
            : {}),
        },
        () => Crypto.randomUUID(),
      );
      setTitle("");
      setDescription("");
      setComposing(false);
      setNotice("Đã gửi phiếu hỗ trợ thành công.");
      await queryClient.invalidateQueries({ queryKey: ["support"] });
      router.setParams({ id: receipt.entityId });
    } catch (caught) {
      setError(supportError(caught));
    } finally {
      setBusy(false);
    }
  };

  const items = casesQuery.data?.items ?? [];

  return (
    <Screen
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
      background={<SupportBackdrop />}
      canvasColor={stitchTokens.creamBg}
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về tài khoản"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/account");
          }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="back" size={18} color={stitchTokens.white} />
          <AppText kind="bold" style={styles.backBtnText}>
            Về tài khoản
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setComposing((v) => !v);
            setError(null);
          }}
          style={({ pressed }) => [
            composing ? styles.headerClosePill : styles.headerGoldPill,
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name={composing ? "close" : "plus"}
            size={14}
            color={composing ? stitchTokens.gold : stitchTokens.wineDark}
          />
          <AppText
            kind="small"
            style={
              composing ? styles.headerClosePillText : styles.headerGoldPillText
            }
          >
            {composing ? "Đóng biểu mẫu" : "Gửi yêu cầu"}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.heroHeader}>
        <AppText kind="heading" style={styles.heroTitle}>
          Trung tâm hỗ trợ
        </AppText>
        <AppText kind="small" style={styles.heroSub}>
          Gửi phản ánh giao dịch, báo cáo vi phạm hoặc góp ý với Quản trị viên.
        </AppText>
      </View>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {composing || hasPendingCreate ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconBox}>
              <Icon name="message" size={16} color={stitchTokens.wine} />
            </View>
            <AppText kind="card" color={stitchTokens.wineDark}>
              Tạo phiếu hỗ trợ mới
            </AppText>
          </View>

          <View style={{ gap: space.xs }}>
            <AppText kind="small" color={colors.muted}>
              Phân loại yêu cầu
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {KIND_KEYS.map((k) => (
                <Chip
                  key={k}
                  title={supportKinds[k]}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={{ gap: space.xs }}>
            <AppText kind="small" color={colors.muted}>
              Liên kết giao dịch / đối tượng (tùy chọn)
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <Chip
                title="Không đính kèm"
                selected={targetType === ""}
                onPress={() => {
                  setTargetType("");
                  setTargetId("");
                }}
              />
              {TARGET_KEYS.map((t) => (
                <Chip
                  key={t}
                  title={supportTargets[t]}
                  selected={targetType === t}
                  onPress={() => {
                    setTargetType(t);
                    setTargetId("");
                  }}
                />
              ))}
            </ScrollView>
          </View>

          {targetType ? (
            <View style={{ gap: space.xs }}>
              {targetsQuery.data?.items && targetsQuery.data.items.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <AppText kind="small" color={stitchTokens.wineDark}>
                    Chọn nhanh từ giao dịch gần đây:
                  </AppText>
                  {targetsQuery.data.items.map((opt) => {
                    const isSelected = targetId === opt.target.id;
                    return (
                      <Pressable
                        key={opt.target.id}
                        accessibilityRole="button"
                        onPress={() => setTargetId(opt.target.id)}
                        style={{
                          padding: space.sm,
                          borderRadius: radius.control,
                          borderWidth: isSelected ? 1.5 : 1,
                          borderColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.cardBorder,
                          backgroundColor: isSelected
                            ? stitchTokens.wineAlpha08
                            : stitchTokens.creamBg,
                          gap: 2,
                        }}
                      >
                        <AppText kind="bold" color={stitchTokens.wineDark}>
                          {opt.label}
                        </AppText>
                        {opt.description ? (
                          <AppText kind="small" color={colors.muted}>
                            {opt.description}
                          </AppText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <TextField
                label={`Mã ${supportTargets[targetType]} (UUID)`}
                value={targetId}
                onChangeText={setTargetId}
                placeholder="Nhập hoặc chọn mã ở trên..."
              />
            </View>
          ) : null}

          <TextField
            label="Tiêu đề yêu cầu"
            value={title}
            onChangeText={setTitle}
            placeholder="Tóm tắt ngắn gọn vấn đề bạn gặp..."
          />

          <TextField
            label="Mô tả chi tiết"
            value={description}
            onChangeText={setDescription}
            placeholder="Nêu rõ sự việc và hướng hỗ trợ bạn mong muốn..."
            multiline
          />

          <Button
            wine
            title={
              hasPendingCreate
                ? "Xác minh phiếu hỗ trợ vừa gửi"
                : "Gửi phiếu hỗ trợ"
            }
            busy={busy}
            onPress={() => void submitCase()}
          />
        </View>
      ) : null}

      {casesQuery.isPending ? (
        <View style={styles.card}>
          <StatePanel loading title="Đang tải danh sách phiếu hỗ trợ..." />
        </View>
      ) : casesQuery.isError ? (
        <View style={styles.card}>
          <StatePanel
            title="Chưa tải được danh sách hỗ trợ"
            message={presentError(casesQuery.error).message}
            action={{
              label: "Thử lại",
              onPress: () => void casesQuery.refetch(),
            }}
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Icon name="message" size={28} color={stitchTokens.wine} />
          </View>
          <AppText kind="card" style={styles.emptyTitle}>
            Chưa có phiếu hỗ trợ nào
          </AppText>
          <AppText kind="small" style={styles.emptyDesc}>
            Khi cần hỗ trợ về đơn hàng, trao đổi sách, đấu giá hoặc báo cáo vi
            phạm, bạn có thể gửi yêu cầu trực tiếp tại đây.
          </AppText>

          {!composing && (
            <>
              <View style={styles.quickKindsRow}>
                {KIND_KEYS.slice(0, 3).map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    onPress={() => {
                      setKind(k);
                      setComposing(true);
                      setError(null);
                    }}
                    style={({ pressed }) => [
                      styles.quickKindPill,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText kind="small" style={styles.quickKindText}>
                      {supportKinds[k]}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setComposing(true);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.emptyPrimaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="plus" size={16} color={stitchTokens.gold} />
                <AppText kind="bold" style={styles.emptyPrimaryBtnText}>
                  Tạo phiếu hỗ trợ mới
                </AppText>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.setParams({ id: item.id })}
              style={({ pressed }) => [
                styles.ticketCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.ticketTopRow}>
                <View style={styles.ticketKindPill}>
                  <AppText kind="small" style={styles.ticketKindText}>
                    {supportKinds[item.kind]}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.ticketStatePill,
                    item.state === "Closed" && styles.ticketStatePillClosed,
                  ]}
                >
                  <AppText
                    kind="small"
                    style={[
                      styles.ticketStateText,
                      item.state === "Closed" && styles.ticketStateTextClosed,
                    ]}
                  >
                    {supportStates[item.state]}
                  </AppText>
                </View>
              </View>

              <AppText kind="bold" color={colors.ink} style={styles.ticketTitle}>
                {item.title}
              </AppText>

              <View style={styles.ticketFootRow}>
                <AppText kind="small" color={colors.muted}>
                  Mã #{item.id.slice(0, 8).toUpperCase()}
                  {item.target
                    ? ` · ${supportTargets[item.target.type]}`
                    : ""}
                </AppText>
                <Icon name="chevronRight" size={16} color={stitchTokens.wine} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function SupportCaseDetailView({
  caseId,
  userId,
  onBack,
}: {
  caseId: string;
  userId: string;
  onBack: () => void;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["support", userId, "detail", caseId],
    queryFn: () =>
      client.request(`/me/support-cases/${caseId}`, supportDetailSchema),
    refetchInterval: 10_000,
  });

  if (detailQuery.isPending) {
    return (
      <Screen
        footer={<MemberNavigation current="/account" />}
        footerAppearance="navigation"
        background={<SupportBackdrop compact />}
        canvasColor={stitchTokens.creamBg}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Danh sách hỗ trợ"
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.white} />
            <AppText kind="bold" style={styles.backBtnText}>
              Danh sách hỗ trợ
            </AppText>
          </Pressable>
        </View>
        <View style={styles.card}>
          <StatePanel loading title="Đang tải chi tiết phiếu hỗ trợ..." />
        </View>
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen
        footer={<MemberNavigation current="/account" />}
        footerAppearance="navigation"
        background={<SupportBackdrop compact />}
        canvasColor={stitchTokens.creamBg}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Danh sách hỗ trợ"
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Icon name="back" size={18} color={stitchTokens.white} />
            <AppText kind="bold" style={styles.backBtnText}>
              Danh sách hỗ trợ
            </AppText>
          </Pressable>
        </View>
        <View style={styles.card}>
          <StatePanel
            title="Không tải được phiếu hỗ trợ"
            message={presentError(detailQuery.error).message}
            action={{
              label: "Thử lại",
              onPress: () => void detailQuery.refetch(),
            }}
          />
        </View>
      </Screen>
    );
  }

  const { case: c, messages, canReply, relatedState } = detailQuery.data;
  const replyScope = `support:reply:${caseId}:${c.version}`;

  const sendReply = async () => {
    if (!replyText.trim() && !pendingSupportIntent(client, replyScope)) {
      setError("Nhập nội dung phản hồi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendSupportIntent(
        client,
        replyScope,
        `/me/support-cases/${caseId}/messages`,
        { expectedVersion: c.version, text: replyText.trim() },
        () => Crypto.randomUUID(),
      );
      setReplyText("");
      await detailQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["support"] });
    } catch (caught) {
      setError(supportError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={<MemberNavigation current="/account" />}
      footerAppearance="navigation"
      background={<SupportBackdrop compact />}
      canvasColor={stitchTokens.creamBg}
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Danh sách hỗ trợ"
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon name="back" size={18} color={stitchTokens.white} />
          <AppText kind="bold" style={styles.backBtnText}>
            Danh sách hỗ trợ
          </AppText>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.ticketTopRow}>
          <View style={styles.ticketKindPill}>
            <AppText kind="small" style={styles.ticketKindText}>
              {supportKinds[c.kind]} · #{c.id.slice(0, 8).toUpperCase()}
            </AppText>
          </View>
          <View
            style={[
              styles.ticketStatePill,
              c.state === "Closed" && styles.ticketStatePillClosed,
            ]}
          >
            <AppText
              kind="small"
              style={[
                styles.ticketStateText,
                c.state === "Closed" && styles.ticketStateTextClosed,
              ]}
            >
              {supportStates[c.state]}
            </AppText>
          </View>
        </View>
        <AppText kind="heading" color={stitchTokens.wineDark}>
          {c.title}
        </AppText>
        {c.target ? (
          <AppText kind="small" color={colors.muted}>
            Đối tượng: {supportTargets[c.target.type]} (#
            {c.target.id.slice(0, 8).toUpperCase()})
            {relatedState ? ` — ${supportRelatedState(relatedState)}` : ""}
          </AppText>
        ) : null}
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={{ gap: space.sm }}>
        <AppText kind="bold" color={stitchTokens.wineDark}>
          Lịch sử trao đổi ({messages.length})
        </AppText>
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              padding: space.md,
              borderRadius: radius.card,
              backgroundColor:
                m.role === "Admin"
                  ? stitchTokens.warmIvory
                  : stitchTokens.whiteSurface,
              borderWidth: 1,
              borderColor:
                m.role === "Admin"
                  ? stitchTokens.goldDark
                  : stitchTokens.cardBorder,
              gap: 4,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: space.xs,
              }}
            >
              <AppText kind="bold" color={stitchTokens.wineDark}>
                {m.authorName} ({m.role === "Admin" ? "Quản trị viên" : "Bạn"})
              </AppText>
              <AppText kind="small" color={colors.muted}>
                {new Date(m.createdAt).toLocaleString("vi-VN")}
              </AppText>
            </View>
            <AppText color={colors.ink}>{m.text}</AppText>
          </View>
        ))}
      </View>

      {canReply ? (
        <View style={styles.card}>
          <TextField
            label="Gửi phản hồi bổ sung"
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Nhập thông tin phản hồi..."
            multiline
          />
          <Button
            wine
            title="Gửi phản hồi"
            busy={busy}
            onPress={() => void sendReply()}
          />
        </View>
      ) : c.state === "Closed" ? (
        <View style={styles.card}>
          <AppText kind="bold" color={stitchTokens.wineDark}>
            Hồ sơ hỗ trợ đã đóng
          </AppText>
          <AppText kind="small" color={colors.muted}>
            Lịch sử trao đổi vẫn được lưu bên trên. Hiện chưa thể gửi thêm nội
            dung trong hồ sơ này.
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  backBtnText: {
    color: stitchTokens.white,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.78,
  },
  headerGoldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: stitchTokens.gold,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerGoldPillText: {
    color: stitchTokens.wineDark,
    fontWeight: "700",
    fontSize: 13,
  },
  headerClosePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  headerClosePillText: {
    color: stitchTokens.gold,
    fontWeight: "600",
    fontSize: 13,
  },
  heroHeader: {
    gap: 4,
    paddingTop: 2,
    paddingBottom: 18,
  },
  heroTitle: {
    color: stitchTokens.white,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  heroSub: {
    color: stitchTokens.gold,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 18,
    gap: space.md,
    shadowColor: stitchTokens.wineDeep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineAlpha08,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
    shadowColor: stitchTokens.wineDeep,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyTitle: {
    color: stitchTokens.wineDark,
    fontSize: 19,
    textAlign: "center",
  },
  emptyDesc: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  quickKindsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  quickKindPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  quickKindText: {
    color: stitchTokens.wineDark,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyPrimaryBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    width: "100%",
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emptyPrimaryBtnText: {
    color: stitchTokens.gold,
    fontSize: 15,
  },
  ticketCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 16,
    gap: 8,
    shadowColor: stitchTokens.wineDeep,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  ticketTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  ticketKindPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.wineAlpha08,
  },
  ticketKindText: {
    color: stitchTokens.wine,
    fontSize: 12,
    fontWeight: "600",
  },
  ticketStatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  ticketStatePillClosed: {
    backgroundColor: stitchTokens.surfaceSoft,
  },
  ticketStateText: {
    color: stitchTokens.verifiedGreen,
    fontSize: 12,
    fontWeight: "700",
  },
  ticketStateTextClosed: {
    color: colors.muted,
  },
  ticketTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  ticketFootRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
});

