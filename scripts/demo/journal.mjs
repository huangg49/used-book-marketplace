import { randomUUID, createHash } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

export class ScenarioError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function writeJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

// One process owns this run. Never steal a lock from a possibly live runner.
export async function lockRun(directory) {
  const file = path.join(directory, "run.lock");
  let handle;
  try {
    handle = await open(file, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new ScenarioError(
      "RUN_LOCKED",
      "Run is locked; inspect run.lock and verify its process has stopped before removing that file.",
    );
  }
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, host: hostname() }),
  );
  await handle.sync();
  return async () => {
    await handle.close();
    await unlink(file);
  };
}

export async function openJournal(directory, binding) {
  const file = path.join(directory, "journal.json");
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new ScenarioError(
        "INVALID_JOURNAL",
        "Journal is unreadable; preserve it for investigation.",
      );
    data = { schema: 1, binding, steps: {} };
    await writeJson(file, data);
  }
  if (
    !data ||
    data.schema !== 1 ||
    data.binding !== binding ||
    !data.steps ||
    Array.isArray(data.steps) ||
    typeof data.steps !== "object"
  )
    throw new ScenarioError(
      "TARGET_CHANGED",
      "Journal does not belong to this sandbox/configuration.",
    );
  for (const step of Object.values(data.steps)) {
    if (
      !step ||
      !["pending", "acknowledged", "stopped"].includes(step.state) ||
      !/^[a-f0-9-]{36}$/.test(step.key) ||
      !/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(step.route) ||
      !["POST", "PUT"].includes(step.method) ||
      !["seller", "buyer", "reviewer", "operator"].includes(step.actor) ||
      !step.body ||
      typeof step.body !== "object" ||
      Array.isArray(step.body) ||
      step.fingerprint !== fingerprint(step, binding) ||
      (step.state === "acknowledged" && !step.receipt) ||
      (step.state === "stopped" && !Number.isInteger(step.httpStatus))
    )
      throw new ScenarioError(
        "INVALID_JOURNAL",
        "Journal contains an invalid intent; do not regenerate it.",
      );
  }
  return { data, save: () => writeJson(file, data) };
}

function fingerprint(intent, binding) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        binding,
        actor: intent.actor,
        route: intent.route,
        method: intent.method,
        key: intent.key,
        body: intent.body,
        kind: intent.kind ?? null,
      }),
    )
    .digest("hex");
}

export function receipt(value) {
  const uuid = (id) =>
    typeof id === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
  const validState =
    value?.state === null ||
    typeof value?.state === "string" ||
    (value?.state &&
      ["moderation", "visibility", "trade"].every(
        (key) => typeof value.state[key] === "string",
      ));
  if (
    !value ||
    !uuid(value.id) ||
    !uuid(value.entityId) ||
    !["Listing", "Catalog", "Media"].includes(value.entityType) ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !validState ||
    !(value.revisionId === null || uuid(value.revisionId)) ||
    typeof value.serverTime !== "string"
  )
    throw new ScenarioError(
      "INVALID_RECEIPT",
      "Command response is not a receipt; intent remains pending.",
    );
  // Never persist response payloads containing auth, private URLs or contact data.
  const state =
    value.state && typeof value.state === "object"
      ? Object.fromEntries(
          ["moderation", "visibility", "trade"].map((key) => [
            key,
            value.state[key],
          ]),
        )
      : value.state;
  return {
    id: value.id,
    entityType: value.entityType,
    entityId: value.entityId,
    version: value.version,
    revisionId: value.revisionId,
    state,
    serverTime: value.serverTime,
  };
}

export class Commands {
  constructor(
    journal,
    send,
    {
      attempts = 3,
      projectReceipt = receipt,
      delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    } = {},
  ) {
    this.journal = journal;
    this.send = send;
    this.attempts = attempts;
    this.delay = delay;
    this.projectReceipt = projectReceipt;
  }

  async execute(name, build) {
    let intent = this.journal.data.steps[name];
    if (!intent) {
      const request = await build();
      const key = request.key ?? randomUUID();
      if (
        typeof key !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          key,
        )
      )
        throw new ScenarioError(
          "INVALID_INTENT",
          "Command key must be a lowercase UUID.",
        );
      intent = { ...request, key, state: "pending" };
      intent.fingerprint = fingerprint(intent, this.journal.data.binding);
      this.journal.data.steps[name] = intent;
      await this.journal.save(); // The request must survive a crash before any write.
    }
    if (intent.state === "stopped")
      throw new ScenarioError(
        "COMMAND_STOPPED",
        `Step ${name} was rejected; inspect its status before choosing a new run.`,
        intent.httpStatus,
      );
    if (intent.state === "acknowledged")
      return this.projectReceipt(intent.receipt);
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        const result = this.projectReceipt(await this.send(intent));
        intent.receipt = result;
        intent.state = "acknowledged";
        await this.journal.save();
        return result;
      } catch (error) {
        // Timeout/5xx is an uncertain outcome. Every retry keeps key/body/version.
        if (error.status && error.status !== 408 && error.status < 500) {
          intent.state = "stopped";
          intent.httpStatus = error.status;
          await this.journal.save();
          throw new ScenarioError(
            "COMMAND_REJECTED",
            `Step ${name} rejected (HTTP ${error.status}); no later steps were run.`,
            error.status,
          );
        }
        if (
          !(error instanceof ScenarioError) ||
          !["HTTP_UNCERTAIN", "INVALID_RECEIPT"].includes(error.code)
        )
          throw error;
        if (attempt === this.attempts)
          throw new ScenarioError(
            "ACK_UNCERTAIN",
            `Step ${name} has no confirmed receipt; rerun with the same directory.`,
          );
        await this.delay(attempt * 250);
      }
    }
  }
}
