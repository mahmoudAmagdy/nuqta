import type { INestApplication } from '@nestjs/common';
import { appConfig } from './config/app.config.js';
import type { AppConfig } from './config/app.config.js';

/** Shared by main.ts and the e2e tests so both run the same HTTP surface. */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(appConfig.KEY);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins });
  app.enableShutdownHooks();
  return config;
}
