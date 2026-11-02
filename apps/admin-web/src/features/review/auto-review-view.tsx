import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createCommand, runCommand, type Intent } from "../../core/command";
import { dateText, money } from "../../core/format";
import { session } from "../../core/session";
import { Button, ErrorNotice, Notice } from "../../core/ui";
import {
  autoReviewHistory,
  labels,
  receipt,
  type AutoReview,
  type AutoReviewCheck,
} from "./contracts";
import { validReason } from "./decision-command";
import styles from "./AutoReview.module.css";

const criteria: Record<string, string> = {
  contentAppropriate: "Chữ của người bán phù hợp để đăng",
  noOffPlatformContact: "Không có liên hệ, giao dịch ngoài sàn",
  noReviewerInstructions: "Không có câu nhắm tới người hay máy kiểm duyệt",
  matchesDeclaredCondition: "Mô tả không mâu thuẫn với tình trạng khai báo",
  realPhoto: "Ảnh chụp thật một cuốn sách",
  physicalCopyVisible: "Thấy cuốn sách như một vật thể, không phải bản quét",
  singleCopy: "Ảnh tập trung vào một cuốn",
  coverReadable: "Thấy rõ bìa trước",
  conditionConsistent: "Ảnh không mâu thuẫn với tình trạng khai báo",
  noAuthenticityRedFlags: "Không có dấu hiệu sách lậu, bản đọc thử, sách cổ",
  imageContentAppropriate: "Ảnh phù hợp để đăng",
};
const reasonText: Record<string, string> = {
  AuctionChannel: "Sách đấu giá luôn do người duyệt",
  Bundle: "Bộ sách cần người đối chiếu từng cuốn",
  CatalogNotConfirmed: "Đầu sách chưa được xác nhận",
  OwnerIneligible: "Tài khoản người đăng chưa đủ điều kiện",
  NewSellerAccount: "Tài khoản người đăng còn mới",
  SellerVelocity: "Người đăng gửi nhiều bài trong 24 giờ",
  NotReadable: "Người bán chưa xác nhận sách đọc được",
  MissingPages: "Có thể thiếu trang",
  MissingEssentialContent: "Có thể thiếu nội dung trọng yếu",
  ConditionNotDisclosed: "Chưa khai đủ tình trạng",
  LikeNewNeedsStaff: "Mức Như mới luôn do người duyệt",
  TooFewPhotos: "Chưa đủ 2 ảnh",
  PreviouslyDecided: "Bài đã có quyết định ở bản gửi trước",
  ListingFee: "Bài có phí đăng",
  DuplicatePhoto: "Ảnh trùng với bài đăng khác",
  PhotoNearDuplicate: "Ảnh gần giống ảnh của bài đăng khác",
  PhotoUnavailable: "Không đọc được ảnh",
  PhotoTooSmall: "Ảnh quá nhỏ",
  PhotoBlurred: "Ảnh quá mờ",
  PhotoTooDark: "Ảnh quá tối",
  PhotoTooBright: "Ảnh quá sáng",
  PriceMissing: "Chưa có giá",
  PriceAboveAutoLimit: "Giá vượt trần tự duyệt",
  NoTrustedPriceSource: "Đầu sách chưa có nguồn giá đáng tin (BR-09)",
  PriceOutsideReference: "Giá nằm ngoài khoảng tham chiếu",
  SellerTextContact: "Mô tả có dấu hiệu liên hệ ngoài sàn",
  SellerTextInstruction: "Mô tả có câu nhắm tới người hay máy kiểm duyệt",
  SellerTextHiddenCharacters: "Mô tả có ký tự ẩn",
  TitleUnread: "Không đọc được tên sách trên ảnh",
  TitleMismatch: "Tên sách trên ảnh khác đầu sách",
  AuthorUnread: "Không đọc được tác giả trên ảnh",
  AuthorMismatch: "Tác giả trên ảnh khác đầu sách",
  IsbnMismatch: "ISBN trên ảnh khác đầu sách",
  EditionMismatch: "Ấn bản trên ảnh khác đầu sách",
  PublisherMismatch: "Nhà xuất bản trên ảnh khác đầu sách",
  PhotoTextFlagged: "Ảnh có chữ liên hệ hoặc chữ nhắm tới kiểm duyệt",
  SevereDamage: "AI thấy hư hại nặng",
  ConditionOverstated: "Hư hại nặng hơn tình trạng khai báo",
  CommitCheckFailed: "Thông tin bài đổi trong lúc đánh giá",
  RandomAudit: "Lấy mẫu ngẫu nhiên để người kiểm tra",
  NoLongerPublished: "Bản này không còn được đăng",
};
const stageNames: Record<string, string> = {
  Text: "đọc chữ",
  Extraction: "đọc ảnh",
  Visual: "xem ảnh",
};
export function reasonLabel(code: string) {
  const [head, tail] = code.split(":");
  if (tail === "Failed") return `${criteria[head] ?? head}: không đạt`;
  if (tail === "LowConfidence") return `${criteria[head] ?? head}: mô hình chưa đủ chắc`;
  if (tail === "AssessmentUnavailable")
    return `Không có kết quả hợp lệ từ mô hình ở bước ${stageNames[head] ?? head}`;
  return reasonText[code] ?? code;
}
const matchText: Record<string, string> = {
  Match: "Khớp",
  Mismatch: "Không khớp",
  Unread: "Không đọc được",
  NotInCatalog: "Đầu sách không có thông tin này",
};
const damageText: Record<string, string> = {
  None: "Không thấy",
  Minor: "Nhẹ",
  Moderate: "Vừa",
  Severe: "Nặng",
};
const selectionText: Record<AutoReviewCheck["selection"], string> = {
  AiRecheck: "AI kiểm tra lại",
  HumanAudit: "Lấy mẫu cho người kiểm",
  StaffOverride: "Người kiểm duyệt thu hồi",
};
export const checkStatusText: Record<AutoReviewCheck["status"], string> = {
  Passed: "AI không thấy vấn đề",
  Skipped: "Bỏ qua",
  Open: "Chờ người xem",
  Cleared: "Người kiểm duyệt: bài đăng ổn",
  Confirmed: "Người kiểm duyệt: có vấn đề",
};
const percent = (value: number) => `${Math.round(value * 100)}%`;

