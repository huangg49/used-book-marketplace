import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    FileSignature, 
    X, 
    ArrowLeftRight, 
    Banknote, 
    ShieldCheck, 
    MapPin, 
    Plus, 
    CheckCircle2,
    AlertTriangle,
    Lock,
    SlidersHorizontal,
    RotateCcw,
    ArrowUpRight,
    ArrowDownLeft,
    Scale,
    Coins,
    Info
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import type { CounterOfferData } from '../CounterDialog';
import { getWalletSummary } from '../../../services/wallet';
import { session } from '../../../lib/session';
import { BookCover } from '../../BookCover';
import { formatVnd } from '../../../lib/routes';
import styles from './AcceptExchangeDialog.module.css';

const addressBookSchema = z.object({
  version: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      phone: z.string(),
      serviceAreaCode: z.string(),
      localityCode: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
      version: z.number().int(),
    }),
  ),
});

const serviceAreasSchema = z.object({
  code: z.literal('HCM-DEMO-v1'),
  name: z.literal('TP.HCM'),
  demoOnly: z.literal(true),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});

const addressReceiptSchema = z.object({
  addressId: z.string().uuid(),
  version: z.number().int(),
});

interface AcceptExchangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    deliveryAddressId?: string;
  }) => Promise<void>;
  onCounter?: (data: CounterOfferData) => Promise<void>;
  isBusy: boolean;
  detail: ExchangeDetail;
}

