import { readFileSync } from 'node:fs';
import type { ProviderCall } from '../../ocr-provider.js';
import type { PageImage } from '../../ocr.types.js';
import { AzureDocumentIntelligenceProvider } from './azure-document-intelligence.provider.js';
import type { Fetch } from './azure-document-intelligence.provider.js';

const KEY = 'sentinel-key-0123456789abcdef';
const ENDPOINT = 'https://nuqta.cognitiveservices.azure.com';
const OPERATION = `${ENDPOINT}/documentintelligence/documentModels/prebuilt-read/analyzeResults/op-1?api-version=2024-11-30`;

const succeeded = readFileSync(
  new URL('./__fixtures__/read-arabic-invoice-lines.json', import.meta.url),
  'utf8',
);

const image: PageImage = {
  index: 0,
  data: Buffer.from('png-bytes'),
  mimeType: 'image/png',
  width: 800,
  height: 200,
};

function call(): ProviderCall {
  return {
    credential: { endpoint: ENDPOINT, apiKey: KEY },
    signal: AbortSignal.timeout(5000),
  };
}

interface Seen {
  url: string;
  method: string;
  headers: Headers;
}

/** A scripted fetch: answers in order and records what it was asked. */
function scripted(responses: Response[]): { fetch: Fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const queue = [...responses];
  const fetch: Fetch = async (input, init) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
    });
    const next = queue.shift();
    if (!next) throw new Error('unexpected extra request');
    return next;
  };
  return { fetch, seen };
}

const accepted = (location = OPERATION) =>
  new Response(null, {
    status: 202,
    headers: { 'Operation-Location': location },
  });
const running = () =>
  new Response(JSON.stringify({ status: 'running' }), {
    status: 200,
    headers: { 'Retry-After': '0.001' },
  });

describe('AzureDocumentIntelligenceProvider', () => {
  it('submits the image, polls the operation, and maps the result', async () => {
    const { fetch, seen } = scripted([
      accepted(),
      running(),
      new Response(succeeded, { status: 200 }),
    ]);

    const result = await new AzureDocumentIntelligenceProvider(fetch).recognize(
      image,
      call(),
    );

    expect(seen.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /documentintelligence/documentModels/prebuilt-read:analyze',
      'GET /documentintelligence/documentModels/prebuilt-read/analyzeResults/op-1',
      'GET /documentintelligence/documentModels/prebuilt-read/analyzeResults/op-1',
    ]);
    expect(seen[0]?.headers.get('content-type')).toBe('image/png');
    expect(result.page.lines).toHaveLength(2);
    expect(result.page.lines[0]?.tokens[2]?.text).toBe('INV-2041');
    expect(result.raw).toMatchObject({ status: 'succeeded' });
  });

  it('sends the key as a header to the configured host only, never in a URL', async () => {
    const { fetch, seen } = scripted([
      accepted(),
      new Response(succeeded, { status: 200 }),
    ]);

    await new AzureDocumentIntelligenceProvider(fetch).recognize(image, call());

    for (const request of seen) {
      expect(new URL(request.url).origin).toBe(ENDPOINT);
      expect(request.url).not.toContain(KEY);
      expect(request.headers.get('ocp-apim-subscription-key')).toBe(KEY);
    }
  });

  it('refuses to follow an operation URL on another origin', async () => {
    const { fetch, seen } = scripted([
      accepted('https://attacker.test/analyzeResults/op-1'),
    ]);

    await expect(
      new AzureDocumentIntelligenceProvider(fetch).recognize(image, call()),
    ).rejects.toThrow(/unexpected origin/);
    expect(seen).toHaveLength(1);
  });

  it('reports a rejected submission with its status', async () => {
    const { fetch } = scripted([
      new Response('{"error":{"code":"401"}}', { status: 401 }),
    ]);

    await expect(
      new AzureDocumentIntelligenceProvider(fetch).recognize(image, call()),
    ).rejects.toThrow(/submit returned HTTP 401/);
  });

  it('reports an analysis that Azure marks as failed', async () => {
    const { fetch } = scripted([
      accepted(),
      new Response(
        JSON.stringify({
          status: 'failed',
          error: { code: 'InvalidContent', message: 'The file is corrupted.' },
        }),
        { status: 200 },
      ),
    ]);

    await expect(
      new AzureDocumentIntelligenceProvider(fetch).recognize(image, call()),
    ).rejects.toThrow(/failed: InvalidContent The file is corrupted/);
  });

  it('will not run without a credential', async () => {
    const { fetch, seen } = scripted([]);

    await expect(
      new AzureDocumentIntelligenceProvider(fetch).recognize(image, {
        credential: null,
        signal: AbortSignal.timeout(5000),
      }),
    ).rejects.toThrow(/without a credential/);
    expect(seen).toHaveLength(0);
  });
});
