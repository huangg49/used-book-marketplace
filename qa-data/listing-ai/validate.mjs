import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDataset } from "./validator.mjs";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--write-report" && !a.startsWith("--dir=")))
  throw new Error("Use --dir=<dataset> and/or --write-report.");
const dir = path.resolve(
  args.find((a) => a.startsWith("--dir="))?.slice(6) ??
    fileURLToPath(new URL("./incoming", import.meta.url)),
);
try {
  const result = await validateDataset({ dir });
  if (args.includes("--write-report")) {
    // The fixed output parent must already be a physical directory inside the dataset.
    const root = await fs.realpath(dir),
      parent = await fs.realpath(path.join(root, "validation"));
    const rel = path.relative(root, parent);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
      throw new Error("Unsafe report directory");
    const report = path.join(parent, "report.json");
    try {
      if ((await fs.lstat(report)).isSymbolicLink())
        throw new Error("Report link rejected");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await fs.writeFile(report, JSON.stringify(result, null, 2) + "\n");
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
} catch {
  console.error(
    "Dataset validation could not complete; no acceptance result. Check dataset paths/dependencies.",
  );
  process.exitCode = 1;
}
