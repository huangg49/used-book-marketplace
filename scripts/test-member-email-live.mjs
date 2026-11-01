// Explicit live QA: disposable Mongo database, two owner-approved mailbox variants.
// OTP entry is human-only through a loopback form; secrets/codes never enter output.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";

if (process.argv.slice(2).join(" ") !== "--live-approved-gmail-alias") {
  console.log(
    "NOT RUN: requires --live-approved-gmail-alias and owner approval of the configured Gmail +latlaiqa recipient.",
  );
  process.exit(2);
}
const req = createRequire(new URL("../apps/api/package.json", import.meta.url));
const load = (p) =>
  import(pathToFileURL(path.join(root, "apps/api/dist", p)).href);
const evidence = path.join(
  root,
  ".tmp/member-acceptance/member-email-live.json",
);
const webOrigin = "http://127.0.0.1:5196";
const csrf = randomBytes(32).toString("hex");
const originalFetch = globalThis.fetch;
const result = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  runnerHasLocalChanges: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  stage: "preflight",
  status: "NOT_RUN",
  cleanup: "NOT_RUN",
  checks: [],
  provider: [],
  inbox: "NOT_VERIFIED",
  ui: "QA_HELPER_ONLY",
  native: "NOT_RUN",
  data: "SYNTHETIC_ACCOUNT_REAL_QA_EMAIL",
};
let fixture, mail, server, oldEmail, newEmail, actor, second, changeId, jobId;
let state = "ready",
  busy = false,
  warningReceived = false,
  dropProviderAck = true;
