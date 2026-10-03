import { Controller, Get } from '@nestjs/common';
import { ProviderBroker } from '../ocr/provider-broker.service.js';
import type { ProviderStatus } from '../ocr/provider-broker.service.js';

export interface HealthResponse {
  status: 'ok';
  defaultProvider: string;
  providers: ProviderStatus[];
}

@Controller('health')
export class HealthController {
  constructor(private readonly broker: ProviderBroker) {}

  /**
   * Liveness, plus whether each provider's credential is present. Presence is
   * reported as a boolean and nothing else: no key, no prefix, no length.
   */
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      defaultProvider: this.broker.defaultProviderId,
      providers: this.broker.status(),
    };
  }
}
