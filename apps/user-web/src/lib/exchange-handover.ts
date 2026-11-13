import type { ExchangeStatus } from "./mock/exchangeMine";

export const exchangeHandoverAnchor = {
  overview: "giao-nhan",
  outgoing: "gui-sach",
  incoming: "nhan-sach",
} as const;

type Anchor = (typeof exchangeHandoverAnchor)[keyof typeof exchangeHandoverAnchor];

export interface HandoverNavigation {
  target?: Anchor;
  navigationKey: string;
}

export function exchangeHandoverTarget(hash: string): Anchor | undefined {
  return Object.values(exchangeHandoverAnchor).find(anchor => hash === `#${anchor}`);
}

export function isExchangeHandover(status: ExchangeStatus) {
  return status === "WAITING_YOU_SEND" ||
    status === "WAITING_YOU_CONFIRM" ||
    status === "DELIVERING";
}
