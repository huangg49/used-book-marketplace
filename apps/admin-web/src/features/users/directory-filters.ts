export const directoryStatuses = [
  ["", "Tất cả"],
  ["ACTIVE", "Đang hoạt động"],
  ["PENDING_VERIFICATION", "Chờ xác minh"],
  ["RESTRICTED", "Hạn chế"],
  ["LOCKED", "Đã khóa"],
  ["DISABLED", "Đã vô hiệu"],
] as const;
export const directoryRoles = [
  ["", "Tất cả"],
  ["MEMBER", "Thành viên"],
  ["STAFF", "Nhân viên"],
  ["ADMIN", "Quản trị viên"],
  ["TEST_OPERATOR", "Vận hành thử"],
] as const;
export type DirectoryFilters = { q: string; status: string; role: string };
export function readDirectoryFilters(params: URLSearchParams): DirectoryFilters {
  const status = params.get("status") ?? "";
  const role = params.get("role") ?? "";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    status: directoryStatuses.some(([value]) => value === status) ? status : "",
    role: directoryRoles.some(([value]) => value === role) ? role : "",
  };
}
export function directorySearchParams(filters: DirectoryFilters) {
  const normalized = readDirectoryFilters(new URLSearchParams(filters));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalized)) {
    if (value) params.set(key, value);
  }
  return params;
}
export function directoryRequest(filters: DirectoryFilters, cursor?: string | null) {
  const params = directorySearchParams(filters);
  params.set("limit", "20");
  if (cursor) params.set("cursor", cursor);
  return `/operations/users?${params}`;
}
