// Exercise preflight with AI disabled, and budget behavior against a local fake.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync, execFile } from "node:child_process";
import { createServer } from "node:http";
const root = fileURLToPath(new URL("../../", import.meta.url));
const api = path.join(root, "apps/api");
const req = createRequire(path.join(api, "package.json"));
const sharp = req("sharp");
test("autofill CLI rejects invalid inputs before provider access", async (t) => {
  const parent = await fs.realpath(
    await fs
      .mkdir(path.join(root, ".tmp"), { recursive: true })
      .then(() => path.join(root, ".tmp")),
  );
  const temp = await fs.mkdtemp(path.join(parent, "listing-ai-cli-"));
  const dir = path.join(temp, "corpus");
  await fs.mkdir(dir);
  const photo = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  await fs.writeFile(path.join(dir, "front.jpg"), photo);
  await fs.writeFile(path.join(temp, "outside.jpg"), photo);
  const one = {
    id: "book",
    photos: ["front.jpg"],
    expected: { title: "Book", authors: [], isbn: null },
  };
  const run = (args = []) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(req.resolve("tsx")).href,
        "eval/autofill-assist/run.ts",
        "--dir",
        dir,
        ...args,
      ],
      {
        cwd: api,
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
        env: {
          ...process.env,
          AUTOFILL_ENABLED: "false",
          AUTOFILL_API_KEY: "",
        },
      },
    );
  const write = (cases) =>
    fs.writeFile(
      path.join(dir, "cases.json"),
      JSON.stringify({ source: "synthetic", cases }),
    );
  try {
    await t.test(
      "valid images reach disabled configuration, without calls",
      async () => {
        await write([one]);
        assert.equal(run().status, 2);
      },
    );
    for (const [label, cases, args, message] of [
      ["unknown selection", [one], ["--only", "absent"], "Unknown --only"],
      ["missing selection value", [one], ["--only"], "requires a value"],
      ["duplicate case IDs", [one, one], [], "Duplicate case IDs"],
      ["empty corpus", [], [], "non-empty"],
      [
        "photo escapes physical root",
        [{ ...one, photos: ["../outside.jpg"] }],
        [],
        "Photo outside",
      ],
      ["missing photo", [{ ...one, photos: ["absent.jpg"] }], [], "ENOENT"],
      [
        "missing answer",
        [{ ...one, expected: { title: "" } }],
        [],
        "expected title",
      ],
      ["non-positive budget", [one], ["--max-usd", "0"], "finite positive"],
    ]) {
      await t.test(label, async () => {
        await write(cases);
        const r = run(args);
        assert.equal(r.status, 1, r.error?.message);
        assert.ok(
          r.stderr.includes(message),
          "Expected preflight failure, not model configuration",
        );
      });
    }
    await t.test(
      "exhausted budget skips fallback and cannot report acceptance",
      async () => {
        await write([one]);
        let calls = 0,
          saved;
        const server = createServer((request, response) => {
          request.resume();
          calls++;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              usage: { prompt_tokens: 1000000, completion_tokens: 0 },
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({ title: null, authors: [] }),
                  },
                },
              ],
            }),
          );
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
          const r = await new Promise((resolve) =>
            execFile(
              process.execPath,
              [
                "--import",
                pathToFileURL(req.resolve("tsx")).href,
                "eval/autofill-assist/run.ts",
                "--dir",
                dir,
                "--max-usd",
                "0.001",
              ],
              {
                cwd: api,
                encoding: "utf8",
                windowsHide: true,
                timeout: 15000,
                env: {
                  ...process.env,
                  AUTOFILL_ENABLED: "true",
                  AUTOFILL_API_KEY: "qa-only-local-fake",
                  AUTOFILL_MODEL: "nvidia/nemotron-3.5-super-vl-120b-a12b",
                  AUTOFILL_FALLBACK_MODEL: "qa/fallback",
                  NVIDIA_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
                },
              },
              (error, stdout) => resolve({ code: error?.code ?? 0, stdout }),
            ),
          );
          saved = r.stdout.match(/Saved (.+)\r?\n/)?.[1].trim();
          assert.ok(saved);
          const outputRoot = path.join(
            api,
            "eval/autofill-assist/results/synthetic",
          );
          assert.equal(path.dirname(saved), outputRoot);
          assert.match(
            path.basename(saved),
            /^\d{4}-\d\d-\d\dT[\dTZ-]+\.json$/,
          );
          const result = JSON.parse(await fs.readFile(saved, "utf8"));
          assert.equal(r.code, 1);
          assert.equal(calls, 1);
          assert.equal(result.summary.tokens.input, 1000000);
          assert.equal(result.summary.costUsd, 1);
          assert.deepEqual(result.summary.skipped, [one.id]);
          assert.equal(result.results[0].failure, "BudgetBeforeFallback");
          assert.match(result.summary.meetsAdr0048, /NOT EVIDENCE/);
        } finally {
          await new Promise((resolve) => server.close(resolve));
          if (
            saved &&
            path.dirname(saved) ===
              path.join(api, "eval/autofill-assist/results/synthetic") &&
            /^\d{4}-\d\d-\d\dT[\dTZ-]+\.json$/.test(path.basename(saved))
          )
            await fs.unlink(saved);
        }
      },
    );
    await t.test("corrupt image fails before model configuration", async () => {
      await write([one]);
      await fs.writeFile(
        path.join(dir, "front.jpg"),
        Buffer.from([255, 216, 255, 217]),
      );
      const r = run();
      assert.equal(r.status, 1);
      assert.equal(r.stderr.includes("BLOCKED:"), false);
    });
  } finally {
    const real = await fs.realpath(temp),
      relative = path.relative(parent, real);
    assert.ok(
      relative.startsWith("listing-ai-cli-") &&
        !relative.includes(path.sep) &&
        !path.isAbsolute(relative),
    );
    await fs.rm(real, { recursive: true });
  }
});
