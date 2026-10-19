import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import { AppText } from "../../core/ui/text";
import { Icon } from "../../core/ui/icon";
import { Screen } from "../../core/ui/screen";
import { stitchTokens } from "../../core/ui/theme";
import { MemberNavigation } from "../navigation/member-navigation";
import {
  draftPage,
  emptyContent,
  privateDraft,
  receipt,
} from "../drafts/contracts";
import { DraftEditor } from "../drafts/draft-editor";
import { BackAction, Button, StatePanel } from "../../core/ui";
import {
  auctionErrorText,
  auctionEligible,
  intakePriceErrors,
  outcomeUnknown,
  EVIDENCE_MIN_LENGTH,
} from "./auctions-model";
import {
  handoverPoints,
  intakeReceipt,
  myIntake,
  myIntakes,
  type MyIntake,
} from "./contracts";
import {
  SendToAuctionHeader,
  SendToAuctionPolicy,
  SendToAuctionNotices,
  SendToAuctionBookPicker,
  SendToAuctionPointPicker,
  SendToAuctionPricing,
  SendToAuctionActiveIntakes,
  SendToAuctionModals,
} from "./send-to-auction-components";

type PendingCommand = {
  kind: "create" | "withdraw" | "evidence";
  path: string;
  body: string;
  key: string;
};

const digits = (text: string) => Number(text.replace(/\D/g, "")) || null;

