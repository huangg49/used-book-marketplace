import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Button, Icon, stitchTokens } from "../../../core/ui";
import { VOUCHERS_LIST, type CuratedVoucher } from "../home-mock-data";

export interface HomeVouchersModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function HomeVouchersModal({
  visible,
  onClose,
}: HomeVouchersModalProps) {
  const [collectedCodes, setCollectedCodes] = useState<Record<string, boolean>>(
    {},
  );

  const toggleCollect = (code: string) => {
    setCollectedCodes((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Đóng kho voucher"
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Icon name="ticket" size={22} color={stitchTokens.wine} />
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Kho Voucher Sưu Tầm
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeBtn}
            >
              <Icon name="close" size={20} color="#786B67" />
            </Pressable>
          </View>

          {/* Vouchers List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {VOUCHERS_LIST.map((voucher: CuratedVoucher) => {
              const isCollected = !!collectedCodes[voucher.code];
              return (
                <View key={voucher.id} style={styles.voucherCard}>
                  {/* Left coupon cutout */}
                  <View style={styles.cutoutLeft} />

                  <View style={styles.voucherBody}>
                    <View style={styles.voucherInfo}>
                      <View style={styles.codeRow}>
                        <AppText kind="small" style={styles.codeText}>
                          {voucher.code}
                        </AppText>
                        <AppText kind="small" style={styles.expiryText}>
                          {voucher.expiry}
                        </AppText>
                      </View>
                      <AppText kind="bold" style={styles.voucherTitle}>
                        {voucher.title}
                      </AppText>
                      <AppText kind="small" style={styles.voucherDesc}>
                        {voucher.description}
                      </AppText>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${isCollected ? "Đã lưu mã" : "Lưu mã"} ${voucher.code}`}
                      onPress={() => toggleCollect(voucher.code)}
                      style={[
                        styles.collectBtn,
                        isCollected ? styles.btnCollected : styles.btnActive,
                      ]}
                    >
                      <AppText
                        kind="small"
                        style={[
                          styles.collectBtnText,
                          isCollected
                            ? styles.btnTextCollected
                            : styles.btnTextActive,
                        ]}
                      >
                        {isCollected ? "Đã lưu" : "Lưu mã"}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom Button */}
          <View style={styles.bottomArea}>
            <Button title="Hoàn tất" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(30, 20, 18, 0.55)",
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: "#FAF7F2",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "80%",
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#EAE5DC",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  voucherCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E6E0D5",
    overflow: "hidden",
    position: "relative",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cutoutLeft: {
    width: 6,
    backgroundColor: stitchTokens.wine,
  },
  voucherBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 10,
  },
  voucherInfo: {
    flex: 1,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  codeText: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wine,
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  expiryText: {
    fontSize: 10,
    color: "#9C908C",
  },
  voucherTitle: {
    fontSize: 13,
    color: "#271813",
    lineHeight: 18,
  },
  voucherDesc: {
    fontSize: 11,
    color: "#786B67",
    marginTop: 2,
    lineHeight: 15,
  },
  collectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: stitchTokens.wine,
  },
  btnCollected: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  collectBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  btnTextActive: {
    color: "#FFFFFF",
  },
  btnTextCollected: {
    color: "#2E7D32",
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
