import { useRef, useState } from "react";
import { ActionPanel } from "./action-panel";
import type { CollectionItem } from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-03: the assigned Staff member hands a book over with the code the
// recipient requested in the app, or takes a returned book back. The code is
// never kept after it is sent, and a wrong code is a committed attempt.

type Props = { item: CollectionItem } & ActionContext;
const base = (item: CollectionItem) => `/operations/point-orders/${item.id}`;
const CODE = /^[0-9]{6}$/;

export function CollectionHandover({ item, ...context }: Props) {
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <ActionPanel
      {...context}
      label="Giao sách cho người nhận"
      title="Giao sách bằng mã nhận."
      intro={`Người nhận ${item.recipientName} tự yêu cầu mã 6 số trên ứng dụng; mã có hiệu lực 10 phút. Không giao nếu người nhận chưa có mã hoặc mã không khớp.`}
      dirty={code !== ""}
      fields={(locked) => (
        <>
          <div className="field">
            <label htmlFor={`code-${item.id}`}>Mã nhận sách</label>
            <input
              id={`code-${item.id}`}
              ref={input}
              value={code}
              disabled={locked}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={invalid}
              aria-describedby={`code-hint-${item.id}`}
              onChange={(event) => {
                // Strip spaces/letters first: a pasted "436 147" keeps 6 digits.
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setInvalid(false);
              }}
            />
          </div>
          <p
            id={`code-hint-${item.id}`}
            className={invalid ? "field-error" : "muted"}
          >
            {invalid
              ? "Mã nhận gồm đúng 6 chữ số."
              : "Nhập mã người nhận đọc cho bạn. Sai 5 lần trong 15 phút sẽ tạm khóa việc giao đơn này."}
          </p>
        </>
      )}
      validate={() => {
        if (CODE.test(code)) return true;
        setInvalid(true);
        input.current?.focus();
        return false;
      }}
      submitLabel="Kiểm tra mã và giao sách"
      confirmTitle="Giao sách cho người nhận?"
      confirmBody={
        <p>
          Giao “{item.title}”{item.shelfCode ? ` ở kệ ${item.shelfCode}` : ""}{" "}
          cho {item.recipientName}. Chỉ trao sách sau khi máy chủ xác nhận mã
          đúng.
        </p>
      }
      build={() => ({
        path: `${base(item)}/handover`,
        body: { expectedVersion: item.version, code },
      })}
      interpret={(receipt) => {
        // Every outcome is final for this code: never resend or keep it.
        setCode("");
        switch (receipt.collectionOutcome) {
          case "HandedOver":
            return {
              tone: "success",
              text: `Mã đúng. Hãy trao “${item.title}” cho ${item.recipientName}. Thời hạn kiểm tra sách của người nhận bắt đầu từ bây giờ.`,
              close: true,
            };
          case "WrongCode":
            return {
              tone: "warning",
              text: `Mã chưa đúng, chưa giao sách. Còn ${receipt.attemptsRemaining ?? 0} lần thử trong 15 phút.`,
              close: false,
            };
          case "Expired":
            return {
              tone: "warning",
              text: "Mã đã hết hạn, chưa giao sách. Nhờ người nhận yêu cầu mã mới trên ứng dụng.",
              close: false,
            };
          case "RateLimited":
            return {
              tone: "warning",
              text: "Đã nhập sai quá nhiều lần, chưa giao sách. Chờ 15 phút rồi nhờ người nhận yêu cầu mã mới.",
              close: false,
            };
          default:
            return {
              tone: "info",
              text: "Máy chủ chưa báo kết quả giao sách. Danh sách đã tải lại; kiểm tra trạng thái trước khi trao sách.",
              close: true,
            };
        }
      }}
    />
  );
}

export function CollectionReturn({ item, ...context }: Props) {
  const [check, setCheck] = useState<"MatchesReport" | "DoesNotMatch" | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<"check" | "note" | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const trimmed = note.trim();
  return (
    <ActionPanel
      {...context}
      label="Nhận lại sách trả về"
      title="Nhận lại sách người mua trả."
      intro={`Đối chiếu cuốn sách ${item.recipientName} mang trả với biên bản kiểm tra lúc giao. Chỉ nhận khi đúng cuốn và tình trạng không xấu hơn biên bản.`}
      dirty={check !== null || note !== ""}
      fields={(locked) => (
        <>
          <fieldset disabled={locked}>
            <legend>Đối chiếu với biên bản</legend>
            <label className="check">
              <input
                ref={first}
                type="radio"
                name={`check-${item.id}`}
                checked={check === "MatchesReport"}
                onChange={() => {
                  setCheck("MatchesReport");
                  setProblem(null);
                }}
              />
              Khớp biên bản: nhận sách, hoàn tiền cho người mua
            </label>
            <label className="check">
              <input
                type="radio"
                name={`check-${item.id}`}
                checked={check === "DoesNotMatch"}
                onChange={() => {
                  setCheck("DoesNotMatch");
                  setProblem(null);
                }}
              />
              Không khớp: không nhận, ghi lại lý do
            </label>
          </fieldset>
          {problem === "check" && (
            <p className="field-error">Chọn kết quả đối chiếu.</p>
          )}
          <div className="field">
            <label htmlFor={`return-note-${item.id}`}>Ghi chú</label>
            <textarea
              id={`return-note-${item.id}`}
              ref={noteInput}
              rows={3}
              maxLength={1000}
              value={note}
              disabled={locked}
              aria-invalid={problem === "note"}
              aria-describedby={`return-hint-${item.id}`}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          <p
            id={`return-hint-${item.id}`}
            className={problem === "note" ? "field-error" : "muted"}
          >
            {problem === "note"
              ? "Khi không khớp, ghi rõ điểm khác biệt (10–1.000 ký tự)."
              : "Bắt buộc khi không khớp biên bản."}
          </p>
        </>
      )}
      validate={() => {
        if (!check) {
          setProblem("check");
          first.current?.focus();
          return false;
        }
        const n = [...trimmed].length;
        if ((check === "DoesNotMatch" && n < 10) || n > 1000) {
          setProblem("note");
          noteInput.current?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Ghi kết quả nhận lại"
      confirmTitle={
        check === "MatchesReport" ? "Nhận lại sách?" : "Từ chối nhận sách?"
      }
      confirmBody={
        <>
          <p>
            {check === "MatchesReport"
              ? "Đơn sẽ bị hủy, người mua được hoàn toàn bộ số tiền đã trả và người bán được báo đến nhận lại sách. Không hoàn tác được."
              : "Sách không được nhận; đơn vẫn chờ trả sách đúng biên bản. Lần đối chiếu này được lưu lại."}
          </p>
          {trimmed && <blockquote className="prose">{trimmed}</blockquote>}
        </>
      }
      build={() => ({
        path: `${base(item)}/receive-return`,
        body: {
          expectedVersion: item.version,
          check,
          note: trimmed || null,
        },
      })}
      interpret={(receipt) =>
        receipt.returnOutcome === "Accepted"
          ? {
              tone: "success",
              text: `Đã nhận lại “${item.title}”. Người mua được hoàn tiền; người bán sẽ được báo đến nhận sách.`,
              close: true,
            }
          : {
              tone: "warning",
              text: `Đã ghi lần từ chối nhận “${item.title}”. Đơn vẫn chờ người mua trả đúng sách.`,
              close: true,
            }
      }
    />
  );
}
