import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View, type ScrollView } from "react-native";
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
  Icon,
  Notice,
  Screen,
  StatePanel,
  colors,
  space,
  stitchTokens,
  WebBrandLogo,
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
  "Thông tin sách",
  "Ảnh bản sách",
  "Tình trạng",
  "Bán hoặc đổi",
  "Kiểm tra",
] as const;

const stepHelp = [
  "Chọn đầu sách đã có, hoặc bổ sung thông tin như trên bìa.",
  "Tải từ 1 đến 8 ảnh thực tế của cuốn sách bạn đang giữ.",
  "Mô tả chân thực tình trạng sách để người đọc sau an tâm.",
  "Thiết lập giá bán hoặc giá trị quy đổi và phương thức giao nhận.",
  "Xem lại toàn bộ thông tin trước khi lưu hoặc gửi duyệt.",
] as const;

const checkMessage =
  "Có thông tin cần bổ sung. Kiểm tra các mục được ghi chú bên dưới.";

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
  const [step, setStep] = useState(editableListing(initial) ? 0 : 4),
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

  // Price suggestion lives here so it survives step changes
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
        {
          method: "POST",
          headers: { "Idempotency-Key": Crypto.randomUUID() },
          body: JSON.stringify(input),
        },
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

  const checkClearedHere =
    error === checkMessage &&
    (step < 5 ? !stepFields[step]?.some((k) => errors[k]) : true);

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
    if (!dirty && !submit && !retry) {
      setMessage("Bản nháp đã lưu. Bạn có thể hoàn thiện sau.");
      return;
    }
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
      const isStopped = intent.current.stopped;
      const fresh = await runListingIntent(client, intent.current);
      await reconcile(fresh, !isStopped);
      const wasSubmit = intent.current.submitted;
      intent.current = null;
      setEditingApproved(false);
      setReviseConfirm(false);
      setUncertain(false);
      setDeclared(false);
      setMessage(
        isStopped
          ? "Đã tải trạng thái mới nhất. Nội dung bạn đang sửa vẫn được giữ; kiểm tra lại trước khi gửi."
          : wasSubmit
            ? "Đã gửi duyệt. Bạn có thể quay lại để xem kết quả."
            : "Bản nháp đã lưu. Bạn có thể hoàn thiện sau.",
      );
      if (wasSubmit) go(4);
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

  const ids = form.mediaIds;
  const navLocked = busy || uncertain || lifecyclePending;
  const canSave = editable && !approvedEdit;
  const hasPrimary = step < 4 || editable;

  const nextStepTitle =
    step < 4
      ? "Tiếp theo"
      : approvedEdit
        ? "Gửi bản sửa để duyệt lại"
        : "Lưu và gửi duyệt";

  // Footer Navigation Bar (Stitch Sticky Bottom Action Bar)
  const footer =
    hasPrimary || canSave ? (
      <ActionBar note={canSave && dirty ? "Có thay đổi chưa lưu." : undefined}>
        {step > 0 && (editable || step < 5) ? (
          <Button
            key="prev"
            secondary
            title="Trước"
            disabled={navLocked}
            onPress={() => go(step - 1)}
          />
        ) : null}
        {canSave ? (
          <Button
            key="save"
            secondary
            title="Lưu nháp"
            busy={busy}
            disabled={locked || retryAvailable}
            onPress={() => void save()}
          />
        ) : null}
        {step < 4 ? (
          <Button
            key="next"
            title={nextStepTitle}
            disabled={navLocked}
            wine
            onPress={() => go(step + 1)}
          />
        ) : hasPrimary && step === 4 ? (
          <Button
            key="submit"
            title={
              approvedEdit ? "Gửi bản sửa để duyệt lại" : "Lưu và gửi duyệt"
            }
            disabled={locked || retryAvailable}
            busy={busy}
            wine
            onPress={() =>
              approvedEdit ? setReviseConfirm(true) : void save(true)
            }
          />
        ) : null}
      </ActionBar>
    ) : undefined;

  return (
    <Screen scrollRef={scroll} footer={footer}>
      {/* Top Header & Dismiss Bar */}
      <View style={{ gap: space.sm }}>
        <BackAction
          title="Về sách của tôi"
          disabled={busy}
          onPress={() =>
            dirty || uncertain || catalogDirty || lifecyclePending
              ? setLeave(true)
              : onBack()
          }
        />

        {/* Slip Header (Web Match) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: space.xs,
            borderBottomWidth: 1,
            borderColor: stitchTokens.peachBorder,
            marginTop: space.xs,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                backgroundColor: stitchTokens.wine,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <WebBrandLogo scale={0.5} />
            </View>
            <View
              style={{
                width: 1,
                height: 18,
                backgroundColor: stitchTokens.peachBorder,
                marginHorizontal: 1,
              }}
            />
            <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 11, fontWeight: "500" }}>
              Phiếu thông tin sách
            </AppText>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: stitchTokens.darkRed,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                transform: [{ rotate: "-2deg" }],
              }}
            >
              <AppText
                kind="small"
                style={{
                  color: stitchTokens.darkRed,
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 1,
                }}
              >
                {base.state.moderation === "Draft"
                  ? "BẢN NHÁP"
                  : moderationLabel[base.state.moderation]?.toLocaleUpperCase("vi") ?? "BẢN NHÁP"}
              </AppText>
            </View>
          </View>
        </View>

        {/* 5-Step Stepper Tabs */}
        <StepNav
          labels={stepLabels}
          current={step}
          states={stepLabels.map((_, i) => {
            if (i === 4) {
              if (base.state.moderation === "Approved") return "done";
              if (base.state.moderation === "PendingReview") return "review";
              if (base.state.moderation === "Rejected") return "missing";
              return declared ? "done" : "missing";
            }
            return stepComplete(form, photoList, i) ? "done" : "missing";
          })}
          disabled={navLocked}
          onSelect={go}
        />

        {/* Step Indicator & Headings */}
        <View style={{ gap: 2, marginTop: space.xs }}>
          <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontWeight: "600" }}>
            {`Bước ${step + 1}/5`}
          </AppText>
          <AppText
            kind="heading"
            color={stitchTokens.wineDark}
            accessibilityRole="header"
            style={{ fontSize: 20 }}
          >
            {stepLabels[step]}
          </AppText>
          <AppText kind="small" color={stitchTokens.warmUmber} style={{ fontSize: 12 }}>
            {stepHelp[step]}
          </AppText>
        </View>
      </View>

      {/* Moderation Notices */}
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

      {/* STEP 0 (01: Thông tin đầu sách) */}
      <View style={{ display: step === 0 ? "flex" : "none" }}>
        <View style={styles.formWhiteCard}>
          {form.bookId ? (
            <View style={{ gap: space.md }}>
              <BookIdentity
                id={form.bookId}
                onEdit={() => setForm((f) => ({ ...f, bookId: "" }))}
              />
              <Button
                title="Tiếp tục: Ảnh bản sách →"
                disabled={locked}
                wine
                onPress={() => go(1)}
              />
            </View>
          ) : (
            <>
              <CatalogPicker
                selected={form.bookId}
                onDirtyChange={setCatalogDirty}
                disabled={locked}
                onSelect={(bookId) => setForm((f) => ({ ...f, bookId }))}
              />
              {errors.bookId ? <Notice tone="error">{errors.bookId}</Notice> : null}
            </>
          )}
        </View>
      </View>

      {/* STEP 1 (02: Ảnh bản sách) */}
      {step === 1 ? (
        <View style={styles.formWhiteCard}>
          {form.bookId ? <BookIdentity id={form.bookId} /> : null}

          {/* Stitch Section 2: Photo Grid */}
          <View style={{ gap: space.md, marginTop: space.xs }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <AppText
                kind="label"
                color={stitchTokens.wine}
                style={{ fontWeight: "700", letterSpacing: 0.5 }}
              >
                HÌNH ẢNH THỰC TẾ ẤN BẢN
              </AppText>
              <AppText
                kind="small"
                color={stitchTokens.subtleGray}
                style={{ fontWeight: "600" }}
              >
                {`Đã tải ${ids.length}/8 ảnh`}
              </AppText>
            </View>

            <AppText kind="small" color={stitchTokens.subtleGray}>
              Chụp bìa, gáy và các góc thể hiện tình trạng thật. JPEG, PNG hoặc WebP ≤ 10 MB.
              Ảnh đầu tiên được dùng làm ảnh bìa chính.
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
            {errors.mediaIds ? (
              <Notice tone="error">{errors.mediaIds}</Notice>
            ) : null}

            {/* 3-Column Photo Grid */}
            <View
              ref={anchor("mediaIds")}
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: space.sm,
              }}
            >
              {photos.data?.map((item) => {
                const isSelected = ids.includes(item.id);
                const isCover = ids[0] === item.id;

                return (
                  <View
                    key={item.id}
                    style={{
                      width: "31.3%",
                      backgroundColor: stitchTokens.warmIvory,
                      borderRadius: 10,
                      borderWidth: isCover ? 2 : 1,
                      borderColor: isCover ? stitchTokens.wine : stitchTokens.borderWarm,
                      padding: 6,
                      gap: 6,
                    }}
                  >
                    <Photo
                      item={item}
                      foreground={foreground}
                      selected={isSelected}
                      disabled={locked || (!isSelected && ids.length >= 8)}
                      onToggle={() =>
                        setForm((f) => ({
                          ...f,
                          mediaIds: f.mediaIds.includes(item.id)
                            ? f.mediaIds.filter((id) => id !== item.id)
                            : [...f.mediaIds, item.id],
                        }))
                      }
                    />

                    {isSelected ? (
                      <View style={{ gap: 4 }}>
                        {isCover ? (
                          <View
                            style={{
                              backgroundColor: stitchTokens.wine,
                              paddingVertical: 3,
                              paddingHorizontal: 4,
                              borderRadius: 4,
                              alignItems: "center",
                            }}
                          >
                            <AppText
                              kind="small"
                              color={stitchTokens.gold}
                              style={{ fontSize: 9, fontWeight: "700" }}
                            >
                              BÌA CHÍNH
                            </AppText>
                          </View>
                        ) : (
                          <Button
                            secondary
                            title="Làm bìa"
                            disabled={locked}
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
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {/* Upload Slot Card */}
              {editable && ids.length < 8 ? (
                <Pressable
                  disabled={locked || retryAvailable}
                  onPress={() => void send()}
                  accessibilityLabel="Thêm ảnh khảo chứng"
                  style={({ pressed }) => [
                    {
                      width: "31.3%",
                      minHeight: 140,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: stitchTokens.peachBorder,
                      backgroundColor: stitchTokens.roseWarmSurface,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: 8,
                    },
                    (pressed || locked) && { opacity: 0.6 },
                  ]}
                >
                  <Icon name="camera" size={24} color={stitchTokens.wine} />
                  <AppText
                    kind="small"
                    color={stitchTokens.wine}
                    style={{ fontWeight: "700", fontSize: 11, textAlign: "center" }}
                  >
                    + Thêm ảnh
                  </AppText>
                  <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 9 }}>
                    Tối đa 8 ảnh
                  </AppText>
                </Pressable>
              ) : null}
            </View>

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
          </View>
        </View>
      ) : null}

      {/* STEP 2 (03: Tình trạng) */}
      {step === 2 ? (
        <View style={styles.formWhiteCard}>
          {form.bookId ? <BookIdentity id={form.bookId} /> : null}

          {/* Stitch Section 3: Book Condition Rating */}
          <ConditionFields
            form={form}
            onChange={setForm}
            errors={errors}
            disabled={locked}
            anchor={anchor}
          />
        </View>
      ) : null}

      {/* STEP 3 (04: Bán hoặc đổi) */}
      {step === 3 ? (
        <View style={styles.formWhiteCard}>
          {form.bookId ? <BookIdentity id={form.bookId} /> : null}

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
              hasPhoto={photoList.some((m) => m.status === "Ready")}
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
        </View>
      ) : null}

      {/* STEP 4 (05: Kiểm tra) */}
      {step === 4 ? (
        <View style={styles.formWhiteCard}>
          {base.state.moderation !== "Draft" ? (
            <View
              style={{
                backgroundColor: stitchTokens.warmIvory,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
                padding: space.md,
                gap: space.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Icon
                  name={
                    base.state.moderation === "Approved"
                      ? "check"
                      : base.state.moderation === "PendingReview"
                        ? "info"
                        : "tune"
                  }
                  size={20}
                  color={
                    base.state.moderation === "Approved"
                      ? colors.success
                      : base.state.moderation === "PendingReview"
                        ? stitchTokens.wine
                        : colors.rustText
                  }
                />
                <AppText kind="heading" color={stitchTokens.wineDark}>
                  {moderationLabel[base.state.moderation] ?? "Đang cập nhật"}
                </AppText>
              </View>

              <AppText color={stitchTokens.subtleGray} kind="small">
                {base.state.moderation === "PendingReview"
                  ? "Nội dung bài đăng đang được kiểm duyệt bởi đội ngũ Lật Lại."
                  : base.state.moderation === "Approved"
                    ? "Ấn bản của bạn đã được kiểm duyệt và sẵn sàng công khai trên kệ sách Lật Lại."
                    : base.state.moderation === "Rejected"
                      ? `Bài đăng cần chỉnh sửa: ${base.latestDecision?.reason ?? "Chưa rõ lý do"}.`
                      : "Bài đăng đang ở chế độ bản nháp."}
              </AppText>
            </View>
          ) : null}
          <BookIdentity id={form.bookId} />

          <FulfillmentFields
            value={form.fulfillment}
            disabled
            summary
            onChange={() => {}}
          />

          {/* Photos Preview */}
          <View style={{ gap: space.sm }}>
            <AppText
              kind="label"
              color={stitchTokens.wine}
              style={{ fontWeight: "700", letterSpacing: 0.5 }}
            >
              HÌNH ẢNH ĐÃ CHỌN ({ids.length})
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {ids
                .map((id) => photos.data?.find((m) => m.id === id))
                .map((item) =>
                  item ? (
                    <View key={item.id} style={{ width: "31.3%" }}>
                      <Photo
                        item={item}
                        foreground={foreground}
                        selected
                        disabled
                        onToggle={() => {}}
                      />
                    </View>
                  ) : null,
                )}
            </View>
          </View>

          {/* Overview Specs Table */}
          <View
            style={{
              backgroundColor: stitchTokens.warmIvory,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: stitchTokens.borderWarm,
              padding: space.md,
              gap: space.sm,
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
                    ? "Có, đọc rõ"
                    : "Không",
              ],
              [
                "Thiếu trang",
                form.hasMissingPages === null
                  ? "Chưa trả lời"
                  : form.hasMissingPages
                    ? "Có thiếu trang"
                    : "Không thiếu",
              ],
              [
                "Thiếu nội dung trọng yếu",
                form.missingEssentialContent === null
                  ? "Chưa trả lời"
                  : form.missingEssentialContent
                    ? "Có thiếu"
                    : "Không thiếu",
              ],
              [
                "Hình thức giao dịch",
                form.mode === "Both"
                  ? "Cả bán & đổi"
                  : form.mode === "Sale"
                    ? "Bán trực tiếp"
                    : form.mode === "Exchange"
                      ? "Đổi Lật-Xu"
                      : "Chưa chọn",
              ],
              ...(form.mode === "Sale" || form.mode === "Both"
                ? [["Giá bán đề xuất", displayPrice(form.salePrice)]]
                : []),
              ...(form.mode === "Exchange" || form.mode === "Both"
                ? [["Giá trị đổi / đối chiếu", displayPrice(form.exchangeValue)]]
                : []),
            ].map(([lbl, val]) => (
              <View
                key={lbl}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderColor: stitchTokens.parchment,
                }}
              >
                <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontWeight: "600" }}>
                  {lbl}
                </AppText>
                <AppText
                  kind="small"
                  color={stitchTokens.wineDark}
                  style={{ fontWeight: "700", maxWidth: "60%", textAlign: "right" }}
                >
                  {val || "Chưa điền"}
                </AppText>
              </View>
            ))}
          </View>

          {/* Description */}
          <View
            style={{
              backgroundColor: stitchTokens.warmIvory,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: stitchTokens.borderWarm,
              padding: space.md,
              gap: space.xs,
            }}
          >
            <AppText
              kind="label"
              color={stitchTokens.wine}
              style={{ fontWeight: "700" }}
            >
              LỜI NHẮN GỬI NGƯỜI ĐỌC SAU
            </AppText>
            <AppText color={stitchTokens.wineDark}>
              {form.description || "Chưa có lời nhắn về cuốn sách."}
            </AppText>
          </View>

          {base.catalogStatus === "Pending" ? (
            <Notice tone="info">
              Đầu sách đang chờ xác nhận. Bạn có thể gửi bài; việc duyệt bài sẽ
              chờ thông tin đầu sách được xác nhận.
            </Notice>
          ) : null}

          <Notice tone="info">
            Đăng bài miễn phí. Mỗi tài khoản có tối đa 5 bài đang hiển thị trên
            trang chủ hoặc chờ admin duyệt. Bản nháp, bài bị từ chối, bài đã duyệt
            nhưng đang ẩn, bài đã bán/đổi hoặc đã lưu trữ không tính vào giới hạn.
          </Notice>

          {/* Stitch Section 5: Trust Commitment Checkbox */}
          {editable ? (
            <View
              ref={anchor("ownershipDeclared")}
              style={{
                backgroundColor: stitchTokens.warmIvory,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: errors.ownershipDeclared
                  ? colors.rustText
                  : stitchTokens.peachBorder,
                padding: space.md,
                gap: space.xs,
              }}
            >
              <Checkbox
                title="Tôi xác nhận sở hữu ấn bản này và cam kết thông tin trung thực theo quy chuẩn thẩm định của cộng đồng Lật Lại."
                checked={declared}
                disabled={locked}
                onPress={() => setDeclared((v) => !v)}
              />
              <AppText
                kind="small"
                color={stitchTokens.subtleGray}
                style={{ marginLeft: 32, fontSize: 11 }}
              >
                Được bảo chứng bồi hoàn nếu sách không đúng mô tả.
              </AppText>
              {errors.ownershipDeclared ? (
                <Notice tone="error">{errors.ownershipDeclared}</Notice>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Extra Action Buttons & Lifecycle Actions */}
      <LifecycleActions
        value={base}
        disabled={dirty || busy || uncertain || catalogDirty || editingApproved}
        reconcile={reconcile}
        onBack={onBack}
        onPending={setLifecyclePending}
      />

      {/* Confirmation Dialogs */}
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

const styles = StyleSheet.create({
  formWhiteCard: {
    backgroundColor: stitchTokens.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    padding: space.md,
    gap: space.md,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
});
