import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText } from "../../core/format";
import { canResolve, session } from "../../core/session";
import { escalationLabels, pointEscalationList } from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel } from "./queue-panel";

// N4-14: overdue point work, derived by the API at read time. The page only
// informs; nothing here passes, fails or confiscates a book.
export function EscalationsPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canResolve(user)) return <Forbidden />;
  return <EscalationsContent />;
}

function EscalationsContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "escalations"],
    queryFn: () =>
      session.request("/operations/escalations", pointEscalationList),
    refetchInterval: refetchWhileClosed(panel),
  });
  return (
    <OperationsQueue
      number="07"
      title="Việc quá hạn."
      intro="Sách chờ kiểm tra, chờ quyết định bằng chứng hoặc chờ người bán nhận lại đã quá hạn. Hệ thống không tự kết luận hay tịch thu sách."
      order="Xếp theo hạn, quá hạn lâu nhất trước."
      unit="việc"
      result={result}
      serverTime={result.data?.serverTime}
      panel={panel}
      rows={(result.data?.items ?? []).map((item) => {
        const [label, guidance] = escalationLabels[item.kind];
        return {
          id: item.intakeId,
          status: label,
          meta: [item.pointName, `Hạn ${dateText(item.dueAt)}`],
          title: item.title,
          detail: <p>{guidance}</p>,
        };
      })}
      empty={{
        title: "Không có việc quá hạn.",
        body: "Việc quá hạn kiểm tra, quyết định bằng chứng hoặc nhận lại sách sẽ hiện ở đây.",
      }}
    />
  );
}
