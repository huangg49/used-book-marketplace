// Deliberate local fixtures for design review. No production listing or API model.
export type Mode = "sale" | "exchange" | "both";
export type Cover = "pride" | "alice" | "oz";
export type Condition = "Như mới" | "Tốt" | "Khá" | "Cũ";
export type Scenario =
  | "normal"
  | "loading"
  | "offline"
  | "empty"
  | "missing"
  | "reserved"
  | "restricted";
export interface Book {
  id: string;
  title: string;
  author: string;
  edition: string;
  category: string;
  cover?: Cover;
  mode: Mode;
  price?: number;
  exchangeValue?: number;
  condition: Condition;
  seller: string;
  location: string;
  description: string;
}
export const books: Book[] = [
  {
    id: "pride",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    edition: "Tiếng Anh · Bìa minh họa 1894",
    category: "Văn học",
    cover: "pride",
    mode: "both",
    price: 125000,
    exchangeValue: 125000,
    condition: "Tốt",
    seller: "An (tài khoản mẫu)",
    location: "TP. Hồ Chí Minh",
    description:
      "Mẫu mô tả: bìa có dấu sử dụng, gáy còn chắc. Cần chụp thêm cạnh trang và các vị trí có ghi chú trước khi gửi duyệt.",
  },
  {
    id: "alice",
    title: "Alice’s Adventures in Wonderland",
    author: "Lewis Carroll",
    edition: "Tiếng Anh · Bìa minh họa 1865",
    category: "Thiếu nhi",
    cover: "alice",
    mode: "sale",
    price: 85000,
    condition: "Khá",
    seller: "Linh (tài khoản mẫu)",
    location: "Hà Nội",
    description:
      "Mẫu mô tả: mép bìa sờn, có dấu cũ theo thời gian. Thông tin này chỉ phục vụ thử bố cục, không xác nhận tình trạng bản sách trong ảnh lưu trữ.",
  },
  {
    id: "oz",
    title: "The Wonderful Wizard of Oz",
    author: "L. Frank Baum",
    edition: "Tiếng Anh · Bìa minh họa 1900",
    category: "Thiếu nhi",
    cover: "oz",
    mode: "exchange",
    exchangeValue: 95000,
    condition: "Tốt",
    seller: "Minh (tài khoản mẫu)",
    location: "Đà Nẵng",
    description:
      "Mẫu mô tả: muốn đổi một cuốn văn học khác. Giá trị đổi được ghi riêng để hai bên hiểu rõ trước khi đề nghị trao đổi.",
  },
  {
    id: "long",
    title:
      "Những ngày đi bộ qua thành phố và những câu chuyện còn ở lại trong một cuốn sổ",
    author: "Nhóm biên soạn (mẫu)",
    edition: "Đầu sách giả lập · Không có ảnh",
    category: "Tản văn",
    mode: "sale",
    price: 1000000,
    condition: "Cũ",
    seller: "Bạn đọc (tài khoản mẫu)",
    location: "Cần Thơ",
    description:
      "Đầu sách giả lập để kiểm tra tên dài, mức giá tối đa và thiếu ảnh. Không có sách tương ứng đang được chào bán.",
  },
];
export const modeLabel: Record<Mode, string> = {
  sale: "Bán sách",
  exchange: "Đổi sách",
  both: "Bán hoặc đổi",
};
export const money = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
export function filterBooks(
  query: string,
  mode: "all" | "sale" | "exchange",
  saved?: string[],
) {
  const term = normalize(query);
  return books.filter(
    (b) =>
      (!saved || saved.includes(b.id)) &&
      (mode === "all" || b.mode === mode || b.mode === "both") &&
      normalize(`${b.title} ${b.author} ${b.category}`).includes(term),
  );
}
export interface DraftPhoto {
  id: string;
  uri?: string;
  cover?: Cover;
}
export interface Draft {
  bookId: string;
  photos: DraftPhoto[];
  condition: Condition | "";
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  missingPages: boolean;
  mode: Mode;
  price: string;
  exchangeValue: string;
  description: string;
  ownsBook: boolean;
}
export const emptyDraft = (): Draft => ({
  bookId: "",
  photos: [],
  condition: "",
  pages: "",
  coverNote: "",
  notes: "",
  accessories: "",
  missingPages: false,
  mode: "sale",
  price: "",
  exchangeValue: "",
  description: "",
  ownsBook: false,
});
export const sampleDraft = (): Draft => ({
  bookId: "pride",
  photos: [{ id: "sample-pride", cover: "pride" }],
  condition: "Tốt",
  pages: "Các trang đủ, đọc rõ.",
  coverNote: "Có nếp gấp nhỏ ở góc bìa.",
  notes: "Có ghi chú bút chì ở vài trang.",
  accessories: "Không có phụ kiện.",
  missingPages: false,
  mode: "both",
  price: "125000",
  exchangeValue: "125000",
  description:
    "Muốn chuyền lại cho người đọc tiếp theo. Có thể đổi một cuốn văn học.",
  ownsBook: true,
});
export function validPrice(value: string) {
  return (
    /^\d+$/.test(value) && Number(value) >= 10000 && Number(value) <= 1000000
  );
}
export function validateStep(draft: Draft, step: number): string[] {
  if (step === 0)
    return books.some((b) => b.id === draft.bookId)
      ? []
      : ["Chọn đầu sách và ấn bản trước khi tiếp tục."];
  if (step === 1)
    return [
      ...(!draft.photos.length || draft.photos.length > 8
        ? ["Thêm từ 1 đến 8 ảnh sách."]
        : []),
      ...(!draft.condition ? ["Chọn tình trạng tổng thể."] : []),
      ...([draft.pages, draft.coverNote, draft.notes, draft.accessories].some(
        (v) => !v.trim(),
      )
        ? ["Mô tả trang, bìa, ghi chú và phụ kiện. Nếu không có, hãy ghi rõ."]
        : []),
      ...(draft.missingPages
        ? ["Sách thiếu phần nội dung trọng yếu chưa đủ điều kiện đăng."]
        : []),
    ];
  if (step === 2)
    return [
      ...(draft.mode !== "exchange" && !validPrice(draft.price)
        ? ["Giá bán cần là số nguyên từ 10.000 đến 1.000.000 đồng."]
        : []),
      ...(draft.mode !== "sale" && !validPrice(draft.exchangeValue)
        ? ["Giá trị đổi cần là số nguyên từ 10.000 đến 1.000.000 đồng."]
        : []),
      ...(!draft.description.trim()
        ? ["Thêm lời mô tả cho bản sách này."]
        : []),
    ];
  return [
    ...[0, 1, 2].flatMap((s) => validateStep(draft, s)),
    ...(!draft.ownsBook ? ["Xác nhận bạn có quyền đăng bản sách này."] : []),
  ];
}
