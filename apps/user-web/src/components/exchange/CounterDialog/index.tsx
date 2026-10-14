import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { session } from '../../../lib/session';
import styles from './CounterDialog.module.css';

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

export interface CounterOfferData {
  diffAmount: number;
  diffPayer: 'initiator' | 'recipient' | 'none';
  deliveryAddressId?: string;
  note?: string;
}

interface CounterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CounterOfferData) => Promise<void>;
  isBusy: boolean;
  viewerRole: 'proposer' | 'recipient';
  partnerName: string;
  currentCompensationType: 'none' | 'user_pays' | 'other_pays';
  currentAmount: number;
  currentAddressId?: string;
}

export function CounterDialog({
  isOpen,
  onClose,
  onSubmit,
  isBusy,
  viewerRole,
  partnerName,
  currentCompensationType,
  currentAmount,
  currentAddressId,
}: CounterDialogProps) {
  const [payerOption, setPayerOption] = useState<'viewer_pays' | 'partner_pays' | 'none'>('none');
  const [amountStr, setAmountStr] = useState('0');
  const [addressMode, setAddressMode] = useState<'existing' | 'new'>('existing');
  const [selectedAddressId, setSelectedAddressId] = useState<string>(currentAddressId ?? '');
  
  // New address form fields
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLocalityCode, setNewLocalityCode] = useState('');
  const [newDetail, setNewDetail] = useState('');

  const [note, setNote] = useState('');
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

  useEffect(() => {
    if (isOpen) {
      if (currentCompensationType === 'user_pays') {
        setPayerOption('viewer_pays');
        setAmountStr(String(currentAmount || 0));
      } else if (currentCompensationType === 'other_pays') {
        setPayerOption('partner_pays');
        setAmountStr(String(currentAmount || 0));
      } else {
        setPayerOption('none');
        setAmountStr('0');
      }
      if (currentAddressId) {
        setSelectedAddressId(currentAddressId);
      }
      setAddressMode('existing');
      setNewRecipientName('');
      setNewPhone('');
      setNewLocalityCode('');
      setNewDetail('');
      setNote('');
      setError('');
    }
  }, [isOpen, currentCompensationType, currentAmount, currentAddressId]);

  useEffect(() => {
    if (addresses.data?.items) {
      if (addresses.data.items.length === 0) {
        setAddressMode('new');
      } else if (!selectedAddressId || !addresses.data.items.some((a) => a.id === selectedAddressId)) {
        const def = addresses.data.items.find((a) => a.isDefault);
        setSelectedAddressId(def ? def.id : addresses.data.items[0].id);
      }
    }
  }, [addresses.data, selectedAddressId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
    if (payerOption !== 'none' && parsedAmount <= 0) {
      setError('Vui lòng nhập số tiền bù lớn hơn 0 đ.');
      return;
    }

    let diffPayer: 'initiator' | 'recipient' | 'none' = 'none';
    if (payerOption === 'viewer_pays') {
      diffPayer = viewerRole === 'proposer' ? 'initiator' : 'recipient';
    } else if (payerOption === 'partner_pays') {
      diffPayer = viewerRole === 'proposer' ? 'recipient' : 'initiator';
    }

    let finalAddressId = selectedAddressId;

    try {
      if (addressMode === 'new') {
        const defaultAddr = addresses.data?.items.find((a) => a.isDefault) ?? addresses.data?.items[0];
        const defaultRecipientName = defaultAddr?.recipientName || '';
        const defaultPhone = defaultAddr?.phone || '';

        const nameTrim = newRecipientName.trim() || defaultRecipientName;
        const phoneTrim = newPhone.trim() || defaultPhone;
        const detailTrim = newDetail.trim();

        if (!nameTrim || nameTrim.length < 2) {
          setError('Vui lòng nhập họ tên người nhận (chưa có tên mặc định).');
          return;
        }
        if (!phoneTrim) {
          setError('Vui lòng nhập số điện thoại người nhận (chưa có số điện thoại mặc định).');
          return;
        }
        if (!/^0[0-9]{9}$/.test(phoneTrim)) {
          setError('Số điện thoại nhận hàng phải gồm đúng 10 chữ số (bắt đầu bằng 0).');
          return;
        }
        if (!newLocalityCode) {
          setError('Vui lòng chọn Khu vực / Quận huyện phục vụ tại TP.HCM.');
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

      await onSubmit({
        diffAmount: payerOption === 'none' ? 0 : parsedAmount,
        diffPayer,
        deliveryAddressId: finalAddressId || undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi gửi đề xuất lại.');
    }
  };

  const defaultAddr = addresses.data?.items.find((a) => a.isDefault) ?? addresses.data?.items[0];
  const defaultRecipientName = defaultAddr?.recipientName || '';
  const defaultPhone = defaultAddr?.phone || '';

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="counter-title">
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <ArrowLeftRight size={22} />
          </div>
          <div>
            <h2 id="counter-title" className={styles.title}>Đề xuất lại điều khoản</h2>
            <p className={styles.subtitle}>Thương lượng số tiền bù hoặc địa chỉ nhận sách với @{partnerName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {error && (
              <div className={styles.errorBanner}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Khoản tiền chênh lệch bù trừ</label>
              <div className={styles.radioGrid}>
                <label className={`${styles.radioCard} ${payerOption === 'viewer_pays' ? styles.radioCardActive : ''}`}>
                  <input
                    type="radio"
                    name="payer"
                    value="viewer_pays"
                    checked={payerOption === 'viewer_pays'}
                    onChange={() => setPayerOption('viewer_pays')}
                  />
                  <span>Tôi sẽ bù thêm tiền cho <strong>@{partnerName}</strong></span>
                </label>

                <label className={`${styles.radioCard} ${payerOption === 'partner_pays' ? styles.radioCardActive : ''}`}>
                  <input
                    type="radio"
                    name="payer"
                    value="partner_pays"
                    checked={payerOption === 'partner_pays'}
                    onChange={() => setPayerOption('partner_pays')}
                  />
                  <span><strong>@{partnerName}</strong> sẽ bù thêm tiền cho tôi</span>
                </label>

                <label className={`${styles.radioCard} ${payerOption === 'none' ? styles.radioCardActive : ''}`}>
                  <input
                    type="radio"
                    name="payer"
                    value="none"
                    checked={payerOption === 'none'}
                    onChange={() => setPayerOption('none')}
                  />
                  <span>Đổi ngang giá (không ai bù tiền)</span>
                </label>
              </div>
            </div>

            {payerOption !== 'none' && (
              <div className={styles.formGroup}>
                <label htmlFor="counterAmount" className={styles.label}>Số tiền bù (VNĐ)</label>
                <input
                  id="counterAmount"
                  type="number"
                  step="5000"
                  min="5000"
                  max="10000000"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className={styles.input}
                  placeholder="Nhập số tiền (ví dụ: 15000)"
                  required
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <div className={styles.addressHeaderRow}>
                <label className={styles.label}>Địa chỉ nhận sách của bạn (TP.HCM)</label>
                {addresses.data?.items && addresses.data.items.length > 0 && (
                  <button
                    type="button"
                    className={styles.toggleAddressBtn}
                    onClick={() => setAddressMode((m) => (m === 'existing' ? 'new' : 'existing'))}
                  >
                    {addressMode === 'new' ? '← Chọn từ sổ địa chỉ' : '+ Nhập địa chỉ nhận khác'}
                  </button>
                )}
              </div>

              {addressMode === 'existing' && addresses.data?.items && addresses.data.items.length > 0 ? (
                <select
                  id="counterAddress"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className={styles.select}
                >
                  {addresses.data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.recipientName} · {item.phone} · {item.detail} ({item.localityCode})
                      {item.isDefault ? ' (Mặc định)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={styles.newAddressBox}>
                  <p className={styles.newAddressHint}>
                    Nhập địa chỉ nhận sách mới (hệ thống sẽ cập nhật cho giao dịch này và lưu vào sổ địa chỉ):
                  </p>
                  <div className={styles.twoCols}>
                    <div>
                      <label className={styles.fieldLabel}>
                        Họ tên người nhận {defaultRecipientName ? `(Để trống: "${defaultRecipientName}")` : '*'}
                      </label>
                      <input
                        type="text"
                        value={newRecipientName}
                        onChange={(e) => setNewRecipientName(e.target.value)}
                        placeholder={defaultRecipientName || 'Nguyễn Văn A'}
                        className={styles.input}
                      />
                    </div>
                    <div>
                      <label className={styles.fieldLabel}>
                        Số điện thoại {defaultPhone ? `(Để trống: "${defaultPhone}")` : '* (Bắt buộc)'}
                      </label>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder={defaultPhone || '0901234567'}
                        className={styles.input}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Khu vực phục vụ (TP.HCM) *</label>
                    <select
                      required
                      value={newLocalityCode}
                      onChange={(e) => setNewLocalityCode(e.target.value)}
                      className={styles.select}
                    >
                      <option value="">-- Chọn Quận / Huyện TP.HCM --</option>
                      {areas.data?.localities.map((loc) => (
                        <option key={loc.code} value={loc.code}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Địa chỉ chi tiết (Số nhà, tên đường, phường/xã) *</label>
                    <textarea
                      required
                      minLength={5}
                      value={newDetail}
                      onChange={(e) => setNewDetail(e.target.value)}
                      placeholder="Ví dụ: 123 Nguyễn Thị Minh Khai, Phường Bến Thành"
                      className={styles.textarea}
                      style={{ minHeight: '60px' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="counterNote" className={styles.label}>Lời nhắn thương lượng (Tùy chọn)</label>
              <textarea
                id="counterNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Sách của mình bản sưu tầm có bookmark kèm theo, bạn bù thêm 15k nhé..."
                className={styles.textarea}
                maxLength={500}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onClose} disabled={isBusy} className={styles.cancelBtn}>
              Hủy
            </button>
            <button type="submit" disabled={isBusy} className={styles.submitBtn}>
              {isBusy ? <RefreshCw size={16} className="animate-spin" /> : null}
              {isBusy ? 'Đang gửi…' : 'Gửi đề xuất lại'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
