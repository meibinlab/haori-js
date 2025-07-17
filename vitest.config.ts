import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000, // 10秒でタイムアウト
    hookTimeout: 10000, // フック関数も10秒でタイムアウト
    coverage: {
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
