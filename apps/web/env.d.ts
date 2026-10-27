/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin when the SPA is not served behind a /trpc proxy, e.g. https://api.example.com */
  readonly VITE_API_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
