import { ExchangeReturnPanel } from "../components/exchange/ExchangeReturnPanel";
import type { ReactNode } from "react";
import {
  TransactionFrame,
  TransactionDisclosure,
} from "../components/conversation/TransactionFrame";
import { ExchangeContext } from "../components/conversation/ExchangeContext";
import { ExchangeFinanceSummary } from "../components/conversation/ExchangeFinanceSummary";
import { exchangeStage } from "../lib/transaction-stage";
import { exchangeHandoverTarget, isExchangeHandover } from "../lib/exchange-handover";
import { ExchangeEvidencePanel } from "../components/exchange/ExchangeEvidencePanel";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  LifeBuoy,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ApiError, confirmExchangeRead, sendEvidence, type EvidenceInput } from "@used-books/session-client";
import { session } from "../services/api";
import { useExchangeRecovery } from "../hooks/useExchangeRecovery";
import { useTransactionLive } from "../hooks/useTransactionLive";
import { ExchangeRecoveryPanel } from "../components/exchange/ExchangeRecoveryPanel";
import { ExchangeSupportDialog } from "../components/exchange/ExchangeSupportDialog";
import { useParams, Link, Navigate, useLocation } from "react-router-dom";
import { useConversationTransition } from "../components/conversation/conversation-navigation";
import { ConversationBackLink } from "../components/conversation/ConversationBackLink";
import { getPurchaseConversations } from "../services/purchase-conversations";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROUTES, formatVnd } from "../lib/routes";
import { useSession } from "../hooks/useSession";
import { exchangeAcknowledged, exchangeCommand, pendingExchange } from "../services/exchange";
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
  advanceDemoShipping,
} from "../services/exchangeDetail";
import type { CounterOfferData } from "../components/exchange/CounterDialog";
import { type ShipmentData } from "../services/exchangeShipment";
import { ExchangeSteps } from "../components/exchange/ExchangeSteps";
import { SettlementCard } from "../components/exchange/SettlementCard";
import { ReviewCard } from "../components/exchange/ReviewCard";
import { BookCover } from "../components/BookCover";
import { ActionCard } from "../components/exchange/ActionCard";
import { ChatPanel } from "../components/exchange/ChatPanel";
import { ExchangeChatDrawer } from "../components/exchange/ExchangeChatDrawer";
import { exchangeChatGuidance } from "../lib/exchange-chat-guidance";
import { SafetyTipsCard } from "../components/exchange/SafetyTipsCard";
import { BookConditionDisclosure } from "../components/exchange/BookConditionDisclosure";
import { InfoTip } from "../components/InfoTip";
import { conditions } from "../lib/listing-labels";
import type { ExchangeDetail } from "../lib/mock/exchangeDetail";
import styles from "./ExchangeDetailPage.module.css";

type ExchangeTone =
  | "pending"
  | "funding"
  | "handover"
  | "inspect"
  | "dispute"
  | "done-ok"
  | "closed";

