// Shared development launcher utilities. No database writes, migrations or seed.
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { createServer, createConnection } from "node:net";
import { parseEnv, promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function assertNode(version, minimum) {
  const actual = version.replace(/^v/, "").split(".").map(Number);
  const required = minimum.replace(/^>=/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (actual[i] > required[i]) return;
    if (actual[i] < required[i]) break;
    if (i === 2) return;
  }
  throw new Error(
    `Cần Node ${minimum}; terminal hiện dùng ${version}. Cập nhật Node rồi mở lại terminal.`,
  );
}

export async function checkNode(root = repoRoot) {
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assertNode(process.versions.node, pkg.engines.node);
}

export async function readEnvironment(path, { required = true } = {}) {
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && !required) return {};
    if (error.code === "ENOENT")
      throw new Error(
        `Thiếu ${path}. Chạy pnpm setup:local một lần; cấu hình có sẵn được giữ lại.`,
      );
    throw new Error(
      `Không đọc được cấu hình ${path}. Kiểm quyền đọc; không cần gửi nội dung .env.`,
    );
  }
}

export function portNumber(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${name} phải là số cổng 1–65535.`);
  return port;
}

export function apiConfiguration(rootEnv, fileEnv, inherited = process.env) {
  const env = { ...fileEnv, ...inherited };
  const composeEnv = { ...rootEnv, ...inherited };
  if (
    !composeEnv.MONGO_ROOT_PASSWORD ||
    composeEnv.MONGO_ROOT_PASSWORD.startsWith("replace-")
  )
    throw new Error(
      "MONGO_ROOT_PASSWORD chưa được cấu hình trong .env ở root. Hoàn tất pnpm setup:local.",
    );
  if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^?/]+/.test(env.MONGODB_URL || ""))
    throw new Error(
      "MONGODB_URL trong apps/api/.env phải chỉ rõ database. Xem docs/handoff/TEAM_WINDOWS.md.",
    );
  if (
    (env.JWT_ACCESS_SECRET || "").length < 32 ||
    env.JWT_ACCESS_SECRET.startsWith("replace-")
  )
    throw new Error(
      "JWT_ACCESS_SECRET trong apps/api/.env chưa hợp lệ. Hoàn tất pnpm setup:local.",
    );
  if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_STORAGE_KEY))
    throw new Error(
      "Cần cấu hình cả SUPABASE_URL và SUPABASE_STORAGE_KEY, hoặc để cả hai trống.",
    );
  if ((env.NODE_ENV || "development") !== "development")
    throw new Error(
      "Lệnh dev:api chỉ dùng NODE_ENV=development. Dùng lệnh riêng cho QA hoặc production.",
    );
  const port = portNumber(env.PORT || 3000, "PORT");
  const mongoPort = portNumber(composeEnv.MONGO_PORT || 27017, "MONGO_PORT");
  const url = new URL(env.MONGODB_URL);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    Number(url.port || 27017) !== mongoPort
  )
    throw new Error(
      "dev:api dùng MongoDB local của Docker Compose. MONGODB_URL và MONGO_PORT phải trỏ cùng cổng; QA/remote dùng lệnh riêng.",
    );
  if (decodeURIComponent(url.password).startsWith("replace-"))
    throw new Error(
      "MONGODB_URL vẫn chứa mật khẩu mẫu. Hoàn tất setup/bootstrap một lần theo TEAM_WINDOWS.",
    );
  return {
    env,
    composeEnv,
    port,
    mongoPort,
    mediaConfigured: Boolean(env.SUPABASE_URL),
  };
}

function publicUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} phải là URL HTTP(S) có /api/v1.`);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/api/v1")
  )
    throw new Error(
      `${name} phải là URL HTTP(S) kết thúc bằng /api/v1, không chứa thông tin đăng nhập.`,
    );
  return url.toString().replace(/\/$/, "");
}

export function mobileEnvironment(fileEnv, inherited = process.env) {
  // Backend credentials are not read here; Expo only needs its public config.
  const env = { ...fileEnv, ...inherited };
  const shared = publicUrl(
    env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000/api/v1",
    "EXPO_PUBLIC_API_BASE_URL",
  );
  const android = new URL(shared);
  // localhost is the setup default. Explicit loopback URLs are also used with
  // adb reverse by QA; keep those targets unless a platform override is supplied.
  if (android.hostname === "localhost") android.hostname = "10.0.2.2";
  return {
    ...env,
    EXPO_PUBLIC_API_BASE_URL: shared,
    EXPO_PUBLIC_API_BASE_URL_ANDROID: publicUrl(
      env.EXPO_PUBLIC_API_BASE_URL_ANDROID || android.toString(),
      "EXPO_PUBLIC_API_BASE_URL_ANDROID",
    ),
    EXPO_PUBLIC_API_BASE_URL_WEB: publicUrl(
      env.EXPO_PUBLIC_API_BASE_URL_WEB || shared,
      "EXPO_PUBLIC_API_BASE_URL_WEB",
    ),
    EXPO_PUBLIC_API_BASE_URL_IOS: publicUrl(
      env.EXPO_PUBLIC_API_BASE_URL_IOS || shared,
      "EXPO_PUBLIC_API_BASE_URL_IOS",
    ),
  };
}

