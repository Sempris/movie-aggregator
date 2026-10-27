import type { RequestMeta } from './deps';

export interface RefreshCookie {
  read(): string | undefined;
  write(token: string, expiresAt: Date): void;
  clear(): void;
}

export interface TrpcContext {
  user: { id: string } | null;
  /** A bearer token was sent but is expired or invalid; the client should refresh. */
  invalidToken: boolean;
  meta: RequestMeta;
  refreshCookie: RefreshCookie;
}