export function SendToAuctionScreen({ userId }: { userId: string }) {
  const { client } = useSession();
  const foreground = useForeground();
  const queryClient = useQueryClient();

  // 1. Real Queries. ADR 0041: auctions use the seller's own Auction listings,
  // never marketplace listings.
  const listings = useQuery({
    queryKey: ["my-listings", userId, "auction"],
    queryFn: () =>
      client.request("/me/listings?channel=Auction&limit=50", draftPage),
    enabled: foreground,
    staleTime: 0,
  });

  // Creating or continuing an auction listing happens in the shared editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);
  const editing = useQuery({
    queryKey: ["draft", editingId],
    queryFn: () => client.request(`/me/listings/${editingId}`, privateDraft),
    enabled: !!editingId,
    refetchOnWindowFocus: false,
  });
  const createListing = useMutation({
    mutationFn: () => {
      // One key per intent; a retry after an unknown outcome reuses it.
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
    enabled: foreground,
  });

  const auctionListings = listings.data?.items ?? [];
  const eligibleListings = auctionListings.filter(auctionEligible);
  const unfinishedListings = auctionListings.filter(
    (l) =>
      ["Draft", "PendingReview", "Rejected"].includes(l.state.moderation) &&
      l.state.visibility !== "Removed" &&
      !l.state.deletedAt,
  );
  const openPoints = points.data?.items ?? [];

  // 2. Form states
  const [listingId, setListingId] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [step, setStep] = useState<10000 | 50000>(10000);
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [buyNow, setBuyNow] = useState("");
  const [touched, setTouched] = useState(false);

  // 3. Modal & Action states
  const [confirming, setConfirming] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<MyIntake | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyIntake | null>(null);

  // Evidence submission state
  const [evidenceMap, setEvidenceMap] = useState<Record<string, string>>({});
  const [evidenceTarget, setEvidenceTarget] = useState<MyIntake | null>(null);
  const [evidenceError, setEvidenceError] = useState<{ id: string; text: string } | null>(null);

  // Selected entities & derived errors
  const selectedListing = eligibleListings.find((l) => l.id === listingId);
  const selectedPoint = openPoints.find((p) => p.id === pointId);
  const startPrice = digits(start);
  const buyNowPrice = buyNowOn ? digits(buyNow) : null;
  const priceErrors = intakePriceErrors(startPrice, step, buyNowOn ? buyNowPrice ?? 0 : null);

  const formError = !selectedListing
    ? "Vui lòng chọn một sách đấu giá đã được duyệt."
    : !selectedPoint || selectedPoint.availableSlots < 1 || selectedPoint.status !== "Active"
      ? "Vui lòng chọn trạm tiếp nhận còn chỗ tại TP.HCM."
      : priceErrors.startPrice ?? priceErrors.buyNowPrice ?? null;

  const locked = busy || Boolean(pending);

  // 4. API Mutation Command Executor
  const executeCommand = async (command: PendingCommand) => {
    setBusy(true);
    setError(null);
    try {
      const receipt = await client.request(command.path, intakeReceipt, {
        method: "POST",
        body: command.body,
        headers: { "Idempotency-Key": command.key },
      });
      setPending(null);

      if (command.kind === "create") {
        const newlyCreated = await client.request(
          `/me/auction-intakes/${receipt.intakeId}`,
          myIntake,
        );
        setCreated(newlyCreated);
        setListingId(null);
        setStart("");
        setBuyNow("");
        setBuyNowOn(false);
        setTouched(false);
      }
    } catch (caught) {
      setPending(outcomeUnknown(caught) ? command : null);
      setError(auctionErrorText(caught));
    } finally {
      setBusy(false);
      setConfirming(false);
      setWithdrawTarget(null);
      setEvidenceTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["my-auction-intakes", userId] });
      void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
      void queryClient.invalidateQueries({ queryKey: ["handover-points"] });
    }
  };

  const handleStartSubmit = () => {
    setTouched(true);
    setCreated(null);
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
        buyNowPrice,
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
    setEvidenceTarget(item);
  };

  const handleConfirmEvidence = () => {
    if (!evidenceTarget) return;
    const note = (evidenceMap[evidenceTarget.id] ?? "").trim();
    void executeCommand({
      kind: "evidence",
      path: `/me/auction-intakes/${evidenceTarget.id}/evidence`,
      key: Crypto.randomUUID(),
      body: JSON.stringify({
        expectedVersion: evidenceTarget.version,
        note,
      }),
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    void queryClient.invalidateQueries({ queryKey: ["my-listings", userId] });
    void queryClient.removeQueries({ queryKey: ["draft", editingId] });
  };

  if (editingId && editing.data)
    return (
      <DraftEditor key={editingId} initial={editing.data} onBack={closeEditor} />
    );

  if (editingId)
    return (
      <Screen>
        <BackAction title="Về gửi đấu giá" onPress={closeEditor} />
        <StatePanel
          loading={editing.isPending}
          title={
            editing.error ? "Chưa mở được sách đấu giá" : "Đang mở sách đấu giá"
          }
          action={
            editing.error
              ? { label: "Thử lại", onPress: () => void editing.refetch() }
              : undefined
          }
        />
        {editing.error ? (
          <Button title="Về gửi đấu giá" wine secondary onPress={closeEditor} />
        ) : null}
      </Screen>
    );

  return (
    <Screen
      appearance="home"
      footer={<MemberNavigation current="/auctions" />}
      footerAppearance="navigation"
    >
      {/* 1. Header with back and title */}
      <SendToAuctionHeader
        onBack={() => router.replace("/auctions")}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 2. Top Policy Banner */}
        <SendToAuctionPolicy />

        {/* 3. Status Notices (Success & Error & Retry) */}
        <SendToAuctionNotices
          created={created}
          error={error}
          onDismissError={() => setError(null)}
          onRetryPending={() => pending && void executeCommand(pending)}
          hasPending={Boolean(pending)}
          isBusy={busy}
        />

        {/* 4. Section 1: Book Picker */}
        <SendToAuctionBookPicker
          eligibleListings={eligibleListings}
          unfinishedListings={unfinishedListings}
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

        {/* 5. Section 2: Handover Point Picker */}
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

        {/* 6. Section 3: Pricing Settings */}
        <SendToAuctionPricing
          step={step}
          onSelectStep={setStep}
          startPriceText={start}
          onChangeStartPriceText={setStart}
          startPriceError={touched ? priceErrors.startPrice : undefined}
          buyNowOn={buyNowOn}
          onToggleBuyNow={setBuyNowOn}
          buyNowPriceText={buyNow}
          onChangeBuyNowPriceText={setBuyNow}
          buyNowPriceError={touched ? priceErrors.buyNowPrice : undefined}
          disabled={locked}
        />

        {/* Form Validation Alert */}
        {touched && Boolean(formError) && (
          <View style={styles.formErrorNotice}>
            <Icon name="info" size={16} color={stitchTokens.flashRed} />
            <AppText kind="small" style={styles.formErrorNoticeText}>
              {formError}
            </AppText>
          </View>
        )}

        {/* 7. Primary Action Button */}
        <View style={styles.actionButtonContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem lại và gửi sách đấu giá"
            disabled={locked}
            onPress={handleStartSubmit}
            style={({ pressed }) => [
              styles.primarySubmitBtn,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              locked && { opacity: 0.6 },
            ]}
          >
            <Icon name="gavel" size={18} color={stitchTokens.gold} />
            <AppText kind="bold" style={styles.primarySubmitBtnText}>
              Xem lại và gửi sách đấu giá
            </AppText>
          </Pressable>

          <AppText style={styles.legalDisclaimerText}>
            Bằng việc gửi sách, bạn đồng ý với Quy chế ký gửi & thẩm định của Lật Lại
          </AppText>
        </View>

        {/* 8. Section 4: Active Consignments Tracking */}
        <SendToAuctionActiveIntakes
          intakes={intakes.data?.items ?? []}
          isLoading={intakes.isPending}
          onWithdraw={(item) => setWithdrawTarget(item)}
          onSubmitEvidence={handleRequestSubmitEvidence}
          evidenceTextMap={evidenceMap}
          onChangeEvidenceText={(id, text) =>
            setEvidenceMap((prev) => ({ ...prev, [id]: text }))
          }
          evidenceError={evidenceError}
          disabled={locked}
        />
      </ScrollView>

      {/* Confirmation & Cancel Modals */}
      <SendToAuctionModals
        confirmSubmitVisible={confirming}
        onCancelSubmit={() => !busy && setConfirming(false)}
        onConfirmSubmit={handleConfirmSubmit}
        isSubmitting={busy}
        selectedListing={selectedListing}
        selectedPoint={selectedPoint}
        startPrice={startPrice}
        step={step}
        buyNowPrice={buyNowPrice}
        withdrawTarget={withdrawTarget}
        onCancelWithdraw={() => !busy && setWithdrawTarget(null)}
        onConfirmWithdraw={handleConfirmWithdraw}
        isWithdrawing={busy}
        evidenceTarget={evidenceTarget}
        onCancelEvidence={() => !busy && setEvidenceTarget(null)}
        onConfirmEvidence={handleConfirmEvidence}
        isSubmittingEvidence={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 18,
  },
  formErrorNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.flashRedBg,
    borderWidth: 1,
    borderColor: stitchTokens.errorLightBorder,
    borderRadius: 10,
    padding: 12,
  },
  formErrorNoticeText: {
    flex: 1,
    color: stitchTokens.flashRed,
    fontSize: 12,
    lineHeight: 16,
  },
  actionButtonContainer: {
    gap: 8,
    paddingTop: 2,
  },
  primarySubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: stitchTokens.wineDark, // #4A1010
    height: 52,
    borderRadius: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primarySubmitBtnText: {
    fontSize: 15,
    color: stitchTokens.white,
  },
  legalDisclaimerText: {
    fontSize: 11,
    color: stitchTokens.subtleGray,
    textAlign: "center",
    lineHeight: 15,
  },
});
