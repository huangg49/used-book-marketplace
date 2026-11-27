import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppText,
  Button,
  Icon,
  Screen,
  StatePanel,
  WineHeader,
  space,
  stitchTokens,
} from "../../core/ui";
import {
  draftPage,
  emptyContent,
  privateDraft,
  receipt,
} from "../drafts/contracts";
import { DraftEditor } from "../drafts/draft-editor";
import {
  auctionDepositError,
  auctionDepositFor,
  auctionErrorText,
  auctionEligible,
  intakePriceErrors,
  outcomeUnknown,
  EVIDENCE_MIN_LENGTH,
  auctionStepError,
  type AuctionStep,
  type BuyNowMode,
  type AuctionFormat,
} from "./auctions-model";
import {
  handoverPoints,
  intakeReceipt,
  myIntake,
  myIntakes,
  type MyIntake,
} from "./contracts";
import {
  SendToAuctionNotices,
  SendToAuctionBookPicker,
  SendToAuctionPointPicker,
  SendToAuctionPricing,
  SendToAuctionActiveIntakes,
  SendToAuctionModals,
} from "./send-to-auction-components";
import { SendToAuctionPolicySheet } from "./send-to-auction-components/send-to-auction-policy";
import { ScheduleAuctionSheet } from "./components";

type PendingCommand = {
  kind: "create" | "withdraw" | "evidence";
  path: string;
  body: string;
  key: string;
};

type SendTab = "create" | "intakes";

const digits = (text: string) => Number(text.replace(/\D/g, "")) || null;

