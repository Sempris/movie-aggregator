import { Controller, Get, Inject, Logger, Param, Query, Req, Res } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { errorMessage } from '../common/errors';
import { ENV, type Env } from '../config/env';
import { AuthService } from './auth.service';
import {
  OAUTH_COOKIE_PATH,
  OAUTH_STATE_COOKIE,
  REFRESH_COOKIE,
  oauthStateCookieOptions,
  refreshCookieOptions,
} from './cookies';
import { OAuthProviders } from './oauth.providers';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Authorization-code flow for GitHub/Google. On success the refresh cookie is set and
 * the browser lands on the SPA's /auth/callback, which exchanges it for an access token.
 */
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
    private readonly providers: OAuthProviders,
  ) {}

  @Get(':provider')
  start(@Param('provider') providerId: string, @Res() res: Response): void {
    const provider = this.providers.get(providerId);
    if (!provider) return this.fail(res, 'oauth_unavailable');
    const state = randomBytes(24).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, `${provider.id}.${state}`, oauthStateCookieOptions(this.env));
    res.redirect(provider.authorizeUrl(state, this.redirectUri(provider.id)));
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') providerId: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });

    const provider = this.providers.get(providerId);
    if (!provider) return this.fail(res, 'oauth_unavailable');
    if (providerError) return this.fail(res, 'oauth_denied');
    if (!code || !state || !expected || !safeEqual(expected, `${provider.id}.${state}`)) {
      return this.fail(res, 'oauth_state');
    }

    try {
      const profile = await provider.exchange(code, this.redirectUri(provider.id));
      const issued = await this.auth.loginWithOAuth(profile, {
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });
      if (issued.refreshToken) {
        res.cookie(
          REFRESH_COOKIE,
          issued.refreshToken.value,
          refreshCookieOptions(this.env, issued.refreshToken.expiresAt),
        );
      }
      res.redirect(`${this.env.FRONTEND_URL}/auth/callback`);
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'CONFLICT')
        return this.fail(res, 'email_in_use');
      this.logger.warn({ provider: provider.id, err: errorMessage(error) }, 'OAuth sign-in failed');
      this.fail(res, 'oauth_failed');
    }
  }

  private redirectUri(providerId: string): string {
    return `${this.env.OAUTH_REDIRECT_BASE_URL}/auth/oauth/${providerId}/callback`;
  }

  private fail(res: Response, reason: string): void {
    res.redirect(`${this.env.FRONTEND_URL}/signin?error=${encodeURIComponent(reason)}`);
  }
}
