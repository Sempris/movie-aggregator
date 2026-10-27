import type { SystemApi } from '../deps';
import { publicProcedure, router } from '../trpc';

export function createSystemRouter(system: SystemApi) {
  return router({
    status: publicProcedure.query(() => system.status()),
  });
}
