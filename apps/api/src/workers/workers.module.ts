import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ProviderJobRunner } from './provider-job.runner';
import { SchedulerService } from './scheduler.service';
import { WorkersService } from './workers.service';

@Module({
  imports: [CatalogModule],
  providers: [ProviderJobRunner, SchedulerService, WorkersService],
})
export class WorkersModule {}
