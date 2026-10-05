import { useEffect, useRef, useState } from "react";
import { Platform, View, type ScrollView } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { useSession } from "../../core/session/session-provider";
import {
  ActionBar,
  AppText,
  BackAction,
  Button,
  Checkbox,
  ConfirmDialog,
  Notice,
  Screen,
  StatePanel,
  colors,
  space,
} from "../../core/ui";
import { mediaPage, privateDraft, type Draft, type Media } from "./contracts";
import { Photo, photoError, useForeground } from "./draft-media";
import {
  fromContent,
  toContent,
  validateForm,
  errorStep,
  firstError,
  stepComplete,
  stillFailing,
  stepFields,
  editableListing,
  moderationLabel,
  displayPrice,
  type Errors,
} from "./listing-form";
import {
  listingIntent,
  runListingIntent,
  type ListingIntent,
} from "./listing-command";
import { BookIdentity, CatalogPicker } from "./catalog-picker";
import {
  ConditionFields,
  PricingFields,
  createAnchors,
} from "./listing-fields";
import { photoBytes } from "./photo-bytes";
import { uploadPhoto, type UploadAttempt } from "./upload";
import { LifecycleActions } from "./lifecycle-actions";
import { FulfillmentFields } from "./fulfillment-fields";
import { StepNav } from "./step-nav";
import { conditionLabels } from "./book-condition";
import {
  assistError,
  decisionFor,
  failLoading,
  finishLoading,
  startLoading,
  priceSuggestion,
  suggestionInput,
  suggestionKey,
  type AssistState,
} from "./price-assist";
import { PriceSuggestionPanel } from "./price-suggestion-panel";

const stepLabels = [
  "Đầu sách",
  "Ảnh và tình trạng",
  "Bán hoặc đổi",
  "Kiểm tra",
] as const;
const checkMessage =
  "Có thông tin cần bổ sung. Kiểm tra các mục được ghi chú bên dưới.";
