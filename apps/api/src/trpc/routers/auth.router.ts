import { loginInput, registerInput } from '@ratemix/shared';
import type { TrpcContext } from '../context';
import type { AuthApi, IssuedSession } from '../deps';
import { baseProcedure, router } from '../trpc';

function respond(ctx: TrpcContext, issued: IssuedSession) {
  if (issued.refreshToken) {
    ctx.refreshCookie.write(issued.refreshToken.value, issued.refreshToken.expiresAt);
  }
  return issued.session;
}

export function createAuthRouter(auth: AuthApi) {
  return router({
    register: baseProcedure
      .input(registerInput)
      .mutation(async ({ ctx, input }) => respond(ctx, await auth.register(input, ctx.meta))),
    login: baseProcedure
      .input(loginInput)
      .mutation(async ({ ctx, input }) => respond(ctx, await auth.login(input, ctx.meta))),
    /** Exchanges the httpOnly refresh cookie for a new access token. Null means "signed out". */
    refresh: baseProcedure.mutation(async ({ ctx }) => {
      const token = ctx.refreshCookie.read();
      const issued = await auth.refresh(token, ctx.meta);
      if (!issued) {
        if (token) ctx.refreshCookie.clear();
        return null;
      }
      return respond(ctx, issued);
    }),
    logout: baseProcedure.mutation(async ({ ctx }) => {
      await auth.logout(ctx.refreshCookie.read());
      ctx.refreshCookie.clear();
      return { ok: true as const };
    }),
    me: baseProcedure.query(({ ctx }) =>
      ctx.user && !ctx.invalidToken ? auth.getUser(ctx.user.id) : null,
    ),
  });
}
