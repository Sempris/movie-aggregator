import type { SourcesApi } from '../deps';
import { publicProcedure, router } from '../trpc';

export function createSourcesRouter(sources: SourcesApi) {
  return router({
    list: publicProcedure.query(() => sources.list()),
  });
}
