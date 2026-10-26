import { useState } from 'react';
import { conditions } from '../lib/listing-labels';
import type { BookBundle } from '../lib/book-bundle';
import styles from './BookBundle.module.css';

export function BundleManifest({ bundle }: { bundle?: BookBundle | null }) {
  if (!bundle) return null;
  return <section className={styles.section} aria-label="Nội dung bộ sách">
    <p className={styles.badge}>Bộ {bundle.items.length} cuốn · Bán nguyên bộ</p>
    <details className={styles.manifest}>
      <summary>Xem đủ {bundle.items.length} cuốn trong bộ</summary>
      <ol>{bundle.items.map((item, index) => <li key={index}>
        <strong>{item.label}</strong><span>{conditions[item.condition]}</span>
        {item.notes && <span>{item.notes}</span>}
      </li>)}</ol>
    </details>
    <p>Giá và giao nhận áp dụng cho cả bộ; không bán hoặc trả từng cuốn.</p>
  </section>;
}

export function BundleAcknowledgment({ bundle, checked, onChange, disabled = false }: {
  bundle: BookBundle; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  return <label className={styles.acknowledgment}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span>Tôi đã xem danh sách và mua toàn bộ {bundle.items.length} cuốn trong bộ.</span>
  </label>;
}

export function BundleEditor({ value, onChange, error }: {
  value: BookBundle; onChange: (bundle: BookBundle) => void; error?: string;
}) {
  const [from, setFrom] = useState('1'), [to, setTo] = useState('20');
  const [rangeError, setRangeError] = useState('');
  function generate() {
    const start = Number(from), end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start + 1 || end - start >= 50 || end > 9999) {
      setRangeError('Chọn một khoảng từ 2 đến 50 tập, số tập từ 1 đến 9999.'); return;
    }
    setRangeError('');
    onChange({ ...value, items: Array.from({ length: end - start + 1 }, (_, index) => {
      const label = `Tập ${start + index}`;
      return value.items.find(item => item.label === label) || { label, condition: 'Good', notes: '' };
    }) });
  }
  function change(index: number, patch: Partial<BookBundle['items'][number]>) {
    onChange({ ...value, items: value.items.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }
  return <fieldset id="bundle" tabIndex={-1} className={styles.editor} aria-invalid={!!error} aria-describedby={error ? 'bundle-input-error' : undefined}>
    <legend>Bộ sách bán nguyên bộ</legend>
    <p>Chọn đầu sách đại diện ở bên dưới. Danh sách này xác định chính xác các cuốn người mua nhận được.</p>
    <label>Tên bộ sách<input value={value.title} maxLength={300} onChange={event => onChange({ ...value, title: event.target.value })} placeholder="Ví dụ: Naruto — tập 1 đến 20" /></label>
    <div className={styles.generator}>
      <label>Từ tập<input inputMode="numeric" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Đến tập<input inputMode="numeric" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button type="button" onClick={generate}>Tạo danh sách tập</button>
    </div>
    {rangeError && <p role="alert" className={styles.error}>{rangeError}</p>}
    <details>
      <summary>Kiểm tra, sửa {value.items.length} cuốn và ghi lỗi từng cuốn</summary>
      <ol className={styles.rows}>{value.items.map((item, index) => <li className={styles.row} key={index}>
        <label>Cuốn/tập {index + 1}<input value={item.label} maxLength={200} onChange={event => change(index, { label: event.target.value })} /></label>
        <label>Tình trạng cuốn {index + 1}<select value={item.condition} onChange={event => change(index, { condition: event.target.value as typeof item.condition })}>{Object.entries(conditions).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label>
        <button type="button" disabled={value.items.length <= 2} aria-label={`Bỏ cuốn ${index + 1} khỏi bộ`} onClick={() => onChange({ ...value, items: value.items.filter((_, position) => index !== position) })}>Bỏ</button>
        <label>Ghi chú cuốn {index + 1}<textarea rows={2} maxLength={500} value={item.notes} onChange={event => change(index, { notes: event.target.value })} placeholder="Ghi rõ lỗi, phụ kiện hoặc khác biệt của cuốn này" /></label>
      </li>)}</ol>
      <button type="button" disabled={value.items.length >= 50} onClick={() => onChange({ ...value, items: [...value.items, { label: '', condition: 'Good', notes: '' }] })}>Thêm cuốn khác</button>
    </details>
    {error && <p id="bundle-input-error" role="alert" className={styles.error}>{error}</p>}
  </fieldset>;
}