// Keeps one frozen intent across ambiguous failures, like the decision form:
// a retry repeats the same key and body, never a new command.
function ActionForm({
  title,
  fieldLabel,
  submitLabel,
  confirmText,
  danger,
  build,
  reconcile,
}: {
  title: string;
  fieldLabel: string;
  submitLabel: string;
  confirmText?: string;
  danger?: boolean;
  build: (text: string) => Intent;
  reconcile: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState(false);
  const [intent, setIntent] = useState<Intent>();
  const inFlight = useRef(false);
  async function send() {
    if (inFlight.current) return;
    let active = intent;
    if (!active) {
      if (!validReason(text)) {
        setInvalid(true);
        return;
      }
      if (confirmText && !window.confirm(confirmText)) return;
      active = build(text.trim());
      setIntent(active);
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await runCommand(active, receipt, session.request.bind(session), reconcile);
      setText("");
      setIntent(undefined);
    } catch (cause) {
      setError(cause);
      if (active.stopped) setIntent(undefined);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.action}>
      <h4>{title}</h4>
      <div className="field">
        <label>
          {fieldLabel}
          <textarea
            rows={3}
            value={text}
            disabled={busy || !!intent}
            aria-invalid={invalid}
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(false);
            }}
          />
        </label>
        {invalid && <p role="alert">Cần từ 10 đến 1000 ký tự.</p>}
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
      <Button
        variant={danger ? "danger" : "default"}
        busy={busy}
        onClick={() => void send()}
      >
        {intent ? "Thử gửi lại" : submitLabel}
      </Button>
    </div>
  );
}

