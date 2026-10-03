import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createWorker, OEM } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OcrProvider, ProviderPageResult } from '../../ocr-provider.js';
import { ocrConfig } from '../../ocr.config.js';
import type { OcrConfig } from '../../ocr.config.js';
import type { PageImage } from '../../ocr.types.js';
import { mapTesseractPage } from './tesseract.mapper.js';

/**
 * The self-hosted baseline. No credential and no per-page cost, which is what
 * lets a public demo stay open without a spending cap to defend.
 *
 * The engine runs in a worker thread that is started on first use and reused.
 * One worker handles one page at a time, so calls are chained.
 */
@Injectable()
export class TesseractProvider implements OcrProvider, OnModuleDestroy {
  readonly id = 'tesseract';
  readonly label = 'Tesseract (self-hosted)';
  readonly requiresCredential = false;
  readonly textOrder = 'logical' as const;

  private readonly logger = new Logger(TesseractProvider.name);
  private worker: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(ocrConfig.KEY) private readonly config: OcrConfig) {}

  recognize(page: PageImage): Promise<ProviderPageResult> {
    const job = this.queue.then(async () => {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(page.data, {}, { blocks: true });
      // `blocks` holds the whole tree; the flat text/hocr copies add nothing.
      const raw = { version: data.version, psm: data.psm, blocks: data.blocks };
      return { page: mapTesseractPage(data, page), raw };
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  async onModuleDestroy(): Promise<void> {
    const worker = await this.worker?.catch(() => null);
    await worker?.terminate();
    this.worker = null;
  }

  private getWorker(): Promise<Worker> {
    this.worker ??= this.startWorker().catch((error: unknown) => {
      this.worker = null;
      throw error;
    });
    return this.worker;
  }

  private async startWorker(): Promise<Worker> {
    const cachePath = resolve(this.config.tesseract.cacheDir);
    await mkdir(cachePath, { recursive: true });
    this.logger.log(
      `Starting Tesseract (${this.config.tesseract.languages}), data in ${cachePath}`,
    );
    return createWorker(this.config.tesseract.languages, OEM.LSTM_ONLY, {
      cachePath,
    });
  }
}
