/**
 * Runs one image through intake and the provider broker, outside HTTP.
 *
 *   npm run ocr -- <image> [--provider <id>] [--raw] [--out <file.json>]
 *
 * Prints a per-line summary by default. `--raw` prints the provider's own
 * payload instead of the internal shape; `--out` writes the full JSON to disk.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IntakeService } from '../intake/intake.service.js';
import { ProviderBroker } from '../ocr/provider-broker.service.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string' },
    raw: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

// npm runs workspace scripts from the package folder; INIT_CWD is where the
// user actually typed the command, which is what relative paths should mean.
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const fromInvocation = (path: string) => resolve(invokedFrom, path);

const [imageArg] = positionals;
if (!imageArg) {
  console.error(
    'usage: npm run ocr -- <image> [--provider <id>] [--raw] [--out <file>]',
  );
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const pages = await app
    .get(IntakeService)
    .toPages(await readFile(fromInvocation(imageArg)));
  const startedAt = performance.now();
  const result = await app
    .get(ProviderBroker)
    .recognize(pages, { provider: values.provider });
  const elapsedMs = Math.round(performance.now() - startedAt);

  const payload = values.raw ? result.raw : result.document;
  if (values.out) {
    await writeFile(
      fromInvocation(values.out),
      JSON.stringify(payload, null, 2),
      'utf8',
    );
  }

  if (values.raw && !values.out) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const page of result.document.pages) {
      const tokens = page.lines.flatMap((line) => line.tokens);
      console.log(
        `provider=${result.document.provider} page=${page.index} ` +
          `${page.width}x${page.height}px lines=${page.lines.length} ` +
          `tokens=${tokens.length} ${elapsedMs}ms`,
      );
      for (const line of page.lines) {
        const { x, y, width, height } = line.box;
        console.log(
          `  [${line.confidence.toFixed(2)}] ` +
            `(${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)}) ` +
            line.text,
        );
      }
    }
    if (values.out) console.log(`wrote ${values.out}`);
  }
} finally {
  await app.close();
}
