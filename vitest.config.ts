import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Root test config. Tests import workspace packages by their alias, resolved
 * here to source so there is no build step between editing and testing.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@cyberlab/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@cyberlab/lab-engine': fileURLToPath(new URL('./packages/lab-engine/src/index.ts', import.meta.url)),
      '@cyberlab/curriculum': fileURLToPath(new URL('./packages/curriculum/src/index.ts', import.meta.url)),
      '@cyberlab/ai': fileURLToPath(new URL('./packages/ai/src/index.ts', import.meta.url)),
    },
  },
});
