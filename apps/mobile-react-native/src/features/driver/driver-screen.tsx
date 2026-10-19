/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { router } from 'expo-router';

export interface ShipmentOrderData {
  exchangeId: string;
  trackingCode: string;
  carrierCode: string;
  carrierName: string;
  status: string;
  sender: {
    name: string;
    phone: string;
    detail: string;
  };
  receiver: {
    name: string;
    phone: string;
    detail: string;
  };
  itemsSummary: string;
  fee: number;
  readyForPickup?: boolean;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

export function DriverScreen() {
  const defaultApiUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    (Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1');

  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<ShipmentOrderData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [lastAction, setLastAction] = useState<string>('');

  const fetchActiveOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/shipments/carrier/orders/active`);
      if (!res.ok) {
        throw new Error(`Lỗi kết nối API (${res.status})`);
      }
      const data = (await res.json()) as ShipmentOrderData | null;
      setOrder(data);
      if (data?.deliveredAt) {
        setCurrentStep(4);
        setLastAction('Giao thành công');
      } else if (data?.shippedAt) {
        setCurrentStep(2);
        setLastAction('Đã tiếp nhận hàng');
      }
    } catch (err: unknown) {
      console.warn('Lỗi tải đơn hàng vận chuyển:', err);
      Alert.alert(
        'Lưu ý kết nối',
        `Không thể kết nối đến máy chủ backend tại: ${apiUrl}.\nNếu bạn đang dùng điện thoại thật, hãy bấm "Cấu hình IP" để nhập IP máy tính của bạn (ví dụ: http://192.168.1.x:3000/api/v1).`,
      );
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void fetchActiveOrder();
  }, [fetchActiveOrder]);

