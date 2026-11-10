import { ApiError, clearAiPriceAttribution, type PriceReferenceState, assistError, decisionFor, failLoading, finishLoading, startLoading, suggestionInput, type AssistForm, type AssistState } from "@used-books/session-client";
import { PriceAssistPanel } from "../components/PriceAssistPanel";
import { createListingPriceRequest, type PricePhase } from "../services/listing-price-assist";
import type { CatalogInput } from "../services/listing-submission";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ArrowLeftRight,
  ArrowRight,
  Check,
  CircleAlert,
  ChevronDown,
  BookOpen,
  ImagePlus,
  MapPin,
  PencilLine,
  Sparkles,
  Tag,
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
  isListingRefusal,
  reloadEditableListingDraft,
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
import { createCoverCropLifecycle } from '../lib/cover-crop-lifecycle';
import {
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
  const submissionBusy = useRef(false);
  const submissionUnknown = useRef(false);
  const [canReviseSubmission, setCanReviseSubmission] = useState(false);
  const [submittedListingId, setSubmittedListingId] = useState<string>();
  // One server draft shared by photo autofill and submission (ADR 0048).
  const [draftAttempt, setDraftAttempt] = useState(createDraftAttempt);
  // Catalog-request facts the seller accepted from photo autofill.
  const [autofillFacts, setAutofillFacts] = useState<AutofillFacts>({});
  const year = autofillFacts.publicationYear;
  const invalidEditionYear = year != null &&
    (!Number.isInteger(year) || year < 1400 || year > new Date().getUTCFullYear());
  const [classification, setClassification] = useState<ClassificationValue>({
    categoryId: "",
    attributes: {},
    series: "",
  });
  const [language, setLanguage] = useState("vi");
  const [selectedBook, setSelectedBook] = useState<PickedBook | null>(null);
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">("catalog");
  const [step, setStep] = useState(1);
  const stepBody = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Replay the entry animation without remounting the draft's fields.
    const animation = stepBody.current?.getAnimations?.()[0];
    if (animation) {
      animation.currentTime = 0;
      animation.play();
    }
  }, [step]);
  const [bundle, setBundle] = useState<BookBundle | null>(null);
  const bundleDraft = useRef<BookBundle | null>(null);
  const singleTerms = useRef<{mode: typeof formData.mode; salePrice: string; exchangeValue: string; condition: typeof formData.condition} | null>(null);
  const bundlePrice = useRef("");
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
  const coverCropError = useRef<string | undefined>(undefined);
  const coverCrops = useMemo(() => createCoverCropLifecycle(), []);
  const [coverCropBusy, setCoverCropBusy] = useState(false);
  useEffect(() => {
    coverCrops.activate();
    return () => coverCrops.dispose();
  }, [coverCrops]);
  const coverInput = useRef<HTMLInputElement>(null);
  const supportInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementUrl = useRef<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const photoViewer = useRef<HTMLDialogElement>(null);
  const photoViewerOpen = previewImage !== null;
  useEffect(() => {
    if (!photoViewerOpen) return;
    return lockPageScroll();
  }, [photoViewerOpen]);
  const location = useLocation();
  const session = useSession();
  const queryClient = useQueryClient();
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
    targetCategory: "",
    targetAuthor: "",
    targetDescription: "",
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
      const answer = await requestPrice(assistForm, assistCatalog, [...imageFiles], phase => {
        if (priceToken.current === token) setPricePhase(phase);
      }, value => { if (priceToken.current === token) setPriceReference({ key: assistKey, value }); });
      setAssist(prev => finishLoading(prev, token, answer.listingId, answer.suggestion));
    } catch (error) {
      setAssist(prev => failLoading(prev, token, assistError(error)));
    } finally { if (priceToken.current === token) priceBusy.current = false; }
  }
  const needsOrigin = !auction && formData.mode !== "Exchange";

  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<string[]>([]);
  const imageFilesRef = useRef<File[]>([]);
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
    setEntryMode("manual");
    if (field === "title" || field === "authors") {
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
      if (fields.language) setLanguage(fields.language);
      return;
    }
    setAutofillFacts((previous) => ({ ...previous, [field]: fields[field] }));
  }
  function focusAfterRender(
    target:
      | "heading"
      | "error"
      | "book-info-error"
      | "selected-book"
      | "catalog-search"
      | "manual-title",
  ) {
    if (focusFrame.current !== undefined)
      cancelAnimationFrame(focusFrame.current);
    const previousFocus = document.activeElement;
    focusFrame.current = requestAnimationFrame(() => {
      // The next field may already have focus by the time React paints.
      const active = document.activeElement;
      if (active && active !== document.body && active !== previousFocus) return;
      if (target === "heading" || target === "error") {
        (target === "heading" ? heading : errorBox).current?.focus();
      } else if (target === "book-info-error") {
        const field = document.querySelector<HTMLElement>(
          '#bundle[aria-invalid="true"], #sell-book-entry [aria-invalid="true"], #sell-change-book[aria-describedby]',
        );
        const disclosure = field?.closest("details");
        if (disclosure) disclosure.open = true;
        (field ?? heading.current)?.focus();
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

  function clearCoverCropError() {
    const message = coverCropError.current;
    if (message !== undefined) {
      setSubmitError(current => current === message ? undefined : current);
      coverCropError.current = undefined;
    }
  }
  function reportCoverCropError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    coverCropError.current = message;
    setValidationFailure(false);
    setSubmitError(message);
  }

  function updatePhotos(urls: string[], files: File[]) {
    imageRefs.current = urls;
    imageFilesRef.current = files;
    setFormData(previous => ({ ...previous, images: urls }));
    setImageFiles(files);
  }
  async function runCoverCrop(file: File, position: CoverPosition, existingRawUrl?: string) {
    setCoverCropBusy(true);
    try { return await coverCrops.run(file, position, existingRawUrl); }
    finally { setCoverCropBusy(coverCrops.isPending()); }
  }

  const handleCoverPositionChange = async (position: CoverPosition) => {
    if (!coverCropMeta || hasAttempt || submitting) return;
    clearCoverCropError();
    try {
      const result = await runCoverCrop(
        coverCropMeta.rawFile,
        position,
        coverCropMeta.rawUrl,
      );
      if (!result) return;
      const previous = coverCropMetaRef.current;
      const index = previous ? imageRefs.current.indexOf(previous.croppedUrl) : -1;
      if (!previous || index < 0) {
        URL.revokeObjectURL(result.croppedUrl);
        return;
      }
      URL.revokeObjectURL(previous.croppedUrl);
      setCoverCropMeta(result);
      coverCropMetaRef.current = result;
      updatePhotos(
        imageRefs.current.map((url, i) => i === index ? result.croppedUrl : url),
        imageFilesRef.current.map((file, i) => i === index ? result.croppedFile : file),
      );
    } catch (err) {
      setCoverCropMeta(coverCropMetaRef.current);
      reportCoverCropError(err, "Chưa cập nhật được vị trí cắt ảnh bìa.");
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
    replaceUrl?: string,
  ) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    addSelectedImages(selected, kind, replaceUrl);
  };
  const addSelectedImages = (selected: File[], kind: "cover" | "support", replaceUrl?: string) => {
    if (!selected.length || hasAttempt || submitting) return;
    const urls = imageRefs.current;
    const files = imageFilesRef.current;
    const replaceAt = replaceUrl === undefined ? undefined : urls.indexOf(replaceUrl);
    if (replaceAt === -1) {
      setValidationFailure(false);
      setSubmitError("Ảnh cần thay không còn trong bản nháp. Chọn lại ảnh muốn thay.");
      return;
    }
    const currentCover = !!coverCropMetaRef.current && urls[0] === coverCropMetaRef.current.croppedUrl;
    const remaining =
      kind === "cover" || replaceAt !== undefined
        ? 1
        : 7 - (urls.length - Number(currentCover));
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
      coverCropError.current = undefined;
      photoFocusTarget.current = "images";
      const file = selected[0]!;
      runCoverCrop(file, "center")
        .then((result) => {
          if (!result) return;
          const previous = coverCropMetaRef.current;
          const oldIndex = previous ? imageRefs.current.indexOf(previous.croppedUrl) : -1;
          const retainedUrls = imageRefs.current.filter((_, i) => i !== oldIndex);
          const retainedFiles = imageFilesRef.current.filter((_, i) => i !== oldIndex);
          if (previous) {
            URL.revokeObjectURL(previous.croppedUrl);
            URL.revokeObjectURL(previous.rawUrl);
          }
          setCoverCropMeta(result);
          coverCropMetaRef.current = result;
          updatePhotos([result.croppedUrl, ...retainedUrls], [result.croppedFile, ...retainedFiles]);
          setHasCoverPhoto(true);
        })
        .catch((err) => {
          reportCoverCropError(err, "Chưa xử lý được ảnh bìa.");
        });
      return;
    }

    // Validate the whole batch before allocating previews; retain upload order.
    const previews = selected.map((file) => URL.createObjectURL(file));
    if (replaceAt !== undefined) {
      URL.revokeObjectURL(urls[replaceAt]!);
      photoFocusTarget.current = `support-photo-${replaceAt - Number(currentCover)}`;
      updatePhotos(
        urls.map((url, index) => index === replaceAt ? previews[0]! : url),
        files.map((file, index) => index === replaceAt ? selected[0]! : file),
      );
    } else {
      focusLastPhoto.current =
        urls.length - Number(currentCover) + selected.length === 7;
      updatePhotos([...urls, ...previews], [...files, ...selected]);
    }
  };

  const handleSubmit = async () => {
    if (submissionBusy.current || canReviseSubmission || submitting || coverCropBusy || coverCrops.isPending()) return;
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
      !selectedBook && invalidEditionYear && "năm xuất bản hợp lệ",
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
      if (invalidStep === 1) focusAfterRender("book-info-error");
      setSubmitError(`Cần bổ sung: ${missing.join(", ")}.`);
      return;
    }
    submissionBusy.current = true;
    setSubmitting(true);
    setCanReviseSubmission(false);
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
        priceAssist: bundle ? undefined : decisionFor(assist, assistKey, assistForm),
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
        exchangePreferences:
          !auction &&
          formData.mode !== "Sale" &&
          (formData.targetCategory.trim() ||
            formData.targetAuthor.trim() ||
            formData.targetDescription.trim())
            ? {
                targetCategory: formData.targetCategory.trim() || null,
                targetAuthor: formData.targetAuthor.trim() || null,
                targetDescription: formData.targetDescription.trim() || null,
              }
            : null,
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
      const listingId = await submission.current();
      const currentOwner = apiSession.getSnapshot();
      if (session.status !== "authenticated" || currentOwner.status !== "authenticated" || currentOwner.user.id !== session.user.id) return;
      void queryClient.invalidateQueries({ queryKey: ["my-listings", currentOwner.user.id] });
      setSubmittedListingId(listingId);
      setStep(6);
    } catch (error) {
      const refused = isListingRefusal(error);
      const quotaReached = error instanceof ApiError && error.code === "ListingLimitReached";
      if (submission.current) {
        // After freeing a slot, retry the same saved draft and submit command.
        setCanReviseSubmission(refused && !quotaReached && !submissionUnknown.current);
        if (!refused) submissionUnknown.current = true;
      }
      setSubmitError(
        error instanceof Error ? error.message : "Chưa gửi được bài đăng.",
      );
    } finally {
      submissionBusy.current = false;
      setSubmitting(false);
    }
  };

  async function reviseSubmission() {
    if (!canReviseSubmission || submissionBusy.current) return;
    submissionBusy.current = true;
    setSubmitting(true);
    try {
      await reloadEditableListingDraft(draftAttempt);
      const actor = apiSession.getSnapshot();
      if (session.status !== "authenticated" || actor.status !== "authenticated" || actor.user.id !== session.user.id) return;
      submission.current = null;
      submissionUnknown.current = false;
      setHasAttempt(false);
      setCanReviseSubmission(false);
      setSubmitError(undefined);
      changeStep(1);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Chưa tải lại được bản nháp.");
    } finally {
      submissionBusy.current = false;
      setSubmitting(false);
    }
  }

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
  const bundleIssue = bundle ? bundleError(bundle) : undefined;
  const bookInfoErrors = {
    title: !formData.title.trim() ? "Nhập tên sách." : undefined,
    author: !formData.author.trim() ? "Nhập tên tác giả." : undefined,
    "sell-category":
      !selectedBook && !classification.categoryId
        ? "Chọn danh mục sách."
        : !selectedBook &&
            classificationErrors(classification.categoryId, classification.attributes).length
          ? "Chọn lại danh mục và kiểm tra thuộc tính của sách."
          : undefined,
    "sell-publicationYear":
      !selectedBook && invalidEditionYear
        ? `Nhập năm từ 1400 đến ${new Date().getUTCFullYear()} hoặc để trống.`
        : undefined,
  };
  const bookInfoError = Object.values(bookInfoErrors).find(Boolean);
  function stepError(forStep: number) {
    if (forStep === 1) return bundleIssue || bookInfoError;
    let message: string | undefined;
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
    if (forStep === 4 && (
      (formData.mode !== "Exchange" && !validPrice(formData.salePrice)) ||
      (formData.mode !== "Sale" && !validPrice(formData.exchangeValue)) ||
      (needsOrigin && !hasValidOriginAddress())
    )) message = "Hoàn tất các mục được đánh dấu để tiếp tục.";
    return message;
  }
  function continueStep() {
    const message = stepError(step);
    setCheckedSteps((previous) => [...new Set([...previous, step])]);
    setSubmitError(message);
    setValidationFailure(!!message);
    if (!message) changeStep(step + 1);
    else focusAfterRender(step === 1 ? "book-info-error" : "error");
  }
  function validPrice(raw: string) {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 10_000 && value <= 1_000_000;
  }
  const hasValidOriginAddress = useCallback(() => {
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
  }, [addresses.data, serviceAreas.data, originAddressId, originForm]);
  function changeOriginForm(field: keyof typeof originForm, value: string) {
    originAddressIntent.current = null;
    setOriginForm((previous) => ({ ...previous, [field]: value }));
  }
  function removePhoto(url: string) {
    if (hasAttempt || submitting) return;
    const urls = imageRefs.current;
    const files = imageFilesRef.current;
    const index = urls.indexOf(url);
    if (index < 0) return;
    const currentCover = !!coverCropMetaRef.current && urls[0] === coverCropMetaRef.current.croppedUrl;
    const removingCover = currentCover && index === 0;
    const supportCount = urls.length - Number(currentCover);
    photoFocusTarget.current =
      removingCover
        ? "images"
        : supportCount > 1
          ? `support-remove-${Math.min(index - Number(currentCover), supportCount - 2)}`
          : "add-support-photo";
    if (removingCover) {
      clearCoverCropError();
      coverCrops.invalidate();
      setCoverCropBusy(false);
      setHasCoverPhoto(false);
      if (coverCropMetaRef.current?.rawUrl) {
        URL.revokeObjectURL(coverCropMetaRef.current.rawUrl);
      }
      setCoverCropMeta(null);
      coverCropMetaRef.current = null;
    }
    URL.revokeObjectURL(url);
    updatePhotos(urls.filter((_, i) => i !== index), files.filter((_, i) => i !== index));
  }
  const fieldErrors: Record<string, string | undefined> = {
    ...bookInfoErrors,
    bundle: bundleIssue,
    "sell-catalog-search":
      !selectedBook && entryMode === "catalog" && bookInfoError
        ? "Chọn một kết quả hoặc chuyển sang Tự nhập thông tin."
        : undefined,
    "sell-change-book":
      selectedBook && bookInfoError
        ? "Đầu sách này thiếu tên hoặc tác giả. Hãy chọn đầu sách khác hoặc tự nhập."
        : undefined,
    images: !hasCoverPhoto ? "Thêm ảnh bìa bản sách." : undefined,
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
    const checkOnBlur = step !== 1 || key === "sell-publicationYear";
    return checkedSteps.includes(step) || (checkOnBlur && touched.includes(key))
      ? fieldErrors[key]
      : undefined;
  }
  function fieldFeedback(key: string) {
    const message = shownError(key);
    return message ? (
      <p
        id={`${key}-error`}
        className={step === 1 ? styles.bookFieldError : styles.fieldError}
      >
        {step === 1 && <CircleAlert size={15} aria-hidden="true" />}
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
  const salePriceLabel = auction ? "Giá trị khai báo" : bundle ? "Giá cả bộ" : "Giá bán";
  const hasExchangeCriteria = [formData.targetCategory, formData.targetAuthor, formData.targetDescription]
    .some((value) => value.trim());
  const originReady = hasValidOriginAddress();
  const originDetail = originReady
    ? addresses.data?.items.find((item) => item.id === originAddressId)?.detail ?? originForm.detail
    : "";

  function tradeAmount(key: "salePrice" | "exchangeValue", label: string) {
    const hint = shownError(key) ? undefined : `sell-${key}-amount-hint`;
    const valid = validPrice(formData[key]);
    return (
      <div className={`${styles.field} ${styles.tradeAmount}`}>
        <label htmlFor={key}>{label} <span>(VNĐ)</span></label>
        <input
          id={key}
          inputMode="numeric"
          {...feedbackProps(key, hint)}
          value={formData[key]}
          onChange={(event) => setFormData((previous) => ({ ...previous, [key]: event.target.value }))}
          placeholder="Ví dụ 75000"
        />
        {hint && (
          <p className={valid ? styles.tradeAmountValue : styles.help} id={hint}>
            {valid ? formatVnd(Number(formData[key])) : "10.000–1.000.000 đ"}
          </p>
        )}
        {fieldFeedback(key)}
      </div>
    );
  }

  const postingLimit =
    "Đăng bài miễn phí. Mỗi tài khoản có tối đa 5 bài đang hiển thị trên trang chủ hoặc chờ admin duyệt. Bản nháp, bài bị từ chối, bài đã duyệt nhưng đang ẩn, bài đã bán/đổi hoặc đã lưu trữ không tính vào giới hạn.";
  const stepHelp = [
    null,
    "Ảnh thật giúp người đọc nhìn rõ bản sách của bạn.",
    "Kể rõ những dấu vết đã có trên cuốn sách.",
    auction || bundle ? null : "Chọn cách giao dịch. Các mục cần điền sẽ hiện bên dưới.",
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
    if (value === step) return "Đang chỉnh";
    if (completeStep(value)) return "Đủ thông tin";
    if (
      checkedSteps.includes(value) ||
      hasAttempt ||
      validationFailure ||
      (value < step && Boolean(stepError(value)))
    ) {
      return "Thiếu thông tin";
    }
    return "Chưa hoàn thành";
  }
  const stepFields: string[] =
    step === 2
      ? ["images"]
      : step === 3
        ? [
            ...textFields.map(([key]) => key),
            ...questions.map(([key]) => key),
          ]
        : step === 4
          ? ["salePrice", "exchangeValue", "originAddress"]
          : ["ownership"];
  const visibleSubmitError = !validationFailure
    ? submitError
    : step === 1
      ? undefined
      : stepError(step) || (step === 5 ? fieldErrors.ownership : undefined);

  const progressFields = useMemo(() => {
    const list: { key: string; label: string; valid: boolean }[] = [];

    if (bundle) {
      list.push({
        key: "bundle",
        label: "Thông tin bộ sách",
        valid: !bundleError(bundle),
      });
    } else {
      list.push({
        key: "title",
        label: "Tên sách",
        valid: Boolean(formData.title.trim()),
      });
      list.push({
        key: "author",
        label: "Tác giả",
        valid: Boolean(formData.author.trim()),
      });
      list.push({
        key: "category",
        label: "Danh mục sách",
        valid: Boolean(
          selectedBook ||
            (classification.categoryId &&
              classificationErrors(
                classification.categoryId,
                classification.attributes,
              ).length === 0),
        ),
      });
    }

    // Step 2: Ảnh bản sách
    list.push({
      key: "images",
      label: "Ảnh bìa bản sách",
      valid: hasCoverPhoto,
    });

    // Step 3: Tình trạng
    list.push({
      key: "condition",
      label: "Tình trạng sách",
      valid: Boolean(formData.condition),
    });
    list.push({
      key: "pages",
      label: "Ruột sách",
      valid: Boolean(formData.pages.trim()),
    });
    list.push({
      key: "coverNote",
      label: "Bìa và gáy",
      valid: Boolean(formData.coverNote.trim()),
    });
    list.push({
      key: "notes",
      label: "Ghi chú, đánh dấu",
      valid: Boolean(formData.notes.trim()),
    });
    list.push({
      key: "accessories",
      label: "Phụ kiện",
      valid: Boolean(formData.accessories.trim()),
    });
    list.push({
      key: "description",
      label: "Mô tả chung",
      valid: formData.description.trim().length >= 30,
    });
    list.push({
      key: "readable",
      label: "Nội dung đọc rõ",
      valid: formData.readable === true,
    });
    list.push({
      key: "hasMissingPages",
      label: "Không thiếu trang",
      valid: formData.hasMissingPages !== null,
    });
    list.push({
      key: "missingEssentialContent",
      label: "Đủ nội dung trọng yếu",
      valid: formData.missingEssentialContent === false,
    });

    // Step 4: Giá / Luân chuyển
    if (formData.mode !== "Exchange") {
      list.push({
        key: "salePrice",
        label: "Giá bán",
        valid: validPrice(formData.salePrice),
      });
    }
    if (formData.mode !== "Sale") {
      list.push({
        key: "exchangeValue",
        label: "Giá trị đổi",
        valid: validPrice(formData.exchangeValue),
      });
    }
    if (needsOrigin) {
      list.push({
        key: "originAddress",
        label: "Nơi gửi sách",
        valid: hasValidOriginAddress(),
      });
    }

    // Step 5: Cam kết quyền sở hữu
    list.push({
      key: "ownership",
      label: "Cam kết quyền sở hữu",
      valid: ownershipDeclared,
    });

    return list;
  }, [
    bundle,
    formData,
    selectedBook,
    classification,
    hasCoverPhoto,
    needsOrigin,
    hasValidOriginAddress,
    ownershipDeclared,
  ]);

  const validFieldsCount = progressFields.filter((f) => f.valid).length;
  const totalFieldsCount = progressFields.length;
  const formProgressPercent = Math.round(
    (validFieldsCount / totalFieldsCount) * 100,
  );
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
            listingId={submittedListingId}
            onPostAnother={() => {
              coverCropError.current = undefined;
              priceToken.current += 1;
              priceBusy.current = false;
              setAssist({ status: "idle" });
              setPriceReference(null);
              setPricePhase("catalog");
              coverCrops.invalidate();
              setCoverCropBusy(false);
              imageRefs.current.forEach((url) => URL.revokeObjectURL(url));
              imageRefs.current = [];
              imageFilesRef.current = [];
              replacementUrl.current = null;
              if (coverCropMetaRef.current) {
                URL.revokeObjectURL(coverCropMetaRef.current.rawUrl);
              }
              coverCropMetaRef.current = null;
              setCoverCropMeta(null);
              submission.current = null;
              submissionUnknown.current = false;
              setCanReviseSubmission(false);
              setSubmittedListingId(undefined);
              // A fresh draft: the old stage keys would replay the sent listing.
              setDraftAttempt(createDraftAttempt());
              setAutofillFacts({});
              setBundle(null);
              bundleDraft.current = null;
              singleTerms.current = null;
              bundlePrice.current = "";
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
                targetCategory: "",
                targetAuthor: "",
                targetDescription: "",
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
                {steps.map((label, index) => {
                  const stepNum = index + 1;
                  const isCurrent = step === stepNum;
                  const isComplete = completeStep(stepNum);
                  const isError =
                    !isComplete &&
                    (checkedSteps.includes(stepNum) ||
                      hasAttempt ||
                      validationFailure ||
                      (stepNum < step && Boolean(stepError(stepNum))));

                  return (
                    <li key={label}>
                      <button
                        type="button"
                        aria-current={isCurrent ? "step" : undefined}
                        disabled={submitting}
                        aria-label={`${stepNum}. ${label}, ${statusForStep(stepNum).toLowerCase()}`}
                        onClick={() => changeStep(stepNum)}
                        className={
                          isCurrent
                            ? styles.stepCurrent
                            : isComplete
                            ? styles.stepComplete
                            : isError
                            ? styles.stepHasError
                            : ""
                        }
                      >
                        <span
                          className={`${styles.stepNumber} ${
                            isComplete
                              ? styles.stepNumberComplete
                              : isError
                              ? styles.stepNumberError
                              : ""
                          }`}
                        >
                          {isComplete ? (
                            <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                          ) : isError ? (
                            <X size={15} strokeWidth={2.8} aria-hidden="true" />
                          ) : (
                            stepNum
                          )}
                        </span>
                        <span className={styles.stepLabel}>
                          {label}
                          <small
                            className={
                              isCurrent
                                ? ""
                                : isComplete
                                ? styles.stepStatusComplete
                                : isError
                                ? styles.stepStatusError
                                : ""
                            }
                          >
                            {statusForStep(stepNum)}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
            <div
              className={styles.progressBarCard}
              role="region"
              aria-label="Tiến độ điền thông tin sách"
            >
              <div className={styles.progressBarHeader}>
                <div className={styles.progressBarLead}>
                  <Sparkles size={16} className={styles.progressSparkleIcon} aria-hidden="true" />
                  <span className={styles.progressBarTitle}>Tiến độ điền thông tin</span>
                  {formProgressPercent === 100 && (
                    <span className={styles.progressCompleteBadge}>Hoàn thành 100%</span>
                  )}
                </div>
                <div className={styles.progressBarStats}>
                  <span className={styles.progressBarCount}>
                    <strong>{validFieldsCount}</strong>/{totalFieldsCount} khung hợp lệ
                  </span>
                  <span className={styles.progressBarPercent}>
                    {formProgressPercent}%
                  </span>
                </div>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuenow={formProgressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Tiến độ hoàn thiện: ${formProgressPercent}% (${validFieldsCount} trên ${totalFieldsCount} khung điền)`}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${formProgressPercent}%` }}
                >
                  <div className={styles.progressShimmer} aria-hidden="true" />
                </div>
              </div>
            </div>
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
                <div ref={stepBody} className={styles.stepBody}>
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
                  <h2 ref={heading} tabIndex={-1}>
                    {steps[step - 1]}
                  </h2>
                  {stepHelp[step - 1] && (
                    <p className={styles.stepHelp}>{stepHelp[step - 1]}</p>
                  )}
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
                      <div className={styles.bookInfoFields} hidden={step !== 1}>
                          {!auction && <>
                            <div className={styles.bookType}>
                              <span id="sell-book-type">Bạn đăng</span>
                              <div className={styles.typeChoice} role="group" aria-labelledby="sell-book-type">
                                <button type="button" aria-pressed={!bundle} onClick={() => {
                                  if (!bundle) return;
                                  bundleDraft.current = bundle;
                                  bundlePrice.current = formData.salePrice;
                                  setBundle(null);
                                  setOwnershipDeclared(false);
                                  if (singleTerms.current) setFormData(previous => ({ ...previous, ...singleTerms.current! }));
                                }}>Sách lẻ</button>
                                <button type="button" aria-pressed={!!bundle} onClick={() => {
                                  if (bundle) return;
                                  singleTerms.current = { mode: formData.mode, salePrice: formData.salePrice, exchangeValue: formData.exchangeValue, condition: formData.condition };
                                  const restored = bundleDraft.current || { title: '', wholeOnly: true as const, exclusiveOwnershipDeclared: true as const,
                                    items: [{ label: '', condition: 'Good' as const, notes: '' }, { label: '', condition: 'Good' as const, notes: '' }] };
                                  setBundle(restored);
                                  setOwnershipDeclared(false);
                                  setFormData(previous => ({ ...previous, mode: 'Sale', salePrice: bundlePrice.current, exchangeValue: '', condition: bundleCondition(restored) }));
                                }}>Bộ sách</button>
                              </div>
                            </div>
                            {bundle && <BundleEditor value={bundle} error={shownError('bundle')} onChange={next => {
                              setBundle(next);
                              setOwnershipDeclared(false);
                              setFormData(previous => ({ ...previous, condition: bundleCondition(next), mode: 'Sale', exchangeValue: '' }));
                            }} />}
                          </>}
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
                          {bundle && !selectedBook && (
                            <h3 className={styles.bookEntryHeading}>Đầu sách đại diện</h3>
                          )}
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
                          <div
                            id="sell-book-entry"
                            className={styles.bookEntry}
                          >
                            {!selectedBook && entryMode === "catalog" && (
                              <div className={styles.catalogEntry}>
                                <CatalogBookPicker
                                  compact
                                  label="Tìm trong danh mục"
                                  feedback={feedbackProps("sell-catalog-search")}
                                  feedbackMessage={fieldFeedback("sell-catalog-search")}
                                  onSelect={chooseBook}
                                />
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
                                {fieldFeedback("sell-change-book")}
                                <button
                                  id="sell-change-book"
                                  type="button"
                                  className={styles.textAction}
                                  aria-describedby={shownError("sell-change-book") ? "sell-change-book-error" : undefined}
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
                                <div className={styles.bookIdentity}>
                                  <p className={styles.help}>Ghi tên sách và tác giả như trên bìa.</p>
                                  {(
                                    [
                                      ["title", "Tên sách", "Ví dụ: Truyện Kiều"],
                                      ["author", "Tác giả", "Ví dụ: Nguyễn Du"],
                                    ] as const
                                  ).map(([key, label, placeholder]) => (
                                    <div
                                      className={styles.field}
                                      key={key}
                                    >
                                      <label htmlFor={key}>{label}</label>
                                      <input
                                        id={key}
                                        required
                                        {...feedbackProps(key)}
                                        value={formData[key]}
                                        onChange={(event) => {
                                          const value = event.currentTarget.value;
                                          setFormData((previous) => ({
                                            ...previous,
                                            [key]: value,
                                          }));
                                        }}
                                        placeholder={placeholder}
                                      />
                                      {fieldFeedback(key)}
                                    </div>
                                  ))}
                                </div>
                                <fieldset className={styles.classification}>
                                  <legend>Phân loại đầu sách</legend>
                                  <CatalogClassificationFields
                                    editing
                                    collapseOptional
                                    categoryFeedback={feedbackProps("sell-category")}
                                    categoryMessage={fieldFeedback("sell-category")}
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
                                </fieldset>
                                <details
                                  className={styles.editionFacts}
                                  open={autofillFactRows(autofillFacts).length ? true : undefined}
                                >
                                  <summary>
                                    <span>Thông tin ấn bản</span>
                                    <span className={styles.disclosureHint}>Tùy chọn</span>
                                    <ChevronDown size={16} aria-hidden="true" />
                                  </summary>
                                  <div className={styles.editionFields}>
                                    {([
                                      ["publisher", "Nhà xuất bản", 200],
                                      ["publicationYear", "Năm xuất bản", 4],
                                      ["edition", "Lần xuất bản", 200],
                                      ["isbn", "ISBN", 30],
                                    ] as const).map(([key, label, maxLength]) => (
                                      <div key={key} className={styles.field}>
                                        <label htmlFor={`sell-${key}`}>{label}</label>
                                        <input
                                          id={`sell-${key}`}
                                          type={key === "publicationYear" ? "number" : "text"}
                                          maxLength={key === "publicationYear" ? undefined : maxLength}
                                          {...feedbackProps(`sell-${key}`)}
                                          value={autofillFacts[key] ?? ""}
                                          onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            setAutofillFacts((previous) => ({
                                              ...previous,
                                              [key]: key === "publicationYear" && value ? Number(value) : value || null,
                                            }));
                                          }}
                                        />
                                        {fieldFeedback(`sell-${key}`)}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </>
                            )}
                          </div>
                      </div>
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
                                        removePhoto(formData.images[0]!);
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
                                    onClick={() => removePhoto(formData.images[0]!)}
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
                                          replacementUrl.current = url;
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
                                          removePhoto(url)
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
                                  const url = replacementUrl.current;
                                  replacementUrl.current = null;
                                  if (url !== null)
                                    handleImageUpload(event, "support", url);
                                  else event.target.value = "";
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
                        <div className={styles.tradeDesk}>
                          {!auction && !bundle && (
                            <fieldset className={styles.tradeModes}>
                              <legend>Hình thức giao dịch</legend>
                              <div className={styles.tradeChoices}>
                                {([
                                  ["Sale", "Bán sách", "Nhận thanh toán", Tag],
                                  ["Exchange", "Đổi sách", "Nhận đề nghị đổi", ArrowLeftRight],
                                  ["Both", "Bán hoặc đổi", "Chấp nhận cả hai", BookOpen],
                                ] as const).map(([value, label, hint, Icon]) => (
                                  <label className={styles.choice} data-focus-surface key={value}>
                                    <input
                                      type="radio"
                                      name="mode"
                                      aria-label={label}
                                      aria-describedby={`trade-mode-${value}`}
                                      checked={formData.mode === value}
                                      onChange={() => setFormData((previous) => ({ ...previous, mode: value }))}
                                    />
                                    <span className={`${styles.choiceFace} ${styles.tradeChoiceFace}`}>
                                      <Icon size={18} aria-hidden="true" className={styles.tradeChoiceIcon} />
                                      <span>
                                        <strong>{label}</strong>
                                        <small id={`trade-mode-${value}`}>{hint}</small>
                                      </span>
                                      <Check size={16} aria-hidden="true" className={styles.tradeChoiceCheck} />
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          )}

                          {formData.mode !== "Exchange" && (
                            <section className={styles.tradeSection} aria-label={salePriceLabel}>
                              {tradeAmount("salePrice", salePriceLabel)}
                              {auction ? (
                                <p className={styles.help}>Mức bồi thường tối đa nếu sách hư hỏng hoặc thất lạc tại điểm giao nhận. Giá khởi điểm đặt khi gửi đấu giá.</p>
                              ) : bundle ? (
                                <p className={styles.help}>Giá cho cả bộ {bundle.items.length} cuốn.</p>
                              ) : (
                                <PriceAssistPanel
                                  state={assist}
                                  reference={priceReference}
                                  currentKey={assistKey}
                                  currentPrice={formData.salePrice}
                                  phase={pricePhase}
                                  disabled={submitting || hasAttempt}
                                  hasPhoto={imageFiles.length > 0}
                                  needsCatalog={!selectedBook}
                                  onAsk={() => void askWebPrice()}
                                  onEnterPrice={() => document.getElementById("salePrice")?.focus()}
                                  onApplyReference={(amount) => {
                                    setFormData((previous) => ({ ...previous, salePrice: String(amount) }));
                                    setAssist(clearAiPriceAttribution);
                                  }}
                                  onApply={(amount) => {
                                    setFormData((previous) => ({ ...previous, salePrice: String(amount) }));
                                    setAssist((previous) => previous.status === "ready" && previous.key === assistKey
                                      ? { ...previous, appliedPrice: amount }
                                      : previous);
                                  }}
                                />
                              )}
                            </section>
                          )}

                          {!auction && formData.mode !== "Sale" && (
                            <section className={styles.tradeSection} aria-label="Điều kiện đổi sách">
                              {tradeAmount("exchangeValue", "Giá trị đổi")}
                              <p className={styles.help}>Mức để hai bên so sánh khi đề nghị đổi sách.</p>
                              <details className={styles.tradeCriteria}>
                                <summary>
                                  <span>Sách bạn muốn đổi lấy</span>
                                  <small>{hasExchangeCriteria ? "Đã thêm" : "Tùy chọn"}</small>
                                  <ChevronDown size={16} aria-hidden="true" />
                                </summary>
                                <div className={styles.tradeCriteriaFields}>
                                  {([
                                    ["targetCategory", "Thể loại mong muốn", "Ví dụ: Văn học", 100],
                                    ["targetAuthor", "Tác giả mong muốn", "Ví dụ: Haruki Murakami", 150],
                                    ["targetDescription", "Ghi chú khi đổi", "Ví dụ: Ưu tiên bản dịch mới", 500],
                                  ] as const).map(([key, label, placeholder, maxLength]) => (
                                    <div className={styles.field} key={key}>
                                      <label htmlFor={key}>{label}</label>
                                      <input
                                        id={key}
                                        type="text"
                                        placeholder={placeholder}
                                        value={formData[key]}
                                        maxLength={maxLength}
                                        onChange={(event) => setFormData((previous) => ({ ...previous, [key]: event.target.value }))}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </section>
                          )}

                          {needsOrigin && (
                            <>
                              <section className={`${styles.tradeSection} ${styles.tradeOrigin}`} aria-labelledby="sell-origin-title">
                                <div className={styles.tradeOriginHeading}>
                                  <MapPin size={19} aria-hidden="true" />
                                  <h3 id="sell-origin-title">Nơi gửi sách</h3>
                                  <span className={styles.tradeOriginStatus} data-ready={originReady}>
                                    {originReady ? "Đã chọn" : "Cần chọn"}
                                  </span>
                                </div>
                                <div className={styles.tradeOriginBody}>
                                  <p className={styles.help}>{originDetail || "Chọn địa chỉ để người giao hàng đến lấy sách."}</p>
                                  <button
                                    type="button"
                                    className={styles.tradeOriginButton}
                                    aria-haspopup="dialog"
                                    onClick={() => {
                                      setOriginDialogError(false);
                                      setOriginDialogOpen(true);
                                    }}
                                  >
                                    {originReady ? "Đổi nơi gửi sách" : "Thêm nơi gửi sách"}
                                  </button>
                                </div>
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
                                  <legend className="sr-only">Địa chỉ lấy sách</legend>
                                  <p className={styles.help}>
                                    Người mua chỉ thấy khu vực luân chuyển của sách.
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
                        </div>
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
                            {!auction && formData.mode !== "Sale" && (formData.targetCategory.trim() || formData.targetAuthor.trim() || formData.targetDescription.trim()) && (
                              <div>
                                <dt>Mong muốn đổi</dt>
                                <dd>
                                  {[
                                    formData.targetCategory.trim() ? `Thể loại: ${formData.targetCategory.trim()}` : null,
                                    formData.targetAuthor.trim() ? `Tác giả: ${formData.targetAuthor.trim()}` : null,
                                    formData.targetDescription.trim() ? `Ghi chú: ${formData.targetDescription.trim()}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
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
                    {coverCropBusy && (
                      <p role="status" className={styles.help}>
                        Đang xử lý ảnh bìa. Chờ ảnh hoàn tất rồi kiểm tra lại trước khi gửi.
                      </p>
                    )}
                    {step === 1 && validationFailure && stepError(1) && (
                      <p role="alert" className="sr-only">Kiểm tra các mục được đánh dấu.</p>
                    )}
                    {visibleSubmitError && (
                      <div
                        role="alert"
                        ref={errorBox}
                        tabIndex={-1}
                        className={styles.error}
                      >
                        <p>{visibleSubmitError}</p>
                        {canReviseSubmission && (
                          <>
                            <p>Tải phiên bản mới nhất của bản nháp. Nội dung đang nhập vẫn được giữ để bạn rà soát và quyết định có gửi lại hay không.</p>
                            <button type="button" className={styles.textAction} disabled={submitting} onClick={() => void reviseSubmission()}>
                              {submitting ? "Đang tải bản nháp…" : "Tải bản nháp để sửa"}
                            </button>
                          </>
                        )}
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
                    {step === 1 || step === 4 ? (
                      <details className={styles.postingLimit}>
                        <summary>
                          <span>Giới hạn đăng bài</span>
                          <ChevronDown size={16} aria-hidden="true" />
                        </summary>
                        <p className={styles.help}>{postingLimit}</p>
                      </details>
                    ) : (
                      <p className={styles.help}>{postingLimit}</p>
                    )}
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
                          Bản nháp chưa tự lưu.
                        </span>
                      )}
                      {step === 4 && <span className={styles.tradeNext}>Tiếp theo · Kiểm tra bài đăng</span>}
                      <button
                        type="submit"
                        className={styles.primary}
                        disabled={submitting || (step === 5 && (coverCropBusy || canReviseSubmission))}
                        aria-busy={submitting || (step === 5 && coverCropBusy)}
                      >
                        {step < 5
                          ? "Tiếp tục"
                          : submitting
                            ? "Đang xử lý…"
                            : canReviseSubmission
                              ? "Cần rà soát lại"
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
