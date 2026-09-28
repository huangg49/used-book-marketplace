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
    const mock = vi
      .fn()
      .mockResolvedValue(
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
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
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
        JSON.stringify({
          signedURL:
            '/object/sign/latlai-media/media/id/render-1.webp?token=test',
        }),
        { status: 200 },
      ),
    );
    const signed = await s.signedRead('media/id/render-1.webp');
    expect(signed.url).toContain('render-1.webp');
    const [url, init] = mock.mock.calls[1];
    expect(String(url)).toContain(
      '/object/sign/latlai-media/media/id/render-1.webp',
    );
    expect(JSON.parse(init.body)).toEqual({ expiresIn: 120 });
  });
});
