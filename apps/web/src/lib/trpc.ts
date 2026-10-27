import type { AppRouter } from '@ratemix/api/trpc';
import { TRPCClientError, type TRPCLink, createTRPCClient, httpBatchLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { session } from './session';

const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const API_ORIGIN = apiOrigin;

/**
 * When a call fails with UNAUTHORIZED because the access token expired, refresh it
 * via the httpOnly cookie and retry once. If refreshing fails the session is cleared
 * and the retry runs as a guest, which still works for public procedures.
 */
const refreshOnUnauthorized: TRPCLink<AppRouter> =
  () =>
  ({ op, next }) =>
    observable((observer) => {
      let subscription = next(op).subscribe({
        next: (value) => observer.next(value),
        complete: () => observer.complete(),
        error: (error) => {
          const retryable =
            error.data?.code === 'UNAUTHORIZED' &&
            !op.path.startsWith('auth.') &&
            !op.context['retried'] &&
            session.get() !== null;
          if (!retryable) {
            observer.error(error);
            return;
          }
          void session.refresh().then(() => {
            subscription = next({ ...op, context: { ...op.context, retried: true } }).subscribe(
              observer,
            );
          });
        },
      });
      return () => subscription.unsubscribe();
    });

export const trpc = createTRPCClient<AppRouter>({
  links: [
    refreshOnUnauthorized,
    httpBatchLink({
      url: `${apiOrigin}/trpc`,
      headers() {
        const token = session.get();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      fetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
    }),
  ],
});

export function isTrpcError(error: unknown): error is TRPCClientError<AppRouter> {
  return error instanceof TRPCClientError;
}

/** A sentence suitable for showing to the person, never a stack trace or raw JSON. */
export function describeError(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (!isTrpcError(error)) return fallback;
  const issues = error.data?.validation;
  if (issues?.length) return issues[0]!.message;
  if (error.data?.code === 'INTERNAL_SERVER_ERROR') return fallback;
  if (!error.data) return 'Could not reach RateMix. Check your connection and try again.';
  return error.message;
}
