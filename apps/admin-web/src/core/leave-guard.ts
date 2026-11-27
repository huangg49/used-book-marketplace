import { createContext } from "react";

export type LeaveGuardState = {
  busy?: boolean;
  message: string;
};

export const LeaveGuard = createContext<
  (guard: LeaveGuardState | undefined) => void
>(() => {});
