import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, unlink } from "node:fs/promises";
import path from "node:path";
import { root } from "../demo/sandbox.mjs";
import { createServer } from "node:net";

export async function runMetro(directory) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(8081, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  const stop = path.join(directory, "metro-stop");
  await unlink(stop).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  const require = createRequire(
    path.join(root, "apps/mobile-react-native/package.json"),
  );
  const child = spawn(
    process.execPath,
    [
      "--dns-result-order=ipv4first",
      require.resolve("expo/bin/cli"),
      "start",
      "--dev-client",
      "--localhost",
      "--port",
      "8081",
      "--max-workers",
      "2",
    ],
    {
      cwd: path.join(root, "apps/mobile-react-native"),
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3009/api/v1",
        EXPO_PUBLIC_DESIGN_PREVIEW: "0",
      },
    },
  );
  let timer;
  let stopping = false;
  const terminate = () => {
    stopping = true;
    child.kill("SIGTERM");
  };
  process.once("SIGINT", terminate);
  process.once("SIGTERM", terminate);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) =>
        code && !stopping
          ? reject(new Error("Metro exited unexpectedly."))
          : resolve(),
      );
      timer = setInterval(() => {
        void access(stop)
          .then(terminate)
          .catch(() => {});
      }, 1000);
    });
  } finally {
    clearInterval(timer);
    process.off("SIGINT", terminate);
    process.off("SIGTERM", terminate);
    if (child.exitCode === null) terminate();
  }
}
