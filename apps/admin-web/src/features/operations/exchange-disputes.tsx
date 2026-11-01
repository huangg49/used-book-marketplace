import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { ActionPanel } from "./action-panel";
import {
  exchangeDisputeResolution,
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { Field } from "./field";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel, type ActionContext } from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;
  return <ExchangeDisputesContent />;
}

function parseDisputeReason(rawReason: string) {
  const categoryMatch = rawReason.match(/\[Sự cố\]:\s*([^\n\r]+)/i);
  const detailMatch = rawReason.match(/\[Chi tiết\]:\s*([^\n\r]+)/i);
  const videoMatch = rawReason.match(/\[Video[^\]]*\]:\s*([^\n\r]+)/i);
  const imageMatch = rawReason.match(/\[Ảnh[^\]]*\]:\s*([^\n\r]+)/i);

  const category = categoryMatch ? categoryMatch[1].trim() : "Khiếu nại giao nhận";
  let detailText = detailMatch ? detailMatch[1].trim() : "";
  if (!detailText) {
    detailText = rawReason.replace(/\[[^\]]+\]:[^\n\r]*/g, "").trim() || rawReason;
  }
  const hasVideo = !!(videoMatch && !videoMatch[1].includes("Chưa"));
  const hasImage = !!(imageMatch && !imageMatch[1].includes("Chưa"));

  return {
    category,
    detailText: detailText.length > 120 ? detailText.slice(0, 117) + "..." : detailText,
    fullDetail: detailText,
    hasVideo,
    hasImage,
  };
}

function ExchangeDisputesContent() {
  const panel = useQueuePanel();
  const [filter, setFilter] = useState<"ALL" | "HAS_VIDEO" | "HAS_IMAGE" | "DAMAGE">("ALL");
  const [search, setSearch] = useState("");

  const result = useQuery({
    queryKey: ["operations", "exchange-disputes"],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: refetchWhileClosed(panel),
  });

  const rawItems = result.data ?? [];

  // Filter and search
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      const parsed = parseDisputeReason(item.disputeReason || "");
      if (filter === "HAS_VIDEO" && !parsed.hasVideo) return false;
      if (filter === "HAS_IMAGE" && !parsed.hasImage) return false;
      if (filter === "DAMAGE" && !parsed.category.toLowerCase().includes("rách") && !parsed.category.toLowerCase().includes("hư hỏng")) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const idMatch = item.id.toLowerCase().includes(q);
        const reasonMatch = (item.disputeReason || "").toLowerCase().includes(q);
        if (!idMatch && !reasonMatch) return false;
      }
      return true;
    });
  }, [rawItems, filter, search]);

  const counts = useMemo(() => {
    let hasVid = 0;
    let hasImg = 0;
    let damage = 0;
    for (const it of rawItems) {
      const p = parseDisputeReason(it.disputeReason || "");
      if (p.hasVideo) hasVid++;
      if (p.hasImage) hasImg++;
      if (p.category.toLowerCase().includes("rách") || p.category.toLowerCase().includes("hư hỏng")) damage++;
    }
    return { all: rawItems.length, hasVid, hasImg, damage };
  }, [rawItems]);

  return (
    <>
      <iframe
        id="evidence-bridge-iframe"
        src="http://localhost:5174/bridge.html"
        style={{ display: "none", width: 0, height: 0, border: 0 }}
        title="Evidence Bridge"
      />

      <OperationsQueue
        number="08"
        title="Khiếu nại trao đổi sách."
        intro="Phán quyết các tranh chấp phát sinh trong quá trình trao đổi sách (hàng giao chậm trễ quá 240h theo POL-07, hàng hư hỏng hoặc không đúng cam kết). Quản trị viên và nhân viên vận hành đưa ra quyết định hoàn cọc (RefundBoth) hoặc công nhận hoàn tất (CompleteExchange)."
        order="Khiếu nại mới nhất trước."
        unit="khiếu nại"
        result={result}
        panel={panel}
        extra={() => (
          <div className={styles.filterToolbar}>
            <div className={styles.filterGroup}>
              <button
                type="button"
                className={`${styles.filterPill} ${filter === "ALL" ? styles.filterPillActive : ""}`}
                onClick={() => setFilter("ALL")}
              >
                <span>Tất cả</span>
                <span className={styles.filterCount}>{counts.all}</span>
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${filter === "DAMAGE" ? styles.filterPillActive : ""}`}
                onClick={() => setFilter("DAMAGE")}
              >
                <span>⚠️ Hư hỏng / Rách nát</span>
                <span className={styles.filterCount}>{counts.damage}</span>
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${filter === "HAS_VIDEO" ? styles.filterPillActive : ""}`}
                onClick={() => setFilter("HAS_VIDEO")}
              >
                <span>📹 Có video unboxing</span>
                <span className={styles.filterCount}>{counts.hasVid}</span>
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${filter === "HAS_IMAGE" ? styles.filterPillActive : ""}`}
                onClick={() => setFilter("HAS_IMAGE")}
              >
                <span>📷 Có ảnh hiện trạng</span>
                <span className={styles.filterCount}>{counts.hasImg}</span>
              </button>
            </div>

            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Tìm mã #ID hoặc từ khóa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
              {search && (
                <button
                  type="button"
                  className={styles.clearSearchBtn}
                  onClick={() => setSearch("")}
                  title="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
        rows={filteredItems.map((item) => ({
          id: item.id,
          status: "Chờ phân xử",
          meta: [
            item.disputedBy === "System"
              ? "Hệ thống tự động (POL-07)"
              : "Thành viên khiếu nại",
            item.disputedAt ? `Mở ${dateText(item.disputedAt)}` : "Mới mở",
            `Cọc: ${money(item.initiatorDeposit)} / ${money(item.recipientDeposit)}`,
            item.diffAmount > 0
              ? `Bù chênh lệch: ${money(item.diffAmount)}`
              : "Không bù tiền",
          ],
          title: `Giao dịch trao đổi: #${item.id.slice(0, 8)}`,
          // COMPACT ROW SUMMARY: Render clean, scannable excerpt when row is collapsed!
          detail: <DisputeRowSummary item={item} />,
          // EXPANDED WORKSTATION: Render full evidence dossier + ledger + verdict form when row is opened!
          action: {
            label: "Thẩm định & Phân xử",
            render: (context) => <DisputeWorkstation item={item} {...context} />,
          },
        }))}
        empty={{
          title: filter === "ALL" && !search ? "Chưa có khiếu nại nào." : "Không tìm thấy khiếu nại phù hợp.",
          body:
            filter === "ALL" && !search
              ? "Tất cả các giao dịch trao đổi sách hiện đang diễn ra thuận lợi, không có sự cố tồn đọng."
              : "Thử đổi bộ lọc hoặc xóa từ khóa tìm kiếm để xem tất cả khiếu nại.",
        }}
      />
    </>
  );
}

