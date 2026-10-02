import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  repoRoot,
  checkNode,
  readEnvironment,
  mobileEnvironment,
  assertPortAvailable,
  portNumber,
  acquireLock,
  ProcessGroup,
} from "./dev-runtime.mjs";

export function metroOptions(args) {
  const allowed = ["--android", "--web", "--clear"];
  const portIndex = args.indexOf("--port");
  const port = portNumber(
    portIndex >= 0 ? args[portIndex + 1] : 8081,
    "--port",
  );
  const extras = args.filter(
    (arg, index) =>
      arg !== "--" &&
      arg !== "--port" &&
      !(portIndex >= 0 && index === portIndex + 1),
  );
  if (extras.some((arg) => !allowed.includes(arg)))
    throw new Error(
      "dev:rn nhận --android, --web, --clear và --port <số>. Điện thoại thật dùng pnpm --filter @used-books/mobile-react-native exec expo start --dev-client --lan và URL LAN.",
    );
  return { port, extras };
}

export async function startMobile(
  root = repoRoot,
  args = process.argv.slice(2),
) {
  await checkNode(root);
  const app = resolve(root, "apps/mobile-react-native");
  const fileEnv = await readEnvironment(resolve(app, ".env"));
  const env = mobileEnvironment(fileEnv);
  // Preserve Expo's terminal controls. Only documented launcher flags are accepted.
  const { port, extras } = metroOptions(args);
  const release = await acquireLock(root, "rn");
  const group = new ProcessGroup();
  group.attachSignals();
  try {
    await assertPortAvailable(port, "Metro");
    const require = createRequire(resolve(app, "package.json"));
    const expo = resolve(
      dirname(require.resolve("expo/package.json")),
      "bin/cli",
    );
    try {
      require.resolve("expo-dev-client/package.json");
    } catch {
      throw new Error(
        "Thiếu expo-dev-client. Chạy pnpm install --frozen-lockfile rồi build/cài development APK một lần theo TEAM_WINDOWS.",
      );
    }
    // Expo resolves Android SDK from these variables; support the default Windows install.
    if (
      process.platform === "win32" &&
      !env.ANDROID_HOME &&
      !env.ANDROID_SDK_ROOT &&
      env.LOCALAPPDATA
    ) {
      const { existsSync } = await import("node:fs");
      const sdk = resolve(env.LOCALAPPDATA, "Android/Sdk");
      if (existsSync(sdk)) env.ANDROID_HOME = sdk;
    }
    console.log(
      "[dev] Bấm A để mở Android development APK, W để mở web. Build/cài APK chỉ cần lần đầu hoặc khi đổi phần native.",
    );
    console.log(
      "[dev] URL API Android/web chọn riêng theo cấu hình public; dev:rn không khởi động backend.",
    );
    group.start(
      "expo",
      process.execPath,
      [
        "--dns-result-order=ipv4first",
        expo,
        "start",
        "--dev-client",
        "--localhost",
        "--port",
        String(port),
        ...extras,
      ],
      { cwd: app, env, interactive: true },
    );
    return await group.done;
  } catch (error) {
    if (!group.abort.signal.aborted) console.error(`[dev] ${error.message}`);
    return await group.stop(group.abort.signal.aborted ? 0 : 1);
  } finally {
    await release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await startMobile();
  } catch (error) {
    console.error(`[dev] ${error.message}`);
    process.exitCode = 1;
  }
}
