import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['app/**/*.test.ts'],
    setupFiles: ['./app/api/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['app/api/**/*.ts'],
      exclude: ['app/api/**/*.test.ts', 'app/api/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@skillhub/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
});
