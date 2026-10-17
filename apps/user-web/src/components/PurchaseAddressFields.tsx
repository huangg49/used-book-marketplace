import { useId } from "react";
import { MapPin, Plus } from "lucide-react";
import styles from "../pages/PurchaseFlow.module.css";

export type PurchaseAddressForm = {
  recipientName: string;
  phone: string;
  localityCode: string;
  detail: string;
};
export function PurchaseAddressFields({
  addresses,
  selected,
  onSelect,
  form,
  onChange,
  localities,
}: {
  addresses: (PurchaseAddressForm & { id: string; isDefault: boolean })[];
  selected: string;
  onSelect: (id: string) => void;
  form: PurchaseAddressForm;
  onChange: (value: PurchaseAddressForm) => void;
  localities: { code: string; label: string }[];
}) {
  const group = useId();
  const isSaved = addresses.some((item) => item.id === selected);
  return (
    <>
      {addresses.length > 0 && (
        <fieldset className={styles.addresses}>
          <legend>Địa chỉ đã lưu</legend>
          {addresses.map((address) => (
            <label key={address.id} className={styles.address}>
              <input
                type="radio"
                name={group}
                checked={selected === address.id}
                onChange={() => onSelect(address.id)}
              />
              <span>
                <strong>{address.recipientName}</strong>
                {address.isDefault && <small>Mặc định</small>}
                <span>{address.phone}</span>
                <span>
                  {address.detail} ·{" "}
                  {localities.find((item) => item.code === address.localityCode)
                    ?.label ?? address.localityCode}
                </span>
              </span>
            </label>
          ))}
          <label className={styles.address}>
            <input
              type="radio"
              name={group}
              checked={!isSaved}
              onChange={() => onSelect("new")}
            />
            <span className={styles.addAddress}>
              <Plus size={18} aria-hidden="true" /> Dùng địa chỉ mới
            </span>
          </label>
        </fieldset>
      )}
      {!isSaved && (
        <div className={styles.form}>
          <div className={styles.fieldPair}>
            <label>
              Họ tên
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                placeholder="Tên người nhận sách"
                value={form.recipientName}
                onChange={(e) =>
                  onChange({ ...form, recipientName: e.target.value })
                }
              />
            </label>
            <label>
              Số điện thoại
              <input
                required
                type="tel"
                pattern="0[0-9]{9}"
                maxLength={10}
                autoComplete="tel"
                placeholder="Số điện thoại 10 chữ số"
                value={form.phone}
                onChange={(e) => onChange({ ...form, phone: e.target.value })}
              />
            </label>
          </div>
          <label>
            Khu vực phục vụ
            <select
              required
              value={form.localityCode}
              onChange={(e) =>
                onChange({ ...form, localityCode: e.target.value })
              }
            >
              <option value="">Chọn khu vực tại TP.HCM</option>
              {localities.map((area) => (
                <option key={area.code} value={area.code}>
                  {area.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Địa chỉ chi tiết
            <textarea
              required
              minLength={5}
              maxLength={300}
              autoComplete="street-address"
              placeholder="Số nhà, tên đường, phường/xã…"
              value={form.detail}
              onChange={(e) => onChange({ ...form, detail: e.target.value })}
            />
          </label>
        </div>
      )}
      <p className={styles.note}>
        <MapPin size={16} aria-hidden="true" /> Giao trực tiếp từ người bán,
        trong phạm vi TP.HCM.
      </p>
    </>
  );
}
