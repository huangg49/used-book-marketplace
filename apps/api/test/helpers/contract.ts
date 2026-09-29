import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// Validates response bodies against the shared OpenAPI component schemas.
export const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'contract', components: contract.components });
export function validates(schema: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `contract#/components/schemas/${schema}`,
  });
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
}
