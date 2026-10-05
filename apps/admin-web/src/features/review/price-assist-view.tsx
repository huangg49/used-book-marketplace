import { dateText, money } from "../../core/format";
import { labels, type PriceAssistReview } from "./contracts";

const sourceKind: Record<PriceAssistReview["sources"][number]["kind"], string> = {
  CoverPrice: "Giá bìa (nhân viên nhập)",
  EditorialReference: "Giá biên tập kiểm",
  InternalAsking: "Giá rao của người bán khác",
  CompletedSale: "Giá đã bán",
  OnlineRetail: "Giá sách mới tại nhà sách trực tuyến",
};
const evidence: Record<PriceAssistReview["evidenceLevel"], string> = {
  Strong: "Căn cứ khá đủ",
  Limited: "Căn cứ còn hạn chế",
  Insufficient: "Chưa đủ căn cứ",
};
const yesNo = (v: boolean | null) => (v === null ? "Chưa trả lời" : v ? "Có" : "Không");

// Lets the reviewer tell a price the AI suggested from the seller's own, and
// see the condition the suggestion assumed (it is the seller's declaration;
// compare it with the photos above).
export function PriceAssistView({ value }: { value: PriceAssistReview }) {
  return (
    <section className="section">
      <h3>Gợi ý giá của trợ lý</h3>
      <p className="prose">
        {value.applied
          ? `Người bán đã dùng gợi ý: ${money(value.chosenSalePrice)} trong khoảng ${money(value.range.low)} – ${money(value.range.high)}.`
          : `Người bán tự đặt giá ${money(value.chosenSalePrice)}; gợi ý là ${money(value.range.low)} – ${money(value.range.high)}${value.withinRange === false ? " (giá nằm ngoài khoảng gợi ý)" : ""}.`}
      </p>
      <dl className="facts">
        <div>
          <dt>Tình trạng khi xin gợi ý</dt>
          <dd>{labels[value.input.condition ?? ""] || "Chưa chọn"}</dd>
        </div>
        <div>
          <dt>Còn đọc rõ / thiếu trang / thiếu nội dung trọng yếu</dt>
          <dd>
            {yesNo(value.input.readable)} / {yesNo(value.input.hasMissingPages)} /{" "}
            {yesNo(value.input.missingEssentialContent)}
          </dd>
        </div>
        <div>
          <dt>Mức căn cứ</dt>
          <dd>{evidence[value.evidenceLevel]}</dd>
        </div>
        <div>
          <dt>Thời điểm</dt>
          <dd>{dateText(value.decidedAt)}</dd>
        </div>
      </dl>
      {value.sources.length > 0 && (
        <ul className="source-list">
          {value.sources.map((s) => (
            <li key={s.ref} className={s.excluded ? "muted" : undefined}>
              {s.label} · {sourceKind[s.kind]} · {money(s.amount)} · {dateText(s.observedAt)}
              {s.excluded ? " · không dùng tính khoảng giá" : ""}
              {s.url && (
                <>
                  {" · "}
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    Mở trang
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
