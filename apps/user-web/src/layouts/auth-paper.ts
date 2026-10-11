import { createContext, useContext, type RefObject } from "react";

export type AuthDraft = {
  email: string; password: string;
  registerName: string; registerEmail: string; registerPassword: string; registerConfirmation: string;
  recoveryEmail: string;
};
type AuthPaperContext = {
  turnTo: (target: string) => Promise<void>;
  complete: (target: string) => Promise<void>;
  draft: RefObject<AuthDraft>;
  updateDraft: (field: keyof AuthDraft, value: string) => void;
};
export const PaperContext = createContext<AuthPaperContext | null>(null);
export function useAuthPaper() {
  const value = useContext(PaperContext);
  if (!value) throw new Error("Auth paper requires AuthLayout");
  return value;
}
