import { createContext } from "react";
export const LeaveGuard = createContext<
  (guard: (() => boolean) | undefined) => void
>(() => {});
