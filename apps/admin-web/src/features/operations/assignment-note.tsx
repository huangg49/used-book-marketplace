import { useQuery } from "@tanstack/react-query";
import { session } from "../../core/session";
import { myPointAssignments } from "./contracts";

// N4-11: Staff queues list only the points the person is assigned to now, so
// an empty queue names those points (or says there are none).
export function AssignmentNote() {
  const result = useQuery({
    queryKey: ["me", "point-assignments"],
    queryFn: () => session.request("/me/point-assignments", myPointAssignments),
  });
  const items = result.data?.items;
  if (!items)
    return "Danh sách chỉ gồm sách tại các điểm bạn đang được phân công, trừ sách của chính bạn.";
  if (!items.length)
    return "Bạn chưa được phân công điểm nào nên danh sách luôn trống. Hãy liên hệ quản trị viên để được phân công.";
  return `Bạn đang được phân công tại ${items.map((p) => `${p.name} (${p.code})`).join(", ")}. Danh sách chỉ gồm sách tại các điểm này, trừ sách của chính bạn.`;
}
