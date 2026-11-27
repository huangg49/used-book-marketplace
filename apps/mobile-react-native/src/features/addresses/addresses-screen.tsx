import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useSession } from "../../core/session/session-provider";
import {
  ActionBar,
  AppText,
  Button,
  Checkbox,
  ConfirmDialog,
  Icon,
  Notice,
  Screen,
  StatePanel,
  TextField,
  colors,
  radius,
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
function AddressBackdrop() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 860"
      preserveAspectRatio="xMidYMin slice"
    >
      <Defs>
        <LinearGradient id="addrPaperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.paperBackdropLight} />
          <Stop offset="55%" stopColor={stitchTokens.paperBackdropMid} />
          <Stop offset="100%" stopColor={stitchTokens.paperBackdropShade} />
        </LinearGradient>
        <LinearGradient id="addrWineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={stitchTokens.wineBackdropLight} />
          <Stop offset="55%" stopColor={stitchTokens.wine} />
          <Stop offset="100%" stopColor={stitchTokens.wineBackdropShade} />
        </LinearGradient>
        <RadialGradient id="addrGoldGlow" cx="86%" cy="10%" r="44%">
          <Stop offset="0%" stopColor={stitchTokens.gold} stopOpacity="0.32" />
          <Stop offset="60%" stopColor={stitchTokens.goldAccent} stopOpacity="0.08" />
          <Stop offset="100%" stopColor={stitchTokens.wine} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="addrBottomHalo" cx="12%" cy="90%" r="45%">
          <Stop offset="0%" stopColor={stitchTokens.goldAccent} stopOpacity="0.2" />
          <Stop offset="100%" stopColor={stitchTokens.paperBackdropShade} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="860" fill="url(#addrPaperGrad)" />
      <Rect x="0" y="0" width="400" height="860" fill="url(#addrBottomHalo)" />
      <Path d="M0 0 H400 V212 Q200 248 0 212 Z" fill="url(#addrWineGrad)" />
      <Path d="M0 0 H400 V212 Q200 248 0 212 Z" fill="url(#addrGoldGlow)" />
      <Circle
        cx="362"
        cy="38"
        r="86"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <Circle
        cx="362"
        cy="38"
        r="54"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <Path
        d="M0 212 Q200 248 400 212"
        fill="none"
        stroke={stitchTokens.gold}
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
    </Svg>
  );
}

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
        wine
        title="Quay lại sổ địa chỉ"
        secondary
        disabled={busy}
        onPress={discard}
      />
      <Button
        key="save"
        wine
        title="Lưu địa chỉ"
        busy={busy}
        disabled={!!intent || !!readError}
        onPress={save}
      />
    </ActionBar>
  ) : undefined;
  const itemCount = book.data?.items.length ?? 0;
  return (
    <Screen
      scrollRef={scroll}
      footer={footer}
      background={<AddressBackdrop />}
      canvasColor={stitchTokens.creamBg}
      statusBarStyle="light"
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          disabled={busy}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("./account");
          }}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.btnPressed,
            busy && styles.btnDisabled,
          ]}
        >
          <Icon name="back" size={18} color={stitchTokens.white} />
          <AppText kind="bold" style={styles.backBtnText}>
            Quay lại
          </AppText>
        </Pressable>

        {!editor && book.data ? (
          <View style={styles.countPill}>
            <Icon name="pin" size={12} color={stitchTokens.gold} />
            <AppText kind="small" style={styles.countPillText}>
              {itemCount}/10 địa chỉ
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.heroHeader}>
        <AppText style={styles.heroTitle} accessibilityRole="header">
          {editor
            ? editor.id
              ? "Chỉnh sửa địa chỉ"
              : "Thêm địa chỉ mới"
            : "Sổ địa chỉ"}
        </AppText>
        <AppText kind="small" style={styles.heroSub}>
          {editor
            ? "Điền thông tin người nhận và khu vực giao nhận sách."
            : "Chọn địa chỉ mặc định cho các đơn mua, trao đổi và đấu giá."}
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
              wine
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
              wine
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
            wine
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
        <StatePanel wine loading title="Đang mở sổ địa chỉ" />
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
          <Group title="KHU VỰC GIAO NHẬN">
            <AppText kind="bold" color={stitchTokens.wineDark}>
              Vùng phục vụ: TP.HCM · Bình Dương · Vũng Tàu
            </AppText>
            <AppText kind="small" color={colors.muted}>
              Chọn khu vực phù hợp cho địa chỉ nhận hoặc gửi sách.
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {areas.data?.localities.map((l) => {
                const isSelected = editor.value.localityCode === l.code;
                return (
                  <Pressable
                    key={l.code}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled: locked }}
                    disabled={locked}
                    onPress={() => editValue("localityCode", l.code)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: isSelected
                        ? stitchTokens.wine
                        : stitchTokens.parchment,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? stitchTokens.wine
                        : stitchTokens.cardBorder,
                      opacity: locked ? 0.5 : pressed ? 0.78 : 1,
                    })}
                  >
                    <AppText
                      kind="small"
                      style={{
                        fontSize: 12.5,
                        fontWeight: isSelected ? "700" : "600",
                        color: isSelected
                          ? stitchTokens.white
                          : stitchTokens.wineDark,
                        includeFontPadding: false,
                      }}
                    >
                      {l.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {errors.localityCode ? (
              <Notice tone="error">{errors.localityCode}</Notice>
            ) : null}
          </Group>
          <Group title="ĐỊA CHỈ">
            <TextField
              label="Địa chỉ chi tiết"
              required
              multiline
              hint="Số nhà, tên đường và chỉ dẫn cần thiết."
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
            <AppText kind="small" color={colors.muted}>
              Địa chỉ đầu tiên tự trở thành mặc định. Muốn đổi mặc định, chọn
              một địa chỉ khác trong sổ.
            </AppText>
          </Group>
        </>
      ) : book.data ? (
        <>
          {!book.data.items.length ? (
            <StatePanel
              wine
              icon="pin"
              title="Chưa có địa chỉ nào"
              message="Lưu nơi gửi hoặc nhận để chuẩn bị cho những lần chuyền sách."
            />
          ) : null}

          <View style={styles.listStack}>
            {book.data.items.map((item, index) => {
              const localityLabel =
                areas.data?.localities.find((l) => l.code === item.localityCode)
                  ?.label ?? item.localityCode;
              const isDef = item.isDefault;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.addressCard,
                    isDef && styles.addressCardDefault,
                  ]}
                >
                  {/* Top Row: Badge/Title + Compact Icon Actions */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardIdentity}>
                      {isDef ? (
                        <View style={styles.defaultPill}>
                          <Icon
                            name="star"
                            size={11}
                            color={stitchTokens.wineDark}
                            filled
                          />
                          <AppText style={styles.defaultPillText}>
                            Mặc định
                          </AppText>
                        </View>
                      ) : (
                        <View style={styles.indexPill}>
                          <Icon
                            name="pin"
                            size={11}
                            color={stitchTokens.wine}
                          />
                          <AppText style={styles.indexPillText}>
                            Địa chỉ {index + 1}
                          </AppText>
                        </View>
                      )}
                    </View>

                    <View style={styles.iconActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sửa địa chỉ ${index + 1}`}
                        style={({ pressed }) => [
                          styles.iconCircleBtn,
                          isDef && styles.iconCircleBtnOnWine,
                          pressed && styles.btnPressed,
                          (locked || !!readError) && styles.btnDisabled,
                        ]}
                        disabled={locked || !!readError}
                        onPress={() => begin(item)}
                      >
                        <Icon
                          name="pen"
                          size={14}
                          color={
                            isDef ? stitchTokens.gold : stitchTokens.wineDark
                          }
                        />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Xóa địa chỉ ${index + 1}`}
                        style={({ pressed }) => [
                          styles.iconCircleBtn,
                          isDef
                            ? styles.iconCircleBtnOnWine
                            : styles.iconCircleBtnDelete,
                          pressed && styles.btnPressed,
                          (locked || !!readError) && styles.btnDisabled,
                        ]}
                        disabled={locked || !!readError}
                        onPress={() => {
                          setError("");
                          setDeleting(item);
                        }}
                      >
                        <Icon
                          name="trash"
                          size={14}
                          color={
                            isDef ? stitchTokens.lightPink : stitchTokens.crimson
                          }
                        />
                      </Pressable>
                    </View>
                  </View>

                  {/* Recipient + Phone */}
                  <View style={styles.recipientLine}>
                    <AppText
                      style={[
                        styles.recipientName,
                        isDef && styles.recipientNameOnWine,
                      ]}
                    >
                      {item.recipientName}
                    </AppText>
                    <AppText
                      style={[
                        styles.phoneInline,
                        isDef && styles.phoneInlineOnWine,
                      ]}
                    >
                      · {item.phone}
                    </AppText>
                  </View>

                  {/* Address Detail */}
                  <AppText
                    style={[
                      styles.addressDetail,
                      isDef && styles.addressDetailOnWine,
                    ]}
                  >
                    {item.detail}
                  </AppText>

                  {/* Bottom Row: Locality + Set Default */}
                  <View
                    style={[
                      styles.cardBottomRow,
                      isDef && styles.cardBottomRowOnWine,
                    ]}
                  >
                    <View style={styles.localityInline}>
                      <Icon
                        name="pin"
                        size={13}
                        color={isDef ? stitchTokens.gold : stitchTokens.wine}
                      />
                      <AppText
                        style={[
                          styles.localityInlineText,
                          isDef && styles.localityInlineTextOnWine,
                        ]}
                      >
                        {localityLabel}
                      </AppText>
                    </View>

                    {!isDef ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Đặt địa chỉ ${index + 1} làm mặc định`}
                        style={({ pressed }) => [
                          styles.setDefaultPill,
                          pressed && styles.btnPressed,
                          (locked || !!readError) && styles.btnDisabled,
                        ]}
                        disabled={locked || !!readError}
                        onPress={() =>
                          start(`/me/addresses/${item.id}/default`, "POST", {
                            expectedBookVersion: book.data!.version,
                          })
                        }
                      >
                        <Icon
                          name="check"
                          size={12}
                          color={stitchTokens.wine}
                        />
                        <AppText style={styles.setDefaultPillText}>
                          Đặt mặc định
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={locked || !!readError || itemCount >= 10}
            onPress={() => begin()}
            style={({ pressed }) => [
              styles.addAddressCta,
              (locked || !!readError || itemCount >= 10) &&
                styles.addAddressCtaDisabled,
              pressed && styles.btnPressed,
            ]}
          >
            <Icon name="plus" size={18} color={stitchTokens.gold} />
            <AppText kind="bold" style={styles.addAddressCtaText}>
              Thêm địa chỉ mới
            </AppText>
          </Pressable>

          {itemCount >= 10 ? (
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
        message={
          deleting
            ? `Xóa địa chỉ của ${deleting.recipientName} (${deleting.phone}) — ${deleting.detail}.\n\nThông tin đã chốt trong các giao dịch trước vẫn được giữ. Nếu xóa địa chỉ mặc định, địa chỉ lưu sớm nhất còn lại sẽ thay thế.`
            : "Thông tin đã chốt trong giao dịch vẫn được giữ."
        }
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: stitchTokens.white,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.whiteAlpha14,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  countPillText: {
    color: stitchTokens.gold,
    fontWeight: "700",
  },
  heroHeader: {
    gap: 4,
    marginBottom: space.md,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  heroSub: {
    color: stitchTokens.gold,
  },
  listStack: {
    gap: space.md,
  },
  addressCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addressCardDefault: {
    backgroundColor: stitchTokens.wine,
    borderWidth: 1.5,
    borderColor: stitchTokens.gold,
    shadowOpacity: 0.16,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  cardIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  defaultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  defaultPillText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  indexPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wineAlpha08,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  indexPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  iconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.creamBg,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleBtnOnWine: {
    backgroundColor: stitchTokens.whiteAlpha14,
    borderColor: stitchTokens.goldAlpha40,
  },
  iconCircleBtnDelete: {
    backgroundColor: stitchTokens.flashRedBg,
    borderColor: stitchTokens.flashRedBg,
  },
  recipientLine: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
  },
  recipientName: {
    fontSize: 16.5,
    fontWeight: "700",
    color: colors.ink,
  },
  recipientNameOnWine: {
    color: stitchTokens.gold,
  },
  phoneInline: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.muted,
  },
  phoneInlineOnWine: {
    color: stitchTokens.goldLight,
  },
  addressDetail: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  addressDetailOnWine: {
    color: stitchTokens.white,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.creamBg,
  },
  cardBottomRowOnWine: {
    borderTopColor: stitchTokens.whiteAlpha14,
  },
  localityInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  localityInlineText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.muted,
  },
  localityInlineTextOnWine: {
    color: stitchTokens.gold,
  },
  setDefaultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
  },
  setDefaultPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  addAddressCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
    paddingHorizontal: space.lg,
    marginTop: space.xs,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addAddressCtaDisabled: {
    opacity: 0.45,
  },
  addAddressCtaText: {
    color: stitchTokens.gold,
    fontSize: 15,
  },
  btnPressed: {
    opacity: 0.78,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  formGroupCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    borderRadius: 16,
    padding: 16,
    gap: space.md,
    shadowColor: stitchTokens.wineDark,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  formGroupHeader: {
    borderBottomWidth: 1,
    borderColor: stitchTokens.creamBg,
    paddingBottom: 8,
  },
  formGroupTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.5,
  },
  formGroupBody: {
    gap: space.md,
  },
});
