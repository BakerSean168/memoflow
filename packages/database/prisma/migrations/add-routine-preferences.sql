CREATE TABLE IF NOT EXISTS "routine_preferences" (
  "id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL,
  "global_enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routine_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "routine_preferences_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "routine_preferences_identity_id_key"
  ON "routine_preferences"("identity_id");

CREATE INDEX IF NOT EXISTS "routine_preferences_identity_id_global_enabled_idx"
  ON "routine_preferences"("identity_id", "global_enabled");