export function SendToAuctionScreen({ userId }: { userId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ intakeId?: string }>();
  const focusId = typeof params.intakeId === "string" ? params.intakeId : undefined;
  const [activeTab, setActiveTab] = useState<SendTab>("create");
  const [policyOpen, setPolicyOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);

  const focus = useQuery({
    queryKey: ["my-auction-intakes", userId, "focus", focusId],
    queryFn: () => client.request(`/me/auction-intakes/${focusId}`, myIntake),
    enabled: foreground && !!focusId,
    retry: false,
    refetchInterval: foreground ? 5_000 : false,
  });

  const listings = useQuery({
    queryKey: ["my-listings", userId, "auction"],
    queryFn: () => client.request("/me/listings?channel=Auction&limit=50", draftPage),
    enabled: foreground && !focusId,
    staleTime: 0,
    refetchInterval: foreground && !editingId ? 5_000 : false,
  });

  const editing = useQuery({
    queryKey: ["draft", userId, editingId],
    queryFn: () => client.request(`/me/listings/${editingId}`, privateDraft),
    enabled: !!editingId,
    refetchOnWindowFocus: false,
  });
  const createListing = useMutation({
    mutationFn: () => {
      createKey.current ??= Crypto.randomUUID();
      return client.request("/listings", receipt, {
        method: "POST",
        headers: { "Idempotency-Key": createKey.current },
        body: JSON.stringify({
          channel: "Auction",
          content: { ...emptyContent, mode: "Sale" },
        }),
      });
    },
    onSuccess: (r) => {
      createKey.current = null;
      setEditingId(r.entityId);
      void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
    },
  });

  const points = useQuery({
    queryKey: ["handover-points"],
    queryFn: () => client.request("/handover-points", handoverPoints),
    enabled: foreground,
    staleTime: 0,
  });

  const intakes = useQuery({
    queryKey: ["my-auction-intakes", userId],
    queryFn: () => client.request("/me/auction-intakes", myIntakes),
    enabled: foreground && !focusId,
    refetchInterval: foreground && !editingId ? 5_000 : false,
  });

  const auctionListings = listings.data?.items ?? [];
  const eligibleListings = auctionListings.filter(auctionEligible);
  const openPoints = points.data?.items ?? [];
  const activeIntakesCount = (intakes.data?.items ?? []).filter(
    (i) => i.state !== "Cancelled" && i.state !== "Reclaimed",
  ).length;

  // Form state
  const [listingId, setListingId] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [presetStep, setPresetStep] = useState<AuctionStep>(10000);
  const [customStepOn, setCustomStepOn] = useState(false);
  const [customStep, setCustomStep] = useState("");
  const stepError = customStepOn ? auctionStepError(digits(customStep)) : undefined;
  const step = customStepOn && !stepError ? digits(customStep)! : presetStep;
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [buyNow, setBuyNow] = useState("");
  const [buyNowMode, setBuyNowMode] = useState<BuyNowMode>("Challenge");
  const [auctionType, setAuctionType] = useState<AuctionFormat>("English");
  const [dutchTop, setDutchTop] = useState("");
  const [dutchEvery, setDutchEvery] = useState("60");
  const [minBidders, setMinBidders] = useState(4);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  // Modal & Command state
  const [confirming, setConfirming] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<MyIntake | null>(null);
  const [publishTarget, setPublishTarget] = useState<MyIntake | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyIntake | null>(null);

  const [evidenceMap, setEvidenceMap] = useState<Record<string, string>>({});
  const [evidenceTarget, setEvidenceTarget] = useState<MyIntake | null>(null);
  const [evidenceError, setEvidenceError] = useState<{ id: string; text: string } | null>(null);

  const selectedListing = eligibleListings.find((l) => l.id === listingId);
  const selectedPoint = openPoints.find((p) => p.id === pointId);
  const startPrice = digits(start);
  const buyNowPrice = buyNowOn ? digits(buyNow) : null;
  const priceErrors = intakePriceErrors(
    startPrice,
    step,
    auctionType === "English" && buyNowOn ? (buyNowPrice ?? 0) : null,
  );
  const dutchTopPrice = digits(dutchTop);
  const dutchSeconds = Number(dutchEvery) || 0;
  const dutchError =
    auctionType !== "Dutch"
      ? null
      : dutchTopPrice === null
        ? "Nhập giá mở đầu."
        : startPrice !== null && dutchTopPrice <= startPrice
          ? "Giá mở đầu phải cao hơn giá sàn."
          : startPrice !== null && (dutchTopPrice - startPrice) % step !== 0
            ? "Giá mở đầu phải bằng giá sàn cộng một số bước giá."
            : dutchSeconds < 10 || dutchSeconds > 3600
              ? "Mỗi lần giảm cách nhau 10 giây đến 1 giờ."
              : null;

  const depositError = auctionDepositError(startPrice, deposit);

  const formError = !selectedListing
    ? "Vui lòng chọn một sách đấu giá đã được duyệt."
    : !selectedPoint || selectedPoint.availableSlots < 1 || selectedPoint.status !== "Active"
      ? "Vui lòng chọn điểm tiếp nhận còn chỗ tại TP.HCM."
      : (stepError ?? priceErrors.startPrice ?? priceErrors.buyNowPrice ?? dutchError ?? depositError ?? null);

  const locked = busy || Boolean(pending);

  const executeCommand = async (command: PendingCommand) => {
    setBusy(true);
    setError(null);
    setModalError(null);
    try {
      const res = await client.request(command.path, intakeReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);

      if (command.kind === "create") {
        const newlyCreated = await client.request(`/me/auction-intakes/${res.intakeId}`, myIntake);
        setCreated(newlyCreated);
        setListingId(null);
        setStart("");
        setBuyNow("");
        setBuyNowOn(false);
        setTouched(false);
        setActiveTab("intakes");
      }
      setConfirming(false);
      setWithdrawTarget(null);
      setEvidenceTarget(null);
    } catch (caught) {
      const msg = auctionErrorText(caught);
      setPending(outcomeUnknown(caught) ? command : null);
      if (confirming || withdrawTarget || evidenceTarget) {
        setModalError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["my-auction-intakes", userId] });
      void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
      void queryClient.invalidateQueries({ queryKey: ["handover-points"] });
    }
  };

  const handleStartSubmit = () => {
    setTouched(true);
    setCreated(null);
    setModalError(null);
    if (!formError) {
      setConfirming(true);
    }
  };

  const handleConfirmSubmit = () => {
    if (!selectedListing || !selectedPoint || !startPrice) return;
    void executeCommand({
      kind: "create",
      path: "/auction-intakes",
      key: Crypto.randomUUID(),
      body: JSON.stringify({
        listingId: selectedListing.id,
        expectedListingVersion: selectedListing.version,
        pointId: selectedPoint.id,
        startPrice,
        step,
        buyNowPrice: auctionType === "English" ? buyNowPrice : null,
        buyNowMode: auctionType === "English" && buyNowPrice !== null ? buyNowMode : "Challenge",
        auctionType,
        minBidders,
        ...(deposit !== null ? { depositAmount: deposit } : {}),
        dutchTopPrice: auctionType === "Dutch" ? digits(dutchTop) : null,
        dutchIntervalSeconds: auctionType === "Dutch" ? Number(dutchEvery) || null : null,
      }),
    });
  };

  const handleConfirmWithdraw = () => {
    if (!withdrawTarget) return;
    void executeCommand({
      kind: "withdraw",
      path: `/auction-intakes/${withdrawTarget.id}/cancel`,
      key: Crypto.randomUUID(),
      body: JSON.stringify({ expectedVersion: withdrawTarget.version }),
    });
  };

  const handleRequestSubmitEvidence = (item: MyIntake, noteText: string) => {
    if (noteText.trim().length < EVIDENCE_MIN_LENGTH) {
      setEvidenceError({
        id: item.id,
        text: `Mô tả giải trình tối thiểu ${EVIDENCE_MIN_LENGTH} ký tự.`,
      });
      return;
    }
    setEvidenceError(null);
    setModalError(null);
    setEvidenceTarget(item);
  };

  const handleConfirmEvidence = () => {
    if (!evidenceTarget) return;
    const note = (evidenceMap[evidenceTarget.id] ?? "").trim();
    void executeCommand({
      kind: "evidence",
      path: `/me/auction-intakes/${evidenceTarget.id}/evidence`,
      key: Crypto.randomUUID(),
      body: JSON.stringify({ expectedVersion: evidenceTarget.version, note }),
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
    void queryClient.removeQueries({ queryKey: ["draft", editingId] });
  };

  if (editingId && editing.data) {
    return <DraftEditor key={editingId} initial={editing.data} onBack={closeEditor} />;
  }

  if (editingId) {
    return (
      <Screen
        appearance="paper"
        canvasColor={stitchTokens.creamBg}
        headerExtendsToStatusBar
        header={<WineHeader title="Sách đấu giá" onBack={closeEditor} backLabel="Về gửi đấu giá" />}
      >
        <StatePanel
          wine
          loading={editing.isPending}
          title={editing.error ? "Chưa mở được sách đấu giá" : "Đang mở sách đấu giá"}
          action={editing.error ? { label: "Thử lại", onPress: () => void editing.refetch() } : undefined}
        />
        {editing.error ? <Button title="Về gửi đấu giá" wine secondary onPress={closeEditor} /> : null}
      </Screen>
    );
  }

  const stickyFooter = focusId ? (
    <Button
      wine
      secondary
      title="Xem tất cả lần gửi"
      onPress={() => router.replace("/send-to-auction")}
    />
  ) : activeTab === "create" ? (
    <View style={styles.footerDock}>
      {touched && Boolean(formError) ? (
        <View style={styles.footerErrorRow}>
          <Icon name="info" size={14} color={stitchTokens.flashRed} />
          <AppText kind="small" style={styles.footerErrorText}>{formError}</AppText>
        </View>
      ) : null}
      <Button
        wine
        title="Xem lại và gửi sách đấu giá"
        disabled={locked}
        onPress={handleStartSubmit}
      />
    </View>
  ) : undefined;

  return (
    <Screen
      appearance="paper"
      canvasColor={stitchTokens.creamBg}
      headerExtendsToStatusBar
      footer={stickyFooter}
      header={
        <WineHeader
          title={focusId ? "Hồ sơ gửi sách" : "Gửi sách đấu giá"}
          subtitle={
            focusId
              ? `Mã hồ sơ #${focusId.slice(0, 8).toUpperCase()}`
              : "Kiểm định tại điểm TP.HCM trước khi mở phiên"
          }
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/auctions");
          }}
          rightIcon={!focusId ? "info" : undefined}
          rightLabel="Xem quy trình gửi sách đấu giá"
          onRightPress={!focusId ? () => setPolicyOpen(true) : undefined}
        />
      }
    >
      <View style={styles.body}>
        {/* 2-Tab Switcher (replaces cramming form + tracking onto one endless scroll) */}
        {!focusId ? (
          <View style={styles.segmentedBar} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "create" }}
              onPress={() => setActiveTab("create")}
              style={[styles.segmentBtn, activeTab === "create" && styles.segmentBtnActive]}
            >
              <AppText kind="bold" style={[styles.segmentText, activeTab === "create" && styles.segmentTextActive]}>
                Tạo đơn gửi sách
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "intakes" }}
              onPress={() => setActiveTab("intakes")}
              style={[styles.segmentBtn, activeTab === "intakes" && styles.segmentBtnActive]}
            >
              <AppText kind="bold" style={[styles.segmentText, activeTab === "intakes" && styles.segmentTextActive]}>
                {activeIntakesCount > 0 ? `Hồ sơ đã gửi (${activeIntakesCount})` : "Hồ sơ đã gửi"}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {/* Status Notices (Success / Error / Pending Retry) */}
        <SendToAuctionNotices
          created={created}
          error={error}
          onDismissError={() => setError(null)}
          onRetryPending={() => pending && void executeCommand(pending)}
          hasPending={Boolean(pending)}
          isBusy={busy}
        />

        {/* Focus Mode loading / error */}
        {focusId && focus.isPending ? (
          <StatePanel wine loading title="Đang mở hồ sơ gửi sách…" />
        ) : null}
        {focusId && focus.error ? (
          <StatePanel
            wine
            title="Chưa mở được hồ sơ"
            message="Không kết luận hồ sơ đã mất. Kiểm tra kết nối hoặc quyền hiện tại rồi thử lại."
            action={{ label: "Thử lại", onPress: () => void focus.refetch() }}
          />
        ) : null}

        {/* TAB 1: Create Consignment Form */}
        {!focusId && activeTab === "create" ? (
          <View style={styles.formStack}>
            <SendToAuctionBookPicker
              eligibleListings={eligibleListings}
              selectedListingId={listingId}
              onSelectListing={(id) => {
                setListingId(id);
                setTouched(false);
              }}
              onOpenListing={setEditingId}
              onCreateListing={() => createListing.mutate()}
              creating={createListing.isPending}
              createError={
                createListing.error
                  ? "Chưa tạo được sách đấu giá. Thử lại; yêu cầu cũ sẽ không bị tạo trùng."
                  : null
              }
              loadError={listings.isError}
              onRetryLoad={() => void listings.refetch()}
              disabled={locked}
              isLoading={listings.isPending}
            />

            <SendToAuctionPointPicker
              points={openPoints}
              selectedPointId={pointId}
              onSelectPoint={(id) => {
                setPointId(id);
                setTouched(false);
              }}
              disabled={locked}
              isLoading={points.isPending}
            />

            <SendToAuctionPricing
              step={presetStep}
              onSelectStep={(value) => {
                setPresetStep(value);
                setCustomStepOn(false);
              }}
              customStepOn={customStepOn}
              onSelectCustomStep={() => {
                setCustomStepOn(true);
                if (!customStep) setCustomStep(String(presetStep));
              }}
              customStepText={customStep}
              onChangeCustomStepText={setCustomStep}
              customStepError={touched || customStep ? stepError : undefined}
              startPriceText={start}
              onChangeStartPriceText={setStart}
              startPriceError={touched ? priceErrors.startPrice : undefined}
              buyNowOn={buyNowOn}
              onToggleBuyNow={setBuyNowOn}
              buyNowPriceText={buyNow}
              onChangeBuyNowPriceText={setBuyNow}
              buyNowPriceError={touched ? priceErrors.buyNowPrice : undefined}
              buyNowMode={buyNowMode}
              onChangeBuyNowMode={setBuyNowMode}
              auctionType={auctionType}
              onChangeAuctionType={setAuctionType}
              dutchTopText={dutchTop}
              onChangeDutchTopText={setDutchTop}
              dutchEveryText={dutchEvery}
              onChangeDutchEveryText={setDutchEvery}
              dutchError={touched ? (dutchError ?? undefined) : undefined}
              minBidders={minBidders}
              onChangeMinBidders={setMinBidders}
              deposit={deposit}
              onChangeDeposit={setDeposit}
              depositError={touched ? (depositError ?? undefined) : undefined}
              disabled={locked}
            />
          </View>
        ) : null}

        {/* TAB 2 or Focus Mode: Submitted Intakes Tracking */}
        {(focusId ? !focus.error && !!focus.data : activeTab === "intakes") ? (
          <SendToAuctionActiveIntakes
            intakes={
              focusId
                ? focus.data && !focus.error
                  ? [focus.data]
                  : []
                : (intakes.data?.items ?? [])
            }
            isLoading={focusId ? focus.isPending : intakes.isPending}
            onWithdraw={(item) => {
              setModalError(null);
              setWithdrawTarget(item);
            }}
            onPublish={(item) => setPublishTarget(item)}
            onOpenAuction={(id) => router.push({ pathname: "/auction", params: { id } })}
            includeClosed={!!focusId}
            onSubmitEvidence={handleRequestSubmitEvidence}
            evidenceTextMap={evidenceMap}
            onChangeEvidenceText={(id, text) =>
              setEvidenceMap((prev) => ({ ...prev, [id]: text }))
            }
            evidenceError={evidenceError}
            disabled={locked}
          />
        ) : null}
      </View>

      <SendToAuctionPolicySheet visible={policyOpen} onClose={() => setPolicyOpen(false)} />

      <ScheduleAuctionSheet
        key={publishTarget ? `${publishTarget.id}:${publishTarget.version}` : "none"}
        visible={!!publishTarget}
        title={publishTarget?.title ?? ""}
        target={
          publishTarget
            ? {
                kind: "publish",
                intakeId: publishTarget.id,
                version: publishTarget.version,
              }
            : null
        }
        onClose={() => setPublishTarget(null)}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["my-auction-intakes", userId] });
          void queryClient.invalidateQueries({ queryKey: ["my-auctions", userId] });
          void queryClient.invalidateQueries({ queryKey: ["public-auctions"] });
        }}
      />

      <SendToAuctionModals
        confirmSubmitVisible={confirming}
        onCancelSubmit={() => {
          if (!busy) {
            setConfirming(false);
            setModalError(null);
          }
        }}
        onConfirmSubmit={handleConfirmSubmit}
        isSubmitting={busy}
        submitError={confirming ? modalError : null}
        selectedListing={selectedListing}
        selectedPoint={selectedPoint}
        startPrice={startPrice}
        step={step}
        auctionType={auctionType}
        minBidders={minBidders}
        buyNowPrice={buyNowPrice}
        dutchTopPrice={digits(dutchTop)}
        dutchIntervalSeconds={digits(dutchEvery)}
        depositAmount={deposit ?? (startPrice !== null ? auctionDepositFor(startPrice) : null)}
        withdrawTarget={withdrawTarget}
        onCancelWithdraw={() => {
          if (!busy) {
            setWithdrawTarget(null);
            setModalError(null);
          }
        }}
        onConfirmWithdraw={handleConfirmWithdraw}
        isWithdrawing={busy}
        withdrawError={withdrawTarget ? modalError : null}
        evidenceTarget={evidenceTarget}
        evidenceNote={evidenceTarget ? (evidenceMap[evidenceTarget.id] ?? "") : ""}
        onCancelEvidence={() => {
          if (!busy) {
            setEvidenceTarget(null);
            setModalError(null);
          }
        }}
        onConfirmEvidence={handleConfirmEvidence}
        isSubmittingEvidence={busy}
        evidenceSubmitError={evidenceTarget ? modalError : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  formStack: { gap: space.md },
  segmentedBar: {
    flexDirection: "row",
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentBtnActive: {
    backgroundColor: stitchTokens.wine,
  },
  segmentText: {
    fontSize: 13,
    color: stitchTokens.brownMuted,
    textAlign: "center",
  },
  segmentTextActive: {
    color: stitchTokens.gold,
  },
  footerDock: { gap: space.xs },
  footerErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerErrorText: {
    flex: 1,
    color: stitchTokens.flashRed,
    fontSize: 12,
    lineHeight: 16,
  },
});