export function AcceptExchangeDialog({
  isOpen,
  onClose,
  onConfirm,
  onCounter,
  isBusy,
  detail,
}: AcceptExchangeDialogProps) {
  const [addressMode, setAddressMode] = useState<'existing' | 'new'>('existing');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  
  // New address form fields (viewer)
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLocalityCode, setNewLocalityCode] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [error, setError] = useState('');

  // Compensation Negotiation states
  const isAlreadyNegotiated = detail.negotiatedDiffAmount != null;
  const receiveBooks = detail.receiveBooks;
  const giveBooks = detail.giveBooks;
  const totalReceivePrice = receiveBooks.reduce((sum, b) => sum + (b.price || 0), 0);
  const totalGivePrice = giveBooks.reduce((sum, b) => sum + (b.price || 0), 0);
  const defaultDiffAmount = Math.abs(totalReceivePrice - totalGivePrice);

  const [isNegotiating, setIsNegotiating] = useState(false);
  const [negotiatedDiff, setNegotiatedDiff] = useState<number>(detail.moneyAmount ?? defaultDiffAmount);
  const initialPayer = detail.moneyCompensationType === 'user_pays'
    ? 'viewer'
    : (detail.moneyCompensationType === 'other_pays' ? 'partner' : 'none');
  const [negotiatedPayer, setNegotiatedPayer] = useState<'viewer' | 'partner' | 'none'>(initialPayer);

  const addresses = useQuery({
    queryKey: ['address-book'],
    queryFn: () => session.request('/me/addresses', addressBookSchema),
    enabled: isOpen,
  });

  const areas = useQuery({
    queryKey: ['service-areas'],
    queryFn: () => session.request('/service-areas', serviceAreasSchema),
    enabled: isOpen,
  });

  const wallet = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: getWalletSummary,
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      setError('');
      setAddressMode('existing');
      setIsNegotiating(false);
      setNegotiatedDiff(detail.moneyAmount ?? defaultDiffAmount);
      setNegotiatedPayer(
        detail.moneyCompensationType === 'user_pays'
          ? 'viewer'
          : (detail.moneyCompensationType === 'other_pays' ? 'partner' : 'none')
      );

      if (addresses.data?.items?.length) {
        const def = addresses.data.items.find((a) => a.isDefault) ?? addresses.data.items[0];
        setSelectedAddressId(def.id);
      } else {
        setAddressMode('new');
      }
    }
  }, [isOpen, addresses.data, detail.moneyAmount, detail.negotiatedDiffAmount, defaultDiffAmount, detail.moneyCompensationType]);

  if (!isOpen) return null;

  const currentDiff = isNegotiating
    ? (negotiatedPayer === 'none' ? 0 : negotiatedDiff)
    : (detail.moneyAmount ?? defaultDiffAmount);
  let effectiveCompensationNotice = 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
  let effectiveFundingAmount = totalReceivePrice;

  if (isNegotiating) {
    if (negotiatedPayer === 'viewer') {
      effectiveCompensationNotice = currentDiff > 0
        ? `Bạn sẽ bù thêm cho đối tác (theo thỏa thuận mới): ${formatVnd(currentDiff)}`
        : 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalReceivePrice + currentDiff;
    } else if (negotiatedPayer === 'partner') {
      effectiveCompensationNotice = currentDiff > 0
        ? `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn (theo thỏa thuận mới): ${formatVnd(currentDiff)}`
        : 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalReceivePrice;
    } else {
      effectiveCompensationNotice = 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalReceivePrice;
    }
  } else {
    if (detail.moneyCompensationType === 'user_pays' && (detail.moneyAmount ?? 0) > 0) {
      effectiveCompensationNotice = isAlreadyNegotiated
        ? `Bạn cần bù thêm (đã chốt theo thương lượng): ${formatVnd(detail.moneyAmount!)}`
        : `Bạn cần bù thêm: ${formatVnd(detail.moneyAmount!)}`;
      effectiveFundingAmount = totalReceivePrice + detail.moneyAmount!;
    } else if (detail.moneyCompensationType === 'other_pays' && (detail.moneyAmount ?? 0) > 0) {
      effectiveCompensationNotice = isAlreadyNegotiated
        ? `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn (đã chốt theo thương lượng): ${formatVnd(detail.moneyAmount!)}`
        : `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn: ${formatVnd(detail.moneyAmount!)}`;
      effectiveFundingAmount = totalReceivePrice;
    } else {
      effectiveFundingAmount = totalReceivePrice;
    }
  }

  const availableBalance = wallet.data?.available ?? 0;
  const isBalanceSufficient = availableBalance >= effectiveFundingAmount;
  const missingBalance = Math.max(0, effectiveFundingAmount - availableBalance);

  const defaultAddr = addresses.data?.items.find((a) => a.isDefault) ?? addresses.data?.items[0];
  const defaultRecipientName = defaultAddr?.recipientName || '';
  const defaultPhone = defaultAddr?.phone || '';

  const resolveAddressId = async () => {
    if (addressMode === 'existing') return selectedAddressId;
    const nameTrim = newRecipientName.trim() || defaultRecipientName;
    const phoneTrim = newPhone.trim() || defaultPhone;
    const detailTrim = newDetail.trim();

    if (!nameTrim || nameTrim.length < 2) {
      throw new Error('Vui lòng nhập họ tên người nhận.');
    }
    if (!phoneTrim) {
      throw new Error('Vui lòng nhập số điện thoại người nhận.');
    }
    if (!/^0[0-9]{9}$/.test(phoneTrim)) {
      throw new Error('Số điện thoại nhận hàng phải gồm đúng 10 chữ số (bắt đầu bằng 0).');
    }
    if (!newLocalityCode) {
      throw new Error('Vui lòng chọn Khu vực / Quận huyện tại TP.HCM.');
    }
    if (detailTrim.length < 5) {
      throw new Error('Địa chỉ chi tiết phải có ít nhất 5 ký tự (số nhà, tên đường, phường...).');
    }

    const saved = await session.request(
      '/me/addresses',
      addressReceiptSchema,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedBookVersion: addresses.data?.version ?? 0,
          address: {
            recipientName: nameTrim,
            phone: phoneTrim,
            localityCode: newLocalityCode,
            detail: detailTrim,
            serviceAreaCode: 'HCM-DEMO-v1',
          },
          makeDefault: false,
        }),
      },
    );
    await addresses.refetch();
    return saved.addressId;
  };

  const handleConfirmSubmit = async () => {
    setError('');
    try {
      const finalAddressId = await resolveAddressId();
      await onConfirm({
        deliveryAddressId: finalAddressId || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận đề nghị.');
    }
  };

  const handleCounterSubmit = async () => {
    setError('');
    const finalDiff = negotiatedPayer === 'none' ? 0 : negotiatedDiff;
    if (finalDiff < 0) {
      setError('Tiền bù không thể là số âm.');
      return;
    }
    const finalPayerId = negotiatedPayer === 'none' || finalDiff === 0
      ? null
      : (negotiatedPayer === 'viewer' ? detail.viewer.id : detail.partner.id);

    try {
      const finalAddressId = await resolveAddressId();
      if (onCounter) {
        const payerDesc = finalPayerId === null
          ? 'đổi ngang 0 đ'
          : (finalPayerId === detail.viewer.id ? 'bạn bù' : 'đối tác bù');
        await onCounter({
          negotiatedDiffAmount: finalDiff,
          diffPayerId: finalPayerId,
          deliveryAddressId: finalAddressId || undefined,
          note: `Thương lượng tiền bù: ${formatVnd(finalDiff)} (${payerDesc})`,
        });
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi đề xuất điều chỉnh.');
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && !isBusy && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="accept-contract-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <FileSignature size={24} />
            </div>
            <div>
              <h2 id="accept-contract-title" className={styles.title}>
                Xác nhận hợp đồng trao đổi
              </h2>
              <p className={styles.subtitle}>
                Kiểm tra đầy đủ thông tin sách, điều khoản tài chính và địa chỉ nhận hàng trước khi khóa giao dịch.
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} disabled={isBusy} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Section 1: Books */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <ArrowLeftRight size={15} /> Sách tham gia trao đổi
            </h3>
            <div className={styles.booksGrid}>
              {/* Sách nhận */}
              <div className={styles.bookBox}>
                <div className={styles.bookBoxHeader}>
                  <span className={styles.boxPillReceive}>Sách bạn nhận ({receiveBooks.length})</span>
                  <span className={styles.boxTotalValue}>Tổng: {formatVnd(totalReceivePrice)}</span>
                </div>
                <div className={styles.bookItemsList}>
                  {receiveBooks.map((book) => (
                    <div key={book.id} className={styles.bookItemRow}>
                      <div className={styles.bookCoverThumb}>
                        <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                      </div>
                      <div className={styles.bookItemText}>
                        <p className={styles.bookItemTitle} title={book.title}>{book.title}</p>
                        <p className={styles.bookItemAuthor}>{book.author}</p>
                        <div className={styles.bookItemMeta}>
                          <span className={styles.conditionBadge}>{book.condition || 'Chưa rõ'}</span>
                          <span className={styles.priceText}>{formatVnd(book.price || 0)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sách giao */}
              <div className={styles.bookBox}>
                <div className={styles.bookBoxHeader}>
                  <span className={styles.boxPillGive}>Sách bạn giao ({giveBooks.length})</span>
                  <span className={styles.boxTotalValue}>Tổng: {formatVnd(totalGivePrice)}</span>
                </div>
                <div className={styles.bookItemsList}>
                  {giveBooks.map((book) => (
                    <div key={book.id} className={styles.bookItemRow}>
                      <div className={styles.bookCoverThumb}>
                        <BookCover title={book.title} coverUrl={book.coverUrl} index={0} />
                      </div>
                      <div className={styles.bookItemText}>
                        <p className={styles.bookItemTitle} title={book.title}>{book.title}</p>
                        <p className={styles.bookItemAuthor}>{book.author}</p>
                        <div className={styles.bookItemMeta}>
                          <span className={styles.conditionBadge}>{book.condition || 'Chưa rõ'}</span>
                          <span className={styles.priceText}>{formatVnd(book.price || 0)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Financial Terms */}
          <div className={styles.section}>
            <div className={styles.compHeaderRow}>
              <h3 className={styles.sectionTitle}>
                <Banknote size={15} /> Thỏa thuận tài chính
              </h3>
              {isAlreadyNegotiated ? (
                <div className={styles.lockedBadge}>
                  <Lock size={12} /> Đã chốt theo thương lượng của đối tác
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className={styles.lockedBadge}>
                    <ShieldCheck size={13} /> Theo giá trị sách đã duyệt
                  </div>
                  {onCounter && (
                    <button
                      type="button"
                      className={isNegotiating ? styles.headerResetBtn : styles.headerToggleBtn}
                      onClick={() => {
                        setIsNegotiating(!isNegotiating);
                        if (!isNegotiating) setNegotiatedDiff(defaultDiffAmount);
                      }}
                    >
                      {isNegotiating ? (
                        <>
                          <RotateCcw size={12} /> Khôi phục mặc định
                        </>
                      ) : (
                        <>
                          <SlidersHorizontal size={12} /> Thỏa thuận lại tiền bù
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.financialBox}>
              <div className={styles.financialRow}>
                <Banknote size={18} className={styles.financialIcon} />
                <div className={styles.financialContent}>
                  <p className={styles.financialLabel}>
                    {isAlreadyNegotiated || isNegotiating ? 'Tiền bù (theo thương lượng)' : 'Tiền bù tính từ giá trị sách'}
                  </p>
                  <p className={styles.financialDesc}>{effectiveCompensationNotice}</p>
                </div>
              </div>

              {isNegotiating && (
                <div className={styles.negotiationCard}>
                  <div className={styles.negotiationCardHeader}>
                    <SlidersHorizontal size={14} className={styles.negotiationCardHeaderIcon} />
                    <span>Chọn bên bù tiền theo thỏa thuận trong chat:</span>
                  </div>

                  <div className={styles.payerSelectorGroup}>
                    <button
                      type="button"
                      className={`${styles.payerOptionBtn} ${negotiatedPayer === 'viewer' ? styles.payerOptionBtnActive : ''}`}
                      onClick={() => {
                        setNegotiatedPayer('viewer');
                        if (negotiatedDiff === 0) setNegotiatedDiff(defaultDiffAmount || 10000);
                      }}
                    >
                      <span className={styles.payerOptionIcon}>
                        <ArrowUpRight size={14} />
                      </span>
                      <span>Bạn bù cho đối tác</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.payerOptionBtn} ${negotiatedPayer === 'partner' ? styles.payerOptionBtnActive : ''}`}
                      onClick={() => {
                        setNegotiatedPayer('partner');
                        if (negotiatedDiff === 0) setNegotiatedDiff(defaultDiffAmount || 10000);
                      }}
                    >
                      <span className={styles.payerOptionIcon}>
                        <ArrowDownLeft size={14} />
                      </span>
                      <span>Đối tác bù cho bạn</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.payerOptionBtn} ${negotiatedPayer === 'none' ? styles.payerOptionBtnActive : ''}`}
                      onClick={() => {
                        setNegotiatedPayer('none');
                        setNegotiatedDiff(0);
                      }}
                    >
                      <span className={styles.payerOptionIcon}>
                        <Scale size={14} />
                      </span>
                      <span>Đổi ngang (0 đ)</span>
                    </button>
                  </div>

                  {negotiatedPayer === 'none' ? (
                    <div className={styles.evenCompensationBanner}>
                      <CheckCircle2 size={16} className={styles.evenCompensationIcon} />
                      <span>Hai bên thống nhất đổi ngang sách — không phát sinh tiền bù chênh lệch.</span>
                    </div>
                  ) : (
                    <div>
                      <label className={styles.amountInputLabel}>
                        {negotiatedPayer === 'viewer'
                          ? 'Số tiền bạn sẽ bù thêm cho đối tác:'
                          : `Số tiền đối tác (${detail.partner.username}) sẽ bù thêm cho bạn:`}
                      </label>
                      <div className={styles.amountInputWrapper}>
                        <span className={styles.amountInputPrefix}>
                          <Coins size={16} />
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          className={styles.amountInput}
                          value={negotiatedDiff}
                          onChange={(e) => setNegotiatedDiff(Math.max(0, parseInt(e.target.value) || 0))}
                          placeholder="Nhập số tiền đã chốt"
                        />
                        <span className={styles.amountInputSuffix}>VNĐ</span>
                      </div>
                    </div>
                  )}

                  <div className={styles.depositDisclaimer}>
                    <Info size={14} className={styles.depositDisclaimerIcon} />
                    <span>Tiền cọc sách ({formatVnd(totalReceivePrice)}) luôn giữ nguyên theo giá trị sách để bảo chứng an toàn tài sản.</span>
                  </div>
                </div>
              )}

              <div className={styles.financialRow}>
                <ShieldCheck size={18} className={styles.financialIcon} />
                <div className={styles.financialContent}>
                  <p className={styles.financialLabel}>Tổng tiền cần nộp của bạn</p>
                  <p className={styles.financialDesc}>
                    <strong>{formatVnd(effectiveFundingAmount)}</strong>
                    {' '}(Gồm cọc sách bạn nhận và tiền bù nếu bạn là bên bù. Cọc được hoàn khi giao dịch hoàn tất hợp lệ; tiền bù chuyển cho đối tác).
                  </p>
                  {wallet.data && (
                    <div className={isBalanceSufficient ? styles.balanceOkBadge : styles.balanceWarningBadge}>
                      {isBalanceSufficient ? (
                        <>
                          <CheckCircle2 size={13} className={styles.balanceIconOk} />
                          <span>
                            Số dư ví hiện tại: <strong>{formatVnd(availableBalance)}</strong> — Đủ để tiến hành đặt cọc ngay.
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={13} className={styles.balanceIconWarn} />
                          <span>
                            Số dư ví hiện tại: <strong>{formatVnd(availableBalance)}</strong>. Bạn sẽ cần nạp thêm ít nhất <strong>{formatVnd(missingBalance)}</strong> ở bước tiếp theo để hoàn tất đặt cọc (có 24h để nạp).
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Delivery Address */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <MapPin size={15} /> Địa chỉ giao nhận sách
            </h3>
            <div className={styles.addressBox}>
              <div>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '0 0 6px', fontWeight: 600 }}>
                  ĐỐI TÁC SẼ NHẬN SÁCH TẠI:
                </p>
                <div className={styles.partnerAddressText}>
                  {detail.partnerAddress ? (
                    <>
                      <strong>{detail.partnerAddress.recipientName}</strong> · {detail.partnerAddress.phone} · {detail.partnerAddress.detail}
                    </>
                  ) : (
                    'Đối tác đã chọn hoặc sẽ cập nhật từ sổ địa chỉ của họ.'
                  )}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 8px' }}>
                  <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0, fontWeight: 600 }}>
                    ĐỊA CHỈ NHẬN SÁCH CỦA BẠN:
                  </p>
                  {addresses.data?.items && addresses.data.items.length > 0 && (
                    <button
                      type="button"
                      className={styles.btnNewAddressToggle}
                      onClick={() => setAddressMode(addressMode === 'existing' ? 'new' : 'existing')}
                    >
                      {addressMode === 'existing' ? <><Plus size={14} /> Thêm địa chỉ mới</> : 'Chọn địa chỉ có sẵn'}
                    </button>
                  )}
                </div>

                {addressMode === 'existing' ? (
                  <div className={styles.addressOptionsList}>
                    {addresses.data?.items?.map((addr) => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <label
                          key={addr.id}
                          className={styles.addressOptionCard}
                          data-selected={isSelected}
                        >
                          <input
                            type="radio"
                            name="accept-address"
                            className={styles.addressRadio}
                            checked={isSelected}
                            onChange={() => setSelectedAddressId(addr.id)}
                            disabled={isBusy}
                          />
                          <div className={styles.addressOptionDetails}>
                            <div>
                              <span className={styles.recipientNameText}>{addr.recipientName}</span>
                              <span className={styles.phoneText}>{addr.phone}</span>
                              {addr.isDefault && <span className={styles.defaultBadge}>Mặc định</span>}
                            </div>
                            <div className={styles.addressDetailText}>{addr.detail}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--paper)', padding: 12, borderRadius: 4, border: '1px solid var(--line)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input
                        type="text"
                        placeholder="Họ tên người nhận"
                        value={newRecipientName}
                        onChange={(e) => setNewRecipientName(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 13 }}
                      />
                      <input
                        type="tel"
                        placeholder="Số điện thoại (10 chữ số)"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 13 }}
                      />
                    </div>
                    <select
                      value={newLocalityCode}
                      onChange={(e) => setNewLocalityCode(e.target.value)}
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 13, background: '#fff' }}
                    >
                      <option value="">-- Chọn Quận / Huyện phục vụ (TP.HCM) --</option>
                      {areas.data?.localities.map((loc) => (
                        <option key={loc.code} value={loc.code}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Số nhà, tên đường, phường..."
                      value={newDetail}
                      onChange={(e) => setNewDetail(e.target.value)}
                      style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 13 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={isNegotiating ? styles.noticeBoxCounter : styles.noticeBox}>
            {isNegotiating ? (
              <>
                <strong>Điều chỉnh tiền bù:</strong> Sau khi gửi đề xuất điều chỉnh, thông tin sẽ được chuyển sang đối tác trong hội thoại chat. Đối tác sẽ kiểm tra điều khoản và bấm <strong>Đồng ý & Khóa giao dịch</strong>.
              </>
            ) : (
              <>
                Khi chấp nhận, hệ thống kiểm tra lại sách và thỏa thuận trước khi giữ sách.
                Nếu còn hợp lệ, hai bên có 24 giờ để nộp đủ cọc và tiền bù trước khi gửi sách.
              </>
            )}
          </div>

          {error && <p className={styles.errorText} role="alert">{error}</p>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isBusy}
          >
            Hủy
          </button>
          {isNegotiating ? (
            <button
              type="button"
              className={styles.btnConfirmCounter}
              onClick={handleCounterSubmit}
              disabled={isBusy}
            >
              <ArrowLeftRight size={16} /> {isBusy ? 'Đang gửi...' : 'Gửi đề xuất điều chỉnh cho đối tác'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnConfirm}
              onClick={handleConfirmSubmit}
              disabled={isBusy}
            >
              <CheckCircle2 size={16} /> {isBusy ? 'Đang xử lý...' : 'Đồng ý & Khóa giao dịch'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
