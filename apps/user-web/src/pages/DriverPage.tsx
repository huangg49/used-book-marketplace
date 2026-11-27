import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { exchangeHandoverAnchor } from '../lib/exchange-handover';
import { ROUTES } from '../lib/routes';
import { AuctionDriverView } from './AuctionDriverView';
import { DirectDriverView } from './DirectDriverView';
import { DriverCompleteAction, DriverParcelCard, DriverParcelRoute, DriverWorkspace } from './DriverWorkspace';
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

const API_BASE = (import.meta.env['VITE_API_BASE_URL'] || 'http://localhost:3000/api/v1').replace(/\/$/, '');

export function DriverPage() {
  const [params, setParams] = useSearchParams();
  const code = params.get('trackingCode')?.trim() ?? '';
  const kind = params.get('kind');
  if (kind === 'direct') {
    return <DirectDriverView key={code} code={code.toUpperCase()}
      onSearch={(trackingCode) => setParams({ kind: 'direct', trackingCode })} />;
  }
  const exchangeLookup = params.has('exchangeId') || kind === 'exchange';
  if (kind === 'auction' || (!exchangeLookup && /^LL-[A-Z0-9]{8,32}$/i.test(code))) {
    const normalized = code.toUpperCase();
    const demoMode = params.get('demo') === '1';
    return <AuctionDriverView key={`${normalized}:${demoMode}`} code={normalized} demoMode={demoMode}
      onSearch={(trackingCode) => setParams(
        trackingCode
          ? { kind: 'auction', trackingCode, ...(demoMode ? { demo: '1' } : {}) }
          : { kind: 'auction', ...(demoMode ? { demo: '1' } : {}) },
      )} />;
  }
  return <ExchangeDriverView />;
}

