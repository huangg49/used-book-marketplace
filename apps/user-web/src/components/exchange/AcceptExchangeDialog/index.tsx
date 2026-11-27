import { useState, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockPageScroll } from '../../../lib/page-scroll';
import { SelectMenu } from '../../SelectMenu';
import { InfoTip } from '../../InfoTip';
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
import { conditions } from '../../../lib/listing-labels';
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
  const [localBusy, setLocalBusy] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const busy = isBusy || localBusy;

  useEffect(() => (isOpen ? lockPageScroll() : undefined), [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      if (openerRef.current?.isConnected) {
        openerRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busy, onClose]);
  
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
  let effectiveFundingAmount = totalGivePrice;

  if (isNegotiating) {
    if (negotiatedPayer === 'viewer') {
      effectiveCompensationNotice = currentDiff > 0
        ? `Bạn sẽ bù thêm cho đối tác (theo thỏa thuận mới): ${formatVnd(currentDiff)}`
        : 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalGivePrice + currentDiff;
    } else if (negotiatedPayer === 'partner') {
      effectiveCompensationNotice = currentDiff > 0
        ? `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn (theo thỏa thuận mới): ${formatVnd(currentDiff)}`
        : 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalGivePrice;
    } else {
      effectiveCompensationNotice = 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
      effectiveFundingAmount = totalGivePrice;
    }
  } else {
    if (detail.moneyCompensationType === 'user_pays' && (detail.moneyAmount ?? 0) > 0) {
      effectiveCompensationNotice = isAlreadyNegotiated
        ? `Bạn cần bù thêm (đã chốt theo thương lượng): ${formatVnd(detail.moneyAmount!)}`
        : `Bạn cần bù thêm: ${formatVnd(detail.moneyAmount!)}`;
      effectiveFundingAmount = totalGivePrice + detail.moneyAmount!;
    } else if (detail.moneyCompensationType === 'other_pays' && (detail.moneyAmount ?? 0) > 0) {
      effectiveCompensationNotice = isAlreadyNegotiated
        ? `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn (đã chốt theo thương lượng): ${formatVnd(detail.moneyAmount!)}`
        : `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn: ${formatVnd(detail.moneyAmount!)}`;
      effectiveFundingAmount = totalGivePrice;
    } else {
      effectiveFundingAmount = totalGivePrice;
    }
  }

  const availableBalance = wallet.data?.available ?? 0;
  const isBalanceSufficient = availableBalance >= effectiveFundingAmount;
  const missingBalance = Math.max(0, effectiveFundingAmount - availableBalance);

  const initialCompValue = detail.moneyAmount ?? defaultDiffAmount;
  const effectivePayerForView = isNegotiating
    ? negotiatedPayer
    : detail.moneyCompensationType === 'user_pays'
      ? 'viewer'
      : detail.moneyCompensationType === 'other_pays'
        ? 'partner'
        : 'none';
  const hasNegotiationChanged =
    negotiatedPayer !== initialPayer ||
    (negotiatedPayer !== 'none' && negotiatedDiff !== initialCompValue);
  const compDelta =
    (negotiatedPayer === 'none' ? 0 : negotiatedDiff) -
    (initialPayer === 'none' ? 0 : initialCompValue);
  const currentCompSummary =
    initialPayer === 'viewer' && initialCompValue > 0
      ? `Bạn bù -${formatVnd(initialCompValue)}`
      : initialPayer === 'partner' && initialCompValue > 0
        ? `Đối tác bù +${formatVnd(initialCompValue)}`
        : 'Ngang giá (0 ₫)';

  const lowerValue = Math.min(totalReceivePrice, totalGivePrice);
  const higherValue = Math.max(totalReceivePrice, totalGivePrice);
  const cheaperSideIsViewer = totalGivePrice < totalReceivePrice;
  const cheaperSidePays =
    effectivePayerForView === 'none'
      ? 0
      : (cheaperSideIsViewer && effectivePayerForView === 'viewer') ||
          (!cheaperSideIsViewer && effectivePayerForView === 'partner')
        ? currentDiff
        : 0;
  const protectedCap = Math.min(higherValue, lowerValue + cheaperSidePays);
  const showCapNotice = defaultDiffAmount > 0 && protectedCap < higherValue;

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
      throw new Error('Vui lòng chọn Khu vực / Quận huyện giao nhận.');
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
            serviceAreaCode: areas.data?.code ?? 'HCM-DEMO-v1',
          },
          makeDefault: false,
        }),
      },
    );
    await addresses.refetch();
    return saved.addressId;
  };

  const handleConfirmSubmit = async () => {
    if (busy) return;
    setError('');
    setLocalBusy(true);
    try {
      const finalAddressId = await resolveAddressId();
      await onConfirm({
        deliveryAddressId: finalAddressId || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận đề nghị.');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleCounterSubmit = async () => {
    if (busy) return;
    setError('');
    const finalDiff = negotiatedPayer === 'none' ? 0 : negotiatedDiff;
    if (finalDiff < 0) {
      setError('Tiền bù không thể là số âm.');
      return;
    }
    const finalPayerId = negotiatedPayer === 'none' || finalDiff === 0
      ? null
      : (negotiatedPayer === 'viewer' ? detail.viewer.id : detail.partner.id);

    setLocalBusy(true);
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
    } finally {
      setLocalBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      data-lenis-prevent="true"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {/* Header */}
        <div className={styles.header} data-focus-inverse>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon} aria-hidden="true">
              <FileSignature size={20} />
            </div>
            <div className={styles.headerHeading}>
              <h2 id={titleId} className={styles.title}>
                Xác nhận hợp đồng trao đổi
              </h2>
              <p className={styles.headerSubtitle}>
                {receiveBooks[0]?.title ?? giveBooks[0]?.title ?? `Phiếu #${detail.transactionCode}`}
                {receiveBooks.length + giveBooks.length > 2 ? ` · ${receiveBooks.length + giveBooks.length} cuốn` : ''}
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.timelineBar}>
            <ol className={styles.timeline} aria-label="Tiến trình xác nhận trao đổi">
              <li className={styles.timelineStep} data-active="true">
                <span className={styles.stepNum}>1</span>
                <span>{isNegotiating ? 'Gửi điều chỉnh' : 'Đồng ý & Khóa'}</span>
              </li>
              <li className={styles.timelineArrow} aria-hidden="true">→</li>
              <li className={styles.timelineStep}>
                <span className={styles.stepNum}>2</span>
                <span>{isNegotiating ? 'Đối tác phản hồi' : 'Đặt cọc trong 24h'}</span>
              </li>
              <li className={styles.timelineArrow} aria-hidden="true">→</li>
              <li className={styles.timelineStep} data-result="true">
                <span className={styles.stepNum}>3</span>
                <span>Giao nhận sách</span>
              </li>
            </ol>
            <InfoTip label="Quy định sau khi khóa hợp đồng">
              {isNegotiating
                ? 'Đề xuất tiền bù cập nhật trực tiếp lên phiếu hiện tại. Sách và tiền vẫn chưa bị khóa cho đến khi hai bên thống nhất.'
                : 'Trong 24 giờ sau khi đồng ý, cả hai bên nộp cọc từ Ví mô phỏng để mở bước gửi sách. Quá 24 giờ phiếu sẽ tự hủy và hoàn tiền cho bên đã nộp.'}
            </InfoTip>
          </div>

          {/* Tier 1: Sách trao đổi (50/50 side-by-side) */}
          <section className={styles.booksRow} aria-label="Sách trao đổi">
            {/* Sách nhận */}
            <div className={styles.bookBox} data-lane="receive">
              <div className={styles.bookBoxHeader}>
                <span className={styles.boxPillReceive}>
                  <ArrowDownLeft size={14} aria-hidden="true" />
                  Bạn nhận ({receiveBooks.length})
                </span>
                <span className={styles.boxTotalValue}>{formatVnd(totalReceivePrice)}</span>
              </div>
              <div className={styles.bookItemsList}>
                {receiveBooks.map((book) => (
                  <div key={book.id} className={styles.bookItemRow}>
                    <div className={styles.bookCoverThumb}>
                      <BookCover title={book.title} coverUrl={book.coverUrl} index={0} fallbackLabel="Chưa có ảnh" />
                    </div>
                    <div className={styles.bookItemText}>
                      <p className={styles.bookItemTitle} title={book.title}>{book.title}</p>
                      <p className={styles.bookItemAuthor}>{book.author}</p>
                      <div className={styles.bookItemMeta}>
                        <span className={styles.conditionBadge}>
                          {conditions[book.condition as keyof typeof conditions] ?? book.condition ?? 'Chưa rõ'}
                        </span>
                        <span className={styles.priceText}>{formatVnd(book.price || 0)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sách giao */}
            <div className={styles.bookBox} data-lane="give">
              <div className={styles.bookBoxHeader}>
                <span className={styles.boxPillGive}>
                  <ArrowUpRight size={14} aria-hidden="true" />
                  Bạn giao ({giveBooks.length})
                </span>
                <span className={styles.boxTotalValue}>{formatVnd(totalGivePrice)}</span>
              </div>
              <div className={styles.bookItemsList}>
                {giveBooks.map((book) => (
                  <div key={book.id} className={styles.bookItemRow}>
                    <div className={styles.bookCoverThumb}>
                      <BookCover title={book.title} coverUrl={book.coverUrl} index={0} fallbackLabel="Chưa có ảnh" />
                    </div>
                    <div className={styles.bookItemText}>
                      <p className={styles.bookItemTitle} title={book.title}>{book.title}</p>
                      <p className={styles.bookItemAuthor}>{book.author}</p>
                      <div className={styles.bookItemMeta}>
                        <span className={styles.conditionBadge}>
                          {conditions[book.condition as keyof typeof conditions] ?? book.condition ?? 'Chưa rõ'}
                        </span>
                        <span className={styles.priceText}>{formatVnd(book.price || 0)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Tier 2: Tài chính | Địa chỉ giao nhận (50/50 equal-height cards) */}
          <div className={styles.termsGrid}>
            {/* Left: Thỏa thuận tài chính */}
            <section className={styles.financialBox} aria-label="Thỏa thuận tài chính">
              <div className={styles.panelHead}>
                <h3 className={styles.sectionTitle}>
                  <Banknote size={14} aria-hidden="true" /> Thỏa thuận tài chính
                </h3>
                <div className={styles.compHeaderActions}>
                  <span className={styles.lockedBadge}>
                    {isAlreadyNegotiated ? (
                      <>
                        <Lock size={11} aria-hidden="true" /> Đã thương lượng
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={11} aria-hidden="true" /> Giá duyệt
                      </>
                    )}
                  </span>
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
                          <RotateCcw size={11} aria-hidden="true" /> Mặc định
                        </>
                      ) : (
                        <>
                          <SlidersHorizontal size={11} aria-hidden="true" /> Thỏa thuận lại
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <dl className={styles.financeRows}>
                <div>
                  <dt>Cọc sách bạn gửi</dt>
                  <dd>{formatVnd(totalGivePrice)}</dd>
                </div>
                <div
                  className={styles.compLine}
                  data-direction={
                    effectivePayerForView === 'viewer' && currentDiff > 0
                      ? 'out'
                      : effectivePayerForView === 'partner' && currentDiff > 0
                        ? 'in'
                        : 'even'
                  }
                >
                  <dt>
                    {effectivePayerForView === 'viewer' && currentDiff > 0
                      ? 'Tiền bù bạn trả'
                      : effectivePayerForView === 'partner' && currentDiff > 0
                        ? 'Tiền bù bạn nhận'
                        : 'Tiền bù chênh lệch'}
                  </dt>
                  <dd title={effectiveCompensationNotice}>
                    {effectivePayerForView === 'viewer' && currentDiff > 0
                      ? `-${formatVnd(currentDiff)}`
                      : effectivePayerForView === 'partner' && currentDiff > 0
                        ? `+${formatVnd(currentDiff)}`
                        : '0 ₫ (Ngang giá)'}
                  </dd>
                </div>
              </dl>

              {isNegotiating && (
                <div className={styles.negotiationCard}>
                  <div className={styles.negotiationMeta}>
                    <span>Hiện tại: <strong>{currentCompSummary}</strong></span>
                    {hasNegotiationChanged && (
                      <span className={styles.deltaChip}>
                        {negotiatedPayer === 'none'
                          ? 'Đổi ngang'
                          : compDelta > 0
                            ? `+${formatVnd(compDelta)}`
                            : compDelta < 0
                              ? `-${formatVnd(Math.abs(compDelta))}`
                              : 'Đổi bên bù'}
                      </span>
                    )}
                  </div>
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

              {showCapNotice && (
                <div className={styles.escrowCapRow} role="status">
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>
                    Mức bảo chứng tối đa: <strong>{formatVnd(protectedCap)}</strong>
                  </span>
                  <InfoTip label="Chi tiết mức bảo chứng tối đa">
                    Tiền bù đang thấp hơn chênh lệch định giá (<strong>{formatVnd(defaultDiffAmount)}</strong>). Nếu phát sinh sự cố hư hại hoặc thất lạc, mức bồi thường tối đa từ quỹ ký quỹ của bên gửi sách giá thấp hơn đạt <strong>{formatVnd(protectedCap)}</strong> (cọc {formatVnd(lowerValue)} + tiền bù {formatVnd(cheaperSidePays)}).
                  </InfoTip>
                </div>
              )}

              <div className={styles.financeBottom}>
                <div className={styles.totalFundingBox}>
                  <div className={styles.totalLabelRow}>
                    <span>Tổng bạn cần nộp</span>
                    <InfoTip label="Cách tính tổng tiền cần nộp">
                      {effectiveFundingAmount > totalGivePrice
                        ? `Gồm cọc sách gửi ${formatVnd(totalGivePrice)} + tiền bù ${formatVnd(effectiveFundingAmount - totalGivePrice)}. Tiền cọc được hoàn 100% về ví khi hoàn tất.`
                        : `Gồm cọc sách gửi ${formatVnd(totalGivePrice)}, được hoàn 100% về ví khi hoàn tất trao đổi.`}
                    </InfoTip>
                  </div>
                  <strong className={styles.highlightAmount}>
                    {formatVnd(effectiveFundingAmount)}
                  </strong>
                </div>

                {wallet.data && (
                  <div className={isBalanceSufficient ? styles.balanceOkBadge : styles.balanceWarningBadge}>
                    {isBalanceSufficient ? (
                      <>
                        <CheckCircle2 size={14} className={styles.balanceIconOk} />
                        <span>
                          Ví mô phỏng: <strong>{formatVnd(availableBalance)}</strong> · Đủ số dư
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} className={styles.balanceIconWarn} />
                        <span>
                          Ví mô phỏng: <strong>{formatVnd(availableBalance)}</strong> · Thiếu {formatVnd(missingBalance)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Right: Địa chỉ giao nhận */}
            <section className={styles.addressBox} aria-label="Địa chỉ giao nhận">
              <div className={styles.panelHead}>
                <h3 className={styles.sectionTitle}>
                  <MapPin size={14} aria-hidden="true" /> Địa chỉ giao nhận
                </h3>
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
                          <div className={styles.addressHeaderLine}>
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
                <div className={styles.newAddressForm}>
                  <div className={styles.addressTwoCol}>
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
                  <div className={styles.localityField}>
                    <span id="accept-locality-label" className={styles.srOnly}>
                      Khu vực / Quận huyện giao nhận
                    </span>
                    <SelectMenu
                      id="accept-locality"
                      labelledBy="accept-locality-label"
                      value={newLocalityCode}
                      disabled={busy}
                      options={[
                        { value: '', label: 'Chọn Quận / Huyện (TP.HCM, Bình Dương, Vũng Tàu)' },
                        ...(areas.data?.localities.map((loc) => ({
                          value: loc.code,
                          label: loc.label,
                        })) ?? []),
                      ]}
                      onChange={setNewLocalityCode}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Số nhà, tên đường, phường..."
                    value={newDetail}
                    onChange={(e) => setNewDetail(e.target.value)}
                    className={styles.compactInput}
                  />
                </div>
              )}

              <div className={styles.partnerAddressStrip}>
                <span className={styles.addressLabelSmall}>Đối tác nhận tại</span>
                <p className={styles.partnerAddressText}>
                  {detail.partnerAddress ? (
                    <>
                      <strong>{detail.partnerAddress.recipientName}</strong> · {detail.partnerAddress.phone}
                      <span className={styles.partnerStreet}>{detail.partnerAddress.detail}</span>
                    </>
                  ) : (
                    'Theo sổ địa chỉ của đối tác'
                  )}
                </p>
              </div>
            </section>
          </div>

          {error && <p className={styles.errorText} role="alert">{error}</p>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          {isNegotiating ? (
            <button
              type="button"
              data-focus-inverse
              className={styles.btnConfirmCounter}
              onClick={handleCounterSubmit}
              disabled={busy || !hasNegotiationChanged}
            >
              <ArrowLeftRight size={14} /> {busy ? 'Đang gửi…' : 'Gửi điều chỉnh'}
            </button>
          ) : (
            <button
              type="button"
              data-focus-inverse
              className={styles.btnConfirm}
              onClick={handleConfirmSubmit}
              disabled={busy}
            >
              <CheckCircle2 size={14} /> {busy ? 'Đang xử lý…' : 'Đồng ý & Khóa'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
