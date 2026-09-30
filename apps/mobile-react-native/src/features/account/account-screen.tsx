import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { currentUserSchema } from "../../core/api/schemas";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  ActionRow,
  BackAction,
  Button,
  Notice,
  Screen,
  StatePanel,
  colors,
  presentError,
  space,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { internalMemberViewsEnabled } from "../../core/config/internal-member-views";

const roleLabels = {
  MEMBER: "Bạn đọc",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Kiểm thử viên",
};
export function AccountScreen() {
  const { client } = useSession();
  const { fontScale } = useWindowDimensions();
  const [presentationVersion, setPresentationVersion] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setPresentationVersion((version) => version + 1);
    }, []),
  );
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => client.request("/auth/me", currentUserSchema),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await client.logout();
    } catch (cause) {
      setError(presentError(cause).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    // Fabric can retain old parent text constraints while this route is behind
    // another screen, before Dimensions catches up. Remeasure this read-only
    // presentation on focus; keep query/session and logout state here.
    <Screen
      key={`${fontScale}:${presentationVersion}`}
      footer={<MemberNavigation current="/account" />}
    >
      <BackAction
        title="Khám phá kệ sách"
        onPress={() => router.replace("/")}
      />
      <View style={{ gap: space.md }}>
        <AppText kind="label" color={colors.rustText}>
          GÓC CỦA BẠN
        </AppText>
        <AppText
          kind="heading"
          color={colors.forest}
          accessibilityRole="header"
        >
          Tài khoản của bạn
        </AppText>
      </View>
      {profile.isPending ? (
        <StatePanel loading title="Đang tải tài khoản" />
      ) : null}
      {profile.error ? (
        <>
          <Notice tone="error">{presentError(profile.error).message}</Notice>
          <Button
            title="Thử lại"
            secondary
            busy={profile.isFetching}
            onPress={() => {
              void profile.refetch();
            }}
          />
        </>
      ) : null}
      {profile.data ? (
        <View
          style={{
            gap: space.md,
            padding: space.xl,
            backgroundColor: colors.forest,
            borderRadius: 6,
          }}
        >
          <AppText kind="heading" color={colors.paper}>
            {profile.data.displayName}
          </AppText>
          <AppText kind="small" color={colors.paper} selectable>
            {profile.data.email}
          </AppText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {profile.data.roles.map((role) => (
              <AppText
                key={role}
                kind="small"
                color={colors.forest}
                style={{
                  backgroundColor: colors.successSurface,
                  padding: space.sm,
                }}
              >
                {roleLabels[role]}
              </AppText>
            ))}
          </View>
          {profile.data.status === "RESTRICTED" ? (
            <Notice tone="warning">
              Tài khoản đang bị hạn chế một số hoạt động.
            </Notice>
          ) : null}
          {profile.data.status === "LOCKED" ? (
            <Notice tone="warning">
              Tài khoản đang bị khóa. Bạn không thể đăng sách hoặc tạo giao dịch
              mới. Các giao dịch đã có vẫn được giữ lại.
            </Notice>
          ) : null}
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {internalMemberViewsEnabled && profile.data?.roles.includes("MEMBER") ? (
        <ActionRow
          title="Ví của bạn"
          description="Số dư mô phỏng và lịch sử ghi nhận"
          icon="wallet"
          onPress={() => router.push("./wallet")}
        />
      ) : null}
      {profile.data?.roles.includes("MEMBER") &&
      profile.data.status !== "LOCKED" ? (
        <View style={{ gap: space.md }}>
          <ActionRow
            title="Sách của tôi"
            description="Bản nháp, bài chờ duyệt và sách trên kệ"
            icon="book"
            onPress={() => router.push("./drafts")}
          />
          <ActionRow
            title="Sổ địa chỉ"
            description="Quản lý nơi gửi và nhận sách"
            icon="pin"
            onPress={() => router.push("./addresses")}
          />
        </View>
      ) : null}
      <Button
        title="Đăng xuất"
        secondary
        busy={busy}
        onPress={() => {
          void logout();
        }}
      />
    </Screen>
  );
}
