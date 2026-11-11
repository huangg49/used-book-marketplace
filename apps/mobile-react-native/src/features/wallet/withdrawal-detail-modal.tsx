import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  withdrawalSchema,
  withdrawalProofReadSchema,
  withdrawalLabels,
  withdrawalReasons,
  type Withdrawal,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppModal,
  AppText,
  Button,
  formatVnd,
  space,
  stitchTokens,
  colors,
} from "../../core/ui";
import { walletDate } from "./wallet-model";

export type WithdrawalDetailModalProps = {
  withdrawalId: string | null;
  initialData?: Withdrawal | null;
  onClose: () => void;
};

const FINAL_STATES = ["Completed", "Rejected", "Refunded"];

export function WithdrawalDetailModal({
  withdrawalId,
  initialData,
  onClose,
}: WithdrawalDetailModalProps) {
  const { client, state: sessionState } = useSession();
  const userId = sessionState.status === "authenticated" ? sessionState.user.id : null;

  const validId =
    withdrawalId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(withdrawalId)
      ? withdrawalId
      : undefined;

  const detail = useQuery({
    queryKey: ["withdrawal", userId, validId],
    queryFn: () => client.request(`/me/withdrawals/${validId}`, withdrawalSchema),
    enabled: Boolean(validId && userId),
    initialData: initialData && initialData.id === validId ? initialData : undefined,
    refetchInterval: (q) =>
      !FINAL_STATES.includes(q.state.data?.state ?? "") ? 5000 : false,
  });

  const row = detail.data;

  const proof = useQuery({
    queryKey: ["withdrawal-proof", userId, row?.id, row?.proofId],
    queryFn: () =>
      client.request(
        `/me/withdrawals/${row!.id}/proof/${row!.proofId}/read`,
        withdrawalProofReadSchema,
      ),
    enabled: Boolean(userId && row?.id && row?.proofId),
    staleTime: 60_000,
  });

  return (
    <AppModal
      visible={Boolean(withdrawalId)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ gap: 2, flex: 1 }}>
              <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 18 }}>
                Chi tiết rút tiền
              </AppText>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                Theo dõi tiến độ và chứng từ chuyển khoản
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <AppText kind="bold" color={stitchTokens.subtleGray}>✕</AppText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {detail.isPending && !row ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={stitchTokens.wine} />
                <AppText color={stitchTokens.subtleGray}>Đang tải thông tin đơn rút tiền…</AppText>
              </View>
            ) : null}

            {detail.isError && !row ? (
              <View style={styles.errorBox}>
                <AppText kind="bold" color={colors.error}>
                  Chưa tải được chi tiết đơn rút tiền
                </AppText>
                <AppText kind="small" color={stitchTokens.subtleGray}>
                  Yêu cầu không tồn tại hoặc bạn không có quyền xem.
                </AppText>
                <Button secondary title="Thử lại" onPress={() => void detail.refetch()} />
              </View>
            ) : null}

            {row ? (
              <View style={{ gap: space.md }}>
                {/* Amount and Status Card */}
                <View style={styles.amountCard}>
                  <View style={styles.amountRow}>
                    <View style={{ gap: 2 }}>
                      <AppText kind="small" color={stitchTokens.subtleGray}>
                        Số tiền rút
                      </AppText>
                      <AppText kind="price" color={stitchTokens.wine} style={{ fontSize: 26 }}>
                        {formatVnd(row.amount)}
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        row.state === "Completed"
                          ? styles.statusSuccess
                          : ["Rejected", "FailedVerified"].includes(row.state)
                            ? styles.statusDanger
                            : styles.statusPending,
                      ]}
                    >
                      <AppText
                        kind="small"
                        color={
                          row.state === "Completed"
                            ? stitchTokens.likeNewGreen
                            : ["Rejected", "FailedVerified"].includes(row.state)
                              ? colors.error
                              : stitchTokens.wineDark
                        }
                      >
                        {withdrawalLabels[row.state]}
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <AppText kind="small" color={stitchTokens.subtleGray}>
                      Phí rút tiền
                    </AppText>
                    <AppText kind="bold" color={stitchTokens.likeNewGreen}>
                      0đ (Miễn phí)
                    </AppText>
                  </View>
                  <View style={styles.infoRow}>
                    <AppText kind="small" color={stitchTokens.subtleGray}>
                      Mã đơn
                    </AppText>
                    <AppText kind="small" color={stitchTokens.wineDark} selectable>
                      #RÚT-{row.id.slice(0, 8).toUpperCase()}
                    </AppText>
                  </View>
                </View>

                {row.state === "Requested" ? (
                  <View style={styles.noticeBox}>
                    <AppText kind="small" color={stitchTokens.wineDark}>
                      Yêu cầu sẽ được xử lý trong dưới 24 giờ. Tiền đang được giữ chờ duyệt.
                    </AppText>
                  </View>
                ) : null}

                {/* Recipient Card */}
                <View style={styles.sectionCard}>
                  <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
                    Thông tin nhận tiền
                  </AppText>
                  <View style={styles.infoRow}>
                    <AppText color={stitchTokens.subtleGray}>Ngân hàng</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {row.recipient.bankName}
                    </AppText>
                  </View>
                  <View style={styles.infoRow}>
                    <AppText color={stitchTokens.subtleGray}>Số tài khoản</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark} selectable>
                      {row.recipient.accountNumber}
                    </AppText>
                  </View>
                  <View style={styles.infoRow}>
                    <AppText color={stitchTokens.subtleGray}>Chủ tài khoản</AppText>
                    <AppText kind="bold" color={stitchTokens.wineDark}>
                      {row.recipient.accountHolder}
                    </AppText>
                  </View>
                  <View style={styles.infoRow}>
                    <AppText color={stitchTokens.subtleGray}>Lý do rút</AppText>
                    <AppText color={stitchTokens.wineDark} style={{ flexShrink: 1, textAlign: "right" }}>
                      {withdrawalReasons[row.reason]}
                      {row.reasonDetail ? ` · ${row.reasonDetail}` : ""}
                    </AppText>
                  </View>
                </View>

                {/* Transfer Proof Card (if proofId exists) */}
                {row.proofId ? (
                  <View style={styles.sectionCard}>
                    <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
                      Chứng từ chuyển khoản
                    </AppText>
                    {proof.isPending ? (
                      <View style={{ padding: space.md, alignItems: "center", gap: 6 }}>
                        <ActivityIndicator size="small" color={stitchTokens.wine} />
                        <AppText kind="small" color={stitchTokens.subtleGray}>
                          Đang tải ảnh chứng từ…
                        </AppText>
                      </View>
                    ) : null}

                    {proof.isError ? (
                      <View style={{ padding: space.sm, gap: space.xs }}>
                        <AppText kind="small" color={colors.error}>
                          Chưa tải được ảnh chứng từ. Vui lòng thử lại sau.
                        </AppText>
                        <Button secondary title="Tải lại ảnh" onPress={() => void proof.refetch()} />
                      </View>
                    ) : null}

                    {proof.data ? (
                      <View style={{ gap: space.xs }}>
                        <View style={styles.imageWrapper}>
                          <Image
                            source={{ uri: proof.data.url }}
                            style={{
                              width: "100%",
                              aspectRatio:
                                proof.data.width && proof.data.height
                                  ? proof.data.width / proof.data.height
                                  : 4 / 3,
                              maxHeight: 340,
                              borderRadius: 12,
                              backgroundColor: stitchTokens.white,
                            }}
                            resizeMode="contain"
                          />
                        </View>
                        <Button
                          secondary
                          title="Mở ảnh kích thước đầy đủ ↗"
                          onPress={() => void Linking.openURL(proof.data.url)}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Processing Timeline */}
                <View style={styles.sectionCard}>
                  <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
                    Tiến độ xử lý
                  </AppText>
                  <View style={{ gap: space.sm, paddingTop: 4 }}>
                    {row.history.map((h, i) => {
                      const isLatest = i === row.history.length - 1;
                      return (
                        <View key={i} style={styles.timelineRow}>
                          <View style={styles.timelineMarkerCol}>
                            <View
                              style={[
                                styles.timelineDot,
                                isLatest ? styles.timelineDotActive : null,
                              ]}
                            />
                            {i < row.history.length - 1 ? (
                              <View style={styles.timelineLine} />
                            ) : null}
                          </View>
                          <View style={{ gap: 2, flex: 1, paddingBottom: space.xs }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 4 }}>
                              <AppText
                                kind="bold"
                                color={isLatest ? stitchTokens.wineDark : stitchTokens.subtleGray}
                              >
                                {withdrawalLabels[h.state]}
                              </AppText>
                              <AppText kind="small" color={stitchTokens.subtleGray}>
                                {walletDate(h.at)}
                              </AppText>
                            </View>
                            {h.note ? (
                              <AppText kind="small" color={stitchTokens.subtleGray}>
                                {h.note}
                              </AppText>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: stitchTokens.modalScrimDark,
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: stitchTokens.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: stitchTokens.peachBorder,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  closeBtn: {
    padding: space.xs,
  },
  content: {
    padding: space.lg,
    gap: space.md,
  },
  loadingBox: {
    padding: space.xl,
    alignItems: "center",
    gap: space.sm,
  },
  errorBox: {
    padding: space.lg,
    backgroundColor: stitchTokens.goldLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    gap: space.sm,
  },
  amountCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusSuccess: {
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  statusPending: {
    backgroundColor: stitchTokens.parchment,
  },
  statusDanger: {
    backgroundColor: stitchTokens.goldLight,
  },
  divider: {
    height: 1,
    backgroundColor: stitchTokens.peachBorder,
    marginVertical: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  noticeBox: {
    backgroundColor: stitchTokens.goldLight,
    padding: space.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  sectionCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  imageWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.white,
    alignItems: "center",
  },
  timelineRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  timelineMarkerCol: {
    alignItems: "center",
    width: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: stitchTokens.peachBorder,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: stitchTokens.wine,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: stitchTokens.peachBorder,
    marginVertical: 2,
  },
});
