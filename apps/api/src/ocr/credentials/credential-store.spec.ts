import { inspect } from 'node:util';
import { ConfigError } from '../../config/env.js';
import { CredentialStore } from './credential-store.js';

const KEY = 'sentinel-key-0123456789abcdef';
const AZURE = 'azure-document-intelligence';

describe('CredentialStore', () => {
  it('reads a complete credential from the environment', () => {
    const store = CredentialStore.fromEnv({
      AZURE_DI_ENDPOINT: 'https://nuqta.cognitiveservices.azure.com/',
      AZURE_DI_KEY: KEY,
    });

    expect(store.has(AZURE)).toBe(true);
    expect(store.get(AZURE)).toEqual({
      endpoint: 'https://nuqta.cognitiveservices.azure.com',
      apiKey: KEY,
    });
  });

  it('treats an unset provider as absent rather than an error', () => {
    const store = CredentialStore.fromEnv({ AZURE_DI_KEY: '  ' });

    expect(store.has(AZURE)).toBe(false);
    expect(store.get(AZURE)).toBeNull();
  });

  it('refuses half a credential', () => {
    expect(() => CredentialStore.fromEnv({ AZURE_DI_KEY: KEY })).toThrow(
      ConfigError,
    );
  });

  it('refuses to send a key over plain http', () => {
    expect(() =>
      CredentialStore.fromEnv({
        AZURE_DI_ENDPOINT: 'http://nuqta.cognitiveservices.azure.com',
        AZURE_DI_KEY: KEY,
      }),
    ).toThrow(/https/);
  });

  it('does not echo the key in its own configuration errors', () => {
    try {
      CredentialStore.fromEnv({
        AZURE_DI_ENDPOINT: 'not a url',
        AZURE_DI_KEY: KEY,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
  });

  it('is opaque to serialisation and inspection', () => {
    const store = new CredentialStore([
      [AZURE, { endpoint: 'https://example.test', apiKey: KEY }],
    ]);

    expect(JSON.stringify(store)).not.toContain(KEY);
    expect(JSON.stringify({ store })).not.toContain(KEY);
    expect(inspect(store, { depth: null, showHidden: true })).not.toContain(
      KEY,
    );
  });

  it('redacts every occurrence of a key from text', () => {
    const store = new CredentialStore([
      [AZURE, { endpoint: 'https://example.test', apiKey: KEY }],
    ]);

    expect(store.redact(`401 for key ${KEY}, again ${KEY}`)).toBe(
      '401 for key [redacted], again [redacted]',
    );
  });

  it('scrubs a nested payload, and leaves a clean one untouched', () => {
    const store = new CredentialStore([
      [AZURE, { endpoint: 'https://example.test', apiKey: KEY }],
    ]);
    const clean = { pages: [{ words: ['نقطة'] }] };
    const dirty = { error: { detail: [`rejected ${KEY}`] } };

    expect(store.scrub(clean)).toBe(clean);
    expect(store.scrub(dirty)).toEqual({
      error: { detail: ['rejected [redacted]'] },
    });
    expect(store.scrub(undefined)).toBeUndefined();
  });
});
