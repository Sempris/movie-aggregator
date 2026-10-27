import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import type { Request, RequestHandler, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { REFRESH_COOKIE, refreshCookieOptions } from '../auth/cookies';
import { SourcesService } from '../catalog/sources.service';
import { ENV, type Env } from '../config/env';
import { MoviesService } from '../movies/movies.service';
import { PreferencesService } from '../preferences/preferences.service';
import type { TrpcContext } from './context';
import { createAppRouter } from './router';
import { SystemService } from './system.service';

/** Bridges Nest's DI container into the (framework-agnostic) tRPC router. */
@Injectable()
export class TrpcHttpService {
  private readonly logger = new Logger('tRPC');

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly movies: MoviesService,
    private readonly preferences: PreferencesService,
    private readonly sources: SourcesService,
    private readonly auth: AuthService,
    private readonly system: SystemService,
  ) {}

  middleware(): RequestHandler {
    const router = createAppRouter({
      movies: this.movies,
      preferences: this.preferences,
      sources: this.sources,
      auth: this.auth,
      system: this.system,
    });
    return createExpressMiddleware({
      router,
      createContext: ({ req, res }) => this.createContext(req, res),
      onError: ({ error, path }) => {
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          this.logger.error(
            { path, err: error.cause?.message ?? error.message },
            'Unhandled tRPC error',
          );
          Sentry.captureException(error.cause ?? error, { tags: { trpcPath: path ?? 'unknown' } });
        }
      },
    });
  }

  private createContext(req: Request, res: Response): TrpcContext {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    const user = bearer ? this.auth.verifyAccessToken(bearer) : null;
    const cookies = req.cookies as Record<string, string> | undefined;

    return {
      user,
      invalidToken: Boolean(bearer) && !user,
      meta: { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null },
      refreshCookie: {
        read: () => cookies?.[REFRESH_COOKIE],
        write: (token, expiresAt) =>
          res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(this.env, expiresAt)),
        clear: () => res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(this.env)),
      },
    };
  }
}
