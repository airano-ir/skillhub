import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Bundle skillhub-core into the CLI so the published package
  // doesn't depend on a separate npm package that may be outdated
  noExternal: ['skillhub-core'],
  // gray-matter (dep of skillhub-core) uses CJS require('fs') which
  // breaks in ESM bundles - provide a require shim for Node builtins
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
});
