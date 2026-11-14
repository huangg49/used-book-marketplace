import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Paperclip,
  Search,
  Send,
  Wallet,
} from "lucide-react";
import "../../../../packages/brand/v1.1/focus.css";
import "./preview.css";

const caseId = "B57A9858";
const deadline = "10:02 · 16/11/2026";
const request =
  "An bổ sung biên nhận bàn giao. Bình bổ sung thông tin về cuốn sách chưa gửi.";
const books = {
  An: {
    title: "Truyện Kiều",
    image: "/illustrations/truyen-kieu.webp",
    recipient: "Bình",
    delivered: true,
  },
  Bình: {
    title: "The Wonderful Wizard of Oz",
    image: "/illustrations/oz.jpg",
    recipient: "An",
    delivered: false,
  },
} as const;

const views = [
  { id: "all", label: "So sánh" },
  { id: "queue", label: "Danh sách Admin" },
  { id: "case", label: "Hồ sơ Admin" },
  { id: "member", label: "Bước 5 của User" },
] as const;
type View = (typeof views)[number]["id"];

const queue = [
  {
    id: caseId,
    pair: "An ↔ Bình",
    book: "Truyện Kiều · The Wonderful Wizard of Oz",
    stage: "Đang bổ sung bằng chứng",
    issue: "Một chiều chưa gửi",
    total: "200.000 ₫",
  },
  {
    id: "E72854A0",
    pair: "Hà ↔ Minh",
    book: "Dế Mèn phiêu lưu ký và 4 cuốn khác",
    stage: "Chờ xử lý",
    issue: "Cần đối chiếu tình trạng sách",
    total: "360.000 ₫",
  },
  {
    id: "8C05B26F",
    pair: "Linh ↔ Nam",
    book: "Những tấm lòng cao cả · Không gia đình",
    stage: "Đang chờ sách hoàn",
    issue: "Đã có mã vận đơn hoàn",
    total: "180.000 ₫",
  },
];

function Pair() {
  return (
    <span className="pair" aria-hidden="true">
      <span className="avatar">A</span>
      <ArrowLeftRight size={13} aria-hidden="true" />
      <span className="avatar cool">B</span>
    </span>
  );
}

