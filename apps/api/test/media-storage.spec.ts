import { ConfigService } from '@nestjs/config';
import { MediaStorage } from '../src/modules/media/media-storage.js';

describe('Supabase adapter boundary (HTTP mocked, not live)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const store = () =>
    new MediaStorage(
      new ConfigService({
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_STORAGE_KEY: 'sb_secret_test_only',
        SUPABASE_MEDIA_BUCKET: 'latlai-media',
      }),
    );
  it('refuses public/unbounded buckets and missing config', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'latlai-media',
          public: true,
          file_size_limit: 10000000,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', mock);
    await expect(store().check()).rejects.toMatchObject({ status: 503 });
    await expect(
      new MediaStorage(new ConfigService()).check(),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('writes create-only using server credentials and never accepts differing duplicate bytes', async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ Key: 'latlai-media/media/id/input' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', mock);
    const s = store();
    await s.put('media/id/input', Buffer.from('abc'), 'image/png');
    const [, init] = mock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe('sb_secret_test_only');
    expect(headers.get('x-upsert')).toBe('false');
    mock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'exists',
          statusCode: '409',
          error: 'Duplicate',
        }),
        { status: 409 },
      ),
    );
    mock.mockResolvedValueOnce(new Response('xyz', { status: 200 }));
    await expect(
      s.put('media/id/input', Buffer.from('abc'), 'image/png'),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('bounds downloaded bytes and signs only the requested derivative', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response('too-long', { status: 200 }));
    vi.stubGlobal('fetch', mock);
    const s = store();
    await expect(s.read('media/id/input', 2)).rejects.toMatchObject({
      status: 503,
    });
    mock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            path: 'media/id/render-1.webp',
            error: null,
            signedURL:
              '/object/sign/latlai-media/media/id/render-1.webp?token=test',
          },
        ]),
        { status: 200 },
      ),
    );
    const signed = await s.signedRead('media/id/render-1.webp');
    expect(signed.url).toContain('render-1.webp');
    const [url, init] = mock.mock.calls[1];
    expect(String(url)).toContain('/object/sign/latlai-media');
    expect(JSON.parse(init.body)).toEqual({
      expiresIn: 120,
      paths: ['media/id/render-1.webp'],
    });
  });
  it('coalesces concurrent bucket checks but rechecks later requests and rejects a newly public bucket', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let publicBucket = false;
    const mock = vi.fn(async () => {
      await gate;
      return new Response(
        JSON.stringify({
          id: 'latlai-media',
          public: publicBucket,
          file_size_limit: 10000000,
        }),
      );
    });
    vi.stubGlobal('fetch', mock);
    const s = store();
    const concurrent = Promise.all(Array.from({ length: 20 }, () => s.check()));
    release();
    await concurrent;
    expect(mock).toHaveBeenCalledTimes(1);
    publicBucket = true;
    await expect(s.check()).rejects.toMatchObject({ status: 503 });
    expect(mock).toHaveBeenCalledTimes(2);
    s.onModuleDestroy();
  });
  it('binds bulk results by path, shares duplicate requests and reuses only the original signed expiry', async () => {
    const mock = vi.fn(async (_url, init) => {
      const { paths } = JSON.parse(init.body);
      return new Response(
        JSON.stringify(
          [...paths]
            .reverse()
            .map((path) => ({
              path,
              error: null,
              signedURL: '/object/sign/latlai-media/' + path + '?token=qa',
            })),
        ),
      );
    });
    vi.stubGlobal('fetch', mock);
    const s = store();
    const keys = Array.from(
      { length: 20 },
      (_, i) => `media/${i}/render-1.webp`,
    );
    const values = await Promise.all(
      [...keys, keys[0]].map((key) => s.signedRead(key)),
    );
    expect(mock).toHaveBeenCalledTimes(1);
    values.forEach((value, i) =>
      expect(value.url).toContain((keys[i] ?? keys[0]) + '?token=qa'),
    );
    expect(values[20]).toEqual(values[0]);
    expect(await s.signedRead(keys[0])).toEqual(values[0]);
    expect(mock).toHaveBeenCalledTimes(1);
    s.onModuleDestroy();
  });
  it('isolates per-path signing errors without returning another file URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                path: 'good',
                error: null,
                signedURL: '/object/sign/latlai-media/good?token=qa',
              },
              { path: 'bad', error: 'Object not found', signedURL: null },
              {
                path: 'unrequested',
                error: null,
                signedURL: '/object/sign/latlai-media/unrequested?token=qa',
              },
            ]),
          ),
      ),
    );
    const s = store();
    const values = await Promise.allSettled(
      ['good', 'bad', 'missing'].map((key) => s.signedRead(key)),
    );
    expect(values[0].status).toBe('fulfilled');
    expect(values[1].status).toBe('rejected');
    expect(values[2].status).toBe('rejected');
    s.onModuleDestroy();
  });
});
