// Called inside the isolated public-browser fixture. No development data or provider writes.
import assert from "node:assert/strict";
import path from "node:path";

export async function listingJourney(p, fixture, admin, artifacts) {
  const click = (name) => p.getByRole("button", { name, exact: true }).click();
  const fill = (name, value) => p.getByLabel(name, { exact: true }).fill(value);
  const created = p.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/listings") &&
      r.request().method() === "POST" &&
      r.status() === 200,
  );
  await click("Tạo bản nháp");
  const id = (await (await created).json()).entityId;
  await p
    .getByRole("button", { name: "Chọn đầu sách này", exact: true })
    .first()
    .waitFor();
  await p.screenshot({ path: path.join(artifacts, "editor-catalog-390.png") });
  await p
    .getByRole("button", { name: "Chọn đầu sách này", exact: true })
    .first()
    .click();
  // Progress reflects entered data, not visited steps.
  await p.getByRole("tab", { name: "Bước 1: Đầu sách, đã đủ" }).waitFor();
  await p
    .getByRole("tab", { name: "Bước 2: Ảnh và tình trạng, còn thiếu" })
    .waitFor();
  await click("Tiếp tục");
  const chooser = p.waitForEvent("filechooser");
  await click("Chọn ảnh từ thư viện");
  await (
    await chooser
  ).setFiles({
    name: "listing-fixture.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  await p
    .getByText(
      "Ảnh đã tải lên và đang được kiểm tra. Lưu nháp để giữ lựa chọn ảnh.",
      { exact: true },
    )
    .waitFor();
  await p.route("http://127.0.0.1:3010/**", (route) => route.abort());
  await fixture.processMedia();
  await p.clock.fastForward(4500);
  await p.getByText("Ảnh đã sẵn sàng", { exact: true }).waitFor();
  await p.getByText("Chưa tải được ảnh xem trước.", { exact: true }).waitFor();
  await p.unroute("http://127.0.0.1:3010/**");
  await click("Tải lại ảnh");
  await p
    .getByText("Chưa tải được ảnh xem trước.", { exact: true })
    .waitFor({ state: "hidden" });
  await click("Còn tốt");
  for (const [field, value] of [
    [
      "Ruột sách và trang thiếu",
      "Đủ trang, có một trang trắng cuối sách đã rời.",
    ],
    ["Bìa và gáy sách", "Góc bìa sờn, gáy còn chắc."],
    ["Ghi chú và đánh dấu", "Không có"],
    ["Phụ kiện đi kèm", "Không có"],
  ])
    await fill(field, value);
  // maxLength is UTF-16 but API limits Unicode code points, including emoji.
  await fill("Vài dòng gửi người đọc sau", "📚".repeat(5001));
  await click("Lưu nháp");
  await p.getByText("Nhập tối đa 5.000 ký tự.", { exact: true }).waitFor();
  const incomplete = await fixture.api(
    `/me/listings/${id}`,
    fixture.member.accessToken,
  );
  assert.equal(incomplete.currentRevision.content.description, "");
  await fill("Vài dòng gửi người đọc sau", "📚".repeat(5000));
  await click("Lưu nháp");
  await p
    .getByText("Bản nháp đã lưu. Bạn có thể hoàn thiện sau.", { exact: true })
    .waitFor();
  assert.equal(
    (await fixture.api(`/me/listings/${id}`, fixture.member.accessToken))
      .currentRevision.content.description,
    "📚".repeat(5000),
  );
  const literal =
    '<img src=x onerror="window.__listingInjection=true"> DỮ LIỆU KIỂM THỬ: sách có dấu đọc thật.';
  await fill("Vài dòng gửi người đọc sau", literal);
  // The new top back control must retain the existing unsaved-work guard.
  await click("Về sách của tôi");
  const leaveDialog = p.getByRole("dialog");
  await leaveDialog.waitFor();
  await leaveDialog
    .getByRole("button", { name: "Quay lại", exact: true })
    .click();
  assert.equal(
    await p
      .getByLabel("Vài dòng gửi người đọc sau", { exact: true })
      .inputValue(),
    literal,
  );
  await p
    .getByRole("button", { name: "Về sách của tôi", exact: true })
    .scrollIntoViewIfNeeded();
  await p.screenshot({
    path: path.join(artifacts, "editor-condition-390.png"),
  });
  await click("Có, còn đọc rõ");
  await click("Có — tôi đã mô tả trang thiếu ở trên");
  await click("Không thiếu nội dung trọng yếu");
  await p
    .getByRole("tab", { name: "Bước 2: Ảnh và tình trạng, đã đủ" })
    .waitFor();
  await click("Tiếp tục");
  await click("Bán hoặc đổi");
  await fill("Giá bán (đồng)", "10000");
  await fill("Giá trị đổi (đồng)", "1000000");
  await p
    .getByRole("button", { name: /^Chọn nơi gửi:/ })
    .first()
    .click();
  await click("Mở sổ địa chỉ");
  await click("Quay lại");
  assert.equal(
    await p.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
    "10000",
  );
  await p
    .getByText("Nơi gửi đã chọn · Bạn đọc thứ hai", { exact: true })
    .waitFor();
  let lostOriginAck = true;
  const originRequests = [];
  await p.route(`**/api/v1/listings/${id}/draft`, async (route) => {
    originRequests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (lostOriginAck) {
      lostOriginAck = false;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await click("Lưu nháp");
  await click("Thử lại yêu cầu vừa gửi");
  assert.deepEqual(originRequests[0], originRequests[1]);
  await p.unroute(`**/api/v1/listings/${id}/draft`);
  await p
    .getByText("Bản nháp đã lưu. Bạn có thể hoàn thiện sau.", { exact: true })
    .waitFor();
  await click("Về sách của tôi");
  await click("Hoàn thiện sách 1");
  await click("Tiếp tục");
  assert.equal(
    await p
      .getByLabel("Vài dòng gửi người đọc sau", { exact: true })
      .inputValue(),
    literal,
  );
  await click("Tiếp tục");
  assert.equal(
    await p.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
    "10000",
  );
  const savedBook = await fixture.api(
    "/me/addresses",
    fixture.member.accessToken,
  );
  const sender = savedBook.items[0];
  const staleChoice = (
    await fixture.api(`/me/listings/${id}`, fixture.member.accessToken)
  ).currentRevision.content.fulfillment;
  await fixture.api(
    `/me/addresses/${sender.id}`,
    fixture.member.accessToken,
    {
      expectedBookVersion: savedBook.version,
      makeDefault: false,
      address: {
        recipientName: sender.recipientName,
        phone: sender.phone,
        serviceAreaCode: sender.serviceAreaCode,
        localityCode: sender.localityCode,
        detail: "Dữ liệu thử — nơi gửi vừa thay đổi, cần chọn lại",
      },
    },
    "PUT",
  );
  await p.clock.fastForward(31_000);
  await p
    .getByText("Nơi gửi đã được sửa hoặc xóa.", { exact: false })
    .waitFor();
  await fill("Giá bán (đồng)", "12000");
  await click("Lưu nháp");
  await click("Kiểm tra trạng thái mới nhất");
  assert.equal(
    await p.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
    "12000",
  );
  assert.deepEqual(
    (await fixture.api(`/me/listings/${id}`, fixture.member.accessToken))
      .currentRevision.content.fulfillment,
    staleChoice,
  );
  await p
    .getByRole("button", { name: /^Chọn nơi gửi:/ })
    .first()
    .click();
  await fill("Giá bán (đồng)", "10000");
  await p.setViewportSize({ width: 320, height: 780 });
  await p
    .getByText("Sách sẽ đi từ đâu?", { exact: true })
    .scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(artifacts, "fulfillment-320.png") });
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await click("Tiếp tục");
  await p.screenshot({ path: path.join(artifacts, "editor-review-390.png") });
  const declaration = () =>
    p
      .getByRole("checkbox", {
        name: "Tôi có quyền đăng cuốn sách này; ảnh và mô tả phản ánh trung thực tình trạng sách.",
      })
      .click();
  await declaration();
  await click("Lưu và gửi duyệt");
  await p
    .getByText("Đã gửi duyệt. Bạn có thể quay lại để xem kết quả.", {
      exact: true,
    })
    .waitFor();
  const submitted = await fixture.api(
    `/operations/listings/${id}`,
    admin.accessToken,
  );
  await fixture.api(`/operations/listings/${id}/decision`, admin.accessToken, {
    expectedVersion: submitted.version,
    revisionId: submitted.currentRevision.id,
    decision: "Reject",
    reason: "Cần bổ sung rõ tình trạng trang trắng bị rời.",
  });
  await click("Cập nhật trạng thái đã lưu");
  await p
    .getByText(
      "Lần duyệt trước: Cần bổ sung rõ tình trạng trang trắng bị rời.",
      { exact: true },
    )
    .waitFor();
  // Step tabs replace the stacked back buttons and keep the entered data.
  await p.getByRole("tab", { name: /^Bước 2: Ảnh và tình trạng/ }).click();
  await fill(
    "Ruột sách và trang thiếu",
    "Trang trắng sau cùng bị rời, nội dung từ trang 1 đến 120 vẫn đủ.",
  );
  await click("Tiếp tục");
  await click("Tiếp tục");
  await declaration();
  await click("Lưu và gửi duyệt");
  await p
    .getByText("Đã gửi duyệt. Bạn có thể quay lại để xem kết quả.", {
      exact: true,
    })
    .waitFor();
  const resent = await fixture.api(
    `/operations/listings/${id}`,
    admin.accessToken,
  );
  assert.notEqual(resent.currentRevision.id, submitted.currentRevision.id);
  await fixture.api(`/operations/listings/${id}/decision`, admin.accessToken, {
    expectedVersion: resent.version,
    revisionId: resent.currentRevision.id,
    decision: "Approve",
    checklist: {
      catalogMatches: true,
      photosClear: true,
      conditionDisclosed: true,
      readable: true,
      pricingValid: true,
      contentAppropriate: true,
    },
  });
  await click("Cập nhật trạng thái đã lưu");
  await p
    .getByRole("button", { name: "Sửa bài đã duyệt", exact: true })
    .waitFor();
  const publicBook = await fixture.api(`/listings/${id}`);
  assert.equal(publicBook.description, literal);
  assert.equal(publicBook.salePrice, 10000);
  assert.equal(publicBook.exchangeValue, 1000000);
  assert.equal(publicBook.fulfillment.method, "DirectDelivery");
  assert.equal(JSON.stringify(publicBook).includes(sender.id), false);
  const origin = new URL(p.url()).origin;
  await p.goto(`${origin}/book?id=${id}`);
  await p.getByText(literal, { exact: true }).waitFor();
  await p
    .getByText("Cách sách đến tay bạn", { exact: true })
    .scrollIntoViewIfNeeded();
  await p.screenshot({
    path: path.join(artifacts, "fulfillment-public-390.png"),
  });
  assert.equal(await p.locator('img[src="x"]').count(), 0);
  assert.equal(await p.evaluate(() => window.__listingInjection), undefined);
  assert.equal(
    await fixture.db
      .collection("listing_revisions")
      .countDocuments({ listingId: id }),
    2,
  );
  console.log(
    "PASS listing journey: RN create/catalog/file chooser -> real upload/Sharp -> Unicode boundary/draft reopen -> submit -> reject -> correct/resubmit -> approve -> guest detail, escaped HTML. Reviewer decisions use real API; storage fake; not native picker evidence.",
  );
}