// 1. COMPACT ROW SUMMARY (Displayed in the main list)
function DisputeRowSummary({ item }: { item: ExchangeDisputeItem }) {
  const parsed = parseDisputeReason(item.disputeReason || "");

  return (
    <div className={styles.rowSummary}>
      <div className={styles.rowBadges}>
        <span className={styles.badgeCategory}>⚠️ {parsed.category}</span>
        {parsed.hasImage && <span className={styles.badgePhoto}>📷 Có ảnh chụp</span>}
        {parsed.hasVideo && <span className={styles.badgeVideo}>📹 Clip unboxing 3.5s</span>}
        <span className={styles.rowEscrow}>
          Cọc A: <strong>{money(item.initiatorDeposit)}</strong> · B: <strong>{money(item.recipientDeposit)}</strong>
          {item.diffAmount > 0 && ` · Bù: ${money(item.diffAmount)}`}
        </span>
      </div>
      <div className={styles.rowExcerpt} title={parsed.fullDetail}>
        <strong style={{ color: "#334155" }}>Nội dung:</strong> {parsed.detailText || "Thành viên yêu cầu Hội đồng Quản trị thẩm định chất lượng sách."}
      </div>
    </div>
  );
}

// 2. EXPANDED WORKSTATION (Displayed when Admin clicks "Thẩm định & Phân xử")
function DisputeWorkstation({
  item,
  ...context
}: { item: ExchangeDisputeItem } & ActionContext) {
  const [decision, setDecision] = useState<"RefundBoth" | "CompleteExchange">();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const id = `exchange-dispute-${item.id}`;

  const [customBridgeImage, setCustomBridgeImage] = useState<string | null>(null);
  const [customBridgeVideo, setCustomBridgeVideo] = useState<string | null>(null);

  useEffect(() => {
    const handleMsg = (ev: MessageEvent) => {
      if (ev.data && ev.data.id === item.id) {
        if (ev.data.type === "EVIDENCE_IMG_RES" && ev.data.dataUrl) {
          setCustomBridgeImage(ev.data.dataUrl);
        }
        if (ev.data.type === "EVIDENCE_MEDIA_RES") {
          if (ev.data.imageData) setCustomBridgeImage(ev.data.imageData);
          if (ev.data.videoData) setCustomBridgeVideo(ev.data.videoData);
        }
      }
    };
    window.addEventListener("message", handleMsg);
    const bridgeIframe = document.getElementById("evidence-bridge-iframe") as HTMLIFrameElement | null;
    const sendReq = () => {
      if (bridgeIframe?.contentWindow) {
        bridgeIframe.contentWindow.postMessage({ type: "GET_EVIDENCE_MEDIA", id: item.id }, "*");
        bridgeIframe.contentWindow.postMessage({ type: "GET_EVIDENCE_IMG", id: item.id }, "*");
      }
    };
    sendReq();
    const timer = setTimeout(sendReq, 400);
    const timer2 = setTimeout(sendReq, 1000);
    return () => {
      window.removeEventListener("message", handleMsg);
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [item.id]);

  const rawReason = item.disputeReason || "";
  const parsed = parseDisputeReason(rawReason);

  const videoMatch =
    rawReason.match(/\[Video[^\]]*\]:\s*([^\n\r]+)/i) ||
    rawReason.match(/(https?:\/\/[^\s]+\.(?:mp4|webm|mov)|\/demo-evidence\/[^\s]+\.(?:mp4|webm|mov))/i);
  const rawVideo = videoMatch ? videoMatch[1].trim() : null;
  const videoUrl = rawVideo && !rawVideo.startsWith("Chưa")
    ? (rawVideo.startsWith("http") || rawVideo.startsWith("/") ? rawVideo : "/demo-evidence/sample-unboxing.mp4")
    : null;
  const displayVideo = customBridgeVideo || videoUrl;

  const imageMatch =
    rawReason.match(/\[Ảnh[^\]]*\]:\s*([^\n\r]+)/i) ||
    rawReason.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp)|\/demo-evidence\/[^\s]+\.(?:jpg|jpeg|png|webp))/i);
  const rawImage = imageMatch ? imageMatch[1].trim() : null;
  const imageUrl = rawImage && !rawImage.startsWith("Chưa") ? rawImage : null;
  const displayImage = customBridgeImage || (imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("/")) ? imageUrl : (imageUrl ? "/demo-evidence/sample-book-damage.jpg" : null));

  const handleApplyPreset = (text: string, dec: "RefundBoth" | "CompleteExchange") => {
    setDecision(dec);
    setReason(text);
    setProblem(undefined);
  };

  return (
    <ActionPanel
      {...context}
      label="Hồ sơ thẩm định & Phán quyết tranh chấp"
      title={`Hồ sơ thẩm định tranh chấp: #${item.id.slice(0, 8)}`}
      intro="Quản trị viên đối chiếu hồ sơ bằng chứng (ảnh & video mở hộp), kiểm tra vận đơn và ra phán quyết bất biến. Quyết định sẽ tự động cập nhật Ledger kế toán kép và thông báo đến 2 thành viên."
      dirty={!!decision || reason !== ""}
      fields={(locked) => (
        <div className={styles.workstationContainer}>
          {/* KHỐI 1: HỒ SƠ BẰNG CHỨNG (EVIDENCE DOSSIER) */}
          <div className={styles.dossierCard}>
            <div className={styles.dossierCardHeader}>
              <span>📁 Hồ sơ bằng chứng thẩm định bưu phẩm</span>
            </div>

            <div className={styles.reasonCallout}>
              <span className={styles.reasonCategoryTag}>Phân loại sự cố: {parsed.category}</span>
              <p className={styles.reasonText}>{parsed.fullDetail || "Không có mô tả chi tiết từ người gửi khiếu nại."}</p>
            </div>

            {(displayImage || displayVideo) ? (
              <div className={styles.evidenceGrid}>
                {displayImage && (
                  <div className={styles.evidenceSlot}>
                    <div className={styles.evidenceSlotHeader}>
                      <span>📷 Ảnh chụp vết rách / hư hại hiện trạng</span>
                      <span className={styles.slotTag}>Ảnh đối chiếu</span>
                    </div>
                    <div className={styles.evidencePhotoFrame}>
                      <img src={displayImage} alt="Ảnh bằng chứng hư hỏng" className={styles.evidencePhotoImg} />
                    </div>
                  </div>
                )}

                {displayVideo && (
                  <div className={styles.evidenceSlot}>
                    <div className={styles.evidenceSlotHeader}>
                      <span>📹 Video unboxing đồng kiểm GHN</span>
                      <span className={styles.slotTag}>Clip mở hộp 3.5s</span>
                    </div>
                    <div className={styles.evidenceVideoFrame}>
                      <video
                        src={displayVideo}
                        controls
                        playsInline
                        className={styles.evidenceVideoPlayer}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                Thành viên chưa đính kèm tệp đa phương tiện trong biên bản này.
              </p>
            )}
          </div>

          {/* KHỐI 2: ĐỐI CHIẾU HÀNH TRÌNH & KÝ QUỸ (ESCROW & CIRCULATION LEDGER) */}
          <div className={styles.escrowSection}>
            <div className={styles.escrowSectionHeader}>
              <span>⚖️ Đối chiếu hành trình giao nhận &amp; Ký quỹ hai bên</span>
            </div>

            <div className={styles.partyGrid}>
              <div className={styles.partyCard}>
                <div className={styles.partyHead}>
                  <span>Người khởi tạo (Bên A)</span>
                  <span style={{ fontSize: "11px", color: "#b45309" }}>{money(item.initiatorDeposit)}</span>
                </div>
                <div className={styles.partyRow}>
                  <span>Gửi hàng:</span>
                  <strong>{item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</strong>
                </div>
                <div className={styles.partyRow}>
                  <span>Xác nhận nhận sách:</span>
                  <strong>{item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</strong>
                </div>
                <div className={styles.partyRow}>
                  <span>Tiền cọc bảo chứng:</span>
                  <strong>{money(item.initiatorDeposit)}</strong>
                </div>
              </div>

              <div className={styles.partyCard}>
                <div className={styles.partyHead}>
                  <span>Đối tác (Bên B)</span>
                  <span style={{ fontSize: "11px", color: "#b45309" }}>{money(item.recipientDeposit)}</span>
                </div>
                <div className={styles.partyRow}>
                  <span>Gửi hàng:</span>
                  <strong>{item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</strong>
                </div>
                <div className={styles.partyRow}>
                  <span>Xác nhận nhận sách:</span>
                  <strong>{item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</strong>
                </div>
                <div className={styles.partyRow}>
                  <span>Tiền cọc bảo chứng:</span>
                  <strong>{money(item.recipientDeposit)}</strong>
                </div>
              </div>
            </div>

            <div style={{ fontSize: "11.5px", color: "#786055", marginTop: "2px" }}>
              💡 <strong>Cơ chế ký quỹ bảo đảm:</strong> Tiền cọc và tiền bù chênh lệch ({money(item.diffAmount)}) đang được đóng băng an toàn trên Ledger. Sau phán quyết, hệ thống tự động giải ngân hoặc hoàn tiền về ví cho người dùng mà không cần can thiệp thủ công.
            </div>
          </div>

          {/* KHỐI 3: BẢNG RA QUYẾT ĐỊNH PHÁN QUYẾT (VERDICT COMMAND) */}
          <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, fontSize: "13px", color: "#1e293b", marginBottom: "8px" }}>
              Lựa chọn phán quyết xử lý
            </legend>

            <div className={styles.verdictGrid}>
              {/* Lựa chọn 1: RefundBoth */}
              <div
                className={`${styles.verdictCard} ${decision === "RefundBoth" ? styles.verdictCardSelectedRefund : ""}`}
                onClick={() => {
                  if (!locked) {
                    setDecision("RefundBoth");
                    setProblem(undefined);
                  }
                }}
              >
                <div className={styles.verdictTitleRow}>
                  <input
                    type="radio"
                    name={`${id}-decision`}
                    checked={decision === "RefundBoth"}
                    onChange={() => {
                      setDecision("RefundBoth");
                      setProblem(undefined);
                    }}
                  />
                  <span style={{ color: "#b91c1c" }}>🔴 Hủy giao dịch &amp; Hoàn cọc (RefundBoth)</span>
                </div>
                <p className={styles.verdictDesc}>
                  Hoàn trả 100% tiền cọc và tiền bù chênh lệch cho cả 2 bên. Mở lại toàn bộ sách về trạng thái Có sẵn. Dùng khi sách hư hỏng nặng, rách nát hoặc giao sai sách.
                </p>
              </div>

              {/* Lựa chọn 2: CompleteExchange */}
              <div
                className={`${styles.verdictCard} ${decision === "CompleteExchange" ? styles.verdictCardSelectedComplete : ""}`}
                onClick={() => {
                  if (!locked) {
                    setDecision("CompleteExchange");
                    setProblem(undefined);
                  }
                }}
              >
                <div className={styles.verdictTitleRow}>
                  <input
                    type="radio"
                    name={`${id}-decision`}
                    checked={decision === "CompleteExchange"}
                    onChange={() => {
                      setDecision("CompleteExchange");
                      setProblem(undefined);
                    }}
                  />
                  <span style={{ color: "#047857" }}>🟢 Công nhận hoàn tất (CompleteExchange)</span>
                </div>
                <p className={styles.verdictDesc}>
                  Tất toán tiền cọc cho cả hai bên, chuyển tiền bù cho bên nhận và ghi nhận sách Đã đổi. Dùng khi khiếu nại không đủ cơ sở hoặc sách đúng cam kết ban đầu.
                </p>
              </div>
            </div>

            {problem === "decision" && (
              <p style={{ color: "#dc2626", fontSize: "12px", margin: "-6px 0 10px 0", fontWeight: 600 }}>
                ⚠️ Vui lòng chọn một trong hai quyết định xử lý bên trên.
              </p>
            )}

            {/* Quick preset templates */}
            <div className={styles.presetBar}>
              <span className={styles.presetLabel}>⚡ Mẫu căn cứ nhanh:</span>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() =>
                  handleApplyPreset(
                    "Căn cứ video unboxing và ảnh chụp thực tế: sách bị rách nát bìa và ẩm ướt nghiêm trọng, không đúng tình trạng đã cam kết. Quản trị viên quyết định hủy giao dịch và hoàn lại 100% tiền cọc bảo chứng cùng tiền bù cho các bên theo POL-14.",
                    "RefundBoth"
                  )
                }
              >
                Sách hư hỏng nặng (Hoàn cọc)
              </button>
              <button
                type="button"
                className={styles.presetBtn}
                onClick={() =>
                  handleApplyPreset(
                    "Căn cứ video unboxing đối chiếu với mô tả bài đăng ban đầu: tình trạng sách hoàn toàn phù hợp với độ cũ đã thông báo, các dấu hiệu hao mòn tự nhiên không cấu thành lỗi nghiêm trọng. Quản trị viên công nhận hoàn tất giao dịch và tiến hành tất toán cọc.",
                    "CompleteExchange"
                  )
                }
              >
                Sách đúng cam kết (Hoàn tất)
              </button>
            </div>

            <Field
              id={`${id}-reason`}
              label="Căn cứ và lý do phán quyết"
              hint="Bắt buộc, từ 5 đến 500 ký tự. Sẽ được lưu vào nhật ký kiểm toán và gửi thông báo trực tiếp đến hai thành viên."
              error={
                problem === "reason"
                  ? "Vui lòng nhập lý do phán quyết từ 5 đến 500 ký tự."
                  : undefined
              }
            >
              <textarea
                id={`${id}-reason`}
                rows={3}
                maxLength={500}
                value={reason}
                aria-invalid={problem === "reason"}
                placeholder="Ghi rõ căn cứ giải quyết tranh chấp (ví dụ: đã đối chiếu clip mở hộp thấy bìa sách rách nát nặng...)"
                onChange={(e) => {
                  setReason(e.target.value);
                  setProblem(undefined);
                }}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </Field>
          </fieldset>
        </div>
      )}
      validate={() => {
        if (!decision) {
          setProblem("decision");
          return false;
        }
        const trimmed = reason.trim();
        if (trimmed.length < 5 || trimmed.length > 500) {
          setProblem("reason");
          document.getElementById(`${id}-reason`)?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Xác nhận phán quyết"
      confirmTitle="Xác nhận ban hành phán quyết tranh chấp?"
      confirmBody={
        <>
          <p>
            {decision === "RefundBoth"
              ? "Hủy giao dịch trao đổi, hoàn lại 100% tiền cọc và tiền bù chênh lệch về ví của hai bên. Sách sẽ được mở lại trên kệ."
              : "Công nhận giao dịch thành công. Tiền cọc được giải phóng về ví và tiền bù chuyển cho người nhận sách."}{" "}
            Phán quyết này là <strong>bất biến</strong> và được ghi nhận vĩnh viễn trên sổ cái kiểm toán.
          </p>
          <blockquote className="prose">{reason.trim()}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/exchanges/${item.id}/resolve`,
        body: {
          expectedVersion: item.revision,
          decision,
          reason: reason.trim(),
        },
      })}
      schema={exchangeDisputeResolution}
      interpret={(receipt) => ({
        tone: "success",
        text:
          receipt.status === "Cancelled"
            ? "Đã ban hành phán quyết: Hủy trao đổi và hoàn tiền bảo chứng cho cả hai bên."
            : "Đã ban hành phán quyết: Công nhận trao đổi thành công và tất toán.",
        close: true,
      })}
    />
  );
}
