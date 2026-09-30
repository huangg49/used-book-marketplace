import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { lockRun, ScenarioError, writeJson } from "./demo/journal.mjs";
import {
  root,
  initialize,
  readConfig,
  createSandbox,
} from "./demo/sandbox.mjs";
import { runBooks } from "./demo/books.mjs";

let unlock, sandbox, directory, action;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "fixture-storage": { type: "boolean", default: false },
      port: { type: "string", default: "3012" },
    },
  });
  const [requestedAction, name] = positionals;
  action = requestedAction;
  if (
    !["init", "run", "serve"].includes(action) ||
    !/^[a-z0-9][a-z0-9-]{1,40}$/.test(name ?? "") ||
    positionals.length !== 2
  )
    throw new ScenarioError(
      "USAGE",
      "Usage: pnpm demo:books <init|run|serve> <name> [--fixture-storage] [--port 3012]",
    );
  if (
    action !== "init" &&
    (values["fixture-storage"] || values.port !== "3012")
  )
    throw new ScenarioError(
      "USAGE",
      "Storage/port options apply only to init; a run keeps its saved configuration.",
    );
  directory = path.join(root, ".tmp", "demo", name);
  await mkdir(directory, { recursive: true });
  unlock = await lockRun(directory);
  if (action === "init") {
    await initialize(directory, {
      fixture: values["fixture-storage"],
      port: Number(values.port),
    });
    console.log(
      `Initialized ${name}. Private credentials are in .tmp/demo/${name}/private.json; never share or commit that file.`,
    );
  } else {
    const config = await readConfig(directory);
    if (action === "run")
      await writeJson(path.join(directory, "outcome.json"), {
        status: "RUNNING",
        at: new Date().toISOString(),
      });
    sandbox = await createSandbox(config, directory);
    if (action === "run") {
      const manifest = await runBooks(config, directory, sandbox, {
        onStep: (step, state) =>
          console.log(`${step}: ${JSON.stringify(state)}`),
      });
      await writeJson(path.join(directory, "outcome.json"), {
        status: "PASS",
        storage: manifest.storage,
        at: manifest.completedAt,
      });
      console.log(
        `H01a ${manifest.status}; ${manifest.storage}. Manifest: .tmp/demo/${name}/manifest.json`,
      );
    } else {
      console.log(
        `Managed demo API: ${sandbox.base}. Storage: ${config.storage}. Stop with Ctrl+C; no database or object cleanup occurs.`,
      );
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    }
  }
} catch (error) {
  const code =
    error instanceof ScenarioError
      ? error.code
      : error.code === "EEXIST"
        ? "ALREADY_INITIALIZED"
        : "RUNTIME_BLOCKED";
  const message =
    error instanceof ScenarioError
      ? error.message
      : "Run could not continue. Verify QA MongoDB, API build, private storage config and port availability; private runtime errors are not printed.";
  console.error(`${code}: ${message}`);
  if (unlock && action === "run")
    await writeJson(path.join(directory, "outcome.json"), {
      status: "BLOCKED",
      code,
      at: new Date().toISOString(),
    }).catch(() => {});
  process.exitCode = 1;
} finally {
  await sandbox?.close();
  await unlock?.();
}
