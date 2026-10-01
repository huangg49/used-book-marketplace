/* Isolated visual study. Synthetic offers never enter the application or API. */
const books = [
  {
    id: "gatsby",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    condition: "Còn tốt",
    sale: 65000,
    exchange: 80000,
    note: "Bìa hơi sờn góc, ruột sách sạch. Không có trang rời.",
  },
  {
    id: "dalloway",
    title: "Mrs. Dalloway",
    author: "Virginia Woolf",
    condition: "Như mới",
    sale: 90000,
    exchange: null,
    note: "Gáy chắc, bìa phẳng. Người đăng mô tả không có ghi chú.",
  },
  {
    id: "jekyll",
    title: "The Strange Case of Dr. Jekyll and Mr. Hyde",
    author: "Robert Louis Stevenson",
    condition: "Cũ nhiều",
    sale: 35000,
    exchange: 45000,
    note: "Gáy có nếp gấp, mép bìa sờn. Vài trang có gạch bút chì; đủ trang.",
  },
  {
    id: "garden",
    title: "The Secret Garden",
    author: "Frances Hodgson Burnett",
    condition: "Còn tốt",
    sale: null,
    exchange: 70000,
    note: "Mép giấy ngả màu nhẹ. Bìa và gáy còn chắc, không ghi chú.",
  },
  {
    id: "siddhartha",
    title: "Siddhartha",
    author: "Hermann Hesse",
    condition: "Đã dùng nhiều",
    sale: 50000,
    exchange: null,
    note: "Có gạch chân ở một số đoạn. Bìa sờn nhẹ, không thiếu trang.",
  },
  {
    id: "alice",
    title: "Alice’s Adventures in Wonderland",
    author: "Lewis Carroll",
    condition: "Còn tốt",
    sale: 75000,
    exchange: 90000,
    note: "Bìa có một nếp nhỏ ở góc dưới. Ruột sách sạch, đủ trang.",
  },
];
const direction = new URLSearchParams(location.search).get("direction") || "a";
document.body.classList.add(`concept-${direction}`);
document.body.classList.toggle(
  "large",
  new URLSearchParams(location.search).get("scale") === "130",
);
if (direction === "b")
  document.querySelector(".brand").src = "assets/logo-white.svg";
let mode = "all";
let lastTrigger;
const money = (n) => new Intl.NumberFormat("vi-VN").format(n) + " ₫";
const offers = (b) =>
  `<div class="offers">${b.sale !== null ? `<div><span>Bán</span><strong>${money(b.sale)}</strong></div>` : ""}${b.exchange !== null ? `<div><span>Đổi</span><strong>${money(b.exchange)}</strong></div>` : ""}</div>`;
const stamp = (b) => `<span class="stamp">${b.condition}</span>`;
const cover = (b) =>
  `<img class="cover" src="assets/${b.id}.svg" alt="Bìa tư liệu ${b.title}" />`;
const summary = (b) =>
  `${b.title}. ${b.condition}. ${b.sale !== null ? "Bán " + money(b.sale) + ". " : ""}${b.exchange !== null ? "Đổi " + money(b.exchange) + ". " : ""}Xem phiếu mẫu`;
const card = (b) =>
  `<button class="book" data-book="${b.id}" aria-label="${summary(b)}"><div class="cover-stage">${cover(b)}</div><div class="book-info"><h3>${b.title}</h3><p class="author">${b.author}</p>${stamp(b)}${offers(b)}</div></button>`;
const slip = (b, i) =>
  `<button class="slip ${i === 0 ? "lead" : ""}" data-book="${b.id}" aria-label="${summary(b)}"><div class="slip-upper"><div class="cover-stage">${cover(b)}</div><div class="book-info"><span class="slip-label">BẢN SÁCH / ${String(books.indexOf(b) + 1).padStart(2, "0")}</span><h3>${b.title}</h3><p class="author">${b.author}</p>${stamp(b)}${offers(b)}</div></div><div class="seller-note"><span>Người đăng mô tả · mẫu</span><p>${b.note}</p></div><div class="slip-link">Xem phiếu sách <span aria-hidden="true">↗</span></div></button>`;
