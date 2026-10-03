import type { ProviderCredential } from './credentials/credential-store.js';
import type { OcrPage, PageImage, TextOrder } from './ocr.types.js';

/** Multi-provider token: every registered engine is injected as one array. */
export const OCR_PROVIDERS = Symbol('OCR_PROVIDERS');

/**
 * What the broker hands a provider for a single call. Providers never read the
 * environment themselves: the credential arrives here, is used for the call,
 * and is not kept.
 */
export interface ProviderCall {
  credential: ProviderCredential | null;
  signal: AbortSignal;
}

export interface ProviderPageResult {
  page: OcrPage;
  /** The provider's own payload, untouched. For debugging and the harness only. */
  raw: unknown;
}

/**
 * An OCR engine. Implementations do two things: make the call, and map the
 * answer into the internal shape. A provider that cannot return per-token
 * geometry does not qualify, because the frontend's confidence highlighting
 * depends on it.
 */
export interface OcrProvider {
  readonly id: string;
  readonly label: string;
  readonly requiresCredential: boolean;
  readonly textOrder: TextOrder;
  recognize(page: PageImage, call: ProviderCall): Promise<ProviderPageResult>;
}
