import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  MessageCircle,
  Package,
  Search,
  Send,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import "./preview.css";

// Standalone design prototype. All state is memory-only; no session or API imports.
type Stage = "offer" | "funding" | "transit" | "inspection" | "completed";
type View = "overview" | "chat" | "details";
const stages: Record<
  Stage,
  { label: string; step: number; title: string; body: string; cta: string }
> = {
  offer: {
    label: "Đề nghị mới",
    step: 0,
    title: "Gia Bảo muốn đổi sách với bạn",
    body: "Đối chiếu hai bản sách và khoản cọc trước khi chấp nhận. Đề nghị chưa giữ sách hoặc trừ tiền.",
    cta: "Xem và phản hồi đề nghị",
  },
  funding: {
    label: "Chờ đặt cọc",
    step: 1,
    title: "Đặt cọc để tiếp tục trao đổi",
    body: "Hai bên đã đồng ý. Khoản cọc của bạn là 50.000đ; chưa trừ tiền ở bước thỏa thuận.",
    cta: "Xem khoản cần đặt cọc",
  },
  transit: {
    label: "Đang giao sách",
    step: 2,
    title: "Sách đang trên đường đến bạn",
    body: "Chỉ xác nhận đã nhận khi kiện sách thực sự đến tay bạn. Có thể theo dõi cả hai chiều giao bên dưới.",
    cta: "Xem giao nhận",
  },
  inspection: {
    label: "Đang kiểm tra sách",
    step: 3,
    title: "Bạn đã nhận sách. Có thể đánh giá ngay.",
    body: "Bạn vẫn có đủ 72 giờ kiểm tra. Đánh giá được lưu riêng; tiền cọc tiếp tục được giữ theo thời hạn.",
    cta: "Viết đánh giá",
  },
  completed: {
    label: "Đã hoàn tất",
    step: 4,
    title: "Hai cuốn sách đã có hành trình mới",
    body: "Thời hạn kiểm tra đã kết thúc, giao dịch hoàn tất và khoản cọc đã được hoàn theo kết quả minh họa.",
    cta: "Xem đánh giá của bạn",
  },
};
const threads = [
  {
    id: "exchange",
    name: "Gia Bảo",
    initial: "B",
    type: "exchange",
    title: "Đổi Truyện Kiều lấy Cho tôi một vé về tuổi thơ",
    preview: "Mình nhận được sách rồi, cảm ơn An nhé!",
    time: "10:42",
    cover: "/illustrations/tuoi-tho.webp",
  },
  {
    id: "order",
    name: "Hà Linh",
    initial: "L",
    type: "order",
    title: "Đơn mua sách · Truyện Kiều",
    preview: "Mình đã đóng gói, chiều nay gửi nhé.",
    time: "09:18",
    cover: "/illustrations/truyen-kieu.webp",
  },
  {
    id: "talk",
    name: "Thu Hà",
    initial: "H",
    type: "talk",
    title: "Hỏi về tình trạng sách",
    preview: "Bạn có thể chụp thêm phần gáy không?",
    time: "Hôm qua",
    cover: "/illustrations/tuoi-tho.webp",
  },
];
const money = (v: number) => new Intl.NumberFormat("vi-VN").format(v) + "đ";
function Book({ give = false, label }: { give?: boolean; label?: string }) {
  return (
    <div className="book">
      <img
        src={
          give
            ? "/illustrations/truyen-kieu.webp"
            : "/illustrations/tuoi-tho.webp"
        }
        alt={give ? "Bìa Truyện Kiều" : "Bìa Cho tôi một vé về tuổi thơ"}
      />
      <div>
        <span className="muted">
          {label ?? (give ? "Bạn gửi cho Gia Bảo" : "Bạn nhận từ Gia Bảo")}
        </span>
        <h3>{give ? "Truyện Kiều" : "Cho tôi một vé về tuổi thơ"}</h3>
        <p>{give ? "Nguyễn Du" : "Nguyễn Nhật Ánh"}</p>
        <div className="book-meta">
          Còn tốt <span>·</span> {money(50000)}
        </div>
      </div>
    </div>
  );
}

