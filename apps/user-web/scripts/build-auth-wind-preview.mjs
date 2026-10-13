import { build } from 'vite';
import { fileURLToPath } from 'node:url';
// Explicit extra HTML entry; the normal production build never includes it.
await build({
  build: {
    outDir: fileURLToPath(new URL('../../../.tmp/auth-wind-preview-build', import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
    rolldownOptions: { input: [
      fileURLToPath(new URL('../previews/auth-wind/index.html', import.meta.url)),
      fileURLToPath(new URL('../previews/auth-wind/stack/index.html', import.meta.url)),
      fileURLToPath(new URL('../previews/auth-wind/journey/index.html', import.meta.url)),
    ] },
  },
});
