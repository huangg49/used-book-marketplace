import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  repoRoot,
  checkNode,
  readEnvironment,
  apiConfiguration,
  assertPortAvailable,
  acquireLock,
  ProcessGroup,
  waitForApi,
  watchApiConnection,
  ApiConnectionLostError,
} from "./dev-runtime.mjs";

export async function startApi(root = repoRoot) {
  await checkNode(root);
  const rootEnv = await readEnvironment(resolve(root, ".env"));
  const apiEnv = await readEnvironment(resolve(root, "apps/api/.env"));
  const config = apiConfiguration(rootEnv, apiEnv);
  const release = await acquireLock(root, "api");
  let group = new ProcessGroup();
  group.attachSignals();
  try {
    for (let recovery = 0; ; recovery++) {
      try {
        await assertPortAvailable(config.port, "API");
        const app = resolve(root, "apps/api");
        const require = createRequire(resolve(app, "package.json"));
        const nest = require.resolve("@nestjs/cli/bin/nest.js");
        console.log(
          "[dev] Đang bật MongoDB local; dữ liệu/volume hiện có được giữ lại.",
        );
        await group.start(
          "mongo",
          "docker",
          [
            "compose",
            "--env-file",
            ".env",
            "-f",
            "infra/docker-compose.yml",
            "up",
            "-d",
            "--wait",
            "mongo",
          ],
          { cwd: root, env: config.composeEnv, finite: true },
        );
        if (group.abort.signal.aborted) return await group.done;
        // Exactly one Nest compiler: workers use the emitted code once API is ready.
        group.start(
          "api",
          process.execPath,
          [nest, "start", "--watch", "--no-shell", "--preserveWatchOutput"],
          { cwd: app, env: config.env },
        );
        await waitForApi(config.port, group.abort.signal);
        if (group.abort.signal.aborted) return await group.done;
        group.start("media", process.execPath, ["dist/media-worker.js"], {
          cwd: app,
          env: config.env,
        });
        group.start("orders", process.execPath, ["dist/order-worker.js"], {
          cwd: app,
          env: config.env,
        });
        console.log(
          `[dev] API sẵn sàng ở http://localhost:${config.port}/api/v1; worker ảnh/đơn hàng chạy cùng terminal.`,
        );
        if (!config.mediaConfigured)
          console.log(
            "[dev] Supabase chưa cấu hình: xem sách/đăng nhập vẫn chạy, upload ảnh chưa sẵn sàng.",
          );
        console.log(
          "[dev] API tự reload. Sau khi sửa code worker, Ctrl+C rồi chạy lại pnpm dev:api.",
        );
        console.log(
          "[dev] Ctrl+C dừng các tiến trình của terminal này; MongoDB/Docker tiếp tục chạy.",
        );
        await watchApiConnection(config.port, group.abort.signal);
        return await group.done;
      } catch (error) {
        if (
          !(error instanceof ApiConnectionLostError) ||
          group.abort.signal.aborted ||
          recovery >= 3
        )
          throw error;
        console.error(
          `[dev] ${error.message} Khởi động lại API và worker (${recovery + 1}/3).`,
        );
        await group.stop(1);
        group = new ProcessGroup();
        group.attachSignals();
      }
    }
  } catch (error) {
    if (!group.abort.signal.aborted) console.error(`[dev] ${error.message}`);
    return await group.stop(group.abort.signal.aborted ? 0 : 1);
  } finally {
    await release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await startApi();
  } catch (error) {
    console.error(`[dev] ${error.message}`);
    process.exitCode = 1;
  }
}
