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

  const handleCounter = async (data: CounterOfferData) => {
    await counterExchange(id!, detail!.revision!, data);
    invalidate();
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

  const actionSection = (
    <section
      id="exchange-actions"
      className={styles.actionSection}
      aria-label="Hành động của bạn"
      tabIndex={-1}
    >
      <ActionCard
        compact={embedded || detail.status === "PENDING"}
        proposalLayout={!embedded && detail.status === "PENDING"}
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
  const chat = !embedded && (
    <ChatPanel
      key={id}
      messages={messagesDenied ? [] : messagesQuery.data?.pages.slice().reverse().flatMap((page) => page.items) ?? []}
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

  if (detail.status === "PENDING" && !embedded) {
    const waitingForViewer = detail.canViewerAccept ?? detail.viewerRole === "recipient";
    return (
      <div className={styles.proposal}>
        <Link className={styles.proposalBack} to={ROUTES.exchangeMine}>Trao đổi của tôi</Link>
        <header className={styles.proposalHeader}>
          <h1>{waitingForViewer ? `Đề nghị đổi sách từ ${detail.partner.username}` : "Đã gửi đề nghị"}</h1>
          <p>{waitingForViewer ? "Chưa giữ sách hay trừ tiền." : `Đang chờ ${detail.partner.username} phản hồi. Chưa giữ sách hay trừ tiền.`}</p>
        </header>
        {actionSection}
        <div className={styles.proposalLayout}>
          <section className={styles.proposalFacts} aria-labelledby="proposal-facts">
            <h2 id="proposal-facts">Phiếu đề nghị đổi sách</h2>
            {[{ title: "Sách bạn gửi", books: detail.giveBooks }, { title: "Sách bạn nhận", books: detail.receiveBooks }].map(group => (
              <div className={styles.proposalBooks} key={group.title}>
                <h3>{group.title}</h3>
                {group.books.map(book => (
                  <div className={styles.proposalBook} key={book.id}>
                    <div aria-hidden="true"><BookCover title={book.title} coverUrl={book.coverUrl} /></div>
                    <div><strong>{book.title}</strong><span>{book.author}</span>{book.price != null && <span>{formatVnd(book.price)}</span>}</div>
                  </div>
                ))}
                {group.books.length === 0 && <p>Chưa tải được thông tin sách.</p>}
              </div>
            ))}
            {!detail.hasAgreementSnapshot && <p>Phiếu cũ thiếu thông tin sách lúc gửi đề nghị.</p>}
          </section>
          <section className={styles.proposalAmounts} aria-labelledby="proposal-amounts">
            <h2 id="proposal-amounts">Nếu hai bên đồng ý</h2>
            <dl>
              {detail.viewerDeposit != null && <div><dt>Cọc của bạn</dt><dd>{formatVnd(detail.viewerDeposit)}</dd></div>}
              {detail.moneyAmount != null && detail.moneyCompensationType !== "none" && (
                <div><dt>{detail.moneyCompensationType === "user_pays" ? "Tiền bù của bạn" : `Tiền bù của ${detail.partner.username}`}</dt><dd>{formatVnd(detail.moneyAmount)}</dd></div>
              )}
              {detail.viewerFundingAmount != null && <div><dt>Bạn cần nộp</dt><dd><strong>{formatVnd(detail.viewerFundingAmount)}</strong></dd></div>}
            </dl>
          </section>
        </div>
        <details className={styles.proposalChat}>
          <summary>Nhắn cho {detail.partner.username}</summary>
          {chat}
        </details>
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
            {chat}
          </div>
        )}
      </div>
    </div>
  );
}
