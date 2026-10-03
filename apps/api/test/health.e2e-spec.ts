import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

const KEY = 'sentinel-key-0123456789abcdef';
const ENV_KEYS = [
  'AZURE_DI_ENDPOINT',
  'AZURE_DI_KEY',
  'OCR_PROVIDER',
  'CORS_ORIGINS',
] as const;

async function boot(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('GET /api/health', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('reports a keyed provider as not ready when no credential is set', async () => {
    app = await boot({});

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      defaultProvider: 'tesseract',
      providers: [
        {
          id: 'tesseract',
          label: 'Tesseract (self-hosted)',
          requiresCredential: false,
          ready: true,
        },
        {
          id: 'azure-document-intelligence',
          label: 'Azure Document Intelligence (prebuilt-read)',
          requiresCredential: true,
          ready: false,
        },
      ],
    });
  });

  it('reports the credential as present without revealing any of it', async () => {
    app = await boot({
      AZURE_DI_ENDPOINT: 'https://nuqta.cognitiveservices.azure.com',
      AZURE_DI_KEY: KEY,
      OCR_PROVIDER: 'azure-document-intelligence',
    });

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body.defaultProvider).toBe('azure-document-intelligence');
    expect(response.body.providers[1].ready).toBe(true);

    const everythingSent = response.text + JSON.stringify(response.headers);
    expect(everythingSent).not.toContain(KEY);
    expect(everythingSent).not.toContain(KEY.slice(0, 8));
    expect(everythingSent).not.toContain('cognitiveservices');
  });

  it('refuses to boot with an OCR_PROVIDER that does not exist', async () => {
    await expect(boot({ OCR_PROVIDER: 'typo' })).rejects.toThrow(
      /"typo" is not registered/,
    );
  });

  it('allows the configured site origin and no other', async () => {
    app = await boot({ CORS_ORIGINS: 'https://site.example' });
    const server = app.getHttpServer();

    const allowed = await request(server)
      .get('/api/health')
      .set('Origin', 'https://site.example');
    const denied = await request(server)
      .get('/api/health')
      .set('Origin', 'https://elsewhere.example');

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://site.example',
    );
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
