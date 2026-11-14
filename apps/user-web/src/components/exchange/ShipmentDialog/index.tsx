import { useState, useRef, useEffect, type FormEvent } from 'react';
import {
    Truck,
    PackageCheck,
    MapPin,
    Calendar,
    Building2,
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
    partnerMethod?: ShipmentData['method'];
}

export function ShipmentDialog(props: ShipmentDialogProps) {
    const { isOpen, onClose, onSubmit, isBusy } = props;
    const [method, setMethod] = useState<'carrier' | 'direct'>('carrier');
    const selectedMethod = props.partnerMethod ?? method;
    const [carrierCode, setCarrierCode] = useState<CarrierCode>(import.meta.env.DEV ? 'SIMULATOR' : 'OTHER');
    const [trackingCode, setTrackingCode] = useState('');
    const [customCarrierName, setCustomCarrierName] = useState('');
    const [meetupLocation, setMeetupLocation] = useState('');
    const [meetupTime, setMeetupTime] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [isCreatingDemoLabel, setIsCreatingDemoLabel] = useState(false);
    const [demoLabelNotice, setDemoLabelNotice] = useState('');

    // BA Requirement: Packaging Photo & Video Evidence
    const [packagingPhoto, setPackagingPhoto] = useState<string>('');
    const [packagingPhotoName, setPackagingPhotoName] = useState<string>('');
    const [packagingVideo, setPackagingVideo] = useState<string>('');
    const [packagingVideoName, setPackagingVideoName] = useState<string>('');

    const photoInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const unavailable = isBusy || isCreatingDemoLabel;

    useEffect(() => {
        if (isOpen) headingRef.current?.focus();
    }, [isOpen]);

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

    const handleCreateDemoLabel = async () => {
        setIsCreatingDemoLabel(true);
        setError('');
        setDemoLabelNotice('');
        try {
            const res = await createCarrierShipment(props.exchangeId || 'demo', 'SIMULATOR', {
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
            setDemoLabelNotice(`Đã tạo mã demo ${res.trackingCode} (Cước: ${res.fee.toLocaleString('vi-VN')} đ)`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Chưa tạo được mã vận đơn demo');
        } finally {
            setIsCreatingDemoLabel(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (unavailable) return;
        setError('');

        if (selectedMethod === 'carrier') {
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
            method: selectedMethod,
            carrierCode: selectedMethod === 'carrier' ? carrierCode : 'DIRECT',
            carrierName: selectedMethod === 'carrier'
                ? (carrierCode === 'OTHER' ? customCarrierName.trim() : (selectedCarrier?.name ?? 'Đơn vị vận chuyển'))
                : 'Gặp mặt trực tiếp tại TP.HCM',
            trackingCode: selectedMethod === 'carrier' ? trackingCode.trim().toUpperCase() : undefined,
            meetupLocation: selectedMethod === 'direct' ? meetupLocation.trim() : undefined,
            meetupTime: selectedMethod === 'direct' ? meetupTime.trim() : undefined,
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

    return (
        <section className={styles.inline} id="exchange-shipment-form" hidden={!isOpen} aria-labelledby="exchange-shipment-heading">
                <div className={styles.header}>
                    <h3 ref={headingRef} tabIndex={-1} id="exchange-shipment-heading" className={styles.title}>Thông tin gửi sách</h3>
                </div>

                <form onSubmit={handleSubmit} aria-label="Thông tin gửi sách">
                    <div className={styles.body}>
                        {/* Method Selector */}
                        <div className={styles.methodGroup}>
                            <span className={styles.fieldLabel}>Phương thức giao nhận</span>
                            <div className={styles.methodCards}>
                                <button
                                    type="button"
                                    className={`${styles.methodCard} ${selectedMethod === 'carrier' ? styles.methodActive : ''}`}
                                    onClick={() => setMethod('carrier')}
                                    aria-pressed={selectedMethod === 'carrier'}
                                    disabled={isBusy || props.partnerMethod === 'direct'}
                                >
                                    <Truck size={20} className={styles.methodIcon} />
                                    <div className={styles.methodText}>
                                        <strong>Gửi qua chuyển phát</strong>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    className={`${styles.methodCard} ${selectedMethod === 'direct' ? styles.methodActive : ''}`}
                                    onClick={() => setMethod('direct')}
                                    aria-pressed={selectedMethod === 'direct'}
                                    disabled={isBusy || props.partnerMethod === 'carrier'}
                                >
                                    <MapPin size={20} className={styles.methodIcon} />
                                    <div className={styles.methodText}>
                                        <strong>Gặp trực tiếp tại TP.HCM</strong>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {selectedMethod === 'carrier' ? (
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
                                            {CARRIERS.filter(c => c.code !== 'DIRECT' && (import.meta.env.DEV || c.code !== 'SIMULATOR')).map(carrier => (
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

                                {carrierCode === 'SIMULATOR' && (
                                    <div className={styles.ghnAutoBox}>
                                        <div className={styles.ghnAutoHeader}>
                                            <span className={styles.ghnBadge}>Vận đơn mô phỏng</span>
                                            <button
                                                type="button"
                                                className={styles.ghnAutoBtn}
                                                onClick={() => void handleCreateDemoLabel()}
                                                disabled={isBusy || isCreatingDemoLabel}
                                            >
                                                {isCreatingDemoLabel ? 'Đang tạo mã demo…' : 'Tạo mã vận đơn demo'}
                                            </button>
                                        </div>
                                        {demoLabelNotice && <p className={styles.ghnSuccessMsg}>{demoLabelNotice}</p>}
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
                                    <span>Ảnh và video đóng gói</span>
                                    <span className={styles.evidenceSectionBadge}>Bắt buộc</span>
                                </div>
                                <p className={styles.evidenceSectionSubtitle}>
                                    Dùng để đối chiếu khi có báo cáo sự cố.
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
                                                aria-label="Xóa ảnh đóng gói"
                                                disabled={unavailable}
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
                                        <button type="button"
                                            className={styles.evidenceUploadTrigger}
                                            onClick={() => photoInputRef.current?.click()}
                                            disabled={unavailable}
                                        >
                                            <UploadCloud size={20} color="#64748b" />
                                            <span className={styles.evidenceUploadText}>Tải ảnh chụp sách</span>
                                            <span className={styles.evidenceUploadHint}>JPG, PNG, WebP tối đa 10MB</span>
                                        </button>
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
                                                aria-label="Xóa video đóng gói"
                                                disabled={unavailable}
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
                                        <button type="button"
                                            className={styles.evidenceUploadTrigger}
                                            onClick={() => videoInputRef.current?.click()}
                                            disabled={unavailable}
                                        >
                                            <UploadCloud size={20} color="#64748b" />
                                            <span className={styles.evidenceUploadText}>Tải video đóng gói</span>
                                            <span className={styles.evidenceUploadHint}>MP4, WebM tối đa 100MB</span>
                                        </button>
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

                            <div className={styles.evidenceQuickPresetRow}>
                                <button
                                    type="button"
                                    className={styles.evidenceQuickBtn}
                                    onClick={handleApplyDemoEvidence}
                                    disabled={unavailable}
                                >
                                    Dùng ảnh và video mẫu
                                </button>
                            </div>
                        </div>

                        <details className={styles.optional}>
                            <summary>Thêm ghi chú cho đối tác</summary>
                            <textarea
                                id="shipmentNotes"
                                aria-label="Ghi chú cho đối tác"
                                className={styles.textarea}
                                rows={2}
                                placeholder="Ví dụ: Đã bọc chống sốc 2 lớp cẩn thận, bưu tá giao trong giờ hành chính..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                disabled={isBusy}
                            />
                        </details>

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
                            disabled={unavailable}
                        >
                            Thu gọn
                        </button>
                        <button
                            type="submit"
                            className={styles.btnPrimary}
                            disabled={unavailable}
                        >
                            {isBusy ? 'Đang lưu…' : 'Lưu thông tin gửi'}
                        </button>
                    </div>
                </form>
        </section>
    );
}
