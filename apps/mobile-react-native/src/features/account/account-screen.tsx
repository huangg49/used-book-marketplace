import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { router } from "expo-router";
import { currentUserSchema } from "../../core/api/schemas";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  BackAction,
  Button,
  Notice,
  Screen,
  StatePanel,
  colors,
  presentError,
  space,
} from "../../core/ui";

const roleLabels = {
  MEMBER: "Bạn đọc",
  STAFF: "Nhân viên",
  ADMIN: "Quản trị viên",
  TEST_OPERATOR: "Kiểm thử viên",
};
export function AccountScreen() {
  const { client } = useSession();
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
    <Screen>
      <BackAction
        title="Khám phá kệ sách"
        onPress={() => router.replace("/")}
      />
      <View style={{ gap: space.md }}>
        <AppText kind="label" color={colors.rustText}>
          GÓC CỦA BẠN
        </AppText>
        <AppText kind="title" color={colors.forest} accessibilityRole="header">
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
            paddingVertical: space.xl,
            borderTopWidth: 1,
            borderColor: colors.rule,
          }}
        >
          <AppText kind="heading" color={colors.forest}>
            {profile.data.displayName}
          </AppText>
          <AppText selectable>{profile.data.email}</AppText>
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
      {profile.data?.roles.includes("MEMBER") &&
      profile.data.status !== "LOCKED" ? (
        <View style={{ gap: space.md }}>
          <Button
            title="Sách của tôi"
            onPress={() => router.push("./drafts")}
          />
          <Button
            title="Sổ địa chỉ"
            secondary
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
