import { defineConfig } from 'vitest/config';

// Tests that run a real OCR engine. Slow, and the first run fetches trained
// data, so they are opt-in rather than part of `npm test`.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.live-spec.ts'],
  },
});
