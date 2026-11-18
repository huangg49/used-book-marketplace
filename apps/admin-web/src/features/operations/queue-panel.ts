import { useState, type ReactNode } from "react";
import type { Finish, Outcome } from "./action-panel";

export interface ActionContext {
  onFinish: Finish;
  onPending: (pending: boolean) => void;
  // Closes a modal action without treating it as a completed command.
  onClose?: () => void;
  // Rejects when the reload fails, so an acknowledged command can be re-read.
  reconcile: () => Promise<unknown>;
}
export interface Row {
  id: string;
  status: string;
  meta: string[];
  title: string;
  summary?: ReactNode;
  detail?: ReactNode;
  action?: {
    label: string;
    to?: string;
    // A modal action keeps the queue readable while its form owns focus.
    modal?: boolean;
    render?: (context: ActionContext) => ReactNode;
  };
}
// Shared by a queue page and its query: an open panel pauses the auto refresh,
// so a row cannot disappear while its command is being confirmed.
export function useQueuePanel() {
  const [open, setOpen] = useState<string>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Omit<Outcome, "close">>();
  return { open, setOpen, pending, setPending, notice, setNotice };
}
export type QueuePanel = ReturnType<typeof useQueuePanel>;
export const refetchWhileClosed = (panel: QueuePanel) =>
  panel.open ? false : 30_000;
