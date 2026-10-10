import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigate, useLocation } from "react-router-dom";
import { Header } from "../layouts/MainLayout";
import { useSession } from "../hooks/useSession";
import { createListingSubmission } from "../services/listing-submission";
import {
  Clock,
  BookOpen,
  Tag,
  Image as ImageIcon,
  Upload,
  Info,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  List,
} from "lucide-react";

export function SellBookPage() {
  const submission = useRef<ReturnType<typeof createListingSubmission>>(null);
  const [step, setStep] = useState(1);
  const [ownershipDeclared, setOwnershipDeclared] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [hasAttempt, setHasAttempt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const location = useLocation();
  const session = useSession();

  if (session.status === "anonymous") {
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname)}`} replace />;
  }

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10_000_000
      ) {
        setSubmitError("Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.");
        return;
      }
      setSubmitError(undefined);
      // Keep the local preview while retaining the original file for the API upload.
      const fakeUrl = URL.createObjectURL(e.target.files[0]);
      setFormData((prev) => ({ ...prev, images: [...prev.images, fakeUrl] }));
      setImageFiles((files) => [...files, e.target.files![0]]);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const missing = [
      formData.readable === false && "nội dung đọc rõ để đủ điều kiện đăng",
      formData.missingEssentialContent === true &&
        "đủ nội dung trọng yếu để đủ điều kiện đăng",
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
      setSubmitError(`Cần bổ sung: ${missing.join(", ")}.`);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      submission.current ??= createListingSubmission({
        title: formData.title,
        author: formData.author,
        category: "Khác",
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
    "Ảnh cuốn sách",
    "Tình trạng",
    "Bán hoặc đổi",
    "Kiểm tra",
  ];
  
  const getStepSubtitle = (index: number) => {
    switch (index) {
      case 0:
        return formData.title ? formData.title : "Chưa nhập thông tin";
      case 1:
        return imageFiles.length > 0 ? `${imageFiles.length} ảnh đối chiếu rõ nét` : "Cần tải ảnh lên";
      case 2:
        if (!formData.pages || !formData.coverNote) {
          if (formData.pages || formData.coverNote) return 'Đang nhập chi tiết...';
          return 'Chưa nhập chi tiết';
        }
        return formData.condition === 'LikeNew' ? 'Như mới (99%)' : formData.condition === 'Good' ? 'Rất tốt (88/100)' : formData.condition === 'Fair' ? 'Trung bình (70/100)' : formData.condition === 'Worn' ? 'Cũ (Dưới 50%)' : 'Chưa đánh giá';
      case 3:
        if (!formData.salePrice && !formData.exchangeValue) return "Niêm yết / Đổi xu / Đấu giá";
        return formData.mode === 'Sale' ? `Khuyến nghị ${formData.salePrice}đ` : formData.mode === 'Exchange' ? `Đổi ${formData.exchangeValue} xu` : `Bán ${formData.salePrice}đ / Đổi ${formData.exchangeValue} xu`;
      case 4:
        return "Xác nhận & Đăng bài";
      default:
        return "";
    }
  };

  const calculateProgress = () => {
    let filled = 0;
    const total = 8;
    if (formData.title) filled++;
    if (formData.author) filled++;
    if (formData.images.length > 0) filled++;
    if (formData.condition) filled++;
    if (formData.pages) filled++;
    if (formData.coverNote) filled++;
    if (formData.mode === 'Sale' && formData.salePrice) filled++;
    else if (formData.mode === 'Exchange' && formData.exchangeValue) filled++;
    else if (formData.mode === 'Both' && formData.salePrice && formData.exchangeValue) filled++;
    if (ownershipDeclared) filled++;
    return Math.round((filled / total) * 100);
  };

  const isStepValid = (index: number) => {
    switch (index) {
      case 0: return !!formData.title && !!formData.author;
      case 1: return formData.images && formData.images.length > 0;
      case 2: return !!formData.condition && !!formData.pages && !!formData.coverNote;
      case 3:
        if (formData.mode === 'Sale') return !!formData.salePrice;
        if (formData.mode === 'Exchange') return !!formData.exchangeValue;
        return !!formData.salePrice && !!formData.exchangeValue;
      case 4: return ownershipDeclared;
      default: return true;
    }
  };

  const renderSidebar = () => (
    <aside aria-label="Các bước đăng sách" className="bg-white/80 backdrop-blur-md rounded-xl p-space-md shadow-sm border border-white/50 flex flex-col gap-2">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = step > stepNumber;
        const isActive = step === stepNumber;
        const isValid = isStepValid(index);
        const showRedX = !isValid && isCompleted;

        return (
          <button
            type="button"
            key={label}
            disabled={submitting}
            aria-current={isActive ? "step" : undefined}
            className={`flex items-center gap-2 text-left p-2 rounded-lg transition-colors ${isActive ? 'bg-surface-container-high/50' : 'hover:bg-surface-container/50'}`}
            onClick={() => setStep(stepNumber)}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors
              ${showRedX ? 'bg-red-100 text-red-600' :
                isCompleted ? 'bg-primary-container text-on-primary' :
                  isActive ? 'bg-secondary text-on-secondary' :
                    'bg-surface-container-highest text-on-surface-variant'}`}
            >
              {showRedX ? (
                <span className="material-symbols-outlined text-[24px]">close</span>
              ) : isCompleted ? (
                <span className="material-symbols-outlined text-[24px]">check</span>
              ) : (
                <span className="font-title-lg font-bold">0{stepNumber}</span>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={`font-label-sm text-[10px] uppercase tracking-wider mb-0.5
                ${showRedX ? 'text-red-600 font-bold' : isActive ? 'text-secondary font-bold' : isCompleted ? 'text-primary' : 'text-on-surface-variant/70'}`}
              >
                {showRedX ? 'Thiếu thông tin' : isActive ? 'Đang chỉnh' : isCompleted ? `Bước 0${stepNumber}` : 'Kế tiếp'}
              </span>
              <span className={`font-title-md text-base truncate leading-tight mb-0.5
                ${showRedX ? 'text-red-600 font-bold' : isActive || isCompleted ? 'text-primary font-bold' : 'text-on-surface-variant'}`}
              >
                {label}
              </span>
              <span className={`font-body-sm text-xs truncate leading-tight
                ${showRedX ? 'text-red-500/80' : isActive ? 'text-secondary/80' : 'text-on-surface-variant/60'}`}
              >
                {getStepSubtitle(index)}
              </span>
            </div>
          </button>
        );
      })}
    </aside>
  );

  const renderHorizontalStepper = () => (
    <nav aria-label="Tiến trình" className="bg-white/80 backdrop-blur-md rounded-xl p-3 shadow-sm mb-4 border border-white/50">
      <div className="flex justify-between items-center relative z-10">
        <AnimatePresence>
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isCompleted = step > stepNumber;
            const isActive = step === stepNumber;
            const isValid = isStepValid(index);
            const showRedX = !isValid && isCompleted;

            return (
              <button
                type="button"
                key={label}
                disabled={submitting}
                aria-current={isActive ? "step" : undefined}
                className={`flex items-center gap-2 text-left p-2 rounded-lg transition-all duration-300 relative group`}
                onClick={() => setStep(stepNumber)}
                style={{ width: "20%" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-step-bg"
                    className="absolute inset-0 bg-[#e7e0d5] shadow-sm rounded-lg"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500 relative z-10
                  ${showRedX ? 'bg-red-100 text-red-600' :
                    isCompleted ? 'bg-[#173c2e] text-white' :
                      isActive ? 'bg-[#984a30] text-white' :
                        'bg-[#e2ddd5] text-[#716a62]'}`}
                >
                  {showRedX ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring" }}
                      className="material-symbols-outlined text-[24px]"
                    >
                      close
                    </motion.span>
                  ) : isCompleted ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring" }}
                      className="material-symbols-outlined text-[24px]"
                    >
                      check
                    </motion.span>
                  ) : (
                    <span className="font-title-lg font-bold">0{stepNumber}</span>
                  )}
                </div>
                <div className="flex flex-col min-w-0 relative z-10">
                  <span className={`font-label-sm text-[11px] uppercase tracking-wider mb-0.5 transition-colors duration-300
                    ${showRedX ? 'text-red-600 font-bold' : isActive ? 'text-[#984a30] font-bold' : isCompleted ? 'text-[#984a30]' : 'text-[#716a62] group-hover:text-[#984a30]'}`}
                  >
                    {showRedX ? 'Thiếu thông tin' : isActive ? 'Đang chỉnh' : isCompleted ? `Bước 0${stepNumber}` : 'Kế tiếp'}
                  </span>
                  <span className={`font-title-md text-base truncate leading-tight mb-0.5 transition-colors duration-300
                    ${showRedX ? 'text-red-600 font-bold' : isActive || isCompleted ? 'text-[#173c2e] font-bold' : 'text-[#716a62] group-hover:text-[#173c2e]'}`}
                  >
                    {label}
                  </span>
                  <span className={`font-body-sm text-[13px] truncate leading-tight transition-colors duration-300
                    ${showRedX ? 'text-red-500/80' : isActive ? 'text-[#984a30]' : 'text-[#716a62]'}`}
                  >
                    {getStepSubtitle(index)}
                  </span>
                </div>
              </button>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="w-full mt-6 h-2 bg-[#e2ddd5] rounded-full overflow-hidden relative">
        <motion.div
          className="absolute top-0 left-0 h-full"
          initial={{ width: 0 }}
          animate={{ width: `${calculateProgress()}%` }}
          transition={{ type: "spring", stiffness: 70, damping: 20 }}
          style={{
            background: 'linear-gradient(to right, #173c2e, #984a30)'
          }}
        />
      </div>
    </nav>
  );

  return (
    <>
      <Header />
            <main className="sell-workspace relative min-h-screen">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            top: '80px',
            backgroundImage: "url('/ĐangAnh_BG.png')",
            backgroundSize: "cover",
            backgroundPosition: "top center",
            backgroundAttachment: "fixed"
          }}
        />
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-16 py-4 relative z-10">
          <div className="mb-4 pt-1">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl font-display font-black tracking-tight mb-1 text-[#1f2937]"
            >
              Đăng bán <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#173c2e] to-[#984a30]">sách</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-sm font-body-lg text-[#6b7280] max-w-2xl"
            >
              Chia sẻ những cuốn sách bạn đã đọc cho những người cần chúng. Quá trình tạo bài đăng siêu đơn giản và chỉ mất chưa đến 3 phút!
            </motion.p>
          </div>

          {step <= 5 && renderHorizontalStepper()}

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {step <= 5 && (
              <div className="w-full lg:w-[260px] shrink-0 sticky top-[100px]">
                {renderSidebar()}
              </div>
            )}

            <div
              className="sell-panel flex-1 w-full"
              style={{
                background: "rgba(255, 255, 255, 0.92)",
                backdropFilter: "blur(12px)",
                padding: "1.5rem",
                borderRadius: "16px",
                boxShadow: "0 10px 30px rgba(152, 74, 48, 0.08), 0 1px 3px rgba(0,0,0,0.05)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
              }}
            >
              <fieldset
                disabled={submitting || hasAttempt}
                className="sell-fields relative"
                style={{ minHeight: "250px", transition: "min-height 0.3s ease" }}
              >
                <AnimatePresence mode="wait">
              {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                  <h2
                    style={{
                      fontSize: "1.5rem",
                      marginBottom: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text-dark, #1f2937)",
                    }}
                  >
                    <BookOpen size={24} color="var(--brand-green, #173c2e)" />{" "}
                    Thông tin cơ bản
                  </h2>
                  <div style={{ display: "grid", gap: "1.5rem" }}>
                    <div>
                      <label
                        htmlFor="title"
                        style={{
                          display: "block",
                          fontWeight: "600",
                          marginBottom: "0.5rem",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        Tên sách
                      </label>
                      <input
                        id="title"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        placeholder="VD: Đắc Nhân Tâm"
                        style={{
                          width: "100%",
                          padding: "1rem",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          outline: "none",
                          transition: "border 0.2s",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="author"
                        style={{
                          display: "block",
                          fontWeight: "600",
                          marginBottom: "0.5rem",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        Tác giả
                      </label>
                      <input
                        id="author"
                        value={formData.author}
                        onChange={(e) =>
                          setFormData({ ...formData, author: e.target.value })
                        }
                        placeholder="VD: Dale Carnegie"
                        style={{
                          width: "100%",
                          padding: "1rem",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontSize: "1rem",
                          outline: "none",
                          transition: "border 0.2s",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
                )}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                  <h2
                    style={{
                      fontSize: "1.5rem",
                      marginBottom: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text-dark, #1f2937)",
                    }}
                  >
                    <ImageIcon size={24} color="var(--brand-green, #173c2e)" />{" "}
                    Ảnh và tình trạng
                  </h2>
                  <div style={{ display: "grid", gap: "2rem" }}>
                    {/* Upload Ảnh */}
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: "600",
                          marginBottom: "0.5rem",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        Ảnh bản sách ({formData.images.length}/8)
                      </label>
                      <p
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-light, #6b7280)",
                          marginBottom: "1rem",
                        }}
                      >
                        Chụp bìa, gáy và những phần đã qua sử dụng.
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {formData.images.map((img, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: "100px",
                              height: "100px",
                              borderRadius: "8px",
                              overflow: "hidden",
                              border: "1px solid #eee",
                            }}
                          >
                            <img
                              src={img}
                              alt="Book preview"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          </div>
                        ))}
                        {formData.images.length < 8 && (
                          <label
                            style={{
                              width: "100px",
                              height: "100px",
                              borderRadius: "8px",
                              border: "2px dashed #cbd5e1",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "#64748b",
                              background: "#f8fafc",
                              transition: "all 0.2s",
                            }}
                          >
                            <Upload
                              size={24}
                              style={{ marginBottom: "0.25rem" }}
                            />
                            <span style={{ fontSize: "0.8rem" }}>Tải ảnh</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              style={{ display: "none" }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <div style={{ height: "1px", background: "#e5e7eb" }} />
                  </div>
                </motion.div>
                )}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                  <h2>Tình trạng cuốn sách</h2>
                  <div style={{ display: "grid", gap: "1.5rem" }}>
                    {/* Tình trạng */}
                    <div style={{ display: "grid", gap: "1.5rem" }}>
                      <div>
                        <label
                          htmlFor="condition"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.5rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Tình trạng tổng thể
                        </label>
                        <select
                          id="condition"
                          value={formData.condition}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              condition: e.target.value,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            fontSize: "1rem",
                            boxSizing: "border-box",
                          }}
                        >
                          <option value="LikeNew">Gần như mới</option>
                          <option value="Good">Còn tốt</option>
                          <option value="Fair">Đã dùng nhiều</option>
                          <option value="Worn">Cũ nhiều</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="pages"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.25rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Ruột sách và trang thiếu
                        </label>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginBottom: "0.5rem",
                          }}
                        >
                          Đủ trang hay thiếu trang nào? Có ố, rách hoặc bong
                          trang không?
                        </p>
                        <textarea
                          rows={2}
                          id="pages"
                          value={formData.pages}
                          onChange={(e) =>
                            setFormData({ ...formData, pages: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            fontSize: "1rem",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="coverNote"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.25rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Bìa và gáy sách
                        </label>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginBottom: "0.5rem",
                          }}
                        >
                          Mô tả góc sờn, nếp gấp hoặc phần bong gáy.
                        </p>
                        <textarea
                          rows={2}
                          id="coverNote"
                          value={formData.coverNote}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              coverNote: e.target.value,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            fontSize: "1rem",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="notes"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.25rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Ghi chú và đánh dấu
                        </label>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginBottom: "0.5rem",
                          }}
                        >
                          Có viết, tô hoặc gạch chân không? Nếu không, ghi
                          'Không có'.
                        </p>
                        <textarea
                          rows={2}
                          id="notes"
                          value={formData.notes}
                          onChange={(e) =>
                            setFormData({ ...formData, notes: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            fontSize: "1rem",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      {/* Các câu hỏi trắc nghiệm */}
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "1.5rem",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          display: "grid",
                          gap: "1.2rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "1rem",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "500",
                              color: "var(--text-dark, #1f2937)",
                            }}
                          >
                            Nội dung có còn đọc rõ?
                          </span>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="readable"
                                checked={formData.readable === true}
                                onChange={() =>
                                  setFormData({ ...formData, readable: true })
                                }
                              />{" "}
                              Có
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="readable"
                                checked={formData.readable === false}
                                onChange={() =>
                                  setFormData({ ...formData, readable: false })
                                }
                              />{" "}
                              Không
                            </label>
                          </div>
                        </div>

                        <div style={{ height: "1px", background: "#e2e8f0" }} />

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "1rem",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "500",
                              color: "var(--text-dark, #1f2937)",
                            }}
                          >
                            Sách có thiếu trang?
                          </span>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="hasMissingPages"
                                checked={formData.hasMissingPages === true}
                                onChange={() =>
                                  setFormData({
                                    ...formData,
                                    hasMissingPages: true,
                                  })
                                }
                              />{" "}
                              Có
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="hasMissingPages"
                                checked={formData.hasMissingPages === false}
                                onChange={() =>
                                  setFormData({
                                    ...formData,
                                    hasMissingPages: false,
                                  })
                                }
                              />{" "}
                              Không
                            </label>
                          </div>
                        </div>

                        <div style={{ height: "1px", background: "#e2e8f0" }} />

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "1rem",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "500",
                              color: "var(--text-dark, #1f2937)",
                            }}
                          >
                            Có thiếu nội dung trọng yếu?
                          </span>
                          <div style={{ display: "flex", gap: "1rem" }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="missingEssentialContent"
                                checked={
                                  formData.missingEssentialContent === true
                                }
                                onChange={() =>
                                  setFormData({
                                    ...formData,
                                    missingEssentialContent: true,
                                  })
                                }
                              />{" "}
                              Có
                            </label>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                                color: "var(--text-dark, #1f2937)",
                              }}
                            >
                              <input
                                type="radio"
                                name="missingEssentialContent"
                                checked={
                                  formData.missingEssentialContent === false
                                }
                                onChange={() =>
                                  setFormData({
                                    ...formData,
                                    missingEssentialContent: false,
                                  })
                                }
                              />{" "}
                              Không
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
                )}
                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                  <h2
                    style={{
                      fontSize: "1.5rem",
                      marginBottom: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text-dark, #1f2937)",
                    }}
                  >
                    <Tag size={24} color="var(--brand-green, #173c2e)" /> Bán
                    hoặc đổi
                  </h2>
                  <div style={{ display: "grid", gap: "2rem" }}>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: "600",
                          marginBottom: "1rem",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        Bạn muốn bán hay đổi?
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(120px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        {["Sale", "Exchange", "Both"].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setFormData({ ...formData, mode })}
                            style={{
                              padding: "1rem",
                              borderRadius: "12px",
                              border: `2px solid ${formData.mode === mode ? "var(--brand-green, #173c2e)" : "#e2e8f0"}`,
                              background:
                                formData.mode === mode ? "#ecfdf5" : "white",
                              cursor: "pointer",
                              fontWeight: "600",
                              color:
                                formData.mode === mode
                                  ? "var(--brand-green, #173c2e)"
                                  : "#64748b",
                              transition: "all 0.2s",
                              outline: "none",
                            }}
                          >
                            {mode === "Sale"
                              ? "Bán sách"
                              : mode === "Exchange"
                                ? "Đổi sách"
                                : "Bán hoặc đổi"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(formData.mode === "Sale" || formData.mode === "Both") && (
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "1.5rem",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <label
                          htmlFor="salePrice"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.5rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Giá bán (VNĐ)
                        </label>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginBottom: "1rem",
                          }}
                        >
                          Từ 10.000 đến 1.000.000 đồng.
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: "1rem",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="number"
                            id="salePrice"
                            value={formData.salePrice}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                salePrice: e.target.value,
                              })
                            }
                            placeholder="VD: 125000"
                            style={{
                              flex: 1,
                              minWidth: "0",
                              padding: "1rem",
                              borderRadius: "8px",
                              border: "1px solid #ddd",
                              fontSize: "1.1rem",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      <label htmlFor="accessories" style={{ fontWeight: 600 }}>
                        Phụ kiện đi kèm
                      </label>
                      <textarea
                        id="accessories"
                        rows={2}
                        value={formData.accessories}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            accessories: e.target.value,
                          })
                        }
                        placeholder="Ví dụ: Không có; hoặc ghi rõ bookmark, bọc sách..."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.8rem",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontFamily: "inherit",
                        }}
                      />
                      <small>Nếu không có phụ kiện, nhập “Không có”.</small>
                    </div>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      <label htmlFor="description" style={{ fontWeight: 600 }}>
                        Mô tả chung
                      </label>
                      <textarea
                        id="description"
                        rows={4}
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        placeholder="Viết ít nhất 30 ký tự về cuốn sách, tình trạng và điều bạn muốn người nhận biết."
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.8rem",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          fontFamily: "inherit",
                        }}
                      />
                      <small>
                        {formData.description.trim().length}/30 ký tự tối thiểu
                      </small>
                    </div>

                    {(formData.mode === "Exchange" ||
                      formData.mode === "Both") && (
                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "1.5rem",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <label
                          htmlFor="exchangeValue"
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "0.5rem",
                            color: "var(--text-dark, #1f2937)",
                          }}
                        >
                          Giá trị quy đổi (VNĐ)
                        </label>
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginBottom: "1rem",
                          }}
                        >
                          Mức giá trị để đối chiếu khi đổi sách.
                        </p>
                        <input
                          type="number"
                          id="exchangeValue"
                          value={formData.exchangeValue}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              exchangeValue: e.target.value,
                            })
                          }
                          placeholder="VD: 100000"
                          style={{
                            width: "100%",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            fontSize: "1.1rem",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
                )}
                {step === 5 && (
                  <motion.div
                    key="step5"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                  <h2
                    style={{
                      fontSize: "1.5rem",
                      marginBottom: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text-dark, #1f2937)",
                    }}
                  >
                    <List size={24} color="var(--brand-green, #173c2e)" /> Kiểm
                    tra thông tin
                  </h2>
                  <div
                    style={{ display: "grid", gap: "1.5rem", fontSize: "1rem" }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: "1rem",
                        borderBottom: "1px solid #f1f5f9",
                        paddingBottom: "1rem",
                      }}
                    >
                      <span style={{ color: "#64748b", fontWeight: "500" }}>
                        Tên sách
                      </span>
                      <span
                        style={{
                          fontWeight: "600",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        {formData.title || "(Chưa nhập)"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: "1rem",
                        borderBottom: "1px solid #f1f5f9",
                        paddingBottom: "1rem",
                      }}
                    >
                      <span style={{ color: "#64748b", fontWeight: "500" }}>
                        Tác giả
                      </span>
                      <span
                        style={{
                          fontWeight: "600",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        {formData.author || "(Chưa nhập)"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: "1rem",
                        borderBottom: "1px solid #f1f5f9",
                        paddingBottom: "1rem",
                      }}
                    >
                      <span style={{ color: "#64748b", fontWeight: "500" }}>
                        Tình trạng
                      </span>
                      <span
                        style={{
                          fontWeight: "600",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        {formData.condition === "LikeNew"
                          ? "Gần như mới"
                          : formData.condition === "Good"
                            ? "Còn tốt"
                            : formData.condition === "Fair"
                              ? "Đã dùng nhiều"
                              : "Cũ nhiều"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: "1rem",
                        borderBottom: "1px solid #f1f5f9",
                        paddingBottom: "1rem",
                      }}
                    >
                      <span style={{ color: "#64748b", fontWeight: "500" }}>
                        Hình thức
                      </span>
                      <span
                        style={{
                          fontWeight: "600",
                          color: "var(--text-dark, #1f2937)",
                        }}
                      >
                        {formData.mode === "Sale"
                          ? "Bán sách"
                          : formData.mode === "Exchange"
                            ? "Đổi sách"
                            : "Bán hoặc đổi"}
                      </span>
                    </div>
                    {(formData.mode === "Sale" || formData.mode === "Both") && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr",
                          gap: "1rem",
                          borderBottom: "1px solid #f1f5f9",
                          paddingBottom: "1rem",
                        }}
                      >
                        <span style={{ color: "#64748b", fontWeight: "500" }}>
                          Giá bán
                        </span>
                        <span
                          style={{
                            fontWeight: "700",
                            color: "var(--brand-green, #173c2e)",
                          }}
                        >
                          {formData.salePrice
                            ? `${parseInt(formData.salePrice).toLocaleString("vi-VN")} đ`
                            : "(Chưa nhập)"}
                        </span>
                      </div>
                    )}

                    {formData.mode !== "Sale" && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "120px 1fr",
                          gap: "1rem",
                        }}
                      >
                        <span>Giá trị đổi</span>
                        <strong>
                          {formData.exchangeValue
                            ? `${Number(formData.exchangeValue).toLocaleString("vi-VN")} đ`
                            : "(Chưa nhập)"}
                        </strong>
                      </div>
                    )}
                    <div
                      style={{
                        background: "#fef3c7",
                        padding: "1rem",
                        borderRadius: "8px",
                        display: "flex",
                        gap: "0.75rem",
                        marginTop: "1rem",
                      }}
                    >
                      <Info
                        size={20}
                        color="#d97706"
                        style={{ flexShrink: 0 }}
                      />
                      <p
                        style={{
                          color: "#b45309",
                          margin: 0,
                          fontSize: "0.95rem",
                          lineHeight: "1.5",
                        }}
                      >
                        Vui lòng kiểm tra kỹ thông tin. Sách của bạn sẽ được gửi
                        cho Admin duyệt trước khi hiển thị công khai trên kệ.
                      </p>
                    </div>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      marginTop: "1.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ownershipDeclared}
                      onChange={(e) => setOwnershipDeclared(e.target.checked)}
                    />
                    Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.
                  </label>
                </motion.div>
                )}
                </AnimatePresence>
                </fieldset>
            {submitError && (
              <div role="alert" className="sell-error">
                {submitError}
                {hasAttempt && (
                  <p>
                    Thông tin đang được giữ nguyên. Bấm thử lại để tiếp tục lần
                    gửi này; đừng tải lại trang.
                  </p>
                )}
              </div>
            )}

            {/* Nút điều hướng */}
            {step <= 5 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "2.5rem",
                  paddingTop: "1.5rem",
                  borderTop: "1px solid #f1f5f9",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => setStep(step - 1)}
                  style={{
                    visibility: step > 1 ? "visible" : "hidden",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "8px",
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "none",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    outline: "none",
                  }}
                >
                  <ChevronLeft size={18} /> Quay lại
                </button>

                {step < 5 ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    style={{
                      padding: "0.75rem 1.5rem",
                      borderRadius: "8px",
                      background: "var(--brand-green, #173c2e)",
                      color: "white",
                      border: "none",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      outline: "none",
                    }}
                  >
                    Tiếp tục <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={submitting}
                    style={{
                      padding: "0.75rem 2rem",
                      borderRadius: "8px",
                      background: "var(--brand-green, #173c2e)",
                      color: "white",
                      border: "none",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontSize: "1.05rem",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                      outline: "none",
                    }}
                  >
                    {submitting
                      ? "Đang gửi…"
                      : hasAttempt
                        ? "Thử gửi lại"
                        : "Gửi duyệt"}{" "}
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>
            )}

            {step === 6 && !submitError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
                className="flex flex-col items-center justify-center p-12 text-center relative overflow-hidden rounded-2xl"
                style={{
                  minHeight: "400px",
                  backgroundImage: "url('/Spending_BG.png')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  marginTop: "2rem"
                }}
              >
                <div className="z-10 flex flex-col items-center">
                  <Clock size={80} className="text-secondary mb-6 animate-pulse" />
                  <h2 className="text-3xl font-display font-black text-primary mb-4 drop-shadow-sm">
                    Đang chờ duyệt
                  </h2>
                  <p className="text-lg text-[#1f2937] max-w-lg mx-auto leading-relaxed mb-8 font-medium">
                    Sách <strong className="text-primary font-bold">{formData.title}</strong> đã được gửi lên hệ
                    thống. Admin sẽ kiểm tra và duyệt bài đăng trước khi sách hiển thị công khai.
                  </p>
                  
                  <button
                    onClick={() => {
                      setStep(1);
                      setFormData({ title: "", author: "", images: [], condition: "Good", pages: "", coverNote: "", notes: "", accessories: "", description: "", readable: null, hasMissingPages: null, missingEssentialContent: null, mode: "Sale", salePrice: "", exchangeValue: "" });
                      setImageFiles([]);
                      setOwnershipDeclared(false);
                      setHasAttempt(false);
                    }}
                    className="px-8 py-3 rounded-xl bg-primary text-on-primary font-title-md text-title-md shadow-md hover:bg-primary/90 hover:scale-105 transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined">add_circle</span>
                    Tiếp tục đăng sách khác
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
        <style>{`
        .sell-workspace {--brand-green:#173c2e; padding-top: 5rem; background: #fef9ef; min-height: 100vh;}
        .sell-fields {border:0;padding:0;margin:0;min-width:0;}
        .sell-error {margin-top:1rem;padding:1rem;border:1px solid #a33d2a;color:#7d2d20;border-radius:8px;}
        .sell-workspace :focus-visible {outline:2px solid #a33d2a!important;outline-offset:3px;}
        @media(prefers-reduced-motion:reduce) {.sell-workspace * {animation:none!important;transition:none!important;}}
        .sell-steps {display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0.5rem;margin-bottom:2rem;}
        .sell-steps button {display:flex;align-items:center;gap:0.5rem;min-width:0;padding:0.8rem;border:1px solid #ddd5c7;border-radius:8px;text-align:left;background:#fffdf7;color:#173c2e;}
        .sell-steps button[aria-current] {background:#173c2e;color:#fffdf7;}
        .sell-steps button span {font-weight:700;}
        @media(max-width:640px) {.sell-panel {padding:1rem!important;} .sell-steps {grid-template-columns:1fr 1fr;} .sell-workspace input,.sell-workspace textarea,.sell-workspace select {max-width:100%;}}

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
      </main>
    </>
  );
}
