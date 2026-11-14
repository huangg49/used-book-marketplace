import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import type { ChatMessage } from "../../../lib/mock/exchangeDetail";
import styles from "./ExchangeChatDrawer.module.css";

type Marker = Pick<ChatMessage, "id" | "sentAt">;

function isNewer(message: Marker, seen: Marker | null) {
  return !seen || message.sentAt > seen.sentAt ||
    (message.sentAt === seen.sentAt && message.id > seen.id);
}

function readMarker(key: string): Marker | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && "id" in value && "sentAt" in value &&
      typeof value.id === "string" && typeof value.sentAt === "string") {
      return { id: value.id, sentAt: value.sentAt };
    }
  } catch {
    // The current page can still track new messages when storage is disabled.
  }
  return null;
}

export function ExchangeChatDrawer({ viewerId, exchangeId, transactionCode, partnerName, latest, children }: {
  viewerId: string;
  exchangeId: string;
  transactionCode: string;
  partnerName: string;
  latest: ChatMessage[];
  children: (open: boolean) => ReactNode;
}) {
  const titleId = useId();
  const codeId = useId();
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const storageKey = `latlai:exchange-chat-seen:${viewerId}:${exchangeId}`;
  const [seen, setSeen] = useState(() => readMarker(storageKey));
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const last = latest.at(-1);

  useEffect(() => {
    if (!open || !last || !isNewer(last, seen)) return;
    const marker = { id: last.id, sentAt: last.sentAt };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(marker));
    } catch {
      // Keep the read marker in memory when storage is unavailable.
    }
  }, [last, open, seen, storageKey]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!closing || !dialog?.open) return;

    // Keep the modal and its scroll lock active until the exit animation ends.
    const exitName = getComputedStyle(dialog).animationName;
    const exit = dialog.getAnimations?.().find(animation =>
      "animationName" in animation && animation.animationName === exitName);
    if (!exit) {
      dialog.close();
      return;
    }

    let active = true;
    const finish = () => {
      if (active && dialog.open) dialog.close();
    };
    void exit.finished.then(finish, finish);
    return () => { active = false; };
  }, [closing]);

  function requestClose() {
    const dialog = dialogRef.current;
    if (closing || !dialog?.open) return;
    dialog.style.setProperty("--drawer-exit-from", getComputedStyle(dialog).transform);
    setClosing(true);
  }

  function close() {
    if (last && isNewer(last, seen)) setSeen({ id: last.id, sentAt: last.sentAt });
    setOpen(false);
    setClosing(false);
    dialogRef.current?.style.removeProperty("--drawer-exit-from");
    trigger.current?.focus({ preventScroll: true });
  }

  const unread = open ? 0 : latest.filter(message =>
    message.senderRole === "partner" && isNewer(message, seen)).length;
  const initial = Array.from(partnerName.trim())[0]?.toLocaleUpperCase("vi");

  return (
    <>
      <button ref={trigger} type="button" className={styles.trigger}
        aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}>
        <MessageCircle size={18} aria-hidden="true" />
        <span className={styles.name} title={partnerName}>Nhắn cho <bdi>{partnerName}</bdi></span>
        {unread > 0 && <span className={styles.count} aria-label={`${unread} tin mới trên tab này`}>{unread}</span>}
      </button>
      <dialog id={dialogId} ref={dialogRef} className={styles.drawer}
        aria-labelledby={titleId} aria-describedby={codeId}
        data-closing={closing || undefined} onClose={close} data-lenis-prevent
        onCancel={event => {
          event.preventDefault();
          requestClose();
        }}>
        <div className={styles.sheet}>
          <header className={styles.header}>
            <span className={styles.avatar} aria-hidden="true">
              {initial || <MessageCircle size={20} />}
            </span>
            <div className={styles.identity}>
              <div className={styles.nameRow}>
                <h2 id={titleId}><bdi>{partnerName}</bdi></h2>
                <span className={styles.partnerRoleBadge}>Đối tác</span>
              </div>
              <p id={codeId} className={styles.transaction}>
                Mã giao dịch <bdi>#{transactionCode}</bdi>
              </p>
            </div>
            <button type="button" aria-label="Đóng tin nhắn" className={styles.close}
              onClick={requestClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {children(open)}
        </div>
      </dialog>
    </>
  );
}
