/**
 * Contracts the tRPC routers depend on. This file (and everything the routers import)
 * must stay free of NestJS decorators and Prisma types: the web app imports
 * `AppRouter` as a type, which pulls these files into its type-check.
 */
import type {
  AuthSessionDto,
  LoginInput,
  MovieByTmdbIdInput,
  MovieDetailDto,
  MovieListDto,
  MovieSearchDto,
  OAuthProviderId,
  PreferencesDto,
  RatingSourceDto,
  RegisterInput,
  SearchMoviesInput,
  SetAllPreferencesInput,
  SystemStatusDto,
  UpdatePreferenceInput,
  UserDto,
} from '@ratemix/shared';

export interface Viewer {
  userId: string | null;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  session: AuthSessionDto;
  /** Null when the refresh cookie should be left as-is (e.g. concurrent refresh from another tab). */
  refreshToken: { value: string; expiresAt: Date } | null;
}

export interface MoviesApi {
  search(input: SearchMoviesInput, viewer: Viewer): Promise<MovieSearchDto>;
  getById(input: MovieByTmdbIdInput, viewer: Viewer): Promise<MovieDetailDto>;
  trending(): Promise<MovieListDto>;
  popular(): Promise<MovieListDto>;
}

export interface PreferencesApi {
  get(userId: string): Promise<PreferencesDto>;
  update(userId: string, input: UpdatePreferenceInput): Promise<PreferencesDto>;
  setAll(userId: string, input: SetAllPreferencesInput): Promise<PreferencesDto>;
  reset(userId: string): Promise<PreferencesDto>;
}

export interface SourcesApi {
  list(): Promise<RatingSourceDto[]>;
}

export interface AuthApi {
  register(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession>;
  login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession>;
  refresh(refreshToken: string | undefined, meta: RequestMeta): Promise<IssuedSession | null>;
  logout(refreshToken: string | undefined): Promise<void>;
  getUser(userId: string): Promise<UserDto | null>;
}

export interface SystemApi {
  status(): Promise<SystemStatusDto>;
  oauthProviders(): OAuthProviderId[];
}

export interface RouterDeps {
  movies: MoviesApi;
  preferences: PreferencesApi;
  sources: SourcesApi;
  auth: AuthApi;
  system: SystemApi;
}
