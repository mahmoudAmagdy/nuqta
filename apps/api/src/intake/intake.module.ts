import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';
import { IntakeService } from './intake.service.js';

@Module({
  imports: [ConfigModule.forFeature(appConfig)],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