function Routes() {
  return (
    <div className="routes">
      {Object.entries(books).map(([sender, book]) => (
        <article className="route" key={sender}>
          <img src={book.image} alt="" width="54" height="76" />
          <div className="route-copy">
            <div className="route-people">
              <strong>{sender}</strong>
              <ArrowRight size={15} aria-hidden="true" />
              <strong>{book.recipient}</strong>
            </div>
            <h3>{book.title}</h3>
            <span
              className={
                book.delivered ? "delivery success" : "delivery waiting"
              }
            >
              {book.delivered ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Clock3 size={14} aria-hidden="true" />
              )}
              {book.delivered ? "Đã xác nhận nhận sách" : "Chưa ghi nhận gửi"}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function Queue({ open }: { open: () => void }) {
  const [search, setSearch] = useState("");
  const fold = (text: string) =>
    text
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replaceAll("đ", "d");
  const rows = queue.filter((row) =>
    fold(Object.values(row).join(" ")).includes(
      fold(search.trim().replace(/^#/, "")),
    ),
  );
  return (
    <>
      <header className="screen-title">
        <h2>Khiếu nại trao đổi</h2>
        <p>{rows.length} hồ sơ đang thụ lý</p>
      </header>
      <div className="search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          aria-label="Tìm theo mã, người hoặc sách"
          placeholder="Mã hồ sơ, tên người hoặc sách"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <ul className="queue">
        {rows.map((row) => (
          <li key={row.id} data-featured={row.id === caseId || undefined}>
            <div className="queue-title">
              {row.id === caseId && <Pair />}
              <div>
                <h3>{row.pair}</h3>
                <span className="muted">#{row.id}</span>
              </div>
              <span className="amount">{row.total}</span>
            </div>
            <p className="queue-books">{row.book}</p>
            <div className="queue-status">
              <span>{row.issue}</span>
              <small>{row.stage}</small>
            </div>
            {row.id === caseId && (
              <button type="button" className="text-button" onClick={open}>
                Mở hồ sơ <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && <p className="empty">Không tìm thấy hồ sơ phù hợp.</p>}
    </>
  );
}

function Dossier({ submitted }: { submitted: string }) {
  return (
    <>
      <header className="screen-title dossier-title">
        <div>
          <span className="muted">Hồ sơ #{caseId}</span>
          <h2>An ↔ Bình</h2>
        </div>
        <span className="status">
          <Clock3 size={14} aria-hidden="true" /> Đang bổ sung bằng chứng
        </span>
      </header>
      <section className="route-sheet" aria-label="Hai chiều giao sách">
        <h3>Hai chiều giao sách</h3>
        <Routes />
      </section>
      <section className="review-sheet" aria-labelledby="review-heading">
        <h3 id="review-heading">Giải trình và bằng chứng</h3>
        {submitted ? (
          <div className="statement">
            <span className="avatar">A</span>
            <div>
              <strong>An</strong>
              <span className="muted"> Vừa gửi giải trình</span>
              <p>{submitted}</p>
            </div>
          </div>
        ) : (
          <p className="muted">Chưa nhận được giải trình từ An.</p>
        )}
        <div className="file-status">
          <Paperclip size={16} aria-hidden="true" /> Chưa có tệp bằng chứng
        </div>
      </section>
      <section className="case-next" aria-label="Bước tiếp theo của Admin">
        <div>
          <strong>Chờ hai bên bổ sung</strong>
          <p>Hạn {deadline}</p>
        </div>
        <strong>Giữ 200.000 ₫</strong>
      </section>
    </>
  );
}

function Member({
  submitted,
  onSubmit,
}: {
  submitted: string;
  onSubmit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <header className="screen-title member-title">
        <span className="muted">Bước 5 · Phiếu #{caseId}</span>
        <h2>Hồ sơ của bạn</h2>
      </header>
      <section className="member-task" aria-labelledby="task-title">
        <div className="member-state">
          {submitted ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Clock3 size={16} aria-hidden="true" />
          )}
          {submitted ? "Đã ghi nhận giải trình" : "Đang bổ sung bằng chứng"}
        </div>
        <h3 id="task-title" tabIndex={-1} ref={confirmation}>
          {submitted ? "Đã gửi giải trình" : "Bổ sung thông tin bàn giao"}
        </h3>
        <p>
          {submitted
            ? "Admin sẽ đối chiếu nội dung bạn gửi với thông tin bàn giao."
            : "Admin cần An bổ sung biên nhận bàn giao Truyện Kiều."}
        </p>
        <div className="due">
          <Clock3 size={17} aria-hidden="true" />
          <div>
            <small>Hạn bổ sung</small>
            <strong>{deadline}</strong>
          </div>
        </div>
        {!submitted && !editing && (
          <button
            type="button"
            className="primary"
            ref={trigger}
            onClick={() => {
              setEditing(true);
              requestAnimationFrame(() => editor.current?.focus());
            }}
          >
            Gửi giải trình <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
      </section>
      {editing && (
        <form
          className="compose"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim().length < 5) return;
            onSubmit(draft.trim());
            setEditing(false);
            requestAnimationFrame(() => confirmation.current?.focus());
          }}
        >
          <label htmlFor="statement">Nội dung giải trình</label>
          <textarea
            id="statement"
            ref={editor}
            rows={3}
            maxLength={500}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="form-actions">
            <button
              className="primary"
              type="submit"
              disabled={draft.trim().length < 5}
            >
              <Send size={15} aria-hidden="true" /> Gửi mô phỏng
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEditing(false);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              Đóng
            </button>
          </div>
        </form>
      )}
      {submitted && (
        <section className="submitted">
          <h3>Giải trình của bạn</h3>
          <p>{submitted}</p>
        </section>
      )}
      <section className="member-book" aria-label="Tóm tắt giao sách">
        <img src={books.An.image} alt="" width="48" height="67" />
        <div>
          <strong>Truyện Kiều</strong>
          <p>Bình đã xác nhận nhận sách.</p>
        </div>
      </section>
      <details className="member-history">
        <summary>
          <FileText size={16} aria-hidden="true" /> Yêu cầu đầy đủ từ Admin{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <p>{request}</p>
      </details>
      <div className="held">
        <Wallet size={17} aria-hidden="true" />
        <span>Cọc của bạn đang giữ</span>
        <strong>90.000 ₫</strong>
      </div>
    </>
  );
}

function App() {
  const [view, setView] = useState<View>("all");
  const [statement, setStatement] = useState("");
  const caseHeading = useRef<HTMLElement>(null);
  function openCase() {
    setView("case");
    requestAnimationFrame(() => caseHeading.current?.focus());
  }
  return (
    <>
      <header className="masthead">
        <a href="./" className="brand">
          LẬT LẠI
        </a>
        <span>Bản thử khiếu nại trao đổi</span>
        <span className="mock-label">Dữ liệu mô phỏng</span>
      </header>
      <main>
        <nav className="views" aria-label="Chọn màn hình">
          {views.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="board" data-view={view}>
          <section
            className="screen queue-screen"
            aria-label="Danh sách Admin"
            hidden={view !== "all" && view !== "queue"}
          >
            <div className="screen-role">
              Admin <span>Danh sách</span>
            </div>
            <div className="screen-body">
              <Queue open={openCase} />
            </div>
          </section>
          <section
            ref={caseHeading}
            tabIndex={-1}
            className="screen case-screen"
            aria-label="Hồ sơ Admin"
            hidden={view !== "all" && view !== "case"}
          >
            <div className="screen-role">
              Admin <span>Chi tiết hồ sơ</span>
            </div>
            <div className="screen-body">
              <Dossier submitted={statement} />
            </div>
          </section>
          <section
            className="screen member-screen"
            aria-label="Bước 5 của User"
            hidden={view !== "all" && view !== "member"}
          >
            <div className="screen-role">
              Thành viên <span>An</span>
            </div>
            <div className="screen-body">
              <Member submitted={statement} onSubmit={setStatement} />
            </div>
          </section>
        </div>
        <p className="sample-note">
          Ảnh bìa dùng để nhận diện tựa sách. Giải trình mô phỏng sẽ mất khi tải
          lại trang.
        </p>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
