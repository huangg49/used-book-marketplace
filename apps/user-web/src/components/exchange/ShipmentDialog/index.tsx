import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Truck,
    PackageCheck,
    AlertCircle,
    MapPin,
    Calendar,
    Building2,
    X,
    Camera,
    Video,
    UploadCloud,
    CheckCircle2,
    Trash2,
    ShieldCheck,
} from 'lucide-react';
import { CARRIERS, type CarrierCode, type ShipmentData, createCarrierShipment } from '../../../services/exchangeShipment';
import styles from './ShipmentDialog.module.css';

interface ShipmentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ShipmentData) => Promise<void>;
    isBusy: boolean;
    exchangeId?: string;
    senderAddress?: { recipientName?: string; phone?: string; detail?: string; localityCode?: string | null };
    receiverAddress?: { recipientName?: string; phone?: string; detail?: string; localityCode?: string | null };
    bookTitle?: string;
}

export function ShipmentDialog(props: ShipmentDialogProps) {
    const { isOpen, onClose, onSubmit, isBusy } = props;
    const [method, setMethod] = useState<'carrier' | 'direct'>('carrier');
    const [carrierCode, setCarrierCode] = useState<CarrierCode>('GHN');
    const [trackingCode, setTrackingCode] = useState('');
    const [customCarrierName, setCustomCarrierName] = useState('');
    const [meetupLocation, setMeetupLocation] = useState('');
    const [meetupTime, setMeetupTime] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [isCreatingGhn, setIsCreatingGhn] = useState(false);
    const [ghnSuccess, setGhnSuccess] = useState('');

    // BA Requirement: Packaging Photo & Video Evidence
    const [packagingPhoto, setPackagingPhoto] = useState<string>('');
    const [packagingPhotoName, setPackagingPhotoName] = useState<string>('');
    const [packagingVideo, setPackagingVideo] = useState<string>('');
    const [packagingVideoName, setPackagingVideoName] = useState<string>('');

    const photoInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    const handlePhotoSelect = (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Vui lòng chọn tệp định dạng hình ảnh (JPG, PNG, WebP).');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('Dung lượng ảnh tối đa là 10MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            setPackagingPhoto(e.target?.result as string);
            setPackagingPhotoName(file.name);
            setError('');
        };
        reader.readAsDataURL(file);
    };

    const handleVideoSelect = (file: File) => {
        if (!file.type.startsWith('video/')) {
            setError('Vui lòng chọn tệp định dạng video (MP4, WebM, MOV).');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            setError('Dung lượng video tối đa là 100MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            setPackagingVideo(e.target?.result as string);
            setPackagingVideoName(file.name);
            setError('');
        };
        reader.readAsDataURL(file);
    };

    const handleApplyDemoEvidence = () => {
        setPackagingPhoto('/demo-evidence/sample-book-damage.jpg');
        setPackagingPhotoName('anh-sach-chua-dong-hop.jpg');
        setPackagingVideo('/demo-evidence/sample-unboxing.mp4');
        setPackagingVideoName('video-dong-goi-niem-phong.mp4');
        if (!notes) {
            setNotes('Đã chụp ảnh kiểm tra 4 góc sách và quay video đóng gói bọc chống sốc 2 lớp kỹ càng.');
        }
        setError('');
    };

    const handleAutoCreateGhn = async () => {
        setIsCreatingGhn(true);
        setError('');
        setGhnSuccess('');
        try {
            const res = await createCarrierShipment(props.exchangeId || 'demo', 'GHN', {
                sender: {
                    recipientName: props.senderAddress?.recipientName,
                    phone: props.senderAddress?.phone,
                    detail: props.senderAddress?.detail,
                    district: props.senderAddress?.localityCode || 'Quận 1',
                },
                receiver: {
                    recipientName: props.receiverAddress?.recipientName,
                    phone: props.receiverAddress?.phone,
                    detail: props.receiverAddress?.detail,
                    district: props.receiverAddress?.localityCode || 'Quận 3',
                },
                itemsSummary: props.bookTitle ? `Sách: ${props.bookTitle}` : undefined,
                notes: notes.trim() || undefined,
            });
            setTrackingCode(res.trackingCode);
            setGhnSuccess(`✓ Tạo đơn GHN thành công! Mã vận đơn: ${res.trackingCode} (Cước: ${res.fee.toLocaleString('vi-VN')} đ)`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Lỗi khi gọi API tạo đơn GHN');
        } finally {
            setIsCreatingGhn(false);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (method === 'carrier') {
            if (!trackingCode.trim()) {
                setError('Vui lòng nhập mã vận đơn để đối tác có thể tra cứu bưu phẩm.');
                return;
            }
            if (carrierCode === 'OTHER' && !customCarrierName.trim()) {
                setError('Vui lòng nhập tên đơn vị vận chuyển.');
                return;
            }
        } else {
            if (!meetupLocation.trim()) {
                setError('Vui lòng nhập địa điểm hẹn gặp giao sách tại TP.HCM.');
                return;
            }
        }

        // Validate BA requirement: both photo and video packaging evidence are required
        if (!packagingPhoto) {
            setError('Bắt buộc: Vui lòng tải lên ảnh chụp hiện trạng sách trước khi đóng gói.');
            return;
        }
        if (!packagingVideo) {
            setError('Bắt buộc: Vui lòng tải lên video quay quá trình đóng gói bưu kiện và dán mã.');
            return;
        }

        const selectedCarrier = CARRIERS.find(c => c.code === carrierCode);
        const data: ShipmentData = {
            method,
            carrierCode: method === 'carrier' ? carrierCode : 'DIRECT',
            carrierName: method === 'carrier'
                ? (carrierCode === 'OTHER' ? customCarrierName.trim() : (selectedCarrier?.name ?? 'Đơn vị vận chuyển'))
                : 'Gặp mặt trực tiếp tại TP.HCM',
            trackingCode: method === 'carrier' ? trackingCode.trim().toUpperCase() : undefined,
            meetupLocation: method === 'direct' ? meetupLocation.trim() : undefined,
            meetupTime: method === 'direct' ? meetupTime.trim() : undefined,
            packagingPhotoUrl: packagingPhoto,
            packagingPhotoName: packagingPhotoName || 'anh-dong-goi.jpg',
            packagingVideoUrl: packagingVideo,
            packagingVideoName: packagingVideoName || 'video-dong-goi.mp4',
            notes: notes.trim() || undefined,
            shippedAt: new Date().toISOString()
        };

        try {
            await onSubmit(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận gửi sách.');
        }
    };

    return createPortal(
        <div className={styles.overlay} onClick={isBusy ? undefined : onClose} role="dialog" aria-modal="true">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerContent}>
                        <div className={styles.headerIcon}>
                            <Truck size={24} />
                        </div>
                        <div>
                            <h2 className={styles.title}>Tạo đơn vận chuyển</h2>
                            <p className={styles.subtitle}>Cung cấp thông tin vận đơn hoặc lịch hẹn để đối tác theo dõi</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={isBusy ? undefined : onClose}
                        aria-label="Đóng"
                        disabled={isBusy}
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.body}>
                        {/* Method Selector */}
                        <div className={styles.methodGroup}>
                            <label className={styles.fieldLabel}>Phương thức giao nhận</label>
                            <div className={styles.methodCards}>
                                <button
                                    type="button"
                                    className={`${styles.methodCard} ${method === 'carrier' ? styles.methodActive : ''}`}
                                    onClick={() => setMethod('carrier')}
                                    disabled={isBusy}
                                >
                                    <Truck size={20} className={styles.methodIcon} />
                                    <div className={styles.methodText}>
                                        <strong>Gửi qua bưu cục / chuyển phát</strong>
                                        <span>GHN, GHTK, Viettel Post, v.v.</span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    className={`${styles.methodCard} ${method === 'direct' ? styles.methodActive : ''}`}
                                    onClick={() => setMethod('direct')}
                                    disabled={isBusy}
                                >
                                    <MapPin size={20} className={styles.methodIcon} />
                                    <div className={styles.methodText}>
                                        <strong>Gặp trực tiếp tại TP.HCM</strong>
                                        <span>Hẹn gặp nhận sách trực tiếp</span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {method === 'carrier' ? (
                            <>
                                <div className={styles.fieldRow}>
                                    <label htmlFor="carrierSelect" className={styles.fieldLabel}>
                                        Đơn vị vận chuyển <span className={styles.required}>*</span>
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <Building2 size={16} className={styles.inputIcon} />
                                        <select
                                            id="carrierSelect"
                                            className={styles.select}
                                            value={carrierCode}
                                            onChange={(e) => setCarrierCode(e.target.value as CarrierCode)}
                                            disabled={isBusy}
                                        >
                                            {CARRIERS.filter(c => c.code !== 'DIRECT').map(carrier => (
                                                <option key={carrier.code} value={carrier.code}>
                                                    {carrier.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {carrierCode === 'OTHER' && (
                                    <div className={styles.fieldRow}>
                                        <label htmlFor="customCarrier" className={styles.fieldLabel}>
                                            Tên đơn vị vận chuyển <span className={styles.required}>*</span>
                                        </label>
                                        <input
                                            id="customCarrier"
                                            type="text"
                                            className={styles.input}
                                            placeholder="Ví dụ: J&T Express, Ninja Van..."
                                            value={customCarrierName}
                                            onChange={(e) => setCustomCarrierName(e.target.value)}
                                            disabled={isBusy}
                                        />
                                    </div>
                                )}

                                {carrierCode === 'GHN' && (
                                    <div className={styles.ghnAutoBox}>
                                        <div className={styles.ghnAutoHeader}>
                                            <span className={styles.ghnBadge}>⚡ Tích hợp GHN Open API</span>
                                            <button
                                                type="button"
                                                className={styles.ghnAutoBtn}
                                                onClick={() => void handleAutoCreateGhn()}
                                                disabled={isBusy || isCreatingGhn}
                                            >
                                                {isCreatingGhn ? 'Đang tạo đơn trên GHN...' : '⚡ Tạo đơn GHN & Lấy mã tự động'}
                                            </button>
                                        </div>
                                        {ghnSuccess && <p className={styles.ghnSuccessMsg}>{ghnSuccess}</p>}
                                    </div>
                                )}

                                <div className={styles.fieldRow}>
                                    <label htmlFor="trackingCode" className={styles.fieldLabel}>
                                        Mã vận đơn / Số bưu gửi <span className={styles.required}>*</span>
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <PackageCheck size={16} className={styles.inputIcon} />
                                        <input
                                            id="trackingCode"
                                            type="text"
                                            className={styles.input}
                                            placeholder="Ví dụ: GHN8492019VN, GHTK19284729"
                                            value={trackingCode}
                                            onChange={(e) => setTrackingCode(e.target.value)}
                                            disabled={isBusy}
                                            autoFocus
                                        />
                                    </div>
                                    <span className={styles.helpText}>Mã được in trên phiếu gửi hoặc trong app nhà vận chuyển</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={styles.fieldRow}>
                                    <label htmlFor="meetupLocation" className={styles.fieldLabel}>
                                        Địa điểm hẹn gặp tại TP.HCM <span className={styles.required}>*</span>
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <MapPin size={16} className={styles.inputIcon} />
                                        <input
                                            id="meetupLocation"
                                            type="text"
                                            className={styles.input}
                                            placeholder="Ví dụ: Cà phê sách Cá Chép, 211 Võ Văn Tần, Q.3"
                                            value={meetupLocation}
                                            onChange={(e) => setMeetupLocation(e.target.value)}
                                            disabled={isBusy}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className={styles.fieldRow}>
                                    <label htmlFor="meetupTime" className={styles.fieldLabel}>
                                        Thời gian hẹn dự kiến
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <Calendar size={16} className={styles.inputIcon} />
                                        <input
                                            id="meetupTime"
                                            type="text"
                                            className={styles.input}
                                            placeholder="Ví dụ: 15:00 Chiều Chủ Nhật (18/10)"
                                            value={meetupTime}
                                            onChange={(e) => setMeetupTime(e.target.value)}
                                            disabled={isBusy}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* =========================================================================
                            BA Requirement: Packaging Evidence (Photos & Video)
                            ========================================================================= */}
                        <div className={styles.evidenceSection}>
                            <div className={styles.evidenceSectionHeader}>
                                <div className={styles.evidenceSectionTitle}>
                                    <ShieldCheck size={18} />
                                    <span>Bằng chứng đóng gói bưu phẩm</span>
                                    <span className={styles.evidenceSectionBadge}>Bắt buộc</span>
                                </div>
                                <p className={styles.evidenceSectionSubtitle}>
                                    Chụp ảnh tình trạng sách và quay video quá trình đóng gói để Admin đối chiếu, bảo vệ quyền lợi nếu đối tác khiếu nại sách hỏng.
                                </p>
                            </div>

                            <div className={styles.evidenceGrid}>
                                {/* 1. Photo Evidence */}
                                <div className={`${styles.evidenceCard} ${packagingPhoto ? styles.evidenceCardFilled : ''}`}>
                                    <div className={styles.evidenceCardHeader}>
                                        <span className={styles.evidenceLabel}>
                                            <Camera size={14} />
                                            <span>1. Ảnh hiện trạng sách *</span>
                                        </span>
                                        {packagingPhoto && (
                                            <button
                                                type="button"
                                                className={styles.evidenceRemoveBtn}
                                                onClick={() => {
                                                    setPackagingPhoto('');
                                                    setPackagingPhotoName('');
                                                }}
                                            >
                                                <Trash2 size={12} style={{ display: 'inline', marginRight: 2 }} /> Xóa
                                            </button>
                                        )}
                                    </div>

                                    {packagingPhoto ? (
                                        <>
                                            <div className={styles.evidencePreviewBox}>
                                                <img
                                                    src={packagingPhoto}
                                                    alt="Ảnh đóng gói"
                                                    className={styles.evidencePreviewImg}
                                                />
                                            </div>
                                            <div className={styles.evidenceFileDetails}>
                                                <CheckCircle2 size={13} color="#16a34a" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                                <span>{packagingPhotoName || 'Ảnh hiện trạng'}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            className={styles.evidenceUploadTrigger}
                                            onClick={() => photoInputRef.current?.click()}
                                        >
                                            <UploadCloud size={20} color="#64748b" />
                                            <span className={styles.evidenceUploadText}>Tải ảnh chụp sách</span>
                                            <span className={styles.evidenceUploadHint}>JPG, PNG, WebP tối đa 10MB</span>
                                        </div>
                                    )}
                                    <input
                                        ref={photoInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handlePhotoSelect(f);
                                        }}
                                    />
                                </div>

                                {/* 2. Video Evidence */}
                                <div className={`${styles.evidenceCard} ${packagingVideo ? styles.evidenceCardFilled : ''}`}>
                                    <div className={styles.evidenceCardHeader}>
                                        <span className={styles.evidenceLabel}>
                                            <Video size={14} />
                                            <span>2. Video đóng gói *</span>
                                        </span>
                                        {packagingVideo && (
                                            <button
                                                type="button"
                                                className={styles.evidenceRemoveBtn}
                                                onClick={() => {
                                                    setPackagingVideo('');
                                                    setPackagingVideoName('');
                                                }}
                                            >
                                                <Trash2 size={12} style={{ display: 'inline', marginRight: 2 }} /> Xóa
                                            </button>
                                        )}
                                    </div>

                                    {packagingVideo ? (
                                        <>
                                            <div className={styles.evidencePreviewBox}>
                                                <video
                                                    src={packagingVideo}
                                                    controls
                                                    preload="metadata"
                                                    className={styles.evidencePreviewVideo}
                                                />
                                            </div>
                                            <div className={styles.evidenceFileDetails}>
                                                <CheckCircle2 size={13} color="#16a34a" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                                <span>{packagingVideoName || 'Video đóng gói'}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            className={styles.evidenceUploadTrigger}
                                            onClick={() => videoInputRef.current?.click()}
                                        >
                                            <UploadCloud size={20} color="#64748b" />
                                            <span className={styles.evidenceUploadText}>Tải video đóng gói</span>
                                            <span className={styles.evidenceUploadHint}>MP4, WebM tối đa 100MB</span>
                                        </div>
                                    )}
                                    <input
                                        ref={videoInputRef}
                                        type="file"
                                        accept="video/mp4,video/webm"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleVideoSelect(f);
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Demo quick fill button */}
                            <div className={styles.evidenceQuickPresetRow}>
                                <button
                                    type="button"
                                    className={styles.evidenceQuickBtn}
                                    onClick={handleApplyDemoEvidence}
                                    title="Tự động điền ảnh và video đóng gói mẫu chuẩn để kiểm thử nhanh"
                                >
                                    ⚡ Nạp nhanh chứng cứ đóng gói mẫu (Ảnh sách + Video niêm phong)
                                </button>
                            </div>
                        </div>

                        <div className={styles.fieldRow}>
                            <label htmlFor="shipmentNotes" className={styles.fieldLabel}>
                                Ghi chú cho đối tác (tùy chọn)
                            </label>
                            <textarea
                                id="shipmentNotes"
                                className={styles.textarea}
                                rows={2}
                                placeholder="Ví dụ: Đã bọc chống sốc 2 lớp cẩn thận, bưu tá giao trong giờ hành chính..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                disabled={isBusy}
                            />
                        </div>

                        {/* Notice box */}
                        <div className={styles.policyNotice}>
                            <AlertCircle size={18} className={styles.noticeIcon} />
                            <div className={styles.noticeText}>
                                <strong>Nguyên tắc trao đổi hai chiều:</strong> Mỗi bên chủ động gửi sách của chiều mình. Hệ thống không thu phí giao hàng. Tiền đặt cọc bảo chứng vẫn được Lật Lại giữ an toàn cho đến khi cả hai bên xác nhận đã nhận sách.
                            </div>
                        </div>

                        {error && (
                            <div className={styles.errorMessage} role="alert">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={onClose}
                            disabled={isBusy}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className={styles.btnPrimary}
                            disabled={isBusy}
                        >
                            {isBusy ? 'Đang tạo đơn...' : 'Tạo đơn vận chuyển'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