function Checks({
  checks,
  listingId,
  canAct,
  reconcile,
}: {
  checks: AutoReviewCheck[];
  listingId: string;
  canAct: boolean;
  reconcile: () => Promise<void>;
}) {
  if (!checks.length) return null;
  return (
    <>
      <h4>Hậu kiểm sau khi đăng</h4>
      <ul className={styles.checks}>
        {checks.map((check) => (
          <li key={check.id}>
            <strong>{selectionText[check.selection]}</strong>
            {" · "}
            {checkStatusText[check.status]}
            {" · "}
            {dateText(check.createdAt)}
            {check.reasons.length > 0 && (
              <ul>
                {check.reasons.map((code) => (
                  <li key={code}>{reasonLabel(code)}</li>
                ))}
              </ul>
            )}
            {check.note && <p className="prose">{check.note}</p>}
            {check.status === "Open" && canAct && (
              <ActionForm
                key={check.version}
                title="Đã xem, bài đăng vẫn giữ"
                fieldLabel="Ghi chú của người kiểm duyệt"
                submitLabel="Đóng cảnh báo"
                build={(note) =>
                  createCommand(
                    `/operations/listings/${listingId}/auto-review/checks/${check.id}/clear`,
                    { expectedVersion: check.version, note },
                  )
                }
                reconcile={reconcile}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Assessment({ value }: { value: AutoReview }) {
  const { facts, comparison, extraction, criteria: judged } = value;
  return (
    <>
      {facts && (
        <>
          <h4>Dữ kiện hệ thống ghi nhận</h4>
          <dl className="facts">
            <div>
              <dt>Tuổi tài khoản người đăng</dt>
              <dd>{facts.ownerAccountAgeDays} ngày</dd>
            </div>
            <div>
              <dt>Bài đã gửi trong 24 giờ</dt>
              <dd>{facts.recentSubmissions}</dd>
            </div>
            <div>
              <dt>Ảnh sẵn sàng</dt>
              <dd>
                {facts.photoCount}
                {facts.duplicatePhoto ? " · có ảnh trùng bài khác" : ""}
              </dd>
            </div>
            <div>
              <dt>Khoảng giá từ nguồn đáng tin</dt>
              <dd>
                {facts.priceBounds
                  ? `${money(facts.priceBounds.low)} – ${money(facts.priceBounds.high)}`
                  : "Chưa có nguồn"}
              </dd>
            </div>
            {facts.textSignals.length > 0 && (
              <div>
                <dt>Tín hiệu trong chữ người bán</dt>
                <dd>{facts.textSignals.map(reasonLabel).join("; ")}</dd>
              </div>
            )}
          </dl>
        </>
      )}
      {comparison && (
        <>
          <h4>Đối chiếu chữ đọc từ ảnh với đầu sách</h4>
          <p className="muted">
            AI đọc ảnh mà không biết đầu sách hay lời người bán; hệ thống so
            sánh kết quả.
          </p>
          <dl className="facts">
            <div>
              <dt>Tên sách</dt>
              <dd>
                {matchText[comparison.title]}
                {extraction?.title ? ` · đọc được: ${extraction.title}` : ""}
              </dd>
            </div>
            <div>
              <dt>Tác giả</dt>
              <dd>
                {matchText[comparison.author]}
                {extraction?.authors.length
                  ? ` · đọc được: ${extraction.authors.join(", ")}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>ISBN</dt>
              <dd>
                {matchText[comparison.isbn]}
                {comparison.barcodes.length
                  ? ` · mã vạch: ${comparison.barcodes.join(", ")}`
                  : extraction?.isbn
                    ? ` · đọc được: ${extraction.isbn}`
                    : ""}
              </dd>
            </div>
            <div>
              <dt>Ấn bản</dt>
              <dd>{matchText[comparison.edition]}</dd>
            </div>
            <div>
              <dt>Nhà xuất bản</dt>
              <dd>{matchText[comparison.publisher]}</dd>
            </div>
          </dl>
        </>
      )}
      {judged.length > 0 && (
        <>
          <h4>Nhận định của mô hình</h4>
          <p className="muted">
            Độ tin cậy do mô hình tự báo, chưa được hiệu chỉnh trên dữ liệu thật.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Tiêu chí</th>
                  <th scope="col">Nhận định</th>
                  <th scope="col">Độ tin cậy</th>
                  <th scope="col">Mức cần đạt</th>
                </tr>
              </thead>
              <tbody>
                {judged.map((c) => (
                  <tr key={c.criterion} data-met={c.met}>
                    <td>{criteria[c.criterion] ?? c.criterion}</td>
                    <td>{c.pass ? "Đạt" : "Không đạt"}</td>
                    <td>{percent(c.confidence)}</td>
                    <td>{percent(c.floor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {value.damage && (
            <p className="muted">
              Mức hư hại AI thấy: {damageText[value.damage]}.
            </p>
          )}
        </>
      )}
    </>
  );
}

export function AutoReviewView({
  value,
  listingId,
  version,
  revisionId,
  canAct,
  canRevoke,
  reconcile,
}: {
  value: AutoReview;
  listingId: string;
  version: number;
  revisionId: string;
  canAct: boolean;
  canRevoke: boolean;
  reconcile: () => Promise<void>;
}) {
  const stopped = value.stages.filter((s) => s.status === "NotRun");
  return (
    <section className={`section ${styles.panel}`} aria-label="Đánh giá của AI">
      <div className={styles.head}>
        <h3>Đánh giá của AI</h3>
        <span className="status-label">
          {value.outcome === "Approved" ? "AI đã duyệt" : "AI chuyển người duyệt"}
        </span>
      </div>
      <p className="prose">
        Đây là đánh giá tự động, không phải quyết định của người kiểm duyệt. AI
        không từ chối bài; việc từ chối luôn do người quyết định.
      </p>
      {value.reasons.length > 0 && (
        <>
          <h4>Lý do chuyển người duyệt</h4>
          <ul className={styles.reasons}>
            {value.reasons.map((code) => (
              <li key={code}>{reasonLabel(code)}</li>
            ))}
          </ul>
        </>
      )}
      <Assessment value={value} />
      {!value.model && (
        <p className="muted">
          Dữ kiện đã đủ để chuyển người duyệt nên không gọi mô hình.
        </p>
      )}
      {value.model && stopped.length > 0 && (
        <p className="muted">
          Dừng sớm, không chạy bước:{" "}
          {stopped.map((s) => stageNames[s.stage]).join(", ")}.
        </p>
      )}
      <p className={`muted ${styles.meta}`}>
        {value.model ?? "Không dùng mô hình"} ·{" "}
        {value.policyVersion ?? "Chưa ghi phiên bản"} · {dateText(value.decidedAt)}
      </p>
      <Checks
        checks={value.checks}
        listingId={listingId}
        canAct={canAct}
        reconcile={reconcile}
      />
      {canRevoke && canAct && (
        <ActionForm
          key={version}
          title="Thu hồi duyệt của AI"
          fieldLabel="Lý do thu hồi"
          submitLabel="Đưa về hàng chờ duyệt"
          confirmText="Bài sẽ rời kệ ngay và quay lại hàng chờ để người kiểm duyệt quyết định. Tiếp tục?"
          danger
          build={(reason) =>
            createCommand(`/operations/listings/${listingId}/auto-review/revoke`, {
              expectedVersion: version,
              revisionId,
              reason,
            })
          }
          reconcile={reconcile}
        />
      )}
    </section>
  );
}

export function AutoReviewHistoryView({ listingId }: { listingId: string }) {
  const result = useQuery({
    queryKey: ["auto-review-history", listingId],
    queryFn: () =>
      session.request(
        `/operations/listings/${listingId}/auto-review/history`,
        autoReviewHistory,
      ),
  });
  return (
    <section className="section" aria-label="Lịch sử AI và người kiểm duyệt">
      <h3>AI và người kiểm duyệt qua các bản gửi</h3>
      {result.isLoading && <p role="status">Đang tải lịch sử…</p>}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.data?.items.length === 0 && (
        <Notice>Chưa có bản gửi nào.</Notice>
      )}
      <ol className={styles.history}>
        {result.data?.items.map((item) => (
          <li key={item.revisionId}>
            <strong>Bản gửi {item.number}</strong>
            <p>
              AI:{" "}
              {item.autoReview
                ? item.autoReview.outcome === "Approved"
                  ? "đã duyệt"
                  : `chuyển người duyệt (${item.autoReview.reasons.map(reasonLabel).join("; ")})`
                : "chưa xem"}
            </p>
            <p>
              Người kiểm duyệt:{" "}
              {item.decision && !item.decision.automated
                ? `${labels[item.decision.decision]} · ${dateText(item.decision.decidedAt)}`
                : "chưa quyết định"}
            </p>
            {item.autoReview?.checks.map((check) => (
              <p key={check.id} className="muted">
                {selectionText[check.selection]}: {checkStatusText[check.status]}
                {check.note ? ` · ${check.note}` : ""}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
