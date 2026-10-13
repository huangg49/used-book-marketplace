import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { Button, Icon, formatVnd, stitchTokens } from "../../../core/ui";
import { FALLBACK_FLASH_DEALS } from "../home-mock-data";

export interface HomeCartModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onOpenBook: (bookId: string) => void;
}

export function HomeCartModal({
  visible,
  onClose,
  onOpenBook,
}: HomeCartModalProps) {
  const [items, setItems] = useState(() => FALLBACK_FLASH_DEALS.slice(0, 2));

  const total = items.reduce((acc, curr) => acc + curr.price, 0);

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
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
          accessibilityLabel="Đóng giỏ sách"
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Icon name="bag" size={22} color={stitchTokens.wine} />
              <AppText kind="bookHeading" style={styles.headerTitle}>
                Giỏ Sách Đang Chọn ({items.length})
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

          {/* Items */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="book" size={36} color="#A89C98" />
                <AppText kind="bold" style={styles.emptyTitle}>
                  Giỏ sách đang trống
                </AppText>
                <AppText kind="small" style={styles.emptySub}>
                  Hãy chọn các cuốn sách yêu thích từ trang chủ để thêm vào giỏ.
                </AppText>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.cartCard}>
                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenBook(item.id);
                    }}
                    style={styles.coverBox}
                  >
                    <Image
                      source={{ uri: item.coverUrl }}
                      style={styles.coverImg}
                      resizeMode="cover"
                    />
                  </Pressable>

                  <View style={styles.cardDetails}>
                    <Pressable
                      onPress={() => {
                        onClose();
                        onOpenBook(item.id);
                      }}
                    >
                      <AppText kind="bold" style={styles.bookTitle} numberOfLines={2}>
                        {item.title}
                      </AppText>
                      <AppText kind="small" style={styles.authorText}>
                        {item.author}
                      </AppText>
                    </Pressable>

                    <View style={styles.priceRow}>
                      <AppText kind="shelfPrice" style={styles.priceText}>
                        {formatVnd(item.price)}
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Xóa ${item.title}`}
                        onPress={() => handleRemove(item.id)}
                        hitSlop={6}
                      >
                        <AppText kind="small" style={styles.removeText}>
                          Xóa
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Bottom Checkout Action */}
          {items.length > 0 ? (
            <View style={styles.bottomArea}>
              <View style={styles.totalRow}>
                <AppText kind="small" style={styles.totalLabel}>
                  Tạm tính:
                </AppText>
                <AppText kind="shelfPrice" style={styles.totalAmount}>
                  {formatVnd(total)}
                </AppText>
              </View>
              <Button
                title="Tiến hành nhận sách tại TP.HCM"
                onPress={() => {
                  onClose();
                  onOpenBook(items[0].id);
                }}
              />
            </View>
          ) : null}
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
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    color: "#4A3F3B",
  },
  emptySub: {
    fontSize: 12,
    color: "#8C807C",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  cartCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EBE6DE",
    padding: 10,
    gap: 12,
  },
  coverBox: {
    width: 60,
    height: 80,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#F5F2EC",
  },
  coverImg: {
    width: "100%",
    height: "100%",
  },
  cardDetails: {
    flex: 1,
    justifyContent: "space-between",
  },
  bookTitle: {
    fontSize: 12,
    color: "#271813",
    lineHeight: 16,
  },
  authorText: {
    fontSize: 11,
    color: "#8C807C",
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  priceText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  removeText: {
    fontSize: 11,
    color: "#D32F2F",
    fontWeight: "600",
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "#EAE5DC",
    gap: 10,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 13,
    color: "#4A3F3B",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wine,
    fontFamily: "BeBold",
  },
});
