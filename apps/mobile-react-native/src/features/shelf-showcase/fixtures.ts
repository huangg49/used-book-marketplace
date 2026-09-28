import type { Listing } from "../shelf/contracts";

const id = (value: number) =>
  `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export type ShowcaseBook = {
  listing: Listing;
  cover?: number;
  credit: string;
  source?: string;
  license?: string;
};
const common = {
  fulfillment: null,
  version: 1,
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  publishedAt: "2026-09-28T00:00:00Z",
  pages: "Mô tả mẫu: đủ trang, chữ rõ; vài trang đã ngả màu.",
  coverNote: "Mô tả mẫu: mép bìa sờn nhẹ, gáy vẫn chắc.",
  notes: "Mô tả mẫu: có vài dòng gạch chân bằng bút chì.",
  accessories: "Mô tả mẫu: không kèm phụ kiện.",
} as const;
function base(
  index: number,
  title: string,
  author: string,
  condition: Listing["condition"],
) {
  return {
    ...common,
    id: id(index),
    revisionId: id(100 + index),
    condition,
    book: {
      id: id(200 + index),
      title,
      authors: [author],
      publisher: null,
      publicationYear: null,
      language: "Tiếng Anh",
      edition: "Dữ liệu trình bày mẫu; không xác định ấn bản đang bán",
      category: "Văn học",
      isbn: null,
    },
    seller: {
      id: id(300 + index),
      displayName: ["An · mẫu", "Linh · mẫu", "Minh · mẫu", "Bạn đọc · mẫu"][
        index - 1
      ],
    },
    photos: [{ id: id(400 + index), width: 800, height: 1200 }],
    description:
      "Mẫu lời người đăng: đọc xong, mình muốn gửi cuốn sách đến một người đọc tiếp theo. Giá và tình trạng bên dưới chỉ dùng để xem giao diện, không mô tả bản sách trong ảnh tư liệu.",
  };
}

// Kept outside the UI library. Never written to the API, query cache or database.
export const showcaseBooks: ShowcaseBook[] = [
  {
    listing: {
      ...base(1, "Pride and Prejudice", "Jane Austen", "Good"),
      mode: "Both",
      salePrice: 125000,
      exchangeValue: 150000,
    },
    cover: require("../../../assets/design/pride.jpg"),
    credit:
      "National Library NZ on The Commons · bìa Peacock 1894 · CC BY 2.0 · ảnh không chỉnh sửa",
    source:
      "https://commons.wikimedia.org/wiki/File:AUSTEN(1894)_Pride_and_prejudice_(15811958311).jpg",
    license: "https://creativecommons.org/licenses/by/2.0/",
  },
  {
    listing: {
      ...base(2, "Alice’s Adventures in Wonderland", "Lewis Carroll", "Fair"),
      mode: "Sale",
      salePrice: 85000,
      exchangeValue: null,
    },
    cover: require("../../../assets/design/alice.jpg"),
    credit:
      "Bìa Alice 1865 · Wikimedia Commons · public domain theo hồ sơ nguồn trong repo",
    source:
      "https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_(1865).jpg",
  },
  {
    listing: {
      ...base(3, "The Wonderful Wizard of Oz", "L. Frank Baum", "LikeNew"),
      mode: "Exchange",
      salePrice: null,
      exchangeValue: 95000,
      notes: "Mô tả mẫu: chưa ghi chú trong sách.",
    },
    cover: require("../../../assets/design/oz.jpg"),
    credit:
      "W. W. Denslow · bìa ấn bản đầu · Wikimedia Commons · public domain theo hồ sơ nguồn trong repo",
    source:
      "https://commons.wikimedia.org/wiki/File:The_Wonderful_Wizard_of_Oz_first_edition_cover.jpg",
  },
  {
    listing: {
      ...base(
        4,
        "Những ngày đi bộ qua thành phố và những câu chuyện còn ở lại trong một cuốn sổ",
        "Nhóm biên soạn · mẫu",
        "Worn",
      ),
      mode: "Sale",
      salePrice: 1000000,
      exchangeValue: null,
    },
    credit:
      "Đầu sách hư cấu để kiểm tên dài, giá giới hạn trên và ảnh thiếu. Không có bản sách đang bán.",
  },
];
