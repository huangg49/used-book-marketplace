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
    Lock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { ExchangeDetail } from '../../../lib/mock/exchangeDetail';
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
  isBusy: boolean;
  detail: ExchangeDetail;
}

export function AcceptExchangeDialog({
  isOpen,
  onClose,
  onConfirm,
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

      if (addresses.data?.items?.length) {
        const def = addresses.data.items.find((a) => a.isDefault) ?? addresses.data.items[0];
        setSelectedAddressId(def.id);
      } else {
        setAddressMode('new');
      }
    }
  }, [isOpen, addresses.data, detail.moneyAmount]);

  if (!isOpen) return null;

  const receiveBooks = detail.receiveBooks;
  const giveBooks = detail.giveBooks;
  const totalReceivePrice = receiveBooks.reduce((sum, b) => sum + (b.price || 0), 0);
  const totalGivePrice = giveBooks.reduce((sum, b) => sum + (b.price || 0), 0);

  const moneyAmount = detail.moneyAmount || 0;
  let compensationNotice = 'Hai bên trao đổi ngang giá (0 đ bù trừ)';
  if (detail.moneyCompensationType === 'user_pays' && moneyAmount > 0) {
    compensationNotice = `Bạn cần bù thêm: ${formatVnd(moneyAmount)}`;
  } else if (detail.moneyCompensationType === 'other_pays' && moneyAmount > 0) {
    compensationNotice = `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn: ${formatVnd(moneyAmount)}`;
  }

  const effectiveCompensationNotice = compensationNotice;
  const effectiveFundingAmount = detail.viewerFundingAmount ?? totalReceivePrice;
  const availableBalance = wallet.data?.available ?? 0;
  const isBalanceSufficient = availableBalance >= effectiveFundingAmount;
  const missingBalance = Math.max(0, effectiveFundingAmount - availableBalance);

  const defaultAddr = addresses.data?.items.find((a) => a.isDefault) ?? addresses.data?.items[0];
  const defaultRecipientName = defaultAddr?.recipientName || '';
  const defaultPhone = defaultAddr?.phone || '';

  const handleConfirmSubmit = async () => {
    setError('');
    let finalAddressId = selectedAddressId;

    try {
      if (addressMode === 'new') {
        const nameTrim = newRecipientName.trim() || defaultRecipientName;
        const phoneTrim = newPhone.trim() || defaultPhone;
        const detailTrim = newDetail.trim();

        if (!nameTrim || nameTrim.length < 2) {
          setError('Vui lòng nhập họ tên người nhận.');
          return;
        }
        if (!phoneTrim) {
          setError('Vui lòng nhập số điện thoại người nhận.');
          return;
        }
        if (!/^0[0-9]{9}$/.test(phoneTrim)) {
          setError('Số điện thoại nhận hàng phải gồm đúng 10 chữ số (bắt đầu bằng 0).');
          return;
        }
        if (!newLocalityCode) {
          setError('Vui lòng chọn Khu vực / Quận huyện tại TP.HCM.');
          return;
        }
        if (detailTrim.length < 5) {
          setError('Địa chỉ chi tiết phải có ít nhất 5 ký tự (số nhà, tên đường, phường...).');
          return;
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
        finalAddressId = saved.addressId;
        await addresses.refetch();
      }

      await onConfirm({
        deliveryAddressId: finalAddressId || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận đề nghị.');
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
              <div className={styles.lockedBadge}><Lock size={12} /> Theo giá trị sách đã duyệt</div>
            </div>

            <div className={styles.financialBox}>
              <div className={styles.financialRow}><Banknote size={18} className={styles.financialIcon} /><div className={styles.financialContent}>
                <p className={styles.financialLabel}>Tiền bù tính từ giá trị sách</p><p className={styles.financialDesc}>{effectiveCompensationNotice}</p>
              </div></div>
              <div className={styles.financialRow}>
                <ShieldCheck size={18} className={styles.financialIcon} />
                <div className={styles.financialContent}>
                  <p className={styles.financialLabel}>Tổng tiền cần nộp của bạn</p>
                  <p className={styles.financialDesc}>
                    <strong>{formatVnd(effectiveFundingAmount)}</strong>
                    {' '}(Gồm cọc và tiền bù nếu bạn là bên bù. Cọc được hoàn khi giao dịch hoàn tất hợp lệ; tiền bù chuyển cho đối tác).
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

          <div className={styles.noticeBox}>
            Khi chấp nhận, hệ thống kiểm tra lại sách và thỏa thuận trước khi giữ sách.
            Nếu còn hợp lệ, hai bên có 24 giờ để nộp đủ cọc và tiền bù trước khi gửi sách.
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
          <button
            type="button"
            className={styles.btnConfirm}
            onClick={handleConfirmSubmit}
            disabled={isBusy}
          >
            <CheckCircle2 size={16} /> {isBusy ? 'Đang xử lý...' : 'Đồng ý & Khóa giao dịch'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