function Preview() {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState("exchange");
  const [view, setView] = useState<View>("overview"),
    [stage, setStage] = useState<Stage>("inspection"),
    [mobileOpen, setMobileOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [sent, setSent] = useState<Record<string, string[]>>({}),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
      "review" | "fund" | "issue" | "offer" | null
    >(null),
    [rating, setRating] = useState(5),
    [comment, setComment] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const main = useRef<HTMLElement>(null),
    messageList = useRef<HTMLDivElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const thread = threads.find((t) => t.id === selected)!,
    state = stages[stage],
    isExchange = selected === "exchange",
    isOrder = selected === "order";
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    setNotice("");
  }, [view, selected]);
  useEffect(() => {
    messageList.current?.scrollTo({ top: messageList.current.scrollHeight });
  }, [view, selected, sent]);
  useEffect(() => {
    if (dialog) {
      lastFocus.current = document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      lastFocus.current?.focus();
    }
  }, [dialog]);
  const openThread = (id: string) => {
    setSelected(id);
    setView(id === "talk" ? "chat" : "overview");
    setMobileOpen(true);
  };
  const action = () => {
    if (!isExchange) {
      setView("details");
      return;
    }
    if (stage === "transit") setView("details");
    else
      setDialog(
        stage === "funding" ? "fund" : stage === "offer" ? "offer" : "review",
      );
  };
  const send = () => {
    const body = drafts[selected]?.trim();
    if (!body) return;
    setSent((s) => ({ ...s, [selected]: [...(s[selected] ?? []), body] }));
    setDrafts((s) => ({ ...s, [selected]: "" }));
  };
  return (
    <>
      <div className="prototype-bar">
        <span>
          <Info size={14} /> Bản thử bố cục <b>Minh An · user1</b>
        </span>
        <span>
          Dữ liệu minh họa · Thao tác chỉ chạy trong bản thử{" "}
          <a href="/chat">
            Về ứng dụng thật <ArrowRight size={13} />
          </a>
        </span>
      </div>
      <header className="site-header">
        <a href="/" aria-label="Trang chủ Lật lại">
          <span className="logo">
            <span className="logo-owl">
              <img src="/brand/logo-original.png" alt="" />
            </span>
            <span className="logo-word">
              <img src="/brand/logo-original.png" alt="Lật lại" />
            </span>
          </span>
        </a>
        <nav aria-label="Điều hướng ứng dụng">
          <a href="/books">Tìm sách</a>
          <a href="/books?mode=Exchange">Đổi sách</a>
          <a href="/auctions">Đấu giá</a>
        </nav>
        <div className="account">
          <span className="avatar mine">M</span>
          <span>Minh An</span>
          <ChevronDown size={15} />
        </div>
      </header>
      <div className="page-heading">
        <div>
          <h1>Giao dịch của tôi</h1>
          <p>Trao đổi rõ ràng. Theo dõi ở một nơi.</p>
        </div>
        <span className="soft-label">
          <ShieldCheck size={15} /> Tiền cọc được giữ trong ví ký quỹ
        </span>
      </div>
      <div className={"workspace " + (mobileOpen ? "detail-open" : "")}>
        <aside className="inbox" aria-label="Danh sách giao dịch">
          <div className="inbox-top">
            <h2>
              Gần đây <span>3</span>
            </h2>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Tìm giao dịch"
                placeholder="Tìm người hoặc tên sách"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="filters" aria-label="Lọc giao dịch">
              {[
                ["all", "Tất cả"],
                ["exchange", "Trao đổi"],
                ["order", "Đơn hàng"],
                ["talk", "Hỏi sách"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="thread-list">
            {threads
              .filter(
                (t) =>
                  (filter === "all" || filter === t.type) &&
                  (t.name + " " + t.title)
                    .toLocaleLowerCase("vi")
                    .includes(query.toLocaleLowerCase("vi")),
              )
              .map((t) => (
                <button
                  key={t.id}
                  className={"thread " + (t.id === selected ? "selected" : "")}
                  onClick={() => openThread(t.id)}
                  aria-current={selected === t.id ? "true" : undefined}
                >
                  <div className="thread-person">
                    <span className={"avatar " + t.id}>{t.initial}</span>
                    <strong>{t.name}</strong>
                    <time>{t.time}</time>
                  </div>
                  <div className="thread-book">
                    <img src={t.cover} alt="" />
                    <div>
                      <span>
                        {t.type === "exchange"
                          ? "Trao đổi sách"
                          : t.type === "order"
                            ? "Đơn mua trực tiếp"
                            : "Hội thoại"}
                      </span>
                      <h3>{t.title}</h3>
                    </div>
                  </div>
                  <p>{t.preview}</p>
                  <div className="thread-foot">
                    {t.type === "exchange" ? (
                      <span className="status green">
                        <Clock3 size={12} />
                        {state.label}
                      </span>
                    ) : t.type === "order" ? (
                      <span className="status">
                        <Package size={12} />
                        Người bán đang chuẩn bị
                      </span>
                    ) : (
                      <span className="muted">Chưa có giao dịch</span>
                    )}
                    {t.id === "talk" && (
                      <span className="new-dot" aria-label="Có tin chưa đọc" />
                    )}
                  </div>
                </button>
              ))}
          </div>
          <div className="inbox-help">
            <MessageCircle size={16} />
            <p>
              Hỏi sách, trao đổi và đơn hàng được phân biệt theo từng cuộc trò
              chuyện.
            </p>
          </div>
        </aside>
        <section className="content" aria-label="Không gian giao dịch">
          <div className="context-header">
            <button
              className="mobile-back icon-button"
              aria-label="Về danh sách giao dịch"
              onClick={() => setMobileOpen(false)}
            >
              <ArrowLeft size={20} />
            </button>
            <span className={"avatar " + thread.id}>{thread.initial}</span>
            <div className="context-person">
              <h2>{thread.name}</h2>
              <p>
                {isExchange
                  ? "Trao đổi · TĐ-001"
                  : isOrder
                    ? "Bạn là người mua · ĐH-002"
                    : "Đang trao đổi thông tin sách"}
              </p>
            </div>
            <button
              className="chat-shortcut"
              onClick={() => setView(view === "chat" ? "overview" : "chat")}
            >
              <MessageCircle size={17} />
              <span>{view === "chat" ? "Về tổng quan" : "Nhắn tin"}</span>
            </button>
          </div>
          <div className="view-nav">
            <div
              role="tablist"
              aria-label="Nội dung giao dịch"
              onKeyDown={(e) => {
                const all: View[] = ["overview", "chat", "details"];
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const index =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 2
                        : (all.indexOf(view) +
                            (e.key === "ArrowRight" ? 1 : 2)) %
                          3;
                  setView(all[index]);
                  document.getElementById("tab-" + all[index])?.focus();
                }
              }}
            >
              {(["overview", "chat", "details"] as View[]).map((v, i) => (
                <button
                  role="tab"
                  tabIndex={view === v ? 0 : -1}
                  key={v}
                  id={"tab-" + v}
                  aria-selected={view === v}
                  aria-controls={"panel-" + v}
                  onClick={() => setView(v)}
                >
                  {
                    [BookOpen, MessageCircle, FileText].map((Icon, index) => (
                      <Icon key={index} size={16} />
                    ))[i]
                  }
                  {["Tổng quan", "Hội thoại", "Chi tiết"][i]}
                </button>
              ))}
            </div>
            <span className="mock-id">Hồ sơ minh họa</span>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {view === "chat" ? (
            <div
              className="chat-view"
              role="tabpanel"
              id="panel-chat"
              aria-labelledby="tab-chat"
            >
              <button
                className="linked-record"
                onClick={() => setView("overview")}
              >
                <span className="record-symbol">
                  {isExchange ? (
                    <ArrowLeftRight size={19} />
                  ) : (
                    <Package size={19} />
                  )}
                </span>
                <div>
                  <strong>
                    {isExchange
                      ? "Phiếu trao đổi TĐ-001"
                      : isOrder
                        ? "Đơn mua ĐH-002"
                        : "Thông tin bản sách"}
                  </strong>
                  <span>
                    {isExchange
                      ? state.label
                      : isOrder
                        ? "Đang chuẩn bị · 80.000đ"
                        : "Cho tôi một vé về tuổi thơ · Còn tốt"}
                  </span>
                </div>
                <span className="linked-record-label">Xem tổng quan</span>
                <ChevronRight size={16} />
              </button>
              <div
                className="messages"
                ref={messageList}
                aria-label="Tin nhắn minh họa"
              >
                <div className="date-line">Hôm nay · 03/11</div>
                <div className="message peer">
                  <p>
                    {isExchange
                      ? "Chào An, mình muốn đổi Cho tôi một vé về tuổi thơ lấy Truyện Kiều của bạn. Hai cuốn ngang giá nhé?"
                      : isOrder
                        ? "Mình đã nhận đơn rồi. Sách còn tốt như ảnh, An nhé."
                        : "Bạn có thể chụp thêm phần gáy sách giúp mình được không?"}
                  </p>
                  <time>09:20</time>
                </div>
                <div className="message own">
                  <p>
                    {isExchange
                      ? "Được nha. Bìa sách của mình có nếp gấp nhẹ ở góc, ruột đủ trang. Mình đã ghi trong phiếu."
                      : "Cảm ơn bạn. Bạn giúp mình bọc thêm phần góc sách nhé."}
                  </p>
                  <time>
                    09:22 <CheckCheck size={12} />
                  </time>
                </div>
                {(!isExchange || state.step >= 1) && (
                  <div className="event-line">
                    <ShieldCheck size={14} />
                    {isExchange
                      ? "Hai bên đã chấp nhận phiếu trao đổi"
                      : isOrder
                        ? "Đơn mua đã được tạo"
                        : "Hội thoại này chưa giữ sách"}
                  </div>
                )}
                <div className="message peer">
                  <p>
                    {isExchange
                      ? state.step >= 3
                        ? "Mình nhận được sách rồi, cảm ơn An nhé!"
                        : state.step >= 2
                          ? "Mình đã gửi sách và đang theo dõi vận chuyển nhé."
                          : "An xem đề nghị rồi phản hồi giúp mình nhé."
                      : isOrder
                        ? "Mình đã đóng gói, chiều nay gửi nhé."
                        : "Mình muốn xem rõ tình trạng trước khi gửi đề nghị."}
                  </p>
                  <time>10:42</time>
                </div>
                <div className="message own">
                  <p>
                    {isExchange
                      ? state.step >= 3
                        ? "Mình cũng nhận được rồi. Mình sẽ kiểm tra và đánh giá cho bạn."
                        : "Mình sẽ theo dõi và cập nhật ở phiếu trao đổi nhé."
                      : isOrder
                        ? "Ok bạn, mình theo dõi ở phần đơn hàng nhé."
                        : "Mình sẽ chụp thêm và gửi bạn xem."}
                  </p>
                  <time>
                    10:45 <CheckCheck size={12} />
                  </time>
                </div>
                {(sent[selected] ?? []).map((body, i) => (
                  <div className="message own" key={i}>
                    <p>{body}</p>
                    <time>
                      Vừa xong · Minh họa <Check size={12} />
                    </time>
                  </div>
                ))}
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  aria-label="Tin nhắn minh họa"
                  placeholder={"Nhắn cho " + thread.name + "…"}
                  value={drafts[selected] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [selected]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  className="send"
                  aria-label="Gửi tin nhắn minh họa"
                  disabled={!drafts[selected]?.trim()}
                >
                  <Send size={19} />
                </button>
                <p>Tin nhắn chỉ hiển thị trong bản thử này.</p>
              </form>
            </div>
          ) : (
            <main
              className="main-scroll"
              ref={main}
              role="tabpanel"
              id={"panel-" + view}
              aria-labelledby={"tab-" + view}
            >
              {view === "overview" ? (
                <>
                  <div className="record-heading">
                    <div>
                      <span className="context-type">
                        {isExchange
                          ? "TRAO ĐỔI SÁCH"
                          : isOrder
                            ? "ĐƠN MUA TRỰC TIẾP"
                            : "HỎI THÔNG TIN SÁCH"}
                      </span>
                      <h2>
                        {isExchange
                          ? "Hai cuốn sách, một cuộc trao đổi."
                          : isOrder
                            ? "Một cuốn sách đang đến với bạn."
                            : "Bắt đầu bằng một cuộc trò chuyện."}
                      </h2>
                    </div>
                    <span className="status green">
                      {isExchange
                        ? state.label
                        : isOrder
                          ? "Đang chuẩn bị"
                          : "Chưa giữ sách"}
                    </span>
                  </div>
                  <section
                    className="next-action"
                    aria-label="Việc cần làm tiếp"
                  >
                    <div className="next-icon">
                      {isExchange && stage === "inspection" ? (
                        <Star size={21} />
                      ) : (
                        <Package size={21} />
                      )}
                    </div>
                    <div>
                      <h3>
                        {isExchange
                          ? state.title
                          : isOrder
                            ? "Đang chờ Hà Linh gửi sách"
                            : "Bạn có một tin nhắn mới"}
                      </h3>
                      <p>
                        {isExchange
                          ? state.body
                          : isOrder
                            ? "Người bán đang chuẩn bị kiện hàng. Khi có vận đơn, bạn có thể theo dõi ở phần Chi tiết."
                            : "Xem câu hỏi về tình trạng sách và trả lời trước khi thỏa thuận."}
                      </p>
                      {isExchange && stage === "inspection" && (
                        <span className="deadline">
                          <Clock3 size={13} /> Hạn kiểm tra minh họa: 06/11,
                          10:30
                        </span>
                      )}
                    </div>
                    <button
                      className="primary"
                      onClick={
                        isExchange
                          ? action
                          : () => setView(isOrder ? "details" : "chat")
                      }
                    >
                      {isExchange
                        ? reviewed && stage === "inspection"
                          ? "Xem đánh giá đã lưu"
                          : state.cta
                        : isOrder
                          ? "Xem chi tiết"
                          : "Trả lời"}
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  {isExchange ? (
                    <>
                      <section
                        className="exchange-books"
                        aria-label="Hai bản sách trao đổi"
                      >
                        <Book give />
                        <span className="swap-icon">
                          <ArrowLeftRight size={19} />
                        </span>
                        <Book />
                      </section>
                      <div className="terms-line">
                        <div>
                          <span>Cọc của bạn</span>
                          <strong>50.000đ</strong>
                        </div>
                        <div>
                          <span>Tiền bù</span>
                          <strong>
                            Ngang giá <span className="muted">· 0đ</span>
                          </strong>
                        </div>
                        <div>
                          <span>Giao nhận</span>
                          <strong>Gửi trực tiếp</strong>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setView("details")}
                        >
                          Xem thỏa thuận <ChevronRight size={15} />
                        </button>
                      </div>
                      <section
                        className="progress-section"
                        aria-label="Tiến trình trao đổi"
                      >
                        <div className="section-heading">
                          <h3>Hành trình trao đổi</h3>
                          <button
                            className="text-button"
                            onClick={() => setView("details")}
                          >
                            Xem lịch sử <ArrowRight size={14} />
                          </button>
                        </div>
                        <ol className="progress">
                          {[
                            "Thỏa thuận",
                            "Đặt cọc",
                            "Giao nhận",
                            "Kiểm tra",
                            "Hoàn tất",
                          ].map((label, i) => (
                            <li
                              key={label}
                              aria-current={
                                i === state.step ? "step" : undefined
                              }
                              className={
                                i < state.step
                                  ? "done"
                                  : i === state.step
                                    ? "current"
                                    : ""
                              }
                            >
                              <span>
                                {i < state.step ? <Check size={14} /> : i + 1}
                              </span>
                              <div>
                                {label}
                                <small>
                                  {i < state.step
                                    ? "Đã xong"
                                    : i === state.step
                                      ? "Đang ở bước này"
                                      : "Tiếp theo"}
                                </small>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                      <div className="bottom-note">
                        <ShieldCheck size={17} />
                        <p>
                          {stage === "completed"
                            ? "Giao dịch hoàn tất trong tình huống minh họa."
                            : "Tiền cọc vẫn được giữ trong thời hạn kiểm tra. Xác nhận đã kiểm tra không giải phóng cọc sớm."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setDialog("issue")}
                        >
                          Báo sự cố
                        </button>
                      </div>
                    </>
                  ) : isOrder ? (
                    <>
                      <section className="order-book">
                        <Book give label="Hà Linh gửi cho bạn" />
                        <div>
                          <span className="muted">
                            Tổng thanh toán minh họa
                          </span>
                          <strong>80.000đ</strong>
                          <span className="muted">Đã giữ cho đơn hàng</span>
                        </div>
                      </section>
                      <section className="progress-section">
                        <h3>Tiến trình đơn mua</h3>
                        <ol className="order-timeline">
                          <li className="done">
                            <Check size={16} />
                            <div>
                              <strong>Đã thanh toán</strong>
                              <p>Khoản thanh toán được giữ theo đơn.</p>
                            </div>
                          </li>
                          <li>
                            <Package size={16} />
                            <div>
                              <strong>Người bán đang chuẩn bị</strong>
                              <p>
                                Bạn sẽ thấy vận đơn sau khi người bán gửi sách.
                              </p>
                            </div>
                          </li>
                          <li className="future">
                            <Truck size={16} />
                            <div>
                              <strong>Vận chuyển → Nhận sách → Kiểm tra</strong>
                            </div>
                          </li>
                        </ol>
                      </section>
                    </>
                  ) : (
                    <section className="progress-section">
                      <Book />
                      <p>
                        Hội thoại dùng để hỏi sách và thương lượng. Khi có phiếu
                        trao đổi hoặc đơn mua, hồ sơ đó sẽ xuất hiện ở đây.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setView("chat")}
                      >
                        Mở hội thoại <MessageCircle size={16} />
                      </button>
                    </section>
                  )}
                  <div className="quick-message">
                    <MessageCircle size={18} />
                    <div>
                      <strong>{thread.name}</strong>
                      <p>{thread.preview}</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setView("chat")}
                    >
                      Mở hội thoại <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="record-heading">
                    <div>
                      <span className="context-type">
                        {isExchange ? "PHIẾU TĐ-001" : "HỒ SƠ MINH HỌA"}
                      </span>
                      <h2>Thông tin và lịch sử</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setView("overview")}
                    >
                      <ArrowLeft size={15} /> Tổng quan
                    </button>
                  </div>
                  <section className="detail-section">
                    <h3>
                      <BookOpen size={18} /> Bản sách và tình trạng
                    </h3>
                    <div className="detail-books">
                      <Book
                        give={isExchange || isOrder}
                        label={
                          isExchange
                            ? undefined
                            : isOrder
                              ? "Hà Linh gửi cho bạn"
                              : "Bản sách đang trao đổi thông tin"
                        }
                      />
                      {isExchange && <Book />}
                    </div>
                    <dl>
                      <div>
                        <dt>Bìa & gáy</dt>
                        <dd>Có nếp gấp nhẹ ở góc bìa, gáy nguyên vẹn.</dd>
                      </div>
                      <div>
                        <dt>Ruột sách</dt>
                        <dd>
                          Đủ trang, đọc rõ; không thiếu nội dung trọng yếu.
                        </dd>
                      </div>
                      <div>
                        <dt>Phụ kiện</dt>
                        <dd>Không kèm phụ kiện.</dd>
                      </div>
                    </dl>
                  </section>
                  {isExchange || isOrder ? (
                    <>
                      <section className="detail-section">
                        <h3>
                          <Wallet size={18} />{" "}
                          {isExchange ? "Cọc và tiền bù" : "Thanh toán"}
                        </h3>
                        <dl>
                          <div>
                            <dt>
                              {isExchange
                                ? "Cọc của Minh An"
                                : "Tổng thanh toán"}
                            </dt>
                            <dd>{isExchange ? "50.000đ" : "80.000đ"}</dd>
                          </div>
                          {isExchange && (
                            <>
                              <div>
                                <dt>Cọc của Gia Bảo</dt>
                                <dd>50.000đ</dd>
                              </div>
                              <div>
                                <dt>Tiền bù</dt>
                                <dd>0đ · Hai bản sách ngang giá</dd>
                              </div>
                            </>
                          )}
                          <div>
                            <dt>Phí vận chuyển</dt>
                            <dd>0đ theo chính sách hiện hành</dd>
                          </div>
                        </dl>
                        <p className="detail-note">
                          Các con số trong bản thử chỉ minh họa bố cục, không
                          phải số dư hoặc bút toán của tài khoản.
                        </p>
                      </section>
                      <section className="detail-section">
                        <h3>
                          <Truck size={18} />{" "}
                          {isExchange
                            ? "Giao nhận hai chiều"
                            : "Giao nhận đơn mua"}
                        </h3>
                        <div className="shipping">
                          <div>
                            <span className="muted">
                              {isExchange
                                ? "Minh An → " + thread.name
                                : thread.name + " → Minh An"}
                            </span>
                            <strong>
                              {isExchange
                                ? state.step >= 3
                                  ? "Đã nhận sách"
                                  : state.step >= 2
                                    ? "Đang giao sách"
                                    : "Chưa gửi sách"
                                : "Người bán đang chuẩn bị"}
                            </strong>
                            <p>Điểm gửi minh họa tại TP.HCM</p>
                          </div>
                          <ArrowLeftRight size={20} />
                          <div>
                            <span className="muted">
                              {isExchange
                                ? thread.name + " → Minh An"
                                : "Người nhận: Minh An"}
                            </span>
                            <strong>
                              {isExchange
                                ? state.step >= 3
                                  ? "Đã nhận sách"
                                  : state.step >= 2
                                    ? "Đang giao sách"
                                    : "Chưa gửi sách"
                                : "Chưa nhận sách"}
                            </strong>
                            <p>Không hiển thị địa chỉ cá nhân trong bản thử</p>
                          </div>
                        </div>
                      </section>
                      <details className="history">
                        <summary>
                          Lịch sử giao dịch <ChevronDown size={16} />
                        </summary>
                        <ol>
                          {(isExchange
                            ? [
                                "Hai bên thống nhất sách và giá trị",
                                "Hai bên đặt cọc",
                                "Hai bên gửi sách",
                                "Minh An và Gia Bảo xác nhận nhận sách",
                              ].slice(0, Math.min(4, state.step))
                            : [
                                "Đơn mua được tạo",
                                "Thanh toán được giữ theo đơn",
                                "Hà Linh đang chuẩn bị sách",
                              ]
                          ).map((s, i) => (
                            <li key={s}>
                              <Check size={14} />
                              <span>{s}</span>
                              <time>03/11 · {9 + i}:30</time>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </>
                  ) : (
                    <p className="detail-note">
                      Chưa có phiếu trao đổi hoặc đơn mua. Hội thoại chưa giữ
                      sách hoặc thu tiền.
                    </p>
                  )}
                </>
              )}
            </main>
          )}
          {isExchange && (
            <div className="scenario">
              <label htmlFor="stage">Thử tình huống</label>
              <select
                id="stage"
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value as Stage);
                  setReviewed(false);
                }}
              >
                {Object.entries(stages).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <span>Chuyển trạng thái minh họa, không cập nhật DB</span>
            </div>
          )}
        </section>
      </div>
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          setDialog(null);
        }}
        aria-labelledby="dialog-title"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog === "review") setReviewed(true);
            setNotice(
              dialog === "review"
                ? "Đã lưu đánh giá minh họa. Đánh giá thật vẫn theo quyền và thời hạn của máy chủ."
                : "Thao tác minh họa đã kết thúc. Chưa có tiền hoặc giao dịch thật thay đổi.",
            );
            setDialog(null);
          }}
        >
          <header>
            <span className="muted">Bản thử · Chỉ lưu trong màn hình này</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng"
              onClick={() => setDialog(null)}
            >
              <X size={20} />
            </button>
          </header>
          <h2 id="dialog-title">
            {dialog === "review"
              ? "Đánh giá giao dịch với Gia Bảo"
              : dialog === "fund"
                ? "Khoản cọc của Minh An"
                : dialog === "issue"
                  ? "Báo sự cố giao dịch"
                  : "Phản hồi đề nghị trao đổi"}
          </h2>
          {dialog === "review" ? (
            <>
              <p>
                Đánh giá có thể viết sau khi nhận sách. Khi giao dịch chưa hoàn
                tất, nội dung được giữ riêng; quyền sửa 48 giờ và điều kiện công
                bố vẫn áp dụng.
              </p>
              <fieldset>
                <legend>Trải nghiệm với đối tác</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    aria-label={n + " sao"}
                    aria-pressed={rating === n}
                    className="star"
                    key={n}
                    onClick={() => setRating(n)}
                  >
                    <Star
                      size={28}
                      fill={n <= rating ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </fieldset>
              <label className="review-label">
                Nhận xét
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Chia sẻ về cuộc trao đổi…"
                />
              </label>
            </>
          ) : (
            <p>
              {dialog === "fund"
                ? "Khoản giữ từ ví: 50.000đ. Đây là bản thử bố cục nên không truy cập ví hoặc thực hiện đặt cọc."
                : dialog === "issue"
                  ? "Trong ứng dụng thật, bước này mở quy trình cung cấp bằng chứng và tiếp nhận xử lý sự cố. Bản thử chỉ cho xem cách tìm thao tác."
                  : "Trong ứng dụng thật, bạn đối chiếu sách và khoản cọc trước khi chấp nhận. Bản thử không tạo thỏa thuận."}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="secondary"
              onClick={() => setDialog(null)}
            >
              Quay lại
            </button>
            <button className="primary">
              {dialog === "review" ? "Lưu đánh giá minh họa" : "Đã hiểu"}
              <Check size={16} />
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
