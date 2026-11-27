import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CORS_ORIGINS,
  isAllowedSocketOrigin,
  parseCorsOrigins,
  socketCorsOptions,
} from './socket-cors.js';

describe('socket CORS origin allowlist', () => {
  it('parses configured comma-separated origins and trims whitespace and trailing slashes', () => {
    expect(
      parseCorsOrigins(
        ' https://latlai.vercel.app/ , https://admin.latlai.vercel.app/// ',
      ),
    ).toEqual([
      'https://latlai.vercel.app',
      'https://admin.latlai.vercel.app',
    ]);
  });

  it('falls back to local defaults when CORS_ORIGINS is empty', () => {
    expect(parseCorsOrigins('')).toEqual(
      DEFAULT_CORS_ORIGINS.split(','),
    );
  });

  it('allows native / Node clients without an Origin header', () => {
    expect(isAllowedSocketOrigin(undefined, 'https://latlai.vercel.app')).toBe(
      true,
    );
    expect(isAllowedSocketOrigin('', 'https://latlai.vercel.app')).toBe(true);
  });

  it('allows only configured browser origins and rejects unknown origins', () => {
    const env = 'https://latlai.vercel.app,https://admin.latlai.vercel.app';
    expect(isAllowedSocketOrigin('https://latlai.vercel.app', env)).toBe(true);
    expect(isAllowedSocketOrigin('https://admin.latlai.vercel.app', env)).toBe(
      true,
    );
    expect(isAllowedSocketOrigin('https://evil.example.com', env)).toBe(false);
    expect(isAllowedSocketOrigin('http://localhost:5173', env)).toBe(false);
  });

  it('evaluates CORS_ORIGINS dynamically per handshake via socketCorsOptions()', () => {
    const previous = process.env.CORS_ORIGINS;
    try {
      process.env.CORS_ORIGINS = 'https://demo.latlai.vn';
      const opts = socketCorsOptions();
      expect(opts.credentials).toBe(false);
      let allowedResult: boolean | undefined;
      let rejectedResult: boolean | undefined;
      opts.origin('https://demo.latlai.vn', (_err, allow) => {
        allowedResult = allow;
      });
      opts.origin('https://other.example', (_err, allow) => {
        rejectedResult = allow;
      });
      expect(allowedResult).toBe(true);
      expect(rejectedResult).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
    }
  });
});
