import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  ActionBar,
  AppText,
  BackAction,
  Button,
  Checkbox,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  space,
  stitchTokens,
  presentError,
} from "../../core/ui";
import {
  addressBook,
  directory,
  emptyAddress,
  cleanAddress,
  validateAddress,
  type Address,
  type AddressInput,
  type AddressErrors,
} from "./contracts";
import { executeAddress, type AddressIntent } from "./address-command";
type Editor = {
  id?: string;
  version: number;
  value: AddressInput;
  makeDefault: boolean;
};
export function AddressesScreen() {
  const { client } = useSession(),
    cache = useQueryClient(),
    navigation = useNavigation();
  const book = useQuery({
    queryKey: ["address-book"],
    queryFn: () => client.request("/me/addresses", addressBook),
    gcTime: 0,
  });
  const areas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => client.request("/service-areas", directory),
  });
  const [editor, setEditor] = useState<Editor | null>(null),
    [errors, setErrors] = useState<AddressErrors>({}),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false),
    [intent, setIntent] = useState<AddressIntent | null>(null),
    [deleting, setDeleting] = useState<Address | null>(null),
    [leave, setLeave] = useState(false);
  const busyRef = useRef(false),
    scroll = useRef<ScrollView>(null),
    leaveAction = useRef<() => void>(() => {});
  const guarded = !!editor || !!intent || busy;
  usePreventRemove(guarded, ({ data }) => {
    if (!busyRef.current) {
      leaveAction.current = () => navigation.dispatch(data.action);
      setLeave(true);
    }
  });
  useEffect(() => {
    if (!guarded || Platform.OS !== "web" || typeof window === "undefined")
      return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guarded]);
  const top = () => scroll.current?.scrollTo({ y: 0, animated: false });
  function begin(item?: Address) {
    if (!book.data || intent || busyRef.current) return;
    setEditor({
      id: item?.id,
      version: book.data.version,
      value: item
        ? {
            recipientName: item.recipientName,
            phone: item.phone,
            serviceAreaCode: item.serviceAreaCode,
            localityCode: item.localityCode,
            detail: item.detail,
          }
        : { ...emptyAddress },
      makeDefault: item?.isDefault ?? false,
    });
    setErrors({});
    setError("");
    setSuccess("");
    top();
  }
  async function run(next: AddressIntent) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setIntent(next);
    setError("");
    try {
      const fresh = await executeAddress(client, next);
      cache.setQueryData(["address-book"], fresh);
      setEditor(null);
      setDeleting(null);
      setIntent(null);
      setSuccess("Sổ địa chỉ đã cập nhật.");
      top();
    } catch (e) {
      setError(presentError(e).message);
      setIntent({ ...next });
      top();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function start(path: string, method: "POST" | "PUT", body: unknown) {
    void run({
      path,
      method,
      body: JSON.stringify(body),
      key: Crypto.randomUUID(),
    });
  }
  function save() {
    if (!editor || intent || busyRef.current) return;
    const issues = validateAddress(
      editor.value,
      areas.data?.localities.map((x) => x.code) ?? [],
    );
    setErrors(issues);
    if (Object.keys(issues).length) {
      setError("Kiểm tra các ô được đánh dấu bên dưới.");
      top();
      return;
    }
    start(
      editor.id ? `/me/addresses/${editor.id}` : "/me/addresses",
      editor.id ? "PUT" : "POST",
      {
        expectedBookVersion: editor.version,
        address: cleanAddress(editor.value),
        makeDefault: editor.makeDefault,
      },
    );
  }
  function editValue(field: keyof AddressInput, value: string) {
    if (!editor || intent || busyRef.current) return;
    const next = { ...editor.value, [field]: value };
    setEditor({ ...editor, value: next });
    if (errors[field])
      setErrors((previous) => ({
        ...previous,
        [field]: validateAddress(
          next,
          areas.data?.localities.map((x) => x.code) ?? [],
        )[field],
      }));
    setError("");
  }
  function discard() {
    leaveAction.current = () => {
      setEditor(null);
      setDeleting(null);
      setIntent(null);
      setError("");
      setErrors({});
      void book.refetch();
    };
    setLeave(true);
  }
  const locked = busy || !!intent,
    readError = book.error || areas.error;
  // Save and leave stay above the keyboard while the form is open.
  const footer = editor ? (
    <ActionBar>
      <Button
        key="leave"
        title="Quay lại sổ địa chỉ"
        secondary
        disabled={busy}
        onPress={discard}
      />
      <Button
        key="save"
        title="Lưu địa chỉ"
        busy={busy}
        disabled={!!intent || !!readError}
        onPress={save}
      />
    </ActionBar>
  ) : undefined;
  return (
    <Screen scrollRef={scroll} footer={footer} appearance="browse">
      <BackAction
        title="Quay lại"
        disabled={busy}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("./account");
        }}
      />
      <View style={styles.heroHeader}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Icon name="pin" size={12} color={stitchTokens.wine} />
            <AppText style={styles.heroBadgeText}>NƠI SÁCH ĐƯỢC CHUYỂN TỚI</AppText>
          </View>
        </View>
        <AppText style={styles.heroTitle} accessibilityRole="header">
          {editor
            ? editor.id
              ? "Chỉnh sửa địa chỉ"
              : "Thêm địa chỉ mới"
            : "Sổ địa chỉ"}
        </AppText>
      </View>
      {success && !editor ? <Notice tone="success">{success}</Notice> : null}
      {error && !deleting ? <Notice tone="error">{error}</Notice> : null}
      {intent && !deleting ? (
        <>
          <Notice tone="warning">
            {intent.acknowledged
              ? "Yêu cầu đã được lưu; cần tải lại sổ địa chỉ."
              : intent.stopped
                ? "Yêu cầu chưa được chấp nhận. Xem lại dữ liệu đã lưu trước khi sửa tiếp."
                : "Chưa xác định được kết quả. Thử lại cùng yêu cầu để tránh lưu hai lần."}
          </Notice>
          {!intent.stopped ? (
            <Button
              title={
                intent.acknowledged
                  ? "Tải sổ địa chỉ đã lưu"
                  : "Thử lại yêu cầu địa chỉ"
              }
              busy={busy}
              onPress={() => void run(intent)}
            />
          ) : (
            <Button
              title="Xem lại dữ liệu đã lưu"
              secondary
              onPress={discard}
            />
          )}
        </>
      ) : null}
      {readError ? (
        <>
          <Notice tone="error">
            Chưa tải được thông tin mới nhất. {presentError(readError).message}
          </Notice>
          <Button
            title="Tải lại sổ địa chỉ"
            secondary
            busy={book.isFetching || areas.isFetching}
            disabled={locked}
            onPress={() => {
              void book.refetch();
              void areas.refetch();
            }}
          />
        </>
      ) : null}
      {book.isPending || areas.isPending ? (
        <StatePanel loading title="Đang mở sổ địa chỉ" />
      ) : null}
      {editor ? (
        <>
          <Group title="NGƯỜI NHẬN">
            <TextField
              label="Tên người nhận"
              required
              autoComplete="name"
              value={editor.value.recipientName}
              editable={!locked}
              error={errors.recipientName}
              onChangeText={(v) => editValue("recipientName", v)}
            />
            <TextField
              label="Số điện thoại"
              required
              keyboardType="phone-pad"
              autoComplete="tel"
              hint="10 chữ số, bắt đầu bằng 0."
              value={editor.value.phone}
              editable={!locked}
              error={errors.phone}
              onChangeText={(v) => editValue("phone", v)}
            />
          </Group>
          <Group title="KHU VỰC">
            <AppText kind="bold">Vùng phục vụ: TP.HCM</AppText>
            <AppText kind="small" color={colors.muted}>
              Khu vực A/B là mô phỏng cho bản demo, không phải phường/xã chính
              thức và không phải điểm giao sách.
            </AppText>
            {areas.data?.localities.map((l) => (
              <Button
                key={l.code}
                secondary
                selected={editor.value.localityCode === l.code}
                title={`${editor.value.localityCode === l.code ? "Đã chọn: " : ""}${l.label}`}
                disabled={locked}
                onPress={() => editValue("localityCode", l.code)}
              />
            ))}
            {errors.localityCode ? (
              <Notice tone="error">{errors.localityCode}</Notice>
            ) : null}
          </Group>
          <Group title="ĐỊA CHỈ">
            <TextField
              label="Địa chỉ chi tiết"
              required
              multiline
              hint="Số nhà, đường và chỉ dẫn cần thiết. Dùng dữ liệu thử trong bản demo."
              value={editor.value.detail}
              editable={!locked}
              error={errors.detail}
              onChangeText={(v) => editValue("detail", v)}
            />
            <Checkbox
              title="Đặt làm địa chỉ mặc định"
              checked={editor.makeDefault}
              disabled={
                locked ||
                !!book.data?.items.find((i) => i.id === editor.id)?.isDefault
              }
              onPress={() =>
                setEditor({ ...editor, makeDefault: !editor.makeDefault })
              }
            />
            <AppText kind="small">
              Địa chỉ đầu tiên tự trở thành mặc định. Muốn đổi mặc định, chọn
              một địa chỉ khác trong sổ.
            </AppText>
          </Group>
        </>
      ) : book.data ? (
        <>
          <View style={styles.counterRow}>
            <AppText style={styles.counterTitle}>Danh sách địa chỉ</AppText>
            <View style={styles.counterBadge}>
              <AppText style={styles.counterBadgeText}>
                {book.data.items.length}/10 địa chỉ
              </AppText>
            </View>
          </View>

          {!book.data.items.length ? (
            <StatePanel
              icon="pin"
              title="Chưa có địa chỉ nào"
              message="Lưu nơi gửi hoặc nhận để chuẩn bị cho những lần chuyền sách."
            />
          ) : null}

          {book.data.items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.addressCard,
                item.isDefault ? styles.addressCardDefault : null,
              ]}
            >
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View
                    style={[
                      styles.pinCircle,
                      item.isDefault ? styles.pinCircleDefault : null,
                    ]}
                  >
                    <Icon
                      name="pin"
                      size={13}
                      color={item.isDefault ? stitchTokens.white : stitchTokens.wine}
                      filled={item.isDefault}
                    />
                  </View>
                  <AppText style={styles.addressNumber}>
                    ĐỊA CHỈ {index + 1}
                  </AppText>
                </View>
                {item.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Icon name="check" size={11} color={stitchTokens.likeNewGreen} />
                    <AppText style={styles.defaultBadgeText}>Mặc định</AppText>
                  </View>
                ) : null}
              </View>

              {/* Card Body */}
              <View style={styles.cardBody}>
                <View style={styles.recipientRow}>
                  <AppText style={styles.recipientName}>{item.recipientName}</AppText>
                  <View style={styles.phonePill}>
                    <AppText style={styles.phoneText}>📞 {item.phone}</AppText>
                  </View>
                </View>

                <AppText style={styles.addressDetail}>{item.detail}</AppText>

                <View style={styles.localityRow}>
                  <View style={styles.localityTag}>
                    <AppText style={styles.localityText}>
                      📍{" "}
                      {areas.data?.localities.find(
                        (l) => l.code === item.localityCode,
                      )?.label ?? item.localityCode}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Card Footer Actions */}
              <View style={styles.cardFooter}>
                <View style={styles.actionGroupLeft}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sửa địa chỉ ${index + 1}`}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
                    disabled={locked || !!readError}
                    onPress={() => begin(item)}
                  >
                    <Icon name="pen" size={13} color={stitchTokens.wineDark} />
                    <AppText style={styles.actionBtnText}>Sửa</AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa địa chỉ ${index + 1}`}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.deleteBtn,
                      pressed && styles.btnPressed,
                    ]}
                    disabled={locked || !!readError}
                    onPress={() => {
                      setError("");
                      setDeleting(item);
                    }}
                  >
                    <Icon name="trash" size={13} color={stitchTokens.crimson} />
                    <AppText style={styles.deleteBtnText}>Xóa</AppText>
                  </Pressable>
                </View>

                {!item.isDefault ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Đặt địa chỉ ${index + 1} làm mặc định`}
                    style={({ pressed }) => [styles.setDefaultBtn, pressed && styles.btnPressed]}
                    disabled={locked || !!readError}
                    onPress={() =>
                      start(`/me/addresses/${item.id}/default`, "POST", {
                        expectedBookVersion: book.data!.version,
                      })
                    }
                  >
                    <Icon name="check" size={12} color={stitchTokens.wineDark} />
                    <AppText style={styles.setDefaultText}>Đặt mặc định</AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          <Button
            title="Thêm địa chỉ mới"
            wine
            disabled={locked || !!readError || book.data.items.length >= 10}
            onPress={() => begin()}
          />
          {book.data.items.length >= 10 ? (
            <Notice tone="info">
              Đã đủ 10 địa chỉ. Bạn có thể sửa hoặc xóa một địa chỉ để thêm nơi
              mới.
            </Notice>
          ) : null}
        </>
      ) : null}
      <ConfirmDialog
        visible={!!deleting}
        title="Xóa địa chỉ này?"
        message="Thông tin đã chốt trong giao dịch vẫn được giữ. Nếu xóa địa chỉ mặc định, địa chỉ được lưu sớm nhất còn lại sẽ thay thế."
        confirmLabel={
          intent?.stopped
            ? "Xem lại sổ địa chỉ"
            : intent
              ? "Thử lại yêu cầu xóa"
              : "Xóa địa chỉ"
        }
        destructive
        busy={busy}
        error={error}
        onCancel={() => {
          setDeleting(null);
          setError("");
        }}
        onConfirm={() => {
          if (intent?.stopped) {
            setDeleting(null);
            discard();
          } else if (intent) void run(intent);
          else if (deleting && book.data)
            start(`/me/addresses/${deleting.id}/archive`, "POST", {
              expectedBookVersion: book.data.version,
            });
        }}
      />
      <ConfirmDialog
        visible={leave}
        title="Rời phần đang chỉnh sửa?"
        message={
          intent
            ? "Kết quả yêu cầu có thể đã được lưu. Sau khi quay lại, hãy kiểm tra sổ địa chỉ trước khi gửi thêm."
            : "Thông tin chưa lưu sẽ bị bỏ. Sổ địa chỉ đã lưu vẫn được giữ."
        }
        confirmLabel="Rời phần chỉnh sửa"
        busy={busy}
        onCancel={() => setLeave(false)}
        onConfirm={() => {
          setLeave(false);
          leaveAction.current();
        }}
      />
    </Screen>
  );
}

function Group({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.formGroupCard}>
      <View style={styles.formGroupHeader}>
        <AppText style={styles.formGroupTitle}>{title}</AppText>
      </View>
      <View style={styles.formGroupBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    gap: 8,
    marginBottom: space.xs,
  },
  heroBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.roseWarmTag,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  heroBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: space.xs,
  },
  counterTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  counterBadge: {
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  counterBadgeText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    fontWeight: "600",
  },
  addressCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  addressCardDefault: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wineLight,
    backgroundColor: stitchTokens.warmIvory,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pinCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.roseWarmTag,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pinCircleDefault: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wineDark,
  },
  addressNumber: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    letterSpacing: 0.3,
  },
  defaultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.likeNewGreenBg,
    borderColor: stitchTokens.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  defaultBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
  cardBody: {
    gap: 5,
    paddingLeft: 2,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  phonePill: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  phoneText: {
    fontSize: 12.5,
    color: stitchTokens.deepCocoa,
    fontWeight: "600",
  },
  addressDetail: {
    fontSize: 13.5,
    color: stitchTokens.deepCocoa,
    lineHeight: 19,
    marginTop: 2,
  },
  localityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  localityTag: {
    alignSelf: "flex-start",
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  localityText: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingTop: 10,
    marginTop: 2,
  },
  actionGroupLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  deleteBtn: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.peachBorder,
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.crimson,
  },
  setDefaultBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  setDefaultText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: stitchTokens.wineDark,
  },
  btnPressed: {
    opacity: 0.7,
  },
  formGroupCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 14,
    padding: 14,
    gap: space.md,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  formGroupHeader: {
    borderBottomWidth: 1,
    borderColor: stitchTokens.cardBorder,
    paddingBottom: 6,
  },
  formGroupTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.5,
  },
  formGroupBody: {
    gap: space.md,
  },
});
