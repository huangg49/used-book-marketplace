import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { autoReview, listing, revision } from "./contracts";
import { DecisionRecord } from "./DecisionRecord";
import { AutoReviewView, reasonLabel } from "./auto-review-view";
import { reviewReturnPath } from "./review-navigation";

const id = "3f1c2a7e-9b1d-4c2e-8f3a-1b2c3d4e5f60";
const yes = {
  stage: "Visual",
  criterion: "realPhoto",
  pass: true,
  confidence: 0.97,
  floor: 0.9,
  met: true,
};
const value = autoReview.parse({
  outcome: "Approved",
  reasons: [],
  decidedAt: "2026-11-02T03:00:00.000Z",
  model: "nvidia/nemotron-3.5-super-vl-120b-a12b",
  policyVersion: "auto-review-v3",
  stages: [
    { stage: "Text", status: "Completed" },
    { stage: "Extraction", status: "Completed" },
    { stage: "Visual", status: "Completed" },
  ],
  criteria: [
    yes,
    { ...yes, criterion: "singleCopy", confidence: 0.6, floor: 0.85, met: false },
  ],
  extraction: {
    title: "Dế Mèn phiêu lưu ký",
    authors: ["Tô Hoài"],
    isbn: null,
    edition: null,
    publisher: null,
    contactOrInstructionTextVisible: false,
  },
  comparison: {
    title: "Match",
    author: "Match",
    isbn: "Unread",
    edition: "NotInCatalog",
    publisher: "NotInCatalog",
    barcodes: [],
  },
  damage: "Minor",
  facts: {
    ownerAccountAgeDays: 40,
    recentSubmissions: 1,
    photoCount: 2,
    duplicatePhoto: false,
    priceBounds: { low: 120000, high: 180000 },
    textSignals: [],
  },
  checks: [
    {
      id,
      listingId: id,
      revisionId: id,
      selection: "HumanAudit",
      status: "Open",
      reasons: ["RandomAudit"],
      model: null,
      policyVersion: "auto-review-v3",
      note: null,
      resolvedAt: null,
      resolvedByStaff: false,
      version: 1,
      createdAt: "2026-11-02T03:00:00.000Z",
    },
  ],
});
const view = (over: Partial<Parameters<typeof AutoReviewView>[0]> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AutoReviewView
        value={value}
        listingId={id}
        version={3}
        revisionId={id}
        canAct
        canRevoke
        reconcile={async () => undefined}
        {...over}
      />
    </MemoryRouter>,
  );

describe("AI review block", () => {
  it("says it is an AI assessment, not a person's decision", () => {
    const html = view();
    expect(html).toContain("không phải quyết định của người kiểm duyệt");
    expect(html).toContain("AI đã duyệt");
  });
  it("keeps server facts apart from model judgments and shows confidence with its floor", () => {
    const html = view();
    const facts = html.indexOf("Dữ kiện hệ thống ghi nhận");
    const judged = html.indexOf("Nhận định của mô hình");
    expect(facts).toBeGreaterThan(-1);
    expect(judged).toBeGreaterThan(facts);
    expect(html).toContain("chưa được hiệu chỉnh");
    expect(html).toContain("60%");
    expect(html).toContain("85%");
    expect(html).toContain('data-met="false"');
  });
  it("renders text read from a photo as text", () => {
    const html = view({
      value: {
        ...value,
        extraction: { ...value.extraction!, title: "<img src=x onerror=alert(1)>" },
      },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
  it("offers override and clearing only to someone allowed to act", () => {
    const html = view();
    expect(html).toContain("Thu hồi duyệt của AI");
    expect(html).toContain("Đóng cảnh báo");
    const owner = view({ canAct: false });
    expect(owner).not.toContain("Thu hồi duyệt của AI");
    expect(owner).not.toContain("Đóng cảnh báo");
    expect(view({ canRevoke: false })).not.toContain("Thu hồi duyệt của AI");
  });
  it("explains when no model was called", () => {
    const html = view({
      value: { ...value, outcome: "Escalated", reasons: ["TooFewPhotos"], model: null, stages: [], criteria: [] },
    });
    expect(html).toContain("không gọi mô hình");
    expect(html).toContain("Chưa đủ 2 ảnh");
  });
  it("translates reason codes and shows an unknown code as it is", () => {
    expect(reasonLabel("realPhoto:Failed")).toContain("không đạt");
    expect(reasonLabel("singleCopy:LowConfidence")).toContain("chưa đủ chắc");
    expect(reasonLabel("Text:AssessmentUnavailable")).toContain("đọc chữ");
    expect(reasonLabel("SomethingNew")).toBe("SomethingNew");
  });
});

describe("AI against human decisions", () => {
  it("does not lose the automated mark when parsing a revision", () => {
    const parsed = revision.parse({
      id,
      number: 1,
      fulfillmentStatus: "Current",
      submittedAt: "2026-11-02T03:00:00.000Z",
      ownershipDeclaredAt: "2026-11-02T03:00:00.000Z",
      decision: {
        id,
        revisionId: id,
        decision: "Approve",
        reason: null,
        decidedAt: "2026-11-02T03:00:00.000Z",
        automated: true,
      },
      content: {
        bookId: id,
        mode: "Sale",
        condition: "Good",
        pages: "",
        coverNote: "",
        notes: "",
        accessories: "",
        description: "",
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        salePrice: 100000,
        exchangeValue: null,
        mediaIds: [],
      },
    });
    expect(parsed.decision?.automated).toBe(true);
    expect(listing.shape.autoReview).toBeDefined();
  });
  it("labels the record differently", () => {
    const record = (automated: boolean) =>
      renderToStaticMarkup(
        <DecisionRecord
          decision="Approve"
          decidedAt="2026-11-02T03:00:00.000Z"
          reason={null}
          revisionId={id}
          automated={automated}
        />,
      );
    expect(record(true)).toContain("AI ĐÃ DUYỆT");
    expect(record(true)).toContain("Chưa có người kiểm duyệt xem");
    expect(record(false)).not.toContain("AI");
    expect(record(false)).toContain("Bài đăng đã được duyệt");
  });
});

describe("returning to a filtered queue", () => {
  it("keeps a known AI filter and drops anything else", () => {
    const back = (reviewReturnTo: string) => reviewReturnPath("listings", { reviewReturnTo });
    expect(back("/review/listings?status=PendingReview&ai=Escalated")).toBe(
      "/review/listings?status=PendingReview&ai=Escalated",
    );
    expect(back("/review/listings?status=PendingReview&ai=evil")).toBe(
      "/review/listings?status=PendingReview",
    );
  });
});
