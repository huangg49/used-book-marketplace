import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  initialize,
  readConfig,
  createSandbox,
  root,
} from "./demo/sandbox.mjs";
import { lockRun, ScenarioError } from "./demo/journal.mjs";
import {
  actorHttp,
  assert,
  prepareFixtures,
  resetWishlist,
  seedPagination,
} from "./android-pilot/fixtures.mjs";
import { startProxy } from "./android-pilot/proxy.mjs";
import { fillLogin } from "./android-pilot/native.mjs";
import { createHttp } from "./demo/http.mjs";
import { runMetro } from "./android-pilot/metro.mjs";

let sandbox, closeProxy, unlock;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      paging: { type: "boolean", default: false },
      device: { type: "string" },
      actor: { type: "string", default: "buyer" },
    },
  });
  const [action, name] = positionals;
  assert(
    [
      "serve",
      "metro",
      "stop",
      "status",
      "reset",
      "login",
      "seed-pagination",
      "trace-reset",
      "fault-none",
      "fault-read",
      "fault-save",
      "fault-remove",
    ].includes(action) &&
      /^[a-z0-9][a-z0-9-]{1,40}$/.test(name ?? "") &&
      positionals.length === 2,
    "Usage: pnpm qa:android <serve|metro|stop|status|reset|login|seed-pagination|trace-reset|fault-none|fault-read|fault-save|fault-remove> <name> [--paging] [--device emulator-N] [--actor buyer|seller]",
  );
  assert(
    !values.paging || action === "serve",
    "--paging applies only to serve.",
  );
  assert(
    !values.device || action === "login",
    "--device applies only to login.",
  );
  assert(
    ["buyer", "seller"].includes(values.actor) &&
      (values.actor === "buyer" || action === "login"),
    "--actor seller applies only to login.",
  );
  const directory = path.join(root, ".tmp", "demo", name);
  if (action === "serve") {
    await mkdir(directory, { recursive: true });
    unlock = await lockRun(directory);
    // Check all owned ports before database provisioning or media fixture startup.
    for (const port of [3046, 3047, 3048]) {
      const probe = createServer();
      await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(port, "127.0.0.1", resolve);
      });
      await new Promise((resolve) => probe.close(resolve));
    }
    try {
      await access(path.join(directory, "private.json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await initialize(directory, { fixture: true, port: 3046 });
    }
    const config = await readConfig(directory);
    assert(
      config.storage === "fixture" && config.port === 3046,
      "Only this isolated fixture runner is supported.",
    );
    await unlink(path.join(directory, "stop")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await writeFile(path.join(directory, "fault"), "none");
    sandbox = await createSandbox(config, directory);
    const manifest = await prepareFixtures(
      config,
      directory,
      sandbox,
      values.paging,
    );
    if (values.paging && !manifest.reused)
      await seedPagination(config, sandbox, manifest, "seller");
    else if (values.paging)
      console.log(
        "Reusing paging dataset; wishlist preserved, seed not repeated.",
      );
    closeProxy = await startProxy(config, directory, manifest);
    console.log(
      `READY: ${name}; API3046/media3047/proxy3048; FAKE storage; private *_test database. Keep this terminal open.`,
    );
    console.log(
      `Stop safely from another terminal: pnpm qa:android stop ${name}`,
    );
    await new Promise((resolve) => {
      let timer;
      const finish = () => {
        clearInterval(timer);
        process.off("SIGINT", finish);
        process.off("SIGTERM", finish);
        resolve();
      };
      process.once("SIGINT", finish);
      process.once("SIGTERM", finish);
      timer = setInterval(() => {
        void access(path.join(directory, "stop"))
          .then(finish)
          .catch(() => {});
      }, 1000);
    });
  } else {
    const config = await readConfig(directory);
    assert(
      config.storage === "fixture" && config.port === 3046,
      "Only this isolated fixture runner is supported.",
    );
    if (action === "metro") await runMetro(directory);
    else if (action === "stop") {
      await writeFile(path.join(directory, "stop"), "stop");
      await writeFile(path.join(directory, "metro-stop"), "stop");
    } else if (action === "login")
      fillLogin(config, values.device, values.actor);
    else if (action === "trace-reset")
      await writeFile(path.join(directory, "membership-trace.ndjson"), "");
    else if (action.startsWith("fault-"))
      await writeFile(path.join(directory, "fault"), action.slice(6));
    else {
      const context = {
        base: `http://127.0.0.1:${config.port}/api/v1`,
        tokens: {},
      };
      if (action === "reset")
        await resetWishlist(await actorHttp(config, context));
      else if (action === "seed-pagination") {
        const manifest = JSON.parse(
          await readFile(path.join(directory, "pilot-fixtures.json"), "utf8"),
        );
        const { bindingFor } = await import("./demo/sandbox.mjs");
        assert(
          manifest.binding === bindingFor(config),
          "Fixture manifest belongs to a different dataset.",
        );
        await seedPagination(config, context, manifest, "seller");
      } else {
        const manifest = JSON.parse(
          await readFile(path.join(directory, "pilot-fixtures.json"), "utf8"),
        );
        const detail = await createHttp(
          context.base,
          context.tokens,
        )(`/listings/${manifest.target}`);
        assert(
          detail.id === manifest.target,
          "Public target differs from this sandbox.",
        );
        console.log(
          "READY: this sandbox's public target is available. No login attempt consumed.",
        );
      }
    }
    console.log(`QA action complete: ${action}. Private details suppressed.`);
  }
} catch (error) {
  console.error(
    error instanceof ScenarioError
      ? `${error.code}: ${error.message}`
      : "QA_BLOCKED: check QA Mongo/API build, port availability and emulator; private error details suppressed.",
  );
  process.exitCode = 1;
} finally {
  for (const cleanup of [closeProxy, sandbox?.close, unlock]) {
    try {
      await cleanup?.();
    } catch {
      console.error(
        "QA cleanup incomplete; inspect owned process/lock locally. Private details suppressed.",
      );
      process.exitCode = 1;
    }
  }
}
