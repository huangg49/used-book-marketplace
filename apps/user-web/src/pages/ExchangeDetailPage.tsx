import type { ReactNode } from "react";
import {
  TransactionFrame,
  TransactionDisclosure,
} from "../components/conversation/TransactionFrame";
import { ExchangeContext } from "../components/conversation/ExchangeContext";
import { ExchangeFinanceSummary } from "../components/conversation/ExchangeFinanceSummary";
import { exchangeStage } from "../lib/transaction-stage";
import { ExchangeEvidencePanel } from "../components/exchange/ExchangeEvidencePanel";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight } from "lucide-react";
import { ApiError, confirmExchangeRead } from "@used-books/session-client";
import { session } from "../services/api";
import { useExchangeRecovery } from "../hooks/useExchangeRecovery";
import { ExchangeRecoveryPanel } from "../components/exchange/ExchangeRecoveryPanel";
import { SupportLink } from "../features/support/SupportLink";
import conversation from "../components/conversation/Conversation.module.css";
import { useParams, Link, Navigate, useLocation } from "react-router-dom";
import { useConversationTransition } from "../components/conversation/conversation-navigation";
import { ConversationBackLink } from "../components/conversation/ConversationBackLink";
import { getPurchaseConversations } from "../services/purchase-conversations";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROUTES, formatVnd } from "../lib/routes";
import { useSession } from "../hooks/useSession";
import { exchangeAcknowledged, pendingExchange } from "../services/exchange";
import {
  getExchangeDetail,
  getMessagePage,
  sendMessage,
  cancelExchange,
  acceptExchange,
  fundExchange,
  rejectExchange,
  confirmSent,
  confirmReceived,
  completeExchange,
  counterExchange,
  reportIssue,
} from "../services/exchangeDetail";
import type { CounterOfferData } from "../components/exchange/CounterDialog";
import { type ShipmentData } from "../services/exchangeShipment";
import { ProgressStepper } from "../components/exchange/ProgressStepper";
import { SettlementCard } from "../components/exchange/SettlementCard";
import { ReviewCard } from "../components/exchange/ReviewCard";
import { ShippingTrackingCard } from "../components/exchange/ShippingTrackingCard";
import { BookInfoCard } from "../components/exchange/BookInfoCard";
import { BookCover } from "../components/BookCover";
import { ActionCard } from "../components/exchange/ActionCard";
import { ChatPanel } from "../components/exchange/ChatPanel";
import { ExchangeChatDrawer } from "../components/exchange/ExchangeChatDrawer";
import { exchangeChatGuidance } from "../lib/exchange-chat-guidance";
import { SafetyTipsCard } from "../components/exchange/SafetyTipsCard";
import styles from "./ExchangeDetailPage.module.css";