function ExchangeDriverView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [simulatingSpeed, setSimulatingSpeed] = useState(false);
  const [order, setOrder] = useState<ShipmentOrderData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderSummary[]>([]);
  const [legSteps, setLegSteps] = useState<Record<string, number>>({});
  const [lastAction, setLastAction] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    title: string;
    body: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'auto-simulate' | 'report-failure' | null>(null);
  const requestedCode = searchParams.get('trackingCode') || undefined;
  const requestedExchange = searchParams.get('exchangeId') || undefined;
  const legParam = searchParams.get('leg');
  const requestedLeg = legParam === 'initiator' || legParam === 'recipient' ? legParam : undefined;

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
      const res = await fetch(`${API_BASE}/shipments/carrier/orders/recent`);
      if (res.ok) {
        const data = (await res.json()) as RecentOrderSummary[];
        setRecentOrders(data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách đơn gần đây:', err);
    }
  }, []);

  const fetchActiveOrder = useCallback(
    async (trackingCode?: string, exchangeId?: string, leg?: 'initiator' | 'recipient', silent = false) => {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const params = new URLSearchParams();
        if (trackingCode) params.set('trackingCode', trackingCode);
        if (exchangeId) params.set('exchangeId', exchangeId);
        if (leg) params.set('leg', leg);

        const url = `${API_BASE}/shipments/carrier/orders/active${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ShipmentOrderData | null;
        setOrder(data);
        setLoadError(null);

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
        if (!silent) {
          console.warn('Lỗi tải đơn vận chuyển:', err);
          setOrder(null);
          setLoadError(
            err instanceof Error
              ? `Không thể kết nối máy chủ mô phỏng (${err.message}).`
              : 'Không thể tải dữ liệu đơn vận chuyển.',
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchActiveOrder(requestedCode, requestedExchange, requestedLeg);
    void fetchRecentOrders();
  }, [fetchActiveOrder, fetchRecentOrders, requestedCode, requestedExchange, requestedLeg]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || submitting || simulatingSpeed) return;
      void fetchActiveOrder(requestedCode, requestedExchange, requestedLeg, true);
      void fetchRecentOrders();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [fetchActiveOrder, fetchRecentOrders, requestedCode, requestedExchange, requestedLeg, submitting, simulatingSpeed]);

  const handleSearch = (trackingCode: string) => {
    if (trackingCode === requestedCode) void fetchActiveOrder(requestedCode, requestedExchange, requestedLeg);
    else setSearchParams(trackingCode ? { kind: 'exchange', trackingCode } : { kind: 'exchange' });
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

  const handleAutoSimulate = () => {
    if (!order?.exchangeId) return;
    setConfirmAction('auto-simulate');
  };

  const runAutoSimulate = async () => {
    if (!order?.exchangeId) return;
    setConfirmAction(null);
    setFeedback(null);
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
      const res = await fetch(`${API_BASE}/shipments/carrier/orders/${order.exchangeId}/auto-simulate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Lỗi tự động giao (${res.status})`);

      if (leg2Tracking) setLegSteps((prev) => ({ ...prev, [leg2Tracking]: 4 }));
      setLastAction('✓ Cả 2 kiện hàng đã ký nhận POD thành công!');

      await fetchActiveOrder(undefined, order.exchangeId);
      await fetchRecentOrders();

      setFeedback({
        tone: 'success',
        title: 'Tự động mô phỏng giao cả 2 kiện thành công',
        body: 'Cả 2 kiện đã ký nhận POD. Sàn Lật Lại đã chuyển sang giai đoạn kiểm tra & nghiệm thu 72 giờ.',
      });
    } catch (err) {
      setFeedback({
        tone: 'error',
        title: 'Chưa thể tự động mô phỏng',
        body: err instanceof Error ? err.message : 'Có lỗi khi tự động chạy mô phỏng.',
      });
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
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/webhooks/carrier`, {
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
          setFeedback({
            tone: 'success',
            title: 'Giao hàng thành công cho cả 2 bên',
            body: 'Cả 2 kiện hàng đã ký nhận POD. Phiếu trao đổi đã chuyển sang giai đoạn kiểm tra & nghiệm thu 72 giờ.',
          });
        } else {
          setFeedback({
            tone: 'success',
            title: `Giao thành công kiện ${order.trackingCode}`,
            body: `Đã giao cho ${order.receiver.name}. Chuyển sang tab chiều ngược lại (${otherLeg?.trackingCode || 'Kiện 2'}) để tiếp tục giao.`,
          });
        }
      } else {
        setFeedback({
          tone: 'success',
          title: actionLabel,
          body: 'Hành trình đơn hàng trên sàn Lật Lại đã được cập nhật.',
        });
      }

      void fetchActiveOrder(undefined, order.exchangeId, order.activeLeg);
      void fetchRecentOrders();
    } catch (err) {
      setFeedback({
        tone: 'error',
        title: 'Cập nhật trạng thái thất bại',
        body: err instanceof Error ? err.message : 'Có lỗi xảy ra.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportFailure = () => {
    if (!order) return;
    setConfirmAction('report-failure');
  };

  const runReportFailure = async () => {
    if (!order) return;
    setConfirmAction(null);
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/webhooks/carrier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          OrderCode: order.trackingCode,
          Status: 'IN_TRANSIT',
          Description: `[Giao thất bại lần 1]: Bưu tá không liên lạc được với người nhận (${order.receiver.name}). Hẹn giao lại vào ca kế tiếp.`,
        }),
      });

      if (!res.ok) throw new Error(`Lỗi cập nhật (${res.status})`);
      setFeedback({
        tone: 'warning',
        title: 'Đã ghi nhận giao hàng thất bại',
        body: `Hệ thống đã lưu nhật ký hẹn giao lại cho kiện ${order.trackingCode} và thông báo tới người nhận.`,
      });
      void fetchActiveOrder(undefined, order.exchangeId, order.activeLeg);
    } catch (err) {
      setFeedback({
        tone: 'error',
        title: 'Không thể báo giao thất bại',
        body: err instanceof Error ? err.message : 'Có lỗi xảy ra.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DriverWorkspace
      mode="exchange"
      subtitle="Bưu tá: Lê Hoàng Nam (#DX-5571)"
      trackingCode={searchParams.get('trackingCode') ?? ''}
      searchLocked={loading || submitting}
      onSearch={handleSearch}
      refresh={{
        loading, disabled: submitting,
        run: () => void fetchActiveOrder(requestedCode, requestedExchange, requestedLeg),
      }}
      back={order ? {
        to: `${ROUTES.exchangeDetail(order.exchangeId)}#${exchangeHandoverAnchor.overview}`,
        label: 'Quay lại phiếu trao đổi',
      } : undefined}
    >
        {feedback && (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              marginBottom: 14,
              borderRadius: 10,
              border: `1px solid ${feedback.tone === 'error' ? '#f0c2b8' : feedback.tone === 'warning' ? '#e7c98b' : '#d9cbbd'}`,
              background: feedback.tone === 'error' ? '#fdf2ef' : feedback.tone === 'warning' ? '#fff8e8' : '#f4eddf',
              color: feedback.tone === 'error' ? '#912b0e' : 'var(--shop-ink, #281914)',
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: 2 }}>{feedback.title}</strong>
              <span style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>{feedback.body}</span>
            </div>
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() => setFeedback(null)}
              style={{
                border: 0,
                background: 'transparent',
                color: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
        )}
        <ConfirmDialog
          isOpen={confirmAction !== null}
          onClose={() => !submitting && !simulatingSpeed && setConfirmAction(null)}
          title={
            confirmAction === 'auto-simulate'
              ? 'Tự động mô phỏng giao cả 2 kiện?'
              : `Báo giao thất bại kiện ${order?.trackingCode ?? ''}?`
          }
          description={
            confirmAction === 'auto-simulate'
              ? 'Thao tác này sẽ mô phỏng giao thành công cả 2 chiều đến bước ký nhận POD và kích hoạt ngay thời gian kiểm tra 72 giờ của sàn.'
              : `Ghi nhận không liên lạc được với người nhận (${order?.receiver.name ?? ''}) và hẹn giao lại vào ca kế tiếp.`
          }
          confirmText={confirmAction === 'auto-simulate' ? 'Chạy mô phỏng 2 chiều' : 'Ghi nhận giao thất bại'}
          isDanger={confirmAction === 'report-failure'}
          isBusy={submitting || simulatingSpeed}
          onConfirm={() => {
            if (confirmAction === 'auto-simulate') void runAutoSimulate();
            else if (confirmAction === 'report-failure') void runReportFailure();
          }}
        />
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

            <DriverParcelCard
              label={`Mã vận đơn (${order.activeLeg === 'initiator' ? 'Chiều đi' : 'Chiều về'})`}
              trackingCode={order.trackingCode}
              summary={order.itemsSummary}
              badge={<div className={styles.feeBadge}>
                <p className={styles.feeText}>{order.fee.toLocaleString('vi-VN')} đ</p>
                <p className={styles.feeSub}>Cước giao nhận GHN</p>
              </div>}
            >
              <DriverParcelRoute
                pickup={{ label: 'Điểm lấy sách (người gửi)', name: `${order.sender.name} · ${order.sender.phone}`, detail: order.sender.detail }}
                dropoff={{ label: 'Điểm giao sách (người nhận)', name: `${order.receiver.name} · ${order.receiver.phone}`, detail: order.receiver.detail }}
              />
              {(order.lastEvent || lastAction) && (
                <div className={styles.lastActionBox}>
                  <strong>Nhật ký vận chuyển:</strong> {order.lastEvent || lastAction}
                </div>
              )}
            </DriverParcelCard>

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
                  : '⚡ 1-Click Tự động chạy mô phỏng giao nhận 2 chiều'}
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

              <DriverCompleteAction
                title={order.deliveredAt ? 'Kiện này đã giao thành công' : '4. Giao thành công & Ký nhận POD'}
                description={order.deliveredAt
                  ? (order.lastEvent?.includes('POD')
                    ? 'Đã bàn giao sách tận tay và ký nhận biên bản POD (Bưu tá xác nhận)'
                    : 'Người nhận đã xác nhận nhận sách thành công trên ứng dụng')
                  : 'Xác nhận giao tận tay người nhận, kiểm tra sách và ký nhận POD'}
                badge={order.deliveredAt || currentStep >= 4 ? '✓ Đã giao' : currentStep >= 3 ? 'Bấm hoàn tất' : 'Chờ đi giao'}
                delivered={Boolean(order.deliveredAt)}
                waiting={currentStep < 3}
                disabled={submitting || simulatingSpeed || order.readyForPickup === false || currentStep < 3 || Boolean(order.deliveredAt)}
                onClick={() =>
                  void handleUpdateStatus(
                    4,
                    'DELIVERED',
                    `Giao kiện ${order.trackingCode} tận tay cho ${order.receiver.name} thành công. Kèm chữ ký và biên bản bàn giao POD.`,
                    'Giao thành công & Ký nhận POD',
                  )
                }
              />
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
        ) : loadError ? (
          <div className={styles.emptyBox} role="alert">
            <p style={{ fontSize: 36, margin: '0 0 10px' }}>⚠️</p>
            <p className={styles.emptyTitle}>Chưa kết nối được máy chủ vận chuyển</p>
            <p className={styles.emptyDesc}>{loadError}</p>
            <button
              type="button"
              className={styles.actionBtn}
              style={{ marginTop: 12 }}
              onClick={() => void fetchActiveOrder(requestedCode, requestedExchange, requestedLeg)}
            >
              Thử tải lại
            </button>
          </div>
        ) : (
          <div className={styles.emptyBox}>
            <p style={{ fontSize: 36, margin: '0 0 10px' }}>📦</p>
            <p className={styles.emptyTitle}>Chưa có đơn hàng nào cần giao</p>
            <p className={styles.emptyDesc}>
              Mở phiếu trao đổi đã đặt cọc và lưu mã vận đơn của mỗi bên để bưu tá bắt đầu giao nhận.
            </p>
          </div>
        )}

    </DriverWorkspace>
  );
}
