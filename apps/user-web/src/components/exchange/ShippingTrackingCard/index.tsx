import { useState } from 'react';
import { Truck, Package, Copy, Check, ExternalLink, MapPin, Calendar, Info, Clock, AlertCircle, Zap } from 'lucide-react';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import {
    getExchangeShipment,
    getTrackingUrl,
    CARRIERS,
    simulateCarrierWebhook,
    type ShipmentData
} from '../../../services/exchangeShipment';
import styles from './ShippingTrackingCard.module.css';

function BarcodeSvg({ value }: { value: string }) {
    const clean = value.replace(/[^A-Za-z0-9]/g, '');
    const bars: { x: number; width: number }[] = [];
    let currentX = 6;
    for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        const w1 = (code % 3) + 1;
        const space = ((code >> 1) % 2) + 1;
        const w2 = ((code >> 2) % 3) + 1;
        bars.push({ x: currentX, width: w1 });
        currentX += w1 + space;
        bars.push({ x: currentX, width: w2 });
        currentX += w2 + 2;
    }
    return (
        <svg viewBox={`0 0 ${currentX + 6} 44`} className={styles.barcodeSvg} preserveAspectRatio="none">
            {bars.map((b, i) => (
                <rect key={i} x={b.x} y={2} width={b.width} height={40} fill="#1a1a1a" />
            ))}
        </svg>
    );
}

interface ShippingTrackingCardProps {
    detail: ExchangeDetail;
    onRefresh?: () => void;
}

