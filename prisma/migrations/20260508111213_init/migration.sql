-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "user";

-- CreateTable
CREATE TABLE "user"."users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "keycloak_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending_verification',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "user"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "user"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloak_id_key" ON "user"."users"("keycloak_id");

-- CheckConstraints (defense in depth, manually added)

-- 1. Хотя бы один контакт заполнен
ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_email_or_phone_required"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- 2. email_verified_at можно ставить только если email не NULL
ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_email_verified_requires_email"
  CHECK ("email_verified_at" IS NULL OR "email" IS NOT NULL);

-- 3. phone_verified_at можно ставить только если phone не NULL
ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_phone_verified_requires_phone"
  CHECK ("phone_verified_at" IS NULL OR "phone" IS NOT NULL);

-- 4. status='active' требует хотя бы один verified контакт
ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_active_requires_verified_contact"
  CHECK (
    "status" != 'active'
    OR "email_verified_at" IS NOT NULL
    OR "phone_verified_at" IS NOT NULL
  );