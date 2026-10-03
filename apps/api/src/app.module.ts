import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config.js';
import { HealthModule } from './health/health.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { OcrModule } from './ocr/ocr.module.js';
import { ReconstructionModule } from './reconstruction/reconstruction.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Service-local file first, then the repo-root one docker compose reads.
      envFilePath: ['.env', '../../.env'],
      // Tests set the environment explicitly; a developer's real .env must
      // not leak into them.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [appConfig],
    }),
    IntakeModule,
    OcrModule,
    ReconstructionModule,
    HealthModule,
  ],
})
export class AppModule {}
