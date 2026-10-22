import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';
import { createHash } from 'node:crypto';
import { DomainError } from '../commands/domain-error.js';
import { SignedReadCache, type SignedRead } from './signed-read-cache.js';

export const MAX_IMAGE_BYTES = 10_000_000;
export const MAX_DERIVATIVE_BYTES = 2_000_000;
export const inputKey = (id: string) => `media/${id}/input`;
export const outputKey = (id: string, attempt: number) =>
  `media/${id}/render-${attempt}.webp`;
export const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export const unavailable = () =>
  new DomainError(503, 'UNAVAILABLE', 'Kho ảnh chưa sẵn sàng.');

// The interface is intentionally narrower than any vendor SDK. Tests inject an explicit fake.
@Injectable()
export class MediaStorage implements OnModuleDestroy {
  private readonly client?: StorageClient;
  private readonly bucket: string;
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private bucketCheck?: Promise<void>;
  private readonly signedReads = new SignedReadCache(
    (keys) => this.signBatch(keys),
    unavailable,
  );
  constructor(config: ConfigService) {
    this.base = config.get<string>('SUPABASE_URL', '');
    this.bucket = config.get<string>('SUPABASE_MEDIA_BUCKET', 'latlai-media');
    const key = config.get<string>('SUPABASE_STORAGE_KEY', '');
    this.headers = {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    };
    if (this.base && key)
      this.client = new StorageClient(
        `${this.base}/storage/v1`,
        this.headers,
        (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
      );
  }
  async check() {
    if (!this.client) throw unavailable();
    // Share only the currently running check, not a cached configuration result.
    // A later request still fails closed if the bucket changes or is unavailable.
    this.bucketCheck ??= this.checkBucket().finally(() => {
      this.bucketCheck = undefined;
    });
    return this.bucketCheck;
  }
  private async checkBucket() {
    if (!this.client) throw unavailable();
    const { data, error } = await this.client.getBucket(this.bucket);
    // Fail closed if someone accidentally publishes the bucket or removes the upload bound.
    if (
      error ||
      !data ||
      data.public ||
      !data.file_size_limit ||
      data.file_size_limit > MAX_IMAGE_BYTES
    )
      throw unavailable();
  }
  async put(key: string, bytes: Buffer, contentType: string) {
    if (!this.client) throw unavailable();
    const { error } = await this.client
      .from(this.bucket)
      .upload(key, bytes, { upsert: false, contentType, cacheControl: '120' });
    if (error) {
      // A timeout may have succeeded remotely. Never overwrite; reconcile exact bytes.
      const existing = await this.read(key, bytes.length).catch(() => null);
      if (!existing || digest(existing) !== digest(bytes)) throw unavailable();
    }
  }
  async read(key: string, max: number): Promise<Buffer> {
    if (!this.client) throw unavailable();
    const path = key.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(
      `${this.base}/storage/v1/object/authenticated/${encodeURIComponent(this.bucket)}/${path}`,
      {
        headers: this.headers,
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      },
    );
    if (!response.ok || !response.body) throw unavailable();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const part of response.body) {
      size += part.byteLength;
      if (size > max) throw unavailable();
      chunks.push(part);
    }
    return Buffer.concat(chunks);
  }
  async signedRead(key: string) {
    if (!this.client) throw unavailable();
    return this.signedReads.read(key);
  }
  private async signBatch(keys: string[]): Promise<Map<string, SignedRead>> {
    if (!this.client) throw unavailable();
    const issuedAt = Date.now();
    const { data, error } = await this.client
      .from(this.bucket)
      .createSignedUrls(keys, 120);
    if (error || !data) throw unavailable();
    const result = new Map<string, SignedRead>();
    for (const entry of data) {
      if (
        !entry.path ||
        entry.error ||
        !entry.signedUrl ||
        !keys.includes(entry.path)
      )
        continue;
      if (result.has(entry.path)) throw unavailable();
      result.set(entry.path, {
        url: entry.signedUrl,
        expiresAt: new Date(issuedAt + 120_000).toISOString(),
      });
    }
    return result;
  }
  async remove(keys: string[]) {
    if (!this.client) throw unavailable();
    const { error } = await this.client.from(this.bucket).remove(keys);
    if (error) throw unavailable();
    this.signedReads.clear();
  }
  onModuleDestroy() {
    this.signedReads.close();
  }
}
