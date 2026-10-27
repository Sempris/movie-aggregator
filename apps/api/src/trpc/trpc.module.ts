import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MoviesModule } from '../movies/movies.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { SystemService } from './system.service';
import { TrpcHttpService } from './trpc-http.service';

@Module({
  imports: [AuthModule, CatalogModule, MoviesModule, PreferencesModule],
  providers: [TrpcHttpService, SystemService],
  exports: [TrpcHttpService],
})
export class TrpcModule {}
