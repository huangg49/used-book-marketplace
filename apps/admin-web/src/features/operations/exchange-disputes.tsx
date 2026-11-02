import { ExchangeEvidenceReview } from "./exchange-evidence-review";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Notice } from "../../core/ui";
import {
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel } from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;
  return <ExchangeDisputesContent />;
}

function ExchangeDisputesContent() {
  const user = useOutletContext<CurrentUser>();
  const panel = useQueuePanel();
  const [activeDispute, setActiveDispute] = useState<ExchangeDisputeItem | null>(null);

  const result = useQuery({
    queryKey: ["operations", "exchange-disputes", user.id],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: activeDispute ? false : refetchWhileClosed(panel),
  });

  return (
    <>
      <OperationsQueue
        number="08"
        title="Khiếu nại trao đổi sách."
        intro="Xem giao dịch đang cần xử lý và tình trạng gửi, nhận của hai bên. Danh sách không bao gồm giao dịch của chính bạn."
        order="Khiếu nại mới nhất trước."
        unit="khiếu nại"
        result={result}
        panel={panel}
        rows={(result.data ?? []).map((item) => {
          const parsed = parseDisputeReason(item.disputeReason || "");
          return {
            id: item.id,
            status: "Chờ xử lý · Giữ tiền và sách",
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
            detail: (
              <DisputeCompactSummary
                parsed={parsed}
                onOpen={() => setActiveDispute(item)}
              />
            ),
          };
        })}
        empty={{
          title: "Chưa có khiếu nại nào.",
          body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem. Điều này không xác nhận mọi giao dịch đều đã hoàn tất.",
        }}
        extra={() => (
          <Notice tone="warning">
            Chưa thể thực thi phán quyết hoàn tiền hoặc hoàn tất trao đổi. Tiền và
            sách tiếp tục được giữ. Nhóm vận hành cần hoàn tất việc xác minh nơi giữ
            sách, phân bổ tiền và quy trình kháng nghị trước khi mở quyền phân xử.
          </Notice>
        )}
      />

      {activeDispute && (
        <DisputeSideDrawer
          item={activeDispute}
          onClose={() => setActiveDispute(null)}
        />
      )}
    </>
  );
}

type ParsedDisputeReason = {
  category: string;
  detail: string;
  videoName: string;
  imageName: string;
};

function parseDisputeReason(reason: string): ParsedDisputeReason {
  let category = "";
  let detail = "";
  let videoName = "";
  let imageName = "";

  const lines = reason.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[Sự cố]:")) {
      category = trimmed.replace("[Sự cố]:", "").trim();
    } else if (trimmed.startsWith("[Chi tiết]:")) {
      detail = trimmed.replace("[Chi tiết]:", "").trim();
    } else if (trimmed.startsWith("[Video unboxing]:")) {
      videoName = trimmed.replace("[Video unboxing]:", "").trim();
    } else if (trimmed.startsWith("[Ảnh bằng chứng]:")) {
      imageName = trimmed.replace("[Ảnh bằng chứng]:", "").trim();
    }
  }

  return {
    category,
    detail: detail || (!category && !videoName && !imageName ? reason : ""),
    videoName,
    imageName,
  };
}

