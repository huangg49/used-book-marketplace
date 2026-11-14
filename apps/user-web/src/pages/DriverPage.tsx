import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styles from './DriverPage.module.css';

interface LegData {
  leg: 'initiator' | 'recipient';
  label: string;
  trackingCode: string;
  carrierCode: string;
  carrierName: string;
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
  isDelivered: boolean;
  lastEvent?: string | null;
}

interface ShipmentOrderData {
  exchangeId: string;
  activeLeg: 'initiator' | 'recipient';
  trackingCode: string;
  carrierCode: string;
  carrierName: string;
  status: string;
  readyForPickup?: boolean;
  bothDelivered: boolean;
  inspectionDeadline?: string | null;
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
  lastEvent?: string | null;
  legs?: LegData[];
}

interface RecentOrderSummary {
  exchangeId: string;
  status: string;
  updatedAt?: string;
  initiatorTracking?: string;
  recipientTracking?: string;
  bothDelivered: boolean;
}

export function DriverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [simulatingSpeed, setSimulatingSpeed] = useState(false);
  const [order, setOrder] = useState<ShipmentOrderData | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderSummary[]>([]);
  const [legSteps, setLegSteps] = useState<Record<string, number>>({});
  const [lastAction, setLastAction] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');

  // Xác định bước của bưu kiện: ưu tiên thao tác hiện tại -> sự kiện trong DB -> trạng thái giao
  const currentStep = (() => {
    if (!order) return 0;
    if (order.deliveredAt) return 4;
    if (order.trackingCode && legSteps[order.trackingCode] !== undefined) {
      return legSteps[order.trackingCode];
    }
    const event = (order.lastEvent || '').toLowerCase();
    if (event.includes('đang đi giao') || event.includes('đang trên đường giao')) return 3;
    if (event.includes('nhập kho') || event.includes('kho tổng') || event.includes('trung chuyển')) return 2;
    if (event.includes('đã lấy sách') || event.includes('đã có mặt') || event.includes('đã nhận kiện')) return 1;
    return order.shippedAt ? 1 : 0;
  })();

  const fetchRecentOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/shipments/carrier/orders/recent');
      if (res.ok) {
        const data = (await res.json()) as RecentOrderSummary[];
        setRecentOrders(data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách đơn gần đây:', err);
    }
  }, []);

  const fetchActiveOrder = useCallback(
    async (trackingCode?: string, exchangeId?: string, leg?: 'initiator' | 'recipient') => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (trackingCode) params.set('trackingCode', trackingCode);
        if (exchangeId) params.set('exchangeId', exchangeId);
        if (leg) params.set('leg', leg);

        const url = `/api/v1/shipments/carrier/orders/active${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ShipmentOrderData | null;
        setOrder(data);

        if (data) {
          if (data.deliveredAt) {
            setLastAction('Giao thành công & Ký nhận POD');
          } else if (data.lastEvent) {
            setLastAction(data.lastEvent);
          } else {
            setLastAction(data.shippedAt ? 'Đang vận chuyển' : 'Chờ lấy sách');
          }
        }
      } catch (err) {
        console.warn('Lỗi tải đơn vận chuyển:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const qCode = searchParams.get('trackingCode') || undefined;
    const qExId = searchParams.get('exchangeId') || undefined;
    const qLeg = (searchParams.get('leg') as 'initiator' | 'recipient') || undefined;
    void fetchActiveOrder(qCode, qExId, qLeg);
    void fetchRecentOrders();
  }, [fetchActiveOrder, fetchRecentOrders, searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setSearchParams({ trackingCode: searchInput.trim() });
    void fetchActiveOrder(searchInput.trim());
  };

  const handleSelectRecent = (summary: RecentOrderSummary) => {
    setSearchParams({ exchangeId: summary.exchangeId });
    void fetchActiveOrder(undefined, summary.exchangeId);
  };

  const handleSwitchLeg = (targetLeg: 'initiator' | 'recipient') => {
    if (!order) return;
    setSearchParams({ exchangeId: order.exchangeId, leg: targetLeg });
    void fetchActiveOrder(undefined, order.exchangeId, targetLeg);
  };

  const handleAutoSimulate = async () => {
    if (!order?.exchangeId) return;
    const ok = window.confirm(
      '⚡ Bạn có muốn TỰ ĐỘNG mô phỏng giao cả 2 kiện hàng đến bước hoàn tất (POD) không?\n\n' +
      'Thao tác này sẽ tự động mô phỏng giao thành công cả 2 chiều và kích hoạt thời gian kiểm định 72h của sàn.',
    );
    if (!ok) return;
    setSimulatingSpeed(true);
    try {
      const leg1Tracking = order.legs?.[0]?.trackingCode || order.trackingCode;
      const leg2Tracking = order.legs?.[1]?.trackingCode;

      // Bước 1: Lấy hàng kiện 1
      if (leg1Tracking) setLegSteps((prev) => ({ ...prev, [leg1Tracking]: 1 }));
      setLastAction('⚡ [Tự động] Bưu tá đã lấy Kiện 1...');
      await new Promise((r) => setTimeout(r, 450));

      // Bước 2: Nhập kho
      if (leg1Tracking) setLegSteps((prev) => ({ ...prev, [leg1Tracking]: 2 }));
      setLastAction('⚡ [Tự động] Kiện 1 đã nhập kho trung chuyển TP.HCM...');
      await new Promise((r) => setTimeout(r, 450));

      // Bước 3: Đang đi giao
      if (leg1Tracking) setLegSteps((prev) => ({ ...prev, [leg1Tracking]: 3 }));
      setLastAction('⚡ [Tự động] Bưu tá đang giao Kiện 1 đến người nhận...');
      await new Promise((r) => setTimeout(r, 450));

      // Bước 4: Kiện 1 giao xong, chuyển sang Kiện 2
      if (leg1Tracking) setLegSteps((prev) => ({ ...prev, [leg1Tracking]: 4 }));
      if (leg2Tracking) {
        setLegSteps((prev) => ({ ...prev, [leg2Tracking]: 2 }));
      }
      setLastAction('⚡ [Tự động] Kiện 1 đã giao! Bắt đầu giao Kiện 2...');
      await new Promise((r) => setTimeout(r, 550));

      if (leg2Tracking) setLegSteps((prev) => ({ ...prev, [leg2Tracking]: 3 }));
      setLastAction('⚡ [Tự động] Kiện 2 đang giao đến đối tác...');
      await new Promise((r) => setTimeout(r, 550));

      // Gọi API auto-simulate để server MongoDB cập nhật cả 2 kiện sang Delivered + kích hoạt 72h kiểm định
      const res = await fetch(`/api/v1/shipments/carrier/orders/${order.exchangeId}/auto-simulate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Lỗi tự động giao (${res.status})`);

      if (leg2Tracking) setLegSteps((prev) => ({ ...prev, [leg2Tracking]: 4 }));
      setLastAction('✓ Cả 2 kiện hàng đã ký nhận POD thành công!');

      await fetchActiveOrder(undefined, order.exchangeId);
      await fetchRecentOrders();

      alert(
        `🎉 TỰ ĐỘNG MÔ PHỎNG THÀNH CÔNG!\n\n` +
        `• Kiện 1: Đã giao tận tay & ký nhận POD.\n` +
        `• Kiện 2: Đã giao tận tay & ký nhận POD.\n\n` +
        `Sàn Lật Lại đã tức thì chuyển sang giai đoạn "KIỂM ĐỊNH & NGHIỆM THU 72H (POL-08)"!`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Có lỗi khi tự động chạy mô phỏng');
    } finally {
      setSimulatingSpeed(false);
    }
  };

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

      if (order.trackingCode) {
        setLegSteps((prev) => ({
          ...prev,
          [order.trackingCode]: stepNumber,
        }));
      }
      setLastAction(actionLabel);

      if (stepNumber === 4) {
        // Kiểm tra xem kiện kia đã giao chưa
        const otherLeg = order.legs?.find((l) => l.leg !== order.activeLeg);
        const willBeBothDelivered = otherLeg?.isDelivered === true;

        if (willBeBothDelivered) {
          alert(
            `🎉 GIAO HÀNG THÀNH CÔNG CHO CẢ 2 BÊN!\n\n` +
            `Cả 2 kiện hàng đã được giao tận tay và ký nhận POD!\n` +
            `Sàn Lật Lại đã tự động chuyển sang bước "ĐÃ NHẬN SÁCH" & bắt đầu đếm ngược 72h kiểm định (POL-08)!`,
          );
        } else {
          alert(
            `✓ GIAO THÀNH CÔNG KIỆN HÀNG!\n\n` +
            `Mã vận đơn ${order.trackingCode} đã được giao cho ${order.receiver.name}.\n` +
            `👉 Còn Kiện hàng chiều ngược lại (${otherLeg?.trackingCode || 'Kiện 2'}), hãy chuyển sang tab bên cạnh để tiếp tục giao nhé!`,
          );
        }
      } else {
        alert(`✓ ${actionLabel}!\nHành trình đơn hàng trên sàn Lật Lại đã được cập nhật.`);
      }

      void fetchActiveOrder(undefined, order.exchangeId, order.activeLeg);
      void fetchRecentOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportFailure = async () => {
    if (!order) return;
    const ok = window.confirm(
      `Xác nhận báo giao thất bại cho kiện ${order.trackingCode} (Người nhận ${order.receiver.name} không nghe máy)?`,
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/webhooks/carrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          OrderCode: order.trackingCode,
          Status: 'IN_TRANSIT',
          Description: `[Giao thất bại lần 1]: Bưu tá không liên lạc được với người nhận (${order.receiver.name}). Hẹn giao lại vào ca kế tiếp.`,
        }),
      });

      if (!res.ok) throw new Error(`Lỗi cập nhật (${res.status})`);
      alert(`⚠️ Đã ghi nhận giao hàng thất bại! Hệ thống đã ghi nhật ký và thông báo cho người dùng.`);
      void fetchActiveOrder(undefined, order.exchangeId, order.activeLeg);
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
            onClick={() => void fetchActiveOrder(undefined, order?.exchangeId, order?.activeLeg)}
            disabled={loading || submitting}
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>

        {/* Thanh tìm kiếm / Tra cứu mã vận đơn */}
        <form onSubmit={handleSearch} className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Tra cứu mã GHN (vd: GHN49359...)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className={styles.searchBtn} disabled={loading || submitting}>
            Tìm đơn
          </button>
        </form>

        {/* Quick Chips: Chọn các đơn gần đây trong DB */}
        <div className={styles.chipsSection}>
          <p className={styles.chipsLabel}>Chọn nhanh đơn hàng</p>
          {recentOrders.length > 0 && (
            <div className={styles.chipsRow}>
              {recentOrders.map((ro) => {
                const isActive = ro.exchangeId === order?.exchangeId;
                const badgeText = ro.bothDelivered
                  ? '✓ Đã xong'
                  : ro.status === 'InTransit'
                    ? '🚚 Đang giao'
                    : ro.status === 'Preparing'
                      ? '📦 Chuẩn bị gửi'
                      : ro.status === 'Cancelled'
                        ? 'Đã hủy'
                        : ro.status;
                return (
                  <button
                    key={ro.exchangeId}
                    type="button"
                    className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                    onClick={() => handleSelectRecent(ro)}
                    title={`Mã cuộc trao đổi: ${ro.exchangeId}`}
                  >
                    #{ro.exchangeId.slice(0, 6)} ({badgeText})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className={styles.loadingBox}>
            <p>Đang lấy dữ liệu đơn hàng thật từ Database...</p>
          </div>
        ) : order ? (
          <>
            {/* Banner chúc mừng nếu cả 2 bên đều đã nhận hàng */}
            {order.bothDelivered && (
              <div className={styles.celebrationBanner}>
                <p className={styles.celebrationTitle}>🎉 CẢ 2 BÊN ĐÃ NHẬN SÁCH THÀNH CÔNG!</p>
                <p className={styles.celebrationDesc}>
                  Toàn bộ bưu phẩm 2 chiều đã ký nhận POD. Sàn Lật Lại đã tự động chuyển sang bước Kiểm định &amp;
                  Nghiệm thu 72h (POL-08).
                </p>
              </div>
            )}

            {/* BỘ CHUYỂN ĐỔI 2 CHIỀU TRAO ĐỔI (2-LEG TABS) */}
            {order.legs && order.legs.length > 0 && (
              <div className={styles.tabsContainer}>
                {order.legs.map((legItem) => {
                  const isCurrentTab = legItem.leg === order.activeLeg;
                  return (
                    <button
                      key={legItem.leg}
                      type="button"
                      className={`${styles.tabBtn} ${isCurrentTab ? styles.tabBtnActive : ''}`}
                      onClick={() => handleSwitchLeg(legItem.leg)}
                    >
                      <p className={styles.tabTitle}>{legItem.label}</p>
                      <p className={styles.tabCode}>{legItem.trackingCode}</p>
                      {legItem.isDelivered ? (
                        <span className={styles.tabBadgeDelivered}>
                          ✓ {legItem.lastEvent?.includes('POD') ? 'Đã giao (POD)' : 'Đã nhận'}
                        </span>
                      ) : (
                        <span className={styles.tabBadgePending}>⏳ Chờ giao</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Thẻ chi tiết bưu kiện đang chọn */}
            <div className={styles.orderCard}>
              <div className={styles.orderHeaderRow}>
                <div>
                  <p className={styles.trackingLabel}>
                    MÃ VẬN ĐƠN GHN ({order.activeLeg === 'initiator' ? 'CHIỀU ĐI' : 'CHIỀU VỀ'})
                  </p>
                  <p className={styles.trackingCode}>{order.trackingCode}</p>
                </div>
                <div className={styles.feeBadge}>
                  <p className={styles.feeText}>{order.fee.toLocaleString('vi-VN')} đ</p>
                  <p className={styles.feeSub}>Cước giao nhận GHN</p>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.itemRow}>
                <span>📚</span>
                <p className={styles.itemSummary}>{order.itemsSummary}</p>
              </div>

              {/* Lộ trình giao hàng */}
              <div className={styles.routeContainer}>
                {/* Điểm lấy */}
                <div className={styles.stopRow}>
                  <div className={styles.stopDotPickup} />
                  <div>
                    <p className={styles.stopType}>📍 ĐIỂM LẤY SÁCH (NGƯỜI GỬI)</p>
                    <p className={styles.personName}>
                      {order.sender.name} · {order.sender.phone}
                    </p>
                    <p className={styles.addressText}>{order.sender.detail}</p>
                  </div>
                </div>

                <div className={styles.routeLine} />

                {/* Điểm giao */}
                <div className={styles.stopRow}>
                  <div className={styles.stopDotDelivery} />
                  <div>
                    <p className={styles.stopType}>🏁 ĐIỂM GIAO SÁCH (NGƯỜI NHẬN)</p>
                    <p className={styles.personName}>
                      {order.receiver.name} · {order.receiver.phone}
                    </p>
                    <p className={styles.addressText}>{order.receiver.detail}</p>
                  </div>
                </div>
              </div>

              {(order.lastEvent || lastAction) && (
                <div className={styles.lastActionBox}>
                  <strong>Nhật ký vận chuyển:</strong> {order.lastEvent || lastAction}
                </div>
              )}
            </div>

            {/* Waiting for partner banner */}
            {order.readyForPickup === false && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 16,
                  color: '#92400e',
                  fontSize: 13,
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 24 }}>⏳</span>
                <div>
                  <strong>Chưa thể lấy sách</strong>
                  <div>Shipper chỉ lấy sách khi có đủ hai vận đơn và phiếu còn trong hạn.</div>
                </div>
              </div>
            )}

            {/* Nút 1-Click Tự động chạy mô phỏng (Fast Auto-Simulate) */}
            {!order.bothDelivered && order.readyForPickup !== false && (
              <button
                type="button"
                className={styles.autoSimulateBtn}
                onClick={() => void handleAutoSimulate()}
                disabled={submitting || simulatingSpeed}
              >
                {simulatingSpeed
                  ? '⚡ Đang tự động chạy mô phỏng 2 chiều...'
                  : '⚡ 1-Click Tự động chạy mô phỏng (Dành cho Thuyết trình)'}
              </button>
            )}

            {/* Thao tác bưu tá */}
            <p className={styles.sectionTitle}>
              QUY TRÌNH GIAO NHẬN CHO {order.activeLeg === 'initiator' ? 'CHIỀU ĐI' : 'CHIỀU VỀ'}
            </p>
            <div className={styles.actionGrid}>
              {/* Step 1 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 1 ? styles.actionBtnActive : ''}`}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep >= 1}
                onClick={() =>
                  void handleUpdateStatus(
                    1,
                    'PICKING',
                    `Bưu tá Lê Hoàng Nam đã đến địa chỉ lấy hàng và tiếp nhận bưu phẩm từ ${order.sender.name}`,
                    'Đã lấy hàng từ người gửi',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>📦</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>1. Đến lấy hàng tận nơi (Pick-up)</p>
                  <p className={styles.actionBtnDesc}>Bưu tá đến địa chỉ người gửi để nhận bưu phẩm sách</p>
                </div>
                {currentStep >= 1 ? (
                  <span className={styles.stepBadgeDone}>✓ Đã lấy từ người gửi</span>
                ) : (
                  <span className={styles.stepBadgeNext}>Bấm lấy sách</span>
                )}
              </button>

              {/* Step 2 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 2 ? styles.actionBtnActive : ''}`}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep < 1 || currentStep >= 2}
                onClick={() =>
                  void handleUpdateStatus(
                    2,
                    'IN_TRANSIT',
                    `Kiện ${order.trackingCode} đã nhập kho trung chuyển phân loại Tân Bình - TP.HCM`,
                    'Nhập kho phân loại trung chuyển',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>🚚</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>2. Nhập kho trung chuyển (Sorting Hub)</p>
                  <p className={styles.actionBtnDesc}>Bưu kiện về kho trung chuyển, phân luồng tuyến giao</p>
                </div>
                {currentStep >= 2 ? (
                  <span className={styles.stepBadgeDone}>✓ Đã nhập kho Hub</span>
                ) : currentStep >= 1 ? (
                  <span className={styles.stepBadgeNext}>Bấm nhập kho</span>
                ) : (
                  <span className={styles.stepBadgeWaiting}>Chờ lấy sách</span>
                )}
              </button>

              {/* Step 3 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${currentStep >= 3 ? styles.actionBtnActive : ''}`}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep < 2 || currentStep >= 3}
                onClick={() =>
                  void handleUpdateStatus(
                    3,
                    'IN_TRANSIT',
                    `Bưu tá đang trên đường đi giao sách đến ${order.receiver.name}`,
                    'Đang giao tới người nhận',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>🛵</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitle}>3. Xuất kho & Đi giao hàng (Out for Delivery)</p>
                  <p className={styles.actionBtnDesc}>Bưu tá nhận sách từ kho và bắt đầu giao đến người nhận</p>
                </div>
                {currentStep >= 3 ? (
                  <span className={styles.stepBadgeDone}>✓ Đang giao hàng</span>
                ) : currentStep >= 2 ? (
                  <span className={styles.stepBadgeNext}>Bấm đi giao</span>
                ) : (
                  <span className={styles.stepBadgeWaiting}>Chờ tại kho</span>
                )}
              </button>

              {/* Step 4 */}
              <button
                type="button"
                className={`${styles.actionBtn} ${order.deliveredAt ? styles.actionBtnFinishDelivered : styles.actionBtnFinish}`}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep < 3 || Boolean(order.deliveredAt)}
                onClick={() =>
                  void handleUpdateStatus(
                    4,
                    'DELIVERED',
                    `Giao kiện ${order.trackingCode} tận tay cho ${order.receiver.name} thành công. Kèm chữ ký và biên bản bàn giao POD.`,
                    'Giao thành công & Ký nhận POD',
                  )
                }
              >
                <span className={styles.actionBtnIcon}>📸</span>
                <div className={styles.actionBtnContent}>
                  <p className={styles.actionBtnTitleWhite}>
                    {order.deliveredAt ? '✓ KIỆN NÀY ĐÃ GIAO THÀNH CÔNG' : '4. Giao thành công & Ký nhận POD'}
                  </p>
                  <p className={styles.actionBtnDescWhite}>
                    {order.deliveredAt
                      ? (order.lastEvent?.includes('POD')
                          ? 'Đã bàn giao sách tận tay và ký nhận biên bản POD (Bưu tá xác nhận)'
                          : 'Người nhận đã xác nhận nhận sách thành công trên ứng dụng')
                      : 'Xác nhận giao tận tay người nhận, kiểm tra sách và ký nhận POD'}
                  </p>
                </div>
                {order.deliveredAt || currentStep >= 4 ? (
                  <span className={styles.stepBadgeDoneWhite}>✓ ĐÃ GIAO</span>
                ) : currentStep >= 3 ? (
                  <span className={styles.stepBadgeNextWhite}>Bấm hoàn tất</span>
                ) : (
                  <span className={styles.stepBadgeWaitingWhite}>Chờ đi giao</span>
                )}
              </button>
            </div>

            {/* Nút kịch bản ngoại lệ (Giao thất bại) */}
            {!order.deliveredAt && (
              <button
                type="button"
                className={styles.failBtn}
                onClick={() => void handleReportFailure()}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep < 1}
              >
                ⚠️ Báo giao không thành công (Khách vắng mặt / Hẹn giao lại)
              </button>
            )}

          </>
        ) : (
          <div className={styles.emptyBox}>
            <p style={{ fontSize: 36, margin: '0 0 10px' }}>📦</p>
            <p className={styles.emptyTitle}>Chưa có đơn hàng nào cần giao</p>
            <p className={styles.emptyDesc}>
              Mở phiếu trao đổi của An và Bình, đặt cọc rồi lưu mã vận đơn của mỗi bên.
            </p>
          </div>
        )}

        <Link to="/" className={styles.backHomeLink}>
          ← Quay lại Trang chủ Lật Lại
        </Link>
      </div>
    </div>
  );
}
