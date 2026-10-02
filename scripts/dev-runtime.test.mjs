import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { Writable } from "node:stream";
import { spawn } from "node:child_process";
import {
  assertNode,
  apiConfiguration,
  mobileEnvironment,
  assertPortAvailable,
  acquireLock,
  ProcessGroup,
  readEnvironment,
  redactOutput,
  waitForApi,
} from "./dev-runtime.mjs";
import { metroOptions } from "./dev-rn.mjs";

const pause = (ms) =>
  new Promise((resolvePause) => setTimeout(resolvePause, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until(check, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(25);
  }
  throw new Error("Fixture did not reach its expected state.");
}
function capture() {
  let content = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, done) {
        content += chunk;
        done();
      },
    }),
    text: () => content,
  };
}
async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "latlai-dev-test-"));
  t.after(async () => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(root, /latlai-dev-test-/);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
const apiEnv = {
  MONGODB_URL:
    "mongodb://app:random-test-password@localhost:27017/latlai?authSource=latlai",
  JWT_ACCESS_SECRET: "unit-test-secret-with-more-than-thirty-two-characters",
  NODE_ENV: "development",
};
const rootEnv = { MONGO_ROOT_PASSWORD: "random-test-root-password" };

test("Node minimum accepts newer minor/major and rejects unsupported terminal", () => {
  for (const version of ["24.15.0", "24.19.0", "25.0.0"])
    assert.doesNotThrow(() => assertNode(version, ">=24.15.0"));
  for (const version of ["24.14.9", "23.99.0"])
    assert.throws(() => assertNode(version, ">=24.15.0"), /Cần Node/);
});

test("API preflight refuses wrong local target, partial storage, production and placeholders without disclosing secrets", () => {
  assert.equal(apiConfiguration(rootEnv, apiEnv, {}).port, 3000);
  assert.equal(apiConfiguration(rootEnv, apiEnv, { PORT: "3046" }).port, 3046);
  const cases = [
    [{}, apiEnv],
    [
      rootEnv,
      {
        ...apiEnv,
        JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters",
      },
    ],
    [
      rootEnv,
      {
        ...apiEnv,
        MONGODB_URL: "mongodb://app:password@remote.example:27017/latlai",
      },
    ],
    [
      rootEnv,
      {
        ...apiEnv,
        MONGODB_URL: "mongodb://app:password@localhost:37017/latlai",
      },
    ],
    [rootEnv, { ...apiEnv, MONGODB_URL: "mongodb://localhost:27017" }],
    [rootEnv, { ...apiEnv, SUPABASE_STORAGE_KEY: "private-key-never-print" }],
    [rootEnv, { ...apiEnv, NODE_ENV: "production" }],
    [rootEnv, { ...apiEnv, PORT: "bad-port" }],
  ];
  for (const [compose, application] of cases) {
    assert.throws(
      () => apiConfiguration(compose, application, {}),
      (error) => {
        assert.ok(!error.message.includes("private-key-never-print"));
        assert.ok(!error.message.includes("random-test-password"));
        return true;
      },
    );
  }
});

test("mobile platform URLs use the same backend port, preserve LAN and respect explicit per-platform overrides", () => {
  const defaults = mobileEnvironment({}, {});
  assert.equal(
    defaults.EXPO_PUBLIC_API_BASE_URL_ANDROID,
    "http://10.0.2.2:3000/api/v1",
  );
  assert.equal(
    defaults.EXPO_PUBLIC_API_BASE_URL_WEB,
    "http://localhost:3000/api/v1",
  );
  const qa = mobileEnvironment(
    { EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3046/api/v1" },
    {},
  );
  assert.equal(
    qa.EXPO_PUBLIC_API_BASE_URL_ANDROID,
    "http://127.0.0.1:3046/api/v1",
  );
  assert.equal(qa.EXPO_PUBLIC_API_BASE_URL_WEB, "http://127.0.0.1:3046/api/v1");
  const lan = mobileEnvironment(
    { EXPO_PUBLIC_API_BASE_URL: "http://192.168.1.21:3000/api/v1" },
    {},
  );
  assert.equal(
    lan.EXPO_PUBLIC_API_BASE_URL_ANDROID,
    lan.EXPO_PUBLIC_API_BASE_URL_WEB,
  );
  const explicit = mobileEnvironment(
    { EXPO_PUBLIC_API_BASE_URL_ANDROID: "http://old.example/api/v1" },
    { EXPO_PUBLIC_API_BASE_URL_ANDROID: "http://127.0.0.1:3046/api/v1" },
  );
  assert.equal(
    explicit.EXPO_PUBLIC_API_BASE_URL_ANDROID,
    "http://127.0.0.1:3046/api/v1",
  );
  const trailing = mobileEnvironment(
    {
      EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000/api/v1/",
      EXPO_PUBLIC_API_BASE_URL_ANDROID: "http://10.0.2.2:3000/api/v1/",
    },
    {},
  );
  assert.equal(
    trailing.EXPO_PUBLIC_API_BASE_URL_WEB,
    "http://localhost:3000/api/v1",
  );
  assert.equal(
    trailing.EXPO_PUBLIC_API_BASE_URL_ANDROID,
    "http://10.0.2.2:3000/api/v1",
  );
  for (const value of [
    "ftp://host/api/v1",
    "http://user:password@localhost/api/v1",
    "http://localhost/api/v1?token=secret",
    "http://localhost",
  ]) {
    assert.throws(
      () => mobileEnvironment({ EXPO_PUBLIC_API_BASE_URL: value }, {}),
      /URL HTTP/,
    );
  }
});

test("Metro forwards Android/web/clear even without --port and never silently accepts unknown options", () => {
  assert.deepEqual(metroOptions(["--android", "--clear"]), {
    port: 8081,
    extras: ["--android", "--clear"],
  });
  assert.deepEqual(metroOptions(["--", "--web", "--port", "8091"]), {
    port: 8091,
    extras: ["--web"],
  });
  assert.throws(() => metroOptions(["--port"]), /1–65535/);
  assert.throws(() => metroOptions(["--lan"]), /Điện thoại thật/);
});

test("environment preflight reads dotenv quoting without logging the missing file contents", async (t) => {
  const root = await fixture(t);
  const path = resolve(root, ".env");
  await assert.rejects(readEnvironment(path), /pnpm setup:local/);
  await writeFile(
    path,
    'EXPO_PUBLIC_API_BASE_URL="http://localhost:3000/api/v1"\nEMPTY=\n# comment\n',
  );
  assert.deepEqual(await readEnvironment(path), {
    EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000/api/v1",
    EMPTY: "",
  });
});

test("busy IPv4 port is rejected and the unrelated listener remains usable", async (t) => {
  const server = createServer((_request, response) =>
    response.end("unrelated"),
  );
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const port = server.address().port;
  await assert.rejects(assertPortAvailable(port, "API"), /không tự tắt/);
  assert.equal(
    await (await fetch(`http://127.0.0.1:${port}`)).text(),
    "unrelated",
  );
});

test("ready preflight waits for success, supports cancellation and never accepts 503", async (t) => {
  let ready = false;
  const server = createServer((request, response) => {
    assert.equal(request.url, "/api/v1/health/ready");
    response.writeHead(ready ? 200 : 503).end();
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const port = server.address().port;
  await assert.rejects(
    waitForApi(port, new AbortController().signal, { timeoutMs: 50 }),
    /chưa sẵn sàng/,
  );
  ready = true;
  await waitForApi(port, new AbortController().signal);
  ready = false;
  const abort = new AbortController();
  const pending = waitForApi(port, abort.signal);
  abort.abort();
  await pending;
});

test("lock prevents a second runner and release only removes its own token", async (t) => {
  const root = await fixture(t);
  const release = await acquireLock(root, "api");
  await assert.rejects(acquireLock(root, "api"), /đã được khởi động/);
  const path = resolve(root, ".tmp/dev-api.lock");
  const replacement = JSON.stringify({
    pid: process.pid,
    id: "different-owner",
  });
  await writeFile(path, replacement);
  await release();
  assert.equal(await readFile(path, "utf8"), replacement);
});

test("successful finite setup leaves the supervisor available; a failed setup rejects cleanly", async () => {
  const log = capture();
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
  });
  try {
    await group.start(
      "fixture",
      process.execPath,
      ["-e", 'console.log("finished")'],
      { finite: true },
    );
    assert.match(log.text(), /\[fixture\] finished/);
    assert.equal(group.abort.signal.aborted, false);
    await assert.rejects(
      group.start("failed-setup", process.execPath, ["-e", "process.exit(9)"], {
        finite: true,
      }),
      /exit 9/,
    );
  } finally {
    await group.stop();
  }
});

test("launch failure stops its owned siblings without an unhandled rejection", async (t) => {
  const root = await fixture(t);
  const pidFile = resolve(root, "pid");
  const log = capture();
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
    graceMs: 100,
  });
  try {
    group.start("sibling", process.execPath, [
      "-e",
      'require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)',
      pidFile,
    ]);
    await until(async () =>
      Boolean(await readFile(pidFile, "utf8").catch(() => "")),
    );
    const pid = Number(await readFile(pidFile, "utf8"));
    group.start("missing", resolve(root, "missing-executable"), []);
    assert.equal(await group.done, 1);
    await until(() => !alive(pid));
    assert.match(log.text(), /missing: không khởi động/);
  } finally {
    await group.stop();
  }
});

