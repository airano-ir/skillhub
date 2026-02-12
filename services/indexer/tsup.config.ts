import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts', 'src/crawl.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  // Bundle all dependencies into the output
  noExternal: [/.*/],
  // Exclude Node.js built-in modules
  external: [
    'node:*',
    'fs',
    'path',
    'crypto',
    'os',
    'url',
    'util',
    'stream',
    'events',
    'buffer',
    'http',
    'https',
    'net',
    'tls',
    'dns',
    'child_process',
    'cluster',
    'worker_threads',
    'assert',
    'async_hooks',
    'string_decoder',
    'querystring',
    'zlib',
  ],
});
