import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function ConversationBackLink({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const fromOrders = location.state?.chatFromOrders === true;
  return (
    <Link
      className={className}
      to={fromOrders ? "/orders" : "/chat"}
      viewTransition
      aria-label={fromOrders ? "Về đơn hàng của tôi" : "Về danh sách hội thoại"}
      onClick={(event) => {
        if (
          location.state?.chatFromInbox === true &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          void navigate(-1);
        }
      }}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      {fromOrders ? "Đơn hàng của tôi" : "Hội thoại của bạn"}
    </Link>
  );
}
