import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['agent-harness/tests/**/*.test.ts', 'evaluation/tests/**/*.test.ts', 'scripts/tests/**/*.test.ts', 'workshop-ui/tests/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', 'node_modules/**', '.workshop/**'],
    testTimeout: 30_000,
  },
});
