import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Coins,
  Eye,
  EyeOff,
  ImagePlus,
  Info,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BundleEditor } from "../components/BookBundle";
import { bundleCondition } from "../lib/book-bundle";
import { useSession } from "../hooks/useSession";
import { useActionCooldown } from "../hooks/useActionCooldown";
import { session as apiSession } from "../lib/session";
import { conditions } from "../lib/listing-labels";
import { ROUTES } from "../lib/routes";
import {
  MAX_PHOTOS,
  buildRevisionContent,
  editApprovedBlock,
  formFromListing,
  canToggleVisibility,
  canArchiveListing,
  type Condition,
  type RevisionFormValue,
  validateRevision,
} from "../lib/owner-listing-edit";
import {
  createListingRevision,
  type RevisionPhoto,
} from "../services/listing-revision";
import {
  archiveListing,
  getMyBookIdentity,
  getMyListing,
  getMyPhoto,
  setListingVisibility,
} from "../services/my-listings";
import styles from "./EditListingPage.module.css";

const addressBookSchema = z.object({
  version: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      recipientName: z.string(),
      phone: z.string(),
      serviceAreaCode: z.string(),
      localityCode: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
    }),
  ),
});

type PhotoItem =
  | { key: string; kind: "existing"; id: string }
  | { key: string; kind: "new"; file: File; preview: string };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

function ExistingPhoto({ listingId, id }: { listingId: string; id: string }) {
  const query = useQuery({
    queryKey: ["my-photo-edit", listingId, id],
    queryFn: () => getMyPhoto(listingId, id),
  });
  return query.data ? (
    <img src={query.data.url} alt="Ảnh của sách" />
  ) : (
    <span className={styles.photoPlaceholder}>
      {query.isError ? "Lỗi ảnh" : "Đang tải…"}
    </span>
  );
}

