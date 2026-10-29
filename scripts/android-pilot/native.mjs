import { execFileSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { assert } from "./fixtures.mjs";

export function blankPilotInput(label, text) {
  const placeholders = label === "Email"
    ? ["ban@example.com", "nguyentuan@latlai.vn"]
    : label === "Mật khẩu" ? ["Nhập mật khẩu", "Nhập mật khẩu của bạn"] : [];
  return ["Email", "Mật khẩu"].includes(label) && (!text || placeholders.includes(text));
}

export function fillLogin(config, serial, actor = "buyer") {
  assert(["buyer", "seller"].includes(actor), "Use a QA Member identity.");
  assert(
    /^emulator-\d+$/.test(serial ?? ""),
    "Specify one Android emulator serial.",
  );
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : "");
  const adb = path.join(
    sdk,
    "platform-tools",
    process.platform === "win32" ? "adb.exe" : "adb",
  );
  assert(existsSync(adb), "Set ANDROID_HOME to the Android SDK.");
  // Suppress adb exceptions: input commands contain private QA credentials.
  const run = (args) => {
    try {
      return execFileSync(adb, ["-s", serial, ...args], {
        windowsHide: true,
        timeout: 15000,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();
    } catch {
      throw new Error(
        "QA login input failed; no private command details printed.",
      );
    }
  };
  const nodes = () => {
    run(["shell", "uiautomator", "dump", "/sdcard/latlai-pilot-login.xml"]);
    return [
      ...run(["exec-out", "cat", "/sdcard/latlai-pilot-login.xml"]).matchAll(
        /<node\b[^>]*>/g,
      ),
    ].map((match) =>
      Object.fromEntries(
        [...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
      ),
    );
  };
  const current = nodes();
  const loginInputs = current.filter(
    (n) => n.package === "com.huangg49.mobilereactnative" && n.class.includes("EditText"),
  );
  assert(
    loginInputs.length === 2 &&
      ["Email", "Mật khẩu"].every(label => loginInputs.some(n => n["content-desc"] === label)) &&
      current.some(n => n.package === "com.huangg49.mobilereactnative" &&
        (n.text === "Đăng nhập" || n["content-desc"] === "Đăng nhập")),
    "Open the Lật lại login form first.",
  );
  for (const [label, value] of [
    ["Email", config.accounts[actor].email],
    ["Mật khẩu", config.accounts[actor].password],
  ]) {
    const inputs = nodes().filter(
      (n) => n.class.includes("EditText") && n["content-desc"] === label,
    );
    assert(
      inputs.length === 1 && blankPilotInput(label, inputs[0].text),
      "Use a fresh blank QA login form.",
    );
    const bounds = inputs[0].bounds.match(/\d+/g).map(Number);
    assert(
      bounds[2] > bounds[0] && bounds[3] > bounds[1],
      "Login input must be visible.",
    );
    run([
      "shell",
      "input",
      "tap",
      String(Math.floor((bounds[0] + bounds[2]) / 2)),
      String(Math.floor((bounds[1] + bounds[3]) / 2)),
    ]);
    run(["shell", "input", "text", value]);
    run(["shell", "input", "keyevent", "4"]);
  }
  console.log(
    "QA fields filled locally. Press Đăng nhập; do not capture credentials.",
  );
}
