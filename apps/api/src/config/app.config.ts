import { ConfigType, registerAs } from '@nestjs/config';
import { listFromEnv, positiveIntFromEnv } from './env.js';

export const appConfig = registerAs('app', () => ({
  port: positiveIntFromEnv(process.env, 'PORT', 3000),
  /** The demo frontend is hosted separately, so CORS is an allow-list, never `*`. */
  corsOrigins: listFromEnv(process.env, 'CORS_ORIGINS', [
    'http://localhost:5173',
  ]),
  maxUploadBytes: positiveIntFromEnv(
    process.env,
    'MAX_UPLOAD_BYTES',
    10 * 1024 * 1024,
  ),
}));

export type AppConfig = ConfigType<typeof appConfig>;
