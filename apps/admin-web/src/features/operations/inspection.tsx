import { useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { dateText } from "../../core/format";
import { Notice } from "../../core/ui";
import { ActionPanel } from "./action-panel";
import {
  checklistLabels,
  outcomeLabels,
  type Checklist,
  type Intake,
} from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-12 (FR-T01/T02, POL-09): the point inspection records a checklist. A
// suspected copy asks the seller for evidence instead of a conclusion; an
// independent Staff member decides after the answer or the 48-hour window.
// Pass covers the checklist only, never authenticity.

type Props = { item: Intake } & ActionContext;
type Outcome = "Pass" | "Fail" | "NeedsEvidence";
const MATCHES = [
  "titleEditionMatches",
  "privateMarksMatch",
  "coverPagesMatch",
  "notesAccessoriesMatch",
] as const;
const blank: Checklist = {
  titleEditionMatches: false,
  privateMarksMatch: false,
  coverPagesMatch: false,
  notesAccessoriesMatch: false,
  suspectedCopy: false,
};
const noteLength = (value: string) => [...value.trim()].length;
const allMatch = (c: Checklist) =>
  MATCHES.every((k) => c[k]) && !c.suspectedCopy;

function ChecklistFields({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: Checklist;
  disabled: boolean;
  onChange: (next: Checklist) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Bảng kiểm tình trạng</legend>
      {(Object.keys(checklistLabels) as (keyof Checklist)[]).map((key) => (
        <label className="check" key={key}>
          <input
            type="checkbox"
            name={`${id}-${key}`}
            checked={value[key]}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.checked })
            }
          />
          {checklistLabels[key]}
        </label>
      ))}
    </fieldset>
  );
}

