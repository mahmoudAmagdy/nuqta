import { ConfigError } from '../../config/env.js';

export interface ProviderCredential {
  endpoint: string;
  apiKey: string;
}

/** Which environment variables hold each keyed provider's credential. */
const CREDENTIAL_SOURCES: Record<string, { endpoint: string; apiKey: string }> =
  {
    'azure-document-intelligence': {
      endpoint: 'AZURE_DI_ENDPOINT',
      apiKey: 'AZURE_DI_KEY',
    },
  };

const REDACTED = '[redacted]';

/**
 * The one place provider secrets live. It is provided inside the OCR module
 * and not exported, so only the broker can inject it.
 *
 * Values sit in a private field, which keeps them out of JSON.stringify,
 * util.inspect, and therefore out of any accidental log line or response.
 */
export class CredentialStore {
  readonly #byProvider: ReadonlyMap<string, ProviderCredential>;

  constructor(entries: Iterable<readonly [string, ProviderCredential]> = []) {
    this.#byProvider = new Map(entries);
  }

  static fromEnv(env: Record<string, string | undefined>): CredentialStore {
    const entries: [string, ProviderCredential][] = [];
    for (const [providerId, source] of Object.entries(CREDENTIAL_SOURCES)) {
      const endpoint = env[source.endpoint]?.trim();
      const apiKey = env[source.apiKey]?.trim();
      if (!endpoint && !apiKey) continue;
      if (!endpoint || !apiKey) {
        throw new ConfigError(
          `${source.endpoint} and ${source.apiKey} must be set together`,
        );
      }
      entries.push([
        providerId,
        { endpoint: parseHttpsEndpoint(source.endpoint, endpoint), apiKey },
      ]);
    }
    return new CredentialStore(entries);
  }

  has(providerId: string): boolean {
    return this.#byProvider.has(providerId);
  }

  get(providerId: string): ProviderCredential | null {
    return this.#byProvider.get(providerId) ?? null;
  }

  /** Strip every known secret from text that is about to be logged. */
  redact(text: string): string {
    let result = text;
    for (const { apiKey } of this.#byProvider.values()) {
      result = result.replaceAll(apiKey, REDACTED);
    }
    return result;
  }

  /**
   * Same guarantee for a provider's raw payload. Providers have no reason to
   * echo a key, so the common path is a single scan and no copy.
   */
  scrub<T>(payload: T): T {
    const json = JSON.stringify(payload);
    if (json === undefined) return payload;
    const redacted = this.redact(json);
    return redacted === json ? payload : (JSON.parse(redacted) as T);
  }
}

function parseHttpsEndpoint(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} is not a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new ConfigError(`${name} must use https`);
  }
  return url.origin;
}