export function ShippingTrackingCard({ detail, onRefresh }: ShippingTrackingCardProps) {
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [simulatingCode, setSimulatingCode] = useState<string | null>(null);
    const [webhookNotice, setWebhookNotice] = useState<string | null>(null);

    // Retrieve server tracking info with local fallback
    const viewerRole = detail.viewerRole; // 'proposer' (initiator) | 'recipient'
    const initiatorRole = viewerRole === 'proposer' ? 'initiator' : 'recipient';
    const recipientRole = viewerRole === 'proposer' ? 'recipient' : 'initiator';

    const serverViewerShipment: ShipmentData | null = detail.viewerShipment
        ? {
            method: detail.viewerShipment.method,
            carrierCode: (detail.viewerShipment.carrierCode as any) ?? 'OTHER',
            carrierName: detail.viewerShipment.carrierName ?? undefined,
            trackingCode: detail.viewerShipment.trackingCode ?? undefined,
            meetupLocation: detail.viewerShipment.meetupLocation ?? undefined,
            notes: detail.viewerShipment.notes ?? undefined,
            shippedAt: detail.viewerShipment.shippedAt ?? undefined,
        }
        : null;

    const serverPartnerShipment: ShipmentData | null = detail.partnerShipment
        ? {
            method: detail.partnerShipment.method,
            carrierCode: (detail.partnerShipment.carrierCode as any) ?? 'OTHER',
            carrierName: detail.partnerShipment.carrierName ?? undefined,
            trackingCode: detail.partnerShipment.trackingCode ?? undefined,
            meetupLocation: detail.partnerShipment.meetupLocation ?? undefined,
            notes: detail.partnerShipment.notes ?? undefined,
            shippedAt: detail.partnerShipment.shippedAt ?? undefined,
        }
        : null;

    const viewerShipment: ShipmentData | null = serverViewerShipment ?? getExchangeShipment(detail.id, initiatorRole);
    const partnerShipment: ShipmentData | null = serverPartnerShipment ?? getExchangeShipment(detail.id, recipientRole);

    const viewerSentAt = detail.viewerShipping.sentAt || viewerShipment?.shippedAt;
    const partnerSentAt = detail.partnerShipping.sentAt || partnerShipment?.shippedAt;

    const copyTracking = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleSimulateDelivered = async (trackingCode: string) => {
        setSimulatingCode(trackingCode);
        setWebhookNotice(null);
        try {
            await simulateCarrierWebhook(
                trackingCode,
                'DELIVERED',
                'Bưu tá GHN Express đã giao sách tận tay người nhận thành công tại TP.HCM',
            );
            setWebhookNotice(`✓ Đã nhận tín hiệu bưu tá giao hàng (DELIVERED) cho mã ${trackingCode}! Đang cập nhật...`);
            if (onRefresh) {
                onRefresh();
            } else {
                setTimeout(() => window.location.reload(), 800);
            }
        } catch {
            setWebhookNotice('Có lỗi khi gửi tín hiệu bưu tá giả lập.');
        } finally {
            setSimulatingCode(null);
        }
    };

    const renderLegCard = (
        title: string,
        isViewer: boolean,
        sentAt?: string,
        receivedAt?: string,
        shipment?: ShipmentData | null,
        address?: { recipientName: string; phone: string; detail: string; localityCode?: string | null }
    ) => {
        const isSent = Boolean(sentAt);
        const isReceived = Boolean(receivedAt);
        const trackingCode = shipment?.trackingCode;
        const trackingUrl = getTrackingUrl(shipment?.carrierCode, trackingCode);
        const carrier = CARRIERS.find(c => c.code === shipment?.carrierCode);

        return (
            <div className={`${styles.legCard} ${isSent ? styles.legCardSent : ''}`}>
                <div className={styles.legHeader}>
                    <div className={styles.legTitleGroup}>
                        <Package size={18} className={styles.legIcon} />
                        <h4 className={styles.legTitle}>{title}</h4>
                    </div>
                    {isReceived ? (
                        <span className={styles.badgeSuccess}>✓ Đã nhận sách</span>
                    ) : isSent ? (
                        <span className={styles.badgeShipping}>🚚 Đang vận chuyển</span>
                    ) : (
                        <span className={styles.badgePending}>
                            <Clock size={12} /> {isViewer ? 'Chờ bạn gửi sách' : 'Chờ đối tác gửi'}
                        </span>
                    )}
                </div>

                <div className={styles.legBody}>
                    {address && (
                        <div className={styles.destinationAddressBox}>
                            <div className={styles.destHeader}>
                                <MapPin size={13} />
                                {isViewer ? `Địa chỉ nhận của @${detail.partner.username}:` : 'Địa chỉ nhận của bạn:'}
                            </div>
                            <p className={styles.destText}>
                                <strong>{address.recipientName}</strong> · {address.phone}
                                <br />
                                {address.detail}{address.localityCode ? `, ${address.localityCode}` : ''}
                            </p>
                        </div>
                    )}

                    {isSent ? (
                        <>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Thời gian gửi:</span>
                                <span className={styles.infoValue}>
                                    {new Date(sentAt!).toLocaleString('vi-VN')}
                                </span>
                            </div>

                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Phương thức:</span>
                                <span className={styles.infoValue}>
                                    {shipment?.method === 'direct' ? (
                                        <span className={styles.methodBadgeDirect}>
                                            <MapPin size={13} /> Gặp mặt trực tiếp tại TP.HCM
                                        </span>
                                    ) : (
                                        <span className={styles.methodBadgeCarrier}>
                                            <Truck size={13} /> {shipment?.carrierName || 'Đơn vị chuyển phát'}
                                        </span>
                                    )}
                                </span>
                            </div>

                            {shipment?.method === 'direct' ? (
                                <>
                                    {shipment.meetupLocation && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Địa điểm hẹn:</span>
                                            <span className={styles.infoValueLocation}>
                                                <MapPin size={13} /> {shipment.meetupLocation}
                                            </span>
                                        </div>
                                    )}
                                    {shipment.meetupTime && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Thời gian hẹn:</span>
                                            <span className={styles.infoValue}>
                                                <Calendar size={13} /> {shipment.meetupTime}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {trackingCode ? (
                                        <div className={styles.trackingBox}>
                                            <div className={styles.trackingMain}>
                                                <span className={styles.trackingLabel}>Mã vận đơn:</span>
                                                <span className={styles.trackingNumber}>{trackingCode}</span>
                                            </div>
                                            <div className={styles.trackingActions}>
                                                <button
                                                    type="button"
                                                    className={styles.copyBtn}
                                                    onClick={() => copyTracking(trackingCode)}
                                                    title="Sao chép mã"
                                                >
                                                    {copiedCode === trackingCode ? (
                                                        <>
                                                            <Check size={14} className={styles.iconGreen} /> Đã chép
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={14} /> Sao chép
                                                        </>
                                                    )}
                                                </button>
                                                {trackingUrl && (
                                                    <a
                                                        href={trackingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={styles.trackLink}
                                                        title="Tra cứu bưu phẩm"
                                                    >
                                                        <ExternalLink size={14} /> Tra cứu
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Mã vận đơn:</span>
                                            <span className={styles.infoMuted}>Đã xác nhận gửi (chưa nhập mã chi tiết)</span>
                                        </div>
                                    )}

                                    {trackingCode && (
                                        <div className={styles.barcodeBox}>
                                            <div className={styles.barcodeHeader}>
                                                <span className={styles.barcodeTag}>MÃ VẠCH QUÉT BƯU TÁ (BARCODE)</span>
                                                <span className={styles.carrierTag}>{shipment?.carrierName || 'GHN Express'}</span>
                                            </div>
                                            <div className={styles.barcodeGraphic}>
                                                <BarcodeSvg value={trackingCode} />
                                            </div>
                                            <div className={styles.barcodeCode}>{trackingCode}</div>
                                        </div>
                                    )}

                                    {isSent && !isReceived && trackingCode && (
                                        <div className={styles.webhookBox}>
                                            <button
                                                type="button"
                                                className={styles.webhookBtn}
                                                onClick={() => void handleSimulateDelivered(trackingCode)}
                                                disabled={simulatingCode === trackingCode}
                                            >
                                                <Zap size={14} className={styles.zapIcon} />
                                                {simulatingCode === trackingCode ? 'Đang kích hoạt...' : '⚡ Bắn tín hiệu bưu tá giao hàng (DELIVERED)'}
                                            </button>
                                            <p className={styles.webhookDesc}>
                                                Mô phỏng Webhook GHN tự động xác nhận bưu tá đã giao hàng thành công đến tận nơi.
                                            </p>
                                        </div>
                                    )}

                                    {carrier?.hotline && (
                                        <div className={styles.carrierHotline}>
                                            Hotline {carrier.name}: <strong>{carrier.hotline}</strong>
                                        </div>
                                    )}
                                </>
                            )}

                            {shipment?.notes && (
                                <div className={styles.notesBox}>
                                    <span className={styles.notesLabel}>Ghi chú:</span>
                                    <p className={styles.notesContent}>"{shipment.notes}"</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.emptyLegNotice}>
                            {isViewer ? (
                                <p>
                                    Bạn chưa gửi sách. Vui lòng đóng gói cẩn thận và bấm <strong>"Xác nhận đã gửi sách"</strong> bên dưới sau khi giao hàng cho bưu tá hoặc gửi tại bưu cục.
                                </p>
                            ) : (
                                <p>
                                    Đối tác đang chuẩn bị sách để gửi. Bạn sẽ nhận được thông tin vận đơn ngay khi đối tác hoàn tất gửi sách.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Only render when exchange is active or past funding
    if (['PENDING', 'FUNDING', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(detail.status)) {
        return null;
    }

    const bothSent = Boolean(viewerSentAt && partnerSentAt);

    return (
        <div className={styles.container}>
            <div className={styles.cardHeader}>
                <div className={styles.titleIcon}>
                    <Truck size={22} />
                </div>
                <div>
                    <h3 className={styles.cardTitle}>Tiến trình giao nhận 2 chiều</h3>
                    <p className={styles.cardSubtitle}>
                        Trao đổi độc lập hai chiều · Mỗi bên tự gửi sách và tự thanh toán cước phí gửi
                    </p>
                </div>
            </div>

            {webhookNotice && (
                <div className={styles.webhookAlert}>
                    <Check size={16} /> {webhookNotice}
                </div>
            )}

            {bothSent && (
                <div className={styles.bothSentBanner}>
                    <AlertCircle size={18} className={styles.bannerIcon} />
                    <span>
                        <strong>Cả 2 gói sách đang trên đường giao nhận!</strong> Khi bạn nhận được bưu phẩm, hãy mở kiểm tra kỹ sách và ấn <em>"Xác nhận đã nhận sách"</em>.
                    </span>
                </div>
            )}

            <div className={styles.legsGrid}>
                {renderLegCard(
                    'Chiều đi: Sách bạn gửi cho đối tác',
                    true,
                    viewerSentAt,
                    detail.viewerShipping.receivedAt,
                    viewerShipment,
                    detail.partnerAddress
                )}
                {renderLegCard(
                    `Chiều về: Sách @${detail.partner.username} gửi cho bạn`,
                    false,
                    partnerSentAt,
                    detail.partnerShipping.receivedAt,
                    partnerShipment,
                    detail.viewerAddress
                )}
            </div>

            <div className={styles.rulesCallout}>
                <Info size={16} className={styles.infoCalloutIcon} />
                <div className={styles.rulesCalloutText}>
                    <strong>Quy tắc bảo chứng Lật Lại (POL-14):</strong> Toàn bộ số tiền đặt cọc ({detail.viewerFundingAmount ? `${detail.viewerFundingAmount.toLocaleString('vi-VN')} đ` : 'cọc bảo chứng'}) và tiền bù chênh lệch đang được giữ an toàn trên hệ thống. Sau khi cả 2 bên nhận sách, hệ thống sẽ mở khoảng đệm kiểm tra hàng 48 giờ. Bạn có thể bấm "Nghiệm thu hài lòng" để tất toán sớm, hoặc hệ thống sẽ tự động hoàn tất và trả cọc khi hết hạn kiểm tra.
                </div>
            </div>
        </div>
    );
}
