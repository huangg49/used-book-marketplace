import type { ReactNode } from "react";
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
  className,
  icon,
}: {
  type: NonNullable<SupportCase["target"]>["type"];
  id: string;
  report?: boolean;
  label?: string;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      to={supportHref(type, id, report ? "Violation" : "TransactionIssue")}
      className={className}
    >
      {icon}
      {label ?? (report ? "Báo cáo nội dung" : "Gửi phản ánh / cần hỗ trợ")}
    </Link>
  );
}
