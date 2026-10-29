import { clearAiPriceAttribution, type PriceReferenceState, assistError, decisionFor, failLoading, finishLoading, startLoading, suggestionInput, type AssistForm, type AssistState } from "@used-books/session-client";
import { PriceAssistPanel } from "../components/PriceAssistPanel";
import { createListingPriceRequest, type PricePhase } from "../services/listing-price-assist";
import type { CatalogInput } from "../services/listing-submission";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Navigate,
  useBeforeUnload,
  useBlocker,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  BookOpen,
  ImagePlus,
  PencilLine,
  X,
} from "lucide-react";
import { Header } from "../layouts/MainLayout";
import { Logo } from "../components/Header";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListingSubmissionConfirmation } from "../components/BookJourneyStates";
import { lockPageScroll } from "../lib/page-scroll";
import galleryStyles from "../components/ListingGallery.module.css";
import { useSession } from "../hooks/useSession";
import { session as apiSession } from "../lib/session";
import {
  createDraftAttempt,
  createListingSubmission,
} from "../services/listing-submission";
import {
  autofillFactRows,
  type AutofillFacts,
} from "../services/listing-autofill";
import {
  PhotoAutofill,
  type AutofillField,
  type AutofillFields,
} from "../components/PhotoAutofill";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import {
  CatalogClassificationFields,
  type ClassificationValue,
} from "../components/CatalogClassificationFields";
import {
  CatalogBookPicker,
  type PickedBook,
} from "../components/CatalogBookPicker";
import {
  categoryFor,
  languageOptions,
  classificationErrors,
  facetsFor,
} from "@used-books/api-contract/catalog-taxonomy";
import { PurchaseDialog } from "../components/PurchaseDialog";
import purchaseStyles from "./PurchaseFlow.module.css";
import styles from "./SellBookPage.module.css";
import { BundleEditor, BundleManifest } from '../components/BookBundle';
import { bundleCondition, bundleError, type BookBundle } from '../lib/book-bundle';
import {
  cropImageToCover,
  calculateCoverCrop,
  type CoverCropResult,
  type CoverPosition,
} from "../lib/image-crop";

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
const serviceAreasSchema = z.object({
  code: z.literal("HCM-DEMO-v1"),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});
const addressReceiptSchema = z.object({
  addressId: z.string().uuid(),
  version: z.number().int().positive(),
});

