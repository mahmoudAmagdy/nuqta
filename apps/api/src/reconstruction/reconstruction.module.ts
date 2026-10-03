import { Module } from '@nestjs/common';
import { ReconstructionService } from './reconstruction.service.js';

@Module({
  providers: [ReconstructionService],
  exports: [ReconstructionService],
})
export class ReconstructionModule {}
