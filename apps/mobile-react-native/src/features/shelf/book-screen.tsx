import React, { useState } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../core/api/session-client";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  Button,
  ConfirmDialog,
  Notice,
  Screen,
  StatePanel,
  presentError,
  space,
} from "../../core/ui";
import { publicListing } from "./contracts";
import {
  BookDetailHeader,
  BookGallerySection,
  BookOverviewSection,
  BookSellerCard,
  BookInspectionReport,
  BookBottomBar,
} from "./book-detail-components";
import { BuyNowModal } from "../orders/buy-now-modal";
import { ordersPageSchema } from "../orders/contracts";
import { startPurchaseConversation } from "../conversations/purchase-conversation-service";

export function BookScreen({ id }: { id: string }) {
  const { client, state } = useSession();
  const active = useForeground();

  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [shownRevision, setShownRevision] = useState<string>();
  const [isScrolled, setIsScrolled] = useState(false);

  // Interactive dialog states
  const [buyDialogVisible, setBuyDialogVisible] = useState(false);
  const [exchangeDialogVisible, setExchangeDialogVisible] = useState(false);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    setIsScrolled(y > 60);
  };

  const isValidUuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);

  // Fetch listing details from backend API
  const listingQuery = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => client.publicRequest(`/listings/${id}`, publicListing),
    enabled: active && isValidUuid,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: active ? 30_000 : false,
  });

  // Query my orders to check if user has an active unpaid order for this listing
  const myOrdersQuery = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => client.request("/me/orders?limit=20", ordersPageSchema),
    enabled: active && state.status === "authenticated",
    staleTime: 5_000,
  });

  const activeOrder = myOrdersQuery.data?.items?.find(
    (order) =>
      order.listingId === id &&
      order.role === "Buyer" &&
      order.state === "AwaitingPayment",
  );

  // Reset selected photo when revision changes
  if (shownRevision !== listingQuery.data?.revisionId) {
    setShownRevision(listingQuery.data?.revisionId);
    setSelectedPhotoIndex(0);
  }


  const isNotFound =
    !isValidUuid ||
    (listingQuery.error instanceof ApiError && listingQuery.error.status === 404);

  const item = isNotFound ? undefined : listingQuery.data;
  const isOwner =
    state.status === "authenticated" && item?.seller?.id === state.user?.id;

  const [chatOpening, setChatOpening] = useState(false);
  const [chatError, setChatError] = useState<string>();

  const handleOpenChat = async () => {
    if (state.status !== "authenticated") {
      router.push({
        pathname: "/account",
        params: { returnBook: id },
      });
      return;
    }
    if (!item || chatOpening) return;
    setChatOpening(true);
    setChatError(undefined);
    try {
      const intent = item.mode === "Exchange" ? "Exchange" : "Negotiation";
      const receipt = await startPurchaseConversation(
        client,
        id,
        item.version,
        crypto.randomUUID(),
        intent,
      );
      router.push({
        pathname: "/conversation",
        params: { id: receipt.entityId },
      });
    } catch (e: any) {
      setChatError(
        e?.message ?? "Chưa mở được cuộc trò chuyện. Vui lòng thử lại sau.",
      );
    } finally {
      setChatOpening(false);
    }
  };

  const handleOpenBuy = () => {
    if (state.status !== "authenticated") {
      router.push({
        pathname: "/account",
        params: { returnBook: id },
      });
      return;
    }
    setBuyDialogVisible(true);
  };

  const handleOpenExchange = () => {
    if (state.status !== "authenticated") {
      router.push({
        pathname: "/account",
        params: { returnBook: id },
      });
      return;
    }
    router.push({
      pathname: "/exchange-compose",
      params: { book: id },
    });
  };

  if (isNotFound) {
    return (
      <Screen appearance="browse">
        <StatePanel
          title="Không tìm thấy sách"
          message="Bài đăng không còn hiển thị ở đường dẫn này. Hãy quay lại kệ sách để khám phá cuốn sách khác."
          action={{
            label: "Về kệ sách",
            onPress: () => router.replace("/"),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      appearance="detail"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      header={
        <BookDetailHeader
          listingId={id}
          bookTitle={item?.book?.title ?? "Chi tiết sách"}
          isScrolled={isScrolled}
        />
      }
      footer={
        item ? (
          <BookBottomBar
            item={item}
            onChatPress={handleOpenChat}
            onExchangePress={handleOpenExchange}
            onBuyPress={handleOpenBuy}
            isOwner={isOwner}
            hasActiveOrder={Boolean(activeOrder)}
            activeOrderState={activeOrder?.state}
          />
        ) : undefined
      }

    >
      {listingQuery.isPending && (
        <View style={{ paddingTop: 100 }}>
          <StatePanel loading title="Đang mở thông tin ấn bản sách…" />
        </View>
      )}

      {listingQuery.error && (
        <View style={[styles.errorContainer, { paddingTop: 90 }]}>
          <Notice tone="error">
            {item ? "Thông tin dưới đây chưa được cập nhật mới nhất. " : ""}
            {presentError(listingQuery.error).message}
          </Notice>
          <Button
            secondary
            title="Thử tải lại thông tin"
            busy={listingQuery.isFetching}
            onPress={() => void listingQuery.refetch()}
          />
        </View>
      )}

      {item && (
        <View style={{ width: "100%", paddingBottom: space.section }}>
          {/* 1. Full-bleed Edge-to-Edge Book Hero Gallery */}
          <BookGallerySection
            item={item}
            selectedIndex={selectedPhotoIndex}
            onSelectPhoto={setSelectedPhotoIndex}
            active={!listingQuery.isError}
          />

          {/* 2. Framed Inset Cards Container */}
          <View style={styles.framedContainer}>
            {/* Book Title, Authors & Unified Pricing Module */}
            <BookOverviewSection item={item} />

            {/* Condition Bento & Catalog Metadata */}
            <BookInspectionReport item={item} />

            {/* Verified Seller Card & TP.HCM Delivery */}
            <BookSellerCard
              sellerName={item.seller.displayName}
              sellerId={item.seller.id}
            />
          </View>
        </View>
      )}

      {/* Dialog: Báo lỗi mở chat */}
      <ConfirmDialog
        visible={Boolean(chatError)}
        title="Không thể mở cuộc trò chuyện"
        message={chatError ?? ""}
        confirmLabel="Đã hiểu"
        onCancel={() => setChatError(undefined)}
        onConfirm={() => setChatError(undefined)}
      />

      {/* Modal: Mua ngay / Xem đơn thanh toán bản sách */}
      <BuyNowModal
        visible={buyDialogVisible}
        listing={item}
        initialOrderId={activeOrder?.id}
        onClose={() => {
          setBuyDialogVisible(false);
          void listingQuery.refetch();
          void myOrdersQuery.refetch();
        }}
        onSuccess={() => {
          void listingQuery.refetch();
          void myOrdersQuery.refetch();
        }}
      />


      {/* Dialog: Đổi sách */}
      <ConfirmDialog
        visible={exchangeDialogVisible}
        title="Đề nghị đổi sách"
        message={`Gửi đề nghị trao đổi sách với ${item?.seller?.displayName}. Bạn có thể chọn bản sách từ kệ sách cá nhân của mình để so khớp giá trị.`}
        confirmLabel="Tiếp tục chọn sách"
        onCancel={() => setExchangeDialogVisible(false)}
        onConfirm={() => {
          setExchangeDialogVisible(false);
          router.push({
            pathname: "/exchange-compose",
            params: { book: id },
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  framedContainer: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
  },
  errorContainer: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    marginVertical: space.sm,
  },
});
