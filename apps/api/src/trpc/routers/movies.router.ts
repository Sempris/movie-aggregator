import { movieByTmdbIdInput, searchMoviesInput } from '@ratemix/shared';
import type { TrpcContext } from '../context';
import type { MoviesApi, Viewer } from '../deps';
import { publicProcedure, router } from '../trpc';

const viewerOf = (ctx: TrpcContext): Viewer => ({ userId: ctx.user?.id ?? null });

export function createMoviesRouter(movies: MoviesApi) {
  return router({
    search: publicProcedure
      .input(searchMoviesInput)
      .query(({ input, ctx }) => movies.search(input, viewerOf(ctx))),
    /** Metadata + every per-source rating + this user's composite score. */
    getById: publicProcedure
      .input(movieByTmdbIdInput)
      .query(({ input, ctx }) => movies.getById(input, viewerOf(ctx))),
    trending: publicProcedure.query(() => movies.trending()),
    popular: publicProcedure.query(() => movies.popular()),
  });
}
