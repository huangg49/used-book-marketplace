import { useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import styles from "./WalletPage.module.css";
import { paymentChannel } from "../lib/payment-return";

// The payment tab has no credentials. It only wakes the original, authenticated
// wallet tab; QueryDR remains the authority for payment/credit state.
export function VNPayReturnGate() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (
    location.pathname === "/wallet" &&
    (params.has("vnp_TxnRef") || params.get("payment-return") === "1")
  ) {
    return <VNPayReturnPage />;
  }
  return <Outlet />;
}

function VNPayReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawId = params.get("vnp_TxnRef") ?? params.get("topup");
  const id =
    rawId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(rawId)
      ? rawId
      : undefined;
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    // Remove the signed provider query and bank metadata from the visible URL.
    navigate(`/wallet?payment-return=1${id ? `&topup=${id}` : ""}`, {
      replace: true,
    });
    if (!id || typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(paymentChannel(id));
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === "wallet-ready" && event.data?.id === id) {
        window.clearInterval(repeat);
        window.clearTimeout(timeout);
        window.close();
        setWaiting(false);
      }
    };
    const notify = () => channel.postMessage({ type: "payment-returned", id });
    notify();
    const repeat = window.setInterval(notify, 500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(repeat);
      setWaiting(false);
    }, 5000);
    return () => {
      window.clearInterval(repeat);
      window.clearTimeout(timeout);
      channel.close();
    };
  }, [id, navigate]);
  return (
    <main className={styles.page}>
      <h1>Quay lại ví của bạn</h1>
      <p role="status">
        {waiting && id && typeof BroadcastChannel !== "undefined"
          ? "Đang trở lại tab ví để kiểm tra kết quả…"
          : "Quay lại tab ví đã mở để xem số dư và kết quả xác minh."}
      </p>
      <p>Tiền chỉ được ghi nhận sau khi máy chủ xác minh với VNPay.</p>
      <button type="button" onClick={() => window.close()}>
        Đóng tab thanh toán
      </button>
      <p>
        Nếu tab ví đã đóng,{" "}
        <Link to={id ? `/wallet?topup=${id}` : "/wallet"}>mở lại ví</Link> và
        đăng nhập để kiểm tra.
      </p>
    </main>
  );
}
