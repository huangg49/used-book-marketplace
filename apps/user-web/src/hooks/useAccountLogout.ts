import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { session } from "../lib/session";
import { ROUTES } from "../lib/routes";

export function useAccountLogout() {
  const navigate = useNavigate();
  const active = useRef(true);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await session.logout();
      // Successful logout can unmount the signed-in menu before this resolves.
      navigate(ROUTES.login, { replace: true });
    } catch {
      if (active.current) setError("Chưa đăng xuất được. Thử lại giúp mình.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, logout };
}
