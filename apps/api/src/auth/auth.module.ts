import { Module } from '@nestjs/common';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthService } from './auth.service';
import { OAuthController } from './oauth.controller';
import { OAuthProviders } from './oauth.providers';

@Module({
  controllers: [OAuthController],
  providers: [AuthService, AuthRateLimiter, OAuthProviders],
  exports: [AuthService, OAuthProviders],
})
export class AuthModule {}
