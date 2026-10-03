import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CredentialStore } from './credentials/credential-store.js';
import { OCR_PROVIDERS } from './ocr-provider.js';
import type { OcrProvider } from './ocr-provider.js';
import { ocrConfig } from './ocr.config.js';
import { ProviderBroker } from './provider-broker.service.js';
import {
  AzureDocumentIntelligenceProvider,
  HTTP_FETCH,
} from './providers/azure/azure-document-intelligence.provider.js';
import { TesseractProvider } from './providers/tesseract/tesseract.provider.js';

/**
 * Only the broker is exported. Providers and the credential store are private
 * to this module, so no other part of the service can reach a provider, or a
 * key, without going through it.
 *
 * Adding an engine: implement OcrProvider, list it in both arrays below.
 */
const PROVIDER_CLASSES = [TesseractProvider, AzureDocumentIntelligenceProvider];

@Module({
  imports: [ConfigModule.forFeature(ocrConfig)],
  providers: [
    ...PROVIDER_CLASSES,
    { provide: HTTP_FETCH, useValue: globalThis.fetch },
    {
      provide: OCR_PROVIDERS,
      useFactory: (...providers: OcrProvider[]) => providers,
      inject: PROVIDER_CLASSES,
    },
    {
      provide: CredentialStore,
      useFactory: () => CredentialStore.fromEnv(process.env),
    },
    ProviderBroker,
  ],
  exports: [ProviderBroker],
})
export class OcrModule {}
