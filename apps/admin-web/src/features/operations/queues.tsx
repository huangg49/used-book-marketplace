import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertCircle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gavel,
  Layers,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  User,
  X,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canOperateIntake, canOperatePoint, canResolve, session } from "../../core/session";
import { AssignmentNote } from "./assignment-note";
import { AuctionCancel, AuctionHoldDecision, AuctionScheduledDecision } from "./auction-actions";
import {
  collectionLabels,
  collectionQueue,
  intakeLabels,
  intakeList,
  operationsAuctionList,
  outcomeLabels,
  reclaimLabels,
  resolutionLabels,
  resolutionQueue,
  type CollectionItem,
  type Intake,
  type OperationsAuction,
} from "./contracts";
import {
  CollectionDispatch,
  CollectionHandover,
  CollectionReturn,
} from "./collection-actions";
import {
  IntakeEvidenceDecision,
  IntakeInspect,
} from "./inspection";
import { IntakeReceive, IntakeReclaim } from "./intake-actions";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { ResolutionDecision } from "./resolution-actions";
import { useLiveQueueInterval, useQueuePanel, type Row } from "./queue-panel";
import intakeStyles from "./IntakeQueue.module.css";
import collectionStyles from "./CollectionQueue.module.css";

// Queues for the point desks and Admin decisions. Each row's command opens
// under the row (N4-02 to N4-05).

export function IntakeQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperateIntake(user)) return <Forbidden />;
  return <IntakeQueueContent userId={user.id} />;
}
function intakeMeta(item: Intake) {
  if (item.state === "AwaitingDropoff")
    return [`Hạn mang tới: ${dateText(item.dropoffDeadline)}`];
  const meta = [`Nhận lúc ${dateText(item.receivedAt)}`];
  if (item.inspectionDueAt)
    meta.push(`Hạn kiểm tra: ${dateText(item.inspectionDueAt)}`);
  if (item.reclaimDueAt)
    meta.push(`Hạn người bán nhận lại: ${dateText(item.reclaimDueAt)}`);
  if (item.state === "NeedsEvidence")
    meta.push(
      item.evidenceSubmittedAt
        ? "Người bán đã bổ sung bằng chứng"
        : `Hạn bổ sung: ${dateText(item.evidenceDeadline)}`,
    );
  if (item.reclaimReason) meta.push(reclaimLabels[item.reclaimReason]);
  return meta;
}
const intakeTone = {
  AwaitingDropoff: "neutral",
  Received: "ready",
  Passed: "active",
  NeedsEvidence: "attention",
  Auctioning: "active",
  ReclaimRequired: "attention",
  Reclaimed: "neutral",
  Cancelled: "neutral",
  Sold: "completed",
} as const satisfies Record<Intake["state"], string>;

