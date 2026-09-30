import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  root,
  initialize,
  readConfig,
  createSandbox,
} from "./demo/sandbox.mjs";
import { ScenarioError, lockRun, writeJson } from "./demo/journal.mjs";
import { runOrders } from "./demo/orders.mjs";
import { runTransit } from "./demo/transit.mjs";

let sandbox, unlock, directory, action;
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "fixture-storage": { type: "boolean", default: false },
      "in-transit": { type: "boolean", default: false },
      port: { type: "string", default: "3020" },
    },
  });
  [action] = positionals;
  const name = positionals[1];
  if (
    !["init", "run", "serve"].includes(action) ||
    !/^[a-z0-9][a-z0-9-]{1,40}$/.test(name ?? "") ||
    positionals.length !== 2
  )
    throw new ScenarioError(
      "USAGE",
      "Usage: pnpm demo:orders <init|run|serve> <name> [--fixture-storage] [--in-transit] [--port 3020]",
    );
  if (
    action !== "init" &&
    (values["fixture-storage"] ||
      values["in-transit"] ||
      values.port !== "3020")
  )
    throw new ScenarioError(
      "USAGE",
      "Storage/port are fixed at init; use the saved order configuration.",
    );
  directory = path.join(root, ".tmp", "demo", name);
  await mkdir(directory, { recursive: true });
  unlock = await lockRun(directory);
  if (action === "init") {
    await initialize(directory, {
      fixture: values["fixture-storage"],
      port: Number(values.port),
      orders: true,
      transit: values["in-transit"],
    });
    console.log(
      `Order scenario initialized: ${name}. Keep private.json local; contacts are explicitly simulated.`,
    );
  } else {
    const config = await readConfig(directory);
    if (!config.orders)
      throw new ScenarioError(
        "ORDERS_DISABLED",
        "Initialize a new order run; existing book/funding runs cannot be repurposed.",
      );
    if (action === "run")
      await writeJson(path.join(directory, "orders-outcome.json"), {
        status: "RUNNING",
        at: new Date().toISOString(),
      });
    sandbox = await createSandbox(config, directory);
    if (action === "run") {
      const manifest = await (config.orders.transit ? runTransit : runOrders)(
        config,
        directory,
        sandbox,
        {
          onStep: (name, state) => console.log(`${name}: ${state}`),
        },
      );
      await writeJson(path.join(directory, "orders-outcome.json"), {
        status: "PASS",
        at: manifest.completedAt,
        storage: manifest.storage,
      });
      console.log(
        `H01b Order PASS: AwaitingPayment / PendingSellerConfirmation / Preparing${config.orders.transit ? " / InTransit" : ""}; available=${manifest.wallet.available}, held=${manifest.wallet.held} VND simulated. ${manifest.storage}.`,
      );
    } else {
      console.log(
        `Order demo API: ${sandbox.base}; storage=${config.storage}. Ctrl+C stops this API without database/object cleanup.`,
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
  console.error(
    `${code}: ${error instanceof ScenarioError ? error.message : "Order scenario stopped; inspect private configuration, build and ports without exposing credentials or contact data."}`,
  );
  if (unlock && action === "run")
    await writeJson(path.join(directory, "orders-outcome.json"), {
      status: "BLOCKED",
      code,
      at: new Date().toISOString(),
    }).catch(() => {});
  process.exitCode = 1;
} finally {
  await sandbox?.close();
  await unlock?.();
}
