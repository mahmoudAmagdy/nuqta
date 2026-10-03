import { ConfigType, registerAs } from '@nestjs/config';
import { positiveIntFromEnv, stringFromEnv } from '../config/env.js';

/**
 * Everything about the provider call except credentials, which are held by
 * the CredentialStore and never enter the config tree.
 */
export const ocrConfig = registerAs('ocr', () => ({
  defaultProvider: stringFromEnv(process.env, 'OCR_PROVIDER', 'tesseract'),
  timeoutMs: positiveIntFromEnv(process.env, 'OCR_PROVIDER_TIMEOUT_MS', 60_000),
  pageConcurrency: positiveIntFromEnv(process.env, 'OCR_PAGE_CONCURRENCY', 2),
  tesseract: {
    languages: stringFromEnv(process.env, 'TESSERACT_LANGS', 'ara+eng'),
    /** Trained data is fetched once and cached here. */
    cacheDir: stringFromEnv(
      process.env,
      'TESSERACT_CACHE_DIR',
      '.cache/tessdata',
    ),
  },
}));

export type OcrConfig = ConfigType<typeof ocrConfig>;
