/**
 * Milestone 1's exit condition as an executable check: a page of Arabic text
 * goes in, provider output with geometry comes back.
 *
 * Runs the real engine, so it is slow and (on first run) fetches trained data.
 * Kept out of the default test run: `npm run test:live`.
 */
import { readFile } from 'node:fs/promises';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { IntakeService } from '../src/intake/intake.service.js';
import { ProviderBroker } from '../src/ocr/provider-broker.service.js';

const SAMPLE = new URL(
  '../../../samples/text/nuqta-page-01.png',
  import.meta.url,
);

describe('Tesseract through the broker (live)', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
  });
  afterAll(() => app?.close());

  it('reads the sample page into lines of tokens with geometry', async () => {
    const pages = await app.get(IntakeService).toPages(await readFile(SAMPLE));
    const { document, raw } = await app
      .get(ProviderBroker)
      .recognize(pages, { provider: 'tesseract' });

    const [page] = document.pages;
    if (!page) throw new Error('no page returned');
    const tokens = page.lines.flatMap((line) => line.tokens);

    expect(document.provider).toBe('tesseract');
    expect(raw).toHaveLength(1);
    expect(page.lines.length).toBeGreaterThanOrEqual(7);
    expect(tokens.length).toBeGreaterThan(60);

    // Arabic came back as Arabic, and the Latin run inside it survived.
    // Tesseract wraps such runs in invisible directional marks (U+200E/200F).
    // This is raw provider output, so they are still here; removing them is
    // reconstruction's job.
    expect(page.lines[0]?.text).toContain('النقطة');
    expect(tokens.some((t) => t.text.includes('SKU-4471-B'))).toBe(true);

    for (const token of tokens) {
      expect(token.confidence).toBeGreaterThanOrEqual(0);
      expect(token.confidence).toBeLessThanOrEqual(1);
      expect(token.box.width).toBeGreaterThan(0);
      expect(token.box.height).toBeGreaterThan(0);
      expect(token.box.x).toBeGreaterThanOrEqual(0);
      expect(token.box.y).toBeGreaterThanOrEqual(0);
      expect(token.box.x + token.box.width).toBeLessThanOrEqual(page.width);
      expect(token.box.y + token.box.height).toBeLessThanOrEqual(page.height);
    }

    // The title is set flush right, so its box must sit in the right half.
    const title = page.lines[0];
    expect((title?.box.x ?? 0) + (title?.box.width ?? 0) / 2).toBeGreaterThan(
      page.width / 2,
    );
  }, 120_000);
});
