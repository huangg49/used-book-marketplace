import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../../core/format";
import { ActionPanel } from "./action-panel";
import { reclaimLabels, type Intake } from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-02: the assigned Staff member receives, inspects, opens or hands back one
// intake. Every rule is checked again by the API (assignment, deadline, state).

const SHELF = /^[A-Z0-9-]{1,20}$/;
const noteLength = (value: string) => [...value.trim()].length;

type Props = { item: Intake } & ActionContext;
const base = (item: Intake) => `/operations/auction-intakes/${item.id}`;

export function IntakeReceive({ item, ...context }: Props) {
  const [shelf, setShelf] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const code = shelf.trim();
  return (
    <ActionPanel
      {...context}
      label="Nhận sách đấu giá"
      title="Nhận sách tại quầy."
      intro="Chỉ xác nhận khi người bán đã giao tận tay cuốn sách. Ghi đúng mã kệ nơi đặt sách để tìm lại khi kiểm tra."
      dirty={shelf !== ""}
      fields={(locked) => (
        <>
          <div className="field">
            <label htmlFor={`shelf-${item.id}`}>Mã kệ</label>
            <input
              id={`shelf-${item.id}`}
              ref={input}
              value={shelf}
              disabled={locked}
              autoComplete="off"
              maxLength={20}
              aria-invalid={invalid}
              aria-describedby={`shelf-hint-${item.id}`}
              onChange={(event) => {
                setShelf(event.target.value.toUpperCase());
                setInvalid(false);
              }}
            />
          </div>
          <p
            id={`shelf-hint-${item.id}`}
            className={invalid ? "field-error" : "muted"}
          >
            {invalid
              ? "Mã kệ gồm 1–20 ký tự: chữ in hoa, số hoặc dấu gạch ngang, ví dụ A-01."
              : "Ví dụ A-01. Chữ in hoa, số hoặc dấu gạch ngang."}
          </p>
        </>
      )}
      validate={() => {
        if (SHELF.test(code)) return true;
        setInvalid(true);
        input.current?.focus();
        return false;
      }}
      submitLabel="Xác nhận đã nhận sách"
      confirmTitle="Xác nhận đã nhận sách?"
      confirmBody={
        <p>
          Cuốn “{item.title}” sẽ được ghi nhận đang ở kệ <strong>{code}</strong>{" "}
          của điểm, theo giờ máy chủ. Bước tiếp theo là kiểm tra tình trạng.
        </p>
      }
      build={() => ({
        path: `${base(item)}/receive`,
        body: { expectedVersion: item.version, shelfCode: code },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã nhận “${item.title}” vào kệ ${code}. Hãy kiểm tra tình trạng sách.`,
        close: true,
      })}
    />
  );
}

export function IntakeInspect({ item, ...context }: Props) {
  const [outcome, setOutcome] = useState<"Pass" | "Fail" | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<"outcome" | "note" | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const trimmed = note.trim();
  return (
    <ActionPanel
      {...context}
      label="Kiểm tra tình trạng sách"
      title="Kiểm tra theo bài đã duyệt."
      intro={
        <>
          Đối chiếu sách thực tế với ảnh và mô tả của bài đã duyệt.{" "}
          <Link to={`/review/listings/${item.listingId}`}>Xem bài đã duyệt</Link>
          . Đạt nghĩa là tình trạng khớp mô tả; không phải chứng nhận chính
          hãng.
        </>
      }
      dirty={outcome !== null || note !== ""}
      fields={(locked) => (
        <>
          <fieldset disabled={locked}>
            <legend>Kết luận</legend>
            <label className="check">
              <input
                ref={firstChoice}
                type="radio"
                name={`outcome-${item.id}`}
                checked={outcome === "Pass"}
                onChange={() => {
                  setOutcome("Pass");
                  setProblem(null);
                }}
              />
              Đạt: tình trạng khớp bài đã duyệt, có thể mở phiên
            </label>
            <label className="check">
              <input
                type="radio"
                name={`outcome-${item.id}`}
                checked={outcome === "Fail"}
                onChange={() => {
                  setOutcome("Fail");
                  setProblem(null);
                }}
              />
              Không đạt: người bán phải đến nhận lại sách
            </label>
          </fieldset>
          {problem === "outcome" && (
            <p className="field-error">Chọn Đạt hoặc Không đạt.</p>
          )}
          <div className="field">
            <label htmlFor={`note-${item.id}`}>Ghi chú kiểm tra</label>
            <textarea
              id={`note-${item.id}`}
              ref={noteInput}
              rows={3}
              maxLength={1000}
              value={note}
              disabled={locked}
              aria-invalid={problem === "note"}
              aria-describedby={`note-hint-${item.id}`}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          <p
            id={`note-hint-${item.id}`}
            className={problem === "note" ? "field-error" : "muted"}
          >
            {problem === "note"
              ? "Khi không đạt, ghi rõ điểm khác mô tả (10–1.000 ký tự)."
              : "Người bán đọc được ghi chú này. Bắt buộc khi không đạt."}
          </p>
        </>
      )}
      validate={() => {
        if (!outcome) {
          setProblem("outcome");
          firstChoice.current?.focus();
          return false;
        }
        const n = noteLength(note);
        if ((outcome === "Fail" && n < 10) || n > 1000) {
          setProblem("note");
          noteInput.current?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Ghi kết luận kiểm tra"
      confirmTitle={
        outcome === "Pass" ? "Ghi kết luận Đạt?" : "Ghi kết luận Không đạt?"
      }
      confirmBody={
        <>
          <p>
            {outcome === "Pass"
              ? "Sách sẽ sẵn sàng để mở phiên đấu giá. Kết luận không sửa được sau khi ghi."
              : "Sách sẽ không được đấu giá; người bán được báo đến nhận lại. Kết luận không sửa được sau khi ghi."}
          </p>
          {trimmed && <blockquote className="prose">{trimmed}</blockquote>}
        </>
      }
      build={() => ({
        path: `${base(item)}/inspect`,
        body: {
          expectedVersion: item.version,
          outcome,
          note: trimmed || null,
        },
      })}
      interpret={() => ({
        tone: "success",
        text:
          outcome === "Pass"
            ? `“${item.title}” đạt kiểm tra. Có thể mở phiên.`
            : `“${item.title}” không đạt. Người bán sẽ được báo đến nhận lại sách.`,
        close: true,
      })}
    />
  );
}

export function IntakeOpen({ item, ...context }: Props) {
  return (
    <ActionPanel
      {...context}
      label="Mở phiên đấu giá"
      title="Mở phiên 24 giờ."
      intro={`Giá khởi điểm ${money(item.startPrice)}, bước giá ${money(item.step)}${item.buyNowPrice !== null ? `, mua ngay ${money(item.buyNowPrice)}` : ", không có giá mua ngay"}. Giá do người bán chọn khi gửi và không đổi được.`}
      submitLabel="Mở phiên ngay"
      confirmTitle="Mở phiên đấu giá?"
      confirmBody={
        <p>
          Phiên bắt đầu ngay theo giờ máy chủ và kết thúc sau đúng 24 giờ,
          không gia hạn. Sau khi mở, chỉ quản trị viên có thể hủy phiên khi có
          sự cố.
        </p>
      }
      build={() => ({
        path: `${base(item)}/open`,
        body: { expectedVersion: item.version },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã mở phiên cho “${item.title}”.`,
        close: true,
      })}
    />
  );
}

export function IntakeReclaim({ item, ...context }: Props) {
  return (
    <ActionPanel
      {...context}
      label="Trả sách cho người bán"
      title="Trả sách cho người bán."
      intro={`Lý do: ${item.reclaimReason ? reclaimLabels[item.reclaimReason] : "cần trả sách"}. Chỉ xác nhận khi người bán đã nhận lại cuốn sách tại quầy.`}
      submitLabel="Xác nhận đã trả sách"
      confirmTitle="Xác nhận đã trả sách?"
      confirmBody={
        <p>
          Cuốn “{item.title}” sẽ được ghi nhận đã rời điểm và về lại người
          bán. Thao tác này không hoàn tác được.
        </p>
      }
      build={() => ({
        path: `${base(item)}/reclaim`,
        body: { expectedVersion: item.version },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã ghi nhận trả “${item.title}” cho người bán.`,
        close: true,
      })}
    />
  );
}
