import { Inject, Injectable } from '@nestjs/common';
import type {
  OcrProvider,
  ProviderCall,
  ProviderPageResult,
} from '../../ocr-provider.js';
import type { PageImage } from '../../ocr.types.js';
import { mapAzureReadResult } from './azure-read.mapper.js';
import type { AzureOperation } from './azure-read.types.js';

/** Injected so tests can stand in for the network. */
export const HTTP_FETCH = Symbol('HTTP_FETCH');
export type Fetch = typeof fetch;

const API_VERSION = '2024-11-30';
const KEY_HEADER = 'Ocp-Apim-Subscription-Key';
const DEFAULT_POLL_MS = 1000;
const MAX_POLL_MS = 5000;

/**
 * Azure AI Document Intelligence, `prebuilt-read` model: plain text
 * recognition that returns a polygon and a confidence for every word.
 *
 * Arabic is listed for this model and API version, printed and handwritten:
 * https://learn.microsoft.com/azure/ai-services/document-intelligence/language-support/ocr
 * The free F0 tier accepts files up to 4 MB; pages are sent one at a time,
 * so its two-page limit on PDFs does not apply.
 *
 * The call is asynchronous on Azure's side: submit, then poll the operation.
 */
@Injectable()
export class AzureDocumentIntelligenceProvider implements OcrProvider {
  readonly id = 'azure-document-intelligence';
  readonly label = 'Azure Document Intelligence (prebuilt-read)';
  readonly requiresCredential = true;
  readonly textOrder = 'logical' as const;

  constructor(@Inject(HTTP_FETCH) private readonly fetch: Fetch) {}

  async recognize(
    page: PageImage,
    call: ProviderCall,
  ): Promise<ProviderPageResult> {
    if (!call.credential) {
      throw new Error(
        'Azure Document Intelligence was called without a credential',
      );
    }
    const { endpoint, apiKey } = call.credential;

    const submitted = await this.fetch(
      `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze` +
        `?api-version=${API_VERSION}`,
      {
        method: 'POST',
        headers: { [KEY_HEADER]: apiKey, 'Content-Type': page.mimeType },
        body: new Uint8Array(page.data),
        signal: call.signal,
      },
    );
    if (submitted.status !== 202) {
      throw new Error(await describeFailure('submit', submitted));
    }

    const operationUrl = submitted.headers.get('operation-location');
    // The key is about to be sent to this URL, so it has to be the same host
    // the operator configured, not wherever a response header points.
    if (!operationUrl || new URL(operationUrl).origin !== endpoint) {
      throw new Error(
        'Azure returned an operation URL on an unexpected origin',
      );
    }

    const operation = await this.poll(operationUrl, apiKey, call.signal);
    return {
      page: mapAzureReadResult(operation.analyzeResult ?? {}, page),
      raw: operation,
    };
  }

  private async poll(
    url: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<AzureOperation> {
    for (;;) {
      const response = await this.fetch(url, {
        headers: { [KEY_HEADER]: apiKey },
        signal,
      });
      if (!response.ok) {
        throw new Error(await describeFailure('poll', response));
      }
      const operation = (await response.json()) as AzureOperation;
      if (operation.status === 'succeeded') return operation;
      if (operation.status === 'failed' || operation.status === 'canceled') {
        throw new Error(
          `Azure analysis ${operation.status}: ` +
            `${operation.error?.code ?? 'unknown'} ${operation.error?.message ?? ''}`.trim(),
        );
      }
      await sleep(retryDelayMs(response), signal);
    }
  }
}

function retryDelayMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_POLL_MS;
  return Math.min(seconds * 1000, MAX_POLL_MS);
}

async function describeFailure(
  step: string,
  response: Response,
): Promise<string> {
  const body = await response.text().catch(() => '');
  return `Azure ${step} returned HTTP ${response.status}: ${body.slice(0, 300)}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
