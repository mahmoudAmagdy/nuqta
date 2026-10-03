/**
 * The exit conditions of milestones 1 and 2 as an executable check: a page of
 * Arabic text goes in, provider output with geometry comes back, and
 * reconstruction turns it into clean logical text.
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
import { ReconstructionService } from '../src/reconstruction/reconstruction.service.js';

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

  async function readSample() {
    const pages = await app.get(IntakeService).toPages(await readFile(SAMPLE));
    return app.get(ProviderBroker).recognize(pages, { provider: 'tesseract' });
  }

  it('reads the sample page into lines of tokens with geometry', async () => {
    const { document, raw } = await readSample();

    const [page] = document.pages;
    if (!page) throw new Error('no page returned');
    const tokens = page.lines.flatMap((line) => line.tokens);

    expect(document.provider).toBe('tesseract');
    expect(raw).toHaveLength(1);
    expect(page.lines.length).toBeGreaterThanOrEqual(7);
    expect(tokens.length).toBeGreaterThan(60);

    // Arabic came back as Arabic, and the Latin run inside it survived.
    // Tesseract wraps such runs in invisible directional marks (U+200E/200F).
    // This is raw provider output, so they are still here.
    expect(page.lines[0]?.text).toContain('النقطة');
    expect(tokens.some((t) => t.text.includes('SKU-4471-B'))).toBe(true);
    expect(tokens.map((t) => t.text)).not.toContain('SKU-4471-B');

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

  it('reconstructs that output into clean right-to-left text', async () => {
    const { document } = await readSample();
    const [page] = app.get(ReconstructionService).reconstruct(document).pages;
    if (!page) throw new Error('no page returned');
    const tokens = page.lines.flatMap((line) => line.tokens);

    expect(page.direction).toBe('rtl');

    // The directional marks are gone and the identifier is an exact token,
    // in a left-to-right run of its own inside a right-to-left line.
    const sku = tokens.find((t) => t.text === 'SKU-4471-B');
    expect(sku?.kind).toBe('latin');
    expect(sku?.search).toBe('sku-4471-b');

    const skuLine = page.lines.find((line) => line.tokens.includes(sku!));
    expect(skuLine?.direction).toBe('rtl');
    expect(
      skuLine?.runs.some(
        (run) =>
          run.direction === 'ltr' &&
          skuLine.text.slice(run.start, run.end).startsWith('SKU-4471-B'),
      ),
    ).toBe(true);

    // The first word of the title is the first token: reading order.
    expect(page.lines[0]?.tokens[0]?.text).toBe('النقطة');

    // Geometry survived reconstruction, so every word can still be boxed.
    for (const token of tokens) {
      expect(token.box.width).toBeGreaterThan(0);
      expect(token.box.x + token.box.width).toBeLessThanOrEqual(page.width);
    }
  }, 120_000);
});
