import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { it, expect } from 'vitest';

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