export async function assertPortAvailable(port, label) {
  const occupied = (host) =>
    new Promise((resolveProbe) => {
      const socket = createConnection({ port, host });
      const done = (value) => {
        socket.destroy();
        resolveProbe(value);
      };
      socket.once("connect", () => done(true));
      socket.once("error", (error) =>
        done(
          ![
            "ECONNREFUSED",
            "EAFNOSUPPORT",
            "ENETUNREACH",
            "EADDRNOTAVAIL",
          ].includes(error.code),
        ),
      );
      socket.setTimeout(750, () => done(true));
    });
  const busy = () =>
    new Error(
      `${label}: cổng ${port} đang được dùng hoặc không cho phép mở. Dừng tiến trình của bạn hoặc chọn cổng khác; launcher không tự tắt tiến trình đó.`,
    );
  // Windows permits some wildcard bind overlaps, so also probe both loopbacks.
  if (
    (await Promise.all([occupied("127.0.0.1"), occupied("::1")])).some(Boolean)
  )
    throw busy();
  const tryBind = (host) =>
    new Promise((resolveBind, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen({ port, host, exclusive: true }, () =>
        server.close(resolveBind),
      );
    });
  try {
    await tryBind("0.0.0.0");
    await tryBind("::");
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) {
      try {
        await tryBind("0.0.0.0");
      } catch {
        throw busy();
      }
    } else throw busy();
  }
}

export function redactOutput(text, env) {
  let safe = String(text).replace(
    /(mongodb(?:\+srv)?:\/\/)[^\s/@]+:[^\s/@]+@/gi,
    "$1[redacted]@",
  );
  for (const [key, value] of Object.entries(env)) {
    if (/(SECRET|PASSWORD|STORAGE_KEY|TOKEN)/i.test(key) && value?.length >= 8)
      safe = safe.replaceAll(value, "[redacted]");
  }
  return safe;
}

export async function acquireLock(root, name) {
  const directory = resolve(root, ".tmp");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `dev-${name}.lock`);
  const token = JSON.stringify({ pid: process.pid, id: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, "wx");
      await file.writeFile(token);
      await file.close();
      return async () => {
        if ((await readFile(path, "utf8").catch(() => "")) === token)
          await unlink(path).catch(() => {});
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const content = await readFile(path, "utf8");
      let pid;
      try {
        pid = JSON.parse(content).pid;
      } catch {
        /* Fail closed on an unknown lock. */
      }
      if (!Number.isInteger(pid) || pid <= 0)
        throw new Error(
          `Lock ${path} không hợp lệ; kiểm tiến trình dev đang chạy trước khi xóa lock thủ công.`,
        );
      try {
        process.kill(pid, 0);
      } catch (checkError) {
        if (
          checkError.code === "ESRCH" &&
          (await readFile(path, "utf8")) === content
        ) {
          await unlink(path);
          continue;
        }
      }
      throw new Error(
        `${name} đã được khởi động (PID ${pid}). Dùng terminal đó hoặc dừng bằng Ctrl+C trước.`,
      );
    }
  }
  throw new Error(
    `Không thể giữ lock cho ${name}; thử lại sau khi kiểm terminal đang chạy.`,
  );
}

