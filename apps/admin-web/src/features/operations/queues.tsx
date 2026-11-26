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
import type { CSSProperties } from "react";
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
import pointStyles from "./PointQueue.module.css";

// Queues for the point desks and Admin decisions. Each row's command opens
// under the row (N4-02 to N4-05).

type MetaEntry = {
  text: string;
  urgency?: "normal" | "soon" | "overdue" | "reason";
};

function deadlineUrgency(iso: string | null | undefined, nowMs: number | undefined): "normal" | "soon" | "overdue" {
  if (!iso || !nowMs) return "normal";
  const dueMs = Date.parse(iso);
  if (Number.isNaN(dueMs)) return "normal";
  const remaining = dueMs - nowMs;
  if (remaining <= 0) return "overdue";
  if (remaining <= 24 * 60 * 60 * 1000) return "soon";
  return "normal";
}

export function IntakeQueue() {
  const user = useOutletContext<CurrentUser>();
  if (!canOperateIntake(user)) return <Forbidden />;
  return <IntakeQueueContent userId={user.id} />;
}

function intakeMetaEntries(item: Intake, nowMs?: number): MetaEntry[] {
  if (item.state === "AwaitingDropoff") {
    return [
      {
        text: `Hạn mang tới: ${dateText(item.dropoffDeadline)}`,
        urgency: deadlineUrgency(item.dropoffDeadline, nowMs),
      },
    ];
  }
  const meta: MetaEntry[] = [{ text: `Nhận lúc ${dateText(item.receivedAt)}` }];
  if (item.inspectionDueAt) {
    meta.push({
      text: `Hạn kiểm tra: ${dateText(item.inspectionDueAt)}`,
      urgency: item.state === "Received" ? deadlineUrgency(item.inspectionDueAt, nowMs) : "normal",
    });
  }
  if (item.reclaimDueAt) {
    meta.push({
      text: `Hạn người bán nhận lại: ${dateText(item.reclaimDueAt)}`,
      urgency: item.state === "ReclaimRequired" ? deadlineUrgency(item.reclaimDueAt, nowMs) : "normal",
    });
  }
  if (item.state === "NeedsEvidence") {
    meta.push(
      item.evidenceSubmittedAt
        ? { text: "Người bán đã bổ sung bằng chứng", urgency: "soon" }
        : {
            text: `Hạn bổ sung: ${dateText(item.evidenceDeadline)}`,
            urgency: deadlineUrgency(item.evidenceDeadline, nowMs),
          },
    );
  }
  if (item.reclaimReason) {
    meta.push({ text: reclaimLabels[item.reclaimReason], urgency: "reason" });
  }
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
  meta: MetaEntry[];
  userId: string;
  index: number;
}) {
  const title = item.title || "Chưa có tên sách";
  const waitingForOtherReviewer =
    item.state === "NeedsEvidence" && item.evidenceRequestedBy === userId;
  const [showAllReports, setShowAllReports] = useState(false);
  const latestReport = item.reports.at(-1);
  const previousReports = item.reports.slice(0, -1).reverse();

  return (
    <div className={pointStyles.card}>
      {/* Physical Shelf Location Anchor */}
      <div
        className={pointStyles.shelfAnchor}
        data-empty={!item.shelfCode}
        aria-label={item.shelfCode ? `Vị trí kệ ${item.shelfCode}` : "Chưa xếp kệ"}
      >
        <span className={pointStyles.shelfAnchorLabel}>
          <MapPin size={11} aria-hidden="true" />
          Kệ
        </span>
        <span className={pointStyles.shelfAnchorCode}>
          {item.shelfCode || "Chưa xếp"}
        </span>
        <span className={pointStyles.shelfAnchorIndex}>
          #{String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Main Dossier Content */}
      <div className={pointStyles.dossier}>
        {/* Row 1: Title, ID, Status */}
        <div className={pointStyles.headerLine}>
          <h2 className={pointStyles.bookTitle}>{title}</h2>
          <span className={pointStyles.refCode}>#{item.id.slice(0, 8)}</span>
          <span className={pointStyles.statusBadge} data-tone={intakeTone[item.state]}>
            {item.state === "Auctioning" && <span className={pointStyles.pulseDot} aria-hidden="true" />}
            {item.state === "Sold" && <Check size={12} aria-hidden="true" />}
            {intakeLabels[item.state]}
          </span>
        </div>

        {waitingForOtherReviewer && (
          <div className={pointStyles.noticeLine}>
            <AlertCircle size={14} aria-hidden="true" />
            <span>Nhân viên hoặc quản trị viên khác sẽ xem bằng chứng bạn đã yêu cầu.</span>
          </div>
        )}

        {/* Row 2: Inline Auction Pricing (Always visible at a glance) */}
        <div className={pointStyles.factStrip}>
          <span className={pointStyles.factItem}>
            <span className={pointStyles.factLabel}>Khởi điểm</span>
            <span className={pointStyles.factValue}>{money(item.startPrice)}</span>
          </span>
          <span className={pointStyles.factItem}>
            <span className={pointStyles.factLabel}>Bước giá</span>
            <span className={pointStyles.factValue}>+{money(item.step)}</span>
          </span>
          {item.buyNowPrice !== null && (
            <span className={pointStyles.factItem}>
              <span className={pointStyles.factLabel}>Mua ngay</span>
              <span className={pointStyles.factValueAccent}>{money(item.buyNowPrice)}</span>
            </span>
          )}
        </div>

        {/* Row 3: Inline Inspection Result */}
        <div className={pointStyles.certLine}>
          {latestReport ? (
            <>
              <div className={pointStyles.certRow}>
                <span className={pointStyles.certStamp} data-outcome={latestReport.outcome}>
                  {latestReport.outcome === "Pass" ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : latestReport.outcome === "Fail" ? (
                    <AlertCircle size={14} aria-hidden="true" />
                  ) : (
                    <Clock size={14} aria-hidden="true" />
                  )}
                  <span>{outcomeLabels[latestReport.outcome]} kiểm định</span>
                </span>
                <span className={pointStyles.certMeta}>
                  Biên bản #{latestReport.revision} · {dateText(latestReport.createdAt)}
                </span>
                {previousReports.length > 0 && (
                  <button
                    type="button"
                    className={pointStyles.historyToggle}
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
                <p className={pointStyles.certNote}>“{latestReport.note}”</p>
              )}
              {showAllReports && previousReports.length > 0 && (
                <div className={pointStyles.historyList}>
                  {previousReports.map((r) => (
                    <div key={r.revision} className={pointStyles.historyItem}>
                      <span className={pointStyles.historyOutcome} data-outcome={r.outcome}>
                        #{r.revision} {outcomeLabels[r.outcome]}
                      </span>
                      <span className={pointStyles.historyTime}>{dateText(r.createdAt)}</span>
                      {r.note && <span>— {r.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span className={pointStyles.noCertText}>Chưa có biên bản kiểm tra tại điểm</span>
          )}
        </div>

        {/* Row 4: Deadlines & Logistics */}
        <div className={pointStyles.metaList}>
          {meta.map((entry) => (
            <span
              key={entry.text}
              className={pointStyles.metaItem}
              data-urgency={entry.urgency ?? "normal"}
            >
              {entry.urgency === "reason" || entry.urgency === "overdue" ? (
                <AlertCircle size={12} aria-hidden="true" />
              ) : (
                <Clock size={12} aria-hidden="true" />
              )}
              {entry.text}
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
      extra={() => {
        const intakeTabs: Array<{
          id: FilterTab;
          label: string;
          count: number;
          actionable?: boolean;
          icon: typeof BookOpen;
        }> = [
          { id: "all", label: "Tất cả", count: stats.total, icon: BookOpen },
          { id: "awaiting", label: "Chờ nhận", count: stats.awaiting, actionable: true, icon: Clock },
          { id: "inspecting", label: "Cần kiểm định", count: stats.inspecting, actionable: true, icon: CheckCircle2 },
          { id: "auction", label: "Đang đấu giá", count: stats.auction, icon: Gavel },
          { id: "reclaim", label: "Chờ trả sách", count: stats.reclaim, actionable: true, icon: RotateCcw },
          { id: "resolved", label: "Đã bán", count: stats.resolved, icon: Archive },
        ];
        const isFiltered = activeTab !== "all" || Boolean(search.trim());
        return (
          <>
            <div
              className={pointStyles.statStrip}
              style={{ "--stat-cols": 6 } as CSSProperties}
              role="group"
              aria-label="Lọc hồ sơ theo trạng thái"
            >
              {intakeTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={pointStyles.statTab}
                    aria-pressed={active}
                    data-active={active}
                    data-empty={tab.count === 0}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setPage(1);
                    }}
                  >
                    <span className={pointStyles.statTabTop}>
                      <span className={pointStyles.statLabel}>{tab.label}</span>
                      {tab.actionable && tab.count > 0 && (
                        <span className={pointStyles.statDot} aria-hidden="true" />
                      )}
                    </span>
                    <span className={pointStyles.statBottom}>
                      <span className={pointStyles.statCount}>{tab.count}</span>
                      <Icon size={15} className={pointStyles.statIcon} aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={pointStyles.searchBar}>
              <div className={pointStyles.searchBox} data-focus-surface>
                <Search size={16} className={pointStyles.searchIcon} aria-hidden="true" />
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
                    className={pointStyles.clearSearchBtn}
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className={pointStyles.searchMeta}>
                <span className={pointStyles.searchSummary}>
                  {filteredItems.length} / {items.length} hồ sơ
                </span>
                {isFiltered && (
                  <button
                    type="button"
                    className={pointStyles.resetFilterBtn}
                    onClick={() => {
                      setActiveTab("all");
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>
          </>
        );
      }}
      footer={() => filteredItems.length > 0 && (
        <nav className={pointStyles.pagination} aria-label="Phân trang sách gửi đấu giá">
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
        className: pointStyles.queue,
        listHeader: null,
      }}
      rows={visibleItems.map((item, index) => {
        const metaEntries = intakeMetaEntries(item, result.dataUpdatedAt || undefined);
        return {
          id: item.id,
          status: intakeLabels[item.state],
          meta: [...metaEntries.map((m) => m.text), item.shelfCode ?? ""],
          title: item.title,
          summary: (
            <IntakeRowSummary
              item={item}
              meta={metaEntries}
              userId={userId}
              index={shownFrom + index}
            />
          ),
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
  nowMs,
}: {
  item: CollectionItem;
  index: number;
  nowMs?: number;
}) {
  const title = item.title || "Chưa có tên sách";
  const activeDeadline =
    item.state === "ReturnPending" ? item.returnDeadline : item.collectionDeadline;
  const deadlineText =
    item.state === "ReturnPending"
      ? `Hạn mang trả: ${dateText(item.returnDeadline)}`
      : item.fulfillmentMethod === "CarrierOutbound"
        ? `Hạn giao cho hãng: ${dateText(item.collectionDeadline)}`
        : `Hạn đến lấy: ${dateText(item.collectionDeadline)}`;
  const urgency =
    item.state === "ReadyForCollection" || item.state === "ReturnPending"
      ? deadlineUrgency(activeDeadline, nowMs)
      : "normal";

  return (
    <div className={pointStyles.card}>
      {/* Physical Shelf Location Anchor */}
      <div
        className={pointStyles.shelfAnchor}
        data-empty={!item.shelfCode}
        aria-label={item.shelfCode ? `Vị trí kệ ${item.shelfCode}` : "Chưa xếp kệ"}
      >
        <span className={pointStyles.shelfAnchorLabel}>
          <MapPin size={11} aria-hidden="true" />
          Kệ
        </span>
        <span className={pointStyles.shelfAnchorCode}>
          {item.shelfCode || "Chưa xếp"}
        </span>
        <span className={pointStyles.shelfAnchorIndex}>
          #{String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Main Dossier Content */}
      <div className={pointStyles.dossier}>
        {/* Row 1: Title, ID, Method, Status */}
        <div className={pointStyles.headerLine}>
          <h2 className={pointStyles.bookTitle}>{title}</h2>
          <span className={pointStyles.refCode}>#{item.id.slice(0, 8)}</span>
          {item.fulfillmentMethod === "CarrierOutbound" ? (
            <span className={pointStyles.methodBadge} data-method="carrier">
              <Truck size={12} aria-hidden="true" />
              Giao tận nơi
            </span>
          ) : (
            <span className={pointStyles.methodBadge} data-method="self">
              <User size={12} aria-hidden="true" />
              Nhận tại điểm
            </span>
          )}
          <span className={pointStyles.statusBadge} data-tone={collectionTone[item.state] ?? "neutral"}>
            {collectionStatus(item)}
          </span>
        </div>

        {/* Row 2: Inline Recipient & Fulfillment Details (Flat, no nested card) */}
        {item.delivery ? (
          <>
            <div className={pointStyles.factStrip}>
              <span className={pointStyles.factItem}>
                <User size={13} className={pointStyles.factIcon} aria-hidden="true" />
                <span className={pointStyles.factLabel}>Người nhận</span>
                <span className={pointStyles.factValue}>{item.delivery.recipientName}</span>
              </span>
              <span className={pointStyles.factItem}>
                <Phone size={13} className={pointStyles.factIcon} aria-hidden="true" />
                <span className={pointStyles.factValue}>{item.delivery.phone}</span>
              </span>
              {item.delivery.outboundFee > 0 && (
                <span className={pointStyles.factItem}>
                  <span className={pointStyles.factLabel}>Phí giao</span>
                  <span className={pointStyles.factValue}>{money(item.delivery.outboundFee)}</span>
                </span>
              )}
              {item.delivery.trackingCode && (
                <span className={pointStyles.factItem}>
                  <Truck size={13} className={pointStyles.factIcon} aria-hidden="true" />
                  <span className={pointStyles.factLabel}>Vận đơn</span>
                  <span className={pointStyles.factValueMono}>{item.delivery.trackingCode}</span>
                </span>
              )}
            </div>
            <div className={pointStyles.addressLine}>
              <MapPin size={13} aria-hidden="true" />
              <span>{item.delivery.detail}</span>
            </div>
          </>
        ) : (
          <div className={pointStyles.factStrip}>
            <span className={pointStyles.factItem}>
              <User size={13} className={pointStyles.factIcon} aria-hidden="true" />
              <span className={pointStyles.factLabel}>Người đến nhận</span>
              <span className={pointStyles.factValue}>{item.recipientName}</span>
            </span>
            <span className={pointStyles.factItem}>
              <ShieldCheck size={13} className={pointStyles.factIcon} aria-hidden="true" />
              <span className={pointStyles.factLabel}>Xác thực</span>
              <span className={pointStyles.factValue}>Mã 6 số trên ứng dụng</span>
            </span>
          </div>
        )}

        {/* Row 3: Deadline Meta */}
        <div className={pointStyles.metaList}>
          <span className={pointStyles.metaItem} data-urgency={urgency}>
            {urgency === "overdue" ? (
              <AlertCircle size={12} aria-hidden="true" />
            ) : (
              <Clock size={12} aria-hidden="true" />
            )}
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
      extra={() => {
        const collectionTabs: Array<{
          id: CollectionFilterTab;
          label: string;
          count: number;
          actionable?: boolean;
          icon: typeof BookOpen;
        }> = [
          { id: "all", label: "Tất cả", count: stats.total, icon: BookOpen },
          { id: "carrier", label: "Giao hãng", count: stats.carrier, actionable: true, icon: Truck },
          { id: "self", label: "Tự lấy", count: stats.self, actionable: true, icon: User },
          { id: "return", label: "Hoàn trả", count: stats.returnPending, actionable: true, icon: RotateCcw },
          { id: "report", label: "Chờ biên bản", count: stats.report, icon: CheckCircle2 },
        ];
        const isFiltered = activeTab !== "all" || Boolean(search.trim());
        return (
          <>
            <div
              className={pointStyles.statStrip}
              style={{ "--stat-cols": 5 } as CSSProperties}
              role="group"
              aria-label="Lọc đơn giao nhận theo trạng thái"
            >
              {collectionTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={pointStyles.statTab}
                    aria-pressed={active}
                    data-active={active}
                    data-empty={tab.count === 0}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setPage(1);
                    }}
                  >
                    <span className={pointStyles.statTabTop}>
                      <span className={pointStyles.statLabel}>{tab.label}</span>
                      {tab.actionable && tab.count > 0 && (
                        <span className={pointStyles.statDot} aria-hidden="true" />
                      )}
                    </span>
                    <span className={pointStyles.statBottom}>
                      <span className={pointStyles.statCount}>{tab.count}</span>
                      <Icon size={15} className={pointStyles.statIcon} aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={pointStyles.searchBar}>
              <div className={pointStyles.searchBox} data-focus-surface>
                <Search size={16} className={pointStyles.searchIcon} aria-hidden="true" />
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
                    className={pointStyles.clearSearchBtn}
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className={pointStyles.searchMeta}>
                <span className={pointStyles.searchSummary}>
                  {filteredItems.length} / {items.length} đơn
                </span>
                {isFiltered && (
                  <button
                    type="button"
                    className={pointStyles.resetFilterBtn}
                    onClick={() => {
                      setActiveTab("all");
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>
          </>
        );
      }}
      footer={() => filteredItems.length > 0 && (
        <nav className={pointStyles.pagination} aria-label="Phân trang đơn giao nhận">
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
        className: pointStyles.queue,
        listHeader: null,
      }}
      rows={visibleItems.map((item, index) => {
        const nowMs = result.data?.serverTime
          ? Date.parse(result.data.serverTime)
          : result.dataUpdatedAt || undefined;
        return {
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
          summary: (
            <CollectionRowSummary
              item={item}
              index={shownFrom + index}
              nowMs={nowMs}
            />
          ),
          action: collectionAction(item),
        };
      })}
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
