import { money } from "../../core/format";
import { labels, type Revision } from "./contracts";

const missing = "Chưa khai báo";
const bool = (v: boolean | null) => (v === null ? missing : v ? "Có" : "Không");
const text = (v: string | null | undefined) => v || missing;
const fields = (revision: Revision) => {
  const c = revision.content;
  return [
    { label: "Đầu sách tham chiếu", raw: c.bookId, display: text(c.bookId) },
    {
      label: "Hình thức",
      raw: c.mode,
      display: labels[c.mode || ""] || missing,
    },
    { label: "Giá bán", raw: c.salePrice, display: money(c.salePrice) },
    {
      label: "Giá trị đổi",
      raw: c.exchangeValue,
      display: money(c.exchangeValue),
    },
    {
      label: "Tình trạng",
      raw: c.condition,
      display: labels[c.condition || ""] || missing,
    },
    { label: "Ruột sách", raw: c.pages, display: text(c.pages) },
    { label: "Bìa và gáy", raw: c.coverNote, display: text(c.coverNote) },
    { label: "Ghi chú / đánh dấu", raw: c.notes, display: text(c.notes) },
    { label: "Phụ kiện", raw: c.accessories, display: text(c.accessories) },
    { label: "Mô tả", raw: c.description, display: text(c.description) },
    { label: "Còn đọc được", raw: c.readable, display: bool(c.readable) },
    {
      label: "Thiếu trang",
      raw: c.hasMissingPages,
      display: bool(c.hasMissingPages),
    },
    {
      label: "Thiếu nội dung trọng yếu",
      raw: c.missingEssentialContent,
      display: bool(c.missingEssentialContent),
    },
    // Identity AND order matter: equal counts do not mean the photos are unchanged.
    {
      label: "Ảnh gửi kèm",
      raw: c.mediaIds,
      display: c.mediaIds.length
        ? `${c.mediaIds.length} ảnh · ${c.mediaIds.map((id, i) => `${i + 1}: ${id.slice(0, 8)}`).join(" · ")}`
        : "Không có ảnh",
    },
    {
      label: "Bộ sách",
      raw: c.bundle ?? null,
      display: c.bundle
        ? `${c.bundle.title}\n${c.bundle.items.map((item, i) => `${i + 1}. ${item.label} · ${labels[item.condition]}${item.notes ? ` · ${item.notes}` : ""}`).join("\n")}\nGiao nguyên bộ · Đã khai báo quyền đăng độc quyền`
        : "Sách lẻ",
    },
    {
      label: "Lựa chọn giao nhận",
      raw: c.fulfillment ?? null,
      display: c.fulfillment
        ? `Giao trực tiếp · nơi gửi #${c.fulfillment.originAddressId.slice(0, 8)} · phiên bản ${c.fulfillment.originAddressVersion}`
        : "Chưa chọn nơi gửi",
    },
  ];
};

export function compareRevisions(before: Revision, after: Revision) {
  const old = fields(before);
  return fields(after).map((field, index) => ({
    label: field.label,
    before: old[index].display,
    after: field.display,
    changed: JSON.stringify(old[index].raw) !== JSON.stringify(field.raw),
  }));
}
