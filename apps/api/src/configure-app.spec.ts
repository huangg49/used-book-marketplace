import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';
import { resolveTrustProxy } from './configure-app.js';

it('resolves Express trust proxy safely for local and cloud reverse-proxy hosts', () => {
  expect(resolveTrustProxy(undefined, undefined, 'development')).toBeUndefined();
  expect(resolveTrustProxy('', 'false', 'test')).toBeUndefined();
  expect(resolveTrustProxy(undefined, 'true', 'development')).toBe(1);
  expect(resolveTrustProxy(undefined, undefined, 'production')).toBe(1);
  expect(resolveTrustProxy('1', 'false', 'development')).toBe(1);
  expect(resolveTrustProxy('2', 'true', 'production')).toBe(2);
  expect(resolveTrustProxy('true', 'false', 'development')).toBe(true);
  expect(resolveTrustProxy('false', 'true', 'production')).toBe(false);
  expect(resolveTrustProxy('loopback', 'false', 'development')).toBe('loopback');
});

it.skipIf(process.platform !== 'win32')(
  'Windows shutdown completes lifecycle hooks without re-raising an unsupported signal',
  async () => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        `
        import 'reflect-metadata';
        import { Module } from '@nestjs/common';
        import { NestFactory } from '@nestjs/core';
        import { ConfigModule } from '@nestjs/config';
        import { configureApp } from './src/configure-app.ts';
        class Root {}
        Module({
          imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
          providers: [{ provide: 'shutdown-fixture', useValue: {
            async onApplicationShutdown() {
              await new Promise(resolve => setTimeout(resolve, 25));
              console.log('SHUTDOWN_HOOK_COMPLETED');
            }
          }}]
        })(Root);
        const app = await NestFactory.create(Root, { logger: false });
        configureApp(app, { docs: false, logRequests: false });
        await app.listen(0, '127.0.0.1');
        process.emit('SIGHUP');
      `,
      ],
      { timeout: 10_000, windowsHide: true },
    );
    expect(stdout).toContain('SHUTDOWN_HOOK_COMPLETED');
    expect(stderr).not.toContain('ENOSYS');
  },
  15_000,
);