let firstConfirmBody, confirmKey;
let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});
async function save() {
  await mkdir(path.dirname(evidence), { recursive: true });
  await writeFile(evidence, JSON.stringify(result, null, 2) + "\n");
}
function pass(label) {
  result.checks.push(label);
}
async function call(route, token, body, key = randomUUID()) {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    replay: response.headers.get("idempotency-replayed"),
    value: await response.json().catch(() => null),
  };
}
function page(message = "") {
  // No account identifiers, tokens, addresses, OTPs or API keys rendered back.
  const form = (action, content) =>
    `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${csrf}">${content}</form>`;
  const content =
    state === "ready"
      ? form(
          "/send",
          "<p>Nhấn để nhận OTP thật qua Gmail đã được bạn cho phép, dùng alias +latlaiqa. Tài khoản trong database QA sẽ được đổi email; tài khoản thật giữ nguyên.</p><button>Gửi mã QA</button>",
        )
      : state === "otp"
        ? form(
            "/confirm",
            "<p>Mở thư mới nhất có tiêu đề [QA Lật lại]. Nhập mã 6 số trực tiếp bên dưới trong vòng 5 phút. Không gửi mã qua chat.</p><label>Mã OTP QA <input name=code type=text inputmode=numeric autocomplete=one-time-code pattern='[0-9]{6}' maxlength=6 required></label><button>Xác nhận đổi email QA</button>",
          )
        : state === "warning"
          ? form(
              "/received",
              "<p>Đổi email QA đã thành công. Hãy kiểm tra thư cảnh báo có tiêu đề [QA Lật lại] Email đăng nhập Lật lại đã được thay đổi.</p><button>Tôi đã nhận cả OTP và thư cảnh báo trong Hộp thư đến</button>",
            ) +
            form(
              "/missing",
              "<button>Tôi chưa nhận đủ thư / thư vào Spam</button>",
            )
          : state === "done"
            ? "<p>PASS: hoàn tất xác nhận nhận thư. Đang dọn dữ liệu QA.</p>"
            : "<p>Đã dừng lượt QA. Xem kết quả sanitized trong repository.</p>";
  return `<!doctype html><html lang=vi><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Lật lại · Kiểm tra email QA</title><style>body{font:18px system-ui;max-width:660px;margin:40px auto;padding:20px;line-height:1.6;color:#222;background:#fafafa}label{display:block}input{font:inherit;max-width:100%;padding:10px}button{font:inherit;padding:10px;margin:16px 0}form{margin:24px 0}strong{color:#8a291b}</style><h1>Kiểm tra email QA</h1><p><strong>Trang hỗ trợ kiểm thử riêng, không phải giao diện sản phẩm.</strong></p><p>Chỉ dùng database ngẫu nhiên kết thúc _test và hai biến thể của hộp thư đã duyệt. Không kết nối dữ liệu chính.</p><p role=status>${message}</p>${content}</html>`;
}
async function send() {
  const profile = await call("/me/profile", actor.accessToken);
  assert.equal(profile.status, 200, "Current profile read failed");
  const body = {
    expectedVersion: profile.value.version,
    email: newEmail,
    password,
  };
  const key = randomUUID();
  // Deliberately discard the first committed HTTP response, then replay original intent.
  const lost = await call(
    "/me/profile/email-changes",
    actor.accessToken,
    body,
    key,
  );
  assert.equal(lost.status, 200, "Email request did not commit");
  const replay = await call(
    "/me/profile/email-changes",
    actor.accessToken,
    body,
    key,
  );
  assert.equal(replay.status, 200, "Request replay failed");
  assert.equal(replay.replay, "true", "Request was not replayed");
  assert.deepEqual(replay.value, lost.value, "Request receipt changed");
  changeId = replay.value.entityId;
  const jobs = await fixture.db
    .collection("auth_mail_jobs")
    .find({ userId: actor.user.id })
    .toArray();
  assert.equal(jobs.length, 1, "Request replay created another mail job");
  jobId = jobs[0]._id;
  assert.equal(jobs[0].status, "Pending", "No durable Pending job");
  assert.ok(
    jobs[0].encryptedPayload && !jobs[0].encryptedPayload.includes(newEmail),
    "Payload not encrypted",
  );
  pass(
    "PASS request lost-response simulation/replay keeps original key/body/version, one encrypted job",
  );
  assert.equal(
    (await fixture.db.collection("users").findOne({ _id: actor.user.id }))
      .emailNormalized,
    oldEmail,
    "Email changed before OTP",
  );
  const current = await call("/me/profile", actor.accessToken);
  const cooldown = await call("/me/profile/email-changes", actor.accessToken, {
    ...body,
    expectedVersion: current.value.version,
  });
  assert.equal(cooldown.status, 429, "Resend cooldown missing");
  assert.equal(
    cooldown.value.code,
    "EMAIL_CHANGE_COOLDOWN",
    "Wrong cooldown rejection",
  );
  pass(
    "PASS original email unchanged before OTP; immediate resend rejected with EMAIL_CHANGE_COOLDOWN",
  );
  const wrongOwner = await call(
    "/me/profile/email-changes/confirm",
    fixture.member.accessToken,
    { changeId, code: "000000" },
  );
  assert.equal(wrongOwner.status, 404, "Other owner accessed challenge");
  pass("PASS other owner cannot confirm or consume challenge");
  await mail.drain();
  let job = await fixture.db
    .collection("auth_mail_jobs")
    .findOne({ _id: jobId });
  assert.equal(
    job.status,
    "Pending",
    "Lost provider ACK did not leave retryable job",
  );
  assert.equal(job.attempts, 1, "Wrong attempt count after lost provider ACK");
  assert.ok(job.encryptedPayload, "Lost ACK removed encrypted payload early");
  // Explicit QA scheduling fixture: accelerate backoff, retain the same job/challenge.
  await fixture.db
    .collection("auth_mail_jobs")
    .updateOne({ _id: jobId }, { $set: { nextAttemptAt: new Date(0) } });
  await mail.drain();
  job = await fixture.db.collection("auth_mail_jobs").findOne({ _id: jobId });
  assert.equal(job.status, "Sent", "Provider duplicate not acknowledged");
  assert.equal(job.attempts, 2, "Retry did not reuse durable job");
  assert.equal(job.encryptedPayload, "", "Sent job retained sensitive payload");
  assert.ok(
    result.provider.length === 2 &&
      result.provider[0].status === 201 &&
      result.provider[1].duplicate,
    "Provider ACK/replay evidence missing",
  );
  pass(
    "PASS real Brevo accepted OTP, injected lost ACK retained encrypted job, retry duplicate acknowledged and payload erased",
  );
  state = "otp";
  result.stage = "awaiting-human-otp";
}
async function confirm(code) {
  assert.match(code, /^[0-9]{6}$/, "Invalid OTP format");
  const body = { changeId, code };
  // If a prior confirm had an uncertain response, keep its exact key and code in memory.
  if (firstConfirmBody)
    assert.equal(code, firstConfirmBody.code, "Use original uncertain intent");
  const key = confirmKey ?? randomUUID();
  firstConfirmBody = body;
  confirmKey = key;
  const accepted = await call(
    "/me/profile/email-changes/confirm",
    actor.accessToken,
    body,
    key,
  );
  if (accepted.status === 400) {
    firstConfirmBody = undefined;
    confirmKey = undefined;
    return false;
  }
  assert.equal(accepted.status, 200, "Confirm command failed");
  const replay = await call(
    "/me/profile/email-changes/confirm",
    actor.accessToken,
    body,
    key,
  );
  assert.equal(replay.status, 200, "Confirm replay failed");
  assert.equal(replay.replay, "true", "Confirm did not replay receipt");
  assert.deepEqual(replay.value, accepted.value, "Confirm receipt changed");
  firstConfirmBody = undefined;
  assert.equal(
    (await fixture.db.collection("users").findOne({ _id: actor.user.id }))
      .emailNormalized,
    newEmail,
    "Email not committed",
  );
  assert.equal(
    (await call("/auth/me", actor.accessToken)).status,
    200,
    "Current session revoked",
  );
  assert.equal(
    (await call("/auth/me", second.accessToken)).status,
    401,
    "Other access token remains usable",
  );
  assert.equal(
    (await call("/auth/refresh", null, { refreshToken: second.refreshToken }))
      .status,
    401,
    "Other refresh token remains usable",
  );
  assert.equal(
    (await call("/auth/login", null, { email: oldEmail, password })).status,
    401,
    "Old email still authenticates",
  );
  assert.equal(
    (await call("/auth/login", null, { email: newEmail, password })).status,
    200,
    "New email cannot authenticate",
  );
  pass(
    "PASS human OTP confirm/replay, same identity/current session retained, other access/refresh revoked, old login denied/new login accepted",
  );
  assert.equal(
    (await call("/me/profile/email-changes/confirm", actor.accessToken, body))
      .status,
    400,
    "Consumed OTP allowed a new command",
  );
  const jobs = await fixture.db
    .collection("auth_mail_jobs")
    .find({ userId: actor.user.id })
    .toArray();
  assert.equal(jobs.length, 2, "Confirm/replay created duplicate warning");
  const warning = jobs.find((j) => j.tokenId === null);
  assert.ok(warning && warning.status === "Pending", "Warning not durable");
  const payload = mail.decrypt(warning.encryptedPayload);
  assert.equal(payload.to, oldEmail, "Warning addressed to wrong email");
  assert.equal(payload.kind, "EmailChanged", "Wrong warning kind");
  await mail.drain();
  const sent = await fixture.db
    .collection("auth_mail_jobs")
    .findOne({ _id: warning._id });
  assert.equal(sent.status, "Sent", "Warning not sent");
  assert.equal(sent.encryptedPayload, "", "Sent warning retained payload");
  const audit = JSON.stringify(
    await fixture.db
      .collection("audit_events")
      .find({ accountId: actor.user.id })
      .toArray(),
  );
  for (const value of [oldEmail, newEmail, code, password])
    assert.ok(!audit.includes(value), "Audit contains private data");
  pass(
    "PASS one durable old-email warning, provider accepted, payload erased; consumed OTP rejected and audit excludes PII/code/password",
  );
  state = "warning";
  result.stage = "awaiting-human-inbox-confirmation";
  return true;
}
try {
  const qa = new URL(process.env.MONGO_TEST_URL ?? "");
  assert.ok(
    qa.protocol === "mongodb:" &&
      ["127.0.0.1", "localhost"].includes(qa.hostname) &&
      qa.port === "57017" &&
      qa.searchParams.get("replicaSet") === "rs-test",
    "Dedicated QA rs-test required",
  );
  const env = req("dotenv").parse(
    await readFile(path.join(root, "apps/api/.env.brevo.qa"), "utf8"),
  );
  assert.ok(
    env.AUTH_MAIL_PROVIDER === "brevo" &&
      env.BREVO_API_KEY &&
      env.AUTH_MAIL_ENCRYPTION_KEY?.length >= 32,
    "Private Brevo QA config required",
  );
  oldEmail = env.BREVO_QA_RECIPIENT;
  assert.ok(
    oldEmail &&
      oldEmail === env.BREVO_SENDER_EMAIL &&
      /^[^+\s@]+@gmail\.com$/i.test(oldEmail),
    "Expected owner-approved Gmail sender/recipient without an existing plus tag",
  );
  newEmail = oldEmail.replace(/@gmail\.com$/i, "+latlaiqa@gmail.com");
  assert.notEqual(newEmail, oldEmail, "Distinct QA recipient required");
  Object.assign(process.env, env, {
    NODE_ENV: "test",
    AUTH_WEB_ORIGIN: webOrigin,
  });
  globalThis.fetch = async (url, init) => {
    const dest = new URL(String(url));
    if (dest.origin === new URL(base).origin) return originalFetch(url, init);
    assert.ok(
      String(url) === "https://api.brevo.com/v3/smtp/email" &&
        init?.method === "POST",
      "External destination denied",
    );
    const data = JSON.parse(init.body);
    assert.ok(
      data.to?.length === 1 &&
        [oldEmail, newEmail].includes(data.to[0].email) &&
        data.sender.email === oldEmail,
      "Unapproved mail destination",
    );
    assert.ok(result.provider.length < 3, "Provider send budget exceeded");
    const response = await originalFetch(url, init);
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    result.provider.push({
      status: response.status,
      duplicate: body?.code === "duplicate_parameter",
    });
    if (response.status === 201 && dropProviderAck) {
      dropProviderAck = false;
      await response.body?.cancel();
      throw new Error("QA injected lost provider ACK");
    }
    return response;
  };
  fixture = await createTestApi({ listingCount: 0, corsOrigin: webOrigin });
  assert.ok(
    fixture.db.databaseName.endsWith("_test"),
    "Disposable QA database required",
  );
  const { AuthMailService } = await load("modules/auth/auth-mail.service.js");
  const { ConfigService } = req("@nestjs/config");
  const { validateAccountMail } = await load("config/environment.js");
  mail = new AuthMailService(
    {
      c: new Proxy(
        {},
        { get: (_, name) => fixture.db.collection(String(name)) },
      ),
    },
    new ConfigService(
      validateAccountMail(env, "test", process.env.JWT_ACCESS_SECRET),
    ),
  );
  const render = mail.render.bind(mail);
  mail.render = (payload) => {
    const message = render(payload);
    const label =
      "THƯ KIỂM THỬ QA LẬT LẠI: chỉ áp dụng tài khoản trong database QA, không đổi tài khoản thật.";
    return {
      subject: "[QA Lật lại] " + message.subject,
      text: label + "\n\n" + message.text,
      html: message.html.replace("<h1>", "<p>" + label + "</p><h1>"),
    };
  };
  const template = await fixture.db
    .collection("users")
    .findOne({ _id: fixture.member.user.id });
  const id = randomUUID();
  await fixture.db.collection("users").insertOne({
    ...template,
    _id: id,
    emailNormalized: oldEmail,
    displayName: "Người đọc QA email",
  });
  actor = (await call("/auth/login", null, { email: oldEmail, password }))
    .value;
  second = (await call("/auth/login", null, { email: oldEmail, password }))
    .value;
  assert.equal(actor?.user.id, id, "QA login identity mismatch");
  assert.equal(second?.user.id, id, "Second QA login failed");
  pass(
    "PASS isolated random *_test database, genuine Member sessions, fixed approved mailbox variants, external send budget 3",
  );
  server = createServer(async (request, response) => {
    const headers = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // no-referrer makes browsers send Origin:null for native form POSTs.
      // same-origin preserves strict Origin validation without cross-site referrers.
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    };
    const respond = (status, message) =>
      response.writeHead(status, headers).end(page(message));
    const deny = async (reason) => {
      result.helperDenials ??= [];
      if (result.helperDenials.length < 12)
        result.helperDenials.push({
          reason,
          method:
            request.method === "POST"
              ? "POST"
              : request.method === "GET"
                ? "GET"
                : "OTHER",
          route: [
            "/",
            "/send",
            "/confirm",
            "/received",
            "/missing",
            "/stop",
          ].includes(request.url)
            ? request.url
            : "OTHER",
          hostMatches: request.headers.host === "127.0.0.1:5196",
          fetchSite: [
            "none",
            "same-origin",
            "same-site",
            "cross-site",
          ].includes(request.headers["sec-fetch-site"])
            ? request.headers["sec-fetch-site"]
            : "ABSENT_OR_OTHER",
          origin:
            request.headers.origin === webOrigin
              ? "MATCH"
              : request.headers.origin
                ? "OTHER"
                : "ABSENT",
          formType:
            request.headers["content-type"] ===
            "application/x-www-form-urlencoded",
        });
      await save();
      response
        .writeHead(403, headers)
        .end(
          "<!doctype html><meta charset=utf-8><p>Trang QA từ chối request không đúng origin/host. Hãy mở http://127.0.0.1:5196/ trực tiếp trong thanh địa chỉ. Không gửi OTP qua chat.</p>",
        );
    };
    if (
      request.headers.host !== "127.0.0.1:5196" ||
      ![undefined, "same-origin", "none"].includes(
        request.headers["sec-fetch-site"],
      )
    )
      return deny("HOST_OR_FETCH_SITE");
    if (request.method === "GET" && request.url === "/")
      return respond(200, "");
    if (
      request.method !== "POST" ||
      request.headers.origin !== webOrigin ||
      request.headers["content-type"] !== "application/x-www-form-urlencoded"
    )
      return deny("METHOD_OR_ORIGIN_OR_CONTENT_TYPE");
    if (busy) return respond(409, "Đang xử lý. Không gửi lại trong lúc chờ.");
    busy = true;
    try {
      let text = "";
      for await (const chunk of request) {
        text += chunk;
        assert.ok(text.length <= 1024, "Body limit");
      }
      const body = new URLSearchParams(text);
      if (body.get("csrf") !== csrf) return await deny("CSRF");
      if (request.url === "/stop") {
        result.status = "BLOCKED";
        result.failedStage = "operator-stop";
        state = "failed";
        respond(200, "Lượt QA đã dừng theo yêu cầu.");
        finish();
        return;
      }
      if (request.url === "/send" && state === "ready") await send();
      else if (request.url === "/confirm" && state === "otp") {
        if (!(await confirm(body.get("code") ?? ""))) {
          await save();
          return respond(
            400,
            "Mã sai hoặc hết hạn. Nhập lại mã trong thư mới nhất; tối đa 5 lần.",
          );
        }
      } else if (
        ["/received", "/missing"].includes(request.url) &&
        state === "warning"
      ) {
        warningReceived = request.url === "/received";
        result.inbox = warningReceived
          ? "OWNER_CONFIRMED_OTP_AND_WARNING_INBOX"
          : "OWNER_REPORTED_MISSING_OR_SPAM";
        state = "done";
        finish();
      } else
        return respond(
          409,
          "Bước này không còn hiệu lực. Tải lại trang để xem bước hiện tại.",
        );
      await save();
      respond(
        200,
        state === "otp"
          ? "OTP đã gửi. Hãy kiểm tra Gmail."
          : "Đã xử lý bước QA.",
      );
    } catch {
      result.failedStage = result.stage;
      state = "failed";
      result.status = "FAIL";
      await save();
      respond(500, "Lượt QA đã dừng an toàn. Không gửi mã qua chat.");
      finish();
    } finally {
      busy = false;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(5196, "127.0.0.1", resolve);
  });
  result.stage = "awaiting-human-send";
  await save();
  console.log(
    "READY: http://127.0.0.1:5196/ — human OTP entry only; expires in 20 minutes.",
  );
  const timeout = setTimeout(() => {
    result.status = "BLOCKED";
    result.failedStage = "human-timeout";
    finish();
  }, 20 * 60_000);
  const stop = () => {
    result.status = "BLOCKED";
    result.failedStage = "interrupted";
    finish();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await finished;
  clearTimeout(timeout);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (result.status === "NOT_RUN")
    result.status = warningReceived ? "PASS" : "PARTIAL";
} catch {
  result.status = "FAIL";
  result.failedStage = result.stage;
} finally {
  firstConfirmBody = undefined;
  try {
    await new Promise((resolve, reject) =>
      server?.listening
        ? server.close((error) => (error ? reject(error) : resolve()))
        : resolve(),
    );
    await fixture?.close();
    result.cleanup = "PASS";
  } catch {
    result.cleanup = "FAIL";
    result.status = "FAIL";
  }
  globalThis.fetch = originalFetch;
  result.stage = "complete";
  await save();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode =
    result.status === "FAIL" ? 1 : result.status === "BLOCKED" ? 2 : 0;
}
