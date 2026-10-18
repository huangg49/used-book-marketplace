import { useState, useEffect } from 'react';
import { 
    FileSignature, 
    X, 
    ArrowLeftRight, 
    Banknote, 
    ShieldCheck, 
    MapPin, 
    Plus, 
    CheckCircle2,
    Edit3,
    Send,
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

export interface CustomTerms {
  diffAmount: number;
  diffPayer: 'initiator' | 'recipient' | 'none';
}

interface AcceptExchangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    deliveryAddressId?: string;
    customTerms?: CustomTerms;
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

  // Compensation customization state
  const isCompensationLocked = detail.viewerRole === 'proposer';
  const [isEditingComp, setIsEditingComp] = useState(false);
  const [compPayerOption, setCompPayerOption] = useState<'default' | 'none' | 'viewer_pays' | 'partner_pays'>('default');
  const [customCompAmountStr, setCustomCompAmountStr] = useState('');

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
      setIsEditingComp(false);
      setCompPayerOption('default');
      setCustomCompAmountStr(detail.moneyAmount ? Number(detail.moneyAmount).toLocaleString('vi-VN') : '0');

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

  // Parsed custom amount
  const parsedCustomAmount = parseInt(customCompAmountStr.replace(/\D/g, ''), 10) || 0;

  // Effective notice & preview funding amount
  let effectiveCompensationNotice = compensationNotice;
  let effectiveFundingAmount = detail.viewerFundingAmount ?? totalReceivePrice;

  if (compPayerOption === 'none') {
    effectiveCompensationNotice = 'Đổi ngang giá (0 đ bù trừ)';
    effectiveFundingAmount = totalReceivePrice;
  } else if (compPayerOption === 'viewer_pays') {
    effectiveCompensationNotice = `Bạn cần bù thêm: ${formatVnd(parsedCustomAmount)}`;
    effectiveFundingAmount = totalReceivePrice + parsedCustomAmount;
  } else if (compPayerOption === 'partner_pays') {
    effectiveCompensationNotice = `Đối tác (${detail.partner.username}) sẽ bù thêm cho bạn: ${formatVnd(parsedCustomAmount)}`;
    effectiveFundingAmount = totalReceivePrice;
  }

  const availableBalance = wallet.data?.available ?? 0;
  const isBalanceSufficient = availableBalance >= effectiveFundingAmount;
  const missingBalance = Math.max(0, effectiveFundingAmount - availableBalance);
  const isTermsModified = compPayerOption !== 'default';

  const defaultAddr = addresses.data?.items.find((a) => a.isDefault) ?? addresses.data?.items[0];
  const defaultRecipientName = defaultAddr?.recipientName || '';
  const defaultPhone = defaultAddr?.phone || '';

  const handleConfirmSubmit = async () => {
    setError('');
    let finalAddressId = selectedAddressId;

    // Validate compensation if customized
    let customTerms: CustomTerms | undefined = undefined;
    if (!isCompensationLocked && compPayerOption !== 'default') {
      if (compPayerOption === 'none') {
        customTerms = { diffAmount: 0, diffPayer: 'none' };
      } else {
        if (parsedCustomAmount <= 0) {
          setError('Vui lòng nhập số tiền bù lớn hơn 0 đ (hoặc chọn "Đổi ngang giá 0 đ").');
          return;
        }
        customTerms = {
          diffAmount: parsedCustomAmount,
          diffPayer: compPayerOption === 'viewer_pays' ? 'recipient' : 'initiator',
        };
      }
    }

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
        customTerms,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi xác nhận đề nghị.');
    }
  };

  return (
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
              {isCompensationLocked ? (
                <div className={styles.lockedBadge}>
                  <Lock size={12} /> Đã khóa theo điều khoản chốt
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.btnEditCompToggle}
                  onClick={() => setIsEditingComp((prev) => !prev)}
                  title="Thay đổi số tiền bù chênh lệch nếu đã thương lượng trong chat"
                >
                  <Edit3 size={13} />
                  {isEditingComp ? 'Đóng chỉnh sửa' : 'Thương lượng tiền bù'}
                </button>
              )}
            </div>

            <div className={styles.financialBox}>
              <div className={styles.financialRow}>
                <Banknote size={18} className={styles.financialIcon} />
                <div className={styles.financialContent}>
                  <p className={styles.financialLabel}>Tiền bù chênh lệch</p>
                  <p className={styles.financialDesc}>
                    <span className={styles.highlightAmount}>{effectiveCompensationNotice}</span>
                  </p>
                  {isCompensationLocked ? (
                    <div className={styles.compNoticeLocked}>
                      🔒 Số tiền bù đã được thống nhất trong thương lượng và khóa cố định theo điều khoản chốt.
                    </div>
                  ) : compPayerOption !== 'default' ? (
                    <div className={styles.compNoticeChanged}>
                      * Đã điều chỉnh theo thỏa thuận chốt với đối tác
                    </div>
                  ) : null}
                </div>
              </div>

              {!isCompensationLocked && isEditingComp && (
                <div className={styles.compEditContainer}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                    Chọn điều khoản tài chính đã thống nhất trong chat:
                  </p>

                  <label className={styles.compRadioOption}>
                    <input
                      type="radio"
                      name="compPayer"
                      className={styles.compRadioInput}
                      checked={compPayerOption === 'default'}
                      onChange={() => setCompPayerOption('default')}
                    />
                    <span>Giữ nguyên ban đầu ({compensationNotice})</span>
                  </label>

                  <label className={styles.compRadioOption}>
                    <input
                      type="radio"
                      name="compPayer"
                      className={styles.compRadioInput}
                      checked={compPayerOption === 'none'}
                      onChange={() => setCompPayerOption('none')}
                    />
                    <span><strong>Đổi ngang giá (0 đ)</strong> — Hai bên giao lưu sách, không bên nào bù tiền</span>
                  </label>

                  <div>
                    <label className={styles.compRadioOption}>
                      <input
                        type="radio"
                        name="compPayer"
                        className={styles.compRadioInput}
                        checked={compPayerOption === 'viewer_pays'}
                        onChange={() => setCompPayerOption('viewer_pays')}
                      />
                      <span><strong>Tôi bù thêm cho đối tác</strong> ({detail.partner.username})</span>
                    </label>
                    {compPayerOption === 'viewer_pays' && (
                      <div className={styles.compAmountInputWrapper}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={styles.compAmountInput}
                          placeholder="Nhập số tiền..."
                          value={customCompAmountStr}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setCustomCompAmountStr(val ? Number(val).toLocaleString('vi-VN') : '');
                          }}
                        />
                        <span className={styles.compAmountCurrency}>đ</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={styles.compRadioOption}>
                      <input
                        type="radio"
                        name="compPayer"
                        className={styles.compRadioInput}
                        checked={compPayerOption === 'partner_pays'}
                        onChange={() => setCompPayerOption('partner_pays')}
                      />
                      <span><strong>Đối tác bù thêm cho tôi</strong> ({detail.partner.username})</span>
                    </label>
                    {compPayerOption === 'partner_pays' && (
                      <div className={styles.compAmountInputWrapper}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={styles.compAmountInput}
                          placeholder="Nhập số tiền..."
                          value={customCompAmountStr}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setCustomCompAmountStr(val ? Number(val).toLocaleString('vi-VN') : '');
                          }}
                        />
                        <span className={styles.compAmountCurrency}>đ</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.financialRow}>
                <ShieldCheck size={18} className={styles.financialIcon} />
                <div className={styles.financialContent}>
                  <p className={styles.financialLabel}>Tiền cọc bảo chứng dự kiến của bạn</p>
                  <p className={styles.financialDesc}>
                    <strong>{formatVnd(effectiveFundingAmount)}</strong>
                    {' '}(Khoản tiền giữ tạm thời ở Bước 2 và hoàn trả 100% về ví khi giao dịch hoàn tất).
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

          {/* Section 4: Notice */}
          <div className={isTermsModified ? styles.noticeBoxCounter : styles.noticeBox}>
            {isTermsModified ? (
              <>
                <strong>Lưu ý:</strong> Bạn đang điều chỉnh điều khoản tài chính so với đề xuất ban đầu. Khi bạn bấm <em>"Gửi điều khoản chốt cho đối tác"</em>, đề xuất này sẽ được cập nhật và gửi vào khung chat. Đối tác chỉ cần bấm <strong>"Đồng ý"</strong> để chính thức khóa giao dịch và tiến hành đặt cọc.
              </>
            ) : (
              <>
                <strong>Lưu ý:</strong> Khi bạn bấm <em>"Đồng ý & Khóa giao dịch"</em>, các cuốn sách sẽ được chuyển sang trạng thái <strong>Đã giữ (Reserved)</strong>. Hai bên sẽ có <strong>24 giờ</strong> để hoàn tất khoản đặt cọc bảo chứng trước khi tiến hành gửi sách.
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
          <button
            type="button"
            className={isTermsModified ? styles.btnConfirmCounter : styles.btnConfirm}
            onClick={handleConfirmSubmit}
            disabled={isBusy}
          >
            {isTermsModified ? (
              <>
                <Send size={15} /> {isBusy ? 'Đang gửi đề xuất...' : 'Gửi điều khoản chốt cho đối tác'}
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> {isBusy ? 'Đang xử lý...' : 'Đồng ý & Khóa giao dịch'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
