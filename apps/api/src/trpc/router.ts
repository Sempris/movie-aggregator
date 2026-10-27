import type { RouterDeps } from './deps';
import { createAuthRouter } from './routers/auth.router';
import { createMoviesRouter } from './routers/movies.router';
import { createPreferencesRouter } from './routers/preferences.router';
import { createSourcesRouter } from './routers/sources.router';
import { createSystemRouter } from './routers/system.router';
import { router } from './trpc';

export function createAppRouter(deps: RouterDeps) {
  return router({
    movies: createMoviesRouter(deps.movies),
    preferences: createPreferencesRouter(deps.preferences),
    sources: createSourcesRouter(deps.sources),
    auth: createAuthRouter(deps.auth),
    system: createSystemRouter(deps.system),
  });
}

/** Imported (type-only) by the web app for end-to-end type safety. */
export type AppRouter = ReturnType<typeof createAppRouter>;