function OutcomeFields({
  id,
  outcome,
  options,
  disabled,
  onChange,
  firstChoice,
}: {
  id: string;
  outcome: Outcome | null;
  options: [Outcome, string, boolean][];
  disabled: boolean;
  onChange: (next: Outcome) => void;
  firstChoice: RefObject<HTMLInputElement | null>;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Kết luận</legend>
      {options.map(([value, label, enabled], index) => (
        <label className="check" key={value}>
          <input
            ref={index === 0 ? firstChoice : undefined}
            type="radio"
            name={`outcome-${id}`}
            checked={outcome === value}
            disabled={!enabled}
            onChange={() => onChange(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function IntakeInspect({ item, ...context }: Props) {
  const [checklist, setChecklist] = useState(blank);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<"outcome" | "note" | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const trimmed = note.trim();
  const suspected = checklist.suspectedCopy;
  const passable = allMatch(checklist);
  // A changed checklist may rule out the chosen conclusion.
  const chosen =
    outcome === "Pass" && !passable
      ? null
      : suspected && outcome !== "NeedsEvidence"
        ? null
        : outcome;
  return (
    <ActionPanel
      {...context}
      label="Kiểm tra tình trạng sách"
      title="Kiểm tra theo bài đã duyệt."
      intro={
        <>
          Đối chiếu sách thực tế với ảnh và mô tả của bài đã duyệt.{" "}
          <Link to={`/review/listings/${item.listingId}`}>
            Xem bài đã duyệt
          </Link>
          . Đạt nghĩa là tình trạng khớp bảng kiểm; không phải chứng nhận chính
          hãng và không khẳng định đã kiểm mọi trang.
        </>
      }
      dirty={outcome !== null || note !== "" || checklist !== blank}
      fields={(locked) => (
        <>
          <ChecklistFields
            id={item.id}
            value={checklist}
            disabled={locked}
            onChange={(next) => {
              setChecklist(next);
              setProblem(null);
            }}
          />
          <OutcomeFields
            id={item.id}
            outcome={chosen}
            disabled={locked}
            firstChoice={firstChoice}
            onChange={(next) => {
              setOutcome(next);
              setProblem(null);
            }}
            options={[
              ["Pass", "Đạt: mọi mục khớp, có thể mở phiên", passable],
              [
                "NeedsEvidence",
                "Cần bằng chứng: người bán có 48 giờ để bổ sung, sách chưa được mở phiên",
                true,
              ],
              [
                "Fail",
                "Không đạt: người bán phải đến nhận lại sách",
                !suspected,
              ],
            ]}
          />
          {suspected && (
            <p className="muted">
              Nghi bản sao: hãy yêu cầu bằng chứng. Không kết luận vi phạm chỉ
              vì sách cũ không có hóa đơn.
            </p>
          )}
          {problem === "outcome" && (
            <p className="field-error">Chọn một kết luận phù hợp bảng kiểm.</p>
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
              ? "Ghi rõ điểm khác mô tả hoặc bằng chứng cần bổ sung (10–1.000 ký tự)."
              : "Người bán đọc được ghi chú này. Bắt buộc khi không đạt hoặc cần bằng chứng."}
          </p>
        </>
      )}
      validate={() => {
        if (!chosen) {
          setProblem("outcome");
          firstChoice.current?.focus();
          return false;
        }
        const n = noteLength(note);
        if ((chosen !== "Pass" && n < 10) || n > 1000) {
          setProblem("note");
          noteInput.current?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Ghi kết luận kiểm tra"
      confirmTitle={`Ghi kết luận ${chosen ? outcomeLabels[chosen] : ""}?`}
      confirmBody={
        <>
          <p>
            {chosen === "Pass"
              ? "Sách sẽ sẵn sàng để mở phiên đấu giá."
              : chosen === "NeedsEvidence"
                ? "Sách chưa được mở phiên. Người bán có 48 giờ để bổ sung bằng chứng; một nhân viên khác sẽ quyết định."
                : "Sách sẽ không được đấu giá; người bán được báo đến nhận lại."}{" "}
            Biên bản không sửa được sau khi ghi.
          </p>
          {trimmed && <blockquote className="prose">{trimmed}</blockquote>}
        </>
      }
      build={() => ({
        path: `/operations/auction-intakes/${item.id}/inspect`,
        body: {
          expectedVersion: item.version,
          outcome: chosen,
          note: trimmed || null,
          checklist,
        },
      })}
      interpret={() => ({
        tone: "success",
        text:
          chosen === "Pass"
            ? `“${item.title}” đạt kiểm tra. Có thể mở phiên.`
            : chosen === "NeedsEvidence"
              ? `Đã yêu cầu người bán bổ sung bằng chứng cho “${item.title}”.`
              : `“${item.title}” không đạt. Người bán sẽ được báo đến nhận lại sách.`,
        close: true,
      })}
    />
  );
}

export function IntakeEvidenceDecision({ item, ...context }: Props) {
  const answered = !!item.evidenceSubmittedAt;
  const [checklist, setChecklist] = useState(blank);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<"outcome" | "note" | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const trimmed = note.trim();
  const passable = answered && allMatch(checklist);
  const chosen = outcome === "Pass" && !passable ? null : outcome;
  return (
    <ActionPanel
      {...context}
      label="Quyết định sau khi yêu cầu bằng chứng"
      title="Xem bằng chứng người bán."
      intro={
        answered
          ? "Bạn quyết định độc lập với nhân viên đã yêu cầu bằng chứng."
          : `Người bán chưa bổ sung. Chỉ quyết định sau hạn ${dateText(item.evidenceDeadline)}; khi đó chỉ có thể kết luận không đạt.`
      }
      dirty={outcome !== null || note !== "" || checklist !== blank}
      fields={(locked) => (
        <>
          {answered ? (
            <Notice tone="info">
              Người bán trả lời lúc {dateText(item.evidenceSubmittedAt)}:{" "}
              {item.evidenceNote}
            </Notice>
          ) : null}
          <ChecklistFields
            id={`decide-${item.id}`}
            value={checklist}
            disabled={locked}
            onChange={(next) => {
              setChecklist(next);
              setProblem(null);
            }}
          />
          <OutcomeFields
            id={`decide-${item.id}`}
            outcome={chosen}
            disabled={locked}
            firstChoice={firstChoice}
            onChange={(next) => {
              setOutcome(next);
              setProblem(null);
            }}
            options={[
              ["Pass", "Đạt: bằng chứng đủ và mọi mục khớp", passable],
              [
                "Fail",
                "Không đạt: không đủ cơ sở, trả sách cho người bán",
                true,
              ],
            ]}
          />
          {problem === "outcome" && (
            <p className="field-error">Chọn một kết luận phù hợp bảng kiểm.</p>
          )}
          <div className="field">
            <label htmlFor={`decide-note-${item.id}`}>Lý do quyết định</label>
            <textarea
              id={`decide-note-${item.id}`}
              ref={noteInput}
              rows={3}
              maxLength={1000}
              value={note}
              disabled={locked}
              aria-invalid={problem === "note"}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          <p className={problem === "note" ? "field-error" : "muted"}>
            Bắt buộc, 10–1.000 ký tự. Người bán đọc được lý do này.
          </p>
        </>
      )}
      validate={() => {
        if (!chosen) {
          setProblem("outcome");
          firstChoice.current?.focus();
          return false;
        }
        const n = noteLength(note);
        if (n < 10 || n > 1000) {
          setProblem("note");
          noteInput.current?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Ghi quyết định"
      confirmTitle={`Ghi quyết định ${chosen ? outcomeLabels[chosen] : ""}?`}
      confirmBody={
        <>
          <p>
            {chosen === "Pass"
              ? "Sách sẽ sẵn sàng để mở phiên đấu giá."
              : "Sách sẽ không được đấu giá; người bán được báo đến nhận lại."}{" "}
            Biên bản không sửa được sau khi ghi.
          </p>
          <blockquote className="prose">{trimmed}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/auction-intakes/${item.id}/evidence-decision`,
        body: {
          expectedVersion: item.version,
          outcome: chosen,
          note: trimmed,
          checklist,
        },
      })}
      interpret={() => ({
        tone: "success",
        text:
          chosen === "Pass"
            ? `“${item.title}” đạt kiểm tra sau khi xem bằng chứng. Có thể mở phiên.`
            : `“${item.title}” không đạt. Người bán sẽ được báo đến nhận lại sách.`,
        close: true,
      })}
    />
  );
}

// Report revisions, oldest first (FR-T01). Immutable once written.
export function InspectionReports({ item }: { item: Intake }) {
  if (!item.reports.length) return null;
  return (
    <ol className="report-revisions">
      {item.reports.map((report) => (
        <li key={report.revision}>
          Biên bản {report.revision} · {outcomeLabels[report.outcome]} ·{" "}
          {dateText(report.createdAt)}
          {report.note ? ` — ${report.note}` : ""}
        </li>
      ))}
    </ol>
  );
}
