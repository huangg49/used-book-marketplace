import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
    >
      <BackAction
        title="Về tài khoản"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/account");
        }}
      />

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText kind="title" color={stitchTokens.wineDark}>
            Trung tâm hỗ trợ
          </AppText>
          <AppText kind="small" color={colors.muted}>
            Gửi phản ánh giao dịch, báo cáo vi phạm hoặc góp ý với Quản trị viên
          </AppText>
        </View>
        <Button
          wine={!composing}
          secondary={composing}
          title={composing ? "Đóng biểu mẫu" : "+ Gửi yêu cầu"}
          onPress={() => {
            setComposing((v) => !v);
            setError(null);
          }}
        />
      </View>

      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {composing || hasPendingCreate ? (
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card,
            backgroundColor: stitchTokens.white,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            gap: space.md,
          }}
        >
          <AppText kind="heading" color={stitchTokens.wineDark}>
            Tạo phiếu hỗ trợ mới
          </AppText>

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
                            : stitchTokens.peachBorder,
                          backgroundColor: isSelected
                            ? stitchTokens.roseWarmSurface
                            : stitchTokens.parchment,
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
        <StatePanel loading title="Đang tải danh sách phiếu hỗ trợ..." />
      ) : casesQuery.isError ? (
        <StatePanel
          title="Chưa tải được danh sách hỗ trợ"
          message={presentError(casesQuery.error).message}
          action={{
            label: "Thử lại",
            onPress: () => void casesQuery.refetch(),
          }}
        />
      ) : items.length === 0 ? (
        <StatePanel
          title="Chưa có phiếu hỗ trợ nào"
          message="Khi cần hỗ trợ về đơn hàng, trao đổi sách, đấu giá hoặc báo cáo vi phạm, bạn có thể tạo phiếu hỗ trợ tại đây."
        />
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.setParams({ id: item.id })}
              style={{
                padding: space.md,
                borderRadius: radius.card,
                backgroundColor: stitchTokens.white,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                gap: 6,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                    backgroundColor: stitchTokens.parchment,
                  }}
                >
                  <AppText
                    kind="small"
                    color={stitchTokens.wine}
                    style={{ fontWeight: "700" }}
                  >
                    {supportKinds[item.kind]}
                  </AppText>
                </View>
                <AppText
                  kind="small"
                  color={
                    item.state === "Closed"
                      ? colors.muted
                      : stitchTokens.verifiedGreen
                  }
                  style={{ fontWeight: "700" }}
                >
                  {supportStates[item.state]}
                </AppText>
              </View>

              <AppText kind="bold" color={stitchTokens.wineDark}>
                {item.title}
              </AppText>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
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
      >
        <BackAction title="Danh sách hỗ trợ" onPress={onBack} />
        <StatePanel loading title="Đang tải chi tiết phiếu hỗ trợ..." />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen
        footer={<MemberNavigation current="/account" />}
        footerAppearance="navigation"
      >
        <BackAction title="Danh sách hỗ trợ" onPress={onBack} />
        <StatePanel
          title="Không tải được phiếu hỗ trợ"
          message={presentError(detailQuery.error).message}
          action={{
            label: "Thử lại",
            onPress: () => void detailQuery.refetch(),
          }}
        />
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
    >
      <BackAction title="Danh sách hỗ trợ" onPress={onBack} />

      <View
        style={{
          padding: space.md,
          borderRadius: radius.card,
          backgroundColor: stitchTokens.white,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
          gap: space.xs,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <AppText kind="small" color={stitchTokens.wine}>
            {supportKinds[c.kind]} · #{c.id.slice(0, 8).toUpperCase()}
          </AppText>
          <AppText kind="bold" color={stitchTokens.verifiedGreen}>
            {supportStates[c.state]}
          </AppText>
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
                  : stitchTokens.white,
              borderWidth: 1,
              borderColor:
                m.role === "Admin"
                  ? stitchTokens.goldDark
                  : stitchTokens.peachBorder,
              gap: 4,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
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
        <View
          style={{
            padding: space.md,
            borderRadius: radius.card,
            backgroundColor: stitchTokens.white,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            gap: space.xs,
          }}
        >
          <AppText kind="bold">Hồ sơ hỗ trợ đã đóng</AppText>
          <AppText kind="small" color={colors.muted}>
            Lịch sử trao đổi vẫn được lưu bên trên. Hiện chưa thể gửi thêm nội dung trong hồ sơ này.
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

