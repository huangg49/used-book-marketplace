import { useId, useRef } from "react";
import { Settings2, X } from "lucide-react";
import type { SidebarMode } from "./sidebar-preferences";
import styles from "./WorkspaceShell.module.css";

const sidebarModes = [
  { value: "expanded", label: "Mở cố định", description: "Luôn hiện tên các mục. Không tự thu lại." },
  { value: "collapsed", label: "Thu gọn", description: "Chỉ hiện biểu tượng. Bấm nút để mở." },
  { value: "auto", label: "Tự mở khi rê chuột", description: "Dừng chuột một chút để xem. Rời đi sẽ thu lại." },
] as const;

export function SidebarPreferences({ mode, saved, onChange, onHold }: {
  mode: SidebarMode;
  saved: boolean;
  onChange: (mode: SidebarMode) => void;
  onHold: (open: boolean) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const current = sidebarModes.find(option => option.value === mode)!;
  return <>
    <button ref={trigger} type="button" className={styles.preferencesButton}
      popoverTarget={id} title={`Hiển thị thanh điều hướng · ${current.label}`}
      aria-label="Hiển thị thanh điều hướng">
      <Settings2 size={18} aria-hidden="true" />
      <span className={styles.preferencesLabel}>Thanh điều hướng<small>{current.label}</small></span>
    </button>
    <section id={id} popover="auto" data-sidebar-preferences className={styles.preferencesPanel}
      aria-labelledby={`${id}-title`} onToggle={event => onHold(event.newState === "open")}>
      <header className={styles.preferencesHeader}>
        <h2 id={`${id}-title`}>Hiển thị thanh điều hướng</h2>
        <button type="button" className={styles.preferencesClose} aria-label="Đóng tùy chọn thanh điều hướng"
          popoverTarget={id} popoverTargetAction="hide" onClick={() => trigger.current?.focus()}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <fieldset className={styles.preferencesOptions}>
        <legend>Chế độ trên máy tính</legend>
        {sidebarModes.map(option => <label key={option.value} className={styles.preferenceOption}>
          <input type="radio" name={`${id}-mode`} value={option.value} checked={mode === option.value}
            onChange={() => onChange(option.value)} aria-labelledby={`${id}-${option.value}-label`}
            aria-describedby={`${id}-${option.value}-hint`} />
          <span><strong id={`${id}-${option.value}-label`}>{option.label}</strong><small id={`${id}-${option.value}-hint`}>{option.description}</small></span>
        </label>)}
      </fieldset>
      <p className={styles.preferencesHint} role="status">{saved
        ? "Tự lưu trên trình duyệt này. Trên điện thoại, dùng nút Menu."
        : "Trình duyệt chưa lưu được lựa chọn. Bạn vẫn dùng được trong phiên này."}</p>
    </section>
  </>;
}