function IntakeRowSummary({
  item,
  meta,
  userId,
  index,
}: {
  item: Intake;
  meta: string[];
  userId: string;
  index: number;
}) {
  const title = item.title || "Chưa có tên sách";
  const initial = title.trim().charAt(0).toUpperCase() || "S";
  const waitingForOtherReviewer =
    item.state === "NeedsEvidence" && item.evidenceRequestedBy === userId;
  const [showAllReports, setShowAllReports] = useState(false);
  const latestReport = item.reports.at(-1);
  const previousReports = item.reports.slice(0, -1).reverse();

  return (
    <div className={intakeStyles.card}>
      {/* Archival Book Jacket / Thumbnail */}
      <div className={intakeStyles.bookCover} aria-hidden="true">
        <div className={intakeStyles.bookSpine} />
        <div className={intakeStyles.bookCoverBody}>
          <div className={intakeStyles.bookRibbon} />
          <BookOpen className={intakeStyles.bookCoverIcon} size={20} />
          <span className={intakeStyles.bookCoverInitial}>{initial}</span>
          <span className={intakeStyles.bookCoverIndex}>{String(index + 1).padStart(2, "0")}</span>
        </div>
      </div>

      {/* Main Dossier Content */}
      <div className={intakeStyles.dossier}>
        {/* Header Line: Title, ID, Shelf Tag, Status Badge */}
        <div className={intakeStyles.headerLine}>
          <div className={intakeStyles.titleGroup}>
            <h2 className={intakeStyles.bookTitle}>{title}</h2>
            <span className={intakeStyles.refCode}>#{item.id.slice(0, 8)}</span>
          </div>

          <div className={intakeStyles.badgesGroup}>
            {item.shelfCode ? (
              <span className={intakeStyles.shelfTag}>
                <MapPin size={13} aria-hidden="true" />
                <span>KỆ {item.shelfCode}</span>
              </span>
            ) : (
              <span className={intakeStyles.shelfTagEmpty}>
                <span>Chưa xếp kệ</span>
              </span>
            )}

            <span className={intakeStyles.statusBadge} data-tone={intakeTone[item.state]}>
              {item.state === "Auctioning" && <span className={intakeStyles.pulseDot} aria-hidden="true" />}
              {item.state === "Sold" && <Check size={12} aria-hidden="true" />}
              {intakeLabels[item.state]}
            </span>
          </div>
        </div>

        {waitingForOtherReviewer && (
          <div className={intakeStyles.noticeBanner}>
            <AlertCircle size={14} aria-hidden="true" />
            <span>Nhân viên hoặc quản trị viên khác sẽ xem bằng chứng bạn đã yêu cầu.</span>
          </div>
        )}

        <details className={intakeStyles.priceDisclosure}>
          <summary aria-label={`Thông tin giá của ${title}`}>
            <ChevronDown size={15} aria-hidden="true" /> Thông tin giá
          </summary>
          <dl className={intakeStyles.priceMatrix}>
            <div className={intakeStyles.priceCell}>
              <dt className={intakeStyles.priceLabel}>Giá khởi điểm</dt>
              <dd className={intakeStyles.priceValue}>{money(item.startPrice)}</dd>
            </div>
            <div className={intakeStyles.priceCell}>
              <dt className={intakeStyles.priceLabel}>Bước giá</dt>
              <dd className={intakeStyles.priceValue}>+{money(item.step)}</dd>
            </div>
            {item.buyNowPrice !== null && (
              <div className={intakeStyles.priceCell}>
                <dt className={intakeStyles.priceLabel}>Giá mua ngay</dt>
                <dd className={intakeStyles.priceValueBuyNow}>{money(item.buyNowPrice)}</dd>
              </div>
            )}
          </dl>
        </details>

        {/* Inspection Certificate Seal (Biên bản kiểm định tại điểm) */}
        {latestReport ? (
          <div className={intakeStyles.inspectionCert}>
            <div className={intakeStyles.certHeader}>
              <span className={intakeStyles.certStamp} data-outcome={latestReport.outcome}>
                {latestReport.outcome === "Pass" ? (
                  <CheckCircle2 size={13} aria-hidden="true" />
                ) : latestReport.outcome === "Fail" ? (
                  <AlertCircle size={13} aria-hidden="true" />
                ) : (
                  <Clock size={13} aria-hidden="true" />
                )}
                <span>{outcomeLabels[latestReport.outcome]} kiểm định</span>
              </span>
              <span className={intakeStyles.certMeta}>
                Biên bản #{latestReport.revision} · {dateText(latestReport.createdAt)}
              </span>
              {previousReports.length > 0 && (
                <button
                  type="button"
                  className={intakeStyles.historyToggle}
                  aria-expanded={showAllReports}
                  onClick={() => setShowAllReports(!showAllReports)}
                >
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    style={{ transform: showAllReports ? "rotate(180deg)" : undefined }}
                  />
                  {showAllReports ? "Ẩn lịch sử" : `+${previousReports.length} biên bản cũ`}
                </button>
              )}
            </div>
            {latestReport.note && (
              <blockquote className={intakeStyles.certNote}>
                “{latestReport.note}”
              </blockquote>
            )}
            {showAllReports && previousReports.length > 0 && (
              <div className={intakeStyles.historyList}>
                {previousReports.map((r) => (
                  <div key={r.revision} className={intakeStyles.historyItem}>
                    <span className={intakeStyles.historyOutcome} data-outcome={r.outcome}>
                      #{r.revision} {outcomeLabels[r.outcome]}
                    </span>
                    <span className={intakeStyles.historyTime}>{dateText(r.createdAt)}</span>
                    {r.note && <span>— {r.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={intakeStyles.noCert}>
            <span className={intakeStyles.noCertText}>Chưa có biên bản kiểm tra tại điểm</span>
          </div>
        )}

        {/* Footer Meta: Logistics & Timestamps */}
        <div className={intakeStyles.metaList}>
          {meta.map((text) => (
            <span key={text} className={intakeStyles.metaItem}>
              <Clock size={12} aria-hidden="true" />
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// N4-02: the next step for the assigned Staff member, if any.
function intakeAction(item: Intake, userId: string): Row["action"] {
  switch (item.state) {
    // The Staff member who asked for evidence never decides on it.
    case "NeedsEvidence":
      return item.evidenceRequestedBy === userId
        ? undefined
        : {
            label: "Xem bằng chứng",
            render: (context) => (
              <IntakeEvidenceDecision item={item} {...context} />
            ),
          };
    case "AwaitingDropoff":
      return {
        label: "Nhận sách",
        modal: true,
        render: (context) => <IntakeReceive item={item} {...context} />,
      };
    case "Received":
      return {
        label: "Kiểm tra",
        modal: true,
        render: (context) => <IntakeInspect item={item} {...context} />,
      };
    // ADR 0047: the seller publishes a Passed book; Staff no longer open it.
    case "ReclaimRequired":
      return {
        label: "Trả sách",
        render: (context) => <IntakeReclaim item={item} {...context} />,
      };
    case "Auctioning":
    case "Sold":
      if (item.auctionId) {
        return {
          label: "Xem phiên ↗",
          to: "/operations/auctions",
        };
      }
      return undefined;
    default:
      return undefined;
  }
}

const queueSearch = (input: string) =>
  input.trim().toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("đ", "d");

type FilterTab = "all" | "awaiting" | "inspecting" | "auction" | "reclaim" | "resolved";

function IntakeQueueContent({ userId }: { userId: string }) {
  const panel = useQueuePanel();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const refetchInterval = useLiveQueueInterval(panel, ["operations", "auction-intakes"]);
  const result = useQuery({
    queryKey: ["operations", "auction-intakes"],
    queryFn: () => session.request("/operations/auction-intakes", intakeList),
    refetchInterval,
  });
  const items = result.data?.items ?? [];

  const stats = {
    total: items.length,
    awaiting: items.filter((i) => i.state === "AwaitingDropoff").length,
    inspecting: items.filter((i) => i.state === "Received" || i.state === "NeedsEvidence").length,
    auction: items.filter((i) => i.state === "Passed" || i.state === "Auctioning").length,
    reclaim: items.filter((i) => i.state === "ReclaimRequired").length,
    resolved: items.filter((i) => i.state === "Sold").length,
  };

  const tabFilter = (item: Intake): boolean => {
    switch (activeTab) {
      case "awaiting":
        return item.state === "AwaitingDropoff";
      case "inspecting":
        return item.state === "Received" || item.state === "NeedsEvidence";
      case "auction":
        return item.state === "Passed" || item.state === "Auctioning";
      case "reclaim":
        return item.state === "ReclaimRequired";
      case "resolved":
        return item.state === "Sold";
      default:
        return true;
    }
  };

  const searchTerm = queueSearch(search);
  const filteredItems = items
    .filter(tabFilter)
    .filter((item) => {
      if (!searchTerm) return true;
      return queueSearch([item.id, item.title, item.pointId, item.shelfCode, intakeLabels[item.state]]
        .filter((value): value is string => Boolean(value))
        .join(" "))
        .includes(searchTerm);
    });

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shownFrom = (currentPage - 1) * pageSize;
  const pageItems = filteredItems.slice(shownFrom, shownFrom + pageSize);
  const openItem = panel.open ? items.find((i) => i.id === panel.open) : undefined;
  const visibleItems = openItem && !pageItems.some((i) => i.id === panel.open)
    ? [openItem, ...pageItems]
    : pageItems;

  return (
    <OperationsQueue
      number="01"
      title="Sách gửi đấu giá"
      intro="Nhận và kiểm tra sách theo bài đã duyệt. Sách đạt do người bán đăng hoặc hẹn phiên. Sách không đạt thì trả tại điểm."
      order="Xếp theo lần gửi, cũ nhất trước."
      result={result}
      panel={panel}
      extra={() => (
        <>
          {/* Quick KPI Stats Ribbon */}
          <div className={intakeStyles.kpiGrid}>
            <button
              type="button"
              className={intakeStyles.kpiCard}
              aria-pressed={activeTab === "all"}
              data-active={activeTab === "all"}
              onClick={() => { setActiveTab("all"); setPage(1); }}
            >
              <div className={intakeStyles.kpiIcon}><BookOpen size={18} aria-hidden="true" /></div>
              <div className={intakeStyles.kpiData}>
                <span className={intakeStyles.kpiNumber}>{stats.total}</span>
                <span className={intakeStyles.kpiTitle}>Hồ sơ đã tải</span>
              </div>
            </button>

            <button
              type="button"
              className={intakeStyles.kpiCard}
              aria-pressed={activeTab === "awaiting"}
              data-active={activeTab === "awaiting"}
              onClick={() => { setActiveTab("awaiting"); setPage(1); }}
            >
              <div className={intakeStyles.kpiIcon}><Clock size={18} aria-hidden="true" /></div>
              <div className={intakeStyles.kpiData}>
                <span className={intakeStyles.kpiNumber}>{stats.awaiting}</span>
                <span className={intakeStyles.kpiTitle}>Chờ tiếp nhận</span>
              </div>
            </button>

            <button
              type="button"
              className={intakeStyles.kpiCard}
              aria-pressed={activeTab === "inspecting"}
              data-active={activeTab === "inspecting"}
              onClick={() => { setActiveTab("inspecting"); setPage(1); }}
            >
              <div className={intakeStyles.kpiIcon}><CheckCircle2 size={18} aria-hidden="true" /></div>
              <div className={intakeStyles.kpiData}>
                <span className={intakeStyles.kpiNumber}>{stats.inspecting}</span>
                <span className={intakeStyles.kpiTitle}>Cần kiểm định</span>
              </div>
            </button>

            <button
              type="button"
              className={intakeStyles.kpiCard}
              aria-pressed={activeTab === "auction"}
              data-active={activeTab === "auction"}
              onClick={() => { setActiveTab("auction"); setPage(1); }}
            >
              <div className={intakeStyles.kpiIcon}><Gavel size={18} aria-hidden="true" /></div>
              <div className={intakeStyles.kpiData}>
                <span className={intakeStyles.kpiNumber}>{stats.auction}</span>
                <span className={intakeStyles.kpiTitle}>Trên kệ / Đấu giá</span>
              </div>
            </button>

            <button
              type="button"
              className={intakeStyles.kpiCard}
              aria-pressed={activeTab === "resolved"}
              data-active={activeTab === "resolved"}
              onClick={() => { setActiveTab("resolved"); setPage(1); }}
            >
              <div className={intakeStyles.kpiIcon}><Archive size={18} aria-hidden="true" /></div>
              <div className={intakeStyles.kpiData}>
                <span className={intakeStyles.kpiNumber}>{stats.resolved}</span>
                <span className={intakeStyles.kpiTitle}>Đã bán</span>
              </div>
            </button>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className={intakeStyles.controlBar}>
            <div className={intakeStyles.filterTabs} role="group" aria-label="Lọc hồ sơ theo trạng thái">
              <button
                type="button"
                aria-pressed={activeTab === "all"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "all"}
                onClick={() => { setActiveTab("all"); setPage(1); }}
              >
                Tất cả <span className={intakeStyles.tabCount}>{stats.total}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "awaiting"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "awaiting"}
                onClick={() => { setActiveTab("awaiting"); setPage(1); }}
              >
                Chờ nhận <span className={intakeStyles.tabCount}>{stats.awaiting}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "inspecting"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "inspecting"}
                onClick={() => { setActiveTab("inspecting"); setPage(1); }}
              >
                Cần kiểm định <span className={intakeStyles.tabCount}>{stats.inspecting}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "auction"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "auction"}
                onClick={() => { setActiveTab("auction"); setPage(1); }}
              >
                Đang đấu giá <span className={intakeStyles.tabCount}>{stats.auction}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "reclaim"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "reclaim"}
                onClick={() => { setActiveTab("reclaim"); setPage(1); }}
              >
                Chờ trả sách <span className={intakeStyles.tabCount}>{stats.reclaim}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "resolved"}
                className={intakeStyles.tabBtn}
                data-active={activeTab === "resolved"}
                onClick={() => { setActiveTab("resolved"); setPage(1); }}
              >
                Đã bán <span className={intakeStyles.tabCount}>{stats.resolved}</span>
              </button>
            </div>

            <div className={intakeStyles.searchBox} data-focus-surface>
              <Search size={16} className={intakeStyles.searchIcon} aria-hidden="true" />
              <input
                id="intake-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo tên sách, mã hồ sơ, mã kệ..."
                aria-label="Tìm kiếm sách gửi đấu giá"
              />
              {search && (
                <button
                  type="button"
                  className={intakeStyles.clearSearchBtn}
                  onClick={() => { setSearch(""); setPage(1); }}
                  aria-label="Xóa tìm kiếm"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      footer={() => filteredItems.length > 0 && (
        <nav className={intakeStyles.pagination} aria-label="Phân trang sách gửi đấu giá">
          <p aria-live="polite">
            Hiển thị {shownFrom + 1}–{Math.min(shownFrom + pageSize, filteredItems.length)} trong {filteredItems.length} hồ sơ đã lọc ({items.length} đã tải).
          </p>
          <div>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              Trước
            </button>
            <span>Trang {currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
              Sau
            </button>
          </div>
        </nav>
      )}
      presentation={{
        className: intakeStyles.queue,
        listHeader: (
          <div className={intakeStyles.listHeader} aria-hidden="true">
            <div className={intakeStyles.listHeaderTitle}>
              <Layers size={14} />
              <span>Hồ sơ sách lưu kho & đấu giá</span>
            </div>
            <span className={intakeStyles.listHeaderAction}>Thao tác tại điểm</span>
          </div>
        ),
      }}
      rows={visibleItems.map((item, index) => {
        const meta = intakeMeta(item);
        return {
          id: item.id,
          status: intakeLabels[item.state],
          meta: [...meta, item.shelfCode ?? ""],
          title: item.title,
          summary: <IntakeRowSummary item={item} meta={meta} userId={userId} index={shownFrom + index} />,
          action: intakeAction(item, userId),
        };
      })}
      empty={{
        title: search || activeTab !== "all" ? "Không tìm thấy sách phù hợp." : "Chưa có sách cần xử lý.",
        body: search || activeTab !== "all"
          ? "Thử đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm (tên sách, mã hồ sơ, mã kệ)."
          : <AssignmentNote />,
      }}
    />
  );
}

const collectionTone: Record<CollectionItem["state"], string> = {
  ReadyForCollection: "ready",
  InTransit: "in-transit",
  Inspection: "ready",
  ReturnPending: "attention",
  Completed: "completed",
  AwaitingPayment: "neutral",
  Fulfilling: "neutral",
  ResolutionPending: "attention",
  Cancelled: "neutral",
  PaymentExpired: "neutral",
};

function CollectionRowSummary({
  item,
  index,
}: {
  item: CollectionItem;
  index: number;
}) {
  const title = item.title || "Chưa có tên sách";
  const initial = title.trim().charAt(0).toUpperCase() || "S";
  const deadlineText =
    item.state === "ReturnPending"
      ? `Hạn mang trả: ${dateText(item.returnDeadline)}`
      : item.fulfillmentMethod === "CarrierOutbound"
        ? `Hạn giao cho hãng: ${dateText(item.collectionDeadline)}`
        : `Hạn đến lấy: ${dateText(item.collectionDeadline)}`;

  return (
    <div className={collectionStyles.card}>
      {/* Tactile Archival Book Thumbnail */}
      <div className={collectionStyles.bookCover} aria-hidden="true">
        <div className={collectionStyles.bookSpine} />
        <div className={collectionStyles.bookCoverBody}>
          <div className={collectionStyles.bookRibbon} />
          <BookOpen className={collectionStyles.bookCoverIcon} size={20} />
          <span className={collectionStyles.bookCoverInitial}>{initial}</span>
          <span className={collectionStyles.bookCoverIndex}>{String(index + 1).padStart(2, "0")}</span>
        </div>
      </div>

      {/* Main Dossier Content */}
      <div className={collectionStyles.dossier}>
        {/* Header Line: Title, ID, Shelf Tag, Fulfillment Method Badge, Status Badge */}
        <div className={collectionStyles.headerLine}>
          <div className={collectionStyles.titleGroup}>
            <h2 className={collectionStyles.bookTitle}>{title}</h2>
            <span className={collectionStyles.refCode}>#{item.id.slice(0, 8)}</span>
          </div>

          <div className={collectionStyles.badgesGroup}>
            {item.shelfCode ? (
              <span className={collectionStyles.shelfTag}>
                <MapPin size={13} aria-hidden="true" />
                <span>KỆ {item.shelfCode}</span>
              </span>
            ) : (
              <span className={collectionStyles.shelfTagEmpty}>
                <span>Chưa xếp kệ</span>
              </span>
            )}

            {item.fulfillmentMethod === "CarrierOutbound" ? (
              <span className={collectionStyles.methodBadgeCarrier}>
                <Truck size={13} aria-hidden="true" />
                <span>GIAO TẬN NƠI (SHIPPER)</span>
              </span>
            ) : (
              <span className={collectionStyles.methodBadgeSelf}>
                <User size={13} aria-hidden="true" />
                <span>NHẬN TẠI ĐIỂM</span>
              </span>
            )}

            <span className={collectionStyles.statusBadge} data-tone={collectionTone[item.state] ?? "neutral"}>
              {collectionStatus(item)}
            </span>
          </div>
        </div>

        {/* Recipient & Shipping Dossier */}
        {item.delivery ? (
          <div className={collectionStyles.recipientCard}>
            <div className={collectionStyles.recipientRow}>
              <div className={collectionStyles.recipientField}>
                <span className={collectionStyles.fieldLabel}>
                  <User size={12} aria-hidden="true" /> NGƯỜI NHẬN
                </span>
                <span className={collectionStyles.fieldValBold}>{item.delivery.recipientName}</span>
              </div>
              <div className={collectionStyles.recipientDivider} />
              <div className={collectionStyles.recipientField}>
                <span className={collectionStyles.fieldLabel}>
                  <Phone size={12} aria-hidden="true" /> ĐIỆN THOẠI
                </span>
                <span className={collectionStyles.fieldValPhone}>{item.delivery.phone}</span>
              </div>
              {item.delivery.trackingCode && (
                <>
                  <div className={collectionStyles.recipientDivider} />
                  <div className={collectionStyles.recipientField}>
                    <span className={collectionStyles.fieldLabel}>
                      <Truck size={12} aria-hidden="true" /> MÃ VẬN ĐƠN
                    </span>
                    <span className={collectionStyles.fieldValMono}>{item.delivery.trackingCode}</span>
                  </div>
                </>
              )}
            </div>
            <div className={collectionStyles.addressRow}>
              <MapPin size={13} className={collectionStyles.addressIcon} aria-hidden="true" />
              <span className={collectionStyles.addressText}>{item.delivery.detail}</span>
            </div>
          </div>
        ) : (
          <div className={collectionStyles.recipientCard}>
            <div className={collectionStyles.recipientRow}>
              <div className={collectionStyles.recipientField}>
                <span className={collectionStyles.fieldLabel}>
                  <User size={12} aria-hidden="true" /> NGƯỜI ĐẾN NHẬN
                </span>
                <span className={collectionStyles.fieldValBold}>{item.recipientName}</span>
              </div>
              <div className={collectionStyles.recipientDivider} />
              <div className={collectionStyles.recipientField}>
                <span className={collectionStyles.fieldLabel}>
                  <ShieldCheck size={12} aria-hidden="true" /> XÁC THỰC
                </span>
                <span className={collectionStyles.fieldVal}>Yêu cầu mã 6 số trên ứng dụng khi giao sách</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Meta: Logistics & Timestamps */}
        <div className={collectionStyles.metaList}>
          <span className={collectionStyles.metaItem}>
            <Clock size={12} aria-hidden="true" />
            {deadlineText}
          </span>
        </div>
      </div>
    </div>
  );
}

// N4-03: handover with the recipient's code, or a return check.
function collectionAction(item: CollectionItem): Row["action"] {
  if (
    item.state === "ReadyForCollection" &&
    item.fulfillmentMethod === "CarrierOutbound"
  )
    return {
      label: "Giao cho hãng",
      render: (context) => <CollectionDispatch item={item} {...context} />,
    };
  if (item.state === "ReadyForCollection")
    return {
      label: "Giao sách",
      render: (context) => <CollectionHandover item={item} {...context} />,
    };
  if (item.state === "ReturnPending")
    return {
      label: "Nhận lại sách",
      render: (context) => <CollectionReturn item={item} {...context} />,
    };
  return undefined;
}

export function CollectionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperatePoint(user)) return <Forbidden />;
  return <CollectionQueueContent />;
}

type CollectionFilterTab = "all" | "carrier" | "self" | "return" | "report";

function collectionStatus(item: CollectionItem) {
  return item.state === "ReadyForCollection" && item.fulfillmentMethod === "CarrierOutbound"
    ? "Chờ bàn giao cho hãng"
    : collectionLabels[item.state];
}

function CollectionQueueContent() {
  const panel = useQueuePanel();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CollectionFilterTab>("all");
  const [page, setPage] = useState(1);
  const refetchInterval = useLiveQueueInterval(panel, ["operations", "point-orders"]);
  const result = useQuery({
    queryKey: ["operations", "point-orders"],
    queryFn: () => session.request("/operations/point-orders", collectionQueue),
    refetchInterval,
  });
  const items = result.data?.items ?? [];

  const stats = {
    total: items.length,
    carrier: items.filter((i) => i.fulfillmentMethod === "CarrierOutbound" && i.state === "ReadyForCollection").length,
    self: items.filter((i) => i.fulfillmentMethod === "SelfCollect" && i.state === "ReadyForCollection").length,
    returnPending: items.filter((i) => i.state === "ReturnPending").length,
    report: items.filter((i) => i.state === "Fulfilling").length,
  };

  const tabFilter = (item: CollectionItem): boolean => {
    switch (activeTab) {
      case "carrier":
        return item.fulfillmentMethod === "CarrierOutbound" && item.state === "ReadyForCollection";
      case "self":
        return item.fulfillmentMethod === "SelfCollect" && item.state === "ReadyForCollection";
      case "return":
        return item.state === "ReturnPending";
      case "report":
        return item.state === "Fulfilling";
      default:
        return true;
    }
  };

  const searchTerm = queueSearch(search);
  const filteredItems = items
    .filter(tabFilter)
    .filter((item) => {
      if (!searchTerm) return true;
      const deliveryText = item.delivery
        ? `${item.delivery.recipientName} ${item.delivery.phone} ${item.delivery.detail} ${item.delivery.trackingCode ?? ""}`
        : "";
      return queueSearch([item.id, item.title, item.recipientName, item.shelfCode, collectionStatus(item), deliveryText]
        .filter((value): value is string => Boolean(value))
        .join(" "))
        .includes(searchTerm);
    });

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shownFrom = (currentPage - 1) * pageSize;
  const pageItems = filteredItems.slice(shownFrom, shownFrom + pageSize);
  const openItem = panel.open ? items.find((i) => i.id === panel.open) : undefined;
  const visibleItems = openItem && !pageItems.some((i) => i.id === panel.open)
    ? [openItem, ...pageItems]
    : pageItems;

  return (
    <OperationsQueue
      number="02"
      title="Giao sách tại điểm"
      intro="Giao sách cho người nhận bằng mã họ tự yêu cầu trên ứng dụng, và nhận lại sách khi đơn cần trả."
      order="Xếp theo hạn đến lấy, gần nhất trước."
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      extra={() => (
        <>
          {/* Quick KPI Stats Ribbon */}
          <div className={collectionStyles.kpiGrid}>
            <button
              type="button"
              className={collectionStyles.kpiCard}
              aria-pressed={activeTab === "all"}
              data-active={activeTab === "all"}
              onClick={() => { setActiveTab("all"); setPage(1); }}
            >
              <div className={collectionStyles.kpiIcon}><BookOpen size={16} aria-hidden="true" /></div>
              <div className={collectionStyles.kpiData}>
                <span className={collectionStyles.kpiNumber}>{stats.total}</span>
                <span className={collectionStyles.kpiTitle}>Đơn đã tải</span>
              </div>
            </button>

            <button
              type="button"
              className={collectionStyles.kpiCard}
              aria-pressed={activeTab === "carrier"}
              data-active={activeTab === "carrier"}
              onClick={() => { setActiveTab("carrier"); setPage(1); }}
            >
              <div className={collectionStyles.kpiIcon}><Truck size={16} aria-hidden="true" /></div>
              <div className={collectionStyles.kpiData}>
                <span className={collectionStyles.kpiNumber}>{stats.carrier}</span>
                <span className={collectionStyles.kpiTitle}>Giao hãng</span>
              </div>
            </button>

            <button
              type="button"
              className={collectionStyles.kpiCard}
              aria-pressed={activeTab === "self"}
              data-active={activeTab === "self"}
              onClick={() => { setActiveTab("self"); setPage(1); }}
            >
              <div className={collectionStyles.kpiIcon}><User size={16} aria-hidden="true" /></div>
              <div className={collectionStyles.kpiData}>
                <span className={collectionStyles.kpiNumber}>{stats.self}</span>
                <span className={collectionStyles.kpiTitle}>Tự lấy</span>
              </div>
            </button>

            <button
              type="button"
              className={collectionStyles.kpiCard}
              aria-pressed={activeTab === "return"}
              data-active={activeTab === "return"}
              onClick={() => { setActiveTab("return"); setPage(1); }}
            >
              <div className={collectionStyles.kpiIcon}><RotateCcw size={16} aria-hidden="true" /></div>
              <div className={collectionStyles.kpiData}>
                <span className={collectionStyles.kpiNumber}>{stats.returnPending}</span>
                <span className={collectionStyles.kpiTitle}>Hoàn trả</span>
              </div>
            </button>

            <button
              type="button"
              className={collectionStyles.kpiCard}
              aria-pressed={activeTab === "report"}
              data-active={activeTab === "report"}
              onClick={() => { setActiveTab("report"); setPage(1); }}
            >
              <div className={collectionStyles.kpiIcon}><CheckCircle2 size={16} aria-hidden="true" /></div>
              <div className={collectionStyles.kpiData}>
                <span className={collectionStyles.kpiNumber}>{stats.report}</span>
                <span className={collectionStyles.kpiTitle}>Chờ xem biên bản</span>
              </div>
            </button>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className={collectionStyles.controlBar}>
            <div className={collectionStyles.filterTabs} role="group" aria-label="Lọc đơn giao nhận theo trạng thái">
              <button
                type="button"
                aria-pressed={activeTab === "all"}
                className={collectionStyles.tabBtn}
                data-active={activeTab === "all"}
                onClick={() => { setActiveTab("all"); setPage(1); }}
              >
                Tất cả <span className={collectionStyles.tabCount}>{stats.total}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "carrier"}
                className={collectionStyles.tabBtn}
                data-active={activeTab === "carrier"}
                onClick={() => { setActiveTab("carrier"); setPage(1); }}
              >
                Giao hãng <span className={collectionStyles.tabCount}>{stats.carrier}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "self"}
                className={collectionStyles.tabBtn}
                data-active={activeTab === "self"}
                onClick={() => { setActiveTab("self"); setPage(1); }}
              >
                Tự lấy <span className={collectionStyles.tabCount}>{stats.self}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "return"}
                className={collectionStyles.tabBtn}
                data-active={activeTab === "return"}
                onClick={() => { setActiveTab("return"); setPage(1); }}
              >
                Hoàn trả <span className={collectionStyles.tabCount}>{stats.returnPending}</span>
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "report"}
                className={collectionStyles.tabBtn}
                data-active={activeTab === "report"}
                onClick={() => { setActiveTab("report"); setPage(1); }}
              >
                Chờ biên bản <span className={collectionStyles.tabCount}>{stats.report}</span>
              </button>
            </div>

            <div className={collectionStyles.searchBox} data-focus-surface>
              <Search size={16} className={collectionStyles.searchIcon} aria-hidden="true" />
              <input
                id="collection-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm người nhận, SĐT, tên sách, mã kệ..."
                aria-label="Tìm kiếm đơn giao nhận"
              />
              {search && (
                <button
                  type="button"
                  className={collectionStyles.clearSearchBtn}
                  onClick={() => { setSearch(""); setPage(1); }}
                  aria-label="Xóa tìm kiếm"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      footer={() => filteredItems.length > 0 && (
        <nav className={intakeStyles.pagination} aria-label="Phân trang đơn giao nhận">
          <p aria-live="polite">
            Hiển thị {shownFrom + 1}–{Math.min(shownFrom + pageSize, filteredItems.length)} trong {filteredItems.length} đơn đã lọc ({items.length} đã tải).
          </p>
          <div>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              Trước
            </button>
            <span>Trang {currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
              Sau
            </button>
          </div>
        </nav>
      )}
      presentation={{
        className: collectionStyles.queue,
        listHeader: (
          <div className={collectionStyles.listHeader} aria-hidden="true">
            <div className={collectionStyles.listHeaderTitle}>
              <Layers size={14} />
              <span>Hồ sơ giao nhận sách tại điểm</span>
            </div>
            <span className={collectionStyles.listHeaderAction}>Thao tác tại điểm</span>
          </div>
        ),
      }}
      rows={visibleItems.map((item, index) => ({
        id: item.id,
        status: collectionStatus(item),
        meta: [
          item.state === "ReturnPending"
            ? `Hạn trả: ${dateText(item.returnDeadline)}`
            : item.fulfillmentMethod === "CarrierOutbound"
              ? `Hạn giao cho hãng: ${dateText(item.collectionDeadline)}`
              : `Hạn đến lấy: ${dateText(item.collectionDeadline)}`,
          ...(item.shelfCode ? [`Kệ ${item.shelfCode}`] : []),
        ],
        title: item.title,
        summary: <CollectionRowSummary item={item} index={shownFrom + index} />,
        action: collectionAction(item),
      }))}
      empty={{
        title: search || activeTab !== "all" ? "Không tìm thấy đơn phù hợp." : "Chưa có đơn cần giao hoặc nhận lại.",
        body: search || activeTab !== "all"
          ? "Thử đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm (tên người nhận, SĐT, mã kệ)."
          : <AssignmentNote />,
      }}
    />
  );
}

export function ResolutionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <ResolutionQueueContent />;
}
function ResolutionQueueContent() {
  const panel = useQueuePanel();
  const [search, setSearch] = useState("");
  const refetchInterval = useLiveQueueInterval(panel, ["operations", "point-order-resolutions"]);
  const result = useQuery({
    queryKey: ["operations", "point-order-resolutions"],
    queryFn: () =>
      session.request("/operations/point-order-resolutions", resolutionQueue),
    refetchInterval,
  });
  const items = result.data?.items ?? [];
  const normalizedSearch = search.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("vi-VN");
  const filteredItems = !normalizedSearch
    ? items
    : items.filter((item) =>
      [item.id, item.title, item.pointName, item.note, resolutionLabels[item.openReason]]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("vi-VN")
        .includes(normalizedSearch),
      );
  return (
    <OperationsQueue
      number="03"
      title="Đơn chờ quyết định."
      intro="Quyết định độc lập cho đơn tại điểm khi người nhận từ chối biên bản, quá hạn hoặc khiếu nại sau khi nhận."
      order="Xếp theo lúc mở hồ sơ, cũ nhất trước."
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={filteredItems.map((item) => ({
        id: item.id,
        status: resolutionLabels[item.openReason],
        meta: [`Mở lúc ${dateText(item.openedAt)}`, item.pointName],
        title: item.title,
        detail: [`Người mua đã trả ${money(item.buyerTotal)}`, item.note]
          .filter(Boolean)
          .join(" · "),
        action: {
          label: "Quyết định",
          modal: true,
          render: (context) => <ResolutionDecision item={item} {...context} />,
        },
      }))}
      extra={() => (
        <form className="inline-search resolution-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <div className="field">
            <label htmlFor="resolution-search">Tìm đơn cần quyết định</label>
            <input
              id="resolution-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tên sách, mã đơn, điểm hoặc lý do"
            />
          </div>
          {search && (
            <button type="button" className="button" onClick={() => setSearch("")}>
              Xóa tìm kiếm
            </button>
          )}
        </form>
      )}
      empty={{
        title: search ? "Không tìm thấy đơn phù hợp." : "Chưa có đơn cần quyết định.",
        body: search
          ? "Thử tìm theo tên sách, mã đơn, điểm nhận hoặc lý do mở hồ sơ."
          : "Đơn tại điểm bạn được phân công hoặc đơn bạn có liên quan không hiện ở đây, để quyết định luôn độc lập.",
      }}
    />
  );
}

const AUCTION_TYPE_LABEL: Record<NonNullable<OperationsAuction["auctionType"]>, string> = {
  English: "Trả giá lên",
  Dutch: "Giá giảm dần",
  SealedFirst: "Giá kín",
  SealedSecond: "Giá kín · giá thứ hai",
};

// ADR 0081: before a registration auction is full, startAt is the 24 h
// registration deadline, not the open time; show the seller's time instead.
function scheduledStatus(item: OperationsAuction, serverTime?: string) {
  const need = item.minBidders;
  if (need == null || !item.opensAt)
    return `Hẹn mở ${dateText(item.startAt)} · kết thúc ${dateText(item.endAt)}`;
  if ((item.registeredCount ?? 0) >= need)
    return `Đủ người, mở ${dateText(item.startAt)} · kết thúc ${dateText(item.endAt)}`;
  const now = serverTime ? Date.parse(serverTime) : Date.now();
  // ADR 0091: Admin may open it now even below the minimum.
  return Date.parse(item.opensAt) > now
    ? `Chờ đủ người, mở ${dateText(item.opensAt)} · chưa đủ thì hủy ${dateText(item.startAt)} · Admin mở ngay được`
    : `Đã qua giờ mở, chờ đủ người tới ${dateText(item.startAt)} · Admin mở ngay được`;
}

export function AuctionQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <AuctionQueueContent />;
}
function AuctionQueueContent() {
  const panel = useQueuePanel();
  const refetchInterval = useLiveQueueInterval(panel, ["operations", "auctions"]);
  const result = useQuery({
    queryKey: ["operations", "auctions"],
    queryFn: () =>
      session.request("/operations/auctions", operationsAuctionList),
    refetchInterval,
  });
  return (
    <OperationsQueue
      number="04"
      title="Phiên đang mở hoặc tạm giữ."
      intro="Theo dõi các phiên còn có thể hủy. Phiên chờ mở đã đủ người đăng ký có thể mở ngay, kèm lý do. Chưa đủ người vẫn mở ngay được; khi đó yêu cầu tối thiểu bị bỏ, người đã đăng ký được hoàn tiền cọc. Chỉ hủy khi có sự cố hoặc gian lận, kèm lý do; hệ thống không tự chọn người thắng. Phiên tạm giữ được tiếp tục (cộng lại thời gian tạm dừng) hoặc hủy; mỗi phiên tạm dừng tối đa 72 giờ."
      order="Xếp theo giờ kết thúc, gần nhất trước."
      unit="phiên"
      result={result}
      panel={panel}
      serverTime={result.data?.serverTime}
      rows={(result.data?.items ?? []).map((item) => ({
        id: item.id,
        status:
          item.state === "OnHold"
            ? `${item.holdReason === "Review" ? "Tạm dừng vì báo cáo" : "Tạm giữ"}, chờ quyết định${item.holdExpiresAt ? ` · tự hủy ${dateText(item.holdExpiresAt)}` : ""}`
            : item.phase === "Scheduled"
              ? scheduledStatus(item, result.data?.serverTime)
              : `Kết thúc ${dateText(item.endAt)}`,
        meta: [
          item.pointName,
          ...(item.auctionType && item.auctionType !== "English"
            ? [AUCTION_TYPE_LABEL[item.auctionType]]
            : []),
          ...(item.minBidders != null
            ? [`${item.registeredCount ?? 0}/${item.minBidders} người đăng ký`]
            : []),
          `${item.bidderCount} người trả giá`,
        ],
        title: item.title,
        detail: `Giá hiện tại ${money(item.currentPrice ?? item.startPrice)} · bước ${money(item.step)}`,
        action:
          item.state === "OnHold"
            ? {
                label: "Xử lý phiên",
                render: (context) => <AuctionHoldDecision item={item} {...context} />,
              }
            : item.phase === "Scheduled"
              ? {
                  label: "Mở hoặc hủy phiên",
                  render: (context) => <AuctionScheduledDecision item={item} {...context} />,
                }
              : {
                  label: "Hủy phiên",
                  render: (context) => <AuctionCancel item={item} {...context} />,
                },
      }))}
      empty={{
        title: "Không có phiên nào cần theo dõi.",
        body: "Phiên bạn bán hoặc đã trả giá không hiện ở đây, để việc hủy luôn độc lập.",
      }}
    />
  );
}