function toneOfExchange(status: ExchangeDetail["status"]): ExchangeTone {
  switch (status) {
    case "PENDING":
      return "pending";
    case "FUNDING":
      return "funding";
    case "WAITING_YOU_SEND":
    case "WAITING_YOU_CONFIRM":
    case "DELIVERING":
      return "handover";
    case "INSPECTING":
      return "inspect";
    case "RESOLUTION_PENDING":
      return "dispute";
    case "COMPLETED":
    case "NEED_REVIEW":
      return "done-ok";
    default:
      return "closed";
  }
}

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
  const handoverTarget = exchangeHandoverTarget(location.hash);
  const transitioning = !embedded && chatTransition;
  const { id: routeId } = useParams<{ id: string }>();
  const id = exchangeId ?? routeId;
  const queryClient = useQueryClient();
  const auth = useSession();
  const viewerId = auth.status === "authenticated" ? auth.user.id : undefined;
  const exchangeKey = ["exchangeDetail", viewerId, id] as const;
  const messagesKey = ["exchangeMessages", viewerId, id] as const;
  const live = useTransactionLive("exchange", id, () => {
    for (const queryKey of [exchangeKey, messagesKey, ["exchange-evidence"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });
  const [disputeUploadNotice, setDisputeUploadNotice] = useState<string>("");
  const [supportOpen, setSupportOpen] = useState(false);
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
    queryKey: exchangeKey,
    queryFn: () => getExchangeDetail(id!),
    enabled: !!id && auth.status === "authenticated",
    refetchInterval: live ? 30_000 : 5_000,
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
    queryKey: messagesKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getMessagePage(id!, pageParam),
    getNextPageParam: (page) => page.olderCursor ?? undefined,
    enabled: !embedded && !!id && auth.status === "authenticated",
    refetchInterval: (query) =>
      (live ? 30_000 : 3_000) * Math.max(1, query.state.data?.pages.length ?? 0),
    refetchIntervalInBackground: false,
  });
  const messagesDenied =
    messagesQuery.error instanceof ApiError &&
    [401, 403, 404].includes(messagesQuery.error.status);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["exchangeDetail"] });
    queryClient.invalidateQueries({ queryKey: ["exchangeTransactions"] });
    queryClient.invalidateQueries({ queryKey: ["exchangeCounts"] });
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

  const handleDispute = async (reason: string, files?: File[]) => {
    setDisputeUploadNotice("");
    const latest = await getExchangeDetail(id!).catch(() => detail);
    const rev = latest?.revision ?? detail!.revision!;
    await reportIssue(id!, rev, reason);

    if (files && files.length > 0) {
      const updated = await getExchangeDetail(id!).catch(() => undefined);
      const nextRev = updated?.revision ?? rev + 1;
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "video/mp4",
      ];
      let failedCount = 0;
      for (const file of files.slice(0, 3)) {
        const mime = file.type as EvidenceInput["mimeType"];
        const max = mime.startsWith("image/")
          ? 10_000_000
          : mime === "application/pdf"
            ? 20_000_000
            : 100_000_000;
        if (!allowedMimes.includes(mime) || file.size > max) {
          failedCount++;
          continue;
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const sha256 = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          await sendEvidence(
            session,
            id!,
            {
              bytes,
              fileName: file.name,
              mimeType: mime,
              sha256,
              expectedVersion: nextRev,
            },
            () => crypto.randomUUID(),
          );
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        setDisputeUploadNotice(
          `Báo sự cố đã được gửi, nhưng ${failedCount} tệp đính kèm chưa tải lên được. Bạn có thể tải lại trực tiếp ở mục Bằng chứng bên dưới.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["exchange-evidence"] });
    }
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

  if (auth.status !== "authenticated") {
    return (
      <div className={styles.stateWrap}>
        <div className={styles.stateCard}>
          <h1>
            {auth.status === "loading"
              ? "Đang kiểm tra đăng nhập…"
              : "Đăng nhập để xem trao đổi"}
          </h1>
          {auth.status !== "loading" && (
            <>
              <p className={styles.stateText}>
                Phiếu trao đổi chỉ hiển thị cho hai thành viên tham gia giao dịch.
              </p>
              <Link
                data-focus-inverse
                className={styles.primaryInline}
                to={`/login?returnUrl=${encodeURIComponent(`/exchange/${id ?? ""}${location.hash}`)}`}
              >
                Đăng nhập
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  if (id && !detail && (pendingExchange(id) || exchangeAcknowledged(id))) {
    return (
      <div className={styles.stateWrap}>
        <div className={styles.stateCard}>
          <ExchangeRecoveryPanel
            id={id}
            onRead={async () => {
              await refetchDetail();
            }}
          />
          <Link className={styles.secondaryInline} to={ROUTES.exchangeMine}>
            <ArrowLeft size={16} aria-hidden="true" />
            Trao đổi của tôi
          </Link>
        </div>
      </div>
    );
  }

  if (isDetailLoading) {
    return (
      <div
        className={styles.stateWrap}
        data-chat-morph-room={transitioning || undefined}
      >
        <div className={styles.stateCard} role="status">
          <span className={styles.loadingLine} aria-hidden="true" />
          <p className={styles.stateText}>Đang tải phiếu trao đổi…</p>
        </div>
      </div>
    );
  }

  if (isDetailError) {
    return (
      <div
        id={"exchange-recovery-" + id}
        className={styles.stateWrap}
        data-chat-morph-room={transitioning || undefined}
      >
        <div className={styles.stateCard}>
          <h1>Chưa tải được trạng thái hiện tại</h1>
          {id && (
            <ExchangeRecoveryPanel
              id={id}
              onRead={async () => {
                await refetchDetail();
              }}
            />
          )}
          <button
            type="button"
            data-focus-inverse
            className={styles.primaryInline}
            onClick={() => refetchDetail()}
          >
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
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.stateWrap}>
        <div className={styles.stateCard}>
          <h1>Không tìm thấy giao dịch</h1>
          <p className={styles.stateText}>
            Giao dịch bạn tìm kiếm không tồn tại hoặc bạn không có quyền truy cập.
          </p>
          <Link
            data-focus-inverse
            to={ROUTES.exchangeMine}
            className={styles.primaryInline}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Quay lại Trao đổi của tôi
          </Link>
        </div>
      </div>
    );
  }

  let statusText = String(detail.status);
  if (detail.status === "PENDING") statusText = "Chờ phản hồi";
  else if (detail.status === "FUNDING") statusText = "Chờ đặt cọc";
  else if (detail.status === "WAITING_YOU_SEND") statusText = "Chuẩn bị gửi sách";
  else if (detail.status === "RESOLUTION_PENDING") statusText = "Đang cần xử lý";
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
    if (detail.returnResolution?.outcome) statusText = "Đã xử lý trả sách";
    else if (
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
  const handover = isExchangeHandover(detail.status);
  const inspecting = detail.status === "INSPECTING";
  const tone = toneOfExchange(detail.status);
  const isActiveFlow = !["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"].includes(
    detail.status,
  );

  if (!embedded && linked && !handoverTarget && proposal)
    return <Navigate replace to={`/chat/${linked.id}`} />;

  const standaloneSheet = !embedded && (proposal || funding);
  const handoverNavigation = { target: handoverTarget, navigationKey: location.key };
  const recoveringAction = Boolean(
    pendingExchange(detail.id) || exchangeAcknowledged(detail.id),
  );
  const caseBookId = detail.returnResolution?.listingId;
  const outgoingCaseBook = detail.giveBooks.find((book) => book.id === caseBookId);
  const caseBook =
    outgoingCaseBook ?? detail.receiveBooks.find((book) => book.id === caseBookId);
  const returnResolution = detail.revision ? detail.returnResolution : undefined;
  const shouldExpandEvidence =
    !returnResolution ||
    returnResolution.phase === "Evidence" ||
    returnResolution.phase === "ReturnIssue";
  const evidence = detail.rawStatus === "ResolutionPending" && (
    <ExchangeEvidencePanel
      key={"evidence:" + detail.viewer.id + ":" + detail.id}
      id={detail.id}
      revision={detail.revision!}
      userId={detail.viewer.id}
      compact={Boolean(returnResolution)}
      collapsible={Boolean(returnResolution)}
      defaultExpanded={shouldExpandEvidence}
    />
  );
  const isDispute = detail.status === "RESOLUTION_PENDING";
  const showOuterDisputeHeader = isDispute && !returnResolution;

  const actionSection = (
    <section
      id="exchange-actions"
      className={
        showOuterDisputeHeader
          ? `${styles.actionSection} ${styles.disputeDossier}`
          : styles.actionSection
      }
      aria-label={isDispute ? "Hồ sơ tranh chấp" : "Hành động của bạn"}
      tabIndex={-1}
    >
      {showOuterDisputeHeader && (
        <header className={styles.disputeDossierHeader}>
          <div className={styles.disputeDossierTitleRow}>
            <span className={styles.disputeBadgeIcon} aria-hidden="true">
              <ShieldAlert size={18} />
            </span>
            <div>
              <h2>Hồ sơ tranh chấp · Đang chờ Admin tiếp nhận</h2>
              <span className={styles.disputeSub}>
                Ký quỹ và tiền bù được giữ nguyên cho đến khi có phán quyết.
              </span>
            </div>
          </div>
          {disputeUploadNotice && (
            <p className={styles.disputeUploadNotice} role="status">
              {disputeUploadNotice}
            </p>
          )}
        </header>
      )}
      {isDispute && returnResolution && disputeUploadNotice && (
        <p className={styles.disputeUploadNotice} role="status">
          {disputeUploadNotice}
        </p>
      )}
      {(!detail.returnResolution || recoveringAction) && (
        <ActionCard
          compact={embedded || standaloneSheet || handover || inspecting}
          standaloneSheet={standaloneSheet || handover || inspecting}
          handover={handover ? handoverNavigation : undefined}
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
          onAdvanceDemoDeadline={async () => {
            const deadline = detail.demoDeadline;
            const latest = await getExchangeDetail(detail.id);
            if (
              latest.demoDeadline !== deadline ||
              latest.revision !== detail.revision
            ) {
              invalidate();
              if (deadline === "Inspection" && latest.status === "COMPLETED") return;
              throw new ApiError(
                409,
                "VersionConflict",
                "Phiếu vừa thay đổi. Xem lại trạng thái trước khi tua hạn.",
              );
            }
            try {
              await exchangeCommand(`/exchanges/${detail.id}/demo-advance`, {
                expectedVersion: detail.revision!,
                deadline,
              });
            } catch (error) {
              if (
                deadline !== "Inspection" ||
                !(error instanceof ApiError) ||
                error.status !== 409
              )
                throw error;
              const current = await getExchangeDetail(detail.id).catch(
                () => undefined,
              );
              if (current?.status !== "COMPLETED") throw error;
            }
            invalidate();
          }}
          onAdvanceDemoShipping={async () => {
            await advanceDemoShipping(id!, detail.revision!);
            invalidate();
          }}
        />
      )}
      {detail.outboundDeliveryVerification && (
        <section
          className={styles.deliveryVerification}
          aria-label="Xác minh giao sách"
        >
          <div className={styles.verificationHead}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <h2>Admin đã xác minh sách đã đến người nhận</h2>
          </div>
          <p>{detail.outboundDeliveryVerification.note}</p>
        </section>
      )}
      {returnResolution && detail.revision && (
        <ExchangeReturnPanel
          key={"return:" + detail.viewer.id + ":" + detail.id}
          id={detail.id}
          revision={detail.revision}
          userId={detail.viewer.id}
          resolution={returnResolution}
          evidence={evidence}
          statements={detail.statements}
          caseBook={
            caseBook && {
              title: caseBook.title,
              coverUrl: caseBook.coverUrl,
              confirmed: Boolean(
                outgoingCaseBook
                  ? detail.partnerShipping.receivedAt
                  : detail.viewerShipping.receivedAt,
              ),
            }
          }
          disputeReason={detail.disputeReason}
          returnAddress={detail.partnerAddress}
          blocked={recoveringAction}
          onRead={() => void refetchDetail()}
        />
      )}
      {!returnResolution && evidence}
    </section>
  );

  const messagePages = messagesDenied ? undefined : messagesQuery.data?.pages;
  const messages =
    messagePages?.slice().reverse().flatMap((page) => page.items) ?? [];
  const renderChat = (inDrawer = false, visible = true) => (
    <ChatPanel
      key={id}
      inDrawer={inDrawer}
      visible={visible}
      messages={messages}
      isLoading={messagesQuery.isPending}
      loadError={
        messagesDenied ||
        (messagesQuery.isError && !messagesQuery.isFetchNextPageError)
      }
      isRefreshing={messagesQuery.isFetching}
      hasOlder={!messagesDenied && messagesQuery.hasNextPage}
      isLoadingOlder={messagesQuery.isFetchingNextPage}
      olderError={!messagesDenied && messagesQuery.isFetchNextPageError}
      onLoadOlder={() =>
        messagesQuery.fetchNextPage({ cancelRefetch: false })
      }
      onRetry={() => void messagesQuery.refetch()}
      giveBooks={detail.giveBooks.map((book) => book.title)}
      receiveBooks={detail.receiveBooks.map((book) => book.title)}
      statusText={statusText}
      guidance={exchangeChatGuidance(detail)}
      partner={detail.partner}
      onSendMessage={handleSendMessage}
      isReadOnly={["COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"].includes(
        detail.status,
      )}
      unavailable={messagesDenied}
    />
  );

  const partnerInitial =
    Array.from(detail.partner.username.trim())[0]?.toLocaleUpperCase("vi") || "Đ";
  const contact = linked ? (
    <Link
      className={styles.chatLink}
      to={`/chat/${linked.id}`}
      aria-label={`Nhắn cho ${detail.partner.username}`}
    >
      <span className={styles.chatLinkAvatar} aria-hidden="true">
        {partnerInitial}
      </span>
      <span className={styles.chatLinkName} title={detail.partner.username}>
        <bdi>{detail.partner.username}</bdi>
      </span>
    </Link>
  ) : (
    <ExchangeChatDrawer
      viewerId={detail.viewer.id}
      exchangeId={detail.id}
      transactionCode={detail.transactionCode}
      partnerName={detail.partner.username}
      partnerAvatarUrl={detail.partner.avatarUrl}
      latest={messagePages?.[0]?.items ?? []}
    >
      {(open) => renderChat(true, open)}
    </ExchangeChatDrawer>
  );

  const stepPanel = (children: ReactNode) => (
    <ExchangeSteps detail={detail} navigation={handoverNavigation}>
      {children}
    </ExchangeSteps>
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
          <div className={styles.embeddedSteps}>
            {stepPanel(
              <>
                {actionSection}
                <ReviewCard detail={detail} />
                {detail.status === "COMPLETED" && (
                  <SettlementCard detail={detail} />
                )}
              </>,
            )}
          </div>
          {workspaceNavigation}
          <TransactionDisclosure title="Hướng dẫn giao nhận và bảo quản">
            <SafetyTipsCard />
          </TransactionDisclosure>
        </TransactionFrame>
      </div>
    );

  const waitingForViewer = detail.canViewerAccept ?? detail.viewerRole === "recipient";
  const updatedProposal =
    proposal && (detail.revision ?? 0) > 1 && !!detail.lastProposedById;
  const multipleBooks =
    detail.giveBooks.length > 1 || detail.receiveBooks.length > 1;
  const title = funding
    ? detail.viewerFundedAt
      ? "Bạn đã đặt cọc"
      : "Đặt cọc đổi sách"
    : handover
      ? "Giao nhận sách"
      : !proposal
        ? detail.status === "REJECTED"
          ? "Đề nghị bị từ chối"
          : statusText
        : updatedProposal
          ? waitingForViewer
            ? "Đề nghị đã cập nhật"
            : "Đã gửi đề nghị mới"
          : waitingForViewer
            ? "Đề nghị đổi sách"
            : "Đã gửi đề nghị";

  return (
      <div
        className={styles.page}
        data-tone={tone}
        data-chat-morph-room={transitioning || undefined}
      >
        <nav className={styles.topBar} aria-label="Điều hướng phiếu trao đổi">
          {location.state?.chatFromInbox === true ? (
            <ConversationBackLink className={styles.backButton} />
          ) : (
            <Link className={styles.backButton} to={ROUTES.exchangeMine}>
              <ArrowLeft size={16} aria-hidden="true" />
              Trao đổi của tôi
            </Link>
          )}
          <div className={styles.topMeta}>
            <span className={styles.codeStamp}>Phiếu #{detail.transactionCode}</span>
            <button
              type="button"
              className={styles.supportButton}
              aria-haspopup="dialog"
              aria-expanded={supportOpen}
              onClick={() => setSupportOpen(true)}
            >
              <LifeBuoy size={15} aria-hidden="true" />
              Gửi phản ánh
            </button>
          </div>
        </nav>

        <ExchangeSupportDialog
          isOpen={supportOpen}
          onClose={() => setSupportOpen(false)}
          exchangeId={detail.id}
          transactionCode={detail.transactionCode}
          bookTitle={detail.receiveBooks[0]?.title ?? detail.giveBooks[0]?.title}
        />

        <header className={styles.headCard} data-tone={tone}>
          <div className={styles.headMain}>
            <div className={styles.stampRow}>
              <span className={styles.statusStamp}>
                {isActiveFlow && <span className={styles.liveDot} aria-hidden="true" />}
                {statusText}
              </span>
              <span
                className={styles.roleStamp}
                data-role={detail.viewerRole}
              >
                <UserRound size={13} aria-hidden="true" />
                {detail.viewerRole === "proposer" ? "Bạn gửi đề nghị" : "Bạn nhận đề nghị"}
              </span>
              {multipleBooks && (
                <span className={styles.bundleStamp}>
                  <ArrowLeftRight size={13} aria-hidden="true" />
                  Đổi nhiều cuốn
                </span>
              )}
            </div>

            <div className={styles.titleRow}>
              <h1>{title}</h1>
              <InfoTip label="Quy trình bảo chứng trao đổi">
                <ul>
                  <li>
                    <strong>Đặt cọc hai chiều:</strong> hai bên ký quỹ theo giá trị sách để đảm bảo cam kết giao nhận.
                  </li>
                  <li>
                    <strong>72 giờ kiểm tra:</strong> tính từ lúc mỗi bên xác nhận đã nhận sách.
                  </li>
                  <li>
                    <strong>Hoàn 100% tiền cọc</strong> về Ví mô phỏng sau khi hết hạn kiểm tra và không có tranh chấp.
                  </li>
                </ul>
              </InfoTip>
            </div>

            <div className={styles.partnerBar}>
              <div className={styles.partnerGroup}>
                <span className={styles.partnerLead}>Đổi sách với</span>
                {contact}
              </div>
              {detail.createdAt && (
                <span className={styles.createdMeta}>
                  <Clock size={13} aria-hidden="true" />
                  <span>Tạo ngày</span>
                  <time dateTime={detail.createdAt}>
                    {new Date(detail.createdAt).toLocaleDateString("vi-VN")}
                  </time>
                </span>
              )}
            </div>
          </div>

          <img
            src="/illustrations/exchange-detail/exchange-crest.svg"
            alt=""
            aria-hidden="true"
            className={styles.headArt}
            width={184}
            height={140}
          />
        </header>

        <div className={styles.exchangeContent}>
          {stepPanel(
            standaloneSheet ? (
              <div
                className={
                  funding ? styles.fundingWorkspace : styles.proposalWorkspace
                }
              >
                <div
                  className={styles.proposalLayout}
                  data-books-only={funding || undefined}
                >
                  <section
                    aria-labelledby="proposal-facts"
                    className={styles.booksCard}
                    data-multiple-books={multipleBooks || undefined}
                  >
                    <header className={styles.booksCardHead}>
                      <h2 id="proposal-facts">
                        {proposal && !updatedProposal
                          ? "Phiếu đề nghị đổi sách"
                          : "Sách trong phiếu"}
                      </h2>
                      <InfoTip label="Bản chụp thỏa thuận sách">
                        Tình trạng và giá trị trao đổi được khóa theo bản chụp tại thời điểm gửi đề nghị để đối chiếu khi nhận sách.
                      </InfoTip>
                    </header>

                    {detail.giveBooks.length > 0 &&
                      detail.receiveBooks.length > 0 &&
                      detail.giveBooks.every((book) => book.price != null) &&
                      detail.receiveBooks.every((book) => book.price != null) && (() => {
                        const giveTotal = detail.giveBooks.reduce(
                          (sum, book) => sum + (book.price ?? 0),
                          0,
                        );
                        const receiveTotal = detail.receiveBooks.reduce(
                          (sum, book) => sum + (book.price ?? 0),
                          0,
                        );
                        const priceGap = Math.abs(receiveTotal - giveTotal);
                        return (
                          <div
                            className={styles.valueCompareBar}
                            aria-label="Đối chiếu tổng giá trị sách hai bên"
                          >
                            <div className={styles.compareSide}>
                              <span className={styles.compareLabel}>
                                <ArrowUpRight size={14} aria-hidden="true" />
                                Bạn gửi ({detail.giveBooks.length} cuốn)
                              </span>
                              <strong className={styles.compareAmount}>
                                {formatVnd(giveTotal)}
                              </strong>
                            </div>
                            <div className={styles.compareDiff}>
                              <ArrowLeftRight size={14} aria-hidden="true" />
                              <span>
                                {priceGap === 0
                                  ? "Ngang giá sách"
                                  : `Chênh lệch ${formatVnd(priceGap)}`}
                              </span>
                            </div>
                            <div className={styles.compareSide} data-receive="true">
                              <span className={styles.compareLabel}>
                                <ArrowDownLeft size={14} aria-hidden="true" />
                                Bạn nhận ({detail.receiveBooks.length} cuốn)
                              </span>
                              <strong className={styles.compareAmount}>
                                {formatVnd(receiveTotal)}
                              </strong>
                            </div>
                          </div>
                        );
                      })()}

                    <div className={styles.booksColumns}>
                      {[
                        {
                          title: "Sách bạn gửi",
                          books: detail.giveBooks,
                          Icon: ArrowUpRight,
                          receive: false,
                        },
                        {
                          title: "Sách bạn nhận",
                          books: detail.receiveBooks,
                          Icon: ArrowDownLeft,
                          receive: true,
                        },
                      ].map(({ title: label, books, Icon, receive }) => {
                        const total = books.reduce(
                          (sum, book) => sum + (book.price ?? 0),
                          0,
                        );
                        return (
                          <div
                            className={styles.bookLane}
                            key={label}
                            data-receive={receive || undefined}
                          >
                            <div className={styles.bookLaneHead}>
                              <h3>
                                <Icon size={17} aria-hidden="true" />
                                <span>{label}</span>
                              </h3>
                              {books.length > 0 && (
                                <span className={styles.bookGroupCount}>
                                  {books.length} cuốn
                                </span>
                              )}
                            </div>

                            <div className={styles.bookLaneList}>
                              {books.map((book, index) => (
                                <article
                                  className={styles.proposalBook}
                                  key={book.id}
                                >
                                  {books.length > 1 && (
                                    <div className={styles.bookIndexBar}>
                                      <span className={styles.bookIndexStamp}>
                                        Cuốn {index + 1} / {books.length}
                                      </span>
                                    </div>
                                  )}
                                  <div
                                    className={styles.bookCoverBox}
                                    aria-hidden="true"
                                  >
                                    <BookCover
                                      title={book.title}
                                      coverUrl={book.coverUrl}
                                      index={index}
                                      fallbackLabel="Chưa có ảnh"
                                    />
                                  </div>
                                  <div className={styles.bookMeta}>
                                    <strong
                                      className={styles.proposalBookTitle}
                                      title={book.title}
                                    >
                                      {book.title}
                                    </strong>
                                    {book.author && (
                                      <span className={styles.proposalBookAuthor}>
                                        {book.author}
                                      </span>
                                    )}
                                    {book.condition && (
                                      <span className={styles.conditionTag}>
                                        {conditions[
                                          book.condition as keyof typeof conditions
                                        ] ?? book.condition}
                                      </span>
                                    )}
                                  </div>
                                  {book.price != null && (
                                    <div className={styles.priceHighlight}>
                                      <span className={styles.priceLabel}>Giá trị đổi</span>
                                      <strong className={styles.proposalBookPrice}>
                                        {formatVnd(book.price)}
                                      </strong>
                                    </div>
                                  )}
                                  <BookConditionDisclosure
                                    label="Tình trạng sách"
                                    editionLabel={book.editionLabel}
                                    conditionDetails={book.conditionDetails}
                                    report={book.conditionReport}
                                    incoming={receive}
                                  />
                                </article>
                              ))}
                              {books.length === 0 && (
                                <p className={styles.emptyBooks}>
                                  Chưa tải được thông tin sách.
                                </p>
                              )}
                            </div>

                            {multipleBooks &&
                              books.length > 0 &&
                              books.every((book) => book.price != null) && (
                                <div className={styles.bookGroupTotal}>
                                  <div className={styles.bookGroupTotalMeta}>
                                    <span className={styles.bookGroupTotalLabel}>
                                      Tổng giá trị đổi
                                    </span>
                                    <span className={styles.bookGroupTotalSub}>
                                      {books.length > 1
                                        ? `${books.length} cuốn cộng gộp`
                                        : "1 cuốn trong phiếu"}
                                    </span>
                                  </div>
                                  <strong className={styles.bookGroupTotalValue}>
                                    {formatVnd(total)}
                                  </strong>
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>

                    {!detail.hasAgreementSnapshot && (
                      <p className={styles.snapshotNotice}>
                        Phiếu cũ thiếu thông tin sách lúc gửi đề nghị.
                      </p>
                    )}
                  </section>
                </div>

                <aside
                  className={funding ? styles.fundingControls : styles.decisionRail}
                  aria-label={funding ? "Đặt cọc trao đổi" : "Tóm tắt tài chính và quyết định"}
                >
                  {proposal && (
                    <section
                      className={styles.proposalAmounts}
                      aria-labelledby="proposal-amounts"
                    >
                      <header className={styles.amountsHead}>
                        <div className={styles.amountsTitleWrap}>
                          <ShieldCheck size={17} aria-hidden="true" />
                          <h2 id="proposal-amounts">Nếu hai bên đồng ý</h2>
                        </div>
                        <InfoTip label="Cách tính tiền cọc và tiền bù">
                          <ul>
                            <li>
                              <strong>Chưa giữ sách hay trừ tiền</strong> khi phiếu còn đang ở bước đề nghị.
                            </li>
                            <li>
                              Khi hai bên đồng ý, mỗi bên nộp tiền cọc tương ứng trong <strong>24 giờ</strong>.
                            </li>
                            <li>
                              Tiền cọc được hoàn lại <strong>100%</strong> sau khi hoàn tất trao đổi.
                            </li>
                          </ul>
                        </InfoTip>
                      </header>
                      <dl className={styles.amountsList}>
                        {detail.viewerDeposit != null && (
                          <div>
                            <dt>Cọc của bạn</dt>
                            <dd>{formatVnd(detail.viewerDeposit)}</dd>
                          </div>
                        )}
                        {detail.partnerDeposit != null && (
                          <div>
                            <dt>Cọc của đối tác</dt>
                            <dd>{formatVnd(detail.partnerDeposit)}</dd>
                          </div>
                        )}
                        {detail.moneyAmount != null &&
                          detail.moneyCompensationType !== "none" && (
                            <div
                              className={styles.compRow}
                              data-direction={
                                detail.moneyCompensationType === "user_pays"
                                  ? "out"
                                  : "in"
                              }
                            >
                              <dt>
                                {detail.moneyCompensationType === "user_pays"
                                  ? "Tiền bù bạn trả"
                                  : "Tiền bù bạn nhận"}
                              </dt>
                              <dd className={styles.compHighlight}>
                                {detail.moneyCompensationType === "user_pays"
                                  ? "-"
                                  : "+"}
                                {formatVnd(detail.moneyAmount)}
                              </dd>
                            </div>
                          )}
                      </dl>
                      {detail.viewerFundingAmount != null && (
                        <div className={styles.amountsTotalBox}>
                          <span>Bạn cần nộp</span>
                          <strong>{formatVnd(detail.viewerFundingAmount)}</strong>
                        </div>
                      )}
                      <p className={styles.proposalAmountNote}>
                        Chưa giữ sách hay trừ tiền.
                      </p>
                    </section>
                  )}

                  <div
                    className={
                      funding ? styles.fundingPanel : styles.proposalActions
                    }
                    data-tone={tone}
                  >
                    {actionSection}
                  </div>
                </aside>
              </div>
            ) : (
              <div className={styles.stageStack}>
                {detail.status === "COMPLETED" && <SettlementCard detail={detail} />}
                {actionSection}
                <ReviewCard detail={detail} />
                {handover && (
                  <div className={styles.handoverFooter} data-shipping="true">
                    <TransactionDisclosure title="Hướng dẫn đóng gói và giao nhận">
                      <SafetyTipsCard />
                    </TransactionDisclosure>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>
  );
}
