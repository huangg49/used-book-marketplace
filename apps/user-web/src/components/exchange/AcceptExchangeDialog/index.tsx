import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    FileSignature, 
    X, 
    ArrowLeftRight, 
    Banknote, 
    ShieldCheck, 
    MapPin, 
    CheckCircle2,
    AlertTriangle,
    Lock,
    SlidersHorizontal,
    RotateCcw,
    ArrowUpRight,
    ArrowDownLeft,
    Scale,
    Coins
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
import type { CounterOfferData } from '../CounterDialog';
import { getWalletSummary } from '../../../services/wallet';
import { serviceAreasQuery } from '../../../services/service-areas';
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
  const [diffInputText, setDiffInputText] = useState<string>(() =>
    new Intl.NumberFormat('vi-VN').format(detail.moneyAmount ?? defaultDiffAmount)
  );

  const updateNegotiatedDiff = (amount: number) => {
    setNegotiatedDiff(amount);
    setDiffInputText(amount > 0 ? new Intl.NumberFormat('vi-VN').format(amount) : '');
  };

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
    ...serviceAreasQuery,
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
      const initialDiff = detail.moneyAmount ?? defaultDiffAmount;
      setNegotiatedDiff(initialDiff);
      setDiffInputText(new Intl.NumberFormat('vi-VN').format(initialDiff));
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
              <FileSignature size={18} />
            </div>
            <h2 id="accept-contract-title" className={styles.title}>
              Xác nhận hợp đồng trao đổi
            </h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} disabled={isBusy} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.columnsGrid}>
            {/* Left Column: Sách trao đổi */}
            <div className={styles.colBooks}>
              <h3 className={styles.sectionTitle}>
                <ArrowLeftRight size={13} /> Sách trao đổi
              </h3>
              <div className={styles.booksContainer}>
                {/* Sách nhận */}
                <div className={styles.bookBox}>
                  <div className={styles.bookBoxHeader}>
                    <span className={styles.boxPillReceive}>Bạn nhận ({receiveBooks.length})</span>
                    <span className={styles.boxTotalValue}>{formatVnd(totalReceivePrice)}</span>
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
                    <span className={styles.boxPillGive}>Bạn giao ({giveBooks.length})</span>
                    <span className={styles.boxTotalValue}>{formatVnd(totalGivePrice)}</span>
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

            {/* Right Column: Tài chính & Địa chỉ */}
            <div className={styles.colTerms}>
              {/* Tài chính */}
              <div className={styles.sectionCompact}>
                <div className={styles.compHeaderRow}>
                  <h3 className={styles.sectionTitle}>
                    <Banknote size={13} /> Thỏa thuận tài chính
                  </h3>
                  {isAlreadyNegotiated ? (
                    <div className={styles.lockedBadge}>
                      <Lock size={11} /> Đã chốt theo thương lượng
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className={styles.lockedBadge}>
                        <ShieldCheck size={11} /> Theo giá duyệt
                      </div>
                      {onCounter && (
                        <button
                          type="button"
                          className={isNegotiating ? styles.headerResetBtn : styles.headerToggleBtn}
                          onClick={() => {
                            const nextState = !isNegotiating;
                            setIsNegotiating(nextState);
                            if (!nextState) updateNegotiatedDiff(defaultDiffAmount);
                          }}
                        >
                          {isNegotiating ? (
                            <>
                              <RotateCcw size={11} /> Mặc định
                            </>
                          ) : (
                            <>
                              <SlidersHorizontal size={11} /> Thỏa thuận lại
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.financialBox}>
                  <div className={styles.financialLine}>
                    <span className={styles.financialLabel}>Tiền bù:</span>
                    <span className={styles.financialValue}>{effectiveCompensationNotice}</span>
                  </div>

                  {isNegotiating && (
                    <div className={styles.negotiationCard}>
                      <div className={styles.payerSelectorGroup}>
                        <button
                          type="button"
                          className={`${styles.payerOptionBtn} ${negotiatedPayer === 'viewer' ? styles.payerOptionBtnActive : ''}`}
                          onClick={() => {
                            setNegotiatedPayer('viewer');
                            if (negotiatedDiff === 0) updateNegotiatedDiff(defaultDiffAmount || 10000);
                          }}
                        >
                          <span className={styles.payerOptionIcon}>
                            <ArrowUpRight size={12} />
                          </span>
                          <span>Bạn bù</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.payerOptionBtn} ${negotiatedPayer === 'partner' ? styles.payerOptionBtnActive : ''}`}
                          onClick={() => {
                            setNegotiatedPayer('partner');
                            if (negotiatedDiff === 0) updateNegotiatedDiff(defaultDiffAmount || 10000);
                          }}
                        >
                          <span className={styles.payerOptionIcon}>
                            <ArrowDownLeft size={12} />
                          </span>
                          <span>Đối tác bù</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.payerOptionBtn} ${negotiatedPayer === 'none' ? styles.payerOptionBtnActive : ''}`}
                          onClick={() => {
                            setNegotiatedPayer('none');
                            updateNegotiatedDiff(0);
                          }}
                        >
                          <span className={styles.payerOptionIcon}>
                            <Scale size={12} />
                          </span>
                          <span>Đổi ngang</span>
                        </button>
                      </div>

                      {negotiatedPayer === 'none' ? (
                        <div className={styles.evenCompensationBanner}>
                          <CheckCircle2 size={13} className={styles.evenCompensationIcon} />
                          <span>Đổi ngang sách — không phát sinh tiền bù.</span>
                        </div>
                      ) : (
                        <div data-focus-surface className={styles.amountInputWrapper}>
                          <span className={styles.amountInputPrefix}>
                            <Coins size={14} />
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            className={styles.amountInput}
                            value={diffInputText}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '');
                              const num = digits ? parseInt(digits, 10) : 0;
                              setNegotiatedDiff(num);
                              setDiffInputText(digits === '' ? '' : new Intl.NumberFormat('vi-VN').format(num));
                            }}
                            onBlur={() => {
                              if (negotiatedDiff > 0) {
                                setDiffInputText(new Intl.NumberFormat('vi-VN').format(negotiatedDiff));
                              } else {
                                setDiffInputText('0');
                              }
                            }}
                            placeholder="0"
                          />
                          <span className={styles.amountInputSuffix}>đ</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.financialLine}>
                    <span className={styles.financialLabel}>Tổng nộp:</span>
                    <div className={styles.financialValueGroup}>
                      <span className={styles.highlightAmount}>{formatVnd(effectiveFundingAmount)}</span>
                      <span className={styles.financialSubtext}>
                        {effectiveFundingAmount > totalReceivePrice
                          ? '(cọc sách + tiền bù)'
                          : '(cọc sách nhận, hoàn lại khi hoàn tất)'}
                      </span>
                    </div>
                  </div>

                  {wallet.data && (
                    <div className={isBalanceSufficient ? styles.balanceOkBadge : styles.balanceWarningBadge}>
                      {isBalanceSufficient ? (
                        <>
                          <CheckCircle2 size={12} className={styles.balanceIconOk} />
                          <span>
                            Ví: <strong>{formatVnd(availableBalance)}</strong> (Đủ số dư đặt cọc)
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={12} className={styles.balanceIconWarn} />
                          <span>
                            Ví: <strong>{formatVnd(availableBalance)}</strong> (Cần nạp thêm {formatVnd(missingBalance)} trong 24h)
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Địa chỉ giao nhận */}
              <div className={styles.sectionCompact}>
                <h3 className={styles.sectionTitle}>
                  <MapPin size={13} /> Địa chỉ giao nhận
                </h3>
                <div className={styles.addressBox}>
                  <div className={styles.partnerAddressRow}>
                    <span className={styles.addressLabelSmall}>Đối tác nhận:</span>
                    <span className={styles.partnerAddressText}>
                      {detail.partnerAddress ? (
                        <>
                          <strong>{detail.partnerAddress.recipientName}</strong> · {detail.partnerAddress.phone} · {detail.partnerAddress.detail}
                        </>
                      ) : (
                        'Theo sổ địa chỉ của đối tác'
                      )}
                    </span>
                  </div>

                  <div className={styles.userAddressSection}>
                    <div className={styles.userAddressHeader}>
                      <span className={styles.addressLabelSmall}>Bạn nhận tại:</span>
                      {addresses.data?.items && addresses.data.items.length > 0 && (
                        <button
                          type="button"
                          className={styles.btnNewAddressToggle}
                          onClick={() => setAddressMode(addressMode === 'existing' ? 'new' : 'existing')}
                        >
                          {addressMode === 'existing' ? '+ Thêm mới' : 'Chọn có sẵn'}
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
                                <span className={styles.recipientNameText}>{addr.recipientName}</span>
                                <span className={styles.phoneText}>{addr.phone}</span>
                                {addr.isDefault && <span className={styles.defaultBadge}>Mặc định</span>}
                                <div className={styles.addressDetailText}>{addr.detail}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.newAddressForm}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <input
                            type="text"
                            placeholder="Họ tên người nhận"
                            value={newRecipientName}
                            onChange={(e) => setNewRecipientName(e.target.value)}
                            className={styles.compactInput}
                          />
                          <input
                            type="tel"
                            placeholder="Số điện thoại"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            className={styles.compactInput}
                          />
                        </div>
                        <select
                          value={newLocalityCode}
                          onChange={(e) => setNewLocalityCode(e.target.value)}
                          className={styles.compactSelect}
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
                          className={styles.compactInput}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={isNegotiating ? styles.noticeBoxCounter : styles.noticeBox}>
            {isNegotiating
              ? 'Đề xuất tiền bù mới sẽ gửi qua chat để đối tác kiểm tra và xác nhận.'
              : 'Sau khi khóa hợp đồng, hai bên có 24 giờ để nộp cọc và tiền bù trước khi gửi sách.'}
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
              <ArrowLeftRight size={14} /> {isBusy ? 'Đang gửi...' : 'Gửi đề xuất điều chỉnh'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnConfirm}
              onClick={handleConfirmSubmit}
              disabled={isBusy}
            >
              <CheckCircle2 size={14} /> {isBusy ? 'Đang xử lý...' : 'Đồng ý & Khóa giao dịch'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