export function SellBookPage() {
  // ADR 0042: /sell?channel=Auction creates the seller's own auction listing:
  // a Sale with a declared value, no delivery origin and never on the shelf.
  const [searchParams] = useSearchParams();
  const auction = searchParams.get("channel") === "Auction";
  const submission = useRef<ReturnType<typeof createListingSubmission>>(null);
  // One server draft shared by photo autofill and submission (ADR 0048).
  const [draftAttempt, setDraftAttempt] = useState(createDraftAttempt);
  // Catalog-request facts the seller accepted from photo autofill.
  const [autofillFacts, setAutofillFacts] = useState<AutofillFacts>({});
  const [classification, setClassification] = useState<ClassificationValue>({
    categoryId: "",
    attributes: {},
    series: "",
  });
  const [language, setLanguage] = useState("vi");
  const [selectedBook, setSelectedBook] = useState<PickedBook | null>(null);
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">("catalog");
  const [step, setStep] = useState(1);
  const [bundle, setBundle] = useState<BookBundle | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [touched, setTouched] = useState<string[]>([]);
  const [ownershipDeclared, setOwnershipDeclared] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [validationFailure, setValidationFailure] = useState(false);
  const [hasAttempt, setHasAttempt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [hasCoverPhoto, setHasCoverPhoto] = useState(false);
  const [coverCropMeta, setCoverCropMeta] = useState<CoverCropResult | null>(null);
  const coverCropMetaRef = useRef<CoverCropResult | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const supportInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementIndex = useRef<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const photoViewer = useRef<HTMLDialogElement>(null);
  const photoViewerOpen = previewImage !== null;
  useEffect(() => {
    if (!photoViewerOpen) return;
    return lockPageScroll();
  }, [photoViewerOpen]);
  const location = useLocation();
  const session = useSession();
  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => apiSession.request("/me/addresses", addressBookSchema),
    enabled: session.status === "authenticated",
  });
  const serviceAreas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => apiSession.request("/service-areas", serviceAreasSchema),
    enabled: session.status === "authenticated",
  });
  const originAddressIntent = useRef<{
    key: string;
    body: string;
    receipt?: z.infer<typeof addressReceiptSchema>;
  } | null>(null);
  const [originDialogOpen, setOriginDialogOpen] = useState(false);
  const [originDialogError, setOriginDialogError] = useState(false);
  const [originAddressId, setOriginAddressId] = useState("");
  const [originForm, setOriginForm] = useState({
    recipientName: "",
    phone: "",
    localityCode: "",
    detail: "",
  });

  const [formData, setFormData] = useState({
    // Step 1
    title: "",
    author: "",
    // Step 2
    images: [] as string[],
    condition: "Good",
    pages: "",
    coverNote: "",
    notes: "",
    accessories: "",
    description: "",
    readable: null as boolean | null,
    hasMissingPages: null as boolean | null,
    missingEssentialContent: null as boolean | null,
    // Step 3
    mode: "Sale", // Sale, Exchange, Both
    salePrice: "",
    exchangeValue: "",
  });
  const [assist, setAssist] = useState<AssistState>({ status: "idle" });
  const [priceReference, setPriceReference] = useState<PriceReferenceState>(null);
  const [pricePhase, setPricePhase] = useState<PricePhase>("catalog");
  const priceToken = useRef(0), priceBusy = useRef(false);
  const requestPrice = useMemo(() => createListingPriceRequest(draftAttempt), [draftAttempt]);
  const assistScope = draftAttempt.id;
  const assistForm: AssistForm = {
    bookId: selectedBook?.id ?? null, condition: formData.condition as AssistForm["condition"],
    readable: formData.readable, hasMissingPages: formData.hasMissingPages, missingEssentialContent: formData.missingEssentialContent,
    pages: formData.pages, coverNote: formData.coverNote, notes: formData.notes,
    salePrice: formData.salePrice, mode: formData.mode as AssistForm["mode"],
  };
  const assistCatalog: CatalogInput = {
    ...autofillFacts, bookId: selectedBook?.id, title: formData.title, author: formData.author,
    category: categoryFor(classification.categoryId)?.label || selectedBook?.category || "Khác",
    categoryId: classification.categoryId, attributes: classification.attributes, series: classification.series, language,
  };
  const assistKey = JSON.stringify([assistScope, assistCatalog, suggestionInput(assistForm), imageFiles.map(file => [file.name, file.size, file.lastModified, file.type])]);
  async function askWebPrice() {
    if (priceBusy.current || submitting || hasAttempt || auction || bundle || formData.mode === "Exchange") return;
    priceBusy.current = true;
    const token = ++priceToken.current;
    setAssist(prev => startLoading(prev, assistKey, token));
    try {
      const answer = await requestPrice(assistForm, assistCatalog, [...imageFiles], setPricePhase, value => { if (priceToken.current === token) setPriceReference({ key: assistKey, value }); });
      setAssist(prev => finishLoading(prev, token, answer.listingId, answer.suggestion));
    } catch (error) {
      setAssist(prev => failLoading(prev, token, assistError(error)));
    } finally { priceBusy.current = false; }
  }
  const needsOrigin = !auction && formData.mode !== "Exchange";

  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<string[]>([]);
  const lastPhotoRemove = useRef<HTMLButtonElement>(null);
  const focusLastPhoto = useRef(false);
  const photoFocusTarget = useRef<string | null>(null);
  useEffect(() => {
    if (photoFocusTarget.current) {
      document.getElementById(photoFocusTarget.current)?.focus();
      photoFocusTarget.current = null;
    }
    if (focusLastPhoto.current) {
      focusLastPhoto.current = false;
      lastPhotoRemove.current?.focus();
    }
  }, [formData.images]);
  const focusFrame = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (focusFrame.current !== undefined)
        cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  function chooseBook(book: PickedBook) {
    setSelectedBook(book);
    setFormData((previous) => ({
      ...previous,
      title: book.title,
      author: book.authors.join(" · "),
    }));
    setClassification({
      categoryId: book.categoryId || categoryFor(book.category)?.id || "",
      attributes: book.attributes || {},
      series: book.series || "",
    });
    setLanguage(book.language);
    focusAfterRender("selected-book");
  }
  function applyAutofillField(field: AutofillField, fields: AutofillFields) {
    if (field === "title" || field === "authors") {
      setEntryMode("manual");
      setFormData((previous) => ({
        ...previous,
        ...(field === "title" && fields.title ? { title: fields.title } : {}),
        ...(field === "authors" && fields.authors.length
          ? { author: fields.authors.join("; ") }
          : {}),
      }));
      return;
    }
    if (field === "language") {
      if (fields.language && languageOptions.some((option) => option.id === fields.language))
        setLanguage(fields.language);
      return;
    }
    setAutofillFacts((previous) => ({ ...previous, [field]: fields[field] }));
  }
  function focusAfterRender(
    target:
      | "heading"
      | "error"
      | "selected-book"
      | "catalog-search"
      | "manual-title",
  ) {
    if (focusFrame.current !== undefined)
      cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (target === "heading" || target === "error") {
        (target === "heading" ? heading : errorBox).current?.focus();
      } else {
        const ids = {
          "selected-book": "sell-selected-title",
          "catalog-search": "sell-catalog-search",
          "manual-title": "title",
        };
        document.getElementById(ids[target])?.focus();
      }
    });
  }
  const dirty =
    step !== 6 &&
    (bundle !== null || classification.categoryId !== "" ||
      language !== "vi" ||
      imageFiles.length > 0 ||
      ownershipDeclared ||
      !!formData.title ||
      !!formData.author ||
      !!formData.pages ||
      !!formData.coverNote ||
      !!formData.notes ||
      !!formData.accessories ||
      !!formData.description ||
      !!formData.salePrice ||
      !!formData.exchangeValue ||
      !!originAddressId ||
      !!originForm.recipientName ||
      !!originForm.phone ||
      !!originForm.localityCode ||
      !!originForm.detail ||
      formData.condition !== "Good" ||
      formData.mode !== "Sale" ||
      formData.readable !== null ||
      formData.hasMissingPages !== null ||
      formData.missingEssentialContent !== null);
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
  useEffect(() => {
    imageRefs.current = formData.images;
  }, [formData.images]);
  useEffect(
    () => () => {
      imageRefs.current.forEach((url) => URL.revokeObjectURL(url));
      if (coverCropMetaRef.current?.rawUrl) {
        URL.revokeObjectURL(coverCropMetaRef.current.rawUrl);
      }
    },
    [],
  );
  useEffect(() => {
    if (submitError) errorBox.current?.focus();
  }, [submitError]);

  const coverCropStageRef = useRef<HTMLDivElement>(null);
  const isDraggingCover = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0, offset: 50 });

  const handleCoverPositionChange = async (position: CoverPosition) => {
    if (!coverCropMeta || hasAttempt || submitting) return;
    try {
      const result = await cropImageToCover(
        coverCropMeta.rawFile,
        position,
        coverCropMeta.rawUrl,
      );
      if (formData.images[0]) {
        URL.revokeObjectURL(formData.images[0]);
      }
      setCoverCropMeta(result);
      coverCropMetaRef.current = result;
      setFormData((prev) => ({
        ...prev,
        images: [result.croppedUrl, ...prev.images.slice(1)],
      }));
      setImageFiles((files) => [result.croppedFile, ...files.slice(1)]);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Chưa cập nhật được vị trí cắt ảnh bìa.",
      );
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!coverCropMeta || hasAttempt || submitting) return;
    if ((e.target as HTMLElement).closest(`.${styles.floatingRemoveBtn}`)) return;
    isDraggingCover.current = true;
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      offset: coverCropMeta.offsetPercent,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCover.current || !coverCropMeta) return;
    const stage = coverCropStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const isLandscape = coverCropMeta.aspectRatio > 0.755;
    const isPortrait = coverCropMeta.aspectRatio < 0.745;
    if (!isLandscape && !isPortrait) return;

    if (isLandscape) {
      const deltaX = e.clientX - dragStartPos.current.x;
      const maxShift = 100 - coverCropMeta.cropRectPercent.width;
      if (maxShift <= 0) return;
      const shiftPx = (rect.width * maxShift) / 100;
      const deltaPercent = (deltaX / shiftPx) * 100;
      const newOffset = Math.max(
        0,
        Math.min(100, dragStartPos.current.offset + deltaPercent),
      );
      const newCropRect = calculateCoverCrop(
        coverCropMeta.naturalWidth,
        coverCropMeta.naturalHeight,
        newOffset,
      );
      setCoverCropMeta((prev) =>
        prev
          ? {
              ...prev,
              offsetPercent: newOffset,
              align: newCropRect.align,
              cropRectPercent: newCropRect,
            }
          : null,
      );
    } else {
      const deltaY = e.clientY - dragStartPos.current.y;
      const maxShift = 100 - coverCropMeta.cropRectPercent.height;
      if (maxShift <= 0) return;
      const shiftPx = (rect.height * maxShift) / 100;
      const deltaPercent = (deltaY / shiftPx) * 100;
      const newOffset = Math.max(
        0,
        Math.min(100, dragStartPos.current.offset + deltaPercent),
      );
      const newCropRect = calculateCoverCrop(
        coverCropMeta.naturalWidth,
        coverCropMeta.naturalHeight,
        newOffset,
      );
      setCoverCropMeta((prev) =>
        prev
          ? {
              ...prev,
              offsetPercent: newOffset,
              align: newCropRect.align,
              cropRectPercent: newCropRect,
            }
          : null,
      );
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCover.current || !coverCropMeta) return;
    isDraggingCover.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    handleCoverPositionChange(coverCropMeta.offsetPercent);
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "cover" | "support",
    replaceAt?: number,
  ) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    addSelectedImages(selected, kind, replaceAt);
  };
  const addSelectedImages = (selected: File[], kind: "cover" | "support", replaceAt?: number) => {
    if (!selected.length || hasAttempt || submitting) return;
    const remaining =
      kind === "cover" || replaceAt !== undefined
        ? 1
        : 7 - (imageFiles.length - Number(hasCoverPhoto));
    if (selected.length > remaining) {
      setValidationFailure(false);
      setSubmitError(
        `Tối đa 8 ảnh. Bạn có thể chọn thêm ${remaining} ảnh; hãy chọn lại ít ảnh hơn.`,
      );
      return;
    }
    if (
      selected.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10_000_000,
      )
    ) {
      setValidationFailure(false);
      setSubmitError("Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.");
      return;
    }
    setSubmitError(undefined);

    if (kind === "cover") {
      photoFocusTarget.current = "images";
      const file = selected[0]!;
      cropImageToCover(file, "center")
        .then((result) => {
          if (hasCoverPhoto) {
            URL.revokeObjectURL(formData.images[0]!);
            if (coverCropMetaRef.current?.rawUrl) {
              URL.revokeObjectURL(coverCropMetaRef.current.rawUrl);
            }
          }
          const offset = Number(hasCoverPhoto);
          setCoverCropMeta(result);
          coverCropMetaRef.current = result;
          setFormData((prev) => ({
            ...prev,
            images: [result.croppedUrl, ...prev.images.slice(offset)],
          }));
          setImageFiles((files) => [result.croppedFile, ...files.slice(offset)]);
          setHasCoverPhoto(true);
        })
        .catch((err) => {
          setValidationFailure(false);
          setSubmitError(
            err instanceof Error ? err.message : "Chưa xử lý được ảnh bìa.",
          );
        });
      return;
    }

    // Validate the whole batch before allocating previews; retain upload order.
    const previews = selected.map((file) => URL.createObjectURL(file));
    if (replaceAt !== undefined) {
      URL.revokeObjectURL(formData.images[replaceAt]!);
      photoFocusTarget.current = `support-photo-${replaceAt - Number(hasCoverPhoto)}`;
      setFormData((prev) => ({
        ...prev,
        images: prev.images.map((url, index) =>
          index === replaceAt ? previews[0]! : url,
        ),
      }));
      setImageFiles((files) =>
        files.map((file, index) => (index === replaceAt ? selected[0]! : file)),
      );
    } else {
      focusLastPhoto.current =
        imageFiles.length - Number(hasCoverPhoto) + selected.length === 7;
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...previews],
      }));
      setImageFiles((files) => [...files, ...selected]);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const selectedOrigin = addresses.data?.items.find(
      (item) => item.id === originAddressId,
    );
    const originIsValid =
      !!selectedOrigin ||
      (!!serviceAreas.data?.localities.some(
        (item) => item.code === originForm.localityCode,
      ) &&
        originForm.recipientName.trim().length >= 2 &&
        /^0\d{9}$/.test(originForm.phone.trim()) &&
        originForm.detail.trim().length >= 5);
    const missing = [
      bundle && bundleError(bundle),
      formData.readable === false && "nội dung đọc rõ để đủ điều kiện đăng",
      formData.missingEssentialContent === true &&
        "đủ nội dung trọng yếu để đủ điều kiện đăng",
      !classification.categoryId && !selectedBook && "danh mục sách",
      !formData.title.trim() && "tên sách",
      !formData.author.trim() && "tác giả",
      !formData.pages.trim() && "mô tả ruột sách",
      !formData.coverNote.trim() && "mô tả bìa và gáy",
      !formData.notes.trim() && "ghi chú và đánh dấu",
      !formData.accessories.trim() && "phụ kiện",
      formData.description.trim().length < 30 &&
        "mô tả chung (ít nhất 30 ký tự)",
      !hasCoverPhoto && "ảnh bìa bản sách",
      formData.readable === null && "câu trả lời về độ đọc rõ",
      formData.hasMissingPages === null && "câu trả lời về trang thiếu",
      formData.missingEssentialContent === null &&
        "câu trả lời về nội dung trọng yếu",
      !ownershipDeclared && "xác nhận quyền sở hữu sách",
      needsOrigin && !originIsValid && "nơi gửi sách trong khu vực luân chuyển",
    ].filter(Boolean);
    const sale = Number(formData.salePrice);
    const exchange = Number(formData.exchangeValue);
    if (
      formData.mode !== "Exchange" &&
      (!Number.isInteger(sale) || sale < 10_000 || sale > 1_000_000)
    )
      missing.push(
        auction
          ? "giá trị khai báo từ 10.000đ đến 1.000.000đ"
          : "giá bán từ 10.000đ đến 1.000.000đ",
      );
    if (
      formData.mode !== "Sale" &&
      (!Number.isInteger(exchange) || exchange < 10_000 || exchange > 1_000_000)
    )
      missing.push("giá trị đổi từ 10.000đ đến 1.000.000đ");
    if (missing.length) {
      setValidationFailure(true);
      const invalidStep = [1, 2, 3, 4].find((value) => stepError(value));
      if (invalidStep === 1 && !selectedBook) setEntryMode("manual");
      setCheckedSteps([1, 2, 3, 4, 5]);
      if (invalidStep) setStep(invalidStep);
      setSubmitError(`Cần bổ sung: ${missing.join(", ")}.`);
      return;
    }
    setSubmitting(true);
    setValidationFailure(false);
    setSubmitError(undefined);
    try {
      let origin = selectedOrigin;
      // An existing submission already pins its origin and command keys. Resume
      // it without repeating address creation with a refreshed book version.
      if (needsOrigin && !origin && !submission.current) {
        const previous = originAddressIntent.current;
        // Freeze the body with its key: a background refetch can advance the
        // address-book version after the server saved a response we never saw.
        // Keep a key-only intent held by an open draft during hot reload too.
        const intent =
          previous && typeof previous === "object"
            ? previous
            : {
                key:
                  typeof previous === "string" ? previous : crypto.randomUUID(),
                body: JSON.stringify({
                  expectedBookVersion: addresses.data?.version ?? 0,
                  address: {
                    recipientName: originForm.recipientName.trim(),
                    phone: originForm.phone.trim(),
                    serviceAreaCode: "HCM-DEMO-v1",
                    localityCode: originForm.localityCode,
                    detail: originForm.detail.trim(),
                  },
                  makeDefault: (addresses.data?.items.length ?? 0) === 0,
                }),
              };
        originAddressIntent.current = intent;
        const saved =
          intent.receipt ??
          (await apiSession.request("/me/addresses", addressReceiptSchema, {
            method: "POST",
            headers: { "Idempotency-Key": intent.key },
            body: intent.body,
          }));
        intent.receipt = saved;
        setOriginAddressId(saved.addressId);
        const refreshed = await addresses.refetch();
        origin = refreshed.data?.items.find(
          (address) => address.id === saved.addressId,
        );
        if (!origin)
          throw new Error(
            "Đã lưu nơi gửi sách nhưng chưa tải lại được địa chỉ. Thông tin được giữ nguyên; hãy thử gửi lại.",
          );
      }
      submission.current ??= createListingSubmission({
        ...(auction ? { channel: "Auction" as const } : {}),
        ...(selectedBook ? {} : autofillFacts),
        title: formData.title,
        priceAssist: decisionFor(assist, assistKey, assistForm),
        ...(bundle ? { bundle } : {}),
        author: formData.author,
        category:
          categoryFor(classification.categoryId)?.label ||
          selectedBook?.category ||
          "Khác",
        bookId: selectedBook?.id,
        categoryId: classification.categoryId,
        attributes: classification.attributes,
        series: classification.series,
        language,
        condition: formData.condition as "LikeNew" | "Good" | "Fair" | "Worn",
        pages: formData.pages,
        coverNote: formData.coverNote,
        notes: formData.notes,
        accessories: formData.accessories,
        description: formData.description,
        mode: auction ? "Sale" : (formData.mode as "Sale" | "Exchange" | "Both"),
        salePrice: formData.mode === "Exchange" ? null : sale,
        exchangeValue: formData.mode === "Sale" ? null : exchange,
        files: imageFiles,
        readable: formData.readable!,
        hasMissingPages: formData.hasMissingPages!,
        missingEssentialContent: formData.missingEssentialContent!,
        ownershipDeclared,
        fulfillment: needsOrigin
          ? {
              originAddressId: origin!.id,
              originAddressVersion: origin!.version,
              method: "DirectDelivery",
            }
          : null,
      }, draftAttempt);
      setHasAttempt(true);
      await submission.current();
      setStep(6);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Chưa gửi được bài đăng.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    "Thông tin sách",
    "Ảnh bản sách",
    "Tình trạng",
    auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Bán hoặc đổi",
    "Kiểm tra",
  ];
  const textFields = [
    ["pages", "Ruột sách", "Giấy, độ rõ chữ, nếp gấp…"],
    ["coverNote", "Bìa và gáy", "Mép bìa, gáy sách, vết sờn…"],
    [
      "notes",
      "Ghi chú, đánh dấu",
      "Ghi rõ phần đã viết hoặc tô; không có thì ghi “Không có”.",
    ],
    [
      "accessories",
      "Phụ kiện",
      "Bookmark, bìa áo, quà kèm; không có thì ghi “Không có”.",
    ],
    [
      "description",
      "Mô tả chung",
      "Điều người đọc tiếp theo nên biết (ít nhất 30 ký tự).",
    ],
  ] as const;
  const questions = [
    ["readable", "Nội dung có đọc rõ không?"],
    ["hasMissingPages", "Sách có thiếu trang không?"],
    ["missingEssentialContent", "Sách có thiếu nội dung trọng yếu không?"],
  ] as const;
  function changeStep(next: number) {
    if (!hasAttempt) {
      setSubmitError(undefined);
      setValidationFailure(false);
    }
    setStep(next);
    focusAfterRender("heading");
  }
  function stepError(forStep: number) {
    if (forStep === 1 && bundle && bundleError(bundle)) return bundleError(bundle);
    let message: string | undefined;
    if (
      forStep === 1 &&
      !selectedBook &&
      (!classification.categoryId ||
        classificationErrors(
          classification.categoryId,
          classification.attributes,
        ).length)
    )
      return "Chọn danh mục và kiểm tra thuộc tính của đầu sách.";
    if (forStep === 1 && (!formData.title.trim() || !formData.author.trim()))
      message = "Nhập tên sách và tác giả trước khi tiếp tục.";
    if (forStep === 2 && !hasCoverPhoto) message = "Thêm ảnh bìa bản sách.";
    if (forStep === 3) {
      if (
        textFields.some(([key]) => !formData[key].trim()) ||
        formData.description.trim().length < 30
      )
        message =
          "Bổ sung mô tả ruột sách, bìa/gáy, ghi chú, phụ kiện và mô tả chung ít nhất 30 ký tự. Không có thì ghi “Không có”.";
      else if (questions.some(([key]) => formData[key] === null))
        message = "Trả lời đủ ba câu hỏi về tình trạng sách.";
      else if (!formData.readable || formData.missingEssentialContent)
        message =
          "Sách cần có nội dung đọc rõ và đủ nội dung trọng yếu để đủ điều kiện đăng.";
    }
    if (
      forStep === 4 &&
      ((formData.mode !== "Exchange" && !validPrice(formData.salePrice)) ||
        (formData.mode !== "Sale" && !validPrice(formData.exchangeValue)))
    )
      message =
        "Giá bán và giá trị đổi từ 10.000đ đến 1.000.000đ, không có phần lẻ.";
    if (forStep === 4 && needsOrigin && !hasValidOriginAddress())
      message =
        "Chọn khu vực luân chuyển và nhập đủ nơi gửi sách trước khi tiếp tục.";
    return message;
  }
  function continueStep() {
    const message = stepError(step);
    if (step === 1 && message && !selectedBook) setEntryMode("manual");
    setCheckedSteps((previous) => [...new Set([...previous, step])]);
    setSubmitError(message);
    setValidationFailure(!!message);
    if (!message) changeStep(step + 1);
    else focusAfterRender("error");
  }
  function validPrice(raw: string) {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 10_000 && value <= 1_000_000;
  }
  function hasValidOriginAddress() {
    if (addresses.data?.items.some((item) => item.id === originAddressId))
      return true;
    return (
      !!serviceAreas.data?.localities.some(
        (item) => item.code === originForm.localityCode,
      ) &&
      originForm.recipientName.trim().length >= 2 &&
      /^0\d{9}$/.test(originForm.phone.trim()) &&
      originForm.detail.trim().length >= 5
    );
  }
  function changeOriginForm(field: keyof typeof originForm, value: string) {
    originAddressIntent.current = null;
    setOriginForm((previous) => ({ ...previous, [field]: value }));
  }
  function removePhoto(index: number) {
    if (hasAttempt || submitting) return;
    const supportCount = imageFiles.length - Number(hasCoverPhoto);
    photoFocusTarget.current =
      hasCoverPhoto && index === 0
        ? "images"
        : supportCount > 1
          ? `support-remove-${Math.min(index - Number(hasCoverPhoto), supportCount - 2)}`
          : "add-support-photo";
    if (hasCoverPhoto && index === 0) {
      setHasCoverPhoto(false);
      if (coverCropMetaRef.current?.rawUrl) {
        URL.revokeObjectURL(coverCropMetaRef.current.rawUrl);
      }
      setCoverCropMeta(null);
      coverCropMetaRef.current = null;
    }
    URL.revokeObjectURL(formData.images[index]!);
    setFormData((previous) => ({
      ...previous,
      images: previous.images.filter((_, position) => position !== index),
    }));
    setImageFiles((previous) =>
      previous.filter((_, position) => position !== index),
    );
  }
  const fieldErrors: Record<string, string | undefined> = {
    bundle: bundle ? bundleError(bundle) : undefined,
    title: !formData.title.trim() ? "Nhập tên sách như trên bìa." : undefined,
    author: !formData.author.trim()
      ? "Nhập tên tác giả như trên bìa."
      : undefined,
    images: !hasCoverPhoto ? "Thêm ảnh bìa bản sách." : undefined,
    "sell-category":
      !selectedBook &&
      stepError(1) &&
      (!classification.categoryId ||
        classificationErrors(
          classification.categoryId,
          classification.attributes,
        ).length)
        ? "Chọn danh mục và kiểm tra các thuộc tính đã chọn."
        : undefined,
    salePrice:
      formData.mode !== "Exchange" && !validPrice(formData.salePrice)
        ? "Nhập số nguyên từ 10.000 đến 1.000.000 VNĐ."
        : undefined,
    exchangeValue:
      formData.mode !== "Sale" && !validPrice(formData.exchangeValue)
        ? "Nhập số nguyên từ 10.000 đến 1.000.000 VNĐ."
        : undefined,
    originAddress:
      needsOrigin && !hasValidOriginAddress()
        ? "Chọn địa chỉ đã lưu hoặc nhập đủ nơi gửi sách và khu vực luân chuyển."
        : undefined,
    readable:
      formData.readable === null
        ? "Chọn Có hoặc Không."
        : !formData.readable
          ? "Sách cần có nội dung đọc rõ để đủ điều kiện đăng."
          : undefined,
    hasMissingPages:
      formData.hasMissingPages === null ? "Chọn Có hoặc Không." : undefined,
    missingEssentialContent:
      formData.missingEssentialContent === null
        ? "Chọn Có hoặc Không."
        : formData.missingEssentialContent
          ? "Sách cần đủ nội dung trọng yếu để đủ điều kiện đăng."
          : undefined,
    ownership: !ownershipDeclared
      ? "Xác nhận quyền sở hữu trước khi gửi duyệt."
      : undefined,
    ...Object.fromEntries(
      textFields.map(([key, label]) => [
        key,
        !formData[key].trim()
          ? `Bổ sung ${label.toLowerCase()}; không có thì ghi “Không có”.`
          : key === "description" && formData.description.trim().length < 30
            ? "Mô tả chung cần ít nhất 30 ký tự."
            : undefined,
      ]),
    ),
  };
  function shownError(key: string) {
    return checkedSteps.includes(step) || touched.includes(key)
      ? fieldErrors[key]
      : undefined;
  }
  function fieldFeedback(key: string) {
    const message = shownError(key);
    return message ? (
      <p id={`${key}-error`} className={styles.fieldError}>
        {message}
      </p>
    ) : null;
  }
  function feedbackProps(key: string, hint?: string) {
    return {
      "aria-invalid": shownError(key) ? true : undefined,
      "aria-describedby":
        [hint, shownError(key) ? `${key}-error` : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
    };
  }
  const stepHelp = [
    "Chọn đầu sách đã có, hoặc bổ sung thông tin như trên bìa.",
    "Ảnh thật giúp người đọc nhìn rõ bản sách của bạn.",
    "Kể rõ những dấu vết đã có trên cuốn sách.",
    auction
      ? "Khai báo giá trị cuốn sách; giá khởi điểm đặt khi gửi đấu giá."
      : "Chọn hình thức phù hợp và đặt giá cho bản sách.",
    "Xem lại một lượt. Bạn có thể chỉnh sửa từng phần.",
  ];
  function reviewEdit(target: number) {
    return (
      <button
        type="button"
        className={styles.textAction}
        onClick={() => changeStep(target)}
      >
        Chỉnh sửa
        <span className="sr-only"> {steps[target - 1].toLowerCase()}</span>
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    );
  }
  function completeStep(value: number) {
    return value < 5
      ? !stepError(value)
      : ownershipDeclared && [1, 2, 3, 4].every((number) => !stepError(number));
  }
  function statusForStep(value: number) {
    return value === step
      ? "Đang chỉnh"
      : completeStep(value)
        ? "Đủ thông tin"
        : checkedSteps.includes(value)
          ? "Cần bổ sung"
          : "Chưa hoàn thành";
  }
  const stepFields: string[] =
    step === 1
      ? ["title", "author", "sell-category"]
      : step === 2
        ? ["images"]
        : step === 3
          ? [
              ...textFields.map(([key]) => key),
              ...questions.map(([key]) => key),
            ]
          : step === 4
            ? ["salePrice", "exchangeValue", "originAddress"]
            : ["ownership"];
  const visibleSubmitError = validationFailure
    ? stepError(step) || (step === 5 ? fieldErrors.ownership : undefined)
    : submitError;
  const previewIndex =
    previewImage === null ? -1 : formData.images.indexOf(previewImage);
  function photoLabel(index: number) {
    return hasCoverPhoto && index === 0
      ? "Ảnh bìa"
      : `Ảnh phụ ${index + 1 - Number(hasCoverPhoto)}`;
  }
  function openPhoto(index: number) {
    setPreviewImage(formData.images[index]!);
    photoViewer.current?.showModal();
  }
  function stepPhoto(amount: number) {
    const index =
      (previewIndex + amount + formData.images.length) % formData.images.length;
    setPreviewImage(formData.images[index]!);
  }
  const preview = (
    <section className={styles.preview} aria-label="Bản xem trước bài đăng">
      <div className={styles.previewHeading}>
        <h2>{bundle ? "Bộ sách của bạn" : "Cuốn sách của bạn"}</h2>
        <span>Bản nháp</span>
      </div>
      <div className={styles.previewMedia}>
        <div
          className={`${styles.previewPhoto} ${!hasCoverPhoto ? styles.previewPhotoEmpty : ""}`}
        >
          {hasCoverPhoto && formData.images[0] ? (
            <button
              type="button"
              className={styles.previewCoverButton}
              aria-label="Xem ảnh bìa chi tiết"
              aria-haspopup="dialog"
              onClick={() => openPhoto(0)}
            >
              <img
                src={formData.images[0]}
                alt={`Ảnh bìa ${bundle?.title || formData.title || "bản sách"}`}
              />
            </button>
          ) : (
            <div className={styles.emptyPhoto}>
              <BookOpen size={32} aria-hidden="true" />
              <span>Thêm ảnh ở bước tiếp theo</span>
            </div>
          )}
        </div>
        {formData.images.length > 0 && (
          <div
            className={styles.previewThumbnails}
            role="group"
            aria-label="Ảnh thu nhỏ bản nháp"
          >
            {formData.images.map((url, index) => (
              <button
                key={url}
                type="button"
                aria-label={`Xem ${photoLabel(index).toLowerCase()} chi tiết`}
                aria-haspopup="dialog"
                onClick={() => openPhoto(index)}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      <h3>{bundle?.title || formData.title || "Cuốn nào sẽ đi tiếp?"}</h3>
      {bundle && <p>Bộ {bundle.items.length} cuốn · Bán nguyên bộ</p>}
      <p>
        {formData.author || "Tên sách và tác giả sẽ hiện ở đây khi bạn điền."}
      </p>
      {(checkedSteps.includes(3) || formData.pages || formData.description) && (
        <span>
          {conditions[formData.condition as keyof typeof conditions]} ·{" "}
          {auction
            ? "Đấu giá"
            : formData.mode === "Sale"
              ? "Bán"
              : formData.mode === "Exchange"
                ? "Đổi"
                : "Bán hoặc đổi"}
        </span>
      )}
      {step >= 4 || formData.salePrice || formData.exchangeValue ? (
        <dl>
          {formData.mode !== "Exchange" && (
            <div>
              <dt>{auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Giá bán"}</dt>
              <dd
                className={
                  !validPrice(formData.salePrice)
                    ? styles.previewPending
                    : undefined
                }
              >
                {validPrice(formData.salePrice)
                  ? formatVnd(Number(formData.salePrice))
                  : auction
                    ? "Chưa có giá trị khai báo"
                    : "Chưa có giá bán"}
              </dd>
            </div>
          )}
          {formData.mode !== "Sale" && (
            <div>
              <dt>Giá trị đổi</dt>
              <dd
                className={
                  !validPrice(formData.exchangeValue)
                    ? styles.previewPending
                    : undefined
                }
              >
                {validPrice(formData.exchangeValue)
                  ? formatVnd(Number(formData.exchangeValue))
                  : "Chưa có giá trị đổi"}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className={styles.previewProgress}>
          Ảnh, tình trạng và giá sẽ được bổ sung qua từng bước.
        </p>
      )}
      <p className={styles.note}>
        Đây là bản xem trước, chưa hiển thị công khai.
      </p>
    </section>
  );
  if (session.status === "anonymous")
    return (
      <Navigate
        to={`/login?returnUrl=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  if (session.status !== "authenticated")
    return (
      <main className={styles.loading} role="status">
        Đang mở bàn đăng sách…
      </main>
    );
  return (
    <div className={styles.root}>
      <dialog
        ref={photoViewer}
        className={`${galleryStyles.viewer} ${styles.photoViewer}`}
        aria-labelledby="draft-photo-viewer-title"
        onClose={() => setPreviewImage(null)}
        onKeyDown={(event) => {
          if (formData.images.length < 2) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            stepPhoto(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className={galleryStyles.viewerHead}>
          <h2 id="draft-photo-viewer-title">Ảnh bản sách của bạn</h2>
          <button
            type="button"
            autoFocus
            aria-label="Đóng ảnh chi tiết"
            onClick={() => photoViewer.current?.close()}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {previewIndex >= 0 && (
          <div className={galleryStyles.largePhoto}>
            <img
              className={styles.previewDetailImage}
              src={previewImage!}
              alt={`${photoLabel(previewIndex)} · ${formData.title || "Bản sách của bạn"}`}
            />
          </div>
        )}
        <div className={galleryStyles.viewerFoot}>
          {formData.images.length > 1 && (
            <button
              type="button"
              aria-label="Ảnh trước"
              onClick={() => stepPhoto(-1)}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          )}
          <p aria-live="polite">
            {previewIndex >= 0
              ? `${photoLabel(previewIndex)} · ${previewIndex + 1}/${formData.images.length}`
              : ""}
          </p>
          {formData.images.length > 1 && (
            <button
              type="button"
              aria-label="Ảnh sau"
              onClick={() => stepPhoto(1)}
            >
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </dialog>
      <svg
        width="0"
        height="0"
        className={styles.logoFilter}
        aria-hidden="true"
      >
        <defs>
          <filter id="sell-logo-ink" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 .360784 0 0 0 0 .007843 0 0 0 0 .007843 1.59375 0 0 0 -.575"
            />
          </filter>
        </defs>
      </svg>
      <a href="#sell-content" className={styles.skip}>
        Bỏ qua điều hướng
      </a>
      <Header />
      <main id="sell-content" className={styles.page}>
        <header className={styles.intro}>
          <h1>{auction ? "Tạo sách đấu giá" : "Đăng sách"}</h1>
          <p className={styles.tagline}>Để sách đi tiếp.</p>
          <p>
            {auction
              ? "Sách đấu giá là bài đăng riêng, không hiển thị trên kệ mua/đổi. Sau khi được duyệt, bạn gửi sách tới điểm giao nhận để kiểm tra trước khi mở phiên."
              : "Thêm ảnh và kể rõ tình trạng bản sách. Kiểm tra một lượt trước khi gửi duyệt."}
          </p>
        </header>
        {step === 6 ? (
          <ListingSubmissionConfirmation
            auction={auction}
            title={bundle?.title || formData.title}
            onPostAnother={() => {
              formData.images.forEach((url) => URL.revokeObjectURL(url));
              submission.current = null;
              // A fresh draft: the old stage keys would replay the sent listing.
              setDraftAttempt(createDraftAttempt());
              setAutofillFacts({});
              setBundle(null);
              setClassification({
                categoryId: "",
                attributes: {},
                series: "",
              });
              setLanguage("vi");
              setSelectedBook(null);
              setEntryMode("catalog");
              setFormData({
                title: "",
                author: "",
                images: [],
                condition: "Good",
                pages: "",
                coverNote: "",
                notes: "",
                accessories: "",
                description: "",
                readable: null,
                hasMissingPages: null,
                missingEssentialContent: null,
                mode: "Sale",
                salePrice: "",
                exchangeValue: "",
              });
              setImageFiles([]);
              setHasCoverPhoto(false);
              setOriginAddressId("");
              setOriginForm({
                recipientName: "",
                phone: "",
                localityCode: "",
                detail: "",
              });
              originAddressIntent.current = null;
              setOwnershipDeclared(false);
              setHasAttempt(false);
              setSubmitError(undefined);
              setCheckedSteps([]);
              setTouched([]);
              changeStep(1);
            }}
          />
        ) : (
          <>
            <nav className={styles.steps} aria-label="Các bước đăng sách">
              <span
                className={styles.activeStep}
                style={{ transform: `translateX(${(step - 1) * 100}%)` }}
                aria-hidden="true"
              />
              <ol>
                {steps.map((label, index) => (
                  <li key={label}>
                    <button
                      type="button"
                      aria-current={step === index + 1 ? "step" : undefined}
                      disabled={submitting}
                      aria-label={`${index + 1}. ${label}, ${statusForStep(index + 1).toLowerCase()}`}
                      onClick={() => changeStep(index + 1)}
                    >
                      <span className={styles.stepNumber}>
                        {completeStep(index + 1) ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className={styles.stepLabel}>
                        {label}
                        <small>{statusForStep(index + 1)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className={styles.workspace}>
              <aside
                className={styles.desktopPreview}
                tabIndex={0}
                aria-label="Tóm tắt bản nháp"
              >
                {preview}
              </aside>
              <details className={styles.compactPreview}>
                <summary>
                  Xem bản nháp <span>{imageFiles.length}/8 ảnh</span>
                </summary>
                {preview}
              </details>
              <div className={styles.formArea}>
                <div key={step} className={styles.stepBody}>
                  <div className={styles.slipHeader}>
                    <div className={styles.slipBrand}>
                      <span
                        className={styles.slipLogo}
                        aria-hidden="true"
                        inert
                      >
                        <Logo />
                      </span>
                      <span>Phiếu thông tin sách</span>
                    </div>
                    <span className={styles.draftStamp}>Bản nháp</span>
                  </div>
                  <p className={styles.stepCount}>Bước {step}/5</p>
                  <h2 ref={heading} tabIndex={-1}>
                    {steps[step - 1]}
                  </h2>
                  <p className={styles.stepHelp}>{stepHelp[step - 1]}</p>
                  <form
                    onBlurCapture={(event) => {
                      const target = event.target;
                      if (
                        target instanceof HTMLInputElement ||
                        target instanceof HTMLTextAreaElement ||
                        target instanceof HTMLSelectElement
                      ) {
                        const key = target.name || target.id;
                        setTouched((previous) =>
                          previous.includes(key)
                            ? previous
                            : [...previous, key],
                        );
                      }
                    }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (step < 5) continueStep();
                      else void handleSubmit();
                    }}
                    noValidate
                  >
                    <fieldset
                      disabled={submitting || hasAttempt}
                      className={styles.fields}
                    >
                      {step === 1 && (
                        <>
                          {!auction && <>
                            <div className={styles.entryChoice} role="group" aria-label="Sách lẻ hoặc bộ sách">
                              <button type="button" aria-pressed={!bundle} onClick={() => setBundle(null)}>Sách lẻ</button>
                              <button type="button" aria-pressed={!!bundle} onClick={() => {
                                if (bundle) return;
                                setBundle(previous => previous || { title: '', wholeOnly: true, exclusiveOwnershipDeclared: true,
                                  items: [{ label: '', condition: 'Good', notes: '' }, { label: '', condition: 'Good', notes: '' }] });
                                setFormData(previous => ({ ...previous, mode: 'Sale', exchangeValue: '', condition: 'Good' }));
                              }}>Bộ sách</button>
                            </div>
                            {bundle && <BundleEditor value={bundle} error={shownError('bundle')} onChange={next => {
                              setBundle(next);
                              setFormData(previous => ({ ...previous, condition: bundleCondition(next), mode: 'Sale', exchangeValue: '' }));
                            }} />}
                          </>}
                          {!selectedBook && (
                            <div
                              className={styles.entryChoice}
                              role="group"
                              aria-label="Cách điền thông tin sách"
                            >
                              <button
                                type="button"
                                aria-pressed={entryMode === "catalog"}
                                aria-controls="sell-book-entry"
                                onClick={() => setEntryMode("catalog")}
                              >
                                <BookOpen size={18} aria-hidden="true" />
                                Tìm sách có sẵn
                              </button>
                              <button
                                type="button"
                                aria-pressed={entryMode === "manual"}
                                aria-controls="sell-book-entry"
                                onClick={() => setEntryMode("manual")}
                              >
                                <PencilLine size={18} aria-hidden="true" />
                                Tự nhập thông tin
                              </button>
                            </div>
                          )}
                          {!selectedBook && !bundle && (
                            <PhotoAutofill
                              onUseCover={file => addSelectedImages([file], "cover")}
                              currentValue={field => field === "title" ? formData.title : field === "authors" ? formData.author : field === "language" ? language : String(autofillFacts[field] ?? "")}
                              attempt={draftAttempt}
                              channel={auction ? "Auction" : undefined}
                              disabled={submitting || hasAttempt}
                              onUseField={applyAutofillField}
                              onPickBook={(match) => chooseBook(match.book)}
                            />
                          )}
                          <div
                            id="sell-book-entry"
                            className={styles.bookEntry}
                          >
                            {!selectedBook && entryMode === "catalog" && (
                              <div className={styles.catalogEntry}>
                                <CatalogBookPicker
                                  compact
                                  label="Tìm cuốn sách trong thư viện"
                                  onSelect={chooseBook}
                                />
                                <p className={styles.help}>
                                  Chọn đúng đầu sách để điền sẵn tên, tác giả và
                                  phân loại.
                                </p>
                                <button
                                  className={styles.textAction}
                                  type="button"
                                  onClick={() => {
                                    setEntryMode("manual");
                                    focusAfterRender("manual-title");
                                  }}
                                >
                                  Không thấy sách? Tự nhập theo bìa{" "}
                                  <ArrowRight size={16} aria-hidden="true" />
                                </button>
                                <p className={styles.marginNote}>
                                  Mỗi cuốn sách, một câu chuyện.
                                </p>
                              </div>
                            )}
                            {selectedBook && (
                              <div className={styles.selectedEntry}>
                                <p className={styles.selectedLabel}>
                                  <Check size={18} aria-hidden="true" />
                                  Đầu sách đã xác nhận
                                </p>
                                <h3 id="sell-selected-title" tabIndex={-1}>
                                  {selectedBook.title}
                                </h3>
                                <p>{selectedBook.authors.join(" · ")}</p>
                                <dl className={styles.selectedFacts}>
                                  <div>
                                    <dt>Danh mục</dt>
                                    <dd>
                                      {categoryFor(classification.categoryId)
                                        ?.label || selectedBook.category}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Ngôn ngữ</dt>
                                    <dd>
                                      {languageOptions.find(
                                        (option) => option.id === language,
                                      )?.label || language}
                                    </dd>
                                  </div>
                                </dl>
                                <button
                                  type="button"
                                  className={styles.textAction}
                                  onClick={() => {
                                    setSelectedBook(null);
                                    setEntryMode("catalog");
                                    focusAfterRender("catalog-search");
                                  }}
                                >
                                  Chọn đầu sách khác{" "}
                                  <ArrowRight size={16} aria-hidden="true" />
                                </button>
                              </div>
                            )}
                            {!selectedBook && entryMode === "manual" && (
                              <>
                                <p className={styles.manualHint}>
                                  Ghi tên sách và tác giả đúng như trên bìa.
                                </p>
                                {(
                                  [
                                    ["title", "Tên sách", "Ví dụ: Truyện Kiều"],
                                    ["author", "Tác giả", "Ví dụ: Nguyễn Du"],
                                  ] as const
                                ).map(([key, label, placeholder]) => (
                                  <div
                                    className={`${styles.field} ${key === "title" ? styles.titleField : ""}`}
                                    key={key}
                                  >
                                    <label htmlFor={key}>{label}</label>
                                    <input
                                      id={key}
                                      required
                                      {...feedbackProps(key)}
                                      value={formData[key]}
                                      disabled={!!selectedBook}
                                      onChange={(event) =>
                                        setFormData((previous) => ({
                                          ...previous,
                                          [key]: event.target.value,
                                        }))
                                      }
                                      placeholder={placeholder}
                                    />
                                    {fieldFeedback(key)}
                                  </div>
                                ))}
                                <fieldset
                                  disabled={!!selectedBook}
                                  className={styles.classification}
                                  aria-describedby={
                                    shownError("sell-category")
                                      ? "sell-category-error"
                                      : undefined
                                  }
                                >
                                  <legend>Phân loại đầu sách</legend>
                                  <CatalogClassificationFields
                                    editing
                                    collapseOptional
                                    secondaryField={
                                      <div className={styles.languageField}>
                                        <label htmlFor="sell-language">
                                          Ngôn ngữ của sách
                                        </label>
                                        <select
                                          id="sell-language"
                                          value={language}
                                          onChange={(e) =>
                                            setLanguage(e.target.value)
                                          }
                                        >
                                          {!languageOptions.some(
                                            (o) => o.id === language,
                                          ) && (
                                            <option value={language}>
                                              {language}
                                            </option>
                                          )}
                                          {languageOptions.map((o) => (
                                            <option key={o.id} value={o.id}>
                                              {o.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    }
                                    id="sell"
                                    value={classification}
                                    onChange={setClassification}
                                  />
                                  {fieldFeedback("sell-category")}
                                </fieldset>
                                <p className={styles.marginNote}>
                                  Đúng tên trên bìa, dễ tìm nhau hơn.
                                </p>
                              </>
                            )}
                          </div>
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <p className={styles.help}>
                            {bundle ? "Chọn ảnh thấy rõ toàn bộ các cuốn trong bộ. Thêm ảnh gáy, ruột và lỗi của từng cuốn ở bên phải." : "Chọn ảnh bìa ở bên trái. Thêm ảnh gáy, ruột sách và phần đã qua sử dụng ở bên phải."}
                          </p>
                          <div
                            className={styles.photos}
                            role="group"
                            aria-label="Ảnh bản sách"
                          >
                            <div
                              className={styles.coverPhotos}
                              role="group"
                              aria-label="Ảnh bìa"
                            >
                              <h3 className={styles.photoLabel}>Ảnh bìa</h3>
                              {hasCoverPhoto && coverCropMeta ? (
                                <div className={styles.coverCropContainer}>
                                  <div
                                    ref={coverCropStageRef}
                                    className={styles.coverCropStage}
                                    style={{
                                      aspectRatio: `${coverCropMeta.naturalWidth} / ${coverCropMeta.naturalHeight}`,
                                    }}
                                    onPointerDown={handleStagePointerDown}
                                    onPointerMove={handleStagePointerMove}
                                    onPointerUp={handleStagePointerUp}
                                    onPointerCancel={handleStagePointerUp}
                                    title="Kéo để điều chỉnh vị trí khung bìa"
                                  >
                                    <img
                                      src={coverCropMeta.rawUrl}
                                      alt="Ảnh bìa gốc đã chọn"
                                      className={styles.coverRawImage}
                                      draggable={false}
                                    />
                                    {/* Mờ đen các phần dư */}
                                    {coverCropMeta.cropRectPercent.top > 0.05 && (
                                      <div
                                        className={styles.cropMask}
                                        style={{
                                          top: 0,
                                          height: `${coverCropMeta.cropRectPercent.top}%`,
                                          left: 0,
                                          right: 0,
                                        }}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {coverCropMeta.cropRectPercent.left > 0.05 && (
                                      <div
                                        className={styles.cropMask}
                                        style={{
                                          top: 0,
                                          bottom: 0,
                                          left: 0,
                                          width: `${coverCropMeta.cropRectPercent.left}%`,
                                        }}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {coverCropMeta.cropRectPercent.left +
                                      coverCropMeta.cropRectPercent.width <
                                      99.9 && (
                                      <div
                                        className={styles.cropMask}
                                        style={{
                                          top: 0,
                                          bottom: 0,
                                          left: `${
                                            coverCropMeta.cropRectPercent.left +
                                            coverCropMeta.cropRectPercent.width
                                          }%`,
                                          right: 0,
                                        }}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {coverCropMeta.cropRectPercent.top +
                                      coverCropMeta.cropRectPercent.height <
                                      99.9 && (
                                      <div
                                        className={styles.cropMask}
                                        style={{
                                          bottom: 0,
                                          height: `${
                                            100 -
                                            (coverCropMeta.cropRectPercent.top +
                                              coverCropMeta.cropRectPercent
                                                .height)
                                          }%`,
                                          left: 0,
                                          right: 0,
                                        }}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {/* Khung dọc nét đứt (3:4) */}
                                    <div
                                      className={styles.cropDashedBox}
                                      style={{
                                        top: `${coverCropMeta.cropRectPercent.top}%`,
                                        left: `${coverCropMeta.cropRectPercent.left}%`,
                                        width: `${coverCropMeta.cropRectPercent.width}%`,
                                        height: `${coverCropMeta.cropRectPercent.height}%`,
                                      }}
                                      aria-hidden="true"
                                    >
                                      <span className={styles.cropBadge}>
                                        Bìa bài viết (3:4)
                                      </span>
                                    </div>

                                    {/* Nút xóa ảnh nổi góc trên bên phải */}
                                    <button
                                      type="button"
                                      className={styles.floatingRemoveBtn}
                                      aria-label="Xóa ảnh bìa"
                                      disabled={hasAttempt || submitting}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removePhoto(0);
                                      }}
                                      title="Xóa ảnh bìa"
                                    >
                                      <X size={15} aria-hidden="true" />
                                    </button>
                                  </div>

                                  <div className={styles.coverControls}>
                                    {(coverCropMeta.aspectRatio > 0.755 ||
                                      coverCropMeta.aspectRatio < 0.745) && (
                                      <div className={styles.cropAdjustSection}>
                                        <div
                                          className={styles.cropAdjustHeader}
                                        >
                                          <span
                                            className={styles.cropAdjustLabel}
                                          >
                                            Vị trí khung cắt:
                                          </span>
                                          <div
                                            className={styles.alignButtons}
                                            role="group"
                                            aria-label="Căn chỉnh nhanh vị trí"
                                          >
                                            <button
                                              type="button"
                                              className={`${styles.alignBtn} ${
                                                coverCropMeta.align === "left"
                                                  ? styles.alignBtnActive
                                                  : ""
                                              }`}
                                              disabled={
                                                hasAttempt || submitting
                                              }
                                              onClick={() =>
                                                handleCoverPositionChange(
                                                  "left",
                                                )
                                              }
                                            >
                                              Trái
                                            </button>
                                            <button
                                              type="button"
                                              className={`${styles.alignBtn} ${
                                                coverCropMeta.align === "center"
                                                  ? styles.alignBtnActive
                                                  : ""
                                              }`}
                                              disabled={
                                                hasAttempt || submitting
                                              }
                                              onClick={() =>
                                                handleCoverPositionChange(
                                                  "center",
                                                )
                                              }
                                            >
                                              Giữa
                                            </button>
                                            <button
                                              type="button"
                                              className={`${styles.alignBtn} ${
                                                coverCropMeta.align === "right"
                                                  ? styles.alignBtnActive
                                                  : ""
                                              }`}
                                              disabled={
                                                hasAttempt || submitting
                                              }
                                              onClick={() =>
                                                handleCoverPositionChange(
                                                  "right",
                                                )
                                              }
                                            >
                                              Phải
                                            </button>
                                          </div>
                                        </div>
                                        <div className={styles.cropSliderRow}>
                                          <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={Math.round(
                                              coverCropMeta.offsetPercent,
                                            )}
                                            className={styles.cropSlider}
                                            aria-label="Kéo tùy chỉnh vị trí cắt"
                                            disabled={hasAttempt || submitting}
                                            onChange={(e) => {
                                              const val = Number(
                                                e.target.value,
                                              );
                                              const newCropRect =
                                                calculateCoverCrop(
                                                  coverCropMeta.naturalWidth,
                                                  coverCropMeta.naturalHeight,
                                                  val,
                                                );
                                              setCoverCropMeta((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      offsetPercent: val,
                                                      align: newCropRect.align,
                                                      cropRectPercent:
                                                        newCropRect,
                                                    }
                                                  : null,
                                              );
                                            }}
                                            onMouseUp={(e) =>
                                              handleCoverPositionChange(
                                                Number(
                                                  (
                                                    e.target as HTMLInputElement
                                                  ).value,
                                                ),
                                              )
                                            }
                                            onTouchEnd={(e) =>
                                              handleCoverPositionChange(
                                                Number(
                                                  (
                                                    e.target as HTMLInputElement
                                                  ).value,
                                                ),
                                              )
                                            }
                                            onKeyUp={(e) =>
                                              handleCoverPositionChange(
                                                Number(
                                                  (
                                                    e.target as HTMLInputElement
                                                  ).value,
                                                ),
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      id="images"
                                      type="button"
                                      className={styles.changeCoverBtn}
                                      disabled={hasAttempt || submitting}
                                      onClick={() =>
                                        coverInput.current?.click()
                                      }
                                    >
                                      <ImagePlus size={16} aria-hidden="true" />
                                      <span>Thay ảnh bìa</span>
                                    </button>
                                  </div>
                                  <p className={styles.cropHelpText}>
                                    Kéo khung trên ảnh hoặc thanh trượt để chọn phần bìa hiển thị.
                                  </p>
                                </div>
                              ) : hasCoverPhoto ? (
                                <div className={styles.photoTile}>
                                  <button
                                    id="images"
                                    type="button"
                                    className={styles.photoAction}
                                    aria-label="Thay ảnh bìa"
                                    disabled={hasAttempt || submitting}
                                    onClick={() => coverInput.current?.click()}
                                  >
                                    <img
                                      src={formData.images[0]}
                                      alt="Ảnh bìa bản sách"
                                    />
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.removePhoto}
                                    aria-label="Xóa ảnh bìa"
                                    disabled={hasAttempt || submitting}
                                    onClick={() => removePhoto(0)}
                                  >
                                    <X size={18} aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  id="images"
                                  type="button"
                                  className={styles.upload}
                                  disabled={hasAttempt || submitting}
                                  onClick={() => coverInput.current?.click()}
                                  {...feedbackProps("images", "image-help")}
                                >
                                  <ImagePlus size={28} aria-hidden="true" />
                                  <strong>Chọn ảnh bìa</strong>
                                </button>
                              )}
                              <input
                                ref={coverInput}
                                id="cover-file"
                                className={styles.fileInput}
                                type="file"
                                tabIndex={-1}
                                aria-label="Tệp ảnh bìa"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) =>
                                  handleImageUpload(event, "cover")
                                }
                                disabled={hasAttempt || submitting}
                              />
                            </div>
                            <div
                              className={styles.supportPhotos}
                              role="group"
                              aria-label="Ảnh phụ"
                            >
                              <h3 className={styles.photoLabel}>Ảnh phụ</h3>
                              <div className={styles.supportGrid}>
                                {formData.images
                                  .slice(Number(hasCoverPhoto))
                                  .map((url, index) => (
                                    <div key={url} className={styles.photoTile}>
                                      <button
                                        id={`support-photo-${index}`}
                                        type="button"
                                        className={styles.photoAction}
                                        aria-label={`Thay ảnh phụ ${index + 1}`}
                                        disabled={hasAttempt || submitting}
                                        onClick={() => {
                                          replacementIndex.current =
                                            index + Number(hasCoverPhoto);
                                          replacementInput.current?.click();
                                        }}
                                      >
                                        <img
                                          src={url}
                                          alt={`Ảnh phụ ${index + 1}`}
                                        />
                                      </button>
                                      <button
                                        id={`support-remove-${index}`}
                                        type="button"
                                        className={styles.removePhoto}
                                        ref={
                                          index ===
                                          imageFiles.length -
                                            Number(hasCoverPhoto) -
                                            1
                                            ? lastPhotoRemove
                                            : undefined
                                        }
                                        aria-label={`Xóa ảnh phụ ${index + 1}`}
                                        disabled={hasAttempt || submitting}
                                        onClick={() =>
                                          removePhoto(
                                            index + Number(hasCoverPhoto),
                                          )
                                        }
                                      >
                                        <X size={18} aria-hidden="true" />
                                      </button>
                                    </div>
                                  ))}
                                <button
                                  id="add-support-photo"
                                  type="button"
                                  className={styles.upload}
                                  aria-label="Thêm ảnh phụ"
                                  aria-describedby="image-help"
                                  hidden={
                                    imageFiles.length - Number(hasCoverPhoto) >=
                                    7
                                  }
                                  disabled={
                                    hasAttempt ||
                                    submitting ||
                                    imageFiles.length - Number(hasCoverPhoto) >=
                                      7
                                  }
                                  onClick={() => supportInput.current?.click()}
                                >
                                  <ImagePlus size={28} aria-hidden="true" />
                                  <strong>Thêm ảnh phụ</strong>
                                  <span>Có thể chọn nhiều ảnh</span>
                                </button>
                              </div>
                              <input
                                ref={supportInput}
                                id="support-images"
                                className={styles.fileInput}
                                type="file"
                                multiple
                                tabIndex={-1}
                                aria-label="Tệp ảnh phụ"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) =>
                                  handleImageUpload(event, "support")
                                }
                                disabled={
                                  hasAttempt ||
                                  submitting ||
                                  imageFiles.length - Number(hasCoverPhoto) >= 7
                                }
                              />
                              <input
                                ref={replacementInput}
                                className={styles.fileInput}
                                type="file"
                                tabIndex={-1}
                                aria-label="Tệp thay ảnh phụ"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={hasAttempt || submitting}
                                onChange={(event) => {
                                  const index = replacementIndex.current;
                                  replacementIndex.current = null;
                                  if (index !== null)
                                    handleImageUpload(event, "support", index);
                                }}
                              />
                            </div>
                          </div>
                          {fieldFeedback("images")}
                          <p id="image-help" className={styles.help}>
                            {imageFiles.length}/8 ảnh · Có thể chọn nhiều ảnh
                            cùng lúc. JPEG, PNG, WebP · tối đa 10 MB/ảnh. Bấm
                            vào ảnh để thay, hoặc nút × để xóa. Ảnh được tải lên
                            khi gửi duyệt.
                          </p>
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <div className={styles.field}>
                            <label htmlFor="condition">
                              Mức độ đã qua sử dụng
                            </label>
                            <select
                              id="condition"
                              disabled={!!bundle}
                              value={formData.condition}
                              onChange={(event) =>
                                setFormData((previous) => ({
                                  ...previous,
                                  condition: event.target.value,
                                }))
                              }
                            >
                              {Object.entries(conditions).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                            {bundle && <p>Tình trạng chung theo cuốn có tình trạng thấp nhất. Chỉnh từng cuốn ở bước Thông tin sách.</p>}
                          </div>
                          <div className={styles.conditionFields}>
                            {textFields.map(([key, label, hint]) => (
                              <div className={styles.field} key={key}>
                                <label htmlFor={key}>{label}</label>
                                <p id={`${key}-hint`} className={styles.help}>
                                  {hint}
                                </p>
                                <textarea
                                  id={key}
                                  rows={key === "description" ? 4 : 2}
                                  required
                                  value={formData[key]}
                                  onChange={(event) =>
                                    setFormData((previous) => ({
                                      ...previous,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  {...feedbackProps(key, `${key}-hint`)}
                                />
                                {fieldFeedback(key)}
                              </div>
                            ))}
                          </div>
                          <div className={styles.questions}>
                            <h3>Kiểm tra điều kiện đăng</h3>
                            <p
                              id="condition-choice-hint"
                              className={styles.help}
                            >
                              Nhấn lại đáp án đang chọn để bỏ chọn.
                            </p>
                            {questions.map(([key, label]) => (
                              <fieldset
                                key={key}
                                id={`${key}-group`}
                                {...feedbackProps(key, "condition-choice-hint")}
                              >
                                <legend className={styles.questionLegend}>
                                  {label}
                                </legend>
                                <div className={styles.questionRow}>
                                  <p aria-hidden="true">{label}</p>
                                  <div className={styles.radioOptions}>
                                    {([true, false] as const).map((value) => (
                                      <label
                                        className={styles.choice}
                                        key={String(value)}
                                      >
                                        <input
                                          type="radio"
                                          name={key}
                                          checked={formData[key] === value}
                                          onKeyDown={(event) => {
                                            // Native radios do not click again on Space when checked.
                                            if (
                                              event.key === " " &&
                                              (formData[key] === value ||
                                                event.repeat)
                                            ) {
                                              event.preventDefault();
                                              if (!event.repeat)
                                                setFormData((previous) => ({
                                                  ...previous,
                                                  [key]: null,
                                                }));
                                            }
                                          }}
                                          onClick={() => {
                                            if (formData[key] === value)
                                              setFormData((previous) => ({
                                                ...previous,
                                                [key]: null,
                                              }));
                                          }}
                                          onChange={() =>
                                            setFormData((previous) => ({
                                              ...previous,
                                              [key]: value,
                                            }))
                                          }
                                        />
                                        <span className={styles.choiceFace}>
                                          <Check size={16} aria-hidden="true" />
                                          <span>{value ? "Có" : "Không"}</span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                                {fieldFeedback(key)}
                              </fieldset>
                            ))}
                          </div>
                        </>
                      )}
                      {step === 4 && (
                        <>
                          {auction ? (
                            <p className={styles.help}>
                              Giá trị khai báo là mức bồi thường tối đa nếu sách
                              hư hỏng hoặc thất lạc tại điểm giao nhận. Đây không
                              phải giá bán; giá khởi điểm đặt khi gửi đấu giá.
                            </p>
                          ) : bundle ? <p className={styles.help}>Bộ {bundle.items.length} cuốn được bán cùng nhau. Người mua nhận toàn bộ danh sách đã ghi ở bước Thông tin sách.</p> : (
                          <fieldset className={styles.mode}>
                            <legend>Bạn muốn bán hay đổi?</legend>
                            <div className={styles.modeOptions}>
                              {(
                                [
                                  ["Sale", "Bán sách"],
                                  ["Exchange", "Đổi sách"],
                                  ["Both", "Bán hoặc đổi"],
                                ] as const
                              ).map(([value, label]) => (
                                <label className={styles.choice} key={value}>
                                  <input
                                    type="radio"
                                    name="mode"
                                    checked={formData.mode === value}
                                    onChange={() =>
                                      setFormData((previous) => ({
                                        ...previous,
                                        mode: value,
                                      }))
                                    }
                                  />
                                  <span className={styles.choiceFace}>
                                    <Check size={18} aria-hidden="true" />
                                    <span>{label}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          )}
                          <p className={styles.help}>
                            {auction
                              ? "Giá trị khai báo tính bằng VNĐ, từ 10.000đ đến 1.000.000đ."
                              : bundle ? "Giá cho cả bộ, từ 10.000đ đến 1.000.000đ. Không bán tách từng cuốn."
                              : "Giá bán và giá trị đổi đều tính bằng VNĐ, từ 10.000đ đến 1.000.000đ."}
                          </p>
                          {needsOrigin && (
                            <>
                              <section
                                className={styles.mode}
                                aria-label="Nơi gửi sách"
                              >
                                <h3>Nơi gửi sách</h3>
                                <p className={styles.help}>
                                  {addresses.data?.items.find(
                                    (item) => item.id === originAddressId,
                                  )?.detail ??
                                    (hasValidOriginAddress()
                                      ? originForm.detail
                                      : "Thêm nơi người giao hàng đến lấy sách của bạn.")}
                                </p>
                                <button
                                  type="button"
                                  className={purchaseStyles.textButton}
                                  onClick={() => {
                                    setOriginDialogError(false);
                                    setOriginDialogOpen(true);
                                  }}
                                >
                                  {hasValidOriginAddress()
                                    ? "Đổi nơi gửi sách"
                                    : "Thêm nơi gửi sách"}
                                </button>
                                {fieldFeedback("originAddress")}
                              </section>
                              <PurchaseDialog
                                open={originDialogOpen}
                                onClose={() => setOriginDialogOpen(false)}
                                busy={submitting}
                                title="Nơi gửi sách"
                                description="Người giao hàng sẽ lấy sách tại địa chỉ này."
                                className={purchaseStyles.flow}
                              >
                                <fieldset
                                  className={`${styles.mode} ${purchaseStyles.form}`}
                                >
                                  <legend>Nơi gửi sách</legend>
                                  <p className={styles.help}>
                                    Người giao hàng sẽ lấy sách tại đây. Người
                                    mua chỉ thấy khu vực luân chuyển, không thấy
                                    địa chỉ chi tiết hoặc số điện thoại của bạn.
                                  </p>
                                  <div className={styles.field}>
                                    <label htmlFor="originAddress">
                                      Địa chỉ đã lưu
                                    </label>
                                    <select
                                      id="originAddress"
                                      {...feedbackProps("originAddress")}
                                      value={originAddressId}
                                      disabled={addresses.isLoading}
                                      onChange={(event) => {
                                        originAddressIntent.current = null;
                                        setOriginAddressId(event.target.value);
                                      }}
                                    >
                                      <option value="">
                                        {addresses.isLoading
                                          ? "Đang tải địa chỉ…"
                                          : "Nhập địa chỉ mới bên dưới"}
                                      </option>
                                      {addresses.data?.items.map((address) => (
                                        <option
                                          key={address.id}
                                          value={address.id}
                                        >
                                          {address.recipientName} ·{" "}
                                          {address.detail}
                                        </option>
                                      ))}
                                    </select>
                                    {addresses.isError && (
                                      <p
                                        role="alert"
                                        className={styles.fieldError}
                                      >
                                        Chưa tải được địa chỉ đã lưu. Bạn vẫn có
                                        thể nhập địa chỉ mới.
                                      </p>
                                    )}
                                  </div>
                                  {!originAddressId && (
                                    <div className={styles.conditionFields}>
                                      <div className={styles.field}>
                                        <label htmlFor="originRecipientName">
                                          Họ tên người gửi
                                        </label>
                                        <input
                                          id="originRecipientName"
                                          minLength={2}
                                          value={originForm.recipientName}
                                          onChange={(event) =>
                                            changeOriginForm(
                                              "recipientName",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label htmlFor="originPhone">
                                          Số điện thoại người gửi
                                        </label>
                                        <input
                                          id="originPhone"
                                          inputMode="numeric"
                                          pattern="0[0-9]{9}"
                                          value={originForm.phone}
                                          onChange={(event) =>
                                            changeOriginForm(
                                              "phone",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label htmlFor="originLocality">
                                          Khu vực luân chuyển sách
                                        </label>
                                        <select
                                          id="originLocality"
                                          value={originForm.localityCode}
                                          disabled={serviceAreas.isLoading}
                                          onChange={(event) =>
                                            changeOriginForm(
                                              "localityCode",
                                              event.target.value,
                                            )
                                          }
                                        >
                                          <option value="">
                                            {serviceAreas.isLoading
                                              ? "Đang tải khu vực…"
                                              : "Chọn khu vực"}
                                          </option>
                                          {serviceAreas.data?.localities.map(
                                            (locality) => (
                                              <option
                                                key={locality.code}
                                                value={locality.code}
                                              >
                                                {locality.label}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </div>
                                      <div className={styles.field}>
                                        <label htmlFor="originDetail">
                                          Địa chỉ chi tiết
                                        </label>
                                        <textarea
                                          id="originDetail"
                                          minLength={5}
                                          value={originForm.detail}
                                          onChange={(event) =>
                                            changeOriginForm(
                                              "detail",
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  )}
                                </fieldset>

                                {originDialogError && (
                                  <p
                                    role="alert"
                                    className={purchaseStyles.error}
                                  >
                                    Điền tên, số điện thoại 10 chữ số, khu vực
                                    và địa chỉ chi tiết để tiếp tục.
                                  </p>
                                )}
                                <div className={purchaseStyles.actions}>
                                  <button
                                    type="button"
                                    className={purchaseStyles.primary}
                                    onClick={() => {
                                      if (hasValidOriginAddress()) {
                                        setOriginDialogError(false);
                                        setOriginDialogOpen(false);
                                      } else setOriginDialogError(true);
                                    }}
                                  >
                                    Dùng nơi gửi này
                                  </button>
                                </div>
                              </PurchaseDialog>
                            </>
                          )}
                          {(
                            [
                              [
                                "salePrice",
                                auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Giá bán",
                                formData.mode !== "Exchange",
                              ],
                              [
                                "exchangeValue",
                                "Giá trị đổi",
                                formData.mode !== "Sale",
                              ],
                            ] as const
                          )
                            .filter(([, , visible]) => visible)
                            .map(([key, label]) => (
                              <div className={styles.field} key={key}>
                                <label htmlFor={key}>{label} (VNĐ)</label>
                                <input
                                  id={key}
                                  inputMode="numeric"
                                  {...feedbackProps(key)}
                                  value={formData[key]}
                                  onChange={(event) =>
                                    setFormData((previous) => ({
                                      ...previous,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  placeholder="Ví dụ: 75000"
                                />
                                {fieldFeedback(key)}
                              </div>
                            ))}
                        </>
                      )}
                      {step === 5 && (
                        <>
                          <BundleManifest bundle={bundle} />
                          <div className={styles.reviewHeading}>
                            <h3>Thông tin đầu sách</h3>
                            {reviewEdit(1)}
                          </div>
                          <dl className={styles.reviewFacts}>
                            {[
                              ["Tên sách", formData.title],
                              ["Tác giả", formData.author],
                              [
                                "Danh mục",
                                categoryFor(classification.categoryId)?.label ||
                                  selectedBook?.category,
                              ],
                              [
                                "Ngôn ngữ",
                                languageOptions.find(
                                  (option) => option.id === language,
                                )?.label || language,
                              ],
                              ...(classification.series
                                ? [["Bộ truyện", classification.series]]
                                : []),
                              ...(selectedBook ? [] : autofillFactRows(autofillFacts)),
                              ...facetsFor(
                                classification.categoryId,
                                classification.attributes,
                              ).flatMap((facet) => {
                                const selected =
                                  classification.attributes[facet.id] || [];
                                return selected.length
                                  ? [
                                      [
                                        facet.label,
                                        selected
                                          .map(
                                            (id) =>
                                              facet.options.find(
                                                (option) => option.id === id,
                                              )?.label || id,
                                          )
                                          .join(", "),
                                      ],
                                    ]
                                  : [];
                              }),
                            ].map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value || "Chưa nhập"}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className={styles.reviewHeading}>
                            <h3>Ảnh bản sách · {imageFiles.length}/8</h3>
                            {reviewEdit(2)}
                          </div>
                          {formData.images.length > 0 ? (
                            <div className={styles.reviewPhotos}>
                              {formData.images.map((url, index) => (
                                <img
                                  key={url}
                                  src={url}
                                  alt={`Ảnh bản sách ${index + 1}${index === 0 && hasCoverPhoto ? ", ảnh bìa" : ""}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className={styles.help}>Chưa có ảnh bản sách.</p>
                          )}
                          <div className={styles.reviewHeading}>
                            <h3>Tình trạng bản sách</h3>
                            {reviewEdit(3)}
                          </div>
                          <dl className={styles.reviewFacts}>
                            <div>
                              <dt>Mức độ đã qua sử dụng</dt>
                              <dd>
                                {
                                  conditions[
                                    formData.condition as keyof typeof conditions
                                  ]
                                }
                              </dd>
                            </div>
                            {textFields.map(([key, label]) => (
                              <div key={key}>
                                <dt>{label}</dt>
                                <dd>{formData[key] || "Chưa nhập"}</dd>
                              </div>
                            ))}
                            {questions.map(([key, label]) => (
                              <div key={key}>
                                <dt>{label}</dt>
                                <dd>
                                  {formData[key] === null
                                    ? "Chưa trả lời"
                                    : formData[key]
                                      ? "Có"
                                      : "Không"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <div className={styles.reviewHeading}>
                            <h3>{auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Bán hoặc đổi"}</h3>
                            {reviewEdit(4)}
                          </div>
                          <dl className={styles.reviewFacts}>
                            <div>
                              <dt>Hình thức</dt>
                              <dd>
                                {auction
                                  ? "Đấu giá qua điểm giao nhận"
                                  : formData.mode === "Sale"
                                  ? "Bán sách"
                                  : formData.mode === "Exchange"
                                    ? "Đổi sách"
                                    : "Bán hoặc đổi"}
                              </dd>
                            </div>
                            {formData.mode !== "Exchange" && (
                              <div>
                                <dt>{auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Giá bán"}</dt>
                                <dd>
                                  {validPrice(formData.salePrice)
                                    ? formatVnd(Number(formData.salePrice))
                                    : "Chưa nhập giá hợp lệ"}
                                </dd>
                              </div>
                            )}
                            {formData.mode !== "Sale" && (
                              <div>
                                <dt>Giá trị đổi</dt>
                                <dd>
                                  {validPrice(formData.exchangeValue)
                                    ? formatVnd(Number(formData.exchangeValue))
                                    : "Chưa nhập giá hợp lệ"}
                                </dd>
                              </div>
                            )}
                            {needsOrigin && (
                              <div>
                                <dt>Nơi gửi sách</dt>
                                <dd>
                                  {originAddressId
                                    ? "Đã chọn một địa chỉ đã lưu"
                                    : hasValidOriginAddress()
                                      ? "Địa chỉ mới sẽ được lưu riêng tư"
                                      : "Chưa chọn nơi gửi"}
                                </dd>
                              </div>
                            )}
                          </dl>
                          {needsOrigin && (
                            <p className={styles.help}>
                              Địa chỉ chi tiết và số điện thoại chỉ dùng cho
                              giao nhận; người mua chỉ thấy khu vực luân chuyển.
                            </p>
                          )}
                          <p className={styles.help}>
                            {auction
                              ? `${imageFiles.length} ảnh bản sách. Sách đấu giá được gửi kiểm duyệt; sau khi duyệt sách không lên kệ mua/đổi mà chờ bạn gửi tới điểm.`
                              : `${imageFiles.length} ảnh bản sách. Bài đăng và thông tin sách được gửi kiểm duyệt trước khi xuất hiện trên kệ.`}
                          </p>
                          {!auction && formData.mode !== "Exchange" && (
                            <p className={styles.help}>
                              Người mua có thể Mua ngay theo giá bạn niêm yết.
                              Khi thanh toán thành công, đơn được chốt và bạn
                              cam kết bàn giao sách trong 48 giờ, không có bước
                              duyệt lại. Chat thương lượng vẫn là luồng riêng.
                            </p>
                          )}
                          <label className={styles.ownership}>
                            <input
                              id="ownership"
                              type="checkbox"
                              {...feedbackProps("ownership")}
                              checked={ownershipDeclared}
                              onChange={(event) =>
                                setOwnershipDeclared(event.target.checked)
                              }
                            />
                            {bundle ? 'Tôi sở hữu toàn bộ các cuốn trong bộ và không đăng bán chúng đồng thời ở tin khác.' : 'Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.'}
                          </label>
                          {fieldFeedback("ownership")}
                        </>
                      )}
                    </fieldset>
                    {!auction && !bundle && formData.mode !== "Exchange" ? <div hidden={step !== 4}>
                      <PriceAssistPanel reference={priceReference} onApplyReference={amount => { setFormData(f => ({ ...f, salePrice: String(amount) })); setAssist(clearAiPriceAttribution); }} state={assist} currentKey={assistKey} currentPrice={formData.salePrice} phase={pricePhase} disabled={submitting || hasAttempt} hasPhoto={imageFiles.length > 0} needsCatalog={!selectedBook} onAsk={() => void askWebPrice()} onApply={amount => {
                        setFormData(prev => ({ ...prev, salePrice: String(amount) }));
                        setAssist(prev => prev.status === "ready" && prev.key === assistKey ? { ...prev, appliedPrice: amount } : prev);
                      }} />
                    </div> : null}
                    {visibleSubmitError && (
                      <div
                        role="alert"
                        ref={errorBox}
                        tabIndex={-1}
                        className={styles.error}
                      >
                        <p>{visibleSubmitError}</p>
                        {validationFailure && (
                          <ul>
                            {Object.entries(fieldErrors)
                              .filter(
                                ([key, message]) =>
                                  message && stepFields.includes(key),
                              )
                              .map(([key, message]) => (
                                <li key={key}>
                                  <button
                                    type="button"
                                    className={styles.textAction}
                                    aria-haspopup={
                                      key === "originAddress"
                                        ? "dialog"
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (key === "originAddress") {
                                        setOriginDialogError(false);
                                        setOriginDialogOpen(true);
                                        return;
                                      }
                                      const target =
                                        document.getElementById(key) ||
                                        document.querySelector<HTMLInputElement>(
                                          `input[name="${key}"]`,
                                        );
                                      target?.focus();
                                    }}
                                  >
                                    {message}
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                        {hasAttempt && (
                          <p>
                            Thông tin đang được giữ nguyên. Bấm thử lại để tiếp
                            tục lần gửi này; đừng tải lại trang.
                          </p>
                        )}
                      </div>
                    )}
                    <p className={styles.help}>
                      Đăng bài miễn phí. Mỗi tài khoản có tối đa 5 bài đang hiển
                      thị trên trang chủ hoặc chờ admin duyệt. Bản nháp, bài bị
                      từ chối, bài đã duyệt nhưng đang ẩn, bài đã bán/đổi hoặc
                      đã lưu trữ không tính vào giới hạn.
                    </p>
                    {hasAttempt && (
                      <p role="status" className={styles.help}>
                        Thông tin đã khóa cho lần gửi này để giữ đúng dữ liệu
                        khi thử lại.
                      </p>
                    )}
                    <div className={styles.actions}>
                      {step > 1 ? (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => changeStep(step - 1)}
                        >
                          <ArrowLeft size={18} aria-hidden="true" />
                          Quay lại
                        </button>
                      ) : (
                        <span className={styles.sessionNote}>
                          Chưa có tự động lưu nháp.
                        </span>
                      )}
                      <button
                        type="submit"
                        className={styles.primary}
                        disabled={submitting}
                      >
                        {step < 5
                          ? "Tiếp tục"
                          : submitting
                            ? "Đang gửi…"
                            : hasAttempt
                              ? "Thử gửi lại"
                              : "Gửi duyệt"}
                        <ArrowRight size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        title="Rời bàn đăng sách?"
        description={
          hasAttempt
            ? "Lần gửi chưa được xác nhận. Rời trang sẽ mất khả năng tiếp tục lần gửi này."
            : "Thông tin chưa được lưu. Rời trang sẽ mất nội dung đang nhập."
        }
        cancelText="Ở lại chỉnh tiếp"
        confirmText="Rời trang"
        onClose={() => blocker.state === "blocked" && blocker.reset()}
        onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      />
    </div>
  );
}
