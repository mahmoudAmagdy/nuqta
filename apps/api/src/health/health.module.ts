import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [OcrModule],
  controllers: [HealthController],
})
export class HealthModule {}
