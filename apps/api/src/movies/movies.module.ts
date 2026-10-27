import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { MoviesService } from './movies.service';

@Module({
  imports: [CatalogModule, PreferencesModule],
  providers: [MoviesService],
  exports: [MoviesService],
})
export class MoviesModule {}
