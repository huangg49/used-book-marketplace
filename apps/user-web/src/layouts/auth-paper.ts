import { createContext, useContext, type RefObject } from "react";

type AuthPaperContext = {
  turnTo: (target: string) => Promise<void>;
  complete: (target: string) => Promise<void>;
  draft: RefObject<{ email: string; password: string }>;
  updateDraft: (field: "email" | "password", value: string) => void;
};
export const PaperContext = createContext<AuthPaperContext | null>(null);
export function useAuthPaper() {
  const value = useContext(PaperContext);
  if (!value) throw new Error("Auth paper requires AuthLayout");
  return value;
}
