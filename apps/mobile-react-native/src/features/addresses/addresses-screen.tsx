import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
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
    <Screen scrollRef={scroll} footer={footer}>
      <BackAction
        title="Quay lại"
        disabled={busy}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("./account");
        }}
      />
      <View style={{ gap: space.md }}>
        <AppText kind="label" color={colors.rustText}>
          NƠI SÁCH ĐƯỢC CHUYỀN TỚI
        </AppText>
        <AppText kind="title" color={colors.forest} accessibilityRole="header">
          {editor
            ? editor.id
              ? "Chỉnh sửa địa chỉ"
              : "Thêm địa chỉ"
            : "Sổ địa chỉ"}
        </AppText>
        <AppText color={colors.muted}>
          Địa chỉ được lưu riêng. Chỉnh sửa không đổi thông tin đã chốt trong
          giao dịch.
        </AppText>
      </View>
      {!editor ? (
        <Notice tone="info">
          Demo tại TP.HCM. Khu vực A/B là mô phỏng, không phải phường/xã chính
          thức. Chưa mở giao hàng.
        </Notice>
      ) : null}
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
          <AppText kind="small">{book.data.items.length}/10 địa chỉ</AppText>
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
              style={{
                gap: space.md,
                borderTopWidth: 1,
                borderColor: colors.rule,
                paddingTop: space.xl,
                // The default address carries a visible rule and text, not colour alone.
                ...(item.isDefault
                  ? {
                      borderLeftWidth: 3,
                      borderLeftColor: colors.forest,
                      paddingLeft: space.md,
                    }
                  : null),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                }}
              >
                {item.isDefault ? (
                  <Icon name="pin" size={16} filled color={colors.forest} />
                ) : null}
                <AppText
                  kind="label"
                  color={item.isDefault ? colors.forest : colors.rustText}
                  style={{ flexShrink: 1 }}
                >
                  ĐỊA CHỈ {index + 1}
                  {item.isDefault ? " · MẶC ĐỊNH" : ""}
                </AppText>
              </View>
              <AppText kind="heading">{item.recipientName}</AppText>
              <AppText>{item.phone}</AppText>
              <AppText>{item.detail}</AppText>
              <AppText kind="small">
                {areas.data?.localities.find(
                  (l) => l.code === item.localityCode,
                )?.label ?? item.localityCode}
              </AppText>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={`Sửa địa chỉ\u00a0${index + 1}`}
                    secondary
                    disabled={locked || !!readError}
                    onPress={() => begin(item)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Outlined in the list; the confirmation carries the destructive action. */}
                  <Button
                    title={`Xóa địa chỉ\u00a0${index + 1}`}
                    secondary
                    disabled={locked || !!readError}
                    onPress={() => {
                      setError("");
                      setDeleting(item);
                    }}
                  />
                </View>
              </View>
              {!item.isDefault ? (
                <Button
                  title={`Đặt địa chỉ ${index + 1} làm mặc định`}
                  secondary
                  disabled={locked || !!readError}
                  onPress={() =>
                    start(`/me/addresses/${item.id}/default`, "POST", {
                      expectedBookVersion: book.data!.version,
                    })
                  }
                />
              ) : null}
            </View>
          ))}
          <Button
            title="Thêm địa chỉ"
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
    <View
      style={{
        gap: space.md,
        paddingTop: space.lg,
        borderTopWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <AppText kind="label" color={colors.rustText} accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}
