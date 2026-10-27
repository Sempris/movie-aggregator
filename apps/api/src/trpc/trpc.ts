import { TRPCError, initTRPC } from '@trpc/server';
import type { TrpcContext } from './context';

interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

function validationIssues(cause: unknown): Array<{ path: string; message: string }> | null {
  const issues = (cause as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return null;
  return (issues as IssueLike[]).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        validation: error.code === 'BAD_REQUEST' ? validationIssues(error.cause) : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** No token checks; used by auth procedures, which must work with an expired access token. */
export const baseProcedure = t.procedure;

export const publicProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.invalidToken) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Access token expired or invalid' });
  }
  return next();
});

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to do this' });
  return next({ ctx: { user: ctx.user } });
});
