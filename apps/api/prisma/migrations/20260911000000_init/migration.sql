-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "movies" (
    "id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "imdb_id" TEXT,
    "title" TEXT NOT NULL,
    "original_title" TEXT,
    "release_year" INTEGER,
    "release_date" DATE,
    "poster_path" TEXT,
    "backdrop_path" TEXT,
    "overview" TEXT,
    "runtime_minutes" INTEGER,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "popularity" DOUBLE PRECISION,
    "details_fetched_at" TIMESTAMP(3),
    "last_viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_sources" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scale_min" DOUBLE PRECISION NOT NULL,
    "scale_max" DOUBLE PRECISION NOT NULL,
    "raw_format" TEXT NOT NULL,
    "default_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rating_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_ratings" (
    "id" UUID NOT NULL,
    "movie_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "raw_value" DOUBLE PRECISION NOT NULL,
    "normalized_value" DOUBLE PRECISION NOT NULL,
    "vote_count" INTEGER,
    "raw_payload" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movie_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_provider_sync" (
    "movie_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "queued_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "movie_provider_sync_pkey" PRIMARY KEY ("movie_id","provider")
);

-- CreateTable
CREATE TABLE "movie_list_entries" (
    "list" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "movie_id" UUID NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movie_list_entries_pkey" PRIMARY KEY ("list","rank")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "auth_provider" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_source_preferences" (
    "user_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_source_preferences_pkey" PRIMARY KEY ("user_id","source_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "movies_tmdb_id_key" ON "movies"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "movies_imdb_id_key" ON "movies"("imdb_id");

-- CreateIndex
CREATE INDEX "movies_title_idx" ON "movies"("title");

-- CreateIndex
CREATE INDEX "movies_last_viewed_at_idx" ON "movies"("last_viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "movie_ratings_movie_id_source_id_key" ON "movie_ratings"("movie_id", "source_id");

-- CreateIndex
CREATE INDEX "movie_provider_sync_provider_last_attempt_at_idx" ON "movie_provider_sync"("provider", "last_attempt_at");

-- CreateIndex
CREATE INDEX "movie_list_entries_movie_id_idx" ON "movie_list_entries"("movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_provider_account_id_key" ON "users"("auth_provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "movie_ratings" ADD CONSTRAINT "movie_ratings_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_ratings" ADD CONSTRAINT "movie_ratings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "rating_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_provider_sync" ADD CONSTRAINT "movie_provider_sync_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_list_entries" ADD CONSTRAINT "movie_list_entries_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_source_preferences" ADD CONSTRAINT "user_source_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_source_preferences" ADD CONSTRAINT "user_source_preferences_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "rating_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