export function ExchangeDetailPage(
  props: {
    exchangeId?: string;
    embedded?: boolean;
    workspaceNavigation?: ReactNode;
    workspaceNotice?: ReactNode;
  } = {},
) {
  const identity = useExchangeRecovery();
  const { id } = useParams<{ id: string }>();
  return (
    <ExchangeDetailContent
      key={identity + ":" + (props.exchangeId ?? id)}
      {...props}
    />
  );
}
function ExchangeDetailContent({
  exchangeId,
  embedded = false,
  workspaceNavigation,
  workspaceNotice,
}: {
  exchangeId?: string;
  embedded?: boolean;
  workspaceNavigation?: ReactNode;
  workspaceNotice?: ReactNode;
}) {
  useExchangeRecovery();
  const chatTransition = useConversationTransition("/chat");
  const location = useLocation();
  const transitioning = !embedded && chatTransition;
  const { id: routeId } = useParams<{ id: string }>();
  const id = exchangeId ?? routeId;
  const queryClient = useQueryClient();
  const auth = useSession();
  const [panel, setPanel] = useState<"sheet" | "chat">("sheet");
  const conversations = useQuery({
    queryKey: [
      "purchase-conversations",
      auth.status === "authenticated" ? auth.user.id : undefined,
    ],
    queryFn: getPurchaseConversations,
    enabled: !embedded && auth.status === "authenticated",
    retry: false,
  });

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    dataUpdatedAt: detailUpdatedAt,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: [
      "exchangeDetail",
      auth.status === "authenticated" ? auth.user.id : undefined,
      id,
    ],
    queryFn: () => getExchangeDetail(id!),
    enabled: !!id && auth.status === "authenticated",
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (
      id &&
      detail?.revision &&
      auth.status === "authenticated" &&
      detail.viewer.id === auth.user.id
    )
      confirmExchangeRead(session, id, detail.revision);
  }, [id, detail, auth, detailUpdatedAt]);

  const messagesQuery = useInfiniteQuery({
    queryKey: [
      "exchangeMessages",
      auth.status === "authenticated" ? auth.user.id : undefined,
      id,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getMessagePage(id!, pageParam),
    getNextPageParam: (page) => page.olderCursor ?? undefined,
    enabled: !embedded && !!id && auth.status === "authenticated",
    // Each refresh walks the loaded pages. Bound the average request rate.
    refetchInterval: (query) => 3000 * Math.max(1, query.state.data?.pages.length ?? 0),
    refetchIntervalInBackground: false,
  });
  const messagesDenied =
    messagesQuery.error instanceof ApiError &&
    [401, 403, 404].includes(messagesQuery.error.status);

  // Mutations
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["exchangeDetail"] });
    queryClient.invalidateQueries({ queryKey: ["exchangeTransactions"] });
    queryClient.invalidateQueries({ queryKey: ["exchangeCounts"] });
    // Wallet views refresh at the service ACK, including recovery retries.
    queryClient.invalidateQueries({
      queryKey: [
        "exchangeMessages",
        auth.status === "authenticated" ? auth.user.id : undefined,
        id,
      ],
    });
  };

  const handleSendMessage = async (text: string) => {
    await sendMessage(id!, text);
    invalidate();
  };

  const handleCancel = async () => {
    await cancelExchange(id!, detail!.revision!);
    invalidate();
  };

  const handleAccept = async (
    deliveryAddressId?: string,
    revisionOverride?: number,
  ) => {
    await acceptExchange(
      id!,
      revisionOverride ?? detail!.revision!,
      deliveryAddressId,
    );
    invalidate();
  };

  const handleReject = async (reason?: string) => {
    await rejectExchange(id!, detail!.revision!, reason ?? "Không phù hợp");
    invalidate();
  };

  const handleCounter = async (data: CounterOfferData, revision: number) => {
    try {
      await counterExchange(id!, revision, data);
    } finally {
      invalidate();
    }
  };

  const handleDispute = async (reason: string) => {
    const latest = await getExchangeDetail(id!).catch(() => detail);
    const rev = latest?.revision ?? detail!.revision!;
    await reportIssue(id!, rev, reason);
    invalidate();
  };

  const handleConfirmSent = async (shipmentData?: ShipmentData) => {
    const latest = await getExchangeDetail(id!).catch(() => detail);
    const rev = latest?.revision ?? detail!.revision!;
    await confirmSent(id!, rev, shipmentData);
    invalidate();
  };

  const handleConfirmReceived = async () => {
    const latest = await getExchangeDetail(id!).catch(() => detail);
    const rev = latest?.revision ?? detail!.revision!;
    await confirmReceived(id!, rev);
    invalidate();
  };

  const handleComplete = async () => {
    const latest = await getExchangeDetail(id!).catch(() => detail);
    const rev = latest?.revision ?? detail!.revision!;
    await completeExchange(id!, rev);
    invalidate();
  };

  const linked = conversations.data?.find((room) =>
    room.terms?.exchangeIds.includes(id ?? ""),
  );
  if (!embedded && linked)
    return <Navigate replace to={`/chat/${linked.id}`} />;
  if (auth.status !== "authenticated") {
    return (
      <div className={styles.authContainer}>
        <h2>
          {auth.status === "loading"
            ? "Đang kiểm tra đăng nhập…"
            : "Đăng nhập để xem trao đổi"}
        </h2>
        {auth.status !== "loading" && (
          <Link
            className={styles.loginBtn}
            to={`/login?returnUrl=${encodeURIComponent(`/exchange/${id ?? ""}`)}`}
          >
            Đăng nhập
          </Link>
        )}
      </div>
    );
  }
  if (id && !detail && (pendingExchange(id) || exchangeAcknowledged(id))) {
    return (
      <div className={styles.errorContainer}>
        <ExchangeRecoveryPanel
          id={id}
          onRead={async () => {
            await refetchDetail();
          }}
        />
        <Link to={ROUTES.exchangeMine}>Trao đổi của tôi</Link>
      </div>
    );
  }
  if (isDetailLoading) {
    return (
      <div
        className={styles.loadingContainer}
        data-chat-morph-room={transitioning || undefined}
      >
        Đang tải...
      </div>
    );
  }

  if (isDetailError) {
    return (
      <div
        id={"exchange-recovery-" + id}
        className={styles.errorContainer}
        data-chat-morph-room={transitioning || undefined}
      >
        <h2>Chưa tải được trạng thái hiện tại</h2>
        {id && (
          <ExchangeRecoveryPanel
            id={id}
            onRead={async () => {
              await refetchDetail();
            }}
          />
        )}
        <button className={styles.retryBtn} onClick={() => refetchDetail()}>
          Thử lại
        </button>
        {embedded && id && auth.status === "authenticated" && (
          <div className={styles.recoveryFinance}>
            <ExchangeFinanceSummary
              id={id}
              userId={auth.user.id}
              sheetId={"exchange-recovery-" + id}
            />
          </div>
        )}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.notFoundContainer}>
        <h2>Không tìm thấy giao dịch</h2>
        <p style={{ marginBottom: 16 }}>
          Giao dịch bạn tìm kiếm không tồn tại hoặc bạn không có quyền truy cập.
        </p>
        <Link to={ROUTES.exchangeMine} className={styles.backBtn}>
          Quay lại Trao đổi của tôi
        </Link>
      </div>
    );
  }

  let statusText = String(detail.status);
  if (detail.status === "PENDING") statusText = "Chờ phản hồi";
  else if (detail.status === "FUNDING") statusText = "Chờ đặt cọc";
  else if (detail.status === "WAITING_YOU_SEND")
    statusText = "Chuẩn bị gửi sách";
  else if (detail.status === "RESOLUTION_PENDING")
    statusText = "Đang cần xử lý";
  else if (detail.status === "DELIVERING") {
    statusText = detail.viewerShipping.receivedAt
      ? "Đang chờ đối tác nhận sách"
      : "Đang giao nhận";
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    statusText = detail.viewerShipping.receivedAt
      ? "Đang chờ đối tác nhận sách"
      : "Chờ xác nhận nhận sách";
  } else if (detail.status === "INSPECTING") statusText = "Đang kiểm tra sách";
  else if (detail.status === "COMPLETED") statusText = "Hoàn tất";
  else if (detail.status === "REJECTED") {
    statusText =
      detail.closedBy === "viewer"
        ? "Bạn đã từ chối đề nghị này"
        : `@${detail.partner.username} đã từ chối đề nghị của bạn`;
  } else if (detail.status === "CANCELLED") {
    if (
      detail.closedBy === "both" ||
      detail.cancelReason === "MutualAgreement"
    ) {
      statusText = "Hai bên đồng thuận hủy";
    } else {
      statusText =
        detail.closedBy === "viewer"
          ? "Bạn đã hủy đề nghị"
          : detail.closedBy === "partner"
            ? "Đối tác đã hủy đề nghị"
            : "Đề nghị đã hủy";
    }
  } else if (detail.status === "EXPIRED") statusText = "Hết hạn";

  const proposal = detail.status === "PENDING";
  const funding = detail.status === "FUNDING";
  const preparing = detail.status === "WAITING_YOU_SEND";
  const standaloneSheet = !embedded && (proposal || funding || preparing);
  const actionSection = (
    <section
      id="exchange-actions"
      className={styles.actionSection}
      aria-label="Hành động của bạn"
      tabIndex={-1}
    >
      <ActionCard
        compact={embedded || standaloneSheet}
        standaloneSheet={standaloneSheet}
        detail={detail}
        onCancel={handleCancel}
        onAccept={handleAccept}
        onCounter={handleCounter}
        onFund={async () => {
          await fundExchange(id!);
          invalidate();
        }}
        onRetry={async () => {
          await refetchDetail();
        }}
        onReject={handleReject}
        onConfirmSent={handleConfirmSent}
        onConfirmReceived={handleConfirmReceived}
        onComplete={handleComplete}
        onDispute={handleDispute}
      />
      {detail.rawStatus === "ResolutionPending" && (
        <ExchangeEvidencePanel
          key={detail.viewer.id + ":" + detail.id}
          id={detail.id}
          revision={detail.revision!}
          userId={detail.viewer.id}
        />
      )}
    </section>
  );
  const messagePages = messagesDenied ? undefined : messagesQuery.data?.pages;
  const messages = messagePages?.slice().reverse().flatMap(page => page.items) ?? [];
  const renderChat = (inDrawer = false, visible = true) => (
    <ChatPanel
      key={id}
      inDrawer={inDrawer}
      visible={visible}
      messages={messages}
      isLoading={messagesQuery.isPending}
      loadError={messagesDenied || (messagesQuery.isError && !messagesQuery.isFetchNextPageError)}
      isRefreshing={messagesQuery.isFetching}
      hasOlder={!messagesDenied && messagesQuery.hasNextPage}
      isLoadingOlder={messagesQuery.isFetchingNextPage}
      olderError={!messagesDenied && messagesQuery.isFetchNextPageError}
      onLoadOlder={() => messagesQuery.fetchNextPage({ cancelRefetch: false })}
      onRetry={() => void messagesQuery.refetch()}
      giveBooks={detail.giveBooks.map((book) => book.title)}
      receiveBooks={detail.receiveBooks.map((book) => book.title)}
      statusText={statusText}
      guidance={exchangeChatGuidance(detail)}
      partner={detail.partner}
      onSendMessage={handleSendMessage}
      isReadOnly={[
        "COMPLETED",
        "CANCELLED",
        "REJECTED",
        "EXPIRED",
      ].includes(detail.status)}
      unavailable={messagesDenied}
    />
  );
  if (embedded)
    return (
      <div
        className={styles.workspacePage}
        data-transaction-page
        role="region"
        aria-label="Chi tiết trao đổi"
      >
        <TransactionFrame context={<ExchangeContext detail={detail} />}>
          {workspaceNotice}
          <header data-stage-heading>
            <h3>{exchangeStage(detail)}</h3>
            <p>
              Trao đổi #{detail.transactionCode} · Bạn trao đổi với{" "}
              {detail.partner.username}
            </p>
          </header>
          <div className={styles.workspaceProgress}>
            <ProgressStepper
              compact
              summary={false}
              status={detail.status}
              failedAtStep={detail.failedAtStep}
              closedBy={detail.closedBy}
              partnerUsername={detail.partner.username}
              hasReceived={Boolean(detail.viewerShipping.receivedAt)}
              cancelReason={detail.cancelReason}
            />
          </div>
          {actionSection}
          <ReviewCard detail={detail} />
          {detail.status === "COMPLETED" && <SettlementCard detail={detail} />}
          {(!["PENDING", "FUNDING", "REJECTED", "EXPIRED"].includes(
            detail.status,
          ) &&
            !(
              detail.status === "CANCELLED" &&
              detail.cancelReason !== "DisputeResolvedRefund"
            )) && (
            <TransactionDisclosure
              title="Theo dõi giao nhận hai chiều"
              open={[
                "WAITING_YOU_SEND",
                "DELIVERING",
                "WAITING_YOU_CONFIRM",
              ].includes(detail.status)}
            >
              <ShippingTrackingCard detail={detail} onRefresh={invalidate} />
            </TransactionDisclosure>
          )}
          {workspaceNavigation}
          <TransactionDisclosure title="Hướng dẫn giao nhận và bảo quản">
            <SafetyTipsCard />
          </TransactionDisclosure>
        </TransactionFrame>
      </div>
    );

  if (standaloneSheet) {
    const waitingForViewer = detail.canViewerAccept ?? detail.viewerRole === "recipient";
    const updatedProposal = proposal && (detail.revision ?? 0) > 1 && !!detail.lastProposedById;
    const multipleBooks = detail.giveBooks.length > 1 || detail.receiveBooks.length > 1;
    const title = funding
      ? detail.viewerFundedAt ? "Bạn đã đặt cọc" : "Đặt cọc đổi sách"
      : preparing ? "Chuẩn bị gửi sách"
      : updatedProposal ? waitingForViewer ? "Đề nghị đã cập nhật" : "Đã gửi đề nghị mới"
      : waitingForViewer ? "Đề nghị đổi sách" : "Đã gửi đề nghị";
    return (
      <div className={styles.proposal} data-funding-sheet={funding || undefined} data-proposal-sheet={proposal || undefined}>
        <div className={styles.proposalNavigation}>
          <Link className={styles.proposalBack} to={ROUTES.exchangeMine}>
            {(proposal || funding) && <ArrowLeft size={17} aria-hidden="true" />}
            Trao đổi của tôi
          </Link>
          {(proposal || funding) && <span className={styles.proposalCode}>Phiếu #{detail.transactionCode}</span>}
        </div>
        <header className={styles.proposalHeader}>
          <h1>{title}</h1>
          {proposal ? (
            <div className={styles.proposalIdentity}>
              <span className={styles.proposalInitial} aria-hidden="true">{Array.from(detail.partner.username.trim())[0]?.toLocaleUpperCase("vi") || "?"}</span>
              <div>
                <span>Đổi sách với</span>
                <strong dir="auto" title={detail.partner.username}>{detail.partner.username}</strong>
              </div>
            </div>
          ) : (
            <p className={styles.proposalPartner}>
              <span>Đổi sách với</span>
              <strong dir="auto" title={detail.partner.username}>{detail.partner.username}</strong>
            </p>
          )}
        </header>
        <div className={funding ? styles.fundingWorkspace : proposal ? styles.proposalWorkspace : undefined}>
          <div className={funding ? styles.fundingControls : proposal ? styles.proposalControls : undefined}>
            <div className={funding ? styles.fundingPanel : proposal ? styles.proposalActions : undefined}>{actionSection}</div>
            <div className={styles.proposalContact}>
              <ExchangeChatDrawer viewerId={detail.viewer.id} exchangeId={detail.id}
                partnerName={detail.partner.username} latest={messagePages?.[0]?.items ?? []}>
                {open => renderChat(true, open)}
              </ExchangeChatDrawer>
              <SupportLink type="Exchange" id={detail.id} label={funding ? "Cần hỗ trợ" : undefined} />
            </div>
          </div>
          <div className={styles.proposalLayout} data-books-only={funding || undefined}>
            <section aria-labelledby="proposal-facts"
              className={funding || proposal || multipleBooks ? styles.fundingBooks : undefined}
              data-multiple-books={multipleBooks || undefined}>
              <h2 id="proposal-facts">{proposal && !updatedProposal ? "Phiếu đề nghị đổi sách" : "Sách trong phiếu"}</h2>
              {[
                { title: "Sách bạn gửi", books: detail.giveBooks, Icon: ArrowUpRight },
                { title: "Sách bạn nhận", books: detail.receiveBooks, Icon: ArrowDownLeft },
              ].map(({ title: label, books, Icon }) => {
                const total = books.reduce((sum, book) => sum + (book.price ?? 0), 0);
                return (
                  <div className={styles.proposalBooks} key={label} data-receive={Icon === ArrowDownLeft || undefined}>
                    <h3>
                      {(proposal || funding || multipleBooks) && <Icon size={18} aria-hidden="true" />}
                      {label}
                      {multipleBooks && books.length > 0 && <span className={styles.bookGroupCount}>{books.length} cuốn</span>}
                    </h3>
                    {multipleBooks && books.length > 0 && books.every(book => book.price != null) && (
                      <p className={styles.bookGroupTotal}><span>Tổng giá trị đổi</span> <strong>{formatVnd(total)}</strong></p>
                    )}
                    {books.map((book, index) => (
                      <div className={styles.proposalBook} key={book.id}>
                        <div aria-hidden="true"><BookCover title={book.title} coverUrl={book.coverUrl} index={index} /></div>
                        <div>
                          <strong className={styles.proposalBookTitle} title={multipleBooks ? book.title : undefined}>{book.title}</strong>
                          {book.author && <span className={styles.proposalBookAuthor}>{book.author}</span>}
                          {book.price != null && <span className={styles.proposalBookPrice}>{formatVnd(book.price)}</span>}
                          {book.conditionDetails && <details>
                            <summary>Tình trạng sách</summary><p>{book.conditionDetails}</p>
                          </details>}
                        </div>
                      </div>
                    ))}
                    {books.length === 0 && <p>Chưa tải được thông tin sách.</p>}
                  </div>
                );
              })}
              {!detail.hasAgreementSnapshot && <p>Phiếu cũ thiếu thông tin sách lúc gửi đề nghị.</p>}
            </section>
            {proposal && <section className={styles.proposalAmounts} aria-labelledby="proposal-amounts">
              <h2 id="proposal-amounts">Nếu hai bên đồng ý</h2>
              <dl>
                {detail.viewerDeposit != null && <div><dt>Cọc của bạn</dt><dd>{formatVnd(detail.viewerDeposit)}</dd></div>}
                {detail.partnerDeposit != null && <div><dt>Cọc của đối tác</dt><dd>{formatVnd(detail.partnerDeposit)}</dd></div>}
                {detail.moneyAmount != null && detail.moneyCompensationType !== "none" && (
                  <div><dt>{detail.moneyCompensationType === "user_pays" ? "Tiền bù bạn trả" : "Tiền bù bạn nhận"}</dt><dd>{formatVnd(detail.moneyAmount)}</dd></div>
                )}
                {detail.viewerFundingAmount != null && <div><dt>Bạn cần nộp</dt><dd><strong>{formatVnd(detail.viewerFundingAmount)}</strong></dd></div>}
              </dl>
              <p className={styles.proposalAmountNote}>Chưa giữ sách hay trừ tiền.</p>
            </section>}
            {preparing && <TransactionDisclosure title="Theo dõi giao nhận">
              <ShippingTrackingCard detail={detail} onRefresh={invalidate} />
            </TransactionDisclosure>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={embedded ? styles.embedded : styles.container}
      data-chat-morph-room={transitioning || undefined}
    >
      {!embedded && location.state?.chatFromInbox && <ConversationBackLink />}
      {!embedded && (
        <div className={styles.pageHeader}>
          <div>
            <span className={styles.transactionCode}>
              Mã Giao Dịch: #{detail.transactionCode}
            </span>
            <h1 className={styles.pageTitle}>Cuộc trao đổi sách</h1>
            <p>
              <SupportLink type="Exchange" id={id!} />
            </p>
          </div>
          <div className={styles.headerStatus}>
            Trạng thái: <span className={styles.statusValue}>{statusText}</span>
          </div>
        </div>
      )}

      <div className={styles.stepperCard}>
        <ProgressStepper
          compact={embedded}
          status={detail.status}
          failedAtStep={detail.failedAtStep}
          closedBy={detail.closedBy}
          partnerUsername={detail.partner.username}
          hasReceived={Boolean(detail.viewerShipping.receivedAt)}
          cancelReason={detail.cancelReason}
        />
      </div>

      {detail.status === "COMPLETED" && <SettlementCard detail={detail} />}

      {!embedded && (
        <nav className={styles.sectionLinks} aria-label="Đi tới phần trao đổi">
          <a href="#exchange-actions">Xem bước tiếp theo</a>
          <a href="#exchange-chat" onClick={() => setPanel("chat")}>
            Nhắn với đối tác
          </a>
        </nav>
      )}
      {!embedded && (
        <nav
          className={conversation.mobileTabs}
          aria-label="Nội dung cuộc trao đổi"
        >
          <button
            type="button"
            aria-pressed={panel === "sheet"}
            onClick={() => setPanel("sheet")}
          >
            Phiếu thỏa thuận
          </button>
          <button
            type="button"
            aria-pressed={panel === "chat"}
            onClick={() => setPanel("chat")}
          >
            Hội thoại
          </button>
        </nav>
      )}
      <div
        className={
          embedded
            ? styles.embeddedGrid
            : `${styles.gridContainer} ${conversation.workspace}`
        }
        data-panel={panel}
      >
        <div
          className={
            embedded
              ? styles.mainCol
              : `${styles.mainCol} ${styles.legacySheet} ${conversation.sheet}`
          }
        >
          {!embedded && (
            <div className={conversation.sheetHeading}>
              <h2>Phiếu thỏa thuận</h2>
              <span>Đổi sách · {statusText}</span>
            </div>
          )}
          <BookInfoCard detail={detail} compact={embedded} />
          <ShippingTrackingCard detail={detail} onRefresh={invalidate} />
          {actionSection}
          <ReviewCard detail={detail} />
          <details className={styles.safetyDetails}>
            <summary>Mẹo bảo quản và giao nhận an toàn</summary>
            <SafetyTipsCard />
          </details>
        </div>

        {!embedded && (
          <div
            className={`${styles.sideCol} ${conversation.chat} ${styles.legacyChat}`}
          >
            {renderChat()}
          </div>
        )}
      </div>
    </div>
  );
}