export function EditListingPage() {
  const { listingId = "" } = useParams();
  const auth = useSession();
  const ownerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const listing = useQuery({
    queryKey: ["my-listing", ownerId, listingId],
    queryFn: () => getMyListing(listingId),
    enabled: !!ownerId && !!listingId,
    retry: false,
  });
  const item = listing.data;
  const bookId = item
    ? item.currentRevision.content.bookId || item.currentRevision.bookId
    : undefined;
  const identity = useQuery({
    queryKey: ["my-book-identity", ownerId, bookId, item?.catalogStatus],
    queryFn: () => getMyBookIdentity(bookId!, item?.catalogStatus),
    enabled: !!ownerId && !!bookId,
  });
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => apiSession.request("/me/addresses", addressBookSchema),
    enabled: !!ownerId,
  });
  const origins = (addresses.data?.items ?? []).filter(
    (a) => a.serviceAreaCode === "HCM-DEMO-v1",
  );

  const [form, setForm] = useState<RevisionFormValue | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [initial, setInitial] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [done, setDone] = useState(false);
  const completed = useRef(false);
  const [confirmHideOpen, setConfirmHideOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

  const {
    cooldown: hideCooldown,
    isCoolingDown: isHideCoolingDown,
    startCooldown: startHideCooldown,
  } = useActionCooldown(4);

  const canToggle = item ? canToggleVisibility(item) : false;
  const canArchive = item ? canArchiveListing(item) : false;

  async function handleToggleVisibility(to: "Visible" | "Hidden") {
    if (!item || busy || isHideCoolingDown) return;
    setBusy(true);
    setSubmitError(undefined);
    try {
      await setListingVisibility(item.id, item.version, to);
      setConfirmHideOpen(false);
      startHideCooldown();
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      void listing.refetch();
    } catch (error) {
      setConfirmHideOpen(false);
      const status = (error as { status?: number }).status;
      setSubmitError(
        status === 409
          ? "Bài đăng vừa thay đổi trạng thái ở nơi khác. Đang làm mới dữ liệu..."
          : error instanceof Error
            ? error.message
            : "Chưa cập nhật được trạng thái hiển thị.",
      );
      void listing.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!item) return;
    setBusy(true);
    setSubmitError(undefined);
    try {
      await archiveListing(item.id, item.version);
      completed.current = true;
      setDone(true);
      setConfirmArchiveOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      navigate(ROUTES.myBooks);
    } catch (error) {
      setConfirmArchiveOpen(false);
      const status = (error as { status?: number }).status;
      setSubmitError(
        status === 409
          ? "Bài đăng vừa thay đổi trạng thái hoặc đang có giao dịch phát sinh."
          : error instanceof Error
            ? error.message
            : "Chưa xóa được bài đăng.",
      );
      void listing.refetch();
    } finally {
      setBusy(false);
    }
  }

  const fileInput = useRef<HTMLInputElement>(null);
  const intent = useRef<{
    signature: string;
    run: ReturnType<typeof createListingRevision>;
  } | null>(null);

  // Seed form once
  useEffect(() => {
    if (!item || form) return;
    const next = formFromListing(item);
    setForm(next);
    setPhotos(
      (item.currentRevision.content.mediaIds ?? []).map((id) => ({
        key: `e-${id}`,
        kind: "existing" as const,
        id,
      })),
    );
    setInitial(JSON.stringify({ next, ids: item.currentRevision.content.mediaIds ?? [] }));
  }, [item, form]);

  const photoSignature = photos
    .map((p) =>
      p.kind === "existing"
        ? p.id
        : `${p.file.name}:${p.file.size}:${p.file.lastModified}`,
    )
    .join("|");

  const current = useMemo(
    () => (form ? { ...form, photoCount: photos.length } : null),
    [form, photos.length],
  );

  const dirty =
    !!current &&
    !done &&
    JSON.stringify({
      next: { ...current, photoCount: initial ? JSON.parse(initial).next.photoCount : 0 },
      ids: photos.map((p) => (p.kind === "existing" ? p.id : "new")),
    }) !==
      (initial
        ? JSON.stringify({
            next: JSON.parse(initial).next,
            ids: JSON.parse(initial).ids,
          })
        : "");

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !completed.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useBeforeUnload((event) => {
    if (!completed.current && dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  useEffect(
    () => () =>
      photos.forEach((p) => p.kind === "new" && URL.revokeObjectURL(p.preview)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const errors = current ? validateRevision(current) : {};
  const showError = (field: keyof typeof errors) =>
    attempted ? errors[field] : undefined;

  function patch(change: Partial<RevisionFormValue>) {
    setForm((previous) => (previous ? { ...previous, ...change } : previous));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: PhotoItem[] = [];
    let rejected = false;
    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type) || file.size > 10_000_000) {
        rejected = true;
        continue;
      }
      next.push({
        key: `n-${crypto.randomUUID()}`,
        kind: "new",
        file,
        preview: URL.createObjectURL(file),
      });
    }
    setSubmitError(
      rejected ? "Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB." : undefined,
    );
    setPhotos((previous) => [...previous, ...next].slice(0, MAX_PHOTOS));
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(key: string) {
    setPhotos((previous) => {
      const gone = previous.find((p) => p.key === key);
      if (gone?.kind === "new") URL.revokeObjectURL(gone.preview);
      return previous.filter((p) => p.key !== key);
    });
  }

  function makeCover(key: string) {
    setPhotos((previous) => {
      const chosen = previous.find((p) => p.key === key);
      return chosen ? [chosen, ...previous.filter((p) => p.key !== key)] : previous;
    });
  }

  function review() {
    setAttempted(true);
    setSubmitError(undefined);
    if (Object.keys(errors).length) {
      const first = document.querySelector<HTMLElement>("[data-invalid='true'], #bundle[aria-invalid='true']");
      first?.focus();
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    if (busy) return;
    if (!pending) {
      if (!item || !current || !bookId) return;
      const origin = origins.find((a) => a.id === current.originAddressId);
      if (current.mode !== "Exchange" && !origin) {
        setConfirming(false);
        setSubmitError("Địa chỉ gửi sách không còn hợp lệ. Hãy chọn lại.");
        return;
      }
      const input: RevisionPhoto[] = photos.map((p) =>
        p.kind === "existing"
          ? { kind: "existing", id: p.id }
          : { kind: "new", file: p.file },
      );
      const content = buildRevisionContent(
        current,
        bookId,
        [],
        origin ? { id: origin.id, version: origin.version } : null,
      );
      const { mediaIds: _unused, ...rest } = content;
      void _unused;
      const signature = JSON.stringify({ v: item.version, rest, photoSignature });
      if (intent.current?.signature !== signature)
        intent.current = {
          signature,
          run: createListingRevision({
            listingId: item.id,
            version: item.version,
            photos: input,
            content: rest,
          }),
        };
    }
    if (!intent.current) return;
    setBusy(true);
    setSubmitError(undefined);
    try {
      await intent.current.run();
      // The router evaluates its blocker before React commits setDone below.
      completed.current = true;
      setPending(false);
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-listing"] });
      void queryClient.invalidateQueries({ queryKey: ["my-photo"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      navigate(`${ROUTES.myBooks}?moderation=PendingReview`, {
        state: { revised: true },
      });
    } catch (error) {
      setConfirming(false);
      const status = (error as { status?: number }).status;
      const failed = status !== undefined && [400, 401, 403, 404, 409, 422, 429].includes(status);
      setPending(!failed);
      if (failed) intent.current = null;
      setSubmitError(
        !failed ? "Chưa xác nhận được kết quả gửi. Thử lại cùng bản sửa để kiểm tra; nội dung đã khóa cho lần gửi này."
        : status === 409
          ? "Bài đã thay đổi ở nơi khác hoặc không còn sửa được. Tải lại trang để xem bản mới nhất; nội dung bạn nhập vẫn còn."
          : error instanceof Error
            ? error.message
            : "Chưa gửi được bản sửa. Hãy thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (listing.isLoading || !ownerId)
    return (
      <main className={styles.pageState} role="status">
        <div className={styles.spinner} />
        <p>Đang tải thông tin bài đăng…</p>
      </main>
    );

  if (listing.isError || !item)
    return (
      <main className={styles.pageState}>
        <div className={styles.errorIconWrap}>
          <AlertTriangle size={32} />
        </div>
        <h1 className={styles.stateTitle}>Không mở được bài đăng</h1>
        <p className={styles.stateDescription}>
          Bài đăng không tồn tại hoặc bạn không có quyền chỉnh sửa ấn phẩm này.
        </p>
        <div className={styles.stateActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void listing.refetch()}
          >
            Thử lại
          </button>
          <Link to={ROUTES.myBooks} className={styles.secondaryBtn}>
            Về sách của tôi
          </Link>
        </div>
      </main>
    );

  const block = editApprovedBlock(item);
  if (block && !pending)
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} to={ROUTES.myBooks}>
          <ArrowLeft size={16} aria-hidden="true" /> Về kệ sách của tôi
        </Link>
        <div className={styles.blockedCard}>
          <div className={styles.blockedIcon}>
            <AlertTriangle size={24} aria-hidden="true" />
          </div>
          <div>
            <h2>Chưa thể sửa bài đăng này</h2>
            <p>{block}</p>
          </div>
        </div>
      </main>
    );

  if (!form || !current) return null;

  return (
    <main className={styles.page}>
      {/* Top Navigation */}
      <nav className={styles.headerNav}>
        <Link className={styles.backLink} to={ROUTES.myBooks}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Về kệ sách của tôi</span>
        </Link>
        <span className={styles.revisionPill}>Chỉnh sửa phiên bản</span>
      </nav>

      {/* Page Title & Subtitle */}
      <div className={styles.titleSection}>
        <h1 className={styles.pageTitle}>Chỉnh sửa bài đăng</h1>
        <p className={styles.pageSubtitle}>
          Cập nhật thông tin chi tiết, giá bán, tình trạng thực tế và ảnh chụp mới của ấn phẩm.
        </p>
      </div>

      {/* Book Hero Card (Passport style) */}
      <section className={styles.bookHero} aria-label="Đầu sách đang chỉnh sửa">
        <div
          className={`${styles.bookHeroCover} ${item.state.visibility === "Hidden" ? styles.bookHeroCoverHidden : ""}`}
        >
          {photos[0]?.kind === "existing" ? (
            <ExistingPhoto listingId={item.id} id={photos[0].id} />
          ) : (
            <div className={styles.bookHeroCoverFallback}>
              <BookOpen size={30} aria-hidden="true" />
            </div>
          )}
          {item.state.visibility === "Hidden" && (
            <div className={styles.hiddenCoverOverlay} aria-hidden="true">
              <div className={styles.hiddenBadgeCenterSmall}>
                <EyeOff size={18} />
                <span>Đang ẩn</span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.bookHeroContent}>
          <div className={styles.bookHeroBadge}>
            <Lock size={12} aria-hidden="true" />
            <span>Đầu sách cố định</span>
          </div>
          <h2 className={styles.bookHeroTitle}>
            {form?.bundle?.title || identity.data?.title || "Đang tải tên sách…"}
          </h2>
          <p className={styles.bookHeroAuthor}>
            Tác giả: <strong>{identity.data?.authors.join(", ") || "Chưa rõ"}</strong>
          </p>
          <p className={styles.bookHeroNote}>
            {form?.bundle ? "Đầu sách đại diện được giữ nguyên. Danh sách từng cuốn trong bộ ở bên dưới xác định chính xác sách giao cho người mua." : "Tên sách và tác giả được giữ nguyên theo hồ sơ đã kiểm duyệt. Nếu đây là một đầu sách khác, vui lòng đăng bài mới."}
          </p>
        </div>
      </section>

      {/* Notice Banner */}
      <div className={styles.noticeBanner} role="note">
        <div className={styles.noticeIcon}>
          <Info size={18} aria-hidden="true" />
        </div>
        <div className={styles.noticeText}>
          <strong>Quy trình kiểm duyệt lại:</strong> Mọi thay đổi nội dung sẽ được gửi đến ban quản trị xét duyệt. Trong thời gian chờ duyệt, bài đăng tạm thời ẩn khỏi kệ sách công khai.
        </div>
      </div>

      {/* Error Callout */}
      {submitError && (
        <div className={styles.errorAlert} role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div className={styles.errorAlertContent}>
            <span>{submitError}</span>
            <button
              type="button"
              className={styles.reloadBtn}
              disabled={busy || pending}
              onClick={() => void listing.refetch().then(() => setForm(null))}
            >
              Tải lại bài
            </button>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
      >
        <fieldset className={styles.editFields} disabled={busy || pending} aria-label="Nội dung bản sửa">
        {form.bundle && <BundleEditor value={form.bundle} error={showError("bundle")} onChange={bundle => patch({ bundle, condition: bundleCondition(bundle), mode: "Sale", exchangeValue: "" })} />}
        {/* CARD 1: Giá và hình thức */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrap}>
              <Tag size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Giá và hình thức giao lưu</h2>
              <p className={styles.cardDesc}>
                Lựa chọn phương thức bạn muốn chia sẻ cuốn sách này.
              </p>
            </div>
          </div>

          <div className={styles.cardBody}>
            {/* Mode selection tabs */}
            <div className={styles.formGroup}>
              <label className={styles.groupLabel}>Hình thức trao đổi</label>
              {form.bundle ? <p>Bán nguyên bộ {form.bundle.items.length} cuốn. Giá và giao nhận áp dụng cho cả bộ.</p> : <div className={styles.modeTabs}>
                {(
                  [
                    { value: "Sale", label: "Chỉ bán", icon: Tag, desc: "Bán lấy tiền" },
                    { value: "Exchange", label: "Chỉ đổi", icon: Coins, desc: "Đổi sách khác" },
                    { value: "Both", label: "Bán hoặc đổi", icon: Sparkles, desc: "Linh hoạt cả hai" },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const isSelected = form.mode === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      className={`${styles.modeTab} ${isSelected ? styles.modeTabActive : ""}`}
                      onClick={() => patch({ mode: tab.value })}
                    >
                      <div className={styles.modeTabHeader}>
                        <Icon size={16} aria-hidden="true" />
                        <span className={styles.modeTabTitle}>{tab.label}</span>
                      </div>
                      <span className={styles.modeTabDesc}>{tab.desc}</span>
                      {isSelected && (
                        <span className={styles.modeTabCheck}>
                          <Check size={12} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>}
            </div>

            {/* Price Inputs Grid */}
            <div className={styles.inputsGrid}>
              {form.mode !== "Exchange" && (
                <div className={styles.formGroup}>
                  <label className={styles.groupLabel} htmlFor="field-sale-price">
                    {form.bundle ? "Giá cả bộ" : "Giá bán"} <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.inputWithSuffix}>
                    <input
                      id="field-sale-price"
                      inputMode="numeric"
                      placeholder="VD: 50000"
                      value={form.salePrice}
                      data-invalid={!!showError("salePrice")}
                      aria-invalid={!!showError("salePrice")}
                      onChange={(e) => patch({ salePrice: e.target.value })}
                    />
                    <span className={styles.inputSuffix}>VNĐ</span>
                  </div>
                  <span className={styles.inputHint}>Từ 10.000đ đến 1.000.000đ</span>
                  {showError("salePrice") && (
                    <em className={styles.fieldError}>{showError("salePrice")}</em>
                  )}
                </div>
              )}

              {form.mode !== "Sale" && (
                <div className={styles.formGroup}>
                  <label className={styles.groupLabel} htmlFor="field-exchange-val">
                    Giá trị trao đổi <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.inputWithSuffix}>
                    <input
                      id="field-exchange-val"
                      inputMode="numeric"
                      placeholder="VD: 50000"
                      value={form.exchangeValue}
                      data-invalid={!!showError("exchangeValue")}
                      aria-invalid={!!showError("exchangeValue")}
                      onChange={(e) => patch({ exchangeValue: e.target.value })}
                    />
                    <span className={styles.inputSuffix}>VNĐ</span>
                  </div>
                  <span className={styles.inputHint}>Ước lượng giá trị tương đương</span>
                  {showError("exchangeValue") && (
                    <em className={styles.fieldError}>
                      {showError("exchangeValue")}
                    </em>
                  )}
                </div>
              )}
            </div>

            {/* Origin address */}
            {form.mode !== "Exchange" && (
              <div className={styles.formGroup}>
                <label className={styles.groupLabel} htmlFor="field-origin-addr">
                  Địa điểm gửi sách (Nơi shipper lấy hàng) <span className={styles.required}>*</span>
                </label>
                <div className={styles.selectWithIcon}>
                  <MapPin size={18} className={styles.selectIcon} aria-hidden="true" />
                  <select
                    id="field-origin-addr"
                    value={form.originAddressId}
                    data-invalid={!!showError("originAddressId")}
                    aria-invalid={!!showError("originAddressId")}
                    onChange={(e) => patch({ originAddressId: e.target.value })}
                  >
                    <option value="">-- Chọn địa chỉ gửi sách từ sổ địa chỉ --</option>
                    {origins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.recipientName} ({a.phone}) · {a.detail}
                      </option>
                    ))}
                  </select>
                </div>
                {addresses.isError && (
                  <em className={styles.fieldError}>
                    Chưa tải được sổ địa chỉ.{" "}
                    <button type="button" onClick={() => void addresses.refetch()}>
                      Thử lại
                    </button>
                  </em>
                )}
                {showError("originAddressId") && (
                  <em className={styles.fieldError}>
                    {showError("originAddressId")}
                  </em>
                )}
              </div>
            )}
          </div>
        </section>

        {/* CARD 2: Tình trạng sách */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrap}>
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Tình trạng ấn phẩm</h2>
              <p className={styles.cardDesc}>
                Mô tả chi tiết và trung thực giúp người mua hoàn toàn yên tâm.
              </p>
            </div>
          </div>

          <div className={styles.cardBody}>
            {/* Condition Grid Selection */}
            <div className={styles.formGroup}>
              <label className={styles.groupLabel}>
                Mức độ tình trạng tổng thể <span className={styles.required}>*</span>
              </label>
              <div className={styles.conditionGrid}>
                {Object.entries(conditions).map(([val, label]) => {
                  const isSelected = form.condition === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={!!form.bundle}
                      className={`${styles.conditionCard} ${isSelected ? styles.conditionCardActive : ""}`}
                      onClick={() => patch({ condition: val as Condition })}
                      data-invalid={!!showError("condition") && !form.condition}
                    >
                      <span className={styles.conditionRadio}>
                        {isSelected && <span className={styles.conditionRadioDot} />}
                      </span>
                      <span className={styles.conditionLabel}>{label}</span>
                    </button>
                  );
                })}
              </div>
              {form.bundle && <p>Tình trạng chung theo cuốn thấp nhất. Chỉnh từng cuốn trong danh sách bộ sách ở trên.</p>}
              {showError("condition") && (
                <em className={styles.fieldError}>{showError("condition")}</em>
              )}
            </div>

            {/* 4 Detail fields in 2x2 grid */}
            <div className={styles.detailGrid}>
              <div className={styles.formGroup}>
                <label className={styles.groupLabel} htmlFor="field-pages">
                  Tình trạng các trang ruột <span className={styles.required}>*</span>
                </label>
                <input
                  id="field-pages"
                  type="text"
                  placeholder="VD: Giấy sạch, không ố vàng hay viết vẽ"
                  value={form.pages}
                  data-invalid={!!showError("pages")}
                  aria-invalid={!!showError("pages")}
                  onChange={(e) => patch({ pages: e.target.value })}
                />
                {showError("pages") && (
                  <em className={styles.fieldError}>{showError("pages")}</em>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.groupLabel} htmlFor="field-cover">
                  Tình trạng bìa và gáy <span className={styles.required}>*</span>
                </label>
                <input
                  id="field-cover"
                  type="text"
                  placeholder="VD: Bìa cứng tốt, gáy vuông vắn"
                  value={form.coverNote}
                  data-invalid={!!showError("coverNote")}
                  aria-invalid={!!showError("coverNote")}
                  onChange={(e) => patch({ coverNote: e.target.value })}
                />
                {showError("coverNote") && (
                  <em className={styles.fieldError}>{showError("coverNote")}</em>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.groupLabel} htmlFor="field-notes">
                  Ghi chú thêm <span className={styles.required}>*</span>
                </label>
                <input
                  id="field-notes"
                  type="text"
                  placeholder="VD: Không có hoặc có chữ ký tác giả..."
                  value={form.notes}
                  data-invalid={!!showError("notes")}
                  aria-invalid={!!showError("notes")}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
                {showError("notes") && (
                  <em className={styles.fieldError}>{showError("notes")}</em>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.groupLabel} htmlFor="field-accessories">
                  Phụ kiện đi kèm <span className={styles.required}>*</span>
                </label>
                <input
                  id="field-accessories"
                  type="text"
                  placeholder="VD: Kèm bookmark gốc / Không có"
                  value={form.accessories}
                  data-invalid={!!showError("accessories")}
                  aria-invalid={!!showError("accessories")}
                  onChange={(e) => patch({ accessories: e.target.value })}
                />
                {showError("accessories") && (
                  <em className={styles.fieldError}>{showError("accessories")}</em>
                )}
              </div>
            </div>

            {/* General Description */}
            <div className={styles.formGroup}>
              <div className={styles.labelWithCounter}>
                <label className={styles.groupLabel} htmlFor="field-description">
                  Mô tả cảm nhận & chia sẻ <span className={styles.required}>*</span>
                </label>
                <span className={styles.charCounter}>
                  {form.description.trim().length}/5000 ký tự (tối thiểu 30)
                </span>
              </div>
              <textarea
                id="field-description"
                rows={4}
                placeholder="Chia sẻ lý do bạn thích cuốn sách này hoặc tình trạng cụ thể để người mua sau cảm thấy hứng thú..."
                value={form.description}
                data-invalid={!!showError("description")}
                aria-invalid={!!showError("description")}
                onChange={(e) => patch({ description: e.target.value })}
              />
              {showError("description") && (
                <em className={styles.fieldError}>{showError("description")}</em>
              )}
            </div>

            {/* 3 Questions (Segmented Toggles) */}
            <div className={styles.questionsContainer}>
              <span className={styles.questionsTitle}>Xác thực điều kiện lưu hành</span>
              
              <div className={styles.questionRow}>
                <div>
                  <span className={styles.questionText}>Sách đọc được rõ ràng và bình thường?</span>
                  <span className={styles.questionSub}>Bắt buộc phải đọc được để đủ điều kiện niêm yết</span>
                </div>
                <div className={styles.segmentedToggle}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.readable === true ? styles.togglePositive : ""}`}
                    onClick={() => patch({ readable: true })}
                  >
                    Có
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.readable === false ? styles.toggleNegative : ""}`}
                    onClick={() => patch({ readable: false })}
                  >
                    Không
                  </button>
                </div>
              </div>
              {showError("readable") && (
                <em className={styles.fieldError}>{showError("readable")}</em>
              )}

              <div className={styles.questionRow}>
                <div>
                  <span className={styles.questionText}>Sách có bị thiếu trang nào không?</span>
                  <span className={styles.questionSub}>Trang trắng hoặc trang phụ bản</span>
                </div>
                <div className={styles.segmentedToggle}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.hasMissingPages === true ? styles.toggleNegative : ""}`}
                    onClick={() => patch({ hasMissingPages: true })}
                  >
                    Có
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.hasMissingPages === false ? styles.togglePositive : ""}`}
                    onClick={() => patch({ hasMissingPages: false })}
                  >
                    Không
                  </button>
                </div>
              </div>
              {showError("hasMissingPages") && (
                <em className={styles.fieldError}>{showError("hasMissingPages")}</em>
              )}

              <div className={styles.questionRow}>
                <div>
                  <span className={styles.questionText}>Có bị thiếu phần nội dung trọng yếu không?</span>
                  <span className={styles.questionSub}>Như chương chính, kết thúc tác phẩm</span>
                </div>
                <div className={styles.segmentedToggle}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.missingEssentialContent === true ? styles.toggleNegative : ""}`}
                    onClick={() => patch({ missingEssentialContent: true })}
                  >
                    Có
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${form.missingEssentialContent === false ? styles.togglePositive : ""}`}
                    onClick={() => patch({ missingEssentialContent: false })}
                  >
                    Không
                  </button>
                </div>
              </div>
              {showError("missingEssentialContent") && (
                <em className={styles.fieldError}>{showError("missingEssentialContent")}</em>
              )}
            </div>
          </div>
        </section>

        {/* CARD 3: Ảnh thật của sách */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrap}>
              <ImagePlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className={styles.cardTitle}>
                Ảnh chụp thực tế ({photos.length}/{MAX_PHOTOS})
              </h2>
              <p className={styles.cardDesc}>
                Ảnh đầu tiên sẽ là ảnh bìa đại diện. Nhấp vào ảnh để thay đổi hoặc chọn ảnh bìa.
              </p>
            </div>
          </div>

          <div className={styles.cardBody}>
            <ul className={styles.photosGrid}>
              {photos.map((p, index) => (
                <li key={p.key} className={styles.photoItem}>
                  <div className={styles.photoThumb}>
                    {p.kind === "existing" ? (
                      <ExistingPhoto listingId={item.id} id={p.id} />
                    ) : (
                      <img src={p.preview} alt={`Ảnh mới ${p.file.name}`} />
                    )}
                    {index === 0 && (
                      <span className={styles.coverBadge}>
                        <Star size={11} fill="currentColor" /> Ảnh bìa
                      </span>
                    )}
                    <div className={styles.photoOverlay}>
                      {index > 0 && (
                        <button
                          type="button"
                          className={styles.setCoverBtn}
                          title="Đặt làm ảnh bìa"
                          onClick={() => makeCover(p.key)}
                        >
                          Làm bìa
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.deletePhotoBtn}
                        aria-label="Xóa ảnh này"
                        title="Xóa ảnh"
                        onClick={() => removePhoto(p.key)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}

              {photos.length < MAX_PHOTOS && (
                <li>
                  <button
                    type="button"
                    className={styles.uploadTrigger}
                    onClick={() => fileInput.current?.click()}
                  >
                    <div className={styles.uploadIconWrap}>
                      <ImagePlus size={22} aria-hidden="true" />
                    </div>
                    <span className={styles.uploadTitle}>Thêm ảnh</span>
                    <span className={styles.uploadDesc}>JPEG, PNG, WebP &le;10MB</span>
                  </button>
                </li>
              )}
            </ul>

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(",")}
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />

            {showError("photoCount") && (
              <em className={styles.fieldError}>{showError("photoCount")}</em>
            )}
          </div>
        </section>

        {/* CARD 4: Trạng thái & Quản lý ấn phẩm */}
        {(canToggle || canArchive) && (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap} style={{ background: "#716157" }}>
                <Eye size={18} aria-hidden="true" />
              </div>
              <div>
                <h2 className={styles.cardTitle}>Trạng thái & Quản lý ấn phẩm</h2>
                <p className={styles.cardDesc}>
                  Tạm ngưng hiển thị hoặc gỡ bỏ cuốn sách khỏi kệ sách của bạn.
                </p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.managementRow}>
                {canToggle && (
                  <div className={styles.manageItem}>
                    <div>
                      <strong>
                        {item?.state.visibility === "Visible" ? "Tạm ẩn bài đăng" : "Mở hiển thị lại"}
                      </strong>
                      <p>
                        {item?.state.visibility === "Visible"
                          ? "Tạm thời ẩn sách khỏi kệ công khai. Bạn có thể mở lại bất cứ lúc nào mà không cần duyệt lại."
                          : "Đưa cuốn sách này xuất hiện trở lại trên kệ sách công khai."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.manageBtn}
                      disabled={busy || isHideCoolingDown}
                      onClick={() => {
                        if (busy || isHideCoolingDown) return;
                        if (item?.state.visibility === "Hidden") void handleToggleVisibility("Visible");
                        else setConfirmHideOpen(true);
                      }}
                      title={
                        isHideCoolingDown
                          ? `Vui lòng chờ ${hideCooldown}s trước khi thao tác tiếp`
                          : undefined
                      }
                    >
                      {item?.state.visibility === "Visible" ? <EyeOff size={16} /> : <Eye size={16} />}
                      <span>
                        {item?.state.visibility === "Visible" ? "Tạm ẩn sách" : "Hiện lại trên kệ"}
                        {isHideCoolingDown ? ` (${hideCooldown}s)` : ""}
                      </span>
                    </button>
                  </div>
                )}
                {canArchive && (
                  <div className={styles.manageItem}>
                    <div>
                      <strong style={{ color: "#9b1c1c" }}>Gỡ bài đăng vĩnh viễn</strong>
                      <p>
                        Đóng hoàn toàn bài đăng này. Ấn phẩm sẽ bị gỡ khỏi kệ và không thể khôi phục lại.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.manageDangerBtn}
                      disabled={busy}
                      onClick={() => setConfirmArchiveOpen(true)}
                    >
                      <Trash2 size={16} />
                      <span>Xóa bài đăng</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Ownership declaration card */}
        <label className={styles.ownershipCard}>
          <input
            type="checkbox"
            className={styles.ownershipCheckbox}
            checked={form.ownershipDeclared}
            data-invalid={!!showError("ownershipDeclared")}
            onChange={(e) => patch({ ownershipDeclared: e.target.checked })}
          />
          <div className={styles.ownershipText}>
            <div className={styles.ownershipHeader}>
              <ShieldCheck size={18} className={styles.ownershipIcon} aria-hidden="true" />
              <strong>Cam kết quyền sở hữu và tính xác thực</strong>
            </div>
            <p>
              {form.bundle ? "Tôi sở hữu toàn bộ các cuốn trong bộ, không đăng chúng đồng thời ở tin khác và đã mô tả đúng tình trạng từng cuốn." : "Tôi cam kết mình là chủ sở hữu hợp pháp của ấn phẩm này và các thông tin, hình ảnh cung cấp phản ánh đúng tình trạng thực tế của cuốn sách."}
            </p>
          </div>
        </label>
        {showError("ownershipDeclared") && (
          <em className={styles.fieldError} style={{ marginTop: -12, marginLeft: 16 }}>
            {showError("ownershipDeclared")}
          </em>
        )}

        {/* Sticky Actions Bar */}
        <div className={styles.actionBar}>
          <button type="submit" className={styles.submitBtn} disabled={busy}>
            {busy ? (
              <>
                <span className={styles.btnSpinner} /> Đang gửi bản sửa…
              </>
            ) : (
              "Gửi bản sửa để duyệt lại"
            )}
          </button>
          <Link className={styles.cancelBtn} to={ROUTES.myBooks}>
            Hủy thay đổi
          </Link>
        </div>
        </fieldset>
      </form>
      {pending && <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void submit()}>Thử lại cùng bản sửa</button>}

      {/* Confirm & Blocker Dialogs */}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Gửi bản sửa để duyệt lại?"
        description="Ấn phẩm sẽ tạm thời chuyển sang trạng thái Chờ duyệt và không hiển thị trên kệ công khai cho tới khi quản trị viên phê duyệt. Các cuộc trò chuyện hoặc thỏa thuận đang mở có thể cần được cập nhật."
        confirmText={busy ? "Đang gửi…" : "Xác nhận gửi duyệt"}
        cancelText="Kiểm tra lại"
        isBusy={busy}
        onConfirm={() => void submit()}
      />

      <ConfirmDialog
        isOpen={confirmHideOpen}
        onClose={() => !busy && setConfirmHideOpen(false)}
        title="Tạm ẩn bài đăng?"
        description={`Bạn có muốn tạm ẩn cuốn "${identity.data?.title || "sách"}" khỏi kệ sách công khai? Bạn có thể bấm "Hiện lại" bất cứ lúc nào mà không cần duyệt lại.`}
        confirmText={busy ? "Đang xử lý…" : "Tạm ẩn bài"}
        cancelText="Hủy"
        isBusy={busy}
        onConfirm={() => void handleToggleVisibility("Hidden")}
      />

      <ConfirmDialog
        isOpen={confirmArchiveOpen}
        onClose={() => !busy && setConfirmArchiveOpen(false)}
        title="Gỡ bài đăng khỏi kệ sách?"
        description={`Cuốn "${identity.data?.title || "sách"}" sẽ bị gỡ vĩnh viễn khỏi kệ sách của bạn và không thể khôi phục. Các báo giá hoặc cuộc trò chuyện đang mở sẽ hết hiệu lực.`}
        confirmText={busy ? "Đang xóa…" : "Xóa vĩnh viễn"}
        cancelText="Giữ lại"
        isDanger
        isBusy={busy}
        onConfirm={() => void handleArchive()}
      />

      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Rời trang khi chưa lưu?"
        description={pending ? "Yêu cầu gửi bản sửa chưa có kết quả xác nhận. Nếu rời trang, hãy kiểm tra kệ sách trước khi gửi yêu cầu mới." : "Các thông tin bạn vừa chỉnh sửa sẽ không được lưu nếu rời khỏi trang lúc này."}
        confirmText="Rời trang"
        cancelText="Ở lại tiếp tục"
        isDanger
        onConfirm={() => blocker.proceed?.()}
      />
    </main>
  );
}
