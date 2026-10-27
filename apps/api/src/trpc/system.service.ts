import { Injectable } from '@nestjs/common';
import type { OAuthProviderId, SystemStatusDto } from '@ratemix/shared';
import { OAuthProviders } from '../auth/oauth.providers';
import { RatingsRepository } from '../catalog/ratings.repository';
import { AdapterRegistry } from '../sources/adapter-registry';
import type { SystemApi } from './deps';

@Injectable()
export class SystemService implements SystemApi {
  private catalogSize: { value: number; expiresAt: number } | null = null;

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly oauth: OAuthProviders,
    private readonly repository: RatingsRepository,
  ) {}

  async status(): Promise<SystemStatusDto> {
    if (!this.catalogSize || this.catalogSize.expiresAt < Date.now()) {
      const value = await this.repository.countMovies().catch(() => 0);
      this.catalogSize = { value, expiresAt: Date.now() + 60_000 };
    }
    return {
      providers: this.registry.configuredMap(),
      oauthProviders: this.oauthProviders(),
      catalogSize: this.catalogSize.value,
    };
  }

  oauthProviders(): OAuthProviderId[] {
    return this.oauth.enabledIds();
  }
}
