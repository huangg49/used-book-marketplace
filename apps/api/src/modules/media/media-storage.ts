import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';
import { createHash } from 'node:crypto';
import { DomainError } from '../commands/domain-error.js';

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
export class MediaStorage {
  private readonly client?: StorageClient;
  private readonly bucket: string;
  private readonly base: string;
  private readonly headers: Record<string, string>;
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
    const { data, error } = await this.client
      .from(this.bucket)
      .createSignedUrl(key, 120);
    if (error || !data) throw unavailable();
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
  }
  async remove(keys: string[]) {
    if (!this.client) throw unavailable();
    const { error } = await this.client.from(this.bucket).remove(keys);
    if (error) throw unavailable();
  }
}
