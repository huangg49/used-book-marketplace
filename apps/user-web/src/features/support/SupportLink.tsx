import { Link } from "react-router-dom";
import type { SupportCase } from "@used-books/session-client";
function supportHref(
  type: NonNullable<SupportCase["target"]>["type"],
  id: string,
  kind: SupportCase["kind"] = "TransactionIssue",
) {
  return `/support/new?${new URLSearchParams({ type, id, kind })}`;
}
export function SupportLink({
  type,
  id,
  report = false,
  label,
}: {
  type: NonNullable<SupportCase["target"]>["type"];
  id: string;
  report?: boolean;
  label?: string;
}) {
  return (
    <Link to={supportHref(type, id, report ? "Violation" : "TransactionIssue")}>
      {label ?? (report ? "Báo cáo nội dung" : "Gửi phản ánh / cần hỗ trợ")}
    </Link>
  );
}
