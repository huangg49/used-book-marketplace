import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './DriverPage.module.css';

interface ShipmentOrderData {
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
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

export function DriverPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<ShipmentOrderData | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [lastAction, setLastAction] = useState<string>('');

  const fetchActiveOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/shipments/carrier/orders/active');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ShipmentOrderData | null;
      setOrder(data);
      if (data?.deliveredAt) {
        setCurrentStep(4);
        setLastAction('Giao thành công');
      } else if (data?.shippedAt) {
        setCurrentStep(2);
        setLastAction('Đã tiếp nhận hàng');
      }
    } catch (err) {
      console.warn('Lỗi tải đơn vận chuyển:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const res = await fetch('/api/v1/webhooks/carrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          OrderCode: order.trackingCode,
          Status: status,
          Description: description,
        }),
      });

      if (!res.ok) throw new Error(`Lỗi cập nhật (${res.status})`);

      setCurrentStep(stepNumber);
      setLastAction(actionLabel);

      if (stepNumber === 4) {
        alert(
          `🎉 GIAO HÀNG THÀNH CÔNG!\n\nĐã kích hoạt Webhook DELIVERED cho mã vận đơn ${order.trackingCode}!\nMàn hình sàn Lật Lại của người mua & người bán đã tự động chuyển sang bước "ĐÃ NHẬN SÁCH" & đếm ngược 48h kiểm tra hàng.`,
        );
      } else {
        alert(`✓ ${actionLabel}!\nHành trình đơn hàng trên web đã được cập nhật.`);
      }

      void fetchActiveOrder();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.mobileFrame}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.appTitle}>LẬT LẠI EXPRESS 🚚</h1>
            <p className={styles.driverName}>Bưu tá: Lê Hoàng Nam (#DX-5571)</p>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void fetchActiveOrder()}
            disabled={loading || submitting}
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingBox}>
            <p>Đang lấy dữ liệu đơn hàng thật từ Database...</p>
          </div>
        ) : order ? (
          <>
            {/* Shipment Card */}
            <div className={styles.orderCard}>
              <div className={styles.orderHeaderRow}>
                <div>
                  <p className={styles.trackingLabel}>MÃ VẬN ĐƠN (GHN)</p>
                  <p className={styles.trackingCode}>{order.trackingCode}</p>
                </div>
                <div className={styles.feeBadge}>
                  <p className={styles.feeText}>{order.fee.toLocaleString('vi-VN')} đ</p>
                  <p className={styles.feeSub}>Cước vận chuyển</p>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.itemRow}>
                <span>📚</span>
                <p className={styles.itemSummary}>{order.itemsSummary}</p>
              </div>

              {/* Route */}
              <div className={styles.routeContainer}>
                {/* Pickup */}
                <div className={styles.stopRow}>
                  <div className={styles.stopDotPickup} />
                  <div>
                    <p className={styles.stopType}>ĐIỂM LẤY SÁCH (NGƯỜI GỬI)</p>
                    <p className={styles.personName}>
                      {order.sender.name} · {order.sender.phone}
                    </p>
                    <p className={styles.addressText}>{order.sender.detail}</p>
                  </div>
                </div>

                <div className={styles.routeLine} />

                {/* Delivery */}
                <div className={styles.stopRow}>
                  <div className={styles.stopDotDelivery} />
                  <div>
                    <p className={styles.stopType}>ĐIỂM GIAO SÁCH (NGƯỜI NHẬN)</p>
                    <p className={styles.personName}>
                      {order.receiver.name} · {order.receiver.phone}
                    </p>
                    <p className={styles.addressText}>{order.receiver.detail}</p>
                  </div>
                </div>
              </div>

              {lastAction && (
                <div className={styles.lastActionBox}>
                  Trạng thái hiện tại: <strong>{lastAction}</strong>
                </div>
              )}
            </div>

            {/* Actions */}
            <p className={styles.sectionTitle}>THAO TÁC BƯU TÁ (ĐIỀU HÀNH THỰC TẾ)</p>
            <div className={styles.actionGrid}>
              {/* Step 1 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 1 ? styles.actionBtnActive : ''}`}
                disabled={submitting}
                onClick={() =>
                  void handleUpdateStatus(
                    1,
                    'PICKING',
                    `Bưu tá Lê Hoàng Nam đã có mặt và lấy sách tại ${order.sender.detail}`,
                    'Bưu tá đã lấy hàng',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>📦</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>1. Bưu tá đã lấy hàng</p>
                  <p className={styles.actionBtnDesc}>Xác nhận đã nhận kiện sách từ người gửi</p>
                </div>
                {currentStep >= 1 && <span className={styles.checkBadge}>✓</span>}
              </button>

              {/* Step 2 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 2 ? styles.actionBtnActive : ''}`}
                disabled={submitting}
                onClick={() =>
                  void handleUpdateStatus(
                    2,
                    'IN_TRANSIT',
                    'Bưu phẩm đã nhập kho bưu cục trung chuyển Tân Bình - TP.HCM',
                    'Nhập kho trung chuyển Hub',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>🚚</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>2. Nhập kho trung chuyển</p>
                  <p className={styles.actionBtnDesc}>Cập nhật kiện hàng đã về kho tổng TP.HCM</p>
                </div>
                {currentStep >= 2 && <span className={styles.checkBadge}>✓</span>}
              </button>

              {/* Step 3 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 3 ? styles.actionBtnActive : ''}`}
                disabled={submitting}
                onClick={() =>
                  void handleUpdateStatus(
                    3,
                    'IN_TRANSIT',
                    `Bưu tá đang trên đường giao sách đến ${order.receiver.detail}`,
                    'Bưu tá đang đi giao',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>🛵</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>3. Bưu tá đang đi giao</p>
                  <p className={styles.actionBtnDesc}>Bắt đầu chuyến phát tới tay người nhận</p>
                </div>
                {currentStep >= 3 && <span className={styles.checkBadge}>✓</span>}
              </button>

              {/* Step 4 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnFinish}`}
                disabled={submitting}
                onClick={() =>
                  void handleUpdateStatus(
                    4,
                    'DELIVERED',
                    `Giao hàng tận tay cho ${order.receiver.name} thành công. Kèm chữ ký và biên bản bàn giao.`,
                    'Giao thành công & Ký nhận POD',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>📸</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitleWhite}>4. GIAO THÀNH CÔNG (BẮN WEBHOOK)</p>
                  <p className={styles.actionBtnDescWhite}>Tự động chuyển sàn sang bước Nghiệm thu 48h!</p>
                </div>
                {currentStep >= 4 && <span className={styles.checkBadgeWhite}>✓</span>}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.emptyBox}>
            <p style={{ fontSize: 32 }}>📦</p>
            <p className={styles.emptyTitle}>Chưa có đơn hàng nào cần giao</p>
            <p className={styles.emptyDesc}>
              Hãy vào sàn Lật Lại bấm &quot;Tạo đơn vận chuyển&quot; để tạo đơn vận chuyển thật trước.
            </p>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => void fetchActiveOrder()}
            >
              Thử tải lại đơn
            </button>
          </div>
        )}

        <Link to="/" className={styles.backHomeLink}>
          ← Quay lại Trang chủ Lật Lại
        </Link>
      </div>
    </div>
  );
}
