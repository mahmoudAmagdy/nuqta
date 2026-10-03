/**
 * Runs one image through intake, the provider broker and reconstruction,
 * outside HTTP.
 *
 *   npm run ocr -- <image> [--provider <id>] [--stage ocr|raw] [--out <file.json>]
 *
 * Prints reconstructed lines by default, with each directional run bracketed.
 * `--stage ocr` stops before reconstruction and shows what the provider said;
 * `--stage raw` prints the provider's own payload. `--out` writes the full
 * JSON of the chosen stage to disk.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IntakeService } from '../intake/intake.service.js';
import type { BoundingBox } from '../ocr/ocr.types.js';
import { ProviderBroker } from '../ocr/provider-broker.service.js';
import { ReconstructionService } from '../reconstruction/reconstruction.service.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string' },
    stage: { type: 'string', default: 'reconstructed' },
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
    'usage: npm run ocr -- <image> [--provider <id>] [--stage ocr|raw] [--out <file>]',
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

  const reconstructed = app
    .get(ReconstructionService)
    .reconstruct(result.document);
  const payload =
    values.stage === 'raw'
      ? result.raw
      : values.stage === 'ocr'
        ? result.document
        : reconstructed;
  if (values.out) {
    await writeFile(
      fromInvocation(values.out),
      JSON.stringify(payload, null, 2),
      'utf8',
    );
    console.log(`wrote ${values.out}`);
  } else if (values.stage === 'raw') {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const tokenCount = result.document.pages
      .flatMap((page) => page.lines)
      .reduce((sum, line) => sum + line.tokens.length, 0);
    console.log(
      `provider=${result.document.provider} stage=${values.stage} ` +
        `pages=${result.document.pages.length} tokens=${tokenCount} ${elapsedMs}ms`,
    );
    const describe = (line: {
      confidence: number;
      box: BoundingBox;
      text: string;
    }) => {
      const { x, y, width, height } = line.box;
      const where = `(${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)})`;
      return `  [${line.confidence.toFixed(2)}] ${where} ${line.text}`;
    };
    if (values.stage === 'ocr') {
      for (const page of result.document.pages) {
        for (const line of page.lines) console.log(describe(line));
      }
    } else {
      for (const page of reconstructed.pages) {
        for (const line of page.lines) {
          const runs = line.runs.map(
            (run) => `${run.direction}[${line.text.slice(run.start, run.end)}]`,
          );
          console.log(describe(line));
          console.log(`         ${line.direction}: ${runs.join(' ')}`);
        }
      }
    }
  }
} finally {
  await app.close();
}