export class ProcessGroup {
  #children = new Set();
  #isolatedGroups = new WeakSet();
  #stopping;
  #resolveDone;
  #signalHandlers = [];
  constructor({
    output = process.stdout,
    errorOutput = process.stderr,
    graceMs = 2000,
  } = {}) {
    this.output = output;
    this.errorOutput = errorOutput;
    this.graceMs = graceMs;
    this.abort = new AbortController();
    this.done = new Promise((resolveDone) => {
      this.#resolveDone = resolveDone;
    });
  }
  attachSignals() {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        void this.stop(0);
      };
      process.on(signal, handler);
      this.#signalHandlers.push([signal, handler]);
    }
  }
  start(
    label,
    command,
    args,
    { cwd, env = process.env, interactive = false, finite = false } = {},
  ) {
    if (this.abort.signal.aborted) throw new Error("Đã dừng launcher.");
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      detached: !interactive,
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    this.#children.add(child);
    if (!interactive) this.#isolatedGroups.add(child);
    const pipe = (stream, target) => {
      if (!stream) return;
      let pending = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines)
          target.write(`[${label}] ${redactOutput(line, env)}\n`);
      });
      stream.on("end", () => {
        if (pending) target.write(`[${label}] ${redactOutput(pending, env)}\n`);
      });
    };
    pipe(child.stdout, this.output);
    pipe(child.stderr, this.errorOutput);
    const finished = new Promise((resolveChild, rejectChild) => {
      child.once("error", () => {
        this.#children.delete(child);
        const error = new Error(
          `${label}: không khởi động được chương trình. Kiểm dependencies/PATH và chạy pnpm install --frozen-lockfile nếu cần.`,
        );
        rejectChild(error);
        if (!finite) {
          this.errorOutput.write(`${error.message}\n`);
          void this.stop(1);
        }
      });
      child.once("exit", (code, signal) => {
        this.#children.delete(child);
        if (this.abort.signal.aborted) resolveChild();
        else if (finite && code === 0) resolveChild();
        else if (interactive && code === 0) {
          resolveChild();
          void this.stop(0);
        } else {
          const error = new Error(
            `${label} đã dừng (exit ${code ?? signal}). Xem log có nhãn phía trên.`,
          );
          rejectChild(error);
          if (!finite) {
            this.errorOutput.write(`${error.message}\n`);
            void this.stop(code || 1);
          }
        }
      });
    });
    // Long-running processes report failures through done; never leak an unhandled rejection.
    if (!finite) finished.catch(() => {});
    return finished;
  }
  async stop(code = 0) {
    if (this.#stopping) return this.#stopping;
    this.abort.abort();
    this.#stopping = (async () => {
      await Promise.all(
        [...this.#children].map((child) => this.#stopChild(child)),
      );
      for (const [signal, handler] of this.#signalHandlers)
        process.off(signal, handler);
      this.#resolveDone(code);
      return code;
    })();
    return this.#stopping;
  }
  async #stopChild(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    if (process.platform === "win32") {
      // Only PIDs created by this instance. No port/name-based taskkill and no shell.
      await new Promise((resolveKill) => {
        const executable = process.env.SystemRoot
          ? resolve(process.env.SystemRoot, "System32/taskkill.exe")
          : "taskkill.exe";
        const killer = spawn(
          executable,
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        killer.once("error", resolveKill);
        killer.once("exit", resolveKill);
      });
      return;
    }
    let descendants = [];
    if (!this.#isolatedGroups.has(child)) {
      // An interactive Expo process shares the terminal foreground group. Never
      // signal that entire group: it also contains the caller's shell.
      try {
        const { stdout } = await promisify(execFile)(
          "ps",
          ["-A", "-o", "pid=", "-o", "ppid="],
          { maxBuffer: 2_000_000 },
        );
        const rows = stdout
          .trim()
          .split(/\n/)
          .map((line) => line.trim().split(/\s+/).map(Number));
        const owned = new Set([child.pid]);
        for (let previous = 0; previous !== owned.size;) {
          previous = owned.size;
          for (const [pid, parent] of rows)
            if (owned.has(parent)) owned.add(pid);
        }
        descendants = [...owned].filter((pid) => pid !== child.pid).reverse();
      } catch {
        this.errorOutput.write(
          "Không đọc được cây tiến trình của Expo; kiểm ps trong môi trường phát triển.\n",
        );
      }
    }
    const kill = (signal) => {
      if (!this.#isolatedGroups.has(child)) {
        for (const pid of descendants) {
          try {
            process.kill(pid, signal);
          } catch {
            /* Descendant already stopped. */
          }
        }
        try {
          child.kill(signal);
        } catch {
          /* Root already stopped. */
        }
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* Child already stopped. */
        }
      }
    };
    kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveDelay) => setTimeout(resolveDelay, this.graceMs)),
    ]);
    // Children can outlive their root. The isolated process group remains ours.
    kill("SIGKILL");
  }
}

export async function waitForApi(port, signal, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/ready`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
      );
      if (response.ok) return;
    } catch {
      /* Compiler/connection may still be starting. */
    }
    await new Promise((resolveWait) => {
      const timer = setTimeout(done, 300);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolveWait();
      }
      signal.addEventListener("abort", done, { once: true });
    });
  }
  if (!signal.aborted)
    throw new Error(
      "API chưa sẵn sàng sau 120 giây. Kiểm log [api], tài khoản MongoDB và migration; launcher không tự migrate/seed.",
    );
}

export class ApiConnectionLostError extends Error {}

// Nest's watch process can remain alive after its HTTP child exits. Allow normal
// compilation downtime; an HTTP 503 still proves the listener is alive (DB outage
// must not cause an endless series of process restarts).
export async function watchApiConnection(
  port,
  signal,
  { outageMs = 45_000, intervalMs = 5000, requestTimeoutMs = 1500 } = {},
) {
  let unavailableSince;
  while (!signal.aborted) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/ready`,
        {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(requestTimeoutMs),
          ]),
        },
      );
      await response.body?.cancel();
      unavailableSince = undefined;
    } catch {
      if (signal.aborted) return;
      unavailableSince ??= performance.now();
      if (performance.now() - unavailableSince >= outageMs)
        throw new ApiConnectionLostError(
          "API mất kết nối liên tục; Nest watcher có thể còn chạy nhưng HTTP đã dừng.",
        );
    }
    try {
      await delay(intervalMs, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