const titles = [
  "Bắt đầu từ đúng cuốn sách.",
  "Những dấu đã qua tay bạn.",
  "Chọn cách chuyền sách.",
  "Trước khi đến người đọc sau.",
];
export function DraftEditor({
  initial,
  onBack,
}: {
  initial: Draft;
  onBack: () => void;
}) {
  const { client, state } = useSession(),
    cache = useQueryClient(),
    foreground = useForeground();
  const [base, setBase] = useState(initial),
    [form, setForm] = useState(() =>
      fromContent(initial.currentRevision.content),
    );
  const [step, setStep] = useState(editableListing(initial) ? 0 : 3),
    [declared, setDeclared] = useState(false),
    [check, setCheck] = useState<{ errors: Errors; submit: boolean }>({
      errors: {},
      submit: false,
    });
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [leave, setLeave] = useState(false),
    [reloadOpen, setReloadOpen] = useState(false),
    [retryAvailable, setRetryAvailable] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [editingApproved, setEditingApproved] = useState(false),
    [reviseConfirm, setReviseConfirm] = useState(false),
    [lifecyclePending, setLifecyclePending] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [catalogDirty, setCatalogDirty] = useState(false);
  // Price suggestion lives here so it survives step changes; it is advisory and
  // never part of the saved form except as the optional decision record.
  const [assist, setAssist] = useState<AssistState>({ status: "idle" });
  const assistToken = useRef(0);
  const go = (value: number) => {
    setStep(value);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  // Field wrappers registered by the steps; a failed check scrolls to the first error.
  const [{ anchor, get: anchored }] = useState(createAnchors);
  const [jump, setJump] = useState<{ field: keyof Errors } | null>(null);
  useEffect(() => {
    const node = jump && anchored(jump.field);
    const view = scroll.current as
      (ScrollView & { getInnerViewRef?: () => View | null }) | null;
    if (!node || !view) return;
    const frame = requestAnimationFrame(() => {
      const inner = view.getInnerViewRef?.();
      if (inner)
        node.measureLayout(
          inner,
          (_x, y) =>
            view.scrollTo({ y: Math.max(0, y - space.lg), animated: true }),
          () => {},
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, anchored]);
  const intent = useRef<ListingIntent | null>(null),
    attempt = useRef<UploadAttempt | null>(null),
    busyRef = useRef(false);
  const editable =
    state.status === "authenticated" &&
    state.user.status === "ACTIVE" &&
    (editableListing(base) ||
      (editingApproved &&
        base.state.moderation === "Approved" &&
        base.state.trade === "Available" &&
        base.state.visibility !== "Removed" &&
        !base.state.deletedAt));
  const approvedEdit = editable && base.state.moderation === "Approved";
  const locked = !editable || busy || uncertain || lifecyclePending;
  const dirty =
    JSON.stringify(form) !==
    JSON.stringify(fromContent(base.currentRevision.content));
  const navigation = useNavigation();
  const pendingNavigation = useRef<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  usePreventRemove(
    dirty || busy || uncertain || catalogDirty || lifecyclePending,
    ({ data }) => {
      if (!busy) {
        pendingNavigation.current = data.action;
        setLeave(true);
      }
    },
  );
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      (!dirty && !uncertain && !catalogDirty && !lifecyclePending)
    )
      return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uncertain, catalogDirty, lifecyclePending]);
  const photos = useQuery({
    queryKey: ["draft-media", base.id],
    queryFn: async () => {
      const all: Media[] = [];
      let cursor: string | null = null;
      do {
        const page: { items: Media[]; nextCursor: string | null } =
          await client.request(
            `/me/listings/${base.id}/media?limit=50${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
            mediaPage,
          );
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && all.length < 100);
      return all;
    },
    enabled: foreground,
    refetchInterval: (q) =>
      foreground && q.state.data?.some((m) => m.status === "Processing")
        ? 4000
        : false,
  });
  const latest = useQuery({
    queryKey: ["listing-status", base.id],
    queryFn: () => client.request(`/me/listings/${base.id}`, privateDraft),
    enabled: foreground && !dirty && !busy && !uncertain && !lifecyclePending,
    refetchInterval:
      foreground && base.state.moderation === "PendingReview" ? 15000 : false,
  });
  // Adopt only newer state while clean; background reads must never discard edits.
  if (
    latest.data &&
    !dirty &&
    !busy &&
    !uncertain &&
    !lifecyclePending &&
    latest.data.version > base.version
  ) {
    setBase(latest.data);
    setForm(fromContent(latest.data.currentRevision.content));
    setDeclared(false);
    // A newer server state (e.g. review result) supersedes the last action's note.
    setMessage("");
  }
  const photoList = photos.data ?? [];
  const assistKey = suggestionKey(base.id, form);
  const askPrice = async () => {
    const input = suggestionInput(form);
    if (!input.bookId) return;
    const token = ++assistToken.current;
    setAssist((s) => startLoading(s, assistKey, token));
    try {
      const result = await client.request(
        `/listings/${base.id}/price-suggestions`,
        priceSuggestion,
        { method: "POST", body: JSON.stringify(input) },
        30000,
      );
      setAssist((s) => finishLoading(s, token, base.id, result));
    } catch (e) {
      setAssist((s) => failLoading(s, token, assistError(e)));
    }
  };
  const errors = stillFailing(
    check.errors,
    validateForm(form, photoList, declared, check.submit),
  );
  // The check summary belongs to the step that still has flagged fields.
  const checkClearedHere =
    error === checkMessage && !stepFields[step].some((k) => errors[k]);
  const reconcile = async (fresh: Draft, replaceForm: boolean) => {
    setBase(fresh);
    if (replaceForm) setForm(fromContent(fresh.currentRevision.content));
    cache.setQueryData(["listing-status", base.id], fresh);
    cache.setQueryData(["draft", base.id], fresh);
    await cache.invalidateQueries({ queryKey: ["drafts"] });
    await cache.invalidateQueries({ queryKey: ["public-shelf"] });
    await cache.invalidateQueries({ queryKey: ["public-listing", base.id] });
  };
  const save = async (submit = false, retry = false) => {
    if (
      busyRef.current ||
      lifecyclePending ||
      (!retry && (!editable || (approvedEdit && !submit)))
    )
      return;
    if (!retry) {
      const problems = validateForm(form, photos.data ?? [], declared, submit);
      setCheck({ errors: problems, submit });
      if (Object.keys(problems).length) {
        setError(checkMessage);
        go(errorStep(problems));
        const field = firstError(problems);
        if (field) setJump({ field });
        return;
      }
      intent.current = listingIntent(
        base.id,
        base.version,
        toContent(form),
        submit,
        Crypto.randomUUID,
        approvedEdit,
        decisionFor(assist, assistKey, form),
      );
    }
    if (!intent.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const stopped = intent.current.stopped;
      const fresh = await runListingIntent(client, intent.current);
      await reconcile(fresh, !stopped);
      const wasSubmit = intent.current.submitted;
      intent.current = null;
      setEditingApproved(false);
      setReviseConfirm(false);
      setUncertain(false);
      setDeclared(false);
      setMessage(
        stopped
          ? "Đã tải trạng thái mới nhất. Nội dung bạn đang sửa vẫn được giữ; kiểm tra lại trước khi gửi."
          : wasSubmit
            ? "Đã gửi duyệt. Bạn có thể quay lại để xem kết quả."
            : "Bản nháp đã lưu. Bạn có thể hoàn thiện sau.",
      );
      if (wasSubmit) go(3);
    } catch (e) {
      setStopped(!!intent.current?.stopped);
      setUncertain(true);
      setError(photoError(e));
      scroll.current?.scrollTo({ y: 0, animated: false });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const send = async (retry = false) => {
    if (busyRef.current || !editable || uncertain || lifecyclePending) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!retry) {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
          allowsMultipleSelection: false,
        });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        if ((asset.fileSize ?? 0) > 10_000_000) {
          setError("Ảnh quá lớn. Chọn ảnh không quá 10 MB.");
          return;
        }
        const bytes = await photoBytes(asset.uri);
        if (bytes.length === 0 || bytes.length > 10_000_000) {
          setError("Chọn ảnh có dung lượng từ 1 byte đến 10 MB.");
          return;
        }
        const mime = asset.mimeType;
        if (
          !mime ||
          !["image/jpeg", "image/png", "image/webp"].includes(mime)
        ) {
          setError(
            "Chọn ảnh JPEG, PNG hoặc WebP. Ảnh HEIC cần được xuất sang JPEG trước.",
          );
          return;
        }
        const hash = await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          bytes,
        );
        attempt.current = {
          listingId: base.id,
          expectedVersion: base.version,
          mimeType: mime,
          bytes,
          sha256: Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0"),
          ).join(""),
          createKey: Crypto.randomUUID(),
          uploadKey: Crypto.randomUUID(),
          finalizeKey: Crypto.randomUUID(),
        };
      }
      if (!attempt.current) return;
      const m = await uploadPhoto(client, attempt.current);
      setForm((f) => ({
        ...f,
        mediaIds:
          f.mediaIds.includes(m.id) || f.mediaIds.length >= 8
            ? f.mediaIds
            : [...f.mediaIds, m.id],
      }));
      attempt.current = null;
      setMessage(
        approvedEdit
          ? "Ảnh đã tải lên. Gửi bản sửa để lưu lựa chọn ảnh mới."
          : "Ảnh đã tải lên và đang được kiểm tra. Lưu nháp để giữ lựa chọn ảnh.",
      );
    } catch (e) {
      setError(photoError(e));
    } finally {
      setRetryAvailable(!!attempt.current);
      await photos.refetch();
      busyRef.current = false;
      setBusy(false);
    }
  };

  const reload = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const fresh = await client.request(
        `/me/listings/${base.id}`,
        privateDraft,
      );
      await reconcile(fresh, true);
      intent.current = null;
      attempt.current = null;
      setRetryAvailable(false);
      setUncertain(false);
      setCheck({ errors: {}, submit: false });
      setDeclared(false);
      setError("");
      setReloadOpen(false);
      setEditingApproved(false);
    } catch (e) {
      setError(photoError(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const status =
    base.state.visibility === "Removed"
      ? "Đã gỡ"
      : (moderationLabel[base.state.moderation] ?? "Đang cập nhật");
  const ids = form.mediaIds;
  const navLocked = busy || uncertain || lifecyclePending;
  const canSave = editable && !approvedEdit;
  const hasPrimary = step < 3 || editable;
  // Save and step actions stay above the keyboard instead of below long fields.
  const footer =
    hasPrimary || canSave ? (
      <ActionBar note={canSave && dirty ? "Có thay đổi chưa lưu." : undefined}>
        {canSave ? (
          <Button
            key="save"
            secondary
            title="Lưu nháp"
            busy={busy}
            disabled={locked || !dirty || retryAvailable}
            onPress={() => void save()}
          />
        ) : null}
        {step < 3 ? (
          <Button
            key="next"
            title="Tiếp tục"
            disabled={navLocked}
            onPress={() => go(step + 1)}
          />
        ) : hasPrimary ? (
          <Button
            key="submit"
            title={
              approvedEdit ? "Gửi bản sửa để duyệt lại" : "Lưu và gửi duyệt"
            }
            disabled={locked || retryAvailable}
            busy={busy}
            onPress={() =>
              approvedEdit ? setReviseConfirm(true) : void save(true)
            }
          />
        ) : null}
      </ActionBar>
    ) : undefined;
  return (
    <Screen scrollRef={scroll} footer={footer}>
      <BackAction
        title="Về sách của tôi"
        disabled={busy}
        onPress={() =>
          dirty || uncertain || catalogDirty || lifecyclePending
            ? setLeave(true)
            : onBack()
        }
      />
      <View style={{ gap: space.sm }}>
        <AppText kind="label" color={colors.rustText}>
          CHUẨN BỊ CHUYỀN SÁCH · {status.toLocaleUpperCase("vi")}
        </AppText>
        <StepNav
          labels={stepLabels}
          current={step}
          states={stepLabels.map((_, i) =>
            i === 3
              ? "review"
              : stepComplete(form, photoList, i)
                ? "done"
                : "missing",
          )}
          disabled={navLocked}
          onSelect={go}
        />
        <AppText kind="title" color={colors.forest} accessibilityRole="header">
          {titles[step]}
        </AppText>
      </View>
      {base.latestDecision?.decision === "Reject" ? (
        <Notice tone="warning">
          Lần duyệt trước: {base.latestDecision.reason}
        </Notice>
      ) : null}
      {base.removalReason ? (
        <Notice tone="warning">Lý do gỡ: {base.removalReason}</Notice>
      ) : null}
      {base.state.moderation === "PendingReview" ? (
        <Notice tone="info">
          Nội dung đang được kiểm tra. Bạn có thể xem lại, nhưng chưa thể sửa
          trong lúc chờ duyệt.
        </Notice>
      ) : null}
      {base.state.moderation === "Approved" &&
      base.state.visibility !== "Removed" ? (
        <Notice tone="success">
          Bài đăng đã được duyệt. Sách chỉ hiện trên kệ khi bài đang mở, còn khả
          dụng và tài khoản của bạn đủ điều kiện.
        </Notice>
      ) : null}
      {base.state.visibility === "Hidden" ? (
        <Notice tone="info">
          Bài đang ẩn khỏi kệ. Duyệt bản sửa không tự mở lại bài.
        </Notice>
      ) : null}
      {base.state.moderation === "Approved" &&
      base.state.visibility !== "Removed" &&
      base.state.trade === "Available" &&
      state.status === "authenticated" &&
      state.user.status === "ACTIVE" &&
      !editingApproved ? (
        <Button
          title="Sửa bài đã duyệt"
          disabled={busy || uncertain || lifecyclePending}
          onPress={() => {
            setEditingApproved(true);
            setDeclared(false);
            go(0);
          }}
        />
      ) : null}
      {approvedEdit ? (
        <Notice tone="warning">
          Bản sửa đang giữ trên màn hình. Khi gửi, sách sẽ ngừng công khai để
          chờ duyệt lại. Chưa có lưu nháp riêng cho bản sửa này.
        </Notice>
      ) : null}
      {!editable &&
      !["PendingReview", "Approved"].includes(base.state.moderation) ? (
        <Notice tone="warning">
          Hiện bạn chỉ có thể xem thông tin đã lưu.
        </Notice>
      ) : null}
      {error && !checkClearedHere ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {uncertain ? (
        <>
          <Notice tone="warning">
            Đang giữ yêu cầu vừa gửi. Hãy kiểm tra kết quả trước khi sửa tiếp.
          </Notice>
          <Button
            title={
              stopped
                ? "Kiểm tra trạng thái mới nhất"
                : "Thử lại yêu cầu vừa gửi"
            }
            busy={busy}
            onPress={() => void save(false, true)}
          />
        </>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {latest.error ? (
        <Notice tone="warning">
          Chưa cập nhật được trạng thái mới. Nội dung đang nhập vẫn được giữ.
        </Notice>
      ) : null}
      <View style={{ display: step === 0 ? "flex" : "none", gap: space.lg }}>
        <CatalogPicker
          selected={form.bookId}
          onDirtyChange={setCatalogDirty}
          disabled={locked}
          onSelect={(bookId) => setForm((f) => ({ ...f, bookId }))}
        />
        {errors.bookId ? <Notice tone="error">{errors.bookId}</Notice> : null}
      </View>
      {step === 1 ? (
        <>
          <AppText>
            Chụp bìa, gáy và những phần đã qua sử dụng. Giữ nguyên màu và dấu
            vết để người đọc sau hiểu đúng cuốn sách.
          </AppText>
          <View ref={anchor("mediaIds")}>
            <AppText kind="heading">Ảnh bản sách · {ids.length}/8</AppText>
          </View>
          <AppText kind="small">
            JPEG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh. Ảnh được chọn đầu tiên là
            ảnh bìa.
          </AppText>
          {photos.isPending ? (
            <StatePanel loading title="Đang tải ảnh" />
          ) : null}
          {photos.error ? (
            <StatePanel
              title="Chưa tải được ảnh của bạn"
              action={{
                label: "Tải lại ảnh",
                onPress: () => void photos.refetch(),
              }}
            />
          ) : null}
          {!photos.isPending && photos.data?.length === 0 ? (
            <StatePanel
              title="Cuốn sách còn chờ một tấm ảnh"
              message="Bắt đầu với bìa trước, rồi thêm các góc thể hiện tình trạng thật."
            />
          ) : null}
          {errors.mediaIds ? (
            <Notice tone="error">{errors.mediaIds}</Notice>
          ) : null}
          {photos.data?.map((item) => (
            <View key={item.id}>
              <Photo
                item={item}
                foreground={foreground}
                selected={ids.includes(item.id)}
                disabled={locked || (!ids.includes(item.id) && ids.length >= 8)}
                onToggle={() =>
                  setForm((f) => ({
                    ...f,
                    mediaIds: f.mediaIds.includes(item.id)
                      ? f.mediaIds.filter((id) => id !== item.id)
                      : [...f.mediaIds, item.id],
                  }))
                }
              />
              {ids.includes(item.id) ? (
                <Button
                  secondary
                  title={
                    ids[0] === item.id ? "Ảnh bìa đã chọn" : "Dùng làm ảnh bìa"
                  }
                  disabled={locked || ids[0] === item.id}
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      mediaIds: [
                        item.id,
                        ...f.mediaIds.filter((id) => id !== item.id),
                      ],
                    }))
                  }
                />
              ) : null}
            </View>
          ))}
          {editable ? (
            <Button
              secondary
              title="Chọn ảnh từ thư viện"
              disabled={locked || ids.length >= 8 || retryAvailable}
              onPress={() => void send()}
            />
          ) : null}
          {retryAvailable ? (
            <View style={{ gap: space.sm }}>
              <Button
                secondary
                title="Thử lại ảnh vừa chọn"
                disabled={uncertain || !editable}
                busy={busy}
                onPress={() => void send(true)}
              />
              <Button
                secondary
                title="Bỏ lần tải chưa hoàn tất"
                disabled={busy || uncertain}
                onPress={() => {
                  attempt.current = null;
                  setRetryAvailable(false);
                  setError("");
                  setMessage(
                    "Đã bỏ lần tải đang giữ trên máy. Bạn có thể chọn lại ảnh; ảnh chưa gắn vào bài sẽ được dọn theo thời hạn lưu.",
                  );
                }}
              />
            </View>
          ) : null}
          <View
            style={{
              paddingTop: space.lg,
              borderTopWidth: 1,
              borderColor: colors.rule,
              gap: space.sm,
            }}
          >
            <AppText kind="heading">Tình trạng bản sách</AppText>
            <AppText>
              Mô tả đúng những gì người nhận sẽ thấy khi mở sách.
            </AppText>
          </View>
          <ConditionFields
            form={form}
            onChange={setForm}
            errors={errors}
            disabled={locked}
            anchor={anchor}
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <PricingFields
            form={form}
            onChange={setForm}
            errors={errors}
            disabled={locked}
            anchor={anchor}
          />
          {editable && (form.mode === "Sale" || form.mode === "Both") ? (
            <PriceSuggestionPanel
              form={form}
              state={assist}
              currentKey={assistKey}
              disabled={locked}
              onAsk={() => void askPrice()}
              onApply={(amount) => {
                setForm((f) => ({ ...f, salePrice: String(amount) }));
                setAssist((s) =>
                  s.status === "ready" ? { ...s, appliedPrice: amount } : s,
                );
              }}
            />
          ) : null}
          <FulfillmentFields
            value={form.fulfillment}
            disabled={locked}
            onChange={(fulfillment) => setForm((f) => ({ ...f, fulfillment }))}
          />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <BookIdentity id={form.bookId} />
          <FulfillmentFields
            value={form.fulfillment}
            disabled
            summary
            onChange={() => {}}
          />
          {ids
            .map((id) => photos.data?.find((m) => m.id === id))
            .map((item) =>
              item ? (
                <Photo
                  key={item.id}
                  item={item}
                  foreground={foreground}
                  selected
                  disabled
                  onToggle={() => {}}
                />
              ) : null,
            )}
          <AppText>
            {form.description || "Chưa có lời nhắn về cuốn sách."}
          </AppText>
          <View
            style={{
              gap: space.md,
              paddingVertical: space.lg,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.rule,
            }}
          >
            {[
              [
                "Tình trạng",
                form.condition ? conditionLabels[form.condition] : "Chưa chọn",
              ],
              ["Ruột sách", form.pages],
              ["Bìa và gáy", form.coverNote],
              ["Ghi chú", form.notes],
              ["Phụ kiện", form.accessories],
              [
                "Đọc rõ nội dung",
                form.readable === null
                  ? "Chưa trả lời"
                  : form.readable
                    ? "Có"
                    : "Không",
              ],
              [
                "Thiếu trang",
                form.hasMissingPages === null
                  ? "Chưa trả lời"
                  : form.hasMissingPages
                    ? "Có"
                    : "Không",
              ],
              [
                "Thiếu nội dung trọng yếu",
                form.missingEssentialContent === null
                  ? "Chưa trả lời"
                  : form.missingEssentialContent
                    ? "Có"
                    : "Không",
              ],
              ["Ảnh đã chọn", `${ids.length}/8`],
              [
                "Hình thức",
                form.mode === "Both"
                  ? "Bán hoặc đổi"
                  : form.mode === "Sale"
                    ? "Bán sách"
                    : form.mode === "Exchange"
                      ? "Đổi sách"
                      : "Chưa chọn",
              ],
              ...(form.mode === "Sale" || form.mode === "Both"
                ? [["Giá bán", displayPrice(form.salePrice)]]
                : []),
              ...(form.mode === "Exchange" || form.mode === "Both"
                ? [["Giá trị đổi", displayPrice(form.exchangeValue)]]
                : []),
            ].map(([label, value]) => (
              <View key={label} style={{ gap: space.xs }}>
                <AppText kind="label">{label}</AppText>
                <AppText>{value || "Chưa điền"}</AppText>
              </View>
            ))}
          </View>
          {base.catalogStatus === "Pending" ? (
            <Notice tone="info">
              Đầu sách đang chờ xác nhận. Bạn có thể gửi bài; việc duyệt bài sẽ
              chờ thông tin đầu sách được xác nhận.
            </Notice>
          ) : null}
          {editable ? (
            <>
              <View ref={anchor("ownershipDeclared")} style={{ gap: space.md }}>
                <Checkbox
                  title="Tôi có quyền đăng cuốn sách này; ảnh và mô tả phản ánh trung thực tình trạng sách."
                  checked={declared}
                  disabled={locked}
                  onPress={() => setDeclared((v) => !v)}
                />
                {errors.ownershipDeclared ? (
                  <Notice tone="error">{errors.ownershipDeclared}</Notice>
                ) : null}
              </View>
              <AppText kind="small">
                Sau khi gửi, nội dung sẽ được giữ nguyên trong lúc kiểm duyệt.
                Bài đăng chỉ được duyệt khi thông tin đầy đủ và đạt yêu cầu.
              </AppText>
            </>
          ) : null}
        </>
      ) : null}
      <Button
        secondary
        title="Cập nhật trạng thái đã lưu"
        disabled={busy || uncertain || lifecyclePending}
        onPress={() => (dirty ? setReloadOpen(true) : void reload())}
      />
      <LifecycleActions
        value={base}
        disabled={dirty || busy || uncertain || catalogDirty || editingApproved}
        reconcile={reconcile}
        onBack={onBack}
        onPending={setLifecyclePending}
      />
      <ConfirmDialog
        visible={reviseConfirm}
        title="Gửi bản sửa để duyệt lại?"
        message="Bản hiện tại sẽ ngừng công khai ngay khi gửi thành công. Nội dung mới cần được kiểm duyệt lại trước khi trở lại kệ."
        confirmLabel="Gửi bản sửa"
        busy={busy}
        error={error || undefined}
        onCancel={() => setReviseConfirm(false)}
        onConfirm={() => {
          setReviseConfirm(false);
          void save(true);
        }}
      />
      <ConfirmDialog
        visible={leave}
        title="Rời bài đăng?"
        message={
          uncertain || lifecyclePending
            ? "Kết quả yêu cầu vừa gửi chưa được xác nhận. Khi quay lại, hãy kiểm tra trạng thái đã lưu trước khi thao tác tiếp."
            : "Thông tin chưa lưu sẽ bị bỏ. Ảnh chưa gắn vào bài có thể được dọn sau 24 giờ."
        }
        confirmLabel="Rời bài đăng"
        onCancel={() => {
          pendingNavigation.current = null;
          setLeave(false);
        }}
        onConfirm={() =>
          pendingNavigation.current
            ? navigation.dispatch(pendingNavigation.current)
            : onBack()
        }
      />
      <ConfirmDialog
        visible={reloadOpen}
        title="Tải lại bản đã lưu?"
        message="Thay đổi chưa lưu sẽ bị thay bằng nội dung mới nhất trên máy chủ."
        confirmLabel="Tải lại bản đã lưu"
        busy={busy}
        error={error || undefined}
        onCancel={() => setReloadOpen(false)}
        onConfirm={() => void reload()}
      />
    </Screen>
  );
}