test("unexpected worker exit stops the other owned process tree, leaving an unrelated process alive", async (t) => {
  const root = await fixture(t);
  const pidFile = resolve(root, "tree-pids.json");
  const outside = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  t.after(() => outside.kill());
  const log = capture();
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
    graceMs: 100,
  });
  try {
    group.start("tree", process.execPath, [
      "-e",
      `const {spawn}=require('child_process');const fs=require('fs');const grand=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,grand.pid]));setInterval(()=>{},1000);`,
      pidFile,
    ]);
    await until(async () =>
      Boolean(await readFile(pidFile, "utf8").catch(() => "")),
    );
    const pids = JSON.parse(await readFile(pidFile, "utf8"));
    group.start("worker", process.execPath, [
      "-e",
      "setTimeout(()=>process.exit(7),100)",
    ]);
    assert.equal(await group.done, 7);
    await until(() => pids.every((pid) => !alive(pid)));
    assert.ok(alive(outside.pid), "Unrelated process must be preserved.");
  } finally {
    await group.stop();
  }
});

test("SIGINT handler stops owned children and detaches cleanly", async () => {
  const log = capture();
  const before = process.listenerCount("SIGINT");
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
    graceMs: 100,
  });
  group.attachSignals();
  group.start("worker", process.execPath, ["-e", "setInterval(()=>{},1000)"]);
  process.emit("SIGINT");
  assert.equal(await group.done, 0);
  assert.equal(process.listenerCount("SIGINT"), before);
});

