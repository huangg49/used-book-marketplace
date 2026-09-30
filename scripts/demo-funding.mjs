import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  root,
  initialize,
  readConfig,
  createSandbox,
} from "./demo/sandbox.mjs";
import { lockRun, ScenarioError, writeJson } from "./demo/journal.mjs";
import { runFunding } from "./demo/funding.mjs";

let sandbox, unlock, directory, action;
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "fixture-storage": { type: "boolean", default: false },
      port: { type: "string", default: "3016" },
    },
  });
  [action] = positionals;
  const name = positionals[1];
  if (
    !["init", "run"].includes(action) ||
    !/^[a-z0-9][a-z0-9-]{1,40}$/.test(name ?? "") ||
    positionals.length !== 2
  )
    throw new ScenarioError(
      "USAGE",
      "Usage: pnpm demo:funding <init|run> <name> [--fixture-storage] [--port 3016]",
    );
  directory = path.join(root, ".tmp", "demo", name);
  await mkdir(directory, { recursive: true });
  unlock = await lockRun(directory);
  if (action === "init") {
    await initialize(directory, {
      fixture: values["fixture-storage"],
      port: Number(values.port),
      funding: true,
    });
    console.log(
      `Opt-in funding sandbox initialized: ${name}. Private configuration must stay local.`,
    );
  } else {
    if (values["fixture-storage"] || values.port !== "3016")
      throw new ScenarioError(
        "USAGE",
        "Storage/port are saved at init; do not change them on run.",
      );
    const config = await readConfig(directory);
    if (!config.fundingSecret)
      throw new ScenarioError(
        "FUNDING_DISABLED",
        "Use a new opt-in funding run; do not enable the simulator on an existing book run.",
      );
    await writeJson(path.join(directory, "funding-outcome.json"), {
      status: "RUNNING",
      at: new Date().toISOString(),
    });
    sandbox = await createSandbox(config, directory);
    const manifest = await runFunding(config, directory, sandbox);
    await writeJson(path.join(directory, "funding-outcome.json"), {
      status: "PASS",
      at: manifest.completedAt,
    });
    console.log(
      `H01b funding PASS: simulated ${manifest.amount} VND; ledger balanced, finite source conserved. Order scenarios remain open.`,
    );
  }
} catch (error) {
  const code = error instanceof ScenarioError ? error.code : "RUNTIME_BLOCKED";
  console.error(
    `${code}: ${error instanceof ScenarioError ? error.message : "Funding could not continue; inspect the private environment/build/port without exposing credentials."}`,
  );
  if (unlock && action === "run")
    await writeJson(path.join(directory, "funding-outcome.json"), {
      status: "BLOCKED",
      code,
      at: new Date().toISOString(),
    }).catch(() => {});
  process.exitCode = 1;
} finally {
  await sandbox?.close();
  await unlock?.();
}