  const handleUpdateStatus = async (
    stepNumber: number,
    status: 'PICKING' | 'IN_TRANSIT' | 'DELIVERED',
    description: string,
    actionLabel: string,
  ) => {
    if (!order) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/webhooks/carrier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          OrderCode: order.trackingCode,
          Status: status,
          Description: description,
        }),
      });

      if (!res.ok) {
        throw new Error(`Cập nhật trạng thái thất bại (${res.status})`);
      }

      setCurrentStep(stepNumber);
      setLastAction(actionLabel);

      if (stepNumber === 4) {
        Alert.alert(
          '🎉 Giao hàng thành công!',
          `Đã bắn Webhook DELIVERED cho mã vận đơn ${order.trackingCode}!\nMàn hình web của người mua/người bán trên máy tính đã tự động chuyển sang bước "ĐÃ NHẬN SÁCH" & đếm ngược 48h kiểm tra hàng.`,
          [{ text: 'Đồng ý' }],
        );
      } else {
        Alert.alert('Thành công', `✓ ${actionLabel}!\nHành trình đơn hàng trên web đã được cập nhật.`);
      }

      void fetchActiveOrder();
    } catch (err: unknown) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Driver Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>LẬT LẠI EXPRESS 🚚</Text>
          <Text style={styles.driverName}>Bưu tá: Lê Hoàng Nam (#DX-5571)</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => void fetchActiveOrder()}
          disabled={loading || submitting}
        >
          <Text style={styles.refreshBtnText}>{loading ? '...' : '🔄 Làm mới'}</Text>
        </TouchableOpacity>
      </View>

      {/* Connection IP config toggle for physical phone demo */}
      <TouchableOpacity
        style={styles.configToggle}
        onPress={() => setShowConfig(!showConfig)}
      >
        <Text style={styles.configToggleText}>
          ⚙️ Máy chủ: {apiUrl} ({showConfig ? 'Thu gọn' : 'Đổi IP'})
        </Text>
      </TouchableOpacity>

      {showConfig && (
        <View style={styles.configBox}>
          <Text style={styles.configLabel}>Địa chỉ API Backend (máy tính):</Text>
          <TextInput
            style={styles.configInput}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://192.168.1.x:3000/api/v1"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.configSaveBtn}
            onPress={() => {
              setShowConfig(false);
              void fetchActiveOrder();
            }}
          >
            <Text style={styles.configSaveBtnText}>Lưu & Tải lại dữ liệu</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Đang lấy đơn hàng thật từ Database...</Text>
        </View>
      ) : order ? (
        <>
          {/* Main Shipment Card */}
          <View style={styles.orderCard}>
            <View style={styles.orderHeaderRow}>
              <View>
                <Text style={styles.trackingLabel}>MÃ VẬN ĐƠN (GHN)</Text>
                <Text style={styles.trackingCode}>{order.trackingCode}</Text>
              </View>
              <View style={styles.feeBadge}>
                <Text style={styles.feeText}>{order.fee.toLocaleString('vi-VN')} đ</Text>
                <Text style={styles.feeSub}>Cước vận chuyển</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.itemRow}>
              <Text style={styles.itemIcon}>📚</Text>
              <Text style={styles.itemSummary}>{order.itemsSummary}</Text>
            </View>

            {/* Route Stops */}
            <View style={styles.routeContainer}>
              {/* Pickup Point */}
              <View style={styles.stopRow}>
                <View style={[styles.stopDot, { backgroundColor: '#3b82f6' }]} />
                <View style={styles.stopDetails}>
                  <Text style={styles.stopType}>ĐIỂM LẤY SÁCH (NGƯỜI GỬI)</Text>
                  <Text style={styles.personName}>
                    {order.sender.name} · {order.sender.phone}
                  </Text>
                  <Text style={styles.addressText}>{order.sender.detail}</Text>
                </View>
              </View>

              <View style={styles.routeLine} />

              {/* Delivery Point */}
              <View style={styles.stopRow}>
                <View style={[styles.stopDot, { backgroundColor: '#10b981' }]} />
                <View style={styles.stopDetails}>
                  <Text style={styles.stopType}>ĐIỂM GIAO SÁCH (NGƯỜI NHẬN)</Text>
                  <Text style={styles.personName}>
                    {order.receiver.name} · {order.receiver.phone}
                  </Text>
                  <Text style={styles.addressText}>{order.receiver.detail}</Text>
                </View>
              </View>
            </View>

            {lastAction ? (
              <View style={styles.lastActionBox}>
                <Text style={styles.lastActionText}>
                  Trạng thái hiện tại: <Text style={styles.lastActionBold}>{lastAction}</Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Waiting for partner banner */}
          {order.readyForPickup === false ? (
            <View
              style={{
                backgroundColor: '#fffbeb',
                borderColor: '#fde68a',
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 22 }}>⏳</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 13 }}>
                  Quy tắc nghiệp vụ 2 chiều (BA Rule):
                </Text>
                <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
                  Đang chờ đối tác hoàn tất tạo đơn vận chuyển. Khi cả 2 bên cùng tạo đơn thành công, bưu tá mới được phép đến lấy sách để đảm bảo an toàn.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Action Buttons */}
          <Text style={styles.sectionTitle}>THAO TÁC BƯU TÁ (ĐIỀU HÀNH THỰC TẾ)</Text>

          <View style={styles.actionGrid}>
            {/* Step 1 */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                currentStep >= 1 ? styles.actionBtnActive : styles.actionBtnNormal,
              ]}
              disabled={submitting || order.readyForPickup === false}
              onPress={() =>
                void handleUpdateStatus(
                  1,
                  'PICKING',
                  `Bưu tá Lê Hoàng Nam đã có mặt và lấy sách tại ${order.sender.detail}`,
                  'Bưu tá đã lấy hàng',
                )
              }
            >
              <Text style={styles.actionBtnIcon}>📦</Text>
              <View style={styles.actionBtnContent}>
                <Text style={styles.actionBtnTitle}>1. Bưu tá đã lấy hàng</Text>
                <Text style={styles.actionBtnDesc}>Xác nhận đã nhận kiện sách từ người gửi</Text>
              </View>
              {currentStep >= 1 && <Text style={styles.checkIcon}>✓</Text>}
            </TouchableOpacity>

            {/* Step 2 */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                currentStep >= 2 ? styles.actionBtnActive : styles.actionBtnNormal,
              ]}
              disabled={submitting || order.readyForPickup === false}
              onPress={() =>
                void handleUpdateStatus(
                  2,
                  'IN_TRANSIT',
                  'Bưu phẩm đã nhập kho bưu cục trung chuyển Tân Bình - TP.HCM',
                  'Nhập kho trung chuyển Hub',
                )
              }
            >
              <Text style={styles.actionBtnIcon}>🚚</Text>
              <View style={styles.actionBtnContent}>
                <Text style={styles.actionBtnTitle}>2. Nhập kho trung chuyển</Text>
                <Text style={styles.actionBtnDesc}>Cập nhật kiện hàng đã về kho tổng TP.HCM</Text>
              </View>
              {currentStep >= 2 && <Text style={styles.checkIcon}>✓</Text>}
            </TouchableOpacity>

            {/* Step 3 */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                currentStep >= 3 ? styles.actionBtnActive : styles.actionBtnNormal,
              ]}
              disabled={submitting || order.readyForPickup === false}
              onPress={() =>
                void handleUpdateStatus(
                  3,
                  'IN_TRANSIT',
                  `Bưu tá đang trên đường giao sách đến ${order.receiver.detail}`,
                  'Bưu tá đang đi giao',
                )
              }
            >
              <Text style={styles.actionBtnIcon}>🛵</Text>
              <View style={styles.actionBtnContent}>
                <Text style={styles.actionBtnTitle}>3. Bưu tá đang đi giao</Text>
                <Text style={styles.actionBtnDesc}>Bắt đầu chuyến phát tới tay người nhận</Text>
              </View>
              {currentStep >= 3 && <Text style={styles.checkIcon}>✓</Text>}
            </TouchableOpacity>

            {/* Step 4: Final Trigger */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnFinish]}
              disabled={submitting || order.readyForPickup === false}
              onPress={() =>
                void handleUpdateStatus(
                  4,
                  'DELIVERED',
                  `Giao hàng tận tay cho ${order.receiver.name} thành công. Kèm chữ ký và biên bản bàn giao.`,
                  'Giao thành công & Ký nhận POD',
                )
              }
            >
              <Text style={styles.actionBtnIcon}>📸</Text>
              <View style={styles.actionBtnContent}>
                <Text style={styles.actionBtnTitleWhite}>
                  4. GIAO THÀNH CÔNG (BẮN WEBHOOK)
                </Text>
                <Text style={styles.actionBtnDescWhite}>
                  Tự động chuyển sàn sang bước Nghiệm thu 48h!
                </Text>
              </View>
              {currentStep >= 4 && <Text style={styles.checkIconWhite}>✓</Text>}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>Chưa có đơn hàng nào cần giao</Text>
          <Text style={styles.emptyDesc}>
            Hãy vào sàn Lật Lại bấm "Tạo đơn vận chuyển" để tạo đơn vận chuyển thật trước.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void fetchActiveOrder()}
          >
            <Text style={styles.retryBtnText}>Thử tải lại đơn</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Back to App Link */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.backBtnText}>← Quay lại Trang chủ Lật Lại</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f97316',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  refreshBtnText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  configToggle: {
    paddingVertical: 6,
    marginBottom: 12,
  },
  configToggleText: {
    fontSize: 12,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  configBox: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  configLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    marginBottom: 6,
  },
  configInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#475569',
    marginBottom: 8,
  },
  configSaveBtn: {
    backgroundColor: '#f97316',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  configSaveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  orderCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f97316',
    letterSpacing: 0.5,
  },
  trackingCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 2,
  },
  feeBadge: {
    backgroundColor: '#0f172a',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#334155',
  },
  feeText: {
    color: '#10b981',
    fontWeight: '800',
    fontSize: 15,
  },
  feeSub: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  itemIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  itemSummary: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  routeContainer: {
    paddingLeft: 4,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: 10,
  },
  stopDetails: {
    flex: 1,
  },
  stopType: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 2,
  },
  personName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  addressText: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 2,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#475569',
    marginLeft: 5,
    marginVertical: 2,
  },
  lastActionBox: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderRadius: 6,
    padding: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  lastActionText: {
    fontSize: 12,
    color: '#fdba74',
  },
  lastActionBold: {
    fontWeight: '700',
    color: '#f97316',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  actionGrid: {
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnNormal: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  actionBtnActive: {
    backgroundColor: '#1e293b',
    borderColor: '#10b981',
  },
  actionBtnFinish: {
    backgroundColor: '#15803d',
    borderColor: '#22c55e',
    marginTop: 4,
  },
  actionBtnIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  actionBtnContent: {
    flex: 1,
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  actionBtnDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  actionBtnTitleWhite: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  actionBtnDescWhite: {
    fontSize: 12,
    color: '#dcfce7',
    marginTop: 2,
  },
  checkIcon: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '800',
  },
  checkIconWhite: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '900',
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#f97316',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backBtnText: {
    color: '#64748b',
    fontSize: 13,
  },
});