test("interactive launcher stops only its own tree without signalling the caller", async (t) => {
  const root = await fixture(t);
  const pidFile = resolve(root, "interactive-pids.json");
  const log = capture();
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
    graceMs: 100,
  });
  try {
    group.start(
      "interactive",
      process.execPath,
      [
        "-e",
        `const {spawn}=require('child_process');const fs=require('fs');const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,grand.pid]));setInterval(()=>{},1000);`,
        pidFile,
      ],
      { interactive: true },
    );
    await until(async () =>
      Boolean(await readFile(pidFile, "utf8").catch(() => "")),
    );
    const pids = JSON.parse(await readFile(pidFile, "utf8"));
    assert.equal(await group.stop(), 0);
    await until(() => pids.every((pid) => !alive(pid)));
    assert.ok(alive(process.pid));
  } finally {
    await group.stop();
  }
});

test("interactive CLI normal exit is successful, not an unexpected worker failure", async () => {
  const log = capture();
  const group = new ProcessGroup({
    output: log.stream,
    errorOutput: log.stream,
    graceMs: 100,
  });
  group.start("interactive", process.execPath, ["-e", "process.exit(0)"], {
    interactive: true,
  });
  assert.equal(await group.done, 0);
  assert.equal(log.text(), "");
});

test("known credentials and MongoDB URI credentials are redacted from prefixed diagnostics", () => {
  const text = redactOutput(
    "mongodb://any:unknown-password@localhost/db known-secret-here",
    { JWT_ACCESS_SECRET: "known-secret-here" },
  );
  assert.ok(!text.includes("unknown-password"));
  assert.ok(!text.includes("known-secret-here"));
  assert.match(text, /\[redacted\]/);
});
