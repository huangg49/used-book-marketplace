import { ArrowRight } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { canReview } from "../../core/session";
import { WorkspaceRecovery } from "./WorkspaceRecovery";
import styles from "./WorkspaceRecovery.module.css";

export default function NotFoundPage() {
  const user = useOutletContext<CurrentUser>();
  return (
    <WorkspaceRecovery
      code="404"
      title="Không tìm thấy trang"
      description="Có thể đường dẫn đã thay đổi hoặc địa chỉ được nhập sai."
    >
      {canReview(user) && (
        <Link to="/review/listings" className={styles.secondary}>
          Về bàn kiểm duyệt
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </WorkspaceRecovery>
  );
}
