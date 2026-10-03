import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigError } from '../config/env.js';
import { CredentialStore } from './credentials/credential-store.js';
import { OCR_PROVIDERS } from './ocr-provider.js';
import type { OcrProvider, ProviderPageResult } from './ocr-provider.js';
import { ocrConfig } from './ocr.config.js';
import type { OcrConfig } from './ocr.config.js';
import type { OcrDocument, PageImage } from './ocr.types.js';

export interface ProviderStatus {
  id: string;
  label: string;
  requiresCredential: boolean;
  /** True when the provider can be called: keyless, or its credential is present. */
  ready: boolean;
}

export interface ProviderResult {
  document: OcrDocument;
  /** One raw payload per page, in page order. Never handed to an adapter. */
  raw: unknown[];
}

/**
 * Every OCR call leaves the service through here. The broker picks the
 * provider, attaches its credential for the duration of one call, enforces the
 * timeout, and makes sure nothing that comes back (result, raw payload or
 * error) can carry a secret towards the client.
 */
@Injectable()
export class ProviderBroker implements OnModuleInit {
  private readonly logger = new Logger(ProviderBroker.name);
  private readonly providers: ReadonlyMap<string, OcrProvider>;

  constructor(
    @Inject(OCR_PROVIDERS) providers: OcrProvider[],
    private readonly credentials: CredentialStore,
    @Inject(ocrConfig.KEY) private readonly config: OcrConfig,
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
  }

  onModuleInit(): void {
    if (!this.providers.has(this.config.defaultProvider)) {
      throw new ConfigError(
        `OCR_PROVIDER "${this.config.defaultProvider}" is not registered. ` +
          `Known providers: ${[...this.providers.keys()].join(', ')}`,
      );
    }
  }

  get defaultProviderId(): string {
    return this.config.defaultProvider;
  }

  status(): ProviderStatus[] {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      label: provider.label,
      requiresCredential: provider.requiresCredential,
      ready: this.isReady(provider),
    }));
  }

  async recognize(
    pages: PageImage[],
    options: { provider?: string } = {},
  ): Promise<ProviderResult> {
    const provider = this.resolve(options.provider);
    if (!this.isReady(provider)) {
      throw new ServiceUnavailableException(
        `OCR provider "${provider.id}" is not configured on this server`,
      );
    }

    const results = await mapWithConcurrency(
      pages,
      this.config.pageConcurrency,
      (page) => this.recognizePage(provider, page),
    );

    return {
      document: {
        provider: provider.id,
        textOrder: provider.textOrder,
        pages: results.map((result) => result.page),
      },
      raw: results.map((result) => result.raw),
    };
  }

  private async recognizePage(
    provider: OcrProvider,
    page: PageImage,
  ): Promise<ProviderPageResult> {
    const signal = AbortSignal.timeout(this.config.timeoutMs);
    const startedAt = performance.now();
    try {
      const result = await abortable(
        provider.recognize(page, {
          credential: this.credentials.get(provider.id),
          signal,
        }),
        signal,
      );
      this.logger.debug(
        `${provider.id} page ${page.index}: ${result.page.lines.length} lines in ` +
          `${Math.round(performance.now() - startedAt)} ms`,
      );
      return { page: result.page, raw: this.credentials.scrub(result.raw) };
    } catch (error) {
      if (signal.aborted) {
        this.logger.warn(`${provider.id} page ${page.index}: timed out`);
        throw new GatewayTimeoutException(
          `OCR provider "${provider.id}" did not answer in time`,
        );
      }
      // Upstream detail stays in the server log, redacted. The client gets a
      // fixed message, so an upstream error that echoes a key cannot leak it.
      this.logger.warn(
        `${provider.id} page ${page.index} failed: ` +
          this.credentials.redact(describeError(error)),
      );
      throw new BadGatewayException(`OCR provider "${provider.id}" failed`);
    }
  }

  private resolve(requested: string | undefined): OcrProvider {
    const id = requested ?? this.config.defaultProvider;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new BadRequestException(`Unknown OCR provider "${id}"`);
    }
    return provider;
  }

  private isReady(provider: OcrProvider): boolean {
    return !provider.requiresCredential || this.credentials.has(provider.id);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Rejects as soon as the signal fires, for engines that cannot be cancelled. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
