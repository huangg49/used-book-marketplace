import { useState } from 'react';
import {
    Truck,
    Package,
    Copy,
    Check,
    ExternalLink,
    MapPin,
    Calendar,
    Clock,
    AlertCircle,
    Zap,
    ShieldCheck,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    BookOpen
} from 'lucide-react';
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
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
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
    const partnerReceivedAt = detail.partnerShipping.receivedAt;
    const viewerReceivedAt = detail.viewerShipping.receivedAt;

    const copyTracking = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const copyAddressText = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedAddress(text);
        setTimeout(() => setCopiedAddress(null), 2000);
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

    // Only render when exchange is active or past funding
    if (['PENDING', 'FUNDING', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(detail.status)) {
        return null;
    }

    const bothSent = Boolean(viewerSentAt && partnerSentAt);
    const bothReceived = Boolean(viewerReceivedAt && partnerReceivedAt);

    const renderLegCard = ({
        direction,
        title,
        sentAt,
        receivedAt,
        shipment,
        address,
        books
    }: {
        direction: 'outgoing' | 'incoming';
        title: string;
        sentAt?: string;
        receivedAt?: string;
        shipment?: ShipmentData | null;
        address?: { recipientName: string; phone: string; detail: string; localityCode?: string | null };
        books: typeof detail.giveBooks;
    }) => {
        const isSent = Boolean(sentAt);
        const isReceived = Boolean(receivedAt);
        const trackingCode = shipment?.trackingCode;
        const trackingUrl = getTrackingUrl(shipment?.carrierCode, trackingCode);
        const carrier = CARRIERS.find(c => c.code === shipment?.carrierCode);
        const isOutgoing = direction === 'outgoing';

        const addressFullText = address
            ? `${address.recipientName} - ${address.phone}, ${address.detail}${address.localityCode ? `, ${address.localityCode}` : ''}`
            : '';

        return (
            <div className={`${styles.legCard} ${isOutgoing ? styles.legCardOutgoing : styles.legCardIncoming} ${isSent ? styles.legCardSent : ''}`}>
                {/* Header */}
                <div className={styles.legHeader}>
                    <div className={styles.legTitleGroup}>
                        <div className={`${styles.directionPill} ${isOutgoing ? styles.pillOutgoing : styles.pillIncoming}`}>
                            {isOutgoing ? (
                                <>
                                    <ArrowUpRight size={13} className={styles.directionIcon} />
                                    <span>Chiều đi · Bạn gửi</span>
                                </>
                            ) : (
                                <>
                                    <ArrowDownLeft size={13} className={styles.directionIcon} />
                                    <span>Chiều về · Bạn nhận</span>
                                </>
                            )}
                        </div>
                        <h4 className={styles.legTitle}>{title}</h4>
                    </div>

                    <div className={styles.legStatusWrap}>
                        {isReceived ? (
                            <span className={styles.badgeSuccess}>
                                <CheckCircle2 size={13} /> {isOutgoing ? 'Đối tác đã nhận' : 'Bạn đã nhận sách'}
                            </span>
                        ) : isSent ? (
                            <span className={bothSent ? styles.badgeShipping : styles.badgePending}>
                                {bothSent ? <Truck size={13} /> : <Clock size={13} />}
                                {bothSent
                                    ? (isOutgoing ? 'Đang giao tới đối tác' : 'Đang giao tới bạn')
                                    : (isOutgoing ? 'Đã tạo đơn · Chờ bưu tá lấy' : 'Đối tác đã tạo đơn')}
                            </span>
                        ) : (
                            <span className={styles.badgePending}>
                                <Clock size={13} /> {isOutgoing ? 'Chờ bạn tạo đơn' : 'Chờ đối tác tạo đơn'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Book summary bar */}
                {books && books.length > 0 && (
                    <div className={styles.bookSummaryBox}>
                        <div className={styles.bookSummaryTitle}>
                            <BookOpen size={13} />
                            <span>Gói gồm <strong>{books.length}</strong> cuốn sách:</span>
                        </div>
                        <div className={styles.bookChipList}>
                            {books.map(b => (
                                <span key={b.id} className={styles.bookChip}>
                                    <span className={styles.bookChipTitle}>{b.title}</span>
                                    {b.condition && <span className={styles.bookChipCondition}>{b.condition}</span>}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3-Step Mini Stepper */}
                <div className={styles.stepperContainer} aria-label="Tiến trình bưu phẩm">
                    <div className={`${styles.stepperStep} ${isSent ? styles.stepCompleted : styles.stepActive}`}>
                        <div className={styles.stepMarker}>
                            {isSent ? <Check size={11} strokeWidth={3} /> : <span className={styles.markerDot} />}
                        </div>
                        <span className={styles.stepLabel}>
                            {isSent ? 'Đã tạo đơn' : (isOutgoing ? 'Đóng gói & Tạo đơn' : 'Đối tác chuẩn bị')}
                        </span>
                    </div>

                    <div className={`${styles.stepperLine} ${bothSent ? styles.lineCompleted : ''}`} />

                    <div className={`${styles.stepperStep} ${isReceived ? styles.stepCompleted : bothSent ? styles.stepActive : styles.stepPending}`}>
                        <div className={styles.stepMarker}>
                            {isReceived ? <Check size={11} strokeWidth={3} /> : bothSent ? <span className={styles.markerDot} /> : 2}
                        </div>
                        <span className={styles.stepLabel}>Vận chuyển</span>
                    </div>

                    <div className={`${styles.stepperLine} ${isReceived ? styles.lineCompleted : ''}`} />

                    <div className={`${styles.stepperStep} ${isReceived ? styles.stepCompleted : styles.stepPending}`}>
                        <div className={styles.stepMarker}>
                            {isReceived ? <Check size={11} strokeWidth={3} /> : 3}
                        </div>
                        <span className={styles.stepLabel}>
                            {isOutgoing ? 'Đối tác đã nhận' : 'Đồng kiểm 48h'}
                        </span>
                    </div>
                </div>

                <div className={styles.legBody}>
                    {/* Destination Address Card */}
                    {address && (
                        <div className={styles.destinationAddressBox}>
                            <div className={styles.destHeader}>
                                <div className={styles.destLabel}>
                                    <MapPin size={13} />
                                    <span>{isOutgoing ? `Địa chỉ nhận của @${detail.partner.username}:` : 'Địa chỉ nhận của bạn:'}</span>
                                </div>
                                <button
                                    type="button"
                                    className={styles.copyAddressBtn}
                                    onClick={() => copyAddressText(addressFullText)}
                                    title="Sao chép địa chỉ"
                                >
                                    {copiedAddress === addressFullText ? (
                                        <>
                                            <Check size={11} className={styles.iconGreen} /> Đã chép
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={11} /> Sao chép
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className={styles.destText}>
                                <div className={styles.destRecipient}>
                                    <span className={styles.recipientName}>{address.recipientName}</span>
                                    <span className={styles.recipientPhone}>{address.phone}</span>
                                </div>
                                <div className={styles.addressLine}>
                                    {address.detail}{address.localityCode ? `, ${address.localityCode}` : ''}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sent Details or Empty Prompt */}
                    {isSent ? (
                        <div className={styles.shipmentDetailsBox}>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Thời gian xác nhận gửi:</span>
                                <span className={styles.infoValue}>
                                    {new Date(sentAt!).toLocaleString('vi-VN')}
                                </span>
                            </div>

                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Hình thức vận chuyển:</span>
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
                                <div className={styles.meetupDetails}>
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
                                </div>
                            ) : (
                                <>
                                    {trackingCode ? (
                                        <div className={styles.trackingBox}>
                                            <div className={styles.trackingMain}>
                                                <span className={styles.trackingLabel}>Mã vận đơn bưu cục</span>
                                                <span className={styles.trackingNumber}>{trackingCode}</span>
                                            </div>
                                            <div className={styles.trackingActions}>
                                                <button
                                                    type="button"
                                                    className={styles.copyBtn}
                                                    onClick={() => copyTracking(trackingCode)}
                                                    title="Sao chép mã vận đơn"
                                                >
                                                    {copiedCode === trackingCode ? (
                                                        <>
                                                            <Check size={13} className={styles.iconGreen} /> Đã chép
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={13} /> Sao chép mã
                                                        </>
                                                    )}
                                                </button>
                                                {trackingUrl && (
                                                    <a
                                                        href={trackingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={styles.trackLink}
                                                        title="Tra cứu bưu phẩm trên website vận chuyển"
                                                    >
                                                        <ExternalLink size={13} /> Tra cứu
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Mã vận đơn:</span>
                                            <span className={styles.infoMuted}>Đã xác nhận gửi (chưa có mã chi tiết)</span>
                                        </div>
                                    )}

                                    {trackingCode && (
                                        <div className={styles.barcodeBox}>
                                            <div className={styles.barcodeHeader}>
                                                <span className={styles.barcodeTag}>PHIẾU VẬN ĐƠN ĐIỆN TỬ</span>
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
                                                Mô phỏng Webhook bưu tá xác nhận đã giao kiện sách thành công để kiểm thử chuyển bước.
                                            </p>
                                        </div>
                                    )}

                                    {carrier?.hotline && (
                                        <div className={styles.carrierHotline}>
                                            Tổng đài hỗ trợ {carrier.name}: <strong>{carrier.hotline}</strong>
                                        </div>
                                    )}
                                </>
                            )}

                            {shipment?.notes && (
                                <div className={styles.notesBox}>
                                    <span className={styles.notesLabel}>Ghi chú gửi hàng:</span>
                                    <p className={styles.notesContent}>"{shipment.notes}"</p>
                                </div>
                            )}

                            {!isOutgoing && !isReceived && (
                                <div className={styles.receiveReminderBox}>
                                    <p>
                                        💡 Khi bưu tá giao kiện sách tới, hãy mở kiểm tra kỹ sách và bấm <strong>"Xác nhận đã nhận sách"</strong> ở bảng <strong>Hành động tiếp theo</strong> bên dưới để kích hoạt thời gian đồng kiểm.
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.emptyLegNotice}>
                            {isOutgoing ? (
                                <div className={styles.emptyNoticeContent}>
                                    <div className={styles.emptyNoticeHeader}>
                                        <Package size={16} className={styles.emptyNoticeIcon} />
                                        <span>Chưa tạo đơn gửi sách</span>
                                    </div>
                                    <p>
                                        Vui lòng đóng gói cẩn thận các cuốn sách trong danh sách và sử dụng nút <strong>"Tạo đơn vận chuyển"</strong> ở bảng <strong>Hành động tiếp theo</strong> bên dưới để hoàn tất gửi sách.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.emptyNoticeContent}>
                                    <div className={styles.emptyNoticeHeader}>
                                        <Clock size={16} className={styles.emptyNoticeIcon} />
                                        <span>Chờ đối tác gửi sách</span>
                                    </div>
                                    <p>
                                        Đối tác đang chuẩn bị sách để gửi. Bạn sẽ nhận được thông báo và mã vận đơn theo dõi ngay khi đối tác hoàn tất gửi sách.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <section className={styles.container} aria-label="Tiến trình giao nhận 2 chiều">
            {/* Header */}
            <div className={styles.cardHeader}>
                <div className={styles.titleIconGroup}>
                    <div className={styles.titleIcon}>
                        <Truck size={22} />
                    </div>
                </div>
                <div className={styles.titleInfo}>
                    <div className={styles.categoryBadge}>
                        <span>Mô hình giao nhận 2 chiều độc lập</span>
                    </div>
                    <h3 className={styles.cardTitle}>Tiến trình giao nhận 2 chiều</h3>
                    <p className={styles.cardSubtitle}>
                        Mỗi bên chủ động đóng gói, gửi sách và tự thanh toán cước phí chiều gửi của mình
                    </p>
                </div>
            </div>

            {/* Overall status banner */}
            <div className={styles.overviewStatusBanner}>
                {bothReceived ? (
                    <div className={`${styles.statusPillLarge} ${styles.statusCompleted}`}>
                        <CheckCircle2 size={16} />
                        <span>Cả 2 gói sách đã được giao nhận thành công · Sẵn sàng tất toán</span>
                    </div>
                ) : bothSent ? (
                    <div className={`${styles.statusPillLarge} ${styles.statusShipping}`}>
                        <Truck size={16} />
                        <span>Cả 2 gói sách đang trên đường vận chuyển · Hãy chú ý điện thoại bưu tá</span>
                    </div>
                ) : viewerSentAt && !partnerSentAt ? (
                    <div className={`${styles.statusPillLarge} ${styles.statusPartial}`}>
                        <Clock size={16} />
                        <span>Bạn đã tạo đơn · Đang chờ đối tác @{detail.partner.username} tạo đơn để bưu tá cùng lấy sách</span>
                    </div>
                ) : !viewerSentAt && partnerSentAt ? (
                    <div className={`${styles.statusPillLarge} ${styles.statusPartial}`}>
                        <Clock size={16} />
                        <span>Đối tác đã tạo đơn · Bạn cần tạo đơn để bưu tá cùng đến lấy sách cả 2 bên</span>
                    </div>
                ) : (
                    <div className={`${styles.statusPillLarge} ${styles.statusWaiting}`}>
                        <Clock size={16} />
                        <span>Chờ cả 2 bên hoàn tất đóng gói và tạo đơn vận chuyển</span>
                    </div>
                )}
            </div>

            {webhookNotice && (
                <div className={styles.webhookAlert}>
                    <Check size={16} /> {webhookNotice}
                </div>
            )}

            {bothSent && !bothReceived && (
                <div className={styles.bothSentBanner}>
                    <AlertCircle size={18} className={styles.bannerIcon} />
                    <div>
                        <strong>Cả 2 gói sách đang trên đường giao nhận!</strong>
                        <p>
                            Khi bạn nhận được bưu phẩm từ bưu tá, hãy mở kiểm tra kỹ tình trạng sách và bấm <em>"Xác nhận đã nhận sách"</em> ở bảng thao tác bên dưới để mở thời gian đồng kiểm 48 giờ.
                        </p>
                    </div>
                </div>
            )}

            {/* Two-Way Grid / Flow */}
            <div className={styles.legsGrid}>
                {renderLegCard({
                    direction: 'outgoing',
                    title: `Sách bạn gửi cho @${detail.partner.username}`,
                    sentAt: viewerSentAt,
                    receivedAt: partnerReceivedAt,
                    shipment: viewerShipment,
                    address: detail.partnerAddress,
                    books: detail.giveBooks
                })}

                <div className={styles.flowConnector}>
                    <div className={styles.connectorLine} />
                    <div className={styles.connectorBadge}>
                        <span>⇄ Trao đổi 2 chiều</span>
                    </div>
                    <div className={styles.connectorLine} />
                </div>

                {renderLegCard({
                    direction: 'incoming',
                    title: `Sách @${detail.partner.username} gửi cho bạn`,
                    sentAt: partnerSentAt,
                    receivedAt: viewerReceivedAt,
                    shipment: partnerShipment,
                    address: detail.viewerAddress,
                    books: detail.receiveBooks
                })}
            </div>

            {/* Escrow POL-14 Guarantee Card */}
            <div className={styles.rulesCallout}>
                <div className={styles.rulesShieldIcon}>
                    <ShieldCheck size={20} />
                </div>
                <div className={styles.rulesCalloutText}>
                    <h5 className={styles.rulesTitle}>Bảo chứng an toàn giao dịch Lật Lại (POL-14)</h5>
                    <p className={styles.rulesDesc}>
                        Toàn bộ số tiền đặt cọc <strong>({detail.viewerFundingAmount ? `${detail.viewerFundingAmount.toLocaleString('vi-VN')} đ` : 'cọc bảo chứng'})</strong> và tiền bù chênh lệch đang được hệ thống giữ an toàn trong quỹ ký quỹ (escrow). Sau khi cả hai bên xác nhận nhận sách, hệ thống sẽ mở khoảng đệm kiểm tra hàng <strong>48 giờ</strong>. Bạn có thể bấm "Xác nhận hài lòng & Nghiệm thu sách" để hoàn tất sớm, hoặc hệ thống sẽ tự động hoàn tất và trả lại tiền cọc khi hết hạn kiểm tra.
                    </p>
                </div>
            </div>
        </section>
    );
}
