import assert from "node:assert/strict";
import path from "node:path";
export async function addressJourney(p, fixture, artifacts) {
  const click = (name) => p.getByRole("button", { name, exact: true }).click();
  const fill = (label, value) =>
    p.getByLabel(`${label} *`, { exact: true }).fill(value);
  await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  let readFailed = false;
  await p.route("**/api/v1/me/addresses", (route) => {
    if (route.request().method() === "GET" && !readFailed) {
      readFailed = true;
      return route.abort("failed");
    }
    return route.continue();
  });
  await click("Sổ địa chỉ");
  await click("Tải lại sổ địa chỉ");
  await p.unroute("**/api/v1/me/addresses");
  await p.getByText("Chưa có địa chỉ nào", { exact: true }).waitFor();
  await click("Thêm địa chỉ");
  await click("Lưu địa chỉ");
  await p
    .getByText("Nhập 10 chữ số, bắt đầu bằng 0.", { exact: true })
    .waitFor();
  await fill(
    "Tên người nhận",
    "Bạn đọc thử nghiệm — tên dài để kiểm tra xuống dòng",
  );
  await fill("Số điện thoại", "0900000000");
  await fill(
    "Địa chỉ chi tiết",
    "Bàn tiếp nhận trong dữ liệu thử, không dùng để giao hàng thật",
  );
  await click("TP.HCM");
  await p
    .getByText("Chọn khu vực phục vụ.", { exact: true })
    .waitFor({ state: "hidden" });
  await p
    .getByText("Nhập 10 chữ số, bắt đầu bằng 0.", { exact: true })
    .waitFor({ state: "hidden" });
  await p.screenshot({
    path: path.join(artifacts, "addresses-form.png"),
    fullPage: true,
  });
  await click("Quay lại sổ địa chỉ");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Quay lại", exact: true })
    .click();
  let lost = true;
  const keys = [];
  await p.route("**/api/v1/me/addresses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (lost) {
      lost = false;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await click("Lưu địa chỉ");
  await click("Thử lại yêu cầu địa chỉ");
  await p.getByText("1/10 địa chỉ", { exact: true }).waitFor();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  await p.unroute("**/api/v1/me/addresses");
  const book = () => fixture.api("/me/addresses", fixture.member.accessToken);
  let b = await book();
  assert.equal(b.items.length, 1);
  assert.equal(b.items[0].isDefault, true);
  await click("Thêm địa chỉ");
  await fill("Tên người nhận", "Bạn đọc thứ hai");
  await fill("Số điện thoại", "0900000001");
  await fill("Địa chỉ chi tiết", "Bàn thử nghiệm số hai");
  await click("Bình Dương");
  await click("Lưu địa chỉ");
  await p.getByText("2/10 địa chỉ", { exact: true }).waitFor();
  await click("Đặt địa chỉ 2 làm mặc định");
  await p.getByText("ĐỊA CHỈ 2 · MẶC ĐỊNH", { exact: true }).waitFor();
  await p.setViewportSize({ width: 320, height: 844 });
  await p.addStyleTag({
    content: '[class*="css-text"] { font-size:135% !important; }',
  });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth),
    320,
  );
  await p.screenshot({
    path: path.join(artifacts, "addresses-320.png"),
    fullPage: true,
  });
  await click("Sửa địa chỉ 1");
  await fill("Tên người nhận", "Bản sửa đang nhập");
  b = await book();
  await fixture.api(
    `/me/addresses/${b.items[0].id}/default`,
    fixture.member.accessToken,
    { expectedBookVersion: b.version },
  );
  await click("Lưu địa chỉ");
  await p
    .getByText(
      "Thông tin đã thay đổi. Tải lại để kiểm tra trước khi tiếp tục.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await p.getByLabel("Tên người nhận *", { exact: true }).inputValue(),
    "Bản sửa đang nhập",
  );
  await click("Xem lại dữ liệu đã lưu");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Rời phần chỉnh sửa", exact: true })
    .click();
  await p.getByText("ĐỊA CHỈ 1 · MẶC ĐỊNH", { exact: true }).waitFor();
  let deleteLost = true;
  await p.route("**/api/v1/me/addresses/*/archive", async (route) => {
    if (deleteLost) {
      deleteLost = false;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await click("Xóa địa chỉ 1");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Xóa địa chỉ", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Thử lại yêu cầu xóa", exact: true })
    .click();
  await p.getByText("1/10 địa chỉ", { exact: true }).waitFor();
  b = await book();
  assert.equal(b.items[0].isDefault, true);
  assert.equal(b.items[0].recipientName, "Bạn đọc thứ hai");
  await p.unroute("**/api/v1/me/addresses/*/archive");
  await click("Quay lại");
  await click("Sổ địa chỉ");
  await p.getByText("Bạn đọc thứ hai", { exact: true }).waitFor();
  await click("Quay lại");
  await click("Sách của tôi");
  await p.setViewportSize({ width: 390, height: 844 });
  console.log(
    "PASS address book RN web: validation, create lost-ack replay, second/default, stale edit retained, delete lost-ack replay/default promotion, reopen, 320px large text. Real HTTP/MongoDB, demo locality data; native unverified.",
  );
}
