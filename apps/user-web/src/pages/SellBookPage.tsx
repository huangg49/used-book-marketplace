import React, { useEffect, useRef, useState } from "react";
import {
  Navigate,
  useBeforeUnload,
  useBlocker,
  useLocation,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  BookOpen,
  ImagePlus,
  X,
} from "lucide-react";
import { Header } from "../layouts/MainLayout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListingSubmissionConfirmation } from "../components/BookJourneyStates";
import { useSession } from "../hooks/useSession";
import { createListingSubmission } from "../services/listing-submission";
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
import styles from "./SellBookPage.module.css";

export function SellBookPage() {
  const submission = useRef<ReturnType<typeof createListingSubmission>>(null);
  const [classification, setClassification] = useState<ClassificationValue>({
    categoryId: "",
    attributes: {},
    series: "",
  });
  const [language, setLanguage] = useState("vi");
  const [selectedBook, setSelectedBook] = useState<PickedBook | null>(null);
  const [step, setStep] = useState(1);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [touched, setTouched] = useState<string[]>([]);
  const [ownershipDeclared, setOwnershipDeclared] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [validationFailure, setValidationFailure] = useState(false);
  const [hasAttempt, setHasAttempt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const location = useLocation();
  const session = useSession();

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

  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<string[]>([]);
  const previewElement = useRef<HTMLElement>(null);
  const [previewFits, setPreviewFits] = useState(false);
  const receiptVisible = step === 6;
  useEffect(() => {
    const element = previewElement.current;
    if (!element || !window.ResizeObserver) return;
    const measure = () =>
      setPreviewFits(
        element.offsetHeight > 0 &&
          element.offsetHeight + 136 < window.innerHeight,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [session.status, receiptVisible]);
  const focusFrame = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (focusFrame.current !== undefined)
        cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  function focusAfterRender(target: "heading" | "error") {
    if (focusFrame.current !== undefined)
      cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      (target === "heading" ? heading : errorBox).current?.focus();
    });
  }
  const dirty =
    step !== 6 &&
    (classification.categoryId !== "" ||
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
    () => () => imageRefs.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  useEffect(() => {
    if (submitError) errorBox.current?.focus();
  }, [submitError]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (imageFiles.length >= 8) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10_000_000
      ) {
        setValidationFailure(false);
        setSubmitError("Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.");
        return;
      }
      setSubmitError(undefined);
      // Keep the local preview while retaining the original file for the API upload.
      const fakeUrl = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, images: [...prev.images, fakeUrl] }));
      setImageFiles((files) => [...files, file]);
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const missing = [
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
      imageFiles.length === 0 && "ít nhất một ảnh",
      formData.readable === null && "câu trả lời về độ đọc rõ",
      formData.hasMissingPages === null && "câu trả lời về trang thiếu",
      formData.missingEssentialContent === null &&
        "câu trả lời về nội dung trọng yếu",
      !ownershipDeclared && "xác nhận quyền sở hữu sách",
    ].filter(Boolean);
    const sale = Number(formData.salePrice);
    const exchange = Number(formData.exchangeValue);
    if (
      formData.mode !== "Exchange" &&
      (!Number.isInteger(sale) || sale < 10_000 || sale > 1_000_000)
    )
      missing.push("giá bán từ 10.000đ đến 1.000.000đ");
    if (
      formData.mode !== "Sale" &&
      (!Number.isInteger(exchange) || exchange < 10_000 || exchange > 1_000_000)
    )
      missing.push("giá trị đổi từ 10.000đ đến 1.000.000đ");
    if (missing.length) {
      setValidationFailure(true);
      const invalidStep = [1, 2, 3, 4].find((value) => stepError(value));
      setCheckedSteps([1, 2, 3, 4, 5]);
      if (invalidStep) setStep(invalidStep);
      setSubmitError(`Cần bổ sung: ${missing.join(", ")}.`);
      return;
    }
    setSubmitting(true);
    setValidationFailure(false);
    setSubmitError(undefined);
    try {
      submission.current ??= createListingSubmission({
        title: formData.title,
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
        mode: formData.mode as "Sale" | "Exchange" | "Both",
        salePrice: formData.mode === "Exchange" ? null : sale,
        exchangeValue: formData.mode === "Sale" ? null : exchange,
        files: imageFiles,
        readable: formData.readable!,
        hasMissingPages: formData.hasMissingPages!,
        missingEssentialContent: formData.missingEssentialContent!,
        ownershipDeclared,
      });
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
    "Bán hoặc đổi",
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
    if (forStep === 2 && !imageFiles.length)
      message = "Thêm ít nhất một ảnh bản sách.";
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
    return message;
  }
  function continueStep() {
    const message = stepError(step);
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
  function removePhoto(index: number) {
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
    title: !formData.title.trim() ? "Nhập tên sách như trên bìa." : undefined,
    author: !formData.author.trim()
      ? "Nhập tên tác giả như trên bìa."
      : undefined,
    images: !imageFiles.length ? "Thêm ít nhất một ảnh bản sách." : undefined,
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
    "Chọn hình thức phù hợp và đặt giá cho bản sách.",
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
            ? ["salePrice", "exchangeValue"]
            : ["ownership"];
  const visibleSubmitError = validationFailure
    ? stepError(step) || (step === 5 ? fieldErrors.ownership : undefined)
    : submitError;
  const preview = (
    <section className={styles.preview} aria-label="Bản xem trước bài đăng">
      <h2>Cuốn sách của bạn</h2>
      <div className={styles.previewPhoto}>
        {formData.images[0] ? (
          <img
            src={formData.images[0]}
            alt={`Ảnh bìa ${formData.title || "bản sách"}`}
          />
        ) : (
          <div className={styles.emptyPhoto}>
            <BookOpen size={32} aria-hidden="true" />
            <span>Ảnh bản sách sẽ hiện ở đây</span>
          </div>
        )}
      </div>
      <h3>{formData.title || "Tên cuốn sách của bạn"}</h3>
      <p>{formData.author || "Tác giả"}</p>
      <span>
        {conditions[formData.condition as keyof typeof conditions]} ·{" "}
        {formData.mode === "Sale"
          ? "Bán"
          : formData.mode === "Exchange"
            ? "Đổi"
            : "Bán hoặc đổi"}
      </span>
      <dl>
        {formData.mode !== "Exchange" && (
          <div>
            <dt>Giá bán</dt>
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
      </dl>
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
      <a href="#sell-content" className={styles.skip}>
        Bỏ qua điều hướng
      </a>
      <Header />
      <main id="sell-content" className={styles.page}>
        <header className={styles.intro}>
          <h1>Đăng sách</h1>
          <p className={styles.tagline}>Để sách đi tiếp.</p>
          <p>
            Thêm ảnh và kể rõ tình trạng bản sách. Kiểm tra một lượt trước khi
            gửi duyệt.
          </p>
        </header>
        {step === 6 ? (
          <ListingSubmissionConfirmation
            title={formData.title}
            onPostAnother={() => {
              formData.images.forEach((url) => URL.revokeObjectURL(url));
              submission.current = null;
              setClassification({
                categoryId: "",
                attributes: {},
                series: "",
              });
              setLanguage("vi");
              setSelectedBook(null);
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
                ref={previewElement}
                className={`${styles.desktopPreview} ${previewFits ? styles.stickyPreview : ""}`}
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
                          {!selectedBook && (
                            <CatalogBookPicker
                              onSelect={(book) => {
                                setSelectedBook(book);
                                setFormData((previous) => ({
                                  ...previous,
                                  title: book.title,
                                  author: book.authors.join(" · "),
                                }));
                                setClassification({
                                  categoryId:
                                    book.categoryId ||
                                    categoryFor(book.category)?.id ||
                                    "",
                                  attributes: book.attributes || {},
                                  series: book.series || "",
                                });
                                setLanguage(book.language);
                              }}
                            />
                          )}
                          {selectedBook && (
                            <p className={styles.help}>
                              Đang dùng đầu sách đã xác nhận.{" "}
                              <button
                                type="button"
                                onClick={() => setSelectedBook(null)}
                              >
                                Đề nghị một đầu sách khác
                              </button>
                            </p>
                          )}
                          <p className={styles.help}>
                            Ghi tên sách và tác giả đúng như trên bìa.
                          </p>
                          {(
                            [
                              ["title", "Tên sách", "Ví dụ: Truyện Kiều"],
                              ["author", "Tác giả", "Ví dụ: Nguyễn Du"],
                            ] as const
                          ).map(([key, label, placeholder]) => (
                            <div className={styles.field} key={key}>
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
                              id="sell"
                              value={classification}
                              onChange={setClassification}
                            />
                            {fieldFeedback("sell-category")}
                            <div className={styles.field}>
                              <label htmlFor="sell-language">
                                Ngôn ngữ của sách
                              </label>
                              <select
                                id="sell-language"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                              >
                                {!languageOptions.some(
                                  (o) => o.id === language,
                                ) && (
                                  <option value={language}>{language}</option>
                                )}
                                {languageOptions.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </fieldset>
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <p className={styles.help}>
                            Chụp bìa, gáy, ruột sách và phần đã qua sử dụng. Ảnh
                            đầu tiên là ảnh bìa.
                          </p>
                          <label htmlFor="images" className={styles.upload}>
                            <ImagePlus size={28} aria-hidden="true" />
                            <strong>Chọn ảnh bản sách</strong>
                            <span>JPEG, PNG, WebP · tối đa 10 MB/ảnh</span>
                          </label>
                          <input
                            id="images"
                            className={styles.fileInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageUpload}
                            disabled={
                              imageFiles.length >= 8 || hasAttempt || submitting
                            }
                            {...feedbackProps("images", "image-help")}
                          />
                          {fieldFeedback("images")}
                          <p id="image-help" className={styles.help}>
                            {imageFiles.length}/8 ảnh · Ảnh được tải lên khi gửi
                            duyệt.
                          </p>
                          <div className={styles.photos}>
                            {formData.images.map((url, index) => (
                              <div key={url}>
                                <img
                                  src={url}
                                  alt={`Ảnh bản sách ${index + 1}`}
                                />
                                <span>
                                  {index === 0 ? "Ảnh bìa" : `Ảnh ${index + 1}`}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Xóa ảnh ${index + 1}`}
                                  onClick={() => removePhoto(index)}
                                >
                                  <X size={18} aria-hidden="true" />
                                </button>
                              </div>
                            ))}
                          </div>
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
                            {questions.map(([key, label]) => (
                              <fieldset
                                key={key}
                                id={`${key}-group`}
                                {...feedbackProps(key)}
                              >
                                <legend>{label}</legend>
                                <div className={styles.radioOptions}>
                                  {([true, false] as const).map((value) => (
                                    <label key={String(value)}>
                                      <input
                                        type="radio"
                                        name={key}
                                        checked={formData[key] === value}
                                        onChange={() =>
                                          setFormData((previous) => ({
                                            ...previous,
                                            [key]: value,
                                          }))
                                        }
                                      />
                                      {value ? "Có" : "Không"}
                                    </label>
                                  ))}
                                </div>
                                {fieldFeedback(key)}
                              </fieldset>
                            ))}
                          </div>
                        </>
                      )}
                      {step === 4 && (
                        <>
                          <fieldset className={styles.mode}>
                            <legend>Bạn muốn bán hay đổi?</legend>
                            {(
                              [
                                ["Sale", "Bán sách"],
                                ["Exchange", "Đổi sách"],
                                ["Both", "Bán hoặc đổi"],
                              ] as const
                            ).map(([value, label]) => (
                              <label key={value}>
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
                                <span>{label}</span>
                                {formData.mode === value && (
                                  <Check size={18} aria-hidden="true" />
                                )}
                              </label>
                            ))}
                          </fieldset>
                          <p className={styles.help}>
                            Giá bán và giá trị đổi đều tính bằng VNĐ, từ 10.000đ
                            đến 1.000.000đ.
                          </p>
                          {(
                            [
                              [
                                "salePrice",
                                "Giá bán",
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
                                  alt={`Ảnh bản sách ${index + 1}${index === 0 ? ", ảnh bìa" : ""}`}
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
                            <h3>Bán hoặc đổi</h3>
                            {reviewEdit(4)}
                          </div>
                          <dl className={styles.reviewFacts}>
                            <div>
                              <dt>Hình thức</dt>
                              <dd>
                                {formData.mode === "Sale"
                                  ? "Bán sách"
                                  : formData.mode === "Exchange"
                                    ? "Đổi sách"
                                    : "Bán hoặc đổi"}
                              </dd>
                            </div>
                            {formData.mode !== "Exchange" && (
                              <div>
                                <dt>Giá bán</dt>
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
                          </dl>
                          <p className={styles.help}>
                            {imageFiles.length} ảnh bản sách. Bài đăng và thông
                            tin sách được gửi kiểm duyệt trước khi xuất hiện
                            trên kệ.
                          </p>
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
                            Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn
                            sách này.
                          </label>
                          {fieldFeedback("ownership")}
                        </>
                      )}
                    </fieldset>
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
                                    onClick={() => {
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
