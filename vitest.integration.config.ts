import { defineConfig } from 'vitest/config';

// Integration tests start the real, pinned OpenLore binary (run `npm run setup` first).
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.workshop/**'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
