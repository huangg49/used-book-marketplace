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
import { AlertTriangle, ArrowLeft, ImagePlus, Lock, X } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSession } from "../hooks/useSession";
import { session as apiSession } from "../lib/session";
import { conditions } from "../lib/listing-labels";
import { ROUTES } from "../lib/routes";
import {
  MAX_PHOTOS,
  buildRevisionContent,
  editApprovedBlock,
  formFromListing,
  type RevisionFormValue,
  validateRevision,
} from "../lib/owner-listing-edit";
import {
  createListingRevision,
  type RevisionPhoto,
} from "../services/listing-revision";
import {
  getMyBookIdentity,
  getMyListing,
  getMyPhoto,
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
    <img src={query.data.url} alt="Ảnh hiện tại của sách" />
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
  const [submitError, setSubmitError] = useState<string>();
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const intent = useRef<{
    signature: string;
    run: ReturnType<typeof createListingRevision>;
  } | null>(null);

  // Seed the form once per loaded server version; edits are never overwritten.
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
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) {
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
      const first = document.querySelector<HTMLElement>("[data-invalid='true']");
      first?.focus();
      return;
    }
    setConfirming(true);
  }

  async function submit() {
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
    // Same payload keeps the same runner (and Idempotency-Key) after a lost reply.
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
    setBusy(true);
    setSubmitError(undefined);
    try {
      await intent.current.run();
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
      setSubmitError(
        status === 409
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
      <main className={styles.page} role="status">
        Đang tải bài đăng…
      </main>
    );
  if (listing.isError || !item)
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Không mở được bài đăng</h1>
        <p className={styles.error} role="alert">
          Bài đăng không tồn tại hoặc không thuộc về bạn.
        </p>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void listing.refetch()}
        >
          Thử lại
        </button>{" "}
        <Link to={ROUTES.myBooks}>Về sách của tôi</Link>
      </main>
    );

  const block = editApprovedBlock(item);
  if (block)
    return (
      <main className={styles.page}>
        <Link className={styles.back} to={ROUTES.myBooks}>
          <ArrowLeft size={16} aria-hidden="true" /> Sách của tôi
        </Link>
        <h1 className={styles.title}>Chưa sửa được bài này</h1>
        <p className={styles.warning} role="status">
          <AlertTriangle size={18} aria-hidden="true" /> {block}
        </p>
      </main>
    );
  if (!form || !current) return null;

  const textField = (
    key: "pages" | "coverNote" | "notes" | "accessories",
    label: string,
  ) => (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        rows={2}
        value={form[key]}
        data-invalid={!!showError(key)}
        aria-invalid={!!showError(key)}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
      {showError(key) && <em className={styles.fieldError}>{showError(key)}</em>}
    </label>
  );

  const flagField = (
    key: "readable" | "hasMissingPages" | "missingEssentialContent",
    label: string,
  ) => (
    <fieldset className={styles.flag}>
      <legend>{label}</legend>
      {[true, false].map((v) => (
        <label key={String(v)}>
          <input
            type="radio"
            name={key}
            checked={form[key] === v}
            onChange={() => patch({ [key]: v })}
          />{" "}
          {v ? "Có" : "Không"}
        </label>
      ))}
      {showError(key) && <em className={styles.fieldError}>{showError(key)}</em>}
    </fieldset>
  );

  return (
    <main className={styles.page}>
      <Link className={styles.back} to={ROUTES.myBooks}>
        <ArrowLeft size={16} aria-hidden="true" /> Sách của tôi
      </Link>
      <h1 className={styles.title}>Sửa bài đăng</h1>

      <section className={styles.locked} aria-label="Sách không đổi được">
        <Lock size={18} aria-hidden="true" />
        <div>
          <strong>{identity.data?.title ?? "Đang tải tên sách…"}</strong>
          {identity.data && <span> · {identity.data.authors.join(", ")}</span>}
          <p>
            Tên sách và tác giả không đổi được. Nếu là cuốn khác, hãy đăng bài mới.
          </p>
        </div>
      </section>

      <p className={styles.warning} role="note">
        <AlertTriangle size={18} aria-hidden="true" /> Mọi thay đổi cần được
        duyệt lại. Từ lúc gửi, sách tạm ngừng hiển thị trên kệ cho tới khi được
        duyệt.
      </p>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}{" "}
          <button type="button" onClick={() => void listing.refetch().then(() => setForm(null))}>
            Tải lại bài
          </button>
        </p>
      )}

      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
      >
        <section className={styles.card}>
          <h2>Giá và hình thức</h2>
          <fieldset className={styles.flag}>
            <legend>Hình thức</legend>
            {(
              [
                ["Sale", "Bán"],
                ["Exchange", "Đổi"],
                ["Both", "Bán hoặc đổi"],
              ] as const
            ).map(([v, label]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="mode"
                  checked={form.mode === v}
                  onChange={() => patch({ mode: v })}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>
          {form.mode !== "Exchange" && (
            <label className={styles.field}>
              <span>Giá bán (đ)</span>
              <input
                inputMode="numeric"
                value={form.salePrice}
                data-invalid={!!showError("salePrice")}
                aria-invalid={!!showError("salePrice")}
                onChange={(e) => patch({ salePrice: e.target.value })}
              />
              {showError("salePrice") && (
                <em className={styles.fieldError}>{showError("salePrice")}</em>
              )}
            </label>
          )}
          {form.mode !== "Sale" && (
            <label className={styles.field}>
              <span>Giá trị trao đổi (đ)</span>
              <input
                inputMode="numeric"
                value={form.exchangeValue}
                data-invalid={!!showError("exchangeValue")}
                aria-invalid={!!showError("exchangeValue")}
                onChange={(e) => patch({ exchangeValue: e.target.value })}
              />
              {showError("exchangeValue") && (
                <em className={styles.fieldError}>
                  {showError("exchangeValue")}
                </em>
              )}
            </label>
          )}
          {form.mode !== "Exchange" && (
            <label className={styles.field}>
              <span>Nơi gửi sách</span>
              <select
                value={form.originAddressId}
                data-invalid={!!showError("originAddressId")}
                aria-invalid={!!showError("originAddressId")}
                onChange={(e) => patch({ originAddressId: e.target.value })}
              >
                <option value="">Chọn địa chỉ</option>
                {origins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.recipientName} · {a.detail}
                  </option>
                ))}
              </select>
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
            </label>
          )}
        </section>

        <section className={styles.card}>
          <h2>Tình trạng sách</h2>
          <label className={styles.field}>
            <span>Tình trạng</span>
            <select
              value={form.condition}
              data-invalid={!!showError("condition")}
              onChange={(e) =>
                patch({ condition: e.target.value as RevisionFormValue["condition"] })
              }
            >
              <option value="">Chọn tình trạng</option>
              {Object.entries(conditions).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {showError("condition") && (
              <em className={styles.fieldError}>{showError("condition")}</em>
            )}
          </label>
          {textField("pages", "Tình trạng các trang")}
          {textField("coverNote", "Tình trạng bìa và gáy")}
          {textField("notes", "Ghi chú thêm")}
          {textField("accessories", "Phụ kiện đi kèm")}
          <label className={styles.field}>
            <span>Mô tả chung</span>
            <textarea
              rows={4}
              value={form.description}
              data-invalid={!!showError("description")}
              aria-invalid={!!showError("description")}
              onChange={(e) => patch({ description: e.target.value })}
            />
            {showError("description") && (
              <em className={styles.fieldError}>{showError("description")}</em>
            )}
          </label>
          {flagField("readable", "Sách đọc được bình thường?")}
          {flagField("hasMissingPages", "Sách có thiếu trang?")}
          {flagField("missingEssentialContent", "Thiếu nội dung trọng yếu?")}
        </section>

        <section className={styles.card}>
          <h2>
            Ảnh thật ({photos.length}/{MAX_PHOTOS})
          </h2>
          <ul className={styles.photos}>
            {photos.map((p, index) => (
              <li key={p.key} className={styles.photo}>
                {p.kind === "existing" ? (
                  <ExistingPhoto listingId={item.id} id={p.id} />
                ) : (
                  <img src={p.preview} alt={`Ảnh mới ${p.file.name}`} />
                )}
                {index === 0 && <span className={styles.coverTag}>Ảnh bìa</span>}
                <div className={styles.photoActions}>
                  {index > 0 && (
                    <button type="button" onClick={() => makeCover(p.key)}>
                      Đặt làm bìa
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Bỏ ảnh này"
                    onClick={() => removePhoto(p.key)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li>
                <button
                  type="button"
                  className={styles.addPhoto}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={20} aria-hidden="true" /> Thêm ảnh
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
        </section>

        <label className={styles.ownership}>
          <input
            type="checkbox"
            checked={form.ownershipDeclared}
            data-invalid={!!showError("ownershipDeclared")}
            onChange={(e) => patch({ ownershipDeclared: e.target.checked })}
          />{" "}
          Tôi xác nhận có quyền đăng bán cuốn sách này.
          {showError("ownershipDeclared") && (
            <em className={styles.fieldError}>
              {showError("ownershipDeclared")}
            </em>
          )}
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy}>
            Gửi bản sửa để duyệt lại
          </button>
          <Link className={styles.secondary} to={ROUTES.myBooks}>
            Hủy
          </Link>
        </div>
      </form>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Gửi bản sửa để duyệt lại?"
        description="Sách sẽ tạm ngừng hiển thị trên kệ cho tới khi được duyệt. Các báo giá hoặc thỏa thuận đang mở với bản cũ có thể phải làm lại."
        confirmText={busy ? "Đang gửi…" : "Gửi duyệt lại"}
        cancelText="Xem lại"
        isBusy={busy}
        onConfirm={() => void submit()}
      />
      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Rời trang khi chưa gửi?"
        description="Các chỉnh sửa chưa gửi sẽ mất."
        confirmText="Rời trang"
        cancelText="Ở lại"
        isDanger
        onConfirm={() => blocker.proceed?.()}
      />
    </main>
  );
}
