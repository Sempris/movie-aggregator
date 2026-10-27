import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [CatalogModule],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
