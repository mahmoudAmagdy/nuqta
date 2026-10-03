import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CredentialStore } from './credentials/credential-store.js';
import type {
  OcrProvider,
  ProviderCall,
  ProviderPageResult,
} from './ocr-provider.js';
import type { OcrConfig } from './ocr.config.js';
import type { PageImage } from './ocr.types.js';
import { ProviderBroker } from './provider-broker.service.js';

const KEY = 'sentinel-key-0123456789abcdef';
const CREDENTIAL = { endpoint: 'https://keyed.test', apiKey: KEY };

function page(index: number): PageImage {
  return {
    index,
    data: Buffer.alloc(0),
    mimeType: 'image/png',
    width: 100,
    height: 50,
  };
}

function emptyResult(image: PageImage, raw: unknown = {}): ProviderPageResult {
  return {
    page: { index: image.index, width: 100, height: 50, angle: 0, lines: [] },
    raw,
  };
}

function provider(
  overrides: Partial<OcrProvider> & { id: string },
): OcrProvider & { calls: ProviderCall[] } {
  const calls: ProviderCall[] = [];
  return {
    label: overrides.id,
    requiresCredential: false,
    textOrder: 'logical',
    recognize: async (image, call) => {
      calls.push(call);
      return emptyResult(image);
    },
    ...overrides,
    calls,
  };
}

function broker(
  providers: OcrProvider[],
  options: { config?: Partial<OcrConfig>; credentials?: CredentialStore } = {},
): ProviderBroker {
  const config: OcrConfig = {
    defaultProvider: providers[0]?.id ?? 'none',
    timeoutMs: 1000,
    pageConcurrency: 2,
    tesseract: { languages: 'ara', cacheDir: '.cache' },
    ...options.config,
  };
  return new ProviderBroker(
    providers,
    options.credentials ?? new CredentialStore(),
    config,
  );
}

describe('ProviderBroker', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('provider selection', () => {
    it('uses the configured default when none is requested', async () => {
      const free = provider({ id: 'free' });
      const other = provider({ id: 'other', textOrder: 'visual' });

      const result = await broker([free, other]).recognize([page(0)]);

      expect(result.document.provider).toBe('free');
      expect(result.document.textOrder).toBe('logical');
      expect(other.calls).toHaveLength(0);
    });

    it('honours an explicit provider and reports its text order', async () => {
      const result = await broker([
        provider({ id: 'free' }),
        provider({ id: 'other', textOrder: 'visual' }),
      ]).recognize([page(0)], { provider: 'other' });

      expect(result.document.provider).toBe('other');
      expect(result.document.textOrder).toBe('visual');
    });

    it('rejects an unknown provider as a client error', async () => {
      await expect(
        broker([provider({ id: 'free' })]).recognize([page(0)], {
          provider: 'nope',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fails at boot when the configured default is not registered', () => {
      const misconfigured = broker([provider({ id: 'free' })], {
        config: { defaultProvider: 'typo' },
      });

      expect(() => misconfigured.onModuleInit()).toThrow(/typo.*free/);
    });
  });

  describe('credential brokering', () => {
    it('hands a keyed provider its own credential, and a keyless one nothing', async () => {
      const keyed = provider({ id: 'keyed', requiresCredential: true });
      const free = provider({ id: 'free' });
      const subject = broker([keyed, free], {
        credentials: new CredentialStore([['keyed', CREDENTIAL]]),
      });

      await subject.recognize([page(0)], { provider: 'keyed' });
      await subject.recognize([page(0)], { provider: 'free' });

      expect(keyed.calls[0]?.credential).toEqual(CREDENTIAL);
      expect(free.calls[0]?.credential).toBeNull();
    });

    it('answers 503 without calling a keyed provider that has no credential', async () => {
      const keyed = provider({ id: 'keyed', requiresCredential: true });

      await expect(broker([keyed]).recognize([page(0)])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(keyed.calls).toHaveLength(0);
    });

    it('reports readiness as a boolean and nothing else', () => {
      const subject = broker(
        [
          provider({ id: 'keyed', requiresCredential: true }),
          provider({ id: 'unkeyed', requiresCredential: true }),
          provider({ id: 'free' }),
        ],
        { credentials: new CredentialStore([['keyed', CREDENTIAL]]) },
      );

      const status = subject.status();

      expect(status.map((s) => [s.id, s.ready])).toEqual([
        ['keyed', true],
        ['unkeyed', false],
        ['free', true],
      ]);
      expect(JSON.stringify(status)).not.toContain(KEY);
    });
  });

  describe('what can reach the client', () => {
    it('replaces an upstream error that echoes the key with a fixed message', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const leaky = provider({
        id: 'keyed',
        requiresCredential: true,
        recognize: async () => {
          throw new Error(`HTTP 401: invalid subscription key ${KEY}`);
        },
      });
      const subject = broker([leaky], {
        credentials: new CredentialStore([['keyed', CREDENTIAL]]),
      });

      const error = await subject.recognize([page(0)]).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadGatewayException);
      const response = JSON.stringify(
        (error as BadGatewayException).getResponse(),
      );
      expect(response).not.toContain(KEY);
      expect(response).not.toContain('401');

      // The detail is kept for the operator, minus the secret.
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain('HTTP 401');
      expect(logged).toContain('[redacted]');
      expect(logged).not.toContain(KEY);
    });

    it('scrubs a raw payload that echoes the key', async () => {
      const echoing = provider({
        id: 'keyed',
        requiresCredential: true,
        recognize: async (image) =>
          emptyResult(image, { request: { headers: { 'api-key': KEY } } }),
      });
      const subject = broker([echoing], {
        credentials: new CredentialStore([['keyed', CREDENTIAL]]),
      });

      const result = await subject.recognize([page(0)]);

      expect(JSON.stringify(result)).not.toContain(KEY);
    });
  });

  describe('call handling', () => {
    it('turns a provider that never answers into a 504', async () => {
      const stuck = provider({
        id: 'stuck',
        recognize: () => new Promise<ProviderPageResult>(() => undefined),
      });

      await expect(
        broker([stuck], { config: { timeoutMs: 20 } }).recognize([page(0)]),
      ).rejects.toBeInstanceOf(GatewayTimeoutException);
    });

    it('returns pages in document order whatever order they finish in', async () => {
      const uneven = provider({
        id: 'uneven',
        recognize: async (image) => {
          await new Promise((r) => setTimeout(r, image.index === 0 ? 30 : 1));
          return emptyResult(image, { page: image.index });
        },
      });

      const result = await broker([uneven]).recognize([
        page(0),
        page(1),
        page(2),
      ]);

      expect(result.document.pages.map((p) => p.index)).toEqual([0, 1, 2]);
      expect(result.raw).toEqual([{ page: 0 }, { page: 1 }, { page: 2 }]);
    });

    it('never runs more pages at once than the configured limit', async () => {
      let running = 0;
      let peak = 0;
      const counting = provider({
        id: 'counting',
        recognize: async (image) => {
          peak = Math.max(peak, ++running);
          await new Promise((r) => setTimeout(r, 5));
          running--;
          return emptyResult(image);
        },
      });

      await broker([counting], { config: { pageConcurrency: 2 } }).recognize(
        [0, 1, 2, 3, 4].map(page),
      );

      expect(peak).toBe(2);
    });
  });
});