function shelf() {
  const q = document.querySelector("#query").value.trim().toLocaleLowerCase();
  const selected = books.filter(
    (b) =>
      (b.title + " " + b.author).toLocaleLowerCase().includes(q) &&
      (mode === "all" ||
        (mode === "sale" && b.sale !== null) ||
        (mode === "exchange" && b.exchange !== null) ||
        (mode === "both" && b.sale !== null && b.exchange !== null)),
  );
  const searching = mode !== "all" || q;
  const title = searching
    ? "Trên kệ bạn tìm"
    : direction === "b"
      ? "Một kệ sách, nhiều sắc màu."
      : direction === "c"
        ? "Mỗi bản sách, một lời kể."
        : "Chọn cuốn đọc tiếp";
  let content = `<div class="section-heading"><div><span class="eyebrow">${searching ? "KẾT QUẢ MẪU" : direction === "c" ? "PHIẾU SÁCH CŨ" : "SÁCH ĐANG TRÊN KỆ"}</span><h1>${title}</h1></div><span class="count">${selected.length} cuốn</span></div>`;
  if (!selected.length)
    content +=
      '<p class="empty">Chưa có cuốn phù hợp trong bộ mẫu. Thử tên khác hoặc chọn “Tất cả”.</p>';
  else if (direction === "a")
    content += `<div class="catalog">${selected.map(card).join("")}</div><aside class="shop-note"><b>Đọc xong. Chuyền tay.</b><span>Giữ lại câu chuyện. Nhường chỗ cho cuốn mới.</span></aside>`;
  else if (direction === "b") {
    for (let i = 0; i < selected.length; i += 3)
      content += `<section class="shelf-lane"><div class="lane-heading"><h2>${i === 0 ? "Dừng chân ở hàng này" : "Còn những cuốn này"}</h2><button class="lane-next" data-lane="lane-${i}" aria-label="Xem cuốn tiếp theo ở hàng ${i / 3 + 1}">→</button></div><div class="rail" id="lane-${i}">${selected
        .slice(i, i + 3)
        .map(card)
        .join("")}</div></section>`;
    content +=
      '<aside class="shelf-footnote">Tình trạng trên dấu mộc là lời người đăng mô tả, không phải chứng nhận.</aside>';
  } else content += `<div class="slips">${selected.map(slip).join("")}</div>`;
  document.querySelector("#shelf").innerHTML = content;
  document.querySelector(".sample-end").textContent =
    `Hết ${selected.length} cuốn mẫu · Ảnh tư liệu, không phải bản sách đang bán.`;
}
shelf();
document.querySelector("#query").addEventListener("input", shelf);
document.querySelector(".modes").addEventListener("click", (e) => {
  const button = e.target.closest("[data-mode]");
  if (!button) return;
  mode = button.dataset.mode;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  shelf();
});
const dialog = document.querySelector("#book-dialog");
document.querySelector("#shelf").addEventListener("click", (e) => {
  const next = e.target.closest("[data-lane]");
  if (next) {
    const rail = document.getElementById(next.dataset.lane);
    rail.scrollLeft =
      rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1
        ? 0
        : rail.scrollLeft + 180;
    return;
  }
  const button = e.target.closest("[data-book]");
  if (!button) return;
  const b = books.find((b) => b.id === button.dataset.book);
  lastTrigger = button;
  document.querySelector("#detail").innerHTML =
    `<span class="eyebrow">PHIẾU MẪU / KHÔNG PHẢI TIN RAO</span><div class="detail-cover">${cover(b)}</div><h2 id="dialog-title">${b.title}</h2><p class="author">${b.author}</p>${stamp(b)}${offers(b)}<div class="seller-note"><span>Người đăng mô tả · dữ liệu thử</span><p>${b.note}</p></div><p class="dialog-note">Ảnh bìa tư liệu, không thể hiện tình trạng bản sách. Đây là mẫu bố cục; không có thao tác mua/đổi.</p>`;
  dialog.showModal();
});
document
  .querySelector(".close")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => lastTrigger?.focus());
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  if (e.data.type === "scale") {
    document.body.classList.toggle("large", e.data.value === 130);
  }
  if (e.data.type === "reset") {
    mode = "all";
    document.querySelector("#query").value = "";
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === "all")),
      );
    shelf();
    document.querySelector("#scroll").scrollTop = 0;
    dialog.close();
  }
});
