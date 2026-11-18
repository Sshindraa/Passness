-- Migration 0063 : identité Better Auth (ADR-047). Additive : aucune donnée existante n'est modifiée ou supprimée.
-- `users` reste la source de vérité des rôles (ADR-006) ; `users.oidc_subject` référence `auth_users.id`.
ALTER TABLE "users" ADD COLUMN "legacy_clerk_id" text;

CREATE TABLE "auth_users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "two_factor_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_users_email_unique" UNIQUE ("email")
);

CREATE TABLE "auth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  CONSTRAINT "auth_sessions_token_unique" UNIQUE ("token")
);
CREATE INDEX "auth_sessions_user_id_index" ON "auth_sessions" ("user_id");

CREATE TABLE "auth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "scope" text,
  "password" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "auth_accounts_user_id_index" ON "auth_accounts" ("user_id");

CREATE TABLE "auth_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "auth_verifications_identifier_index" ON "auth_verifications" ("identifier");

CREATE TABLE "auth_two_factors" (
  "id" text PRIMARY KEY NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
  "verified" boolean DEFAULT true NOT NULL,
  "failed_verification_count" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp with time zone
);
CREATE INDEX "auth_two_factors_user_id_index" ON "auth_two_factors" ("user_id");

CREATE TABLE "auth_rate_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "last_request" bigint NOT NULL,
  CONSTRAINT "auth_rate_limits_key_unique" UNIQUE ("key")
);
