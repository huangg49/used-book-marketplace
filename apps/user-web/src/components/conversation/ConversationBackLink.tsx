import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function ConversationBackLink({ className }: { className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Link
      className={className}
      to="/chat"
      viewTransition
      aria-label="Về danh sách hội thoại"
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
      Hội thoại của bạn
    </Link>
  );
}