function DisputeCompactSummary({
  parsed,
  onOpen,
}: {
  parsed: ParsedDisputeReason;
  onOpen: () => void;
}) {
  const hasImage = Boolean(parsed.imageName);
  const hasVideo = Boolean(parsed.videoName);

  return (
    <div className={styles.compactRowWrapper}>
      <div className={styles.compactContent}>
        {parsed.category && (
          <span className={styles.compactCategoryBadge}>
            ⚠️ {parsed.category}
          </span>
        )}
        {parsed.detail && (
          <span className={styles.compactDetailText} title={parsed.detail}>
            &ldquo;{parsed.detail}&rdquo;
          </span>
        )}
        {(hasImage || hasVideo) && (
          <div className={styles.compactAttachGroup}>
            {hasImage && (
              <span className={styles.compactAttachPill} title={parsed.imageName}>
                Ảnh được khai báo
              </span>
            )}
            {hasVideo && (
              <span className={styles.compactAttachPill} title={parsed.videoName}>
                Video được khai báo
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.viewDossierButton}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        title="Mở hồ sơ đối soát và xem ảnh/video mở hộp"
      >
        <span>Xem hồ sơ</span>
        <span aria-hidden="true" className={styles.btnArrow}>→</span>
      </button>
    </div>
  );
}

function DisputeSideDrawer({
  item,
  onClose,
}: {
  item: ExchangeDisputeItem;
  onClose: () => void;
}) {
  const parsed = parseDisputeReason(item.disputeReason || "");
  const user = useOutletContext<CurrentUser>();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close(); document.body.style.overflow = overflow;
      queueMicrotask(() => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({preventScroll: true}); });
    };
  }, []);

  const handleCopyId = () => {
    try {
      void navigator.clipboard.writeText(item.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <dialog
        ref={dialog}
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onClick={(event) => { if (event.target === event.currentTarget) { const r=event.currentTarget.getBoundingClientRect(); if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) onClose(); } }}
        className={styles.drawerPanel}
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết khiếu nại #${item.id.slice(0, 8)}`}
      >
        <header className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            <span className={styles.drawerStatusTag}>
              🛡️ Chờ xử lý · Giữ tiền và sách
            </span>
            <h2 className={styles.drawerTitle}>
              Hồ sơ khiếu nại #{item.id.slice(0, 8)}
            </h2>
            <p className={styles.drawerMetaText}>
              Mở {item.disputedAt ? dateText(item.disputedAt) : "mới đây"} ·{" "}
              {item.disputedBy === "System"
                ? "Hệ thống tự động phát hiện (POL-07)"
                : "Thành viên báo sự cố"}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Đóng hồ sơ (Esc)"
            aria-label="Đóng"
          >
            ✕
          </button>
        </header>

        <div className={styles.drawerBody}>
          {/* Section 1: Financial Escrow Overview */}
          <div className={styles.escrowSection}>
            <span className={styles.sectionHeader}>
              Bảo chứng tài chính đang phong tỏa (POL-14)
            </span>
            <div className={styles.escrowGrid}>
              <div className={styles.escrowCard}>
                <span className={styles.escrowCardLabel}>Cọc bảo chứng Bên A</span>
                <span className={styles.escrowCardValue}>
                  {money(item.initiatorDeposit)}
                </span>
              </div>
              <div className={styles.escrowCard}>
                <span className={styles.escrowCardLabel}>Cọc bảo chứng Bên B</span>
                <span className={styles.escrowCardValue}>
                  {money(item.recipientDeposit)}
                </span>
              </div>
              <div className={styles.escrowCard}>
                <span className={styles.escrowCardLabel}>Tiền bù chênh lệch</span>
                <span className={styles.escrowCardValue}>
                  {item.diffAmount > 0 ? money(item.diffAmount) : "0 đ (Đổi ngang)"}
                </span>
              </div>
            </div>
            <p className={styles.escrowNote}>
              Toàn bộ số tiền trên đang được khóa bảo chứng trên sổ cái kép Ledger. Không bên nào được rút tiền cho đến khi có kết luận xử lý.
            </p>
          </div>

          {/* Section 2: Member Complaint */}
          <div className={styles.reasonCard}>
            <div className={styles.reasonHeader}>
              <span className={styles.sectionHeader}>Nội dung phản ánh từ thành viên:</span>
              {parsed.category && (
                <span className={styles.categoryBadge}>
                  <span>⚠️</span>
                  <span>{parsed.category}</span>
                </span>
              )}
            </div>
            <p className={styles.reasonText}>
              {item.disputeReason || "Không có nội dung chi tiết"}
            </p>
          </div>

          <ExchangeEvidenceReview key={user.id + ":" + item.id} id={item.id} userId={user.id} />

          {/* Section 4: Two-party cross audit */}
          <div className={styles.escrowSection}>
            <span className={styles.sectionHeader}>
              Tiến độ giao nhận hai chiều giữa hai bên:
            </span>
            <div className={styles.partiesGrid}>
              <div className={styles.partyCard}>
                <div className={styles.partyCardHeader}>
                  <span className={styles.partyRole}>Bên A (Khởi tạo)</span>
                  <span className={styles.partyDeposit}>{money(item.initiatorDeposit)}</span>
                </div>
                <div className={styles.auditRow}>
                  <span>Gửi hàng:</span>
                  <strong>{item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</strong>
                </div>
                <div className={styles.auditRow}>
                  <span>Xác nhận đã nhận:</span>
                  <strong>{item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</strong>
                </div>
              </div>

              <div className={styles.partyCard}>
                <div className={styles.partyCardHeader}>
                  <span className={styles.partyRole}>Bên B (Đối tác)</span>
                  <span className={styles.partyDeposit}>{money(item.recipientDeposit)}</span>
                </div>
                <div className={styles.auditRow}>
                  <span>Gửi hàng:</span>
                  <strong>{item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</strong>
                </div>
                <div className={styles.auditRow}>
                  <span>Xác nhận đã nhận:</span>
                  <strong>{item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.copyIdBtn}
            onClick={handleCopyId}
            title="Sao chép UUID giao dịch"
          >
            <span>{copied ? "✓ Đã chép mã" : "📋 Sao chép mã đơn"}</span>
          </button>
          <button
            type="button"
            className={styles.closeDossierBtn}
            onClick={onClose}
          >
            Đóng hồ sơ
          </button>
        </footer>
      </dialog>
    </>
  );
}
