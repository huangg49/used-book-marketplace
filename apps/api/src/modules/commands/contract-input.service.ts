import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { DomainError, invalidField, type Wire } from './domain-error.js';
import { validateClassification } from '../catalog/catalog-classification.js';

export function isbn13(input: string): string | null {
  const value = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) {
    const sum = [...value].reduce(
      (n, c, i) => n + (10 - i) * (c === 'X' ? 10 : Number(c)),
      0,
    );
    if (sum % 11) return null;
    const prefix = '978' + value.slice(0, 9);
    const total = [...prefix].reduce(
      (n, c, i) => n + Number(c) * (i % 2 ? 3 : 1),
      0,
    );
    return prefix + ((10 - (total % 10)) % 10);
  }
  if (!/^97[89]\d{10}$/.test(value)) return null;
  const sum = [...value].reduce(
    (n, c, i) => n + Number(c) * (i % 2 ? 3 : 1),
    0,
  );
  return sum % 10 ? null : value;
}
export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
export const likeLiteral = (text: string) => text.replace(/[\\%_]/g, '\\$&');
export function trimInput(value: unknown, depth = 0): unknown {
  if (depth > 20)
    throw new DomainError(
      400,
      'VALIDATION_ERROR',
      'Dữ liệu có cấu trúc không hợp lệ.',
    );
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((v) => trimInput(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, trimInput(v, depth + 1)]),
    );
  return value;
}

@Injectable()
export class ContractInput {
  private readonly ajv = new Ajv2020({ strict: false, allErrors: true });
  private readonly queries = new Ajv2020({ strict: false, coerceTypes: true });
  private readonly validators = new Map<string, ValidateFunction>();
  private readonly contract = parse(
    readFileSync(
      createRequire(import.meta.url).resolve(
        '@used-books/api-contract/openapi.yaml',
      ),
      'utf8',
    ),
  );
  constructor() {
    for (const ajv of [this.ajv, this.queries]) {
      addFormats.default(ajv);
      ajv.addSchema({
        $id: 'input-contract',
        components: this.contract.components,
      });
    }
  }
  uuid(value: unknown): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      throw new DomainError(
        400,
        'VALIDATION_ERROR',
        'Mã định danh hoặc Idempotency-Key không hợp lệ.',
      );
    return value.toLowerCase();
  }
  body<K extends keyof Wire>(name: K, raw: unknown): Wire[K] {
    const value = trimInput(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (
        record.metadata &&
        typeof record.metadata === 'object' &&
        !Array.isArray(record.metadata)
      ) {
        const metadata = record.metadata as Record<string, unknown>;
        if (typeof metadata.isbn === 'string') {
          const normalized = isbn13(metadata.isbn);
          if (!normalized)
            invalidField(
              '/metadata/isbn',
              'ISBN không đúng. Kiểm tra lại hoặc để trống nếu sách không có ISBN.',
            );
          metadata.isbn = normalized;
        }
        if (typeof metadata.language === 'string') {
          try {
            metadata.language = Intl.getCanonicalLocales(metadata.language)[0];
          } catch {
            invalidField(
              '/metadata/language',
              'Mã ngôn ngữ không hợp lệ, ví dụ vi hoặc en.',
            );
          }
        }
      }
      const normalizeIds = (obj: Record<string, unknown>) => {
        for (const [key, v] of Object.entries(obj)) {
          if (key.endsWith('Id') && typeof v === 'string')
            obj[key] = v.toLowerCase();
          if (
            ['mediaIds', 'packagingEvidenceIds'].includes(key) &&
            Array.isArray(v)
          )
            obj[key] = v.map((id) =>
              typeof id === 'string' ? id.toLowerCase() : id,
            );
        }
      };
      normalizeIds(record);
      if (record.content && typeof record.content === 'object')
        normalizeIds(record.content as Record<string, unknown>);
    }
    let validate = this.validators.get(name);
    if (!validate) {
      validate = this.ajv.compile({
        $ref: `input-contract#/components/schemas/${name}`,
      });
      this.validators.set(name, validate);
    }
    if (!validate(value)) {
      const errors: Wire['FieldError'][] = [];
      for (const error of validate.errors ?? []) {
        if (errors.length === 12) break;
        // Paths come from input keys; never echo arbitrary property names or data.
        const rawPath =
          (name === 'SubmittedContent' ? '/content' : '') +
          error.instancePath +
          (error.keyword === 'required'
            ? '/' + error.params.missingProperty
            : '');
        const path =
          /^\/(?:content|metadata|expectedVersion|revisionId|decision|reason|checklist|ownershipDeclared)(?:\/(?:[a-zA-Z]{1,40}|[0-9]{1,2}))*$/.test(
            rawPath,
          )
            ? rawPath
            : '/';
        if (errors.some((e) => e.path === path)) continue;
        errors.push({
          path,
          code: error.keyword === 'required' ? 'Required' : 'Invalid',
          message:
            error.keyword === 'required'
              ? 'Vui lòng bổ sung thông tin này.'
              : 'Thông tin chưa đúng định dạng hoặc giới hạn cho phép.',
        });
      }
      throw new DomainError(
        422,
        'VALIDATION_ERROR',
        'Kiểm tra lại thông tin đã nhập.',
        errors.length ? errors : undefined,
      );
    }
    const metadata = (value as { metadata?: Wire['CatalogMetadata'] })
      ?.metadata;
    if (
      metadata &&
      ['CreateCatalogRequest', 'ResubmitCatalogRequest'].includes(name)
    ) {
      if (metadata.series) metadata.series = metadata.series.normalize('NFC');
      validateClassification(metadata);
    }
    return value as Wire[K];
  }
  query(operationId: string, raw: unknown): Record<string, string | number> {
    const key = `query:${operationId}`;
    let validate = this.validators.get(key);
    if (!validate) {
      const operation = Object.values(this.contract.paths)
        .flatMap((item) => Object.values(item as object))
        .find((o: any) => o.operationId === operationId) as any;
      if (!operation) throw new Error('Unknown contract operation');
      const properties = Object.fromEntries(
        operation.parameters
          .filter((p: any) => p.in === 'query')
          .map((p: any) => [p.name, p.schema]),
      );
      validate = this.queries.compile({
        type: 'object',
        additionalProperties: false,
        components: this.contract.components,
        properties,
      });
      this.validators.set(key, validate);
    }
    const value = trimInput(raw) as Record<string, string | number>;
    if (value?.q === '') delete value.q;
    if (!validate(value))
      throw new DomainError(
        400,
        'VALIDATION_ERROR',
        'Bộ lọc hoặc phân trang không hợp lệ.',
      );
    return { ...value, limit: value.limit ?? 20 };
  }
}
