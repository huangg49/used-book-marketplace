// Structural contract check; does not prove authorization or business behavior.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "apps/api/package.json"));
const ts = require("typescript");
const contract = require("yaml").parse(
  readFileSync(path.join(root, "packages/api-contract/openapi.yaml"), "utf8"),
);
const methods = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
]);
const expected = new Set(
  Object.entries(contract.paths).flatMap(([route, item]) =>
    Object.keys(item)
      .filter((method) => methods.has(method))
      .map((method) => `${method.toUpperCase()} ${route}`),
  ),
);
const actual = [];
let controllers = 0;
const decorators = (node) =>
  ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
function routeDecorator(decorator) {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) return null;
  const name = expression.expression.getText();
  if (name !== "Controller" && !methods.has(name.toLowerCase())) return null;
  const argument = expression.arguments[0];
  if (argument && !ts.isStringLiteral(argument))
    throw new Error(
      `Unsupported ${name} route expression; extend the route audit before using dynamic routes.`,
    );
  return { name, value: argument?.text || "" };
}
const source = path.join(root, "apps/api/src");
for (const relative of readdirSync(source, { recursive: true }).filter((file) =>
  file.endsWith(".controller.ts"),
)) {
  const file = path.join(source, relative);
  const ast = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const node of ast.statements) {
    if (!ts.isClassDeclaration(node)) continue;
    const prefix = decorators(node)
      .map(routeDecorator)
      .find((item) => item?.name === "Controller");
    if (!prefix) continue;
    controllers++;
    for (const member of node.members) {
      for (const decorator of decorators(member)) {
        const route = routeDecorator(decorator);
        if (!route || !methods.has(route.name.toLowerCase())) continue;
        const url = (
          "/" + [prefix.value, route.value].filter(Boolean).join("/")
        ).replace(/:(\w+)/g, "{$1}");
        actual.push(`${route.name.toUpperCase()} ${url}`);
      }
    }
  }
}
const handlers = new Set(actual);
const missing = [...expected].filter((route) => !handlers.has(route));
const undocumented = [...handlers].filter((route) => !expected.has(route));
const duplicates = actual.filter(
  (route, index) => actual.indexOf(route) !== index,
);
if (
  missing.length ||
  undocumented.length ||
  duplicates.length ||
  !controllers
) {
  console.error(
    JSON.stringify({ missing, undocumented, duplicates, controllers }, null, 2),
  );
  process.exitCode = 1;
} else {
  console.log(
    `OpenAPI ${contract.info.version}: ${expected.size} operations match ${controllers} controllers; no missing, extra or duplicate routes.`,
  );
}
